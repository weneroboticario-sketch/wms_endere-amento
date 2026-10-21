export const STOCK_FRESHNESS_LIMIT_MS = 4 * 60 * 60 * 1000;

export function getStockFreshness(batches, warehouse, sources, now = Date.now()) {
  return sources.map(source => {
    const timestamps = batches
      .filter(batch => batch.warehouse_code === warehouse && batch.source_type === source && batch.status === "COMPLETED")
      .map(batch => Date.parse(batch.finished_at || batch.created_at || ""))
      .filter(timestamp => Number.isFinite(timestamp) && timestamp <= now);
    const updatedAt = timestamps.length ? Math.max(...timestamps) : null;
    return { source, updatedAt, stale: updatedAt !== null && now - updatedAt > STOCK_FRESHNESS_LIMIT_MS };
  });
}

export async function loadLatestStockImports(client, warehouse, sources) {
  const results = await Promise.all(sources.map(source => client
    .from("wms_stock_import_batches")
    .select("warehouse_code,source_type,status,created_at,finished_at")
    .eq("warehouse_code", warehouse).eq("source_type", source).eq("status", "COMPLETED")
    .order("finished_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false }).limit(1)));
  const failed = results.find(result => result.error);
  if (failed) throw failed.error;
  return results.flatMap(result => result.data || []);
}

export function renderStockFreshnessNotice(host, { batches, warehouse, sources, now, error, formatDate }) {
  const attention = getStockFreshness(batches, warehouse, sources, now)
    .filter(source => source.stale || source.updatedAt === null);
  host.hidden = !error && !attention.length;
  if (host.hidden) { host.replaceChildren(); return; }
  const title = document.createElement("strong");
  const message = document.createElement("p");
  const detail = document.createElement("p");
  title.textContent = error ? "Atualizacao da base nao verificada" :
    attention.some(source => source.stale) ? "Base de estoque ha mais de 4 horas sem atualizacao" :
      "Sem importacao concluida registrada";
  message.textContent = "Para maior precisao dos saldos, recomenda-se importar a base novamente. Aviso informativo: consultas e operacoes continuam liberadas.";
  detail.className = "stock-freshness-detail";
  const labels = { LOJA: "Loja", CAPTACAO: "Captacao", PULMAO: "Pulmao" };
  detail.textContent = warehouse + " - " + (error ? "Nao foi possivel consultar a ultima importacao. Confirme a data antes de usar o saldo como valor concreto." :
    attention.map(source => (labels[source.source] || source.source) + ": " +
      (source.updatedAt === null ? "sem data confirmada" : "ultima atualizacao " + formatDate(new Date(source.updatedAt).toISOString()))).join(" | "));
  const content = [title, message, detail];
  // Avoid announcing identical content every time the background timer runs.
  if (host.textContent !== content.map(node => node.textContent).join("")) host.replaceChildren(...content);
}
