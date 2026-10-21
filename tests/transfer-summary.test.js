import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { completeMissingTransferSummaries } from "../src/transfer-summary.js";

test("missing totals are read in batch without changing transfer identity or database", async () => {
  const rows = [{ id: "a", total_items: 0 }, { id: "b", total_items: 2, total_expected_quantity: 10 }];
  let calls = 0;
  const result = await completeMissingTransferSummaries(rows, async ids => {
    calls++; assert.deepEqual(ids, ["a"]);
    return [{ transfer_id: "a", sku: "123", quantidade_solicitada: 6, quantidade_separada: 4, quantidade_lacrada: 3 }, { transfer_id: "a", sku: "123", is_extra: true, quantidade_lacrada: 1 }];
  });
  assert.equal(calls, 1);
  assert.equal(result[0].total_skus, 1);
  assert.equal(result[0].total_previsto, 6);
  assert.equal(result[0].total_packed_quantity, 4);
  assert.equal(rows[0].total_items, 0);
  assert.equal(result[1], rows[1]);
});

test("valid totals need no child query; errors are not silently converted to zero", async () => {
  await completeMissingTransferSummaries([{ total_items: 1, total_expected_quantity: 5 }], () => { throw Error("Unneeded read"); });
  await assert.rejects(completeMissingTransferSummaries([{ id: "a" }], async () => { throw Error("Denied"); }), /Denied/);
});

test("minimal item reads paginate, count unique SKUs and reject unrelated rows", async () => {
  const result = await completeMissingTransferSummaries([{ id: "a" }], async (_ids, offset) => offset === 0
    ? Array.from({length:1000}, () => ({transfer_id:"a", sku:"same", quantidade_solicitada:1}))
    : [{ transfer_id:"a", sku:"second", quantidade_solicitada:2 }, {transfer_id:"other", sku:"third", quantidade_solicitada:99}]);
  assert.equal(result[0].total_items, 1001);
  assert.equal(result[0].total_skus, 2);
  assert.equal(result[0].total_expected_quantity, 1002);
});

test("CP summaries remain visible if a stale loaded marker has no cached details", async () => {
  const source = await readFile(new URL("../script.js", import.meta.url), "utf8");
  const start = source.indexOf("  function getTransferStats(");
  const stop = source.indexOf("\n  function ", start + 1);
  const getStats = vm.runInNewContext("(" + source.slice(start, stop) + ")", {
    IS_CP_ALAMO:true, transferStatsCache:{statsByTransferId:{}}, getTransferItems:()=>[],
    transferState:{loadedItemTransferIds:{a:true}}, getTransferById:()=>({totalSkus:1,totalItems:1,totalExpectedQuantity:15})
  });
  assert.equal(getStats("a").totalSkus, 1);
  assert.equal(getStats("a").requested, 15);
});
