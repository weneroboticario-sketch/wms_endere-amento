import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../script.js", import.meta.url), "utf8");
function load(names, dependencies) {
  const context = vm.createContext(dependencies);
  for (const name of names) {
    const body = source.match(new RegExp("  (?:async )?function " + name + "\\([^]*?\\n  }"))?.[0];
    assert.ok(body, name);
    vm.runInContext(body, context);
  }
  return context;
}

test("simultaneous stock or transfer loads share one request per warehouse and actor", async () => {
  for (const [functionName, loaderName] of [["loadStockOperationalData", "performStockOperationalLoad"], ["loadTransferData", "performTransferDataLoad"]]) {
    let calls = 0;
    let release;
    const deferred = new Promise(resolve => { release = resolve; });
    const context = load([functionName], {
      activeWarehouseCode: () => "VDCG", authState: { currentUser: { id: "user" } }, moduleLoadPromises: {},
      [loaderName]: async () => { calls += 1; return deferred; }
    });
    const first = context[functionName]();
    const second = context[functionName]();
    assert.equal(calls, 1);
    release(true);
    assert.deepEqual(await Promise.all([first, second]), [true, true]);
  }
});

test("late stock results cannot replace the state after switching warehouses", async () => {
  let warehouse = "VDCG";
  let release;
  const deferred = new Promise(resolve => { release = resolve; });
  const stockState = { importing: true };
  const context = load(["performStockOperationalLoad"], {
    activeWarehouseCode: () => warehouse, authState: { currentUser: { id: "user" } }, stockState,
    performance: { now: () => 0 }, isSupabaseReady: () => true,
    loadStockImportBatchRows: () => deferred, countActiveStockPositions: async () => 123
  });
  const pending = context.performStockOperationalLoad("VDCG", "user");
  warehouse = "VDAR";
  stockState.summary = { loja: 99, captacao: 77 };
  release({ data: [{ id: "vdcg-batch" }] });
  assert.equal(await pending, false);
  assert.equal(stockState.summary.loja, 99);
  assert.equal(stockState.summary.captacao, 77);
});

test("transfer detail pagination retains all items beyond the former 2000-row limit", async () => {
  const sourceRows = Array.from({ length: 2501 }, (_, index) => ({ id: index }));
  const orders = [];
  const context = load(["fetchTransferItemPages"], {
    transferItemDetailSelectColumns: () => "id",
    selectRowsWithMissingColumnFallback: async (_table, _columns, build) => {
      const query = { eq: () => query, order: key => { orders.push(key); return query; }, range: (offset, end) => ({ data: sourceRows.slice(offset, end + 1) }) };
      return build(query);
    }
  });
  assert.equal((await context.fetchTransferItemPages("transfer", "VDCG")).data.length, 2501);
  assert.deepEqual(orders.slice(0, 2), ["created_at", "id"]);
});
