import { caixaAttendanceView } from "./caixa-attendance.js";
import { mountCaixaChat } from "./caixa-chat.js";

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
  Object.assign(labels, { AGUARDANDO_CONFIRMACAO_CAIXA: "Aguardando caixa", CLAIM: "Atendimento assumido", RESOLVE: "Resolução informada", CONFIRM: "Caixa confirmou", REOPEN: "Devolvido para correção" });
  const scope = context.actor + ":" + context.warehouse + ":" + context.role;
  if (host.dataset.scope === scope) return;
  host.replaceChildren(); host.dataset.scope = scope;
  const current = () => host.isConnected && context.isCurrent();
  const isStock = ["OPERADOR", "SUPERVISOR", "ADMINISTRADOR"].includes(context.role);
  const canSupervise = ["SUPERVISOR", "ADMINISTRADOR"].includes(context.role);
  let busy = false, pending, rows = [], revision = 0, snapshot = "", initialized = false;
  const filter = { tab: "available", search: "" };
  const detailsState = new Map();
  const header = node("header", undefined, host); header.className = "ca-header";
  const title = node("div", undefined, header);
  node("h2", "CLIENTE NO CAIXA", title);
  node("p", "Fila de atendimento prioritário · cliente sempre tem preferência", title);
  const controls = node("div", undefined, host); controls.className = "ca-toolbar";
  const tabs = node("nav", undefined, controls); tabs.className = "ca-tabs";
  const tabButtons = {};
  for (const [key, label] of [["available", context.role === "CAIXA" ? "Meus pedidos" : "Disponíveis"], ["mine", "Meus atendimentos"], ["waiting", "Aguardando caixa"]]) {
    if (context.role === "CAIXA" && key === "mine") continue;
    const button = node("button", label, tabs);
    button.type = "button"; button.className = "secondary-button";
    button.addEventListener("click", () => { filter.tab = key; renderList(); });
    tabButtons[key] = { button, label };
  }
  const feedback = node("p", "", host); feedback.setAttribute("role", "status");
  const compactControls = node("div", undefined, host); compactControls.className = "ca-utilities";
  const search = node("input", undefined, compactControls);
  search.type = "search"; search.placeholder = "Buscar SKU ou solicitante";
  search.setAttribute("aria-label", "Buscar solicitação");
  search.addEventListener("input", () => { filter.search = search.value; renderList(); });
  const updated = node("small", "", compactControls);
  const secondary = node("div", undefined, host); secondary.className = "ca-secondary";
  const list = node("section", undefined, host); list.className = "ca-list";
  const notice = node("p", "", host); notice.className = "ca-notice"; notice.setAttribute("role", "status"); notice.setAttribute("aria-live", "polite");
  const notices = [], seenNotices = new Set();
  const notify = (key, text) => {
    if (!current() || seenNotices.has(key)) return;
    seenNotices.add(key); notices.push(text); notice.textContent = notices.slice(-3).join(" · ");
  };
  const observed = new Map();
  let observedInitialized = false, feedInitialized = false, feedLoading = false;
  const feedSeen = new Set();
  function observeRequests(nextRows) {
    for (const request of nextRows) {
      const prior = observed.get(request.id);
      const key = request.id + ":" + request.status + ":" + (request.updated_at || request.confirmed_at || request.resolved_at || request.claimed_at || "");
      if (observedInitialized && !prior) notify("new:" + request.id, "Nova solicitação urgente · SKU " + request.sku);
      else if (prior && (prior.status !== request.status || prior.claimed_by !== request.claimed_by)) {
        const text = request.confirmed_at ? "Caixa confirmou o atendimento" : request.status === "AGUARDANDO_CONFIRMACAO_CAIXA" ? "Resolução aguardando confirmação do caixa" : prior.status === "AGUARDANDO_CONFIRMACAO_CAIXA" && request.status === "EM_VERIFICACAO" ? "Caixa devolveu para correção" : request.claimed_by && prior.claimed_by !== request.claimed_by ? "Atendimento assumido por " + (request.claimed_by_name || "estoquista") : "Situação atualizada";
        notify(key, text + " · SKU " + request.sku);
      }
      observed.set(request.id, request);
    }
    observedInitialized = true;
  }
  async function pollMessageNotices() {
    if (!current() || feedLoading) return;
    feedLoading = true;
    try {
      const response = await context.client.from("wms_caixa_request_messages").select("id,request_id,sender_id,created_at").eq("warehouse_code", context.warehouse).order("id", { ascending: false }).limit(100);
      if (!current() || response.error) return;
      for (const message of response.data || []) {
        if (message.id === undefined || !message.request_id) continue;
        const key = String(message.id);
        if (feedInitialized && !feedSeen.has(key) && message.sender_id !== context.actor) {
          const request = observed.get(message.request_id);
          notify("message:" + message.request_id + ":" + message.id, "Nova mensagem" + (request ? " · SKU " + request.sku : " em atendimento autorizado"));
        }
        feedSeen.add(key);
      }
      feedInitialized = true;
    } finally { feedLoading = false; }
  }
  const rpc = async (name, args) => {
    if (!current()) throw new Error("Usuário ou estoque mudou. Reabra a tela.");
    const response = await context.client.rpc(name, args);
    if (!current()) throw new Error("Usuário ou estoque mudou. Reabra a tela.");
    if (response.error) {
      const error = new Error(response.error.message || "Falha na operação.");
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
      try { await execute(); if (current()) feedback.textContent = "Solicitação atualizada."; }
      catch (error) { if (current()) { feedback.textContent = error.message; feedback.scrollIntoView({ block: "nearest" }); } }
      finally { busy = false; if (current()) button.disabled = false; }
    });
    return button;
  };
  function canChat(request) {
    if (!current() || request.warehouse_code && request.warehouse_code !== context.warehouse) return false;
    if (context.role === "CAIXA") return request.requested_by === context.actor;
    return canSupervise || (isStock && request.claimed_by === context.actor);
  }
  const chat = mountCaixaChat({ host, context, rpc, canChat, notify });
  const refresh = async (automatic = false) => {
    const sequence = ++revision, actor = context.actor, warehouse = context.warehouse;
    const response = await context.client.rpc("list_wms_caixa_attendance", { code: warehouse });
    if (!current() || sequence !== revision || actor !== context.actor || warehouse !== context.warehouse) return;
    if (response.error) throw new Error(response.error.message || "Não foi possível atualizar os pedidos.");
    updated.textContent = "Atualizado às " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (!Array.isArray(response.data)) throw new Error("A central aguarda ativação da migration de atendimento.");
    const nextRows = response.data;
    observeRequests(nextRows); chat.reconcile(nextRows);
    if (!initialized) {
      const firstView = caixaAttendanceView(nextRows, context.actor, context.role);
      if (isStock && firstView.counts.mine) filter.tab = "mine";
      else if (context.role === "CAIXA" && firstView.counts.waiting) filter.tab = "waiting";
      initialized = true;
    }
    const next = JSON.stringify(nextRows);
    if (next === snapshot) return;
    if (automatic && ((document.activeElement && host.contains(document.activeElement)) || chat.hasDraft() || Array.from(host.querySelectorAll("textarea")).some(input => input.value))) return;
    rows = response.data || []; snapshot = next;
    renderList();
  };
  function renderList() {
    const view = caixaAttendanceView(rows, context.actor, context.role, filter.tab, filter.search);
    for (const [key, tab] of Object.entries(tabButtons)) {
      tab.button.textContent = tab.label + " (" + view.counts[key] + ")";
      tab.button.setAttribute("aria-pressed", String(filter.tab === key));
    }
    secondary.replaceChildren();
    if (isStock && view.counts.others) {
      const button = node("button", "Outros em atendimento (" + view.counts.others + ")", secondary);
      button.type = "button"; button.className = "secondary-button";
      button.addEventListener("click", () => { filter.tab = "others"; renderList(); });
    }
    const closed = node("button", "Histórico (" + view.counts.closed + ")", secondary);
    closed.type = "button"; closed.className = "secondary-button";
    closed.addEventListener("click", () => { filter.tab = "closed"; renderList(); });
    list.replaceChildren();
    if (!view.visible.length) {
      const hint = filter.tab === "mine" ? "Você não tem atendimentos pendentes." :
        filter.tab === "waiting" ? "Nenhum pedido aguardando resposta do caixa." :
        "Nenhuma solicitação nesta fila.";
      const p = node("p", hint, list); p.className = "ca-empty";
      return;
    }
    view.visible.forEach(request => {
      const card = node("article", undefined, list); card.className = "ca-card"; card.dataset.requestId = request.id;
      const heading = node("div", undefined, card); heading.className = "ca-card-head";
      const identity = node("div", undefined, heading);
      node("strong", "SKU " + request.sku, identity);
      node("small", request.kind === "ADJUSTMENT" ? "Ajuste de estoque" : (request.product_name || request.nome_material || "Produto para cliente"), identity);
      node("span", labels[request.status] || request.status, heading).className = "ca-status";
      const summary = node("div", undefined, card); summary.className = "ca-card-summary";
      const detail = (name, value) => {
        const block = node("div", undefined, summary);
        node("small", name, block); node("strong", value, block);
      };
      detail(request.kind === "ADJUSTMENT" ? "Verificar" : "Solicitado", request.quantity + " un.");
      if (request.kind === "PRODUCT") detail("Atendido", Number(request.attended || 0) + " un.");
      detail("Solicitante", request.requested_by_name || "Solicitante não identificado");
      detail("Horário", new Date(request.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
      const owner = node("p", request.claimed_by
        ? request.claimed_by === context.actor ? "EM ATENDIMENTO POR VOCÊ · " + (request.claimed_by_name || "Estoquista") : "Responsável: " + (request.claimed_by_name || "Estoquista")
        : "Aguardando responsável", card);
      owner.className = "ca-owner";
      const actions = node("div", undefined, card); actions.className = "ca-card-actions";
      const state = detailsState.get(request.id) || { open: false, drafts: {}, history: null };
      detailsState.set(request.id, state);
      const change = async (operation, observation = "") => {
        await rpc("act_wms_caixa_adjustment", { request_key: request.id, operation, observation });
        snapshot = ""; await refresh();
      };
      if (request.kind === "ADJUSTMENT" && !request.confirmed_at && request.status !== "CANCELADO") {
        if (isStock && !request.claimed_by) action(actions, "Assumir atendimento", async () => { await change("CLAIM"); filter.tab = "mine"; renderList(); }).className = "primary-button";
        if (isStock && request.claimed_by === context.actor && request.status !== "AGUARDANDO_CONFIRMACAO_CAIXA") {
          const btn = node("button", "Informar resolução", actions); btn.type = "button"; btn.className = "primary-button";
          const form = node("form", undefined, card); form.className = "ca-resolution"; form.hidden = !state.resolutionOpen;
          const input = node("textarea", undefined, form); input.maxLength = 2000;
          input.placeholder = "Descreva a solução realizada (obrigatório)";
          input.value = state.drafts.resolution || "";
          input.addEventListener("input", () => { state.drafts.resolution = input.value; });
          const submit = node("button", "Enviar para o caixa", form); submit.type = "submit"; submit.className = "primary-button";
          btn.addEventListener("click", () => { form.hidden = !form.hidden; state.resolutionOpen = !form.hidden; });
          form.addEventListener("submit", async event => {
            event.preventDefault(); if (busy) return;
            const value = input.value.trim();
            if (value.length < 3) { feedback.textContent = "Informe o que foi resolvido."; return; }
            busy = true; submit.disabled = true;
            try { await change("RESOLVE", value); state.drafts.resolution = ""; filter.tab = "waiting"; renderList(); feedback.textContent = "Aguardando confirmação do caixa."; }
            catch (error) { feedback.textContent = error.message; }
            finally { busy = false; submit.disabled = false; }
          });
        }
        if (context.role === "CAIXA" && request.status === "AGUARDANDO_CONFIRMACAO_CAIXA") {
          action(actions, "Passou / deu certo", () => change("CONFIRM")).className = "primary-button";
          const button = node("button", "Não passou", actions); button.type = "button"; button.className = "secondary-button";
          const form = node("form", undefined, card); form.className = "ca-resolution"; form.hidden = true;
          const input = node("textarea", undefined, form); input.maxLength = 2000; input.placeholder = "Informe o que continua errado";
          input.value = state.drafts.failure || ""; input.addEventListener("input", () => { state.drafts.failure = input.value; });
          button.addEventListener("click", () => { form.hidden = !form.hidden; state.failureOpen = !form.hidden; });
          const send = node("button", "Devolver para correção", form); send.type = "submit";
          form.addEventListener("submit", async event => {
            event.preventDefault(); if (busy) return;
            if (input.value.trim().length < 3) { feedback.textContent = "Informe por que não passou."; return; }
            busy = true; send.disabled = true;
            try { await change("REOPEN", input.value.trim()); state.drafts.failure = ""; }
            catch (error) { feedback.textContent = error.message; }
            finally { busy = false; send.disabled = false; }
          });
        }
      }
      if (request.kind === "PRODUCT" && isStock) {
        if (!request.claimed_by && request.status === "PENDENTE" && context.claimProduct) action(actions, "Assumir atendimento", async () => { await context.claimProduct(request.replenishment_id); snapshot = ""; await refresh(); filter.tab = "mine"; renderList(); }).className = "primary-button";
        else if (request.claimed_by === context.actor && context.openProduct && !["CONCLUIDO", "CANCELADO", "ENTREGUE_NA_LOJA", "SEM_ESTOQUE"].includes(request.status)) action(actions, "Atender na reposição", () => context.openProduct(request.replenishment_id)).className = "primary-button";
      }
      if (canChat(request)) action(actions, context.role === "CAIXA" ? "Conversar com estoque" : "Conversar com caixa", () => chat.open(request));
      const details = node("details", undefined, card); details.className = "ca-card-details"; details.open = state.open;
      details.addEventListener("toggle", () => { state.open = details.open; });
      node("summary", "Detalhes e histórico", details);
      node("p", request.notes || "Sem observação.", details);
      if (request.resolution_notes) node("p", "Resolução: " + request.resolution_notes, details);
      const history = node("div", undefined, details);
      const showHistory = () => {
        history.replaceChildren();
        (state.history || []).forEach(event => node("p", new Date(event.created_at).toLocaleString("pt-BR") + " · " +
          (labels[event.event_type] || event.event_type) + " · " + (event.observation || ""), history));
      };
      showHistory();
      action(details, "Carregar histórico", async () => {
        const response = await context.client.from("wms_caixa_request_events").select("created_at,event_type,status,observation")
          .eq("request_id", request.id).order("created_at");
        if (!current()) return;
        if (response.error) throw new Error(response.error.message);
        state.history = response.data || []; showHistory();
      });
    });
  }
  action(compactControls, "Atualizar", async () => { snapshot = ""; await refresh(); });

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

  refresh().then(() => pollMessageNotices()).catch(error => { if (current()) feedback.textContent = error.message; });
  const timer = globalThis.setInterval(() => {
    if (host.dataset.scope !== scope || !host.isConnected) { chat.clear(); globalThis.clearInterval(timer); return; }
    if (!current()) { chat.clear(); return; }
    chat.poll().catch(() => {});
    pollMessageNotices().catch(() => {});
    if (busy) return;
    if ((document.activeElement && host.contains(document.activeElement)) ||
      (Array.from(host.querySelectorAll("textarea")).some(input => input.value))) return;
    refresh(true).catch(error => { if (current()) feedback.textContent = error.message; });
  }, 15000);
  timer.unref?.();
}
