import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../script.js", import.meta.url), "utf8");

test("cadastro carrega unidades antes de usuarios e valida antes de gravar", () => {
  const screen = source.slice(source.indexOf('if (screenId === "usuarios") {'), source.indexOf('if (screenId === "transferencias") {'));
  assert.ok(screen.indexOf("await ensureWarehousesLoaded()") < screen.indexOf("ensureUsersLoaded"));
  const save = source.slice(source.indexOf("async function saveUserFromForm()"), source.indexOf("function resetUserForm()"));
  assert.ok(save.indexOf("await ensureWarehousesLoaded()") < save.indexOf("invokeUserAdministration"));
  assert.ok(save.includes("warehouseExistsAndActive(defaultWarehouseCode)"));
});

test("formulario substitui selecao obsoleta e preserva somente unidades validas", () => {
  const form = source.slice(source.indexOf("function renderUserWarehouseInputs(user)"), source.indexOf("function renderUserSupervisorOptions(user)"));
  assert.ok(form.includes("if (warehouse.active === false) return false"));
  assert.ok(form.includes("validCodes.indexOf(defaultCode) < 0"));
  assert.ok(form.includes("validCodes.indexOf(activeWarehouseCode()) >= 0"));
  assert.ok(form.includes("allowed = allowed.filter"));
  const render = source.slice(source.indexOf("function renderUsers()"), source.indexOf("function renderUsers()") + 750);
  assert.ok(render.includes("renderUserWarehouseInputs"));
  assert.ok(!render.includes("resetUserForm"));
});

test("selecao VDCG antiga vira 14177 sem misturar as unidades", () => {
  const form = source.slice(source.indexOf("function renderUserWarehouseInputs(user)"), source.indexOf("function renderUserSupervisorOptions(user)"));
  const elements = { userDefaultWarehouseInput: {}, userAllowedWarehousesInput: {} };
  const context = {
    $: id => elements[id],
    warehouseState: { warehouses: [{ code: "14177", name: "VDTLS", active: true }, { code: "22796", name: "VDDRD", active: true }, { code: "VDCG", name: "Legado", active: false }] },
    isGlobalAdmin: () => true, isSupervisor: () => false,
    activeWarehouseCode: () => "14177", normalizeWarehouseCode: value => String(value || "").toUpperCase(),
    parseWarehouseCodes: value => value || [], escapeHtml: value => String(value), renderUserSupervisorOptions: () => {}
  };
  runInNewContext(form + ';renderUserWarehouseInputs({defaultWarehouseCode:"VDCG",allowedWarehouseCodes:["VDCG"]});', context);
  assert.equal(elements.userDefaultWarehouseInput.value, "14177");
  assert.ok(elements.userDefaultWarehouseInput.innerHTML.includes("22796"));
  assert.ok(!elements.userDefaultWarehouseInput.innerHTML.includes("VDCG"));
  assert.ok(elements.userAllowedWarehousesInput.innerHTML.includes('value="14177" checked'));
});
