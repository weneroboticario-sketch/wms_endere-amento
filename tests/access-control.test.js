import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAccessRequestRole } from "../src/access-control.js";

test("access approval preserves an allowed requested role", () => {
  assert.equal(normalizeAccessRequestRole("OPERADOR"), "OPERADOR");
  assert.equal(normalizeAccessRequestRole("atendente"), "ATENDENTE");
});

test("access approval falls back safely for an unknown role", () => {
  assert.equal(normalizeAccessRequestRole("ADMINISTRADOR"), "OPERADOR");
  assert.equal(normalizeAccessRequestRole(""), "OPERADOR");
  assert.equal(normalizeAccessRequestRole(null), "OPERADOR");
});
