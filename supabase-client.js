import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cfg = window.SUPABASE_CONFIG || {};
export const configured = Boolean(cfg.url && cfg.anonKey && !cfg.url.includes("YOUR-PROJECT") && !cfg.anonKey.includes("YOUR_"));
export const supabase = configured ? createClient(cfg.url, cfg.anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) : null;
export async function currentProfile() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
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
  target.textContent = error?.message || String(error || "অজানা সমস্যা হয়েছে।");
  target.hidden = false;
}
