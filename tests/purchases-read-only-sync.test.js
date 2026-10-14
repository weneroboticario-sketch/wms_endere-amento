import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const source = await readFile(new URL("../script.js", import.meta.url), "utf8");

function fixture(role, cpAlamo = true) {
  const writes = [];
  const binding = {sku: "001", areaCode: "A", areaName: "Old area", productName: "Old product"};
  const context = {
    state: {bindings: [binding]},
    getAreaByCode: () => ({name: "Current area"}),
    findProductName: () => "Current product",
    isPurchasesUser: () => cpAlamo && role === "COMPRAS",
    saveData: async () => { writes.push("save"); return true; }
  };
  vm.createContext(context);
  for (const name of ["applyDataMigrations", "refreshProductNamesForBindings"]) {
    const fn = source.match(new RegExp("  (?:async )?function " + name + "\\([^)]*\\) \\{[\\s\\S]*?\\n  }"));
    assert.ok(fn, name);
    vm.runInContext(fn[0], context);
  }
  return {context, binding, writes};
}

test("COMPRAS login enrichment updates display metadata without any database save", async () => {
  const {context, binding, writes} = fixture("COMPRAS");
  await context.applyDataMigrations();
  assert.equal(binding.areaName, "Current area");
  assert.equal(binding.productName, "Current product");
  assert.deepEqual(writes, []);
  await context.applyDataMigrations();
  assert.deepEqual(writes, []);
  assert.match(source, /ensureCoreDataLoaded\(\)\.then\(applyDataMigrations\)/);
});

test("COMPRAS SKU display refresh never rewrites bindings or history", () => {
  const {context, binding, writes} = fixture("COMPRAS");
  context.refreshProductNamesForBindings([binding]);
  assert.equal(binding.productName, "Current product");
  assert.deepEqual(writes, []);
});

test("operational roles and the separate WMS retain existing persistence", async () => {
  for (const [role, cp] of [["ADMINISTRADOR", true], ["SUPERVISOR", true], ["OPERADOR", true], ["COMPRAS", false]]) {
    const {context, binding, writes} = fixture(role, cp);
    await context.applyDataMigrations();
    binding.productName = "Old product";
    context.refreshProductNamesForBindings([binding]);
    assert.equal(writes.length, 2, role);
    await context.applyDataMigrations();
    context.refreshProductNamesForBindings([binding]);
    assert.equal(writes.length, 2);
  }
});

test("explicit save failures still surface to the user", () => {
  const save = source.match(/  async function saveData\(\) \{[\s\S]*?\n  }/)[0];
  assert.match(save, /showToast\("Erro ao salvar no Supabase\.", "error"\)/);
});
