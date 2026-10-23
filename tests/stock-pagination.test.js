import test from "node:test";
import assert from "node:assert/strict";
import { readStockPages } from "../src/stock-pagination.js";

test("reads a full 32483-row base in order with at most three concurrent pages", async () => {
  const source = Array.from({ length: 32483 }, (_, index) => ({ id: index }));
  let active = 0;
  let peak = 0;
  let calls = 0;
  const progress = [];
  const rows = await readStockPages(async (offset, limit) => {
    calls += 1;
    active += 1;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, offset % 3000 === 1000 ? 2 : 1));
    active -= 1;
    return source.slice(offset, offset + limit);
  }, count => progress.push(count));
  assert.deepEqual(rows, source);
  assert.equal(peak, 3);
  assert.equal(calls, 34);
  assert.equal(progress.at(-1), 32483);
});

test("handles empty and exact page boundaries without duplicating records", async () => {
  for (const size of [0, 1, 999, 1000, 2000, 4000, 64967]) {
    const source = Array.from({ length: size }, (_, index) => index);
    assert.deepEqual(await readStockPages(async (offset, limit) => source.slice(offset, offset + limit)), source);
  }
});

test("a failed page rejects the entire read instead of exporting or comparing partial stock", async () => {
  await assert.rejects(readStockPages(async offset => {
    if (offset === 2000) throw new Error("Falha de rede");
    return Array.from({ length: 1000 }, (_, index) => offset + index);
  }), /Falha de rede/);
});
