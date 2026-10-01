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

test("operators can claim pending requests and then work on their own request", () => {
  assert.match(source, /if \(request\.status === "PENDENTE" && canClaimReplenishmentRequest\(request\)\) return true;/);
  assert.match(source, /data-replenishment-claim=.*?>Puxar pedido<\/button>/);
  assert.match(source, /item\.responsavelId === authState\.currentUser\.id \|\| canManage/);
});

test("request messages are visible in cards and operator notifications", () => {
  assert.match(source, /replenishment-request-message/);
  assert.match(source, /Mensagem do solicitante/);
  assert.match(source, /body \+= " \| Mensagem: " \+ normalizeText\(request\.observacao\);/);
});

test("the replenishment queue hydrates from cache and refreshes without blocking login", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  assert.match(source, /hydrateReplenishmentDataFromCache\(\)/);
  assert.match(source, /var replenishmentPreload = canAccessScreen\("reposicao"\)[\s\S]*?ensureReplenishmentDataLoaded\(\)/);
  assert.match(source, /replenishmentState\.loadingPromise && replenishmentState\.loadingWarehouseCode === requestedWarehouseCode/);
  assert.match(source, /moduleLoadState\.replenishment \? refreshReplenishmentData\(\) : ensureReplenishmentDataLoaded\(\)/);
  assert.match(html, /id="refreshReplenishmentQueueButton"[^>]*>Atualizar fila<\/button>/);
});

test("realtime uses one operational channel and slower fallback polling", () => {
  assert.match(source, /channel\("wms-live-" \+ realtimeState\.warehouseCode \+ "-operacional"\)/);
  assert.match(source, /operationalTables\.forEach[\s\S]*?operationalChannel = operationalChannel\.on/);
  assert.match(source, /realtimeState\.operationalSubscribed = status === "SUBSCRIBED"/);
  assert.match(source, /scheduleTransferRealtimeRefresh\("poll", 0\);[\s\S]*?\}, 60000\);/);
});

test("replenishment no longer waits for the full product catalog", () => {
  assert.match(source, /screenId === "reposicao"[\s\S]*?Promise\.all\(\[[\s\S]*?ensureUsersLoaded[\s\S]*?ensureReplenishmentDataLoaded/);
  assert.match(source, /syncProductCatalogInBackground\(productCatalogPromise, requestedWarehouseCode\)/);
  assert.match(source, /pageSize: 1000/);
});

test("background synchronization keeps cache isolated by warehouse", () => {
  assert.match(source, /function cacheKeyForWarehouse\(moduleName, warehouseCode\)/);
  assert.match(source, /writeModuleCacheForWarehouse\("coreData", requestedWarehouseCode/);
  assert.match(source, /writeModuleCacheForWarehouse\("replenishmentData", requestedWarehouseCode/);
});
