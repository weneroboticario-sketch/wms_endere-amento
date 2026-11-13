export function isCaixaClosed(request) {
  return !!request.confirmed_at || request.status === "CANCELADO" || (request.kind === "PRODUCT" && ["CONCLUIDO", "ENTREGUE_NA_LOJA", "SEM_ESTOQUE"].includes(request.status));
}

export function isCaixaCompleted(request) {
  return request.kind === "ADJUSTMENT" ? !!request.confirmed_at : ["CONCLUIDO", "ENTREGUE_NA_LOJA"].includes(request.status);
}

export function caixaBucket(request) {
  if (isCaixaClosed(request)) return "closed";
  if (["EM_SEPARACAO", "EM_VERIFICACAO", "AGUARDANDO_VALIDACAO", "AGUARDANDO_CONFIRMACAO_CAIXA", "ATENDIDO_PARCIAL", "SEPARADO"].includes(request.status)) return "verification";
  return request.customer_service ? "client" : "urgent";
}

export function caixaQueueView(rows, filters = {}, now = new Date()) {
  const sameDay = value => value && new Date(value).toLocaleDateString("pt-BR", { timeZone: "America/Cuiaba" }) === now.toLocaleDateString("pt-BR", { timeZone: "America/Cuiaba" });
  const counts = { all: 0, client: 0, urgent: 0, verification: 0, completed: 0, today: 0, history: 0 };
  rows.forEach(request => {
    const bucket = caixaBucket(request);
    if (bucket === "closed") counts.history++;
    else { counts.all++; counts[bucket]++; }
    if (isCaixaCompleted(request)) {
      counts.completed++;
      if (sameDay(request.confirmed_at || request.updated_at)) counts.today++;
    }
  });
  const search = String(filters.search || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const visible = rows.filter(request => {
    const bucket = caixaBucket(request);
    const tab = filters.tab || "all";
    if (tab === "completed" ? !isCaixaCompleted(request) : tab === "history" ? bucket !== "closed" : tab === "all" ? bucket === "closed" : bucket !== tab) return false;
    if (filters.kind && filters.kind !== request.kind) return false;
    if (filters.status && filters.status !== request.status) return false;
    if (filters.owner && filters.owner !== (request.claimed_by || "unassigned")) return false;
    return [request.sku, request.product_name, request.nome_material, request.requested_by_name, request.requested_by, request.claimed_by_name, request.notes].filter(Boolean).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").includes(search);
  }).sort((a, b) => {
    const rank = request => caixaBucket(request) === "client" ? 0 : caixaBucket(request) === "closed" ? 2 : 1;
    return rank(a) - rank(b) || new Date(a.created_at) - new Date(b.created_at) || String(a.id).localeCompare(String(b.id));
  });
  return { counts, visible };
}
