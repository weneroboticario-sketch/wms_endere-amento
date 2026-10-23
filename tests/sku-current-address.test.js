import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../script.js", import.meta.url), "utf8");
function load(name, dependencies) {
  const body = source.match(new RegExp("  (?:async )?function " + name + "\\([^]*?\\n  }"))?.[0];
  assert.ok(body);
  const context = vm.createContext(dependencies);
  vm.runInContext(body, context);
  return context[name];
}

test("SKU 86809 shows its current WMS address without inventing an imported capture address", () => {
  const build = load("buildSkuReplenishmentSuggestion", {
    normalizeSku: value => value, findProductName: () => "Lily Elixir",
    classifyReplenishmentSuggestion: () => null, locationKeyFromBinding: binding => binding.locationCode,
    normalizeLocation: code => ({ valid: Boolean(code), code, rua: 1, rack: 4, linha: 2, letra: "G" }),
    sortByDateDesc: (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
  });
  const stock = { name: "Lily Elixir", captureLocation: "", captureAvailable: 12 };
  const result = build("86809", [{ locationCode: "R01-RK04-L02-G", updatedAt: "2026-10-23T13:52:15Z" }], stock);
  assert.equal(result.officialLocation, "R01-RK04-L02-G");
  assert.equal(result.productInfo.wmsLocation, "R01-RK04-L02-G");
  assert.equal(result.captureLocation, "");
  assert.equal(stock.captureLocation, "");
});

test("address lookup reads the current warehouse instead of reusing a stale exact-SKU cache", async () => {
  const filters = [];
  const query = {
    select: () => query, eq: (...values) => { filters.push(values); return query; },
    in: (...values) => { filters.push(values); return query; },
    order: async () => ({ data: [{ id: "current", sku: "86809", locationCode: "R01-RK04-L02-G" }] })
  };
  const fetch = load("fetchCurrentSkuAddresses", {
    isSupabaseReady: () => true, canUseNetwork: () => true,
    findBySku: () => [{ id: "stale", sku: "86809" }], splitSkuValues: value => value.split(";"),
    bindingMatchesWarehouseCode: () => true, normalizeSku: value => value, normalizeSkuKey: value => value,
    unique: values => [...new Set(values)], supabaseDb: { from: () => query },
    runSupabaseRequestWithRetry: async (_label, callback) => callback(), expandDbBindingRows: rows => rows
  });
  const result = await fetch("86809", "VDCG");
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "current");
  assert.deepEqual(filters[0], ["warehouse_code", "VDCG"]);
});
