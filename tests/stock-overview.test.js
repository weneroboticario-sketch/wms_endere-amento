import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";

const source = (await readFile(new URL("../src/stock-overview.js", import.meta.url), "utf8"))
  .replace('import { escapeHtml as esc } from "./utils.js";', 'const esc = value => String(value);')
  .replace('import "./stock-overview.css";', "");
const { canViewStockOverview, importHealth, readStockOverview } = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
const admin = { id: "admin", active: true, role: "ADMINISTRADOR", isGlobalAdmin: true };

test("administrative overview only permits active administrators", async () => {
  assert.equal(canViewStockOverview(admin), true);
  for (const user of [null, { ...admin, active: false }, { ...admin, archived: true }, { ...admin, role: "OPERADOR" }, { ...admin, role: "SUPERVISOR" }]) {
    assert.equal(canViewStockOverview(user), false);
    await assert.rejects(readStockOverview({}, user), /autorizado/);
  }
});

test("failed and stale imports never appear healthy", () => {
  const now = Date.parse("2026-10-15T12:00:00Z");
  assert.equal(importHealth(null, now).kind, "warning");
  assert.equal(importHealth({ status: "FAILED" }, now).kind, "error");
  assert.equal(importHealth({ status: "PROCESSING" }, now).kind, "warning");
  assert.equal(importHealth({ status: "COMPLETED", created_at: "2026-10-15T10:00:00Z" }, now).kind, "success");
  assert.equal(importHealth({ status: "COMPLETED", created_at: "2026-10-12T10:00:00Z" }, now).kind, "warning");
});

test("overview uses exact scoped counts and preserves query failures as unavailable", async () => {
  const calls = [];
  const client = { from(table) {
    const call = { table, filters: [] }; calls.push(call);
    const query = {
      select(fields, options) { call.fields = fields; call.options = options; return this; },
      eq(key, value) { call.filters.push([key, value]); return this; },
      order() { return this; }, limit() { return this; }, in() { return this; }, or() { return this; },
      gt() { call.fail = true; return this; },
      then(resolve) { return Promise.resolve(table === "wms_warehouses" ? { data: [{ code: "VDCG", name: "Central" }, { code: "VDAR", name: "Filial" }] } :
        call.fail ? { error: { message: "Denied" } } : { count: 15000, data: [] }).then(resolve); }
    };
    return query;
  } };
  const rows = await readStockOverview(client, admin);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].counts[0], 15000);
  assert.equal(rows[0].counts[2], null);
  assert.deepEqual(rows[0].errors, [2]);
  const scoped = await readStockOverview(client, { ...admin, isGlobalAdmin: false, allowedWarehouseCodes: ["VDAR"] });
  assert.deepEqual(scoped.map(row => row.code), ["VDAR"]);
  for (const call of calls.filter(c => c.table !== "wms_warehouses")) {
    assert.ok(call.filters.some(([key]) => key === "warehouse_code"));
    if (call.table === "wms_stock_positions") assert.deepEqual(call.options, { count: "exact", head: true });
  }
});
