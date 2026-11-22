import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return reply({ error: "Server configuration is incomplete." }, 500);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return reply({ error: "Authentication required." }, 401);
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: authData, error: authError } = await caller.auth.getUser();
  if (authError || !authData.user) return reply({ error: "Invalid session." }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: callerProfile, error: profileError } = await admin
    .from("profiles").select("role").eq("id", authData.user.id).single();
  if (profileError || callerProfile?.role !== "super_admin") return reply({ error: "Only Super Admin can manage staff accounts." }, 403);

  let body: any;
  try { body = await req.json(); } catch { return reply({ error: "Invalid JSON body." }, 400); }
  const action = body?.action || "create";
  if (action === "create") {
    const full_name = String(body.full_name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const institution = body.institution;
    const modules = Array.isArray(body.modules) ? body.modules : [];
    if (full_name.length < 2 || full_name.length > 120) return reply({ error: "নাম ২–১২০ অক্ষরের মধ্যে দিন।" }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply({ error: "সঠিক ইমেইল ঠিকানা দিন।" }, 400);
    if (password.length < 10 || password.length > 128) return reply({ error: "পাসওয়ার্ড কমপক্ষে ১০ অক্ষরের হতে হবে।" }, 400);
    if (!["mosque", "foundation", "both"].includes(institution)) return reply({ error: "প্রতিষ্ঠান নির্বাচন সঠিক নয়।" }, 400);
    const uniqueModules = [...new Set(modules.map((x: any) => String(x?.module_key || "")))];
    if (uniqueModules.length > 60 || uniqueModules.some((k: string) => !/^m(0[1-9]|[1-5][0-9]|60)$/.test(k))) return reply({ error: "মডিউল নির্বাচন সঠিক নয়।" }, 400);
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name }
    });
    if (createError || !created.user) return reply({ error: createError?.message || "অ্যাকাউন্ট তৈরি করা যায়নি।" }, 400);
    const userId = created.user.id;
    const { error: updateError } = await admin.from("profiles").upsert({
      id: userId, full_name, role: "custom_admin", institution
    }, { onConflict: "id" });
    if (updateError) {
      await admin.auth.admin.deleteUser(userId);
      return reply({ error: "প্রোফাইল তৈরি ব্যর্থ: " + updateError.message }, 500);
    }
    if (uniqueModules.length) {
      const rows = uniqueModules.map((module_key: string) => {
        const item = modules.find((x: any) => x?.module_key === module_key) || {};
        const can_write = Boolean(item.can_write);
        const can_approve = Boolean(item.can_approve);
        return { user_id: userId, module_key, can_view: true, can_write, can_approve: can_write && can_approve };
      });
      const { error: permissionError } = await admin.from("admin_module_permissions").insert(rows);
      if (permissionError) {
        await admin.auth.admin.deleteUser(userId);
        return reply({ error: "মডিউল অনুমতি সংরক্ষণ ব্যর্থ: " + permissionError.message }, 500);
      }
    }
    return reply({ success: true, user_id: userId });
  }

  const userId = String(body.user_id || "");
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return reply({ error: "ব্যবহারকারী নির্বাচন সঠিক নয়।" }, 400);
  const { data: target, error: targetError } = await admin.from("profiles").select("role").eq("id", userId).single();
  if (targetError || target?.role !== "custom_admin") return reply({ error: "Custom Admin অ্যাকাউন্ট পাওয়া যায়নি।" }, 404);

  if (action === "permissions") {
    const modules = Array.isArray(body.modules) ? body.modules : [];
    const uniqueModules = [...new Set(modules.map((x: any) => String(x?.module_key || "")))];
    if (uniqueModules.length > 60 || uniqueModules.some((k: string) => !/^m(0[1-9]|[1-5][0-9]|60)$/.test(k))) return reply({ error: "মডিউল নির্বাচন সঠিক নয়।" }, 400);
    const { error: deleteError } = await admin.from("admin_module_permissions").delete().eq("user_id", userId);
    if (deleteError) return reply({ error: deleteError.message }, 500);
    if (uniqueModules.length) {
      const rows = uniqueModules.map((module_key: string) => {
        const item = modules.find((x: any) => x?.module_key === module_key) || {};
        const can_write = Boolean(item.can_write);
        return { user_id: userId, module_key, can_view: true, can_write, can_approve: can_write && Boolean(item.can_approve) };
      });
      const { error } = await admin.from("admin_module_permissions").insert(rows);
      if (error) return reply({ error: error.message }, 500);
    }
    return reply({ success: true });
  }
  if (action === "disable" || action === "enable") {
    const { error } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: action === "disable" ? "876000h" : "none"
    });
    if (error) return reply({ error: error.message }, 400);
    return reply({ success: true });
  }
  return reply({ error: "Unsupported action." }, 400);
});
