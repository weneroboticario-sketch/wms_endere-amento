import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../script.js", import.meta.url), "utf8");

test("operators can see the replenishment queue for every allowed warehouse", () => {
  assert.match(source, /function userCanViewReplenishmentInWarehouse\(user, warehouseCode\)[\s\S]*?return userCanAccessWarehouse\(user, warehouseCode\);/);
  assert.match(source, /function getVisibleReplenishmentRequests\(\)[\s\S]*?return userCanViewReplenishmentInWarehouse\(authState\.currentUser, request\.warehouseCode\);/);
});

test("replenishment assignment accepts an allowed warehouse instead of only the default", () => {
  assert.match(source, /function userCanReceiveReplenishmentInWarehouse\(user, warehouseCode\)[\s\S]*?return userCanAccessWarehouse\(user, warehouseCode\);/);
});

test("the menu badge counts all open replenishments in the active warehouse", () => {
  assert.match(source, /var badgeCount = openReplenishments\.length;/);
  assert.match(source, /OPEN_REPLENISHMENT_STATUSES = \[[^\]]*"SEPARADO"/);
});

test("operators who are not responsible cannot change an in-progress request", () => {
  assert.match(source, /var canWork = authState\.currentUser && \(item\.responsavelId === authState\.currentUser\.id \|\| canManage\);/);
});
