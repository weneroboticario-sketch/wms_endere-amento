import assert from "node:assert/strict";
import test from "node:test";
import { staleStockSources, STOCK_FRESHNESS_LIMIT_MS } from "../src/stock-freshness.js";

const now = Date.parse("2026-10-21T16:00:00Z");
const batch = overrides => ({
  warehouse_code: "VDCG", source_type: "CAPTACAO", status: "COMPLETED",
  finished_at: "2026-10-21T11:00:00Z", ...overrides
});

test("warns only after four hours since successful completion", () => {
  const completed = batch({ finished_at: new Date(now - STOCK_FRESHNESS_LIMIT_MS).toISOString() });
  assert.deepEqual(staleStockSources([completed], "VDCG", now), []);
  assert.equal(staleStockSources([completed], "VDCG", now + 1).length, 1);
  assert.deepEqual(staleStockSources([batch({ finished_at: "2026-10-21T17:00:00Z" })], "VDCG", now), []);
});

test("a fresh store import cannot hide stale capture stock", () => {
  const result = staleStockSources([batch({}), batch({ source_type: "LOJA", finished_at: "2026-10-21T15:00:00Z" })], "VDCG", now);
  assert.deepEqual(result.map(source => source.sourceType), ["CAPTACAO"]);
});

test("a new successful import clears the warning but failed imports do not", () => {
  const old = batch({});
  const recent = batch({ finished_at: "2026-10-21T15:00:00Z" });
  assert.equal(staleStockSources([old, { ...recent, status: "FAILED" }, { ...recent, status: "PROCESSING" }], "VDCG", now).length, 1);
  assert.deepEqual(staleStockSources([old, recent], "VDCG", now), []);
});

test("isolates warehouses and ignores missing or invalid timestamps", () => {
  assert.deepEqual(staleStockSources([batch({ warehouse_code: "VDCO" }), batch({ finished_at: "invalid" })], "VDCG", now), []);
  assert.deepEqual(staleStockSources([], "VDCG", now), []);
  assert.equal(staleStockSources([batch({ finished_at: null, updated_at: "2026-10-21T11:00:00Z" })], "VDCG", now).length, 1);
});
