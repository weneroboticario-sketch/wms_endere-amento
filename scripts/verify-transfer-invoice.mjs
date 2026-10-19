import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";
import { Buffer } from "node:buffer";

const { chromium } = await import(pathToFileURL(process.env.WMS_PLAYWRIGHT_MODULE).href);
const config = JSON.parse(await readFile("vercel.json", "utf8"));
const csp = config.headers.flatMap(row => row.headers).find(row => row.key === "Content-Security-Policy").value;
const fixture = (req, res, next) => {
  if (req.url !== "/__invoice-test") return next();
  res.setHeader("Content-Type", "text/html");
  res.setHeader("Content-Security-Policy", csp);
  res.end('<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><table><tbody id="finalizedTransferRows"><tr><td><button data-transfer-invoice="test">Registrar NF</button></td></tr></tbody></table></body></html>');
};
const server = await createServer({ plugins: [{ name: "invoice-test-fixture", configureServer(server) { server.middlewares.use(fixture); } }], server: { host: "127.0.0.1", port: 4198, strictPort: true, headers: { "Content-Security-Policy": csp } }, resolve: { preserveSymlinks: false } });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.WMS_CHROME_PATH });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:4198/__invoice-test");
  await page.evaluate(async () => {
    const { installHtmlSecurity } = await import("/src/utils.js"); installHtmlSecurity();
    const { createTransferInvoiceController } = await import("/src/transfer-invoice.js");
    let record = null;
    const client = { from() {
      let insert, many = false;
      const query = { then(resolve, reject) {
        if (insert) {
          record = { transfer_id: "test", invoice_number: "000424", invoice_key: "1".repeat(44), created_at: new Date().toISOString(), created_by_name: "Supervisor", ...insert };
          window.invoiceSaved = true;
        }
        return Promise.resolve({ data: many ? (record ? [record] : []) : record, error: null }).then(resolve, reject);
      } };
      for (const method of ["select", "eq", "in", "maybeSingle", "single"]) query[method] = () => query;
      query.in = () => { many = true; return query; };
      query.insert = row => { insert = row; return query; }; return query;
    } };
    const controller = createTransferInvoiceController({ client: () => client, transfer: () => ({ id: "test", code: "TRF-TEST", warehouseCode: "VDCG", destinationCnpj: "12345678000199" }), allowed: () => true, refresh: async () => {} });
    window.invoiceController = controller;
    await controller.open("test");
  });
  const upload = async text => {
    await page.locator('[data-file]').setInputFiles({ name: "nota.xml", mimeType: "application/xml", buffer: Buffer.from(text) });
    await page.waitForTimeout(100);
  };
  await upload("<NFe><broken></NFe>");
  await assert.match(await page.locator("[data-error]").textContent(), /XML inválido/);
  const xml = cnpj => `<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe${"1".repeat(44)}"><ide><nNF>000424</nNF></ide><dest><CNPJ>${cnpj}</CNPJ><xNome>Loja Teste</xNome></dest></infNFe></NFe>`;
  await upload(xml("99999999000199"));
  assert.match(await page.locator("[data-error]").textContent(), /destinatário/);
  await upload(xml("12345678000199"));
  assert.match(await page.locator("[data-preview]").textContent(), /000424/);
  assert.equal(await page.locator("[data-error]").textContent(), "");
  await mkdir("outputs", { recursive: true });
  await page.screenshot({ path: "outputs/transfer-invoice-mobile.png" });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.screenshot({ path: "outputs/transfer-invoice-desktop.png" });
  await page.locator("[data-confirm]").check(); await page.locator("[data-save]").click();
  await page.waitForFunction(() => window.invoiceSaved === true);
  await page.evaluate(() => window.invoiceController.decorate());
  assert.match(await page.locator("[data-transfer-invoice]").textContent(), /NF 000424/);
  await page.evaluate(() => window.invoiceController.open("test"));
  assert.match(await page.locator("[data-body]").textContent(), /000424/);
  assert.equal(await page.locator("[data-download]").count(), 1);
  assert.deepEqual(errors, []);
  console.log("Invoice XML, CSP, recipient check, completion and saved document verified.");
} finally { await browser.close(); await server.close(); }
