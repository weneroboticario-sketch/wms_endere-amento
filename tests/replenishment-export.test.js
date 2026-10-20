import test from "node:test";
import assert from "node:assert/strict";
import { buildReplenishmentExportRows, fillReplenishmentTemplate, getReplenishmentExportFile } from "../src/replenishment-export.js";

const request = (id, overrides = {}) => ({ id, warehouse_code: "VDCG", codigo_material: "00178", quantidade_solicitada: 10, quantidade_atendida: 3, status: "CONCLUIDO", finished_at: "2026-10-09T12:00:00", ...overrides });

test("exports actual quantities, preserves zeros, aggregates codes without repeating requests", () => {
  assert.deepEqual(buildReplenishmentExportRows([
    request("1"), request("1"), request("2", { status: "ENTREGUE_NA_LOJA", quantidade_atendida: 2 }),
    request("3", { quantidade_atendida: 0 }), request("4", { status: "ATENDIDO_PARCIAL" }),
    request("5", { warehouse_code: "VDCO" }), request("6", { is_deleted: true }),
    request("7", { status: "CANCELADO" }), request("8", { status: "SEM_ESTOQUE" }),
    request("9", { export_batch_id: "previous-batch" })
  ], "VDCG"), [["00178", 5]]);
});

test("a new attended request for an exported SKU remains eligible", () => {
  assert.deepEqual(buildReplenishmentExportRows([request("1", { export_batch_id: "old" }), request("2")], "VDCG"), [["00178", 3]]);
  assert.throws(() => buildReplenishmentExportRows([request("1", { quantidade_atendida: "invalid" })], "VDCG"));
});

test("same SKU sums only within its destination and batch using completed quantities", () => {
  const a = request("a", { codigo_material: "48060", quantidade_atendida: 5 });
  const b = request("b", { codigo_material: "48060", quantidade_atendida: 3 });
  const other = request("c", { codigo_material: "48060", warehouse_code: "VDCO", quantidade_atendida: 9 });
  const pending = request("d", { status: "PENDENTE" });
  assert.deepEqual(buildReplenishmentExportRows([a, b, other, pending], "VDCG"), [["48060", 8]]);
  assert.deepEqual(buildReplenishmentExportRows([a, b, other], "VDCO"), [["48060", 9]]);
  const historical = buildReplenishmentExportRows([a], "VDCG");
  assert.deepEqual(buildReplenishmentExportRows([{ ...a, export_batch_id: "old" }, b], "VDCG"), [["48060", 3]]);
  assert.deepEqual(historical, [["48060", 5]]);
});

test("historical file bypasses template generation, even after requests change", async () => {
  const file = "UEsDBAAAhistorical-file";
  const result = await getReplenishmentExportFile({
    batch: { id: "old", requests: [] },
    loadFile: async () => file,
    saveFile: () => assert.fail("must not replace history"),
    createFile: () => assert.fail("must not recalculate history")
  });
  assert.equal(result, file);
});

test("racing first downloads use the stored winner, not their locally generated file", async () => {
  let stored;
  let generated = 0;
  const options = {
    batch: { id: "batch" },
    loadFile: async () => null,
    createFile: async () => "file-" + (++generated),
    saveFile: async (_id, file) => { stored ??= file; return stored; }
  };
  assert.deepEqual(await Promise.all([
    getReplenishmentExportFile(options), getReplenishmentExportFile(options)
  ]), ["file-1", "file-1"]);
});

test("template retains optional headers and legend, material cells are explicit text", () => {
  const workbook = { Sheets: { Materiais: { A1: { v: "Material" }, B1: { v: "Quantidade" }, P1: { v: "TipoMovimentoContabil" } }, Legenda: { A1: { v: "Nome" } } } };
  const original = JSON.parse(JSON.stringify(workbook));
  const XLSX = { utils: { sheet_add_aoa(sheet, rows, options) {
    assert.deepEqual(options, { origin: "A2" });
    rows.forEach((row, i) => { sheet["B" + (i + 2)] = { t: "n", v: row[1] }; });
  } } };
  fillReplenishmentTemplate(XLSX, workbook, [["00178", 3]]);
  assert.deepEqual(workbook.Sheets.Materiais.A2, { t: "s", v: "00178", z: "@" });
  assert.deepEqual(workbook.Sheets.Materiais.B2, { t: "n", v: 3 });
  assert.deepEqual(workbook.Sheets.Materiais.P1, original.Sheets.Materiais.P1);
  assert.deepEqual(workbook.Sheets.Legenda, original.Sheets.Legenda);
});
