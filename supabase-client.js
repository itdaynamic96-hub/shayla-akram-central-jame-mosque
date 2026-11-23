import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cfg = window.SUPABASE_CONFIG || {};
export const configured = Boolean(cfg.url && cfg.anonKey && !cfg.url.includes("YOUR-PROJECT") && !cfg.anonKey.includes("YOUR_"));
export const supabase = configured ? createClient(cfg.url, cfg.anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) : null;
export async function currentProfile() {
  if (!configured || !supabase) {
    throw new Error("Supabase সংযোগ কনফিগার করা হয়নি। প্রশাসককে Project URL ও public key যাচাই করতে হবে।");
  }
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session) return { user: null, profile: null };
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) return { user: null, profile: null };
  const { data: profile, error: profileError } = await supabase.from("profiles").select("id,full_name,role,institution").eq("id", user.id).single();
  if (profileError) throw profileError;
  return { user, profile };
}
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}
export function money(value) {
  return new Intl.NumberFormat("bn-BD", { style:"currency", currency:"BDT", maximumFractionDigits:2 }).format(Number(value || 0));
}
export function showError(target, error) {
  if (!target) { console.error("Admin UI error target is missing:", error); return; }
  target.textContent = error?.message || String(error || "অজানা সমস্যা হয়েছে।");
  target.hidden = false;
}
