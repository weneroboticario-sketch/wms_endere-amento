import assert from "node:assert/strict";
import test from "node:test";
import {
  compareReplenishmentQueueItems,
  isReplenishmentVisibleInActiveQueue,
  normalizeReplenishmentPriority
} from "../src/replenishment.js";

test("replenishment priority accepts only NORMAL and CLIENTE", () => {
  assert.equal(normalizeReplenishmentPriority("cliente"), "CLIENTE");
  assert.equal(normalizeReplenishmentPriority("NORMAL"), "NORMAL");
  assert.equal(normalizeReplenishmentPriority("URGENTE"), "NORMAL");
});

test("client requests are ordered first inside the same status", () => {
  const requests = [
    { id: "normal", status: "PENDENTE", prioridade: "NORMAL", updatedAt: "2026-10-01T12:00:00Z" },
    { id: "client", status: "PENDENTE", prioridade: "CLIENTE", updatedAt: "2026-10-01T11:00:00Z" }
  ];
  assert.deepEqual(requests.sort(compareReplenishmentQueueItems).map((item) => item.id), ["client", "normal"]);
});

test("active queue hides completed, delivered and cancelled requests", () => {
  ["CONCLUIDO", "ENTREGUE_NA_LOJA", "CANCELADO"].forEach((status) => {
    assert.equal(isReplenishmentVisibleInActiveQueue({ status }), false);
  });
  ["PENDENTE", "EM_SEPARACAO", "ATENDIDO_PARCIAL", "SEM_ESTOQUE"].forEach((status) => {
    assert.equal(isReplenishmentVisibleInActiveQueue({ status }), true);
  });
});
