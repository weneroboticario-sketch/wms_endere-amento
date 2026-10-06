import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../script.js", import.meta.url), "utf8");

test("address export publishes a warehouse-scoped cache invalidation", () => {
  assert.match(source, /ADDRESS_CACHE_INVALIDATION_EVENT = "ADDRESS_CACHE_INVALIDATED"/);
  assert.match(source, /await saveData\(\)[\s\S]*?publishAddressCacheInvalidation\(exportWarehouseCode, fileName, exportRows\.length\)/);
  assert.match(source, /warehouse_code: normalizedWarehouseCode/);
});

test("capture stock import reconciles bindings and refreshes warehouse caches", () => {
  assert.match(source, /syncBindingsFromLocatedStockImport\(sourceType, parsed\.rows, warehouseCode, now\)/);
  assert.match(source, /stockImportOfficialLocationPlans\(rows\)/);
  assert.match(source, /previousLocation !== plan\.locationCode/);
  assert.match(source, /sourceType === "CAPTACAO"[\s\S]*?publishAddressCacheInvalidation\(activeWarehouseCode\(\), file\.name, parsed\.rows\.length\)/);
});

test("every warehouse module cache is invalidated before active data reloads", () => {
  assert.match(source, /WAREHOUSE_CACHE_MODULES = \["coreData", "transferData", "stockData", "replenishmentData"\]/);
  assert.match(source, /WAREHOUSE_CACHE_MODULES\.map[\s\S]*?cacheDelete\(scopedKey\)/);
  assert.match(source, /var refreshes = \[ensureCoreDataLoaded\(\)\]/);
});

test("cache invalidation reaches other tabs and devices with fallback polling", () => {
  assert.match(source, /addEventListener\("storage"[\s\S]*?refreshWarehouseCachesFromSignal/);
  assert.match(source, /\.on\("broadcast", \{ event: "cache-invalidation" \}/);
  assert.match(source, /from\("wms_notifications"\)\.insert\(payload\)/);
  assert.match(source, /checkLatestAddressCacheInvalidation\(\)/);
  assert.match(source, /cacheInvalidationTableUnavailable/);
});
