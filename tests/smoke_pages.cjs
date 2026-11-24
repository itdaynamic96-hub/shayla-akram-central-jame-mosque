const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const pages = ["index.html", "admin.html", "accounts.html"];
  const viewports = [
    { name: "desktop", width: 1365, height: 900 },
    { name: "mobile", width: 390, height: 844 }
  ];
  const failures = [];

  try {
    for (const path of pages) {
      for (const viewport of viewports) {
        const page = await browser.newPage({ viewport });
        const pageErrors = [];
        page.on("pageerror", error => pageErrors.push(error.message));
        try {
          await page.goto("http://127.0.0.1:4173/" + path, {
            waitUntil: "domcontentloaded",
            timeout: 30000
          });
          await page.waitForTimeout(1200);
          const metrics = await page.evaluate(() => ({
            viewportWidth: window.innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth
          }));
          if (metrics.documentWidth > metrics.viewportWidth + 4) {
            failures.push(path + " (" + viewport.name + "): horizontal overflow " +
              metrics.documentWidth + "px > " + metrics.viewportWidth + "px");
          }
          if (pageErrors.length) {
            failures.push(path + " (" + viewport.name + "): " + pageErrors.join(" | "));
          }
          console.log("PASS " + path + " " + viewport.name + " " +
            JSON.stringify(metrics));
        } catch (error) {
          failures.push(path + " (" + viewport.name + "): " + error.message);
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
  }

  if (failures.length) {
    console.error("Browser smoke test failures:\n" + failures.join("\n"));
    process.exit(1);
  }
  console.log("Desktop/mobile browser smoke tests passed.");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
