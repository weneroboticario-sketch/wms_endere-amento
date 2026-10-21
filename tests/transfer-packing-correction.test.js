import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../script.js", import.meta.url), "utf8");
function fn(name, context = {}) {
  const match = new RegExp("  (?:async )?function " + name + "\\(").exec(source);
  assert.ok(match, name);
  const rest = source.slice(match.index);
  const next = /\n  (?:async )?function /.exec(rest.slice(1));
  return vm.runInNewContext("(" + rest.slice(0, next ? next.index + 1 : undefined).trim() + ")", context);
}

const transfer = { id: "transfer", responsibleId: "operator", status: "EM_MONTAGEM_CAIXA" };
const extra = { id: "extra", transferId: "transfer", sku: "88699", isExtra: true,
  requestedQty: 0, separatedQty: 0, packedQty: 10, extraQty: 5, observation: "Original note", updatedAt: "before" };

test("packed extras expose corrections only in CP Alamo, with existing stage and access rules", () => {
  const context = { IS_CP_ALAMO: true, getTransferById: () => transfer,
    isFinalTransferStatus: () => false, canCorrectTransferPacking: () => true };
  const render = fn("transferWorkItemActionsHtml", context);
  assert.match(render(extra, "MONTAGEM"), /data-transfer-edit-pack="extra"/);
  assert.match(render(extra, "MONTAGEM"), /data-transfer-remove-pack="extra"/);
  context.IS_CP_ALAMO = false;
  assert.equal(render(extra, "MONTAGEM"), "");
  context.IS_CP_ALAMO = true;
  context.canCorrectTransferPacking = () => false;
  assert.equal(render(extra, "MONTAGEM"), "");
  context.canCorrectTransferPacking = () => true;
  context.isFinalTransferStatus = () => true;
  assert.equal(render(extra, "MONTAGEM"), "");
});

test("only responsible operator or manager can correct an active packing task", () => {
  const context = { authState: { currentUser: { id: "operator" } }, isPurchasesUser: () => false,
    transferBelongsToActiveWarehouse: () => true, isFinalTransferStatus: () => false,
    getTransferWorkMode: () => "MONTAGEM", isAdminOrSupervisor: () => false };
  const allowed = fn("canCorrectTransferPacking", context);
  assert.equal(allowed(transfer), true);
  context.authState.currentUser.id = "other";
  assert.equal(allowed(transfer), false);
  context.isAdminOrSupervisor = () => true;
  assert.equal(allowed(transfer), true);
  context.getTransferWorkMode = () => "FINALIZACAO";
  assert.equal(allowed(transfer), false);
  context.getTransferWorkMode = () => "MONTAGEM";
  context.isPurchasesUser = () => true;
  assert.equal(allowed(transfer), false);
  context.isPurchasesUser = () => false;
  context.transferBelongsToActiveWarehouse = () => false;
  assert.equal(allowed(transfer), false);
});

test("packing selects the original SKU before a matching extra, without changing independent WMS", () => {
  const original = { ...extra, id: "original", isExtra: false };
  const context = { IS_CP_ALAMO: true, getTransferItems: () => [extra, original],
    isSameSku: (a, b) => Number(a) === Number(b) };
  const find = fn("findTransferItemForPacking", context);
  assert.equal(find("transfer", "088699").id, "original");
  context.IS_CP_ALAMO = false;
  assert.equal(find("transfer", "88699").id, "extra");
});

test("completed packing requires explicit correction, while partial scans remain possible", () => {
  const complete = fn("isPackedItemComplete");
  assert.equal(complete(extra), true);
  assert.equal(complete({ packedQty: 5, separatedQty: 5, requestedQty: 5 }), true);
  assert.equal(complete({ packedQty: 2, separatedQty: 5, requestedQty: 5 }), false);
  assert.equal(complete({ packedQty: 0, separatedQty: 5 }), false);
});

function saveContext() {
  const writes = [];
  const statuses = [];
  const context = {
    IS_CP_ALAMO: true, canCorrectTransferPacking: () => true,
    beginTransferAction: () => true, endTransferAction: () => {},
    isBoxQuantityItem: () => false, getTransferExpectedUnits: item => item.requestedQty,
    transferItemAuditDbFields: fn("transferItemAuditDbFields"),
    transferOperationalStatusForItem: item => item.isExtra ? "EXTRA" : "ENVIADO",
    transferDivergenceStatusForItem: item => item.divergenceType || "SEM_DIVERGENCIA",
    authState: { currentUser: { id: "operator", name: "Operator" } },
    saveTransferItemChecked: async (item, update) => writes.push({ item, update }),
    invalidateTransferStatsCache: () => {}, persistTransferLightSummary: async () => {},
    loadTransferData: async () => {}, loadTransferItemsForTransfer: async () => [],
    transferState: {}, clearTransferInputs: () => {}, renderTransfers: () => {},
    setStatus: (...args) => statuses.push(args), formatSupabaseError: error => error.message
  };
  return { context, writes, statuses };
}

test("correction replaces 10 with 5, keeps identity and appends audit reason atomically", async () => {
  const { context, writes } = saveContext();
  await fn("saveTransferItemOperationalQty", context)(extra, transfer, "MONTAGEM", 5, {}, "Double confirmation");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].item.id, "extra");
  assert.equal(writes[0].item.packedQty, 5);
  assert.equal(writes[0].item.requestedQty, 0);
  assert.equal(writes[0].update.quantidade_lacrada, 5);
  assert.equal(writes[0].update.quantidade_extra, 5);
  assert.equal(writes[0].update.divergence_type, "ITEM_EXTRA");
  assert.match(writes[0].update.observation, /Original note\nCorrecao/);
  assert.match(writes[0].update.observation, /Operator: 10 -> 5.*Double confirmation/);
  assert.equal(extra.packedQty, 10);
});

test("removing an extra zeros the packed quantity without deleting its record or history", async () => {
  const { context, writes } = saveContext();
  await fn("saveTransferItemOperationalQty", context)(extra, transfer, "MONTAGEM", 0, {}, "Not sent");
  assert.equal(writes[0].update.quantidade_lacrada, 0);
  assert.equal(writes[0].update.quantidade_extra, 0);
  assert.equal(writes[0].update.status, "NAO_ATENDIDO");
  assert.equal(writes[0].update.is_extra, true);
  assert.match(writes[0].update.observation, /10 -> 0/);
});

test("invalid quantities, missing reasons and unauthorized corrections never write", async () => {
  const { context, writes } = saveContext();
  const save = fn("saveTransferItemOperationalQty", context);
  for (const qty of [-1, NaN, Infinity]) await save(extra, transfer, "MONTAGEM", qty, {}, "Reason");
  await save(extra, transfer, "MONTAGEM", 5, {}, "");
  context.canCorrectTransferPacking = () => false;
  await save(extra, transfer, "MONTAGEM", 5, {}, "Reason");
  assert.equal(writes.length, 0);
});

test("concurrent item change is reported without claiming a successful correction", async () => {
  const { context, statuses } = saveContext();
  context.saveTransferItemChecked = async () => { throw new Error("Item alterado por outro colaborador"); };
  await fn("saveTransferItemOperationalQty", context)(extra, transfer, "MONTAGEM", 5, {}, "Reason");
  assert.ok(statuses.some(args => args[2] === "error"));
  assert.ok(!statuses.some(args => args[2] === "success"));
});

test("fresh server lookup prevents adding a duplicate extra and double-click writes", async () => {
  let release;
  let fetches = 0;
  let locked = false;
  const context = { IS_CP_ALAMO: true, transferState: { activeWorkMode: "MONTAGEM" },
    $: () => ({}), canCorrectTransferPacking: () => true,
    beginTransferAction: () => { if (locked) return false; locked = true; return true; },
    endTransferAction: () => { locked = false; }, activeWarehouseCode: () => "22796",
    fetchTransferItemsForTransfer: () => { fetches++; return new Promise(resolve => { release = resolve; }); },
    fromDbTransferItem: item => item, isSameSku: (a, b) => a === b,
    applyLocalTransferItemUpdate: () => {}, renderTransfers: () => {}, setStatus: () => {},
    formatSupabaseError: error => error.message };
  const add = fn("addExtraTransferItem", context);
  const first = add(transfer, "88699", 5, "Test", "MANUAL");
  await add(transfer, "88699", 5, "Test", "MANUAL");
  assert.equal(fetches, 1);
  release([{ ...extra, id: "original", isExtra: false }]);
  await first;
  assert.equal(context.transferState.selectedItemId, "original");
  assert.equal(locked, false);
});

function separationContext(quantity = "5") {
  const state = saveContext();
  const item = { ...extra, id: "original", isExtra: false, requestedQty: 5, separatedQty: 0, packedQty: 5 };
  Object.assign(state.context, {
    transferState: { items: [item] }, getTransferById: () => transfer,
    nowIso: () => "2026-10-21T15:00:00Z", formatQty: String, parseTransferQuantity: Number,
    requestVisualFields: async () => ({ quantity, reason: "Five physically separated units verified" })
  });
  return { ...state, item };
}

test("explicit separation correction keeps packed and requested quantities unchanged", async () => {
  const { context, writes, item } = separationContext();
  await fn("correctTransferSeparationForPacking", context)("original", {});
  assert.equal(writes.length, 1);
  assert.equal(writes[0].update.quantidade_separada, 5);
  assert.equal(writes[0].item.packedQty, 5);
  assert.equal(writes[0].item.requestedQty, 5);
  assert.equal(writes[0].update.quantidade_lacrada, undefined);
  assert.equal(writes[0].update.divergence_type, "");
  assert.match(writes[0].update.observation, /Correcao da separacao.*0 -> 5.*physically/);
  assert.equal(item.separatedQty, 0);
});

test("separation below the packed quantity is rejected rather than discarding boxed goods", async () => {
  const { context, writes, statuses } = separationContext("3");
  await fn("correctTransferSeparationForPacking", context)("original", {});
  assert.equal(writes.length, 0);
  assert.ok(statuses.some(args => args[2] === "error"));
});

test("cancelled, unreasoned or unauthorized separation corrections never write", async () => {
  const { context, writes } = separationContext();
  const correct = fn("correctTransferSeparationForPacking", context);
  context.requestVisualFields = async () => null;
  await correct("original", {});
  context.requestVisualFields = async () => ({ quantity: "5", reason: " " });
  await correct("original", {});
  context.canCorrectTransferPacking = () => false;
  await correct("original", {});
  assert.equal(writes.length, 0);
});

test("invoice handoff explains inconsistent quantities without updating data or totals", async () => {
  const statuses = [];
  let renders = 0;
  const context = {
    IS_CP_ALAMO: true, transferState: { activeTransferId: "transfer" },
    getTransferById: () => transfer, isFinalTransferStatus: () => false,
    getTransferItems: () => [{ ...extra, packedQty: 5, separatedQty: 0 }],
    renderTransferWork: () => { renders++; },
    formatQty: String, setStatus: (...args) => statuses.push(args)
  };
  await fn("finishPacking", context)();
  assert.equal(context.transferState.selectedItemId, "extra");
  assert.equal(renders, 1);
  assert.match(statuses[0][1], /SKU 88699.*5 na caixa.*0 separado.*Remover da caixa/);
  assert.equal(statuses[0][2], "warning");
});
