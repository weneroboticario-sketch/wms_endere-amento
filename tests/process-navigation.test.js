import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PROCESS_GROUPS, groupForScreen, permittedProcessGroups } from "../src/process-navigation.js";

test("every existing sidebar route belongs to exactly one process area", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const routes = [...new Set([...html.matchAll(/data-screen="([^"]+)"/g)].map(match => match[1]))];
  const grouped = PROCESS_GROUPS.flatMap(group => group.screens);
  assert.equal(new Set(grouped).size, grouped.length);
  assert.deepEqual([...grouped].sort(), routes.sort());
  assert.equal(PROCESS_GROUPS.length, 6);
  assert.equal(groupForScreen("fiscalWorkflow").id, "transfers");
  assert.equal(groupForScreen("expedition").id, "transfers");
  assert.equal(groupForScreen("exportar").id, "stock");
});

test("six roles get only currently authorized routes and administration is not implicit", () => {
  for (const role of ["ADMINISTRADOR", "SUPERVISOR", "OPERADOR", "COMPRAS", "GERENTE", "FINANCEIRO"]) {
    const allowed = new Set(["consultaSku", "transferencias"]);
    const groups = permittedProcessGroups(role, screen => allowed.has(screen));
    assert.deepEqual(groups.map(group => group.id), ["stock", "transfers"]);
    assert.deepEqual(groups.flatMap(group => group.screens).sort(), [...allowed].sort());
    assert.ok(!groups.some(group => group.id === "admin"));
  }
});

test("attendant, logged-out and unknown roles retain existing navigation", () => {
  for (const role of ["ATENDENTE", undefined, "UNKNOWN"]) assert.deepEqual(permittedProcessGroups(role, () => true), []);
});

test("integration preserves canonical navigation and permission gate", async () => {
  const source = await readFile(new URL("../script.js", import.meta.url), "utf8");
  assert.ok(source.includes('if (!canAccessScreen(screenId))'));
  assert.ok(source.includes('canAccess: canAccessScreen, navigate: showScreen'));
  assert.ok(source.includes('showScreen(button.dataset.screen)'));
  assert.ok(source.includes('showScreen(button.dataset.screenTarget)'));
});
