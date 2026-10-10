import test from "node:test";
import assert from "node:assert/strict";
import { buildReplenishmentExportRows, fillReplenishmentTemplate } from "../src/replenishment-export.js";

const request = (id, overrides = {}) => ({ id, warehouse_code: "VDCG", codigo_material: "00178", quantidade_solicitada: 10, quantidade_atendida: 3, status: "CONCLUIDO", finished_at: "2026-10-09T12:00:00", ...overrides });

test("exports actual quantities, preserves zeros, aggregates codes without repeating requests", () => {
  assert.deepEqual(buildReplenishmentExportRows([
    request("1"), request("1"), request("2", { status: "ENTREGUE_NA_LOJA", quantidade_atendida: 2 }),
    request("3", { quantidade_atendida: 0 }), request("4", { status: "ATENDIDO_PARCIAL" }),
    request("5", { warehouse_code: "VDCO" }), request("6", { is_deleted: true }),
    request("7", { status: "CANCELADO" }), request("8", { status: "SEM_ESTOQUE" })
  ], "VDCG"), [["00178", 5]]);
});

test("completion period includes the whole last day and validates date order", () => {
  assert.deepEqual(buildReplenishmentExportRows([
    request("1", { finished_at: "2026-10-08T23:59:59" }),
    request("2", { finished_at: "2026-10-09T23:59:59" }),
    request("3", { finished_at: "2026-10-10T00:00:00" })
  ], "VDCG", "2026-10-09", "2026-10-09"), [["00178", 3]]);
  assert.throws(() => buildReplenishmentExportRows([], "VDCG", "2026-10-10", "2026-10-09"));
  assert.throws(() => buildReplenishmentExportRows([request("1", { quantidade_atendida: "invalid" })], "VDCG"));
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
