import test from "node:test";
import assert from "node:assert/strict";
import { resolveTransferUnit, transferSearchText, transferTimeline } from "../src/transfer-central.js";

const units = [
  { code: "12423", loja: "TLS1", name: "Loja Tres Lagoas", active: true },
  { code: "22749", loja: "DRD1", name: "Loja Dourados", active: true },
  { code: "22796", loja: "VDDRD", name: "Centro Dourados", active: true }
];
test("unit lookup uses exact code, nickname and normalized name", () => {
  for (const token of ["12423", "tls1", "Loja Tres Lagoas"]) assert.equal(resolveTransferUnit(units, token), units[0]);
  assert.equal(resolveTransferUnit(units, "DRD1"), units[1]);
});
test("ambiguous, inactive and reverse substring matches are rejected", () => {
  assert.equal(resolveTransferUnit(units, "Dourados"), null);
  assert.equal(resolveTransferUnit([...units, { code: "12423" }], "12423"), null);
  assert.equal(resolveTransferUnit([{ ...units[0], active: false }], "TLS1"), null);
  assert.equal(resolveTransferUnit(units, "12423garbage"), null);
  assert.equal(resolveTransferUnit(units, ""), null);
});
test("search includes full transfer identity, invoice, responsible and registered alias", () => {
  const text = transferSearchText({ code: "TRF-20261020-133914-23696-12423", destinationStoreCode: "12423", responsibleName: "Joao", invoiceNumber: "502" }, units);
  for (const token of ["trf-20261020-133914-23696-12423", "tls1", "502", "joao"]) assert.ok(text.includes(token));
});
test("timeline only contains persisted valid timestamps in chronological order", () => {
  const timeline = transferTimeline({ createdAt: "2026-10-20T12:00:00Z", separationStartedAt: "invalid", packingStartedAt: "2026-10-20T13:00:00Z" });
  assert.equal(timeline.length, 2);
  assert.equal(timeline[0][0], "Solicitacao criada");
  assert.equal(transferTimeline({}).length, 0);
});
