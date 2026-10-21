export const STOCK_FRESHNESS_LIMIT_MS = 4 * 60 * 60 * 1000;

export function staleStockSources(batches, warehouseCode, now = Date.now()) {
  return ["LOJA", "CAPTACAO"].flatMap(sourceType => {
    const timestamps = batches
      .filter(batch => batch.warehouse_code === warehouseCode && batch.source_type === sourceType && batch.status === "COMPLETED")
      .map(batch => Date.parse(batch.finished_at || batch.updated_at || batch.created_at))
      .filter(Number.isFinite);
    if (!timestamps.length) return [];
    const updatedAt = Math.max(...timestamps);
    return now - updatedAt > STOCK_FRESHNESS_LIMIT_MS ? [{ sourceType, updatedAt }] : [];
  });
}
