import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { findPendingOwnDuplicate, summarizeOpenReplenishment } from "../src/replenishment-duplicates.js";

const source = fs.readFileSync(new URL("../script.js", import.meta.url), "utf8");
const creation = source.slice(source.indexOf("  async function createReplenishmentRequest("), source.indexOf("  async function insertReplenishmentRequest("));
const display = source.slice(source.indexOf("  function displayReplenishmentStatus("), source.indexOf("  function statusBadgeClass("));

function fixture(status, confirmed = true, requesterId = "other") {
  const existing = Object.freeze({ id: "existing", codigo_material: "01314", warehouse_code: "VDCG", status, quantidade_solicitada: 4, quantidade_pendente: 4, quantidade_atendida: 0, solicitado_por_id: requesterId, solicitado_por_nome: requesterId === "cashier" ? "Caixa" : "Outro colaborador", responsavel_nome: "Estoquista", created_at: "2026-11-05T12:00:00Z" });
  const state = { requests: [existing], lastCreatedSignature: "VDCG:cashier:01314:4:NORMAL", lastCreatedAt: Date.now() };
  const actions = new Map();
  const warnings = [];
  let number = 0, inserts = 0, warehouse = "VDCG";
  const context = vm.createContext({
    replenishmentState: state, authState: { currentUser: { id: "cashier", name: "Caixa" } },
    isSupabaseReady: () => true, ensureActiveWarehouse: () => true, activeWarehouseCode: () => warehouse,
    normalizeSku: value => value, normalizeText: value => String(value || ""), normalizeReplenishmentPriority: () => "NORMAL",
    getOpenRequestBySku: async () => existing,
    getOpenReplenishmentRequestsForSku: async () => [existing], findPendingOwnDuplicate, summarizeOpenReplenishment,
    window: { confirm: message => { warnings.push(message); return confirmed; } },
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

test("different coworker can request an additional quantity after explicit confirmation; retry preserves same action", async () => {
  const f=fixture("EM_SEPARACAO");
  const created=await f.context.createReplenishmentRequest({ codigoMaterial:"01314", requestedQty:4, idempotencyKey:"one" });
  const retry=await f.context.createReplenishmentRequest({ codigoMaterial:"01314", requestedQty:4, idempotencyKey:"one" });
  assert.equal(retry.id,created.id);
  assert.equal(f.inserts,1);
  assert.equal(f.warnings.length,1);
  assert.match(f.warnings[0],/Outro colaborador/);
  assert.equal(f.existing.status,"EM_SEPARACAO");
  assert.equal(f.existing.quantidade_solicitada,4);
});

test("the same requester cannot place an identical pending request even after confirmation",async()=>{
  const f=fixture("PENDENTE",true,"cashier");
  await assert.rejects(f.context.createReplenishmentRequest({codigoMaterial:"01314",requestedQty:4,idempotencyKey:"separate-action"}),{code:"DUPLICATE_PENDING_REPLENISHMENT"});
  assert.equal(f.inserts,0);
  assert.equal(f.warnings.length,0);
  assert.equal(f.state.requests.length,1);
});

test("warehouse change while checking existing requests prevents creation", async () => {
  const f = fixture("PENDENTE");
  f.context.getOpenReplenishmentRequestsForSku = async () => { f.warehouse("VDAR"); return [f.existing]; };
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
