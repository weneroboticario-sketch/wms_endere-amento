import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { readStockPages } from "../src/stock-pagination.js";

const source = await readFile(new URL("../script.js", import.meta.url), "utf8");

function loadFunctions(names, overrides = {}) {
  const context = vm.createContext({
    readStockPages, window: { AbortSignal: globalThis.AbortSignal },
    normalizeSku: value => String(value).trim(),
    normalizeText: value => String(value || "").trim(),
    normalizeWarehouseCode: value => String(value).trim().toUpperCase(),
    normalizeSkuKey: value => String(value).trim(),
    activeWarehouseCode: () => "14177",
    ...overrides
  });
  for (const name of names) {
    const body = source.match(new RegExp("  (?:async )?function " + name + "\\([^]*?\\n  }"))?.[0];
    assert.ok(body, name + " must exist");
    vm.runInContext(body, context);
  }
  return context;
}

test("import deduplicates by the database key despite different address descriptions", () => {
  const api = loadFunctions(["stockPositionOperationalKey", "dedupeStockRows"]);
  const first = { codigoMaterial: "00178", codigoEndereco: "", estacao: "Estacao A", rack: "1", totalDisponivel: 2 };
  const second = { ...first, estacao: "Estacao B", rack: "2", totalDisponivel: 5 };
  const rows = api.dedupeStockRows("CAPTACAO", [first, second]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].totalDisponivel, 5);
  assert.equal(api.stockPositionOperationalKey("CAPTACAO", first),
    api.stockPositionOperationalKey("CAPTACAO", { codigo_material: "00178", codigo_endereco: null }));
  assert.notEqual(api.stockPositionOperationalKey("CAPTACAO", first),
    api.stockPositionOperationalKey("CAPTACAO", { ...first, codigoEndereco: "A-1" }));
  assert.notEqual(api.stockPositionOperationalKey("CAPTACAO", first),
    api.stockPositionOperationalKey("LOJA", first));
  assert.notEqual(api.stockPositionOperationalKey("CAPTACAO", first, "14177"),
    api.stockPositionOperationalKey("CAPTACAO", first, "22796"));
});

test("retrying a partial import reuses the existing row ID when address metadata changes", async () => {
  const written = [];
  const existing = { id: "previous-import-row", codigoMaterial: "00178", codigoEndereco: "A-1", estacao: "Old", sourceType: "CAPTACAO", totalDisponivel: 2 };
  const api = loadFunctions(["stockPositionOperationalKey", "saveStockImportBatch"], {
    randomId: () => "retry-batch", nowIso: () => "2026-10-13T15:00:00Z",
    createIdempotencyKey: () => "retry", authState: { currentUser: null },
    closeInterruptedStockImportBatches: async () => {},
    insertStockBatchWithFallback: async () => ({ error: null }),
    updateLocalStockBatchProgress: () => {}, fetchActiveStockPositions: async () => [existing],
    setStatus: () => {}, stockImportSkuKeysWithoutLocation: () => [],
    calculateStockRecordHash: () => "new", stockPositionChanged: () => true,
    toDbStockPosition: row => row,
    upsertStockImportPositions: async rows => written.push(...rows),
    stockPositionLocation: row => row.codigoEndereco,
    updateStockRowsByIds: async () => {},
    syncBindingsFromLocatedStockImport: async () => ({ synced: 0, created: 0, duplicatesRemoved: 0, changedSkus: [] }),
    clearBindingsForUnlocatedStockImport: async () => 0,
    generateNegativeStockAlerts: async () => 0,
    updateStockBatchMetrics: async () => {},
    stockSourceLabel: value => value, stockImportModeLabel: value => value
  });
  await api.saveStockImportBatch("CAPTACAO", "retry.xlsx", {
    rows: [{ ...existing, id: undefined, estacao: "New", totalDisponivel: 5 }], ignored: 0, errors: []
  }, "CARGA_COMPLETA");
  assert.equal(written.length, 1);
  assert.equal(written[0].id, "previous-import-row");
  assert.equal(written[0].totalDisponivel, 5);
});

test("export uses current bindings without changing stock rows or creating bindings", async () => {
  const input = [
    { id: "1", sourceType: "CAPTACAO", codigoMaterial: "00178", codigoEndereco: "A-1", totalDisponivel: 2 },
    { id: "2", sourceType: "CAPTACAO", codigoMaterial: "00178", codigoEndereco: "A-2", totalDisponivel: 3 },
    { id: "3", sourceType: "CAPTACAO", codigoMaterial: "48062", codigoEndereco: "C-1", totalDisponivel: 4 },
    { id: "4", sourceType: "LOJA", codigoMaterial: "00178", codigoEndereco: "", totalDisponivel: 10 }
  ];
  const before = JSON.stringify(input);
  const api = loadFunctions(["prepareStockExportRows"], {
    fetchWarehouseRows: async () => [], fromDbBinding: row => row,
    latestBindingBySkuForWarehouse: () => ({ "00178": { parsed: { code: "B-1", rua: "B", rack: 1, linha: 1, letra: "A" } } }),
    formatLinhaSeparacaoStationName: () => "Estacao B",
    stockPositionLocation: row => row.codigoEndereco,
    upsertInChunks: () => assert.fail("export must not write bindings"),
    upsertStockPositionRows: () => assert.fail("export must not write stock")
  });
  const result = await api.prepareStockExportRows(input, "14177");
  assert.equal(JSON.stringify(input), before);
  assert.equal(result.rows.length, 4);
  assert.equal(result.rows[0].codigoEndereco, "B-1");
  assert.equal(result.rows[1].codigoEndereco, "B-1");
  assert.equal(result.rows[2].codigoEndereco, "C-1");
  assert.equal(result.rows[3].codigoEndereco, "");
  assert.equal(result.rows.reduce((sum, row) => sum + row.totalDisponivel, 0), 19);
});

test("stock pagination orders equal SKUs by ID, including the legacy fallback", async () => {
  const orders = [];
  let reads = 0;
  const api = loadFunctions(["fetchActiveStockPositions"], {
    isSupabaseReady: () => true,
    stockPositionSelectColumns: () => "id", stockPositionLegacySelectColumns: () => "id",
    fromDbStockPosition: row => row, isMissingColumnError: () => true,
    supabaseDb: { from: () => {
      const query = { select: () => query, eq: () => query,
        order: column => { orders.push(column); return query; },
        range: () => query,
        abortSignal: () => { reads++; return reads === 1 ? { error: { code: "42703" } } : { data: [] }; } };
      return query;
    } },
    runSupabaseRequestWithRetry: async (_, callback) => callback()
  });
  await api.fetchActiveStockPositions("CAPTACAO");
  assert.deepEqual(orders, ["codigo_material", "id", "codigo_material", "id"]);
});
