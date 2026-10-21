import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../script.js", import.meta.url), "utf8");
const renderSource = source.slice(source.indexOf("  function renderUserWarehouseInputs("), source.indexOf("  function renderUserSupervisorOptions("));
const refreshSource = source.slice(source.indexOf("  function refreshUserFormWarehouseOptions("), source.indexOf("  async function refreshUsersFromServer("));

test("refresh replaces pre-login warehouse options while preserving form selections", () => {
  const fields = {
    userDefaultWarehouseInput: { value: "VDAR", innerHTML: "VDCG" },
    userAllowedWarehousesInput: { innerHTML: "VDCG" },
    userSupervisorInput: { value: "supervisor-vdar" },
    userRoleInput: { value: "OPERADOR" },
    userGlobalAdminInput: { checked: false }
  };
  let supervisor;
  const context = vm.createContext({
    $: id => fields[id],
    warehouseState: { warehouses: ["VDCG", "VDAR", "VDSI", "VDCO"].map(code => ({ code, name: code, active: true })).concat({ code: "INATIVO", active: false }) },
    isGlobalAdmin: () => true,
    isSupervisor: () => false,
    activeWarehouseCode: () => "VDAR",
    normalizeWarehouseCode: code => code,
    parseWarehouseCodes: codes => codes || [],
    selectedUserWarehouseCodes: () => ["VDAR", "VDCO"],
    escapeHtml: value => value,
    renderUserSupervisorOptions: user => { supervisor = user; }
  });
  vm.runInContext(renderSource + refreshSource, context);
  context.refreshUserFormWarehouseOptions();
  for (const code of ["VDCG", "VDAR", "VDSI", "VDCO"]) {
    assert.match(fields.userDefaultWarehouseInput.innerHTML, new RegExp(code));
    assert.match(fields.userAllowedWarehousesInput.innerHTML, new RegExp(code));
  }
  assert.doesNotMatch(fields.userDefaultWarehouseInput.innerHTML, /INATIVO/);
  assert.match(fields.userAllowedWarehousesInput.innerHTML, /value="VDCO" checked/);
  assert.equal(fields.userDefaultWarehouseInput.value, "VDAR");
  assert.equal(supervisor.supervisorId, "supervisor-vdar");
  context.isGlobalAdmin = () => false;
  context.isSupervisor = () => true;
  context.refreshUserFormWarehouseOptions();
  assert.doesNotMatch(fields.userAllowedWarehousesInput.innerHTML, /VDCG|VDSI|VDCO/);
  assert.match(fields.userAllowedWarehousesInput.innerHTML, /value="VDAR" checked disabled/);
  assert.equal(fields.userDefaultWarehouseInput.disabled, true);
});
