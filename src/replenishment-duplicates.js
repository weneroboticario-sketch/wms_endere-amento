// Restrict duplicate prevention to one requester and one warehouse.
// Different collaborators can still request the same product after acknowledging a warning.
export function normalizedReplenishmentSku(sku) {
  return String(sku ?? "").trim().toUpperCase().replace(/^0+(?=[0-9])/, "");
}
export function findPendingOwnDuplicate(rows, { warehouse, actorId, sku, quantity }) {
  const normalized = normalizedReplenishmentSku(sku);
  return (rows || []).find(row =>
    row && row.warehouse_code === warehouse && normalizedReplenishmentSku(row.codigo_material) === normalized &&
    row.solicitado_por_id === actorId &&
    Number(row.quantidade_solicitada) === Number(quantity) &&
    row.status === "PENDENTE" &&
    !row.is_deleted && !row.archived &&
    !row.responsavel_id &&
    Number(row.quantidade_atendida || 0) === 0
  ) || null;
}
export function summarizeOpenReplenishment(rows, { formatQty = String, statusLabel = String } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const sample = list.slice(0, 4).map(row => {
    const requestedBy = String(row.solicitado_por_nome || "Solicitante não identificado").trim();
    const assigned = row.responsavel_nome ? " | Responsável: " + row.responsavel_nome : "";
    return "- " + requestedBy + " | " + statusLabel(row.status) + " | solicitadas: " +
      formatQty(row.quantidade_solicitada) + " un. | pendentes: " +
      formatQty(row.quantidade_pendente) + " un." + assigned;
  });
  if (list.length > 4) sample.push("- e mais " + (list.length - 4) + " pedido(s) aberto(s).");
  return sample.join("\n");
}
