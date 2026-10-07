import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const script = await readFile(new URL("../script.js", import.meta.url), "utf8");

test("legacy Excel import screen is completely retired", () => {
  assert.doesNotMatch(html, /data-screen="importar"/);
  assert.doesNotMatch(html, /id="importar"/);
  assert.doesNotMatch(html, /id="importExcelButton"/);
  assert.doesNotMatch(html, /id="excelFileInput"/);
  assert.doesNotMatch(script, /async function importExcel\(/);
  assert.doesNotMatch(script, /importar:\s*\[/);
});

test("Base de Estoque remains the only stock ingestion screen", () => {
  assert.match(html, /data-screen="baseEstoque"/);
  assert.match(html, /id="baseEstoque"/);
  assert.match(html, /id="importCaptureStockButton"/);
  assert.match(html, /id="importStoreStockButton"/);
  assert.match(script, /function importStockFromInput\(sourceType\)/);
});
