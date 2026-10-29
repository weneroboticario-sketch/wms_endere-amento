export function validateCaixaRequest(request) {
  if (!["PRODUCT", "ADJUSTMENT"].includes(request.kind)) throw new Error("Selecione produto ou ajuste.");
  if (!/^\d{4,8}$/.test(request.sku)) throw new Error("Informe o SKU com 4 a 8 dígitos, mantendo zeros à esquerda.");
  if (!Number.isSafeInteger(request.quantity) || request.quantity < 1 || request.quantity > 9999999) throw new Error("Informe uma quantidade inteira positiva.");
  if (request.notes.length > 2000 || (request.kind === "ADJUSTMENT" && request.notes.trim().length < 3)) throw new Error("Informe o motivo da verificação do ajuste (até 2.000 caracteres).");
  return request;
}

function node(tag, text, parent) {
  const result = document.createElement(tag);
  if (text !== undefined) result.textContent = text;
  parent?.append(result);
  return result;
}

const labels = { PENDENTE: "Na fila", EM_SEPARACAO: "Em separação", ATENDIDO_PARCIAL: "Atendido parcialmente", SEPARADO: "Separado", CONCLUIDO: "Concluído", ENTREGUE_NA_LOJA: "Entregue na loja", SEM_ESTOQUE: "Sem estoque", CANCELADO: "Cancelado", EM_VERIFICACAO: "Em verificação", AGUARDANDO_VALIDACAO: "Aguardando validação", SUBMITTED: "Solicitação enviada", REVIEW_REQUESTED: "Verificação encaminhada", STATUS_UPDATED: "Situação atualizada" };

export function mountCaixaRequests(host, context) {
  Object.assign(labels, { AGUARDANDO_CONFIRMACAO_CAIXA: "Resolvido pelo estoque — aguardando confirmação do caixa", CLAIM: "Estoquista puxou o ajuste", RESOLVE: "Estoquista informou a resolução", CONFIRM: "Caixa confirmou que deu certo", REOPEN: "Caixa devolveu para correção" });
  const scope = `${context.actor}:${context.warehouse}:${context.role}`;
  if (host.dataset.scope === scope) return;
  host.replaceChildren(); host.dataset.scope = scope;
  const current = () => host.isConnected && context.isCurrent();
  let busy = false;
  let pending;
  let rows = [];
  let showClosed = false;
  node("h2", context.role === "CAIXA" ? "Pedidos de Reposição" : "URGENTE — Cliente no caixa", host);
  node("p", "Solicitações urgentes de produtos e ajustes. Ajustes aguardam a confirmação do caixa após a resolução.", host);
  const feedback = node("p", "", host); feedback.setAttribute("role", "status");
  const controls = node("div", undefined, host);
  const list = node("div", undefined, host);
  const rpc = async (name, args) => {
    if (!current()) throw new Error("Usuário ou estoque mudou. Reabra a tela.");
    const response = await context.client.rpc(name, args);
    if (!current()) throw new Error("Usuário ou estoque mudou. Reabra a tela.");
    if (response.error) {
      const error = new Error(response.error.message || "Falha de conexão. Confira os pedidos antes de reenviar.");
      error.confirmedFailure = /^(?:[0-9A-Z]{5}|PGRST\d+)$/.test(response.error.code || "");
      throw error;
    }
    return response.data;
  };
  const action = (parent, label, execute) => {
    const button = node("button", label, parent); button.type = "button"; button.className = "secondary-button";
    button.addEventListener("click", async () => {
      if (busy || !current()) return;
      busy = true; button.disabled = true;
      try { await execute(); if (current()) feedback.textContent = "Dados atualizados."; }
      catch (error) { if (current()) { feedback.textContent = error.message; feedback.scrollIntoView({ block: "nearest" }); } }
      finally { busy = false; if (current()) button.disabled = false; }
    });
    return button;
  };
  const refresh = async () => {
    const response = await context.client.from("wms_caixa_requests").select("*").eq("warehouse_code", context.warehouse).order("created_at", { ascending: false }).limit(100);
    if (!current()) return;
    if (response.error) throw new Error(response.error.message || "Não foi possível atualizar seus pedidos.");
    rows = response.data || []; list.replaceChildren();
    node("p", "Até 100 pedidos mais recentes. Atualização automática a cada 15 segundos.", list);
    const isClosed = request => !!request.confirmed_at || request.status === "CANCELADO" || (request.kind === "PRODUCT" && ["CONCLUIDO", "ENTREGUE_NA_LOJA", "SEM_ESTOQUE"].includes(request.status));
    rows.filter(request => showClosed ? isClosed(request) : !isClosed(request)).forEach(request => {
      const card = node("fieldset", undefined, list);
      node("legend", `URGENTE — ${request.kind === "PRODUCT" ? "Produto" : "Ajuste"} — SKU ${request.sku}`, card);
      node("p", `${labels[request.status] || request.status} | ${new Date(request.created_at).toLocaleString("pt-BR")}`, card);
      node("p", request.kind === "PRODUCT" ? `Solicitada: ${request.quantity} | Atendida: ${request.attended} | Pendente: ${Math.max(0, request.quantity - request.attended)}` : `Quantidade informada para verificação: ${request.quantity}. Sem indicação automática de entrada ou saída.`, card);
      if (request.customer_service) node("strong", "ATENDIMENTO AO CLIENTE", card);
      node("p", request.notes, card);
      if (request.claimed_by_name) node("p", `Estoquista: ${request.claimed_by_name}`, card);
      if (request.resolution_notes) node("p", `Resposta do estoque: ${request.resolution_notes}`, card);
      if (request.kind === "ADJUSTMENT" && !request.confirmed_at) {
        const change = async (operation, observation = "") => { await rpc("act_wms_caixa_adjustment", { request_key: request.id, operation, observation }); await refresh(); };
        if (["OPERADOR", "SUPERVISOR", "ADMINISTRADOR"].includes(context.role)) {
          if (!request.claimed_by) action(card, "Puxar ajuste urgente", () => change("CLAIM"));
          if (request.claimed_by === context.actor && request.status !== "AGUARDANDO_CONFIRMACAO_CAIXA") {
            const responseLabel = node("label", "O que foi resolvido? ", card);
            const response = node("textarea", undefined, responseLabel); response.maxLength = 2000;
            action(card, "Informar resolução ao caixa", () => change("RESOLVE", response.value.trim()));
          }
        }
        if (context.role === "CAIXA" && request.status === "AGUARDANDO_CONFIRMACAO_CAIXA") {
          action(card, "Deu certo / entrou no pedido", () => change("CONFIRM"));
          const failureLabel = node("label", "Se não deu certo, informe o motivo ", card);
          const failure = node("textarea", undefined, failureLabel); failure.maxLength = 2000;
          action(card, "Não deu certo — devolver ao estoquista", () => change("REOPEN", failure.value.trim()));
        }
      }
      const events = node("div", undefined, card);
      action(card, "Histórico", async () => {
        const history = await context.client.from("wms_caixa_request_events").select("created_at,event_type,status,observation").eq("request_id", request.id).order("created_at");
        if (!current()) return;
        if (history.error) throw new Error(history.error.message);
        events.replaceChildren();
        (history.data || []).forEach(event => node("p", `${new Date(event.created_at).toLocaleString("pt-BR")} | ${labels[event.event_type] || event.event_type} | ${labels[event.status] || event.status} ${event.observation || ""}`, events));
      });
    });
    if (!rows.length) node("p", "Nenhum pedido neste estoque.", list);
  };
  action(controls, "Atualizar pedidos", refresh);
  action(controls, "Alternar ativos / histórico de confirmados", async () => { showClosed = !showClosed; await refresh(); });
  if (context.role === "CAIXA") {
    const form = node("fieldset", undefined); host.insertBefore(form, controls);
    node("legend", "Nova solicitação", form);
    const field = (label, type) => { const wrapper = node("label", label + " ", form); const input = node("input", undefined, wrapper); input.type = type; return input; };
    const kindLabel = node("label", "Tipo ", form);
    const kind = node("select", undefined, kindLabel);
    for (const [value, label] of [["PRODUCT", "Pedir produto"], ["ADJUSTMENT", "Solicitar verificação de ajuste"]]) { const option = node("option", label, kind); option.value = value; }
    const sku = field("SKU", "text"); sku.maxLength = 8; sku.inputMode = "numeric";
    const quantity = field("Quantidade", "number"); quantity.min = "1"; quantity.step = "1";
    const notesLabel = node("label", "Observação / motivo do ajuste ", form);
    const notes = node("textarea", undefined, notesLabel); notes.maxLength = 2000;
    const customer = field("Urgente — cliente aguardando no caixa", "checkbox"); customer.checked = true; customer.disabled = true;
    action(form, "Enviar solicitação", async () => {
      const request = pending || validateCaixaRequest({ id: crypto.randomUUID(), kind: kind.value, sku: sku.value.trim(), quantity: Number(quantity.value), customer: kind.value === "PRODUCT" && customer.checked, notes: notes.value.trim() });
      pending = request;
      form.querySelectorAll("input,select,textarea").forEach(input => { input.disabled = true; });
      try {
        await rpc("submit_wms_caixa_request", { request_key: request.id, code: context.warehouse, request_kind: request.kind, product_code: request.sku, units: request.quantity, customer: request.customer, observation: request.notes });
        await refresh();
      } catch (error) {
        if (error.confirmedFailure) { pending = null; form.querySelectorAll("input,select,textarea").forEach(input => { input.disabled = false; }); customer.disabled = true; }
        throw error;
      }
      pending = null; sku.value = ""; quantity.value = ""; notes.value = "";
      form.querySelectorAll("input,select,textarea").forEach(input => { input.disabled = false; }); customer.disabled = true;
    });
  }
  refresh().catch(error => { if (current()) feedback.textContent = error.message; });
  const timer = globalThis.setInterval(() => {
    if (host.dataset.scope !== scope || !host.isConnected) { globalThis.clearInterval(timer); return; }
    if (document.activeElement && host.contains(document.activeElement)) return;
    if (Array.from(host.querySelectorAll("textarea")).some(input => input.value)) return;
    if (current() && !busy) refresh().catch(error => { if (current()) feedback.textContent = error.message; });
  }, 15000);
  timer.unref?.();
}
