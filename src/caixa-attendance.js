export function caixaAttendanceBucket(request, actor, role) {
  if (request.confirmed_at || request.status === "CANCELADO" ||
    (request.kind === "PRODUCT" && ["CONCLUIDO", "ENTREGUE_NA_LOJA", "SEM_ESTOQUE"].includes(request.status))) return "closed";
  if (request.status === "AGUARDANDO_CONFIRMACAO_CAIXA") return "waiting";
  if (role === "CAIXA") return "available";
  if (request.claimed_by === actor && actor) return "mine";
  if (request.claimed_by) return "others";
  return "available";
}

export function caixaAttendanceView(rows, actor, role, tab = "available", search = "") {
  const counts = { available: 0, mine: 0, waiting: 0, others: 0, closed: 0 };
  const query = String(search).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const filtered = (rows || []).filter(request => {
    const bucket = caixaAttendanceBucket(request, actor, role);
    counts[bucket]++;
    if (bucket !== tab) return false;
    const searchable = [request.sku, request.product_name, request.nome_material,
      request.requested_by_name, request.claimed_by_name, request.notes]
      .filter(Boolean).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return !query || searchable.includes(query);
  }).sort((a, b) => Date.parse(a.created_at || 0) - Date.parse(b.created_at || 0) || String(a.id).localeCompare(String(b.id)));
  return { counts, visible: filtered };
}
