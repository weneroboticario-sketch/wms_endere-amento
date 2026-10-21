import test from "node:test";
import assert from "node:assert/strict";
import { getStockFreshness, loadLatestStockImports, STOCK_FRESHNESS_LIMIT_MS } from "../src/stock-freshness.js";

const now = Date.parse("2026-10-21T16:00:00Z");
const row = (source, age, extra = {}) => ({
  warehouse_code: "22796", source_type: source, status: "COMPLETED",
  finished_at: new Date(now - age).toISOString(), ...extra
});

test("warning starts only after four hours, including when the page remains open", () => {
  const batches = [row("LOJA", STOCK_FRESHNESS_LIMIT_MS)];
  assert.equal(getStockFreshness(batches, "22796", ["LOJA"], now - 1)[0].stale, false);
  assert.equal(getStockFreshness(batches, "22796", ["LOJA"], now)[0].stale, false);
  assert.equal(getStockFreshness(batches, "22796", ["LOJA"], now + 1)[0].stale, true);
});

test("a fresh capture base cannot mask an old store base or another warehouse", () => {
  const result = getStockFreshness([
    row("LOJA", STOCK_FRESHNESS_LIMIT_MS + 1),
    row("CAPTACAO", 60000),
    row("LOJA", 0, { warehouse_code: "OTHER" })
  ], "22796", ["LOJA", "CAPTACAO"], now);
  assert.equal(result[0].stale, true);
  assert.equal(result[1].stale, false);
});

test("failed or processing imports do not renew the timestamp; successful imports clear warning", () => {
  const old = row("LOJA", STOCK_FRESHNESS_LIMIT_MS + 1);
  const batches = [old, row("LOJA", 0, { status: "FAILED" }), row("LOJA", 0, { status: "PROCESSING" })];
  assert.equal(getStockFreshness(batches, "22796", ["LOJA"], now)[0].stale, true);
  assert.equal(getStockFreshness([...batches, row("LOJA", 1000)], "22796", ["LOJA"], now)[0].stale, false);
});

test("completion time takes precedence over start time and unrelated updates", () => {
  const batch = row("LOJA", 60000, {
    created_at: new Date(now - 6 * 3600000).toISOString(),
    updated_at: new Date(now).toISOString()
  });
  assert.equal(getStockFreshness([batch], "22796", ["LOJA"], now)[0].stale, false);
  assert.equal(getStockFreshness([{ ...batch, finished_at: null }], "22796", ["LOJA"], now)[0].stale, true);
});

test("missing, invalid and future timestamps are unknown rather than freshly updated", () => {
  for (const finished_at of [null, "invalid", new Date(now + 60000).toISOString()]) {
    const [source] = getStockFreshness([row("LOJA", 0, { finished_at })], "22796", ["LOJA"], now);
    assert.equal(source.updatedAt, null);
  }
});

test("latest import query is bounded, completed-only and scoped by warehouse and source", async () => {
  const queries = [];
  const client = { from(table) {
    const query = { table, filters: {}, orders: [] };
    queries.push(query);
    const builder = {
      select(columns) { query.columns = columns; return builder; },
      eq(key, value) { query.filters[key] = value; return builder; },
      order(key, options) { query.orders.push([key, options]); return builder; },
      limit(count) { query.limit = count; return Promise.resolve({ data: [row(query.filters.source_type, 0)] }); }
    };
    return builder;
  } };
  assert.equal((await loadLatestStockImports(client, "22796", ["LOJA", "CAPTACAO"])).length, 2);
  assert.equal(queries.length, 2);
  for (const query of queries) {
    assert.equal(query.table, "wms_stock_import_batches");
    assert.equal(query.filters.warehouse_code, "22796");
    assert.equal(query.filters.status, "COMPLETED");
    assert.equal(query.limit, 1);
    assert.equal(query.orders[0][0], "finished_at");
  }
});

test("read failures are surfaced instead of reporting a fresh base", async () => {
  const builder = { select() { return this; }, eq() { return this; }, order() { return this; },
    limit() { return Promise.resolve({ error: new Error("offline") }); } };
  await assert.rejects(loadLatestStockImports({ from: () => builder }, "22796", ["LOJA"]), /offline/);
});
