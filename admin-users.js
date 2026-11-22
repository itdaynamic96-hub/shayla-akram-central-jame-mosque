import { configured, supabase, currentProfile, escapeHtml, showError } from "./supabase-client.js";
const $ = id => document.getElementById(id);
const modules = [
  { key: "m01", name: "ড্যাশবোর্ড" },
  { key: "m02", name: "নোটিফিকেশন" },
  { key: "m03", name: "কার্যক্রম লগ" },
  { key: "m04", name: "ক্যালেন্ডার" },
  { key: "m05", name: "টাস্ক ম্যানেজমেন্ট" },
  { key: "m06", name: "রিপোর্ট কেন্দ্র" },
  { key: "m07", name: "হোমপেজ" },
  { key: "m08", name: "মেনু ম্যানেজমেন্ট" },
  { key: "m09", name: "পেজ ম্যানেজমেন্ট" },
  { key: "m10", name: "মোতাওয়াল্লীর বাণী" },
  { key: "m11", name: "মসজিদের ইতিহাস" },
  { key: "m12", name: "ফাউন্ডেশনের ইতিহাস" },
  { key: "m13", name: "ইসলামিক জ্ঞানভান্ডার" },
  { key: "m14", name: "নোটিশ বোর্ড" },
  { key: "m15", name: "ইসলামিক আলোকচিত্র" },
  { key: "m16", name: "ভিডিও শিক্ষা ও দাওয়াহ" },
  { key: "m17", name: "ডাউনলোড সেন্টার" },
  { key: "m18", name: "যোগাযোগ ব্যবস্থাপনা" },
  { key: "m19", name: "FAQ" },
  { key: "m20", name: "SEO ব্যবস্থাপনা" },
  { key: "m21", name: "মসজিদ পরিচিতি" },
  { key: "m22", name: "নামাজ ব্যবস্থাপনা" },
  { key: "m23", name: "আজান ও ইকামত" },
  { key: "m24", name: "ইমাম ও মুয়াজ্জিন" },
  { key: "m25", name: "খতিব ব্যবস্থাপনা" },
  { key: "m26", name: "ধর্মীয় অনুষ্ঠান" },
  { key: "m27", name: "রমজান ব্যবস্থাপনা" },
  { key: "m28", name: "মসজিদ কমিটি" },
  { key: "m29", name: "মসজিদ সম্পদ" },
  { key: "m30", name: "রক্ষণাবেক্ষণ" },
  { key: "m31", name: "ফাউন্ডেশন পরিচিতি" },
  { key: "m32", name: "প্রকল্প ব্যবস্থাপনা" },
  { key: "m33", name: "শিক্ষা কার্যক্রম" },
  { key: "m34", name: "চিকিৎসা সহায়তা" },
  { key: "m35", name: "দরিদ্র সহায়তা" },
  { key: "m36", name: "খাদ্য বিতরণ" },
  { key: "m37", name: "কর্মসংস্থান" },
  { key: "m38", name: "বৃত্তি ব্যবস্থাপনা" },
  { key: "m39", name: "স্বেচ্ছাসেবক" },
  { key: "m40", name: "প্রকল্প মূল্যায়ন" },
  { key: "m41", name: "অ্যাকাউন্টস ড্যাশবোর্ড" },
  { key: "m42", name: "আয় ব্যবস্থাপনা" },
  { key: "m43", name: "ব্যয় ব্যবস্থাপনা" },
  { key: "m44", name: "দান ও অনুদান" },
  { key: "m45", name: "যাকাত ও সদকা" },
  { key: "m46", name: "ব্যাংক ও ক্যাশ" },
  { key: "m47", name: "পেমেন্ট ব্যবস্থাপনা" },
  { key: "m48", name: "বাজেট ব্যবস্থাপনা" },
  { key: "m49", name: "ভাউচার ও রসিদ" },
  { key: "m50", name: "আর্থিক অডিট" },
  { key: "m51", name: "সদস্য ব্যবস্থাপনা" },
  { key: "m52", name: "দাতা ব্যবস্থাপনা" },
  { key: "m53", name: "উপকারভোগী" },
  { key: "m54", name: "আবেদন ব্যবস্থাপনা" },
  { key: "m55", name: "ইউজার ম্যানেজমেন্ট" },
  { key: "m56", name: "ভূমিকা ও অনুমতি" },
  { key: "m57", name: "নিরাপত্তা" },
  { key: "m58", name: "ব্যাকআপ ও রিস্টোর" },
  { key: "m59", name: "সিস্টেম সেটিংস" },
  { key: "m60", name: "সাহায্য ও সাপোর্ট" }
];
let selectedUserId = null;
let profiles = [];
const root = $("staffManager");
if (root) init();

function renderChecks(selected = []) {
  const selectedMap = new Map(selected.map(x => [x.module_key, x]));
  $("staffModules").innerHTML = modules.map((m, i) => {
    const old = selectedMap.get(m.key) || {};
    return `<label class="staff-module"><input type="checkbox" data-module="${m.key}" ${old.module_key ? "checked" : ""}>
      <span>${String(i+1).padStart(2,"0")}. ${escapeHtml(m.name)}</span>
      <span class="staff-perms"><label><input type="checkbox" data-write="${m.key}" ${old.can_write ? "checked" : ""}> লিখতে/সম্পাদনা</label>
      <label><input type="checkbox" data-approve="${m.key}" ${old.can_approve ? "checked" : ""}> অনুমোদন</label></span></label>`;
  }).join("");
}
function readChecks() {
  return [...$("staffModules").querySelectorAll("[data-module]:checked")].map(el => {
    const key = el.dataset.module;
    return { module_key: key, can_write: !!$("[data-write='"+key+"']")?.checked, can_approve: !!$("[data-approve='"+key+"']")?.checked };
  });
}
async function init() {
  if (!configured) return;
  try {
    const { profile } = await currentProfile();
    if (profile?.role !== "super_admin") { root.hidden = true; return; }
    root.hidden = false;
    renderChecks();
    await loadStaff();
  } catch (e) { showError($("staffError"), e); }
}
async function loadStaff() {
  const { data, error } = await supabase.from("profiles").select("id,full_name,role,institution,created_at").order("created_at", { ascending: false });
  if (error) throw error;
  profiles = data || [];
  $("staffRows").innerHTML = profiles.map(p => `<tr><td>${escapeHtml(p.full_name)}</td><td>${escapeHtml(p.role)}</td><td>${escapeHtml(p.institution)}</td><td>${p.role === "custom_admin" ? `<button type="button" data-edit="${p.id}">অনুমতি সম্পাদনা</button> <button type="button" data-toggle="${p.id}">নিষ্ক্রিয়/সক্রিয়</button>` : "মূল প্রশাসক"}</td></tr>`).join("");
}
$("staffForm").addEventListener("submit", async e => {
  e.preventDefault();
  try {
    const modules = readChecks();
    const payload = selectedUserId
      ? { action: "permissions", user_id: selectedUserId, modules }
      : { action: "create", full_name: $("staffName").value.trim(), email: $("staffEmail").value.trim(), password: $("staffPassword").value, institution: $("staffInstitution").value, modules };
    const { data, error } = await supabase.functions.invoke("admin-create-user", { body: payload });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    $("staffMessage").textContent = selectedUserId ? "মডিউল অনুমতি হালনাগাদ হয়েছে।" : "নতুন অ্যাকাউন্ট তৈরি হয়েছে।";
    $("staffMessage").hidden = false;
    $("staffForm").reset();
    $("staffName").disabled = false; $("staffEmail").disabled = false; $("staffPassword").required = true;
    selectedUserId = null; $("staffSubmit").textContent = "অ্যাকাউন্ট তৈরি করুন";
    renderChecks(); await loadStaff();
  } catch (err) { showError($("staffError"), err); }
});
$("staffRows").addEventListener("click", async e => {
  const edit = e.target.dataset.edit, toggle = e.target.dataset.toggle;
  try {
    if (edit) {
      const { data, error } = await supabase.from("admin_module_permissions").select("module_key,can_write,can_approve").eq("user_id", edit);
      if (error) throw error;
      selectedUserId = edit;
      renderChecks(data || []);
      $("staffName").disabled = true; $("staffEmail").disabled = true; $("staffPassword").required = false; $("staffPassword").disabled = true;
      $("staffSubmit").textContent = "মডিউল অনুমতি সংরক্ষণ";
      $("staffMessage").textContent = "নির্বাচিত কর্মীর অনুমতি সম্পাদনা করছেন।";
      $("staffMessage").hidden = false;
      root.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (toggle) {
      const action = confirm("এই অ্যাকাউন্টটি নিষ্ক্রিয়/সক্রিয় অবস্থা বদলাবেন?") ? "disable" : null;
      if (!action) return;
      const { data, error } = await supabase.functions.invoke("admin-create-user", { body: { action, user_id: toggle } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      alert("অ্যাকাউন্ট নিষ্ক্রিয় হয়েছে। সক্রিয় করতে সম্পাদনা তালিকা থেকে Enable ব্যবহার করতে হবে।");
    }
  } catch (err) { showError($("staffError"), err); }
});
