import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { planBindingRemoval, planLocationSkuCleanup } from "../src/addressing-bindings.js";

test("SKU search exposes the addressing action", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const button = html.match(/<button[^>]+id="allocateSkuSearchButton"[^>]*>/)?.[0] || "";

  assert.ok(button, "addressing button must exist");
  assert.doesNotMatch(button, /\shidden(?:\s|>|=)/);
});

test("occupied-location dialog offers adding another SKU", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /data-location-decision="include"[^>]*>Endereçar também neste local</);
  assert.match(html, /data-location-decision="replace"[^>]*>Remover antigos e deixar só o novo</);
});

test("existing SKU dialog distinguishes moving from keeping its address", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /data-sku-move-decision="move"[^>]*>Remover do antigo e usar o novo</);
  assert.match(html, /data-sku-move-decision="keep"[^>]*>Manter no endereço antigo</);
});

test("an already allocated SKU still asks about other products in the location", async () => {
  const source = await readFile(new URL("../script.js", import.meta.url), "utf8");

  assert.match(source, /sameLocation && otherLocationOccupants\.length/);
  assert.match(source, /askLocationConflictDecision\(parsed\.code, sku, otherLocationOccupants, true\)/);
  assert.match(source, /Remover os outros e manter este/);
});

test("an SKU found in two locations forces the user to keep only one", async () => {
  const source = await readFile(new URL("../script.js", import.meta.url), "utf8");

  assert.match(source, /askSkuMoveDecision\(sku, parsed\.code, skuLocations, Boolean\(sameLocation\)\)/);
  assert.match(source, /Este SKU pode permanecer em somente uma localizacao/);
  assert.match(source, /Remover dos antigos e manter neste/);
  assert.match(source, /Manter no antigo e remover deste/);
});

test("removing one SKU from a combined legacy row keeps the other SKUs", () => {
  const bindings = [
    { id: "row-1-sku-100-0", remoteId: "row-1", sourceSkuValue: "100;200", sku: "100" },
    { id: "row-1-sku-200-1", remoteId: "row-1", sourceSkuValue: "100;200", sku: "200" }
  ];
  const plan = planBindingRemoval(bindings, "row-1-sku-100-0");

  assert.equal(plan.mode, "update");
  assert.equal(plan.remoteId, "row-1");
  assert.deepEqual(plan.remainingSkus, ["200"]);
});

test("removing a normal binding deletes only its database row", () => {
  const bindings = [
    { id: "row-1", remoteId: "row-1", sourceSkuValue: "100", sku: "100" },
    { id: "row-2", remoteId: "row-2", sourceSkuValue: "200", sku: "200" }
  ];
  const plan = planBindingRemoval(bindings, "row-1");

  assert.equal(plan.mode, "delete");
  assert.equal(plan.remoteId, "row-1");
  assert.deepEqual(plan.remainingSkus, []);
});

test("keeping one SKU from a combined location updates the real row", () => {
  const occupants = [
    { id: "row-1-sku-51226-0", remoteId: "row-1", sourceSkuValue: "51226;89663", sku: "51226" },
    { id: "row-1-sku-89663-1", remoteId: "row-1", sourceSkuValue: "51226;89663", sku: "89663" }
  ];
  const plan = planLocationSkuCleanup(occupants, "row-1-sku-51226-0");

  assert.equal(plan.keepRemoteId, "row-1");
  assert.equal(plan.updateKeepRow, true);
  assert.deepEqual(plan.deleteRemoteIds, []);
});

test("keeping one SKU removes separate rows for the other location occupants", () => {
  const occupants = [
    { id: "row-1", remoteId: "row-1", sourceSkuValue: "51226", sku: "51226" },
    { id: "row-2", remoteId: "row-2", sourceSkuValue: "89663", sku: "89663" }
  ];
  const plan = planLocationSkuCleanup(occupants, "row-1");

  assert.equal(plan.updateKeepRow, false);
  assert.deepEqual(plan.deleteRemoteIds, ["row-2"]);
});

test("address cleanup rejects a silent RLS delete", async () => {
  const source = await readFile(new URL("../script.js", import.meta.url), "utf8");

  assert.match(source, /missingDeletes = cleanup\.deleteRemoteIds\.filter/);
  assert.match(source, /Supabase nao autorizou a remocao dos outros produtos/);
});

test("operators can delete only warehouse-scoped addressing bindings", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/20260930184528_allow_operator_binding_delete.sql", import.meta.url),
    "utf8"
  );

  assert.match(migration, /drop policy if exists wms_bindings_warehouse_delete/);
  assert.match(migration, /private\.current_wms_allowed_warehouses/);
  assert.match(migration, /'ADMINISTRADOR', 'SUPERVISOR', 'OPERADOR'/);
  assert.doesNotMatch(migration, /wms_transfers_warehouse_delete/);
});
