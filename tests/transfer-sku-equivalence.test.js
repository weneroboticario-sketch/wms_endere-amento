import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
function fixture() {
  const calls = [];
  const positions = [
    { id: "p", warehouseCode: "VDCG", codigoMaterial: "01314", sourceType: "CAPTACAO", totalDisponivel: 24 },
    { id: "q", warehouseCode: "VDCG", codigoMaterial: "1314", sourceType: "LOJA", totalDisponivel: 2 },
    { id: "other", warehouseCode: "VDAR", codigoMaterial: "01314", sourceType: "CAPTACAO", totalDisponivel: 99 }
  ];
  const sandbox = { stockState: { positionCache: {} }, activeWarehouseCode: () => "VDCG", normalizeWarehouseCode: x => x, normalizeText: x => x, unique: values => [...new Set(values)], isSupabaseReady: () => true,
    stockPositionSelectColumns: () => "*", stockPositionLegacySelectColumns: () => "*", fromDbStockPosition: row => row,
    buildStockSuggestion: (sku, quantity, rows, warehouse) => ({ sku, quantity, warehouse, stock: rows.reduce((sum, row) => sum + row.totalDisponivel, 0), count: rows.length }),
    supabaseDb: { from() {
      const filters = {}; const query = { select() { return query; }, eq(k,v) { filters[k]=v; return query; }, in(k,v) { filters[k]=v; return query; }, limit() { return query; }, then(resolve) {
        calls.push(filters);
        return Promise.resolve({data: positions.filter(row => row.warehouseCode === filters.warehouse_code && filters.codigo_material.includes(row.codigoMaterial))}).then(resolve);
      }};
      return query;
    }}
  };
  vm.createContext(sandbox);
  const section = source.slice(source.indexOf("  function stockSkuQueryValues("),source.indexOf("  async function getReplenishmentSuggestion("));
  const normalizer = source.slice(source.indexOf("  function normalizeSku("),source.indexOf("  function splitSkuValues("));
  const key = source.slice(source.indexOf("  function normalizeSkuKey("),source.indexOf("  function normalizeText("));
  vm.runInContext(section + normalizer + key, sandbox);
  return { sandbox, calls };
}
test("transfer matches 1314 and 01314, preserving requested SKU and avoiding duplicated stock", async () => {
  const {sandbox:s, calls} = fixture();
  const rows = await s.getTransferStockSuggestion({warehouse_code:"VDCG",items:[{sku:"1314",quantity:3},{sku:"01314",quantity:1}]});
  assert.deepEqual(Array.from(rows, row => row.sku), ["1314","01314"]);
  assert.deepEqual(Array.from(rows, row => row.stock), [26,26]);
  assert.deepEqual(Array.from(rows, row => row.count), [2,2]);
  assert.equal(calls.length,1);
  const again = await s.getTransferStockSuggestion({warehouse_code:"VDAR",items:[{sku:"1314",quantity:1}]});
  assert.equal(again[0].stock,99);
  assert.equal(calls.length,2);
});
test("query aliases preserve alphanumeric identifiers and cache lookup works both ways", async () => {
  const {sandbox:s,calls} = fixture();
  assert.deepEqual(Array.from(s.stockSkuQueryValues(["AB01314"])),["AB01314"]);
  await s.getStockPositionsForSkus(["01314"]);
  const unpadded = await s.getStockPositionsForSkus(["1314","01314"]);
  assert.equal(unpadded.length,2);
  assert.equal(calls.length,1);
  assert.ok(calls[0].codigo_material.includes("01314"));
});
