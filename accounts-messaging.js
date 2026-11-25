import { configured, supabase, currentProfile, escapeHtml, showError } from "./supabase-client.js";
const $ = (id) => document.getElementById(id);
let profile = null, permissions = [], institution = "mosque", rows = [], attempts = [], ready = false, started = false;
const canWrite = () => {
  if (!profile) return false;
  if (profile.role === "custom_admin") return permissions.some(p => /^m84$/.test(p.module_key) && p.can_view && p.can_write);
  return ["super_admin","admin","accounts_manager","accountant","mosque_admin","foundation_admin"].includes(profile.role);
};
const canRead = () => profile?.role === "custom_admin" ? permissions.some(p => /^m84$/.test(p.module_key) && p.can_view) : canWrite() || profile?.role === "auditor";
const statusLabel = (s) => ({queued:"অপেক্ষমাণ",processing:"প্রক্রিয়াধীন",awaiting_delivery:"প্রেরণ হয়েছে · ডেলিভারি নিশ্চিত নয়",delivered:"ডেলিভারি নিশ্চিত",read:"পড়া হয়েছে",failed:"ব্যর্থ"}[s] || s);
const statusClass = (s) => ({queued:"pending",processing:"pending",awaiting_delivery:"pending",delivered:"success",read:"read",failed:"failed"}[s] || "pending");
function render() {
  const panel = $("accountsMessaging");
  if (!panel) return;
  // Keep this source panel hidden; its controls are mounted only in the dedicated module view.
  panel.hidden = true;
  if (!canRead()) return;
  $("messageInstitution").value = institution;
  $("messageInstitution").disabled = profile.institution !== "both";
  $("messageForm").hidden = !canWrite();
  $("messageSend").disabled = !canWrite();
  $("messageSetup").textContent = ready
    ? "প্রদানকারীর সংযোগ পাওয়া গেছে। WhatsApp আগে চেষ্টা হবে; ব্যর্থ হলে SMS fallback হবে।"
    : "WhatsApp/SMS API সংযোগ এখনো দেওয়া হয়নি। সফটওয়্যার ও কিউ প্রস্তুত; provider credentials যোগ না করা পর্যন্ত কোনো বার্তা পাঠানো হবে না।";
  $("messageSetup").className = "message-setup " + (ready ? "configured" : "not-configured");
}
async function refreshConfig() {
  const { data, error } = await supabase.functions.invoke("message-dispatch", { body: { action: "config" } });
  if (error) throw error;
  ready = Boolean(data?.ready);
  render();
}
async function load() {
  const [q, a] = await Promise.all([
    supabase.from("accounts_message_queue").select("*").eq("institution", institution).order("created_at", {ascending:false}).limit(150),
    supabase.from("accounts_message_attempts").select("*").order("attempted_at", {ascending:false}).limit(300),
  ]);
  if (q.error) throw q.error;
  if (a.error) throw a.error;
  rows = q.data || []; attempts = a.data || [];
  const visibleIds = new Set(rows.map(x => x.id));
  attempts = attempts.filter(x => visibleIds.has(x.message_id));
  $("messageRows").innerHTML = rows.map(x => {
    const history = attempts.filter(a => a.message_id === x.id);
    const action = canWrite() && ready && (x.status === "queued" || x.status === "failed")
      ? ' <button type="button" data-dispatch="' + x.id + '">' + (x.status === "failed" ? "পুনরায় চেষ্টা" : "পাঠানোর চেষ্টা") + '</button>'
      : x.status === "queued" ? ' <span class="muted">সংযোগের অপেক্ষায়</span>' : "";
    return '<tr><td>' + escapeHtml(new Date(x.created_at).toLocaleString("bn-BD",{timeZone:"Asia/Dhaka"})) +
      '</td><td>' + escapeHtml(x.recipient_name || "—") + '<br><span class="muted">' + escapeHtml(x.recipient_phone) +
      '</span></td><td>' + escapeHtml(x.message) + '</td><td><span class="message-status ' + statusClass(x.status) + '">' +
      escapeHtml(statusLabel(x.status)) + '</span></td><td>' + escapeHtml(x.active_channel === "whatsapp" ? "WhatsApp" : x.active_channel === "sms" ? "SMS" : "—") +
      '</td><td>' + history.length.toLocaleString("bn-BD") + ' বার' + action + '</td></tr>';
  }).join("") || '<tr><td colspan="6">এখনো কোনো বার্তা নেই।</td></tr>';
  $("messageAttemptRows").innerHTML = attempts.map(x => '<tr><td>' +
    escapeHtml(new Date(x.attempted_at).toLocaleString("bn-BD",{timeZone:"Asia/Dhaka"})) + '</td><td>' +
    escapeHtml(x.channel === "whatsapp" ? "WhatsApp" : "SMS") + '</td><td>' +
    escapeHtml(({accepted:"প্রদানকারী গ্রহণ করেছে",failed:"ব্যর্থ",delivered:"ডেলিভারি নিশ্চিত",read:"পড়া হয়েছে"})[x.status] || x.status) +
    '</td><td>' + escapeHtml(x.error_code || x.provider_message_id || "—") + '</td><td>' +
    escapeHtml(x.error_message || "—") + '</td></tr>').join("") ||
    '<tr><td colspan="5">কোনো চেষ্টা/ডেলিভারি ইতিহাস নেই।</td></tr>';
}
async function boot() {
  if (!configured || started) return;
  const current = await currentProfile();
  profile = current.profile;
  if (!current.user || !profile) return;
  started = true;
  if (profile.role === "custom_admin") {
    const { data, error } = await supabase.from("admin_module_permissions")
      .select("module_key,can_view,can_write").eq("user_id", current.user.id);
    if (error) throw error;
    permissions = data || [];
  }
  if (!canRead()) return;
  institution = profile.institution === "foundation" ? "foundation" : "mosque";
  render();
  $("messageRefresh").onclick = async () => { try { await refreshConfig(); await load(); } catch(e) { showError($("messageError"),e); } };
  $("messageInstitution").onchange = async () => { institution = $("messageInstitution").value; try { await load(); } catch(e) { showError($("messageError"),e); } };
  $("messageForm").onsubmit = async (event) => {
    event.preventDefault();
    if (!canWrite()) return;
    const phone = $("messagePhone").value.trim().replace(/[\s().-]/g,"");
    const text = $("messageText").value.trim();
    if (!/^\+?[0-9]{8,15}$/.test(phone) || !text || text.length > 4000) {
      showError($("messageError"), new Error("সঠিক ফোন নম্বর এবং ১–৪০০০ অক্ষরের বার্তা লিখুন।")); return;
    }
    const { data: auth } = await supabase.auth.getUser();
    const payload = {
      institution, recipient_name: $("messageName").value.trim(), recipient_phone: phone,
      message: text, source_module: $("messageSource").value, created_by: auth.user.id,
    };
    $("messageSend").disabled = true;
    try {
      const { error } = await supabase.from("accounts_message_queue").insert(payload);
      if (error) throw error;
      event.target.reset();
      $("messageSource").value = "manual";
      await load();
      $("messageError").textContent = ready ? "বার্তা কিউতে যোগ হয়েছে। তালিকা থেকে পাঠানোর চেষ্টা করুন।" : "বার্তা কিউতে নিরাপদে সংরক্ষিত হয়েছে। Provider সংযোগের পর পাঠানো যাবে।";
      $("messageError").hidden = false;
      $("messageError").classList.add("message-info");
    } catch(e) { showError($("messageError"),e); }
    finally { $("messageSend").disabled = !canWrite(); }
  };
  $("messageRows").onclick = async (event) => {
    const button = event.target.closest("[data-dispatch]");
    if (!button || !canWrite() || !ready) return;
    button.disabled = true;
    try {
      const { data, error } = await supabase.functions.invoke("message-dispatch", { body: { action:"dispatch", message_id:button.dataset.dispatch } });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || "বার্তা পাঠানো যায়নি।");
      await load();
    } catch(e) { showError($("messageError"),e); }
    finally { button.disabled = false; }
  };
  try { await refreshConfig(); await load(); } catch(e) { showError($("messageError"),e); }
}
const appRoot = $("app");
if (appRoot) {
  const observer = new MutationObserver(() => {
    if (!appRoot.hidden) boot().catch(e => showError($("messageError"),e));
  });
  observer.observe(appRoot, { attributes:true, attributeFilter:["hidden"] });
}
if (configured) supabase.auth.onAuthStateChange((_event, session) => {
  if (session) { started = false; boot().catch(e => showError($("messageError"),e)); }
  else { started = false; profile = null; const panel=$("accountsMessaging"); if(panel) panel.hidden=true; }
});
boot().catch(e => showError($("messageError"),e));
