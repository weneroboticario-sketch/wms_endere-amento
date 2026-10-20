import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../script.js", import.meta.url), "utf8");
const body = source.slice(source.indexOf("  async function deleteTransferPermanently("), source.indexOf("  async function cancelTransfer("));

function harness(status, error = null) {
  const calls = { cleanup: 0, removed: 0, ended: 0, messages: [] };
  const transfer = { id: "test-transfer", status };
  const dependencies = {
    isAdminOrSupervisor: () => true,
    getTransferById: () => transfer,
    transferBelongsToActiveWarehouse: () => true,
    requestTransferDeleteConfirmation: async () => true,
    document: { querySelector: () => ({}) },
    beginTransferAction: () => true,
    transferDebugLog: () => {},
    nowIso: () => "2026-10-20T16:00:00Z",
    supabaseDb: { rpc: async (name, payload) => { calls.rpc = name; calls.payload = payload; return { error, data: true }; } },
    authState: { currentUser: { id: "admin", name: "Admin" } },
    cleanupTransferRelatedData: async () => { calls.cleanup++; },
    removeLocalTransferEverywhere: () => { calls.removed++; },
    maintenanceState: {},
    renderTransfers: () => {},
    renderMaintenance: () => {},
    showToast: (message, type) => calls.messages.push({ message, type }),
    formatSupabaseError: e => e.message,
    endTransferAction: () => { calls.ended++; },
    console: { error: () => {} }
  };
  const run = new Function(...Object.keys(dependencies), body + "; return deleteTransferPermanently;")(...Object.values(dependencies));
  return { calls, run };
}

test("deleting an invoiced transfer uses the atomic server deletion", async () => {
  const { calls, run } = harness("FINALIZADA");
  assert.equal(await run("test-transfer"), true);
  assert.equal(calls.rpc, "wms_delete_transfer_permanently");
  assert.deepEqual(calls.payload, { p_transfer_id: "test-transfer" });
  assert.equal(calls.cleanup, 0);
  assert.equal(calls.removed, 1);
});

test("deleting an unfinished transfer also uses atomic deletion", async () => {
  const { calls, run } = harness("EM_SEPARACAO");
  assert.equal(await run("test-transfer"), true);
  assert.equal(calls.rpc, "wms_delete_transfer_permanently");
});

test("failed deletion displays the error without removing the local transfer", async () => {
  const { calls, run } = harness("FINALIZADA", { message: "Permissao negada" });
  assert.equal(await run("test-transfer"), false);
  assert.equal(calls.removed, 0);
  assert.equal(calls.cleanup, 0);
  assert.equal(calls.ended, 1);
  assert.match(calls.messages[0].message, /Permissao negada/);
});
