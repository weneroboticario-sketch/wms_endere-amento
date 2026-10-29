import test from "node:test";
import assert from "node:assert/strict";
import { caixaQueueView, caixaBucket } from "../src/caixa-queue-view.js";

const now = new Date("2026-10-29T16:00:00Z");
const row = (id, data = {}) => ({ id, sku: "48060", kind: "ADJUSTMENT", quantity: 2, attended: 0, requested_by: "Caixa A", status: "PENDENTE", created_at: "2026-10-29T13:00:00Z", updated_at: "2026-10-29T14:00:00Z", ...data });
const rows = [row("adjustment"), row("client", { kind: "PRODUCT", customer_service: true, quantity: 1, created_at: "2026-10-29T15:00:00Z" }), row("verification", { status: "EM_VERIFICACAO", claimed_by: "worker", claimed_by_name: "Responsável" }), row("awaiting", { status: "AGUARDANDO_CONFIRMACAO_CAIXA", resolution_notes: "feito" }), row("done", { status: "CONCLUIDO", confirmed_at: "2026-10-29T14:00:00Z" }), row("no-stock", { kind: "PRODUCT", status: "SEM_ESTOQUE" }), row("cancelled", { status: "CANCELADO" })];

test("queue counters partition active requests and only confirmed completion counts as completed", () => {
  const view = caixaQueueView(rows, {}, now);
  assert.deepEqual(view.counts, { all: 4, client: 1, urgent: 1, verification: 2, completed: 1, today: 1, history: 3 });
  assert.equal(view.counts.all, view.counts.client + view.counts.urgent + view.counts.verification);
  assert.ok(view.visible.some(request => request.id === "awaiting"));
  assert.equal(caixaBucket(rows[3]), "verification");
});
test("client pending comes first regardless of quantity; equal priority uses arrival order without merging duplicate SKU", () => {
  const before = JSON.stringify(rows);
  const view = caixaQueueView(rows, {}, now);
  assert.equal(view.visible[0].id, "client");
  assert.equal(view.visible.filter(request => request.sku === "48060").length, 4);
  assert.equal(JSON.stringify(rows), before);
  const ordered = caixaQueueView([row("later", { created_at: "2026-10-29T15:00:00Z" }), row("earlier")], {}, now);
  assert.deepEqual(ordered.visible.map(request => request.id), ["earlier", "later"]);
});
test("tabs, accent-insensitive search, kind, status and responsible filters combine without changing counts", () => {
  assert.deepEqual(caixaQueueView(rows, { tab: "verification", search: "responsavel", owner: "worker", status: "EM_VERIFICACAO", kind: "ADJUSTMENT" }, now).visible.map(request => request.id), ["verification"]);
  assert.equal(caixaQueueView(rows, { tab: "completed" }, now).visible.length, 1);
  assert.equal(caixaQueueView(rows, { tab: "history" }, now).visible.length, 3);
  assert.equal(caixaQueueView(rows, { search: "48060", owner: "unassigned" }, now).visible.length, 3);
  assert.equal(caixaQueueView([], {}, now).counts.all, 0);
  assert.equal(caixaQueueView(rows, { search: "inexistente" }, now).visible.length, 0);
});
test("completed today follows Cuiaba calendar and never counts pending confirmation as definitive completion", () => {
  const sample = [row("previous-day", { confirmed_at: "2026-10-29T02:00:00Z" }), row("today", { confirmed_at: "2026-10-29T04:01:00Z" }), row("waiting", { status: "AGUARDANDO_CONFIRMACAO_CAIXA" })];
  assert.equal(caixaQueueView(sample, {}, now).counts.today, 1);
});
