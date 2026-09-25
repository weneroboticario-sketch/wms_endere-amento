import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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
