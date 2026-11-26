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
  { key: "m60", name: "সাহায্য ও সাপোর্ট" },
  { key: "m61", name: "মুসল্লী নিবন্ধন" },
  { key: "m62", name: "Accounts — ড্যাশবোর্ড" },
  { key: "m63", name: "Accounts — আয় ব্যবস্থাপনা" },
  { key: "m64", name: "Accounts — ব্যয় ব্যবস্থাপনা" },
  { key: "m65", name: "Accounts — দাতা ও অনুদান" },
  { key: "m66", name: "Accounts — ব্যাংক ও ক্যাশ" },
  { key: "m67", name: "Accounts — ট্রান্সফার" },
  { key: "m68", name: "Accounts — ক্যাশবুক ও লেজার" },
  { key: "m69", name: "Accounts — বকেয়া ও বিল" },
  { key: "m70", name: "Accounts — কর্মচারী ও বেতন" },
  { key: "m71", name: "Accounts — বাজেট ব্যবস্থাপনা" },
  { key: "m72", name: "Accounts — তহবিল ব্যবস্থাপনা" },
  { key: "m73", name: "Accounts — রসিদ ও ভাউচার" },
  { key: "m74", name: "Accounts — আর্থিক রিপোর্ট" },
  { key: "m75", name: "Accounts — PDF ও Excel" },
  { key: "m76", name: "Accounts — ট্রায়াল ব্যালান্স ও ব্যালান্স শিট" },
  { key: "m77", name: "Accounts — সার্চ" },
  { key: "m78", name: "Accounts — ব্যাংক রিকনসিলিয়েশন" },
  { key: "m79", name: "Accounts — অডিট ও যাচাই" },
  { key: "m80", name: "Accounts — অনুমোদন ব্যবস্থাপনা" },
  { key: "m81", name: "Accounts — অডিট ট্রেইল" },
  { key: "m82", name: "Accounts — ব্যবহারকারী ও অনুমতি" },
  { key: "m83", name: "Accounts — সেটিংস" },
  { key: "m84", name: "Accounts — বার্তা ও নোটিফিকেশন" },
  { key: "m85", name: "Accounts — মাসিক চাঁদা আদায়" }
];
let selectedUserId = null;
let profiles = [];
const root = $("staffManager");
if (root) init();

async function functionError(error) {
  const response = error?.context;
  if (response && typeof response.clone === "function") {
    try {
      const body = await response.clone().json();
      if (body?.error) return new Error(String(body.error));
    } catch { /* Keep the original Supabase error if the response is not JSON. */ }
  }
  return error;
}
function renderChecks(selected = []) {
  const staffModuleRoot = $("staffModules");
  if (!staffModuleRoot) { console.warn("Admin staff module form is not mounted; skipping permission checklist."); return; }
  const selectedMap = new Map(selected.map(x => [x.module_key, x]));
  const institution = $("staffInstitution").value;
  const visibleModules = modules.filter(m => { const n = Number(m.key.slice(1)); return !(n >= 41 && n <= 50) && (n !== 61 || institution !== "foundation") && (n !== 85 || institution !== "foundation") && (n < 21 || n > 40 || institution === "both" || (institution === "mosque" && n <= 30) || (institution === "foundation" && n >= 31)); });
  const heading = $("staffModuleHeading");
  if (heading) heading.textContent = `মডিউল নির্বাচন (${visibleModules.length}টি প্রযোজ্য · মোট ৮৫টি)`;
  const accountGroups = [
    {key:"dashboard",title:"১. ড্যাশবোর্ড",description:"সার্বিক আর্থিক অবস্থা ও দ্রুত প্রবেশ",keys:["m62"]},
    {key:"income",title:"২. আয়, দাতা ও মাসিক চাঁদা",description:"আয় এন্ট্রি, দাতা/অনুদান এবং চাঁদা আদায়",keys:["m63","m65","m85"]},
    {key:"expense",title:"৩. ব্যয়, পাওনা ও বেতন",description:"ব্যয়, বিল/পাওনা এবং কর্মচারী বেতন",keys:["m64","m69","m70"]},
    {key:"bank",title:"৪. ব্যাংক, ক্যাশ ও লেনদেন",description:"ব্যাংক/ক্যাশ, ট্রান্সফার, লেজার ও রিকনসিলিয়েশন",keys:["m66","m67","m68","m78"]},
    {key:"budget",title:"৫. বাজেট ও তহবিল",description:"বাজেট পরিকল্পনা ও তহবিল নিয়ন্ত্রণ",keys:["m71","m72"]},
    {key:"reports",title:"৬. রিপোর্ট ও আর্থিক বিবরণী",description:"আর্থিক রিপোর্ট, PDF/Excel এবং ব্যালান্স শিট",keys:["m74","m75","m76"]},
    {key:"documents",title:"৭. রসিদ ও অনুসন্ধান",description:"রসিদ/ভাউচার এবং লেনদেন অনুসন্ধান",keys:["m73","m77"]},
    {key:"governance",title:"৮. অডিট, অনুমোদন ও সেটিংস",description:"অডিট, অনুমোদন, ব্যবহারকারী, অনুমতি, বার্তা ও সেটিংস",keys:["m79","m80","m81","m82","m83","m84"]}
  ];
  const accountsModules = visibleModules.filter(m => Number(m.key.slice(1)) >= 62 && Number(m.key.slice(1)) <= 85);
  const generalModules = visibleModules.filter(m => Number(m.key.slice(1)) < 62);
  const accountsAllSelected = accountsModules.length > 0 && accountsModules.every(m => selectedMap.has(m.key));
  const card = m => {
    const old = selectedMap.get(m.key) || {};
    const number = String(Number(m.key.slice(1))).padStart(2,"0");
    const n = Number(m.key.slice(1));
    const group = n >= 62 ? "accounts" : n >= 51 ? "governance" : "mosque";
    return `<div class="staff-module staff-module-item staff-module-${group}" data-module-card="${m.key}">
      <label><input type="checkbox" data-module="${m.key}" ${old.module_key ? "checked" : ""}>
        <span class="staff-module-number">${number}</span>
        <span class="staff-module-copy"><strong>${escapeHtml(m.name)}</strong><small>পূর্ণ কার্যক্রমের অনুমতি</small></span>
      </label>
    </div>`;
  };
  const groupsHtml = accountGroups.map(group => {
    const items = accountsModules.filter(m => group.keys.includes(m.key));
    if (!items.length) return "";
    const count = items.filter(m => selectedMap.has(m.key)).length;
    return `<section class="staff-module-group" data-accounts-group-box="${group.key}">
      <div class="staff-module-group-head">
        <label><input type="checkbox" data-accounts-group="${group.key}" ${count===items.length?"checked":""}>
          <span><strong>${group.title}</strong><small>${escapeHtml(group.description)}</small></span>
        </label>
        <span class="staff-module-group-count" data-accounts-group-count="${group.key}">${count}/${items.length}</span>
      </div>
      <div class="staff-module-group-grid">${items.map(card).join("")}</div>
    </section>`;
  }).join("");
  staffModuleRoot.innerHTML =
    (accountsModules.length ? `<div class="staff-module staff-module-master">
      <label><input id="staffAccountsAllModules" type="checkbox" ${accountsAllSelected ? "checked" : ""}>
        <span class="staff-master-copy"><strong>সম্পূর্ণ অ্যাকাউন্টিং সফটওয়্যার</strong><small>৮টি প্রধান বিভাগ · ${accountsModules.length}টি বিস্তারিত অনুমতি</small></span>
      </label>
      <p>একসাথে সব নির্বাচন করলে কর্মী Accounts-এর সব বিভাগে পূর্ণ কার্যক্রম পরিচালনা করতে পারবেন। চাইলে নিচের ৮টি বিভাগের যেকোনো একটি বা তার ভেতরের নির্দিষ্ট কাজ নির্বাচন করুন। আলাদা Approver লাগবে না।</p>
    </div>` : "") +
    generalModules.map(card).join("") + groupsHtml;
  const master = $("staffAccountsAllModules");
  const syncGroupChecks = () => {
    accountGroups.forEach(group => {
      const boxes = group.keys.map(key => staffModuleRoot.querySelector('[data-module="'+key+'"]')).filter(Boolean);
      const checked = boxes.filter(x => x.checked).length;
      const groupBox = staffModuleRoot.querySelector('[data-accounts-group="'+group.key+'"]');
      if (groupBox) { groupBox.checked = boxes.length > 0 && checked === boxes.length; groupBox.indeterminate = checked > 0 && checked < boxes.length; }
      const count = staffModuleRoot.querySelector('[data-accounts-group-count="'+group.key+'"]');
      if (count) count.textContent = checked + "/" + boxes.length;
    });
    const boxes = [...staffModuleRoot.querySelectorAll('[data-module]')].filter(x => {
      const n = Number(x.dataset.module.slice(1)); return n >= 62 && n <= 85;
    });
    if (master) { master.checked = boxes.length > 0 && boxes.every(x => x.checked); master.indeterminate = boxes.some(x => x.checked) && !master.checked; }
  };
  if (master) master.addEventListener("change", () => {
    staffModuleRoot.querySelectorAll('[data-module]').forEach(input => {
      const n = Number(input.dataset.module.slice(1));
      if (n >= 62 && n <= 85) input.checked = master.checked;
    });
    syncGroupChecks();
  });
  staffModuleRoot.querySelectorAll('[data-accounts-group]').forEach(input => input.addEventListener("change", () => {
    const group = accountGroups.find(x => x.key === input.dataset.accountsGroup);
    if (!group) return;
    group.keys.forEach(key => { const box = staffModuleRoot.querySelector('[data-module="'+key+'"]'); if (box) box.checked = input.checked; });
    syncGroupChecks();
  }));
  staffModuleRoot.querySelectorAll('[data-module]').forEach(input => input.addEventListener("change", syncGroupChecks));
  syncGroupChecks();
}
function readChecks() {
  const staffModuleRoot = $("staffModules");
  if (!staffModuleRoot) return [];
  return [...staffModuleRoot.querySelectorAll("[data-module]:checked")].map(el => ({ module_key: el.dataset.module }));
}
async function init() {
  if (!configured) return;
  try {
    const { profile } = await currentProfile();
    if (profile?.role !== "super_admin") { root.hidden = true; return; }
    root.hidden = true;
    renderChecks();
    await loadStaff();
  } catch (e) { showError($("staffError"), e); }
}
async function loadStaff() {
  const { data, error } = await supabase.from("profiles").select("id,full_name,email,role,institution,job_title,created_at").order("created_at", { ascending: false });
  if (error) throw error;
  profiles = data || [];
  const staffRows = $("staffRows");
  if (!staffRows) return;
  staffRows.innerHTML = profiles.map(p => `<tr><td>${escapeHtml(p.full_name)}</td><td>${escapeHtml(p.email || "—")}</td><td>${escapeHtml(p.job_title || "—")}</td><td>${escapeHtml(p.role)}</td><td>${escapeHtml(p.institution)}</td><td>${p.role === "custom_admin" ? `<button type="button" data-edit="${p.id}">অনুমতি সম্পাদনা</button> <button type="button" data-toggle="${p.id}">নিষ্ক্রিয়/সক্রিয়</button>` : "মূল প্রশাসক"}</td></tr>`).join("");
}
$("staffForm").addEventListener("submit", async e => {
  e.preventDefault();
  try {
    const modules = readChecks();
    const payload = selectedUserId
      ? { action: "permissions", user_id: selectedUserId, modules }
      : { action: "create", full_name: $("staffName").value.trim(), job_title: $("staffJobTitle").value, email: $("staffEmail").value.trim(), password: $("staffPassword").value, institution: $("staffInstitution").value, modules };
    const { data, error } = await supabase.functions.invoke("admin-create-user", { body: payload });
    if (error) throw await functionError(error);
    if (data?.error) throw new Error(data.error);
    $("staffMessage").textContent = selectedUserId ? "মডিউল অনুমতি হালনাগাদ হয়েছে।" : "নতুন অ্যাকাউন্ট তৈরি হয়েছে।";
    $("staffMessage").hidden = false;
    $("staffForm").reset();
    $("staffName").disabled = false; $("staffJobTitle").disabled = false; $("staffEmail").disabled = false; $("staffPassword").disabled = false; $("staffInstitution").disabled = false; $("staffPassword").required = true;
    selectedUserId = null; $("staffSubmit").textContent = "অ্যাকাউন্ট তৈরি করুন";
    renderChecks(); await loadStaff();
  } catch (err) { showError($("staffError"), err); }
});
$("staffInstitution").addEventListener("change", () => { const selected = readChecks(); renderChecks(selected); });
$("staffReset").addEventListener("click", e => {
  e.preventDefault();
  selectedUserId = null;
  $("staffForm").reset();
  $("staffName").disabled = false; $("staffJobTitle").disabled = false; $("staffEmail").disabled = false; $("staffPassword").disabled = false; $("staffInstitution").disabled = false; $("staffPassword").required = true;
  $("staffSubmit").textContent = "অ্যাকাউন্ট তৈরি করুন";
  $("staffMessage").hidden = true; $("staffError").hidden = true;
  renderChecks();
});
$("staffRows").addEventListener("click", async e => {
  const edit = e.target.dataset.edit, toggle = e.target.dataset.toggle;
  try {
    if (edit) {
      const { data, error } = await supabase.from("admin_module_permissions").select("module_key,can_write,can_approve").eq("user_id", edit);
      if (error) throw error;
      selectedUserId = edit;
      $("staffInstitution").value = profiles.find(p => p.id === edit)?.institution || "mosque";
      renderChecks(data || []);
      $("staffName").disabled = true; $("staffJobTitle").disabled = true; $("staffEmail").disabled = true; $("staffPassword").required = false; $("staffPassword").disabled = true; $("staffInstitution").disabled = true;
      $("staffSubmit").textContent = "মডিউল অনুমতি সংরক্ষণ";
      $("staffMessage").textContent = "নির্বাচিত কর্মীর অনুমতি সম্পাদনা করছেন।";
      $("staffMessage").hidden = false;
      root.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (toggle) {
      const choice = prompt("অ্যাকাউন্টের অবস্থা লিখুন: disable অথবা enable", "disable");
      const action = choice === "disable" || choice === "enable" ? choice : null;
      if (!action) return;
      const { data, error } = await supabase.functions.invoke("admin-create-user", { body: { action, user_id: toggle } });
      if (error) throw await functionError(error);
      if (data?.error) throw new Error(data.error);
      alert(action === "disable" ? "অ্যাকাউন্ট নিষ্ক্রিয় হয়েছে।" : "অ্যাকাউন্ট সক্রিয় হয়েছে।");
    }
  } catch (err) { showError($("staffError"), err); }
});
