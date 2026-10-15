import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { pathToFileURL } from "node:url";

const { chromium } = await import(pathToFileURL(resolve(process.argv[2], "index.mjs")).href);
const server = await createServer({ server: { host: "127.0.0.1", port: 4195, strictPort: true }, resolve: { preserveSymlinks: false } });
await server.listen();
const browser = await chromium.launch({ executablePath: process.argv[3], headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const html = (await readFile("index.html", "utf8")).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  await page.route("http://127.0.0.1:4195/", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("http://127.0.0.1:4195/");
  await page.evaluate(async () => {
    document.body.classList.remove("auth-locked");
    document.querySelector("#loginShell").hidden = true;
    document.querySelectorAll("[hidden]").forEach(node => { if (node.id === "app") node.hidden = false; });
    const app = document.querySelector(".app-shell") || document.querySelector("#app");
    if (app) { app.hidden = false; app.style.display = ""; }
    document.querySelector("#loginScreen")?.remove();
    document.querySelectorAll(".screen").forEach(node => { node.hidden = node.id !== "stockOverview"; node.classList.toggle("active", node.id === "stockOverview"); });
    document.querySelector('[data-screen="stockOverview"]').hidden = false;
    const { mountStockOverview } = await import("/src/stock-overview.js");
    const client = { from(table) {
      const query = { select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; }, gt() { return this; }, or() { return this; }, in() { return this; },
        then(resolve) { return Promise.resolve(table === "wms_warehouses" ? { data: ["VDCG", "VDAR", "VDSI", "VDCO"].map(code => ({ code, name: "Estoque " + code })) } :
          table === "wms_stock_import_batches" ? { data: [{ id: "batch", source_type: "CAPTACAO", status: "COMPLETED", created_at: new Date().toISOString(), file_name: "MaterialLinhaSeparacao.xlsx", imported_rows: 32416 }] } :
          { count: 32416 }).then(resolve); } };
      return query;
    } };
    window.openedWarehouse = null;
    const controller = mountStockOverview({ root: document.querySelector("#stockOverview"), client, getUser: () => ({ id: "admin", active: true, role: "ADMINISTRADOR", isGlobalAdmin: true }), openWarehouse: code => { window.openedWarehouse = code; } });
    await controller.refresh();
  });
  for (const width of [1440, 1366, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    assert.equal(await page.locator(".overview-warehouse").count(), 4);
    const layout = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth, visible: document.querySelector("#stockOverview").getBoundingClientRect().height }));
    assert.ok(layout.scroll <= layout.width + 1, JSON.stringify(layout));
    assert.ok(layout.visible > 300);
    await page.screenshot({ path: resolve(process.argv[4], "enderecamento-visao-geral-" + width + ".png"), fullPage: true });
  }
  await page.locator("[data-warehouse]").selectOption("VDAR");
  assert.equal(await page.locator(".overview-warehouse").count(), 1);
  await page.locator("[data-open]").click();
  assert.equal(await page.evaluate(() => window.openedWarehouse), "VDAR");
  await page.locator("[data-refresh]").click();
  await page.waitForFunction(() => !document.querySelector("[data-refresh]").disabled);
  assert.equal(await page.locator("[data-warehouse]").inputValue(), "VDAR");
  assert.deepEqual(errors, []);
  console.log("Four viewports, filter, refresh, stock navigation and browser errors: passed.");
} finally { await browser.close(); await server.close(); }
