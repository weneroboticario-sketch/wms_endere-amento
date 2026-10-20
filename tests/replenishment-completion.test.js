import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { buildReplenishmentExportRows } from "../src/replenishment-export.js";

const source = await readFile(new URL("../script.js", import.meta.url), "utf8");
const completionSource = source.slice(source.indexOf("  async function completeReplenishmentRequest("), source.indexOf("  async function cancelReplenishmentRequest("));
const actionsSource = source.slice(source.indexOf("  function replenishmentActionsHtml("), source.indexOf("  function displayReplenishmentStatus("));

test("partial completion closes the request and exports only the attended quantity", async () => {
  const request = { id: "partial", requestedQty: 31, attendedQty: 10, pendingQty: 21, status: "ATENDIDO_PARCIAL" };
  const context = vm.createContext({
    getReplenishmentById: () => request,
    nowIso: () => "2026-10-20T20:00:00.000Z",
    updateReplenishmentRow: async (id, patch) => Object.assign(request, patch)
  });
  vm.runInContext(completionSource, context);
  await context.completeReplenishmentRequest(request.id);
  assert.equal(request.status, "CONCLUIDO");
  assert.equal(request.pendingQty, 0);
  assert.equal(request.requestedQty, 31);
  assert.equal(request.attendedQty, 10);
  assert.ok(request.finishedAt);
  assert.deepEqual(buildReplenishmentExportRows([{
    id: request.id, warehouse_code: "VDCG", codigo_material: "48060",
    quantidade_solicitada: request.requestedQty, quantidade_atendida: request.attendedQty, status: request.status
  }], "VDCG"), [["48060", 10]]);
  request.attendedQty = 0;
  await assert.rejects(context.completeReplenishmentRequest(request.id), /Sem estoque/);
});

test("completion is visible for authorized partial attendants and hidden without attendance or permission", () => {
  const context = vm.createContext({
    canClaimReplenishmentRequest: () => false,
    canReturnReplenishmentRequest: () => false,
    isGlobalAdminUser: () => false,
    authState: { currentUser: {} },
    escapeHtml: value => value
  });
  vm.runInContext(actionsSource, context);
  const request = { id: "partial", status: "ATENDIDO_PARCIAL", requestedQty: 31, attendedQty: 10 };
  for (const canManage of [false, true]) {
    assert.match(context.replenishmentActionsHtml(request, canManage, true), /data-replenishment-complete/);
  }
  assert.doesNotMatch(context.replenishmentActionsHtml(request, false, false), /data-replenishment-complete/);
  assert.doesNotMatch(context.replenishmentActionsHtml({ ...request, attendedQty: 0 }, true, true), /data-replenishment-complete/);
});
