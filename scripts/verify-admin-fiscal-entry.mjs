import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";

const { chromium } = await import(pathToFileURL(process.env.WMS_PLAYWRIGHT_MODULE).href);
const server = await createServer({ resolve: { preserveSymlinks: false }, plugins: [{ name: "admin-fiscal-fixture", configureServer(server) {
  server.middlewares.use((req, res, next) => {
    if (req.url !== "/__admin-fiscal") return next();
    res.setHeader("Content-Type", "text/html");
    res.end('<!doctype html><html class="cp-alamo"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="require-trusted-types-for \'script\'; trusted-types default dompurify"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/src/cpalamo-theme.css"><link rel="stylesheet" href="/src/purchases-workflow.css"></head><body style="padding:16px"><div id="fiscalWorkflowContent"></div><p id="fiscalWorkflowStatus"></p></body></html>');
  });
} }], server: { host: "127.0.0.1", port: 4199, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.WMS_CHROME_PATH });
await mkdir("outputs", { recursive: true });
try {
  for (const [role, width] of [["ADMINISTRADOR", 1366], ["SUPERVISOR", 390]]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto("http://127.0.0.1:4199/__admin-fiscal");
    await page.evaluate(async role => {
      const { installHtmlSecurity } = await import("/src/utils.js"); installHtmlSecurity();
      const { createPurchasesWorkflow } = await import("/src/purchases-workflow.js");
      const now = new Date().toISOString();
      const transfer = { id: "ready", warehouse_code: "22796", status: "PRONTA_PARA_NOTA", requires_invoice: false, invoice_stage: "", is_deleted: false, sent_at: null, codigo_transferencia: "TRF-READY", destino_nome: "Loja destino", total_caixas: 1, packing_finished_at: now, updated_at: now, status_changed_at: now, invoice_snapshot: [] };
      window.adminFiscalCalls = [];
      const client = { from(table) {
        const filters = []; let single = false, head = false;
        const query = { then(resolve, reject) {
          let rows = table === "wms_transfers" ? [transfer] : table === "wms_transfer_items" ? [{ sku: "00123", warehouse_code: "22796", transfer_id: "ready", quantidade_solicitada: 2, quantidade_separada: 2, quantidade_lacrada: 2 }] : [];
          rows = rows.filter(row => filters.every(filter => filter(row)));
          return Promise.resolve({ data: head ? null : single ? rows[0] : rows, count: rows.length, error: null }).then(resolve, reject);
        } };
        query.select = (_columns, options) => { head = options?.head || false; return query; };
        query.eq = (key, value) => { filters.push(row => row[key] === value); return query; };
        query.neq = (key, value) => { filters.push(row => row[key] !== value); return query; };
        query.in = (key, values) => { filters.push(row => values.includes(row[key])); return query; };
        query.is = (key, value) => { filters.push(row => row[key] === value); return query; };
        for (const method of ["order", "range", "limit", "not", "or"]) query[method] = () => query;
        query.single = () => { single = true; return query; }; return query;
      }, storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }) }) }, async rpc(name, args) {
        if (name === "wms_fiscal_summary") return { data: { "Aguardando NF": transfer.requires_invoice && transfer.invoice_stage === "PRONTA_PARA_NOTA" ? 1 : 0 }, error: null };
        window.adminFiscalCalls.push({ name, args });
        if (name === "wms_transfer_enable_invoice") Object.assign(transfer, { requires_invoice: true, invoice_stage: "PRONTA_PARA_NOTA", invoice_snapshot: [{ sku: "00123", requested: 2, separated: 2, checked: 2 }] });
        if (name === "wms_invoice_action" && args.p_action === "UPLOAD") Object.assign(transfer, { invoice_stage: "NF_ANEXADA", invoice_number: args.p_data.number, invoice_value: args.p_data.value, invoice_file_path: args.p_data.path });
        return { data: transfer, error: null };
      } };
      const view = createPurchasesWorkflow({ client: () => client, user: () => ({ id: "manager", role, name: "Gestor" }), warehouse: () => "22796", global: () => false, warehouses: () => [{ code: "22796", name: "VDDRD" }], changed() {}, diagnostic() {}, openTransfer() {} });
      window.adminFiscalView = view; await view.refresh();
    }, role);
    assert.match(await page.locator("#fiscalRows").textContent(), /TRF-READY/);
    assert.equal(await page.locator("#fiscalRows [data-fiscal-open]").textContent(), "Encaminhar para NF");
    assert.match(await page.locator("#fiscalMetrics").textContent(), /Aguardando NF1/);
    await page.evaluate(() => window.adminFiscalView.openTransferInvoice("ready", "22796"));
    assert.equal(await page.locator('[data-fiscal-panel="invoice"]').isVisible(), true);
    await page.locator('[data-fiscal-action="ENABLE"]').click();
    await page.locator('.app-modal textarea[name="reason"]').fill("Encaminhar transferencia conferida para faturamento");
    await page.locator('.app-modal button[type="submit"]').click();
    await page.waitForSelector("#fiscalUploadForm");
    await page.locator('#fiscalUploadForm [name="number"]').fill("000123");
    await page.locator('#fiscalUploadForm [name="value"]').fill("123.45");
    await page.locator('#fiscalUploadForm [name="pdf"]').setInputFiles({ name: "nf.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF") });
    await page.locator('#fiscalUploadForm button').click();
    await page.waitForSelector('[data-fiscal-action="RELEASE"]');
    const calls = await page.evaluate(() => window.adminFiscalCalls);
    assert.ok(calls.some(call => call.name === "wms_transfer_enable_invoice"));
    assert.ok(calls.some(call => call.name === "wms_invoice_action" && call.args.p_action === "UPLOAD"));
    assert.equal(await page.locator('[data-fiscal-action="DISPATCH"]').count(), 0);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `outputs/admin-fiscal-${role}-${width}.png` });
    console.log(`${role}: ready transfer visible, invoice form, upload and release available.`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
