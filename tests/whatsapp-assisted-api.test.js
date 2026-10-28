import test from "node:test";
import assert from "node:assert/strict";
import { assistedItemState, createAssistedGateway } from "../src/whatsapp-assisted-api.js";

test("RPC approval sends reviewed items, no self-assigned authority or warehouse override", async () => {
  const calls = [];
  const client = { rpc: async (name, payload) => { calls.push({ name, payload }); return { data: "request" }; } };
  const gateway = createAssistedGateway(client, { isCurrent: () => true, warehouse: "VDCG" });
  await gateway.approve({ id: "request", original: "Texto sintético", actor: "FORGED", lines: [{ sku: "54150", quantity: 2, sourceLine: 1, kind: "REPLENISHMENT", client: true, priority: 1 }] }, false);
  assert.equal(calls[0].name, "approve_whatsapp_assisted_request");
  assert.equal(calls[0].payload.actor, undefined);
  assert.equal(calls[0].payload.warehouse, undefined);
  assert.equal(calls[0].payload.reviewed_items[0].quantity, 2);
});

test("scope changes before or during a request prevent stale results", async () => {
  let current = false;
  let calls = 0;
  const client = { rpc: async () => { calls += 1; current = false; return { data: "stale" }; } };
  const gateway = createAssistedGateway(client, { isCurrent: () => current, warehouse: "VDCG" });
  await assert.rejects(gateway.start({ task_id: "task" }), /estoque mudou/);
  assert.equal(calls, 0);
  current = true;
  await assert.rejects(gateway.start({ task_id: "task" }), /estoque mudou/);
  assert.equal(calls, 1);
});

test("network and database failures are distinct; retries retain operation keys", async () => {
  const calls = [];
  let code = "";
  const gateway = createAssistedGateway({ rpc: async (name, payload) => { calls.push(payload); return { error: { code, message: "synthetic failure" } }; } }, { isCurrent: () => true, warehouse: "VDCG" });
  const item = { id: "item", revision: 3 };
  await assert.rejects(gateway.fulfill(item, 2, "same-key"), error => !error.confirmedFailure);
  code = "22023";
  await assert.rejects(gateway.fulfill(item, 2, "same-key"), error => error.confirmedFailure);
  assert.equal(calls[0].operation_key, calls[1].operation_key);
});

test("request completion requires quantity and validation; adjustments are separate", () => {
  assert.equal(assistedItemState({ kind: "REPLENISHMENT", requested: 5, attended: 4, task: { status: "CONCLUIDA" } }), "PARCIAL");
  assert.equal(assistedItemState({ kind: "REPLENISHMENT", requested: 5, attended: 5, task: { status: "AGUARDANDO_VALIDACAO" } }), "AGUARDANDO_VALIDACAO");
  assert.equal(assistedItemState({ kind: "ADJUSTMENT", verified_at: null, task: { status: "CONCLUIDA" } }), "VERIFICACAO");
  assert.equal(assistedItemState({ kind: "ADJUSTMENT", verified_at: "2026-10-28", task: { status: "CONCLUIDA" } }), "CONCLUIDA");
});
