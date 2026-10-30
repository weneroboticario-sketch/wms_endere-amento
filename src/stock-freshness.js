export const STOCK_FRESHNESS_LIMIT_MS = 4 * 60 * 60 * 1000;

export function classifyImportFreshness(batch, { now = Date.now(), warningMs = STOCK_FRESHNESS_LIMIT_MS, staleMs = warningMs, inclusive = false } = {}) {
  if (!batch) return { state: "MISSING", updatedAt: null, ageMs: null };
  if (batch.status === "FAILED") return { state: "FAILED", updatedAt: null, ageMs: null };
  if (batch.status !== "COMPLETED") return { state: "PENDING", updatedAt: null, ageMs: null };
  const updatedAt = Date.parse(batch.finished_at || batch.updated_at || batch.created_at);
  if (!Number.isFinite(updatedAt)) return { state: "MISSING", updatedAt: null, ageMs: null };
  const ageMs = Math.max(0, now - updatedAt), older = limit => inclusive ? ageMs >= limit : ageMs > limit;
  return { state: older(staleMs) ? "STALE" : older(warningMs) ? "WARNING" : "FRESH", updatedAt, ageMs };
}

export function staleStockSources(batches, warehouseCode, now = Date.now()) {
  return ["LOJA", "CAPTACAO"].flatMap(sourceType => {
    const timestamps = batches
      .filter(batch => batch.warehouse_code === warehouseCode && batch.source_type === sourceType && batch.status === "COMPLETED")
      .map(batch => Date.parse(batch.finished_at || batch.updated_at || batch.created_at))
      .filter(Number.isFinite);
    if (!timestamps.length) return [];
    const updatedAt = Math.max(...timestamps);
    return classifyImportFreshness({ status: "COMPLETED", finished_at: new Date(updatedAt).toISOString() }, { now }).state === "STALE" ? [{ sourceType, updatedAt }] : [];
  });
}
