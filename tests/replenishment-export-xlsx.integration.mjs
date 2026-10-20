import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { buildReplenishmentExportRows, fillReplenishmentTemplate } from "../src/replenishment-export.js";

// Explicit integration test: uses the same pinned SheetJS build as index.html.
test("VD+ template roundtrip preserves its structure and writes each SKU once", async () => {
  const response = await fetch("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js", {
    signal: globalThis.AbortSignal.timeout(15000)
  });
  assert.equal(response.ok, true);
  const context = {};
  vm.runInNewContext(await response.text(), context, { timeout: 5000 });
  const XLSX = context.XLSX;
  const template = await readFile(new URL("../public/templates/materiais-reposicao.xlsx", import.meta.url));
  const workbook = XLSX.read(template, { type: "buffer" });
  const headers = sheet => Object.fromEntries(Object.entries(sheet).filter(([cell]) => /^[A-Z]+1$/.test(cell)));
  const originalHeaders = JSON.stringify(headers(workbook.Sheets.Materiais));
  const originalSheets = JSON.stringify(workbook.SheetNames);
  const request = (id, quantity, warehouse = "VDCG", status = "CONCLUIDO") => ({
    id, warehouse_code: warehouse, codigo_material: "48060", quantidade_solicitada: 20,
    quantidade_atendida: quantity, status
  });
  fillReplenishmentTemplate(XLSX, workbook, buildReplenishmentExportRows([
    request("a", 5), request("b", 3), request("c", 7, "VDCO"), request("d", 2, "VDCG", "PENDENTE")
  ], "VDCG"));
  const encoded = XLSX.write(workbook, { type: "base64", bookType: "xlsx" });
  const reopened = XLSX.read(encoded, { type: "base64" });
  assert.equal(reopened.Sheets.Materiais.A2.v, "48060");
  assert.equal(reopened.Sheets.Materiais.A2.t, "s");
  assert.equal(reopened.Sheets.Materiais.B2.v, 8);
  assert.equal(reopened.Sheets.Materiais.A3, undefined);
  assert.equal(JSON.stringify(headers(reopened.Sheets.Materiais)), originalHeaders);
  assert.equal(JSON.stringify(reopened.SheetNames), originalSheets);
});
