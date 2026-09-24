import test from "node:test";
import assert from "node:assert/strict";
import { syntheticEmailFor } from "../src/auth.js";
import { escapeHtml, randomId } from "../src/utils.js";
import { nextRealtimeRetryDelay } from "../src/sync-control.js";

test("synthetic auth e-mail preserves the matricula login", function () {
  assert.equal(syntheticEmailFor(" 12 345 ", "wms.local"), "12345@wms.local");
  assert.equal(syntheticEmailFor("Pessoa.Teste", "wms.local"), "pessoa.teste@wms.local");
});

test("escapeHtml handles empty and dangerous values", function () {
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
  assert.equal(escapeHtml("<img src=x onerror='x'>"), "&lt;img src=x onerror=&#039;x&#039;&gt;");
});

test("randomId keeps prefix and produces unique identifiers", function () {
  const first = randomId("transfer");
  const second = randomId("transfer");
  assert.match(first, /^transfer-/);
  assert.notEqual(first, second);
});

test("realtime retries back off instead of looping aggressively", function () {
  assert.equal(nextRealtimeRetryDelay(1), 2000);
  assert.equal(nextRealtimeRetryDelay(2), 5000);
  assert.equal(nextRealtimeRetryDelay(3), 15000);
  assert.equal(nextRealtimeRetryDelay(20), 30000);
});
