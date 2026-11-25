import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { randomBytes } from "node:crypto";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";

const supabaseUrl = process.env.SUPABASE_URL || "https://lmwczibsipczfymhyqba.supabase.co";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const siteUrl = "https://itdaynamic96-hub.github.io/shayla-akram-central-jame-mosque/accounts.html";
const outDir = process.env.E2E_OUTPUT_DIR || process.env.RUNNER_TEMP || "/tmp";
if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for temporary test accounts.");

const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const createdUsers = [];
const browser = await chromium.launch({ headless: true });
const results = { customAdmin: {}, viewer: {}, modules: [], exports: {} };

async function createUser(role, grantAll) {
  const suffix = randomBytes(6).toString("hex");
  const email = "sakm-e2e-" + role + "-" + suffix + "@example.test";
  const password = randomBytes(24).toString("base64url") + "A1!";
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "Temporary automated test" }
  });
  if (error) throw error;
  const id = data.user.id;
  createdUsers.push(id);
  const { error: profileError } = await admin.from("profiles").update({
    role, institution: "mosque", full_name: "Temporary automated test", job_title: "Automated test"
  }).eq("id", id);
  if (profileError) throw profileError;
  if (grantAll) {
    const permissions = Array.from({ length: 24 }, (_, i) => ({
      user_id: id, module_key: "m" + String(62 + i).padStart(2, "0"),
      can_view: true, can_write: true, can_approve: true
    }));
    const { error: permissionError } = await admin.from("admin_module_permissions").upsert(permissions);
    if (permissionError) throw permissionError;
    for (let i = 0; i < 24; i++) {
      const { data: allowed, error: accessError } = await admin.rpc("accounts_feature_access", {
        target_institution: "mosque", target_module: "m" + String(62 + i).padStart(2, "0"), write_access: false
      });
      if (accessError) throw accessError;
      if (!allowed) throw new Error("Temporary admin is missing view access to module " + (i + 1));
    }
    const { data: chanda, error: chandaError } = await admin.rpc("chanda_can_access", { write_access: false });
    if (chandaError) throw chandaError;
    // chanda_can_access is evaluated under the current service role; module m85 is also granted above.
  }
  return { id, email, password };
}

async function login(context, credentials) {
  const page = await context.newPage();
  page.addInitScript(() => { window.__sakmPrintCalled = false; window.print = () => { window.__sakmPrintCalled = true; }; });
  await page.goto(siteUrl, { waitUntil: "domcontentloaded" });
  await page.locator("#login").waitFor({ state: "visible", timeout: 30000 });
  await page.locator("#email").fill(credentials.email);
  await page.locator("#password").fill(credentials.password);
  await page.locator("#loginForm button").click();
  await page.locator("#accountsDashboard").waitFor({ state: "visible", timeout: 30000 });
  return page;
}

async function logout(page) {
  await page.locator("#adLogout").click({ timeout: 10000 });
  await page.locator("#login").waitFor({ state: "visible", timeout: 20000 });
  await page.close();
}

try {
  const customAdmin = await createUser("custom_admin", true);
  const adminContext = await browser.newContext({ acceptDownloads: true });
  const adminPage = await login(adminContext, customAdmin);

  await adminPage.waitForFunction(() =>
    document.querySelectorAll("#adNav button:not([hidden])").length === 24,
    null, { timeout: 30000 }
  );

  const moduleLabels = [
    "ড্যাশবোর্ড","আয় ব্যবস্থাপনা","ব্যয় ব্যবস্থাপনা","দাতা ও অনুদান","ব্যাংক ও ক্যাশ","ট্রান্সফার",
    "ক্যাশবুক ও লেজার","বকেয়া ও বিল","কর্মচারী ও বেতন","বাজেট ব্যবস্থাপনা","তহবিল ব্যবস্থাপনা",
    "রসিদ ও ভাউচার","আর্থিক রিপোর্ট","PDF ও Excel","ট্রায়াল ব্যালান্স ও ব্যালান্স শিট","সার্চ",
    "ব্যাংক রিকনসিলিয়েশন","অডিট ও যাচাই","অনুমোদন ব্যবস্থাপনা","অডিট ট্রেইল","ব্যবহারকারী ও অনুমতি",
    "সেটিংস","বার্তা ও নোটিফিকেশন","মাসিক চাঁদা আদায়"
  ];
  for (let i = 0; i < moduleLabels.length; i++) {
    await adminPage.locator('#adNav button[data-i="' + i + '"]').click();
    await adminPage.waitForFunction((expected) => document.getElementById("adTitle")?.textContent === expected, moduleLabels[i], { timeout: 10000 });
    await adminPage.waitForTimeout(450);
    const errorCount = await adminPage.locator('#adPage > .note[style*="color:#a11"]').count();
    if (errorCount) throw new Error("Module " + (i + 1) + " (" + moduleLabels[i] + ") rendered an application error.");
    results.modules.push({ number: i + 1, name: moduleLabels[i], status: "rendered" });
  }

  await adminPage.locator('#adNav button[data-i="13"]').click();
  await adminPage.locator("#adReportExcel").waitFor({ state: "visible", timeout: 30000 });
  await adminPage.locator("#adReportPrint").waitFor({ state: "visible", timeout: 30000 });

  const [download] = await Promise.all([
    adminPage.waitForEvent("download", { timeout: 45000 }),
    adminPage.locator("#adReportExcel").click()
  ]);
  const xlsxPath = path.join(outDir, "SAKM-61-e2e-report.xlsx");
  await download.saveAs(xlsxPath);
  const xlsxInfo = await stat(xlsxPath);
  if (xlsxInfo.size < 100) throw new Error("Excel export file is unexpectedly small.");
  results.exports.xlsxBytes = xlsxInfo.size;

  await adminPage.locator("#adReportPrint").click();
  await adminPage.waitForFunction(() => window.__sakmPrintCalled === true, null, { timeout: 10000 });
  const pdfPath = path.join(outDir, "SAKM-61-e2e-report.pdf");
  await adminPage.pdf({ path: pdfPath, format: "A4", printBackground: true });
  const pdfInfo = await stat(pdfPath);
  if (pdfInfo.size < 100) throw new Error("PDF print output is unexpectedly small.");
  results.exports.pdfBytes = pdfInfo.size;

  results.customAdmin = { moduleCount: results.modules.length, xlsxDownloaded: true, pdfPrintRendered: true };
  await logout(adminPage);
  await adminContext.close();

  const viewer = await createUser("viewer", false);
  const viewerContext = await browser.newContext();
  const viewerPage = await login(viewerContext, viewer);
  await viewerPage.waitForTimeout(1000);
  const visibleForViewer = await viewerPage.locator("#adNav button:not([hidden])").count();
  if (visibleForViewer !== 0) throw new Error("Viewer account unexpectedly received " + visibleForViewer + " admin modules.");
  results.viewer = { visibleAdminModules: visibleForViewer, status: "restricted" };
  await logout(viewerPage);
  await viewerContext.close();

  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close().catch(() => {});
  for (const id of createdUsers.reverse()) {
    await admin.from("admin_module_permissions").delete().eq("user_id", id).catch(() => {});
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
}
