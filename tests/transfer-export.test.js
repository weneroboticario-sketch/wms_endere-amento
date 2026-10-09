import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { buildPackedProductRows, packedProductCsv, parseTransferQuantity } from "../src/transfer-export.js";

test("exports only actual packed units, preserves SKU and aggregates duplicates", () => {
  const rows = buildPackedProductRows([
    { sku: "00123", requestedQty: 20, separatedQty: 10, packedQty: 3 },
    { sku: "00123", packedQty: 2 },
    { sku: "99999", requestedQty: 100, separatedQty: 100, packedQty: 0 },
    { sku: "55555", unit: "CX", packedQty: 2, packedUnits: 24 },
    { sku: "11111", status: "REMOVIDO", packedQty: 3 },
    { sku: "22222", isExtra: true, packedQty: 1 }
  ]);
  assert.deepEqual(rows, [["00123", 5], ["55555", 24], ["22222", 1]]);
  assert.equal(packedProductCsv(rows), "00123;5\r\n55555;24\r\n22222;1\r\n");
  assert.throws(() => buildPackedProductRows([{ sku: "1", unit: "CX", packedQty: 1 }]), /unidades/);
  assert.throws(() => buildPackedProductRows([{ sku: "=1+1", packedQty: 1 }]), /Codigo/);
});

test("zero is intentional; empty, invalid and negative quantities are rejected", () => {
  assert.equal(parseTransferQuantity("0"), 0);
  assert.equal(parseTransferQuantity("2,5"), 2.5);
  for (const value of ["", "abc", "-1", "Infinity", "1e3", "1.0001"]) assert.ok(Number.isNaN(parseTransferQuantity(value)));
});

const source = readFileSync(new URL("../script.js", import.meta.url), "utf8");
function getFunction(name, context = {}) {
  const start = source.indexOf("  async function " + name + "(");
  const end = source.indexOf("\n  function ", start + 1);
  const asyncEnd = source.indexOf("\n  async function ", start + 1);
  const stop = Math.min(...[end, asyncEnd].filter(value => value > start));
  return vm.runInNewContext("(" + source.slice(start, stop).trim() + ")", context);
}

test("item save is scoped and rejects stale or denied writes before local confirmation", async () => {
  const filters = [];
  let localWrites = 0;
  let data = null;
  const query = { update() { return this; }, eq(key, value) { filters.push([key, value]); return this; }, select() { return this; }, async maybeSingle() { return { data }; } };
  const save = getFunction("saveTransferItemChecked", {
    supabaseDb: { from() { return query; } }, activeWarehouseCode: () => "VDCG",
    applyLocalTransferItemUpdate: () => { localWrites++; }
  });
  const item = { id: "i", transferId: "t", updatedAt: "before" };
  await assert.rejects(save(item, { quantidade_lacrada: 3 }), /outro colaborador/);
  assert.equal(localWrites, 0);
  assert.deepEqual(filters, [["id", "i"], ["transfer_id", "t"], ["warehouse_code", "VDCG"], ["updated_at", "before"]]);
  data = { id: "i", updated_at: "after" };
  await save(item, { quantidade_lacrada: 3 });
  assert.equal(item.updatedAt, "after");
  assert.equal(localWrites, 1);
});
