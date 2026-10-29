import test from "node:test";
import assert from "node:assert/strict";
import { interpretWhatsAppMessage } from "../src/whatsapp-message.js";
import { approveAssistedDraft, fulfillAssistedLine, assistedQueue } from "../src/whatsapp-assisted-workflow.js";

const draft = (id, original) => ({ id, ...interpretWhatsAppMessage(original) });

test("one origin preserves all lines; four fulfilled items do not complete five", () => {
  const requests = [];
  const request = approveAssistedDraft(requests, draft("request-1", "83823 A 6 UN\n95830 B 4 UN\n85828 C 2 UN\n58716 D 2 UN\n83844 E 1 UN"));
  for (const line of request.lines.slice(0, 4)) {
    fulfillAssistedLine(request, { lineId: line.id, amount: line.quantity, operationId: line.id, expectedRevision: request.revision });
  }
  assert.equal(requests.length, 1);
  assert.equal(request.status, "PARTIAL");
  assert.equal(assistedQueue(requests).length, 1);
  assert.equal(request.history.length, 5);
  fulfillAssistedLine(request, { lineId: request.lines[4].id, amount: 1, operationId: "last", expectedRevision: 4 });
  assert.equal(request.status, "FULFILLED");
});

test("partial quantity tracks remaining units and rejects excess or stale revision", () => {
  const request = approveAssistedDraft([], draft("partial", "54150 A 10 UN"));
  const operation = { lineId: request.lines[0].id, amount: 4, operationId: "op-1", expectedRevision: 0 };
  fulfillAssistedLine(request, operation);
  fulfillAssistedLine(request, operation);
  assert.equal(request.lines[0].attended, 4);
  assert.equal(request.lines[0].pending, 6);
  assert.equal(request.history.length, 2);
  assert.throws(() => fulfillAssistedLine(request, { ...operation, operationId: "stale" }), /atualize/);
  assert.throws(() => fulfillAssistedLine(request, { ...operation, operationId: "excess", expectedRevision: 1, amount: 7 }), /saldo pendente/);
});

test("approval is idempotent and repeated text requires explicit review", () => {
  const requests = [];
  const first = draft("first", "54150 A 2 UN");
  const request = approveAssistedDraft(requests, first);
  assert.equal(approveAssistedDraft(requests, first), request);
  assert.equal(requests.length, 1);
  assert.throws(() => approveAssistedDraft(requests, draft("another", first.original)), /Possível duplicidade/);
  approveAssistedDraft(requests, draft("another", first.original), { duplicateReviewed: true });
  assert.equal(requests.length, 2);
});

test("customer priority spans requests and adjustments cannot execute fulfillment", () => {
  const requests = [];
  approveAssistedDraft(requests, draft("routine", "54150 A 2 UN"));
  approveAssistedDraft(requests, draft("client", "54151 A 1 UN CLIE"));
  const adjustment = approveAssistedDraft(requests, draft("adjustment", "Ajuste 86227 2 unidades"));
  assert.equal(assistedQueue(requests)[0].sku, "54151");
  assert.throws(() => fulfillAssistedLine(adjustment, { lineId: adjustment.lines[0].id, amount: 1, operationId: "no-movement", expectedRevision: 0 }), /verificação/);
  assert.equal(adjustment.lines[0].attended, 0);
});

test("invalid and empty requests cannot be approved and edited quantities are retained", () => {
  assert.throws(() => approveAssistedDraft([], draft("empty", "feito")), /sem itens/);
  const requestDraft = draft("invalid", "54150 A 75ml");
  assert.throws(() => approveAssistedDraft([], requestDraft), /quantidades/);
  requestDraft.lines[0].quantity = 3;
  const request = approveAssistedDraft([], requestDraft);
  requestDraft.lines[0].quantity = 99;
  assert.equal(request.lines[0].quantity, 3);
});
