import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const script = await readFile(new URL("../script.js", import.meta.url), "utf8");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("ATENDENTE can navigate only to SKU consultation and replenishment", () => {
  assert.match(script, /consultaSku: \[[^\]]*"ATENDENTE"[^\]]*\]/);
  assert.match(script, /reposicao: \[[^\]]*"ATENDENTE"[^\]]*\]/);
  ["dashboard", "bipagem", "etiquetas", "exportar", "importar", "transferencias", "usuarios", "baseEstoque"].forEach((screen) => {
    const line = script.match(new RegExp(`${screen}: \\[[^\\]]*\\]`));
    assert.ok(line, `missing permission declaration for ${screen}`);
    assert.doesNotMatch(line[0], /ATENDENTE/);
  });
});

test("attendant replenishment view contains only requests created by the current user", () => {
  assert.match(script, /function getReplenishmentRequestsForCurrentView\(\)[\s\S]*?request\.solicitadoPorId === authState\.currentUser\.id/);
  assert.match(script, /limited\.map\(attendantView \? attendantReplenishmentCardHtml : replenishmentCardHtml\)/);
  assert.match(script, /if \(isAttendant\(\)\) \{[\s\S]*?nao alterar a fila operacional/);
});

test("request forms expose validated client priority", () => {
  assert.match(html, /name="replenishmentPriority"[^>]*value="CLIENTE"/);
  assert.match(html, /name="suggestionPriority"[^>]*value="CLIENTE"/);
  assert.match(script, /priority: priority/);
  assert.match(script, /normalizeReplenishmentPriority\(data\.priority\)/);
  assert.match(script, /replenishment-priority-badge/);
});

test("access request and user management expose the attendant profile", () => {
  assert.match(html, /id="requestRoleInput"[\s\S]*?value="ATENDENTE"/);
  assert.match(html, /id="userRoleInput"[\s\S]*?value="ATENDENTE"/);
  assert.match(script, /role_requested: requestedRole/);
});
