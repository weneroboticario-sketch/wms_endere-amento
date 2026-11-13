import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const creation = source.slice(source.indexOf("  async function createReplenishmentRequest("), source.indexOf("  async function insertReplenishmentRequest("));
const display = source.slice(source.indexOf("  function displayReplenishmentStatus("), source.indexOf("  function statusBadgeClass("));

function fixture(status, confirmed = true) {
  const existing = Object.freeze({ id: "existing", codigo_material: "01314", warehouse_code: "VDCG", status, quantidade_solicitada: 4, responsavel_nome: "Estoquista", created_at: "2026-11-05T12:00:00Z" });
  const state = { requests: [existing], lastCreatedSignature: "VDCG:cashier:01314:4:NORMAL", lastCreatedAt: Date.now() };
  const actions = new Map();
  const warnings = [];
  let number = 0, inserts = 0, warehouse = "VDCG";
  const context = vm.createContext({
    replenishmentState: state, authState: { currentUser: { id: "cashier", name: "Caixa" } },
    isSupabaseReady: () => true, ensureActiveWarehouse: () => true, activeWarehouseCode: () => warehouse,
    normalizeSku: value => value, normalizeText: value => String(value || ""), normalizeReplenishmentPriority: () => "NORMAL",
    getOpenRequestBySku: async () => existing, window: { confirm: message => { warnings.push(message); return confirmed; } },
    formatQty: String, lookupReplenishmentProduct: () => ({ name: "Produto" }),
    getStockSuggestion: async () => ({}), enrichReplenishmentProductWithStock: product => product,
    isMissingStockTableError: () => false, isMissingColumnError: () => false, recordPerformanceError() {},
    nowIso: () => new Date().toISOString(), createIdempotencyKey: () => "action-" + (++number),
    findReplenishmentByIdempotencyKey: async key => actions.get(key), findProductName: () => "Produto",
    randomId: () => "new-" + (++number), isDuplicateKeyError: () => false,
    insertReplenishmentRequest: async (row, key) => { inserts++; actions.set(key, row); return { data: row }; },
    fromDbReplenishmentRequest: row => row, upsertById: (rows, row) => rows.push(row),
    createReplenishmentNotification() {}, loadTaskCenterData: async () => {}
  });
  vm.runInContext(creation + display, context);
  return { context, state, existing, warnings, get inserts() { return inserts; }, warehouse(value) { warehouse = value; } };
}

test("duplicate warning identifies queued or separating request; cancellation leaves it untouched", async () => {
  for (const [status, label] of [["PENDENTE","Na fila"],["EM_SEPARACAO","Em separacao"]]) {
    const f = fixture(status, false);
    assert.equal(await f.context.createReplenishmentRequest({ codigoMaterial: "01314", requestedQty: 4 }), null);
    assert.ok(f.warnings[0].includes(label));
    assert.ok(f.warnings[0].includes("4 un."));
    assert.equal(f.inserts, 0);
    assert.equal(f.state.requests.length, 1);
    assert.equal(f.state.requests[0], f.existing);
  }
});

test("confirming creates independent requests even within 15 seconds while preserving original assignment and quantities", async () => {
  const f = fixture("EM_SEPARACAO");
  const first = await f.context.createReplenishmentRequest({ codigoMaterial: "01314", requestedQty: 4, idempotencyKey: "one" });
  const second = await f.context.createReplenishmentRequest({ codigoMaterial: "01314", requestedQty: 4, idempotencyKey: "two" });
  assert.notEqual(first.id, second.id);
  assert.equal(f.inserts, 2);
  assert.equal(f.warnings.length, 2);
  assert.equal(first.status, "PENDENTE");
  assert.equal(first.requestedQty, 4);
  assert.equal(f.existing.status, "EM_SEPARACAO");
  assert.equal(f.existing.quantidade_solicitada, 4);
  assert.equal(f.existing.responsavel_nome, "Estoquista");
  const retry = await f.context.createReplenishmentRequest({ codigoMaterial: "01314", requestedQty: 4, idempotencyKey: "two" });
  assert.equal(retry.id, second.id);
  assert.equal(f.inserts, 2);
});

test("warehouse change while checking existing requests prevents creation", async () => {
  const f = fixture("PENDENTE");
  f.context.getOpenRequestBySku = async () => { f.warehouse("VDAR"); return f.existing; };
  await assert.rejects(f.context.createReplenishmentRequest({ codigoMaterial: "01314", requestedQty: 4 }), /estoque mudou/);
  assert.equal(f.inserts, 0);
});

test("duplicate lookup recognizes padded SKUs and uses the latest open request", async () => {
  const context = vm.createContext({
    stockSkuQueryValues: () => ["1314", "01314"],
    normalizeSkuKey: value => String(value).replace(/^0+/, ""),
    getOpenRequestsBySkus: async skus => {
      assert.ok(skus.includes("01314"));
      return { "1314": {id:"old",codigo_material:"1314",created_at:"2026-11-04"}, "01314": {id:"new",codigo_material:"01314",created_at:"2026-11-05"} };
    }
  });
  vm.runInContext(source.slice(source.indexOf("  async function getOpenRequestBySku("), source.indexOf("  function groupStockPositionsBySku(")), context);
  assert.equal((await context.getOpenRequestBySku("1314")).id, "new");
});
