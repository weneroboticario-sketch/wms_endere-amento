import assert from "node:assert/strict";
import test from "node:test";
import { isStoreStaffRole, normalizeAccessRequestRole } from "../src/access-control.js";

test("access approval preserves an allowed requested role", () => {
  assert.equal(normalizeAccessRequestRole("OPERADOR"), "OPERADOR");
  assert.equal(normalizeAccessRequestRole("atendente"), "ATENDENTE");
});

test("access approval falls back safely for an unknown role", () => {
  assert.equal(normalizeAccessRequestRole("ADMINISTRADOR"), "OPERADOR");
  assert.equal(normalizeAccessRequestRole(""), "OPERADOR");
  assert.equal(normalizeAccessRequestRole(null), "OPERADOR");
});

test("supervisor-managed store roles include operators and attendants only", () => {
  assert.equal(isStoreStaffRole("OPERADOR"), true);
  assert.equal(isStoreStaffRole("atendente"), true);
  assert.equal(isStoreStaffRole("SUPERVISOR"), false);
  assert.equal(isStoreStaffRole("ADMINISTRADOR"), false);
});
