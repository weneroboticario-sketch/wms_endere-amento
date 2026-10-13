import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

test("login loads the actual warehouse registry without seeding or requiring write permissions", async () => {
  const source = await readFile(new URL("../script.js", import.meta.url), "utf8");
  const start = source.indexOf("  async function ensureWarehouses() {");
  const end = source.indexOf("  async function loadWarehouses()", start);
  const code = source.slice(start, end);
  assert.doesNotMatch(code, /upsert|WAREHOUSE_SEED|warehouseState\.warehouses\s*=/);
  for (const loaded of [true, false]) {
    let reads = 0;
    const context = vm.createContext({
      isSupabaseReady: () => true,
      loadWarehouses: async () => { reads++; return loaded; }
    });
    const result = await vm.runInContext(code + "ensureWarehouses()", context);
    assert.equal(result, loaded);
    assert.equal(reads, 1);
  }
});

test("login does not query warehouses before a Supabase connection exists", async () => {
  const source = await readFile(new URL("../script.js", import.meta.url), "utf8");
  const start = source.indexOf("  async function ensureWarehouses() {");
  const code = source.slice(start, source.indexOf("  async function loadWarehouses()", start));
  const context = vm.createContext({isSupabaseReady: () => false, loadWarehouses: () => assert.fail("Unexpected query")});
  assert.equal(await vm.runInContext(code + "ensureWarehouses()", context), false);
});

