import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../script.js", import.meta.url), "utf8");
const getter = source.slice(source.indexOf("  function getTransferPackedUnits("), source.indexOf("  function hasTransferBoxConversion("));
const start = source.indexOf("      var boxPatternDiff =");
const calculation = source.slice(start, source.indexOf("      if (packExcess > 0) {", start));

function pack(item, boxes, unitsPerBox, mixedUnits) {
  const context = vm.createContext({
    item, qty: boxes, packCurrent: item.packedQty, referenceUnits: boxes * unitsPerBox,
    boxPacking: { packedUnitsDelta: mixedUnits ?? boxes * unitsPerBox, unitsPerBox, mixed: mixedUnits !== undefined },
    isBoxQuantityItem: () => true
  });
  vm.runInContext(getter + calculation, context);
  return item;
}

test("three boxes of 24 yield 72 units even when the pattern is first supplied at packing", () => {
  for (const unitsPerBox of [0, 24]) {
    const item = pack({ packedQty: 0, packedUnits: 0, unitsPerBox, boxQty: 3, requestedQty: 3 }, 3, 24);
    assert.equal(item.packedQty, 3);
    assert.equal(item.packedUnits, 72);
    assert.equal(item.totalUnits, 72);
  }
});

test("successive and legacy partial packing do not count new boxes twice", () => {
  const item = { packedQty: 0, packedUnits: 0, unitsPerBox: 24, boxQty: 3, requestedQty: 3 };
  pack(item, 1, 24);
  assert.equal(item.packedUnits, 24);
  pack(item, 2, 24);
  assert.equal(item.packedUnits, 72);
  assert.equal(pack({ ...item, packedQty: 1, packedUnits: 0 }, 2, 24).packedUnits, 72);
});

test("mixed boxes retain their explicitly informed unit quantity", () => {
  assert.equal(pack({ packedQty: 0, packedUnits: 0, unitsPerBox: 24, boxQty: 3 }, 3, 24, 70).packedUnits, 70);
});
