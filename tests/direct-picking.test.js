import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../script.js", import.meta.url), "utf8");
const guidance = source.slice(source.indexOf("  function transferStockGuidanceHtml("), source.indexOf("  function transferWorkItemActionsHtml("));
const card = source.slice(source.indexOf("  function renderCurrentTransferItem("), source.indexOf("  function emptyCurrentItemHtml("));
test("pending list has a single set of balances and withdrawal quantities", () => {
  const render = source.slice(source.indexOf("  function transferWorkItemCardHtml("), source.indexOf("  function transferStockGuidanceHtml("));
  const item = { id: "one", sku: "94135", description: "ESTJ MALBEC NAT/26", unit: "UN", stockAlert: true, stockAlertMessage: "Produto encontrado na CAPTAÇÃO sem localização.", captureAvailable: 47, storeAvailable: 111, suggestedCaptureQty: 47, suggestedStoreQty: 9 };
  const context = { item, transferState: { selectedItemId: "", activeWorkMode: "SEPARACAO" },
    itemQtyNumbers: () => ({ requested: 56, separated: 0, pendingSeparation: 56 }),
    transferItemStatusLabel: () => "Pendente", displayTransferStatusLabel: String,
    shortProductName: String, transferLocationStatus: () => ({ hasLocation: false, warning: "Sem localização cadastrada." }),
    unique: values => [...new Set(values)], normalizeText: String, escapeHtml: String,
    formatQty: String, transferStockValueLabel: String, transferWorkItemActionsHtml: () => "" };
  const html = vm.runInNewContext(render + ";transferWorkItemCardHtml(item);", context);
  for (const label of ["Solicitado", "Saldo Captação", "Saldo Loja", "Retirar da Captação", "Retirar da Loja"]) assert.equal(html.split(label).length - 1, 1, label);
  assert.equal(html.match(/Pendente/g).length, 1);
  assert.equal(html.match(/localização/g).length, 1);
  assert.ok(!html.includes("Não pego"));
  assert.ok(!html.includes("Faltante"));
});
test("current picking shows stock and withdrawal once without repeated address", () => {
  const element = {};
  const item = { id: "one", sku: "94665", description: "Produto", unit: "UN", captureAvailable: 45, storeAvailable: 20, suggestedCaptureQty: 20, suggestedStoreQty: 0 };
  const context = { transferState: { items: [item], selectedItemId: "one", activeWorkMode: "SEPARACAO" },
    $: () => element, escapeHtml: String, formatQty: String, normalizeText: String,
    transferStockValueLabel: String, itemQtyNumbers: () => ({ requested: 20, separated: 0, pendingSeparation: 20 }),
    displayTransferStatusLabel: String, transferItemStatusLabel: () => "Pendente",
    transferCompactLocationLabel: () => "R02-RK01-L01-C", isBoxQuantityItem: () => false };
  vm.runInNewContext(guidance + card + ";renderCurrentTransferItem();", context);
  assert.equal(element.innerHTML.match(/R02-RK01-L01-C/g).length, 1);
  assert.equal(element.innerHTML.match(/Pendente/g).length, 1);
  for (const label of ["Quantidade solicitada", "Saldo Captação", "Saldo Loja", "Retirar da Captação", "Retirar da Loja"]) assert.ok(element.innerHTML.includes(label), label);
  assert.ok(!element.innerHTML.includes("<span>Status"));
  assert.ok(!element.innerHTML.includes("Faltam"));
  item.quantityShortage = 3;
  vm.runInNewContext(guidance + card + ";renderCurrentTransferItem();", context);
  assert.ok(element.innerHTML.includes("Faltam 3 UN"));
});
