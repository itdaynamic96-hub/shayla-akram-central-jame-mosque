import { withSupabase } from "npm:@supabase/server@1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const withCors = (response: Response) => {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const validModuleKey = (key: string) => /^m(0[1-9]|[1-5][0-9]|60|61)$/.test(key);
const moduleAllowedForInstitution = (key: string, institution: string) => {
  const number = Number(key.slice(1));
  if ((number >= 21 && number <= 30) || number === 61) return institution === "mosque" || institution === "both";
  if (number >= 31 && number <= 40) return institution === "foundation" || institution === "both";
  return true;
};

const handler = withSupabase({ auth: "user" }, async (req, ctx) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const callerId = ctx.userClaims?.id ?? ctx.jwtClaims?.sub;
  if (!callerId) return json({ error: "Authentication required." }, 401);

  // Use the Edge Function server-only service-role key explicitly. The user-scoped
  // context client is not suitable for privileged profile and Auth administration.
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("admin-create-user: server admin credentials are not configured", {
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasServiceRoleKey: Boolean(serviceRoleKey),
    });
    return json({ error: "সার্ভারের প্রশাসনিক সংযোগ কনফিগার করা নেই। Supabase Function secrets যাচাই করুন।" }, 500);
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: callerProfile, error: callerProfileError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", callerId)
    .single();

  if (callerProfileError || callerProfile?.role !== "super_admin") {
    console.error("admin-create-user: super_admin check failed", {
      authMode: ctx.authMode,
      callerId,
      userClaimsId: ctx.userClaims?.id ?? null,
      jwtSubject: ctx.jwtClaims?.sub ?? null,
      profileRole: callerProfile?.role ?? null,
      profileErrorCode: callerProfileError?.code ?? null,
      profileErrorMessage: callerProfileError?.message ?? null,
    });
    return json({ error: "শুধু Super Admin কর্মী অ্যাকাউন্ট পরিচালনা করতে পারবেন।" }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "অনুরোধের তথ্য সঠিক JSON নয়।" }, 400);
  }

  const action = typeof body.action === "string" ? body.action : "create";

  const parseModules = (institution: string) => {
    if (!Array.isArray(body.modules)) return { error: "মডিউল তালিকা সঠিক নয়।" as const };
    const items = body.modules as Array<Record<string, unknown>>;
    const keys = items.map((item) => String(item?.module_key ?? ""));
    if (keys.length > 61 || keys.some((key) => !validModuleKey(key) || !moduleAllowedForInstitution(key, institution)) || new Set(keys).size !== keys.length) {
      return { error: "মডিউল নির্বাচন সঠিক নয় বা একই মডিউল একাধিকবার আছে।" as const };
    }
    if (items.some((item) => item?.can_approve === true && item?.can_write !== true)) {
      return { error: "অনুমোদনের অনুমতির জন্য আগে লিখতে/সম্পাদনার অনুমতি দিন।" as const };
    }
    return {
      rows: items.map((item, index) => {
        const canWrite = item.can_write === true;
        return {
          module_key: keys[index],
          can_view: true,
          can_write: canWrite,
          can_approve: canWrite && item.can_approve === true,
        };
      }),
    };
  };

  if (action === "create") {
    const fullName = String(body.full_name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const jobTitle = String(body.job_title ?? "").trim();
    const password = String(body.password ?? "");
    const institution = String(body.institution ?? "");

    if (fullName.length < 2 || fullName.length > 120) {
      return json({ error: "নাম ২–১২০ অক্ষরের মধ্যে দিন।" }, 400);
    }
    if (jobTitle.length < 2 || jobTitle.length > 100) {
      return json({ error: "প্রাতিষ্ঠানিক পদবি নির্বাচন করুন।" }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "সঠিক ইমেইল ঠিকানা দিন।" }, 400);
    }
    if (password.length < 10 || password.length > 128) {
      return json({ error: "পাসওয়ার্ড কমপক্ষে ১০ অক্ষরের হতে হবে।" }, 400);
    }
    if (!["mosque", "foundation", "both"].includes(institution)) {
      return json({ error: "প্রতিষ্ঠান নির্বাচন সঠিক নয়।" }, 400);
    }

    const parsed = parseModules(institution);
    if ("error" in parsed) return json({ error: parsed.error }, 400);
    if (parsed.rows.length === 0) return json({ error: "কমপক্ষে একটি মডিউল নির্বাচন করুন।" }, 400);

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createError || !created.user) {
      return json({ error: createError?.message ?? "অ্যাকাউন্ট তৈরি করা যায়নি।" }, 400);
    }

    const userId = created.user.id;
    const { error: profileError } = await admin.from("profiles").upsert({
      id: userId,
      full_name: fullName,
      email,
      job_title: jobTitle,
      role: "custom_admin",
      institution,
    }, { onConflict: "id" });

    if (profileError) {
      await admin.auth.admin.deleteUser(userId);
      return json({ error: "প্রোফাইল তৈরি ব্যর্থ: " + profileError.message }, 500);
    }

    if (parsed.rows.length > 0) {
      const { error: permissionError } = await admin.rpc("replace_admin_module_permissions", {
        target_user: userId,
        permission_rows: parsed.rows,
      });
      if (permissionError) {
        await admin.auth.admin.deleteUser(userId);
        return json({ error: "মডিউল অনুমতি সংরক্ষণ ব্যর্থ: " + permissionError.message }, 500);
      }
    }

    return json({ success: true, user_id: userId });
  }

  if (!["permissions", "enable", "disable"].includes(action)) {
    return json({ error: "অনুমোদিত নয় এমন action।" }, 400);
  }

  const userId = String(body.user_id ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return json({ error: "ব্যবহারকারী নির্বাচন সঠিক নয়।" }, 400);
  }
  if (userId === callerId) return json({ error: "নিজের Super Admin অ্যাকাউন্ট এভাবে পরিবর্তন করা যাবে না।" }, 400);

  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("role,institution")
    .eq("id", userId)
    .single();

  if (targetError || target?.role !== "custom_admin") {
    return json({ error: "Custom Admin অ্যাকাউন্ট পাওয়া যায়নি।" }, 404);
  }

  if (action === "permissions") {
    const parsed = parseModules(target.institution);
    if ("error" in parsed) return json({ error: parsed.error }, 400);

    const { error } = await admin.rpc("replace_admin_module_permissions", {
      target_user: userId,
      permission_rows: parsed.rows,
    });
    if (error) return json({ error: "অনুমতি সংরক্ষণ ব্যর্থ: " + error.message }, 500);
    return json({ success: true });
  }

  const { error: statusError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: action === "disable" ? "876000h" : "none",
  });
  if (statusError) return json({ error: statusError.message }, 400);
  return json({ success: true });
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    return withCors(await handler(req));
  } catch (error) {
    console.error("admin-create-user failed:", error);
    return json({
      error: error instanceof Error ? error.message : "সার্ভারে অপ্রত্যাশিত সমস্যা হয়েছে।",
    }, 500);
  }
});
