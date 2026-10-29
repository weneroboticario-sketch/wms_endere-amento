import { caixaBucket, caixaQueueView, isCaixaCompleted } from "./caixa-queue-view.js";

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
  const filters = { tab: "all", search: "", kind: "", status: "", owner: "" };
  const detailState = new Map();
  let lastSnapshot = "";
  let refreshSequence = 0;
  const header = node("div", undefined, host); header.className = "cq-header";
  const title = node("div", undefined, header);
  node("h2", "URGENTE — Cliente no caixa", title);
  node("p", "Solicitações urgentes de produtos e ajustes, com acompanhamento até a confirmação do atendimento.", title);
  const alert = node("aside", undefined, header); alert.className = "cq-alert";
  node("strong", "ATENDIMENTO PRIORITÁRIO", alert);
  node("span", "Cliente sempre tem preferência. Pedidos pendentes para clientes aparecem primeiro, independentemente da quantidade.", alert);
  const metrics = node("div", undefined, host); metrics.className = "cq-metrics";
  const metricValues = {};
  for (const [key, label, help] of [["client", "Itens para Cliente", "Pendentes · prioridade máxima"], ["urgent", "Itens Urgentes", "Demais solicitações pendentes"], ["verification", "Em Verificação", "Em atendimento ou aguardando confirmação"], ["today", "Concluídos Hoje", "Conclusão efetiva · horário de Cuiabá"]]) {
    const metric = node("div", undefined, metrics); metric.className = `cq-metric cq-metric-${key}`;
    metricValues[key] = node("strong", "—", metric); node("span", label, metric); node("small", help, metric);
  }
  const feedback = node("p", "", host); feedback.setAttribute("role", "status");
  const controls = node("div", undefined, host);
  controls.className = "cq-toolbar";
  const loadedAt = node("small", "Ainda não atualizado", controls);
  const filterBar = node("div", undefined, host); filterBar.className = "cq-filterbar";
  const searchLabel = node("label", "Buscar nos pedidos carregados", filterBar);
  const search = node("input", undefined, searchLabel); search.type = "search"; search.placeholder = "SKU, descrição ou solicitante";
  search.addEventListener("input", () => { filters.search = search.value; renderList(); });
  const addFilter = (key, label, choices) => {
    const wrapper = node("label", label, filterBar); const select = node("select", undefined, wrapper);
    for (const [value, text] of choices) { const option = node("option", text, select); option.value = value; }
    select.value = "";
    select.addEventListener("change", () => { filters[key] = select.value; renderList(); });
    return select;
  };
  addFilter("kind", "Tipo", [["", "Todos os tipos"], ["PRODUCT", "Produto"], ["ADJUSTMENT", "Ajuste"]]);
  const statusFilter = addFilter("status", "Situação", [["", "Todas as situações"]]);
  const ownerFilter = addFilter("owner", "Responsável", [["", "Todos os responsáveis"], ["unassigned", "Sem responsável informado"]]);
  const tabs = node("div", undefined, host); tabs.className = "cq-tabs cq-toolbar";
  const tabButtons = {};
  for (const [key, text] of [["all", "Todos"], ["client", "Cliente"], ["urgent", "Urgentes"], ["verification", "Em verificação"], ["completed", "Concluídos"], ["history", "Histórico de encerrados"]]) {
    const button = node("button", text, tabs); button.type = "button";
    button.addEventListener("click", () => { filters.tab = key; renderList(); });
    tabButtons[key] = { button, text };
  }
  const limitation = node("p", "Indicadores e filtros consideram somente os até 100 pedidos mais recentes deste estoque e do seu acesso. Atualização automática a cada 15 segundos.", host); limitation.className = "cq-limit";
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
  const refresh = async (automatic = false) => {
    const sequence = ++refreshSequence;
    const response = await context.client.from("wms_caixa_requests").select("*").eq("warehouse_code", context.warehouse).order("created_at", { ascending: false }).limit(100);
    if (!current() || sequence !== refreshSequence) return;
    if (automatic && ((document.activeElement && host.contains(document.activeElement)) || Array.from(host.querySelectorAll("textarea")).some(input => input.value))) return;
    if (response.error) throw new Error(response.error.message || "Não foi possível atualizar seus pedidos.");
    loadedAt.textContent = "Último carregamento: " + new Date().toLocaleTimeString("pt-BR");
    const snapshot = JSON.stringify(response.data || []);
    if (snapshot === lastSnapshot) return;
    lastSnapshot = snapshot; rows = response.data || [];
    statusFilter.replaceChildren(); ownerFilter.replaceChildren();
    const option = (select, value, text) => { const item = node("option", text, select); item.value = value; };
    option(statusFilter, "", "Todas as situações");
    [...new Set(rows.map(request => request.status))].sort().forEach(status => option(statusFilter, status, labels[status] || status));
    option(ownerFilter, "", "Todos os responsáveis"); option(ownerFilter, "unassigned", "Sem responsável informado");
    const owners = new Map(rows.filter(request => request.claimed_by).map(request => [request.claimed_by, request.claimed_by_name || request.claimed_by]));
    owners.forEach((name, id) => option(ownerFilter, id, name));
    if (filters.status && !rows.some(request => request.status === filters.status)) filters.status = "";
    if (filters.owner && filters.owner !== "unassigned" && !owners.has(filters.owner)) filters.owner = "";
    statusFilter.value = filters.status; ownerFilter.value = filters.owner;
    renderList();
  };
  function renderList() {
    const anchor = Array.from(list.querySelectorAll("tr")).find(row => row.dataset.requestId && row.getBoundingClientRect && row.getBoundingClientRect().bottom > 0);
    const anchorTop = anchor?.getBoundingClientRect().top;
    const view = caixaQueueView(rows, filters);
    for (const [key, value] of Object.entries(metricValues)) value.textContent = String(view.counts[key]);
    for (const [key, tab] of Object.entries(tabButtons)) {
      tab.button.textContent = `${tab.text} (${view.counts[key]})`;
      tab.button.setAttribute("aria-pressed", String(filters.tab === key));
    }
    list.replaceChildren();
    for (const [client, title] of [[true, "ATENDIMENTO AO CLIENTE — PRIORIDADE MÁXIMA"], [false, "DEMAIS SOLICITAÇÕES"]]) {
      const requests = view.visible.filter(request => (caixaBucket(request) === "client") === client);
      if (!requests.length) continue;
      const section = node("section", undefined, list); section.className = "cq-group" + (client ? " cq-group-client" : "");
      const heading = node("h3", title, section); node("span", `${requests.length} itens`, heading);
      const table = node("table", undefined, section);
      const caption = node("caption", title, table); caption.hidden = true;
      const head = node("tr", undefined, node("thead", undefined, table));
      const columns = ["SKU", "Descrição", "Solicitada", "Atendida / verificada", "Situação", "Solicitante", "Horário", "Ações"];
      columns.forEach(label => { const th = node("th", label, head); th.setAttribute("scope", "col"); });
      const body = node("tbody", undefined, table);
      requests.forEach(request => {
        const row = node("tr", undefined, body); row.dataset.requestId = request.id;
        const cells = columns.map(label => { const td = node("td", undefined, row); td.dataset.label = label; return td; });
        const icon = node("span", "▣ ", cells[0]); icon.setAttribute("aria-hidden", "true");
        node("strong", request.sku, cells[0]);
        node("strong", request.product_name || request.nome_material || (request.kind === "ADJUSTMENT" ? "Ajuste de estoque" : "Solicitação de produto"), cells[1]);
        node("small", request.kind === "ADJUSTMENT" ? "Verificar quantidade · sem movimento automático" : "Reposição urgente", cells[1]);
        node("strong", `${request.quantity} un.`, cells[2]);
        node("strong", request.kind === "ADJUSTMENT" ? "Não informada" : `${request.attended} un.`, cells[3]);
        if (request.kind === "PRODUCT") node("small", `Pendente: ${Math.max(0, request.quantity - request.attended)} un.`, cells[3]);
        const badge = node("span", labels[request.status] || request.status, cells[4]);
        badge.className = `cq-status cq-status-${isCaixaCompleted(request) ? "done" : caixaBucket(request)}`;
        node("small", request.claimed_by_name ? `Responsável: ${request.claimed_by_name}` : "Responsável não informado", cells[4]);
        node("span", request.requested_by_name || request.requested_by || "Não informado", cells[5]);
        node("span", new Date(request.created_at).toLocaleString("pt-BR"), cells[6]);
        const card = cells[7]; card.className = "cq-actions";
        const state = detailState.get(request.id) || { open: false, history: null, drafts: {} }; detailState.set(request.id, state);
        const details = node("details", undefined, card); details.open = state.open;
        details.addEventListener("toggle", () => { state.open = details.open; });
        node("summary", "Detalhes e histórico", details);
        node("p", request.notes || "Sem observação.", details);
        if (request.claimed_by_name) node("p", `Estoquista: ${request.claimed_by_name}`, details);
        if (request.resolution_notes) node("p", `Resposta do estoque: ${request.resolution_notes}`, details);
        const draft = (key, label) => {
          const wrapper = node("label", label, details); const input = node("textarea", undefined, wrapper); input.maxLength = 2000; input.value = state.drafts[key] || "";
          input.addEventListener("input", () => { state.drafts[key] = input.value; }); return input;
        };
        const primary = (label, execute) => { const button = action(card, label, execute); button.className = "primary-button"; card.insertBefore(button, details); return button; };
      if (request.kind === "ADJUSTMENT" && !request.confirmed_at && request.status !== "CANCELADO") {
        const change = async (operation, observation = "") => { await rpc("act_wms_caixa_adjustment", { request_key: request.id, operation, observation }); await refresh(); };
        if (["OPERADOR", "SUPERVISOR", "ADMINISTRADOR"].includes(context.role)) {
          if (!request.claimed_by) primary("Puxar ajuste urgente", () => change("CLAIM"));
          if (request.claimed_by === context.actor && request.status !== "AGUARDANDO_CONFIRMACAO_CAIXA") {
            const response = draft("resolution", "O que foi resolvido?");
            primary("Informar resolução ao caixa", async () => { if (!details.open) { details.open = true; state.open = true; return; } await change("RESOLVE", response.value.trim()); state.drafts.resolution = ""; });
          }
        }
        if (context.role === "CAIXA" && request.status === "AGUARDANDO_CONFIRMACAO_CAIXA") {
          primary("Deu certo / entrou no pedido", () => change("CONFIRM"));
          const failure = draft("failure", "Se não deu certo, informe o motivo");
          action(card, "Não deu certo — devolver ao estoquista", async () => { if (!details.open) { details.open = true; state.open = true; return; } await change("REOPEN", failure.value.trim()); state.drafts.failure = ""; });
        }
      }
      if (request.kind === "PRODUCT") node("small", context.role === "CAIXA" ? "Acompanhe o atendimento pela situação." : "Atendimento pela fila de reposição abaixo.", card);
      const events = node("div", undefined, details);
      const renderHistory = () => { events.replaceChildren(); (state.history || []).forEach(event => node("p", `${new Date(event.created_at).toLocaleString("pt-BR")} | ${event.actor_id || "Autor não informado"} | ${labels[event.event_type] || event.event_type} | ${labels[event.status] || event.status} ${event.observation || ""}`, events)); };
      renderHistory();
      action(details, "Histórico", async () => {
        const history = await context.client.from("wms_caixa_request_events").select("created_at,event_type,status,observation,actor_id").eq("request_id", request.id).order("created_at");
        if (!current()) return;
        if (history.error) throw new Error(history.error.message);
        state.history = history.data || []; renderHistory();
      });
      });
    }
    if (!view.visible.length) { const empty = node("p", rows.length ? "Nenhuma solicitação corresponde aos filtros selecionados." : "Nenhum pedido neste estoque.", list); empty.className = "cq-empty"; }
    if (anchor) {
      const nextAnchor = Array.from(list.querySelectorAll("tr")).find(row => row.dataset.requestId === anchor.dataset.requestId);
      if (nextAnchor) globalThis.window?.scrollBy(0, nextAnchor.getBoundingClientRect().top - anchorTop);
    }
  }
  action(controls, "Atualizar pedidos", refresh);
  if (context.role === "CAIXA") {
    const form = node("fieldset", undefined); host.insertBefore(form, controls);
    node("legend", "Nova solicitação", form);
    const field = (label, type) => { const wrapper = node("label", label + " ", form); const input = node("input", undefined, wrapper); input.type = type; return input; };
    const kindLabel = node("label", "Tipo ", form);
    const kind = node("select", undefined, kindLabel);
    for (const [value, label] of [["PRODUCT", "Pedir produto"], ["ADJUSTMENT", "Solicitar verificação de ajuste"]]) { const option = node("option", label, kind); option.value = value; }
    kind.value = "PRODUCT";
    kindLabel.hidden = true;
    node("p", "O que você precisa solicitar?", form);
    const kindButtons = node("div", undefined, form);
    kindButtons.setAttribute("role", "group"); kindButtons.setAttribute("aria-label", "Tipo da solicitação urgente");
    const choices = [];
    for (const [value, label] of [["PRODUCT", "Pedir produto"], ["ADJUSTMENT", "Solicitar ajuste"]]) {
      const button = node("button", label, kindButtons); button.type = "button";
      button.className = value === kind.value ? "primary-button" : "secondary-button";
      button.setAttribute("aria-pressed", String(value === kind.value));
      choices.push({ value, button });
      button.addEventListener("click", () => {
        if (busy || pending || !current()) return;
        kind.value = value;
        for (const choice of choices) {
          choice.button.className = choice.value === value ? "primary-button" : "secondary-button";
          choice.button.setAttribute("aria-pressed", String(choice.value === value));
        }
        notes.placeholder = value === "ADJUSTMENT" ? "Descreva o ajuste necessário para liberar o pedido do cliente." : "Informe os detalhes do produto solicitado.";
      });
    }
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
    if (current() && !busy) refresh(true).catch(error => { if (current()) feedback.textContent = error.message; });
  }, 15000);
  timer.unref?.();
}
