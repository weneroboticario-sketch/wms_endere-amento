import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const navigation = source.slice(source.indexOf("  function returnFromTransferWork("), source.indexOf("  async function updateTransferStatus("));

function fixture(section = "finalizedTransfersSection", admin = true) {
  let active = section, warehouse = "VDCG", scroll = 650;
  const user = { id: "worker" }, timeouts = [], frames = [], renders = [];
  const transfer = { id: "one", responsibleId: "worker", status: "FINALIZADA" };
  const state = {};
  const context = vm.createContext({
    transferState: state, authState: { currentUser: user },
    getActiveTransferSectionId: () => active, activeWarehouseCode: () => warehouse,
    getActiveScreenId: () => "transferencias", isAdminOrSupervisor: () => admin,
    $: id => ["finalizedTransfersSection", "transferPanelSection", "myTransfersSection", "taskCenterSection"].includes(id) ? {} : null,
    window: { get scrollY() { return scroll; }, scrollTo: value => { scroll = value.top; }, requestAnimationFrame: fn => frames.push(fn), setTimeout: fn => timeouts.push(fn) },
    getTransferById: () => transfer, transferBelongsToActiveWarehouse: () => true,
    setStatus() {}, loadTransferItemsForTransfer: async () => [{}], markTaskAlertRead() {},
    getTransferWorkMode: () => "FINALIZADA", canStartTransferSeparation: () => false,
    transferItemsNeedStockSnapshot: () => false, getTransferItems: () => [{}],
    refreshTransferStockSuggestion: async () => {}, activateTransferTab: id => { active = id; },
    renderTransferWork() {}, isFinalTransferStatus: () => true,
    renderTransfers: options => renders.push(options)
  });
  vm.runInContext(navigation, context);
  return { context, state, renders, timeouts, frames, get active() { return active; }, get scroll() { return scroll; }, set warehouse(value) { warehouse = value; } };
}

test("back from transfer details returns exactly to the origin tab and scroll, including Finalizadas", async () => {
  for (const tab of ["finalizedTransfersSection", "transferPanelSection", "myTransfersSection", "taskCenterSection"]) {
    const f = fixture(tab);
    await f.context.openTransferWork("one", { viewOnly: true });
    assert.equal(f.active, "transferWorkSection");
    f.context.returnFromTransferWork();
    f.frames.shift()();
    assert.equal(f.active, tab);
    assert.equal(f.scroll, 650);
    assert.equal(f.renders[0].preserveFilters, true);
    assert.equal(f.state.workReturnView, null);
    f.timeouts.shift()(); // A delayed focus from opening must not jump back into hidden details.
    assert.equal(f.active, tab);
  }
});

test("reopening details preserves the original return destination", async () => {
  const f = fixture();
  await f.context.openTransferWork("one", { viewOnly: true });
  await f.context.openTransferWork("one", { viewOnly: true });
  f.context.returnFromTransferWork();
  assert.equal(f.active, "finalizedTransfersSection");
});

test("operator or changed scope falls back to an authorized list", async () => {
  const f = fixture("myTransfersSection", false);
  await f.context.openTransferWork("one", { viewOnly: true });
  f.warehouse = "VDAR";
  f.context.returnFromTransferWork();
  assert.equal(f.active, "myTransfersSection");
});

test("return rendering preserves filter controls while normal rendering continues refreshing them", () => {
  let refreshes = 0;
  const context = vm.createContext({
    $: () => ({}), invalidateTransferStatsCache() {}, renderTransferTabVisibility() {},
    getActiveTransferSectionId: () => "finalizedTransfersSection",
    renderTransferSelects: () => { refreshes++; }, renderFinalizedTransfers() {}
  });
  vm.runInContext(source.slice(source.indexOf("  function renderTransfers("), source.indexOf("  function getActiveTransferSectionId(")), context);
  context.renderTransfers({ preserveFilters: true });
  assert.equal(refreshes, 0);
  context.renderTransfers();
  assert.equal(refreshes, 1);
});
