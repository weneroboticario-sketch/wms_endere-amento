import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { planBindingRemoval } from "../src/addressing-bindings.js";

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
