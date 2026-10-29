import { caixaAttendanceView } from "./caixa-attendance.js";

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
  let busy = false, pending, rows = [], revision = 0, snapshot = "", showOther = false;
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
  const chat = node("aside", undefined, host); chat.className = "ca-chat"; chat.hidden = true;
  chat.setAttribute("aria-label", "Conversa com o caixa");
  const chatHead = node("header", undefined, chat);
  const chatTitle = node("strong", "Conversa da solicitação", chatHead);
  const closeChat = node("button", "Fechar", chatHead); closeChat.type = "button"; closeChat.className = "secondary-button";
  const chatStatus = node("p", "", chat); chatStatus.setAttribute("role", "status");
  const chatMessages = node("div", undefined, chat); chatMessages.className = "ca-chat-messages";
  const chatForm = node("form", undefined, chat); chatForm.className = "ca-chat-form";
  const chatInput = node("textarea", undefined, chatForm); chatInput.maxLength = 1000;
  chatInput.placeholder = "Escreva ao caixa ou estoquista...";
  chatInput.setAttribute("aria-label", "Mensagem");
  const chatSend = node("button", "Enviar mensagem", chatForm); chatSend.type = "submit"; chatSend.className = "primary-button";
  const conversation = { request: null, draftId: null, loading: false, messages: [] };
  closeChat.addEventListener("click", () => { chat.hidden = true; conversation.request = null; });
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
  function drawMessages() {
    chatMessages.replaceChildren();
    if (!conversation.messages.length) node("p", "Nenhuma mensagem ainda.", chatMessages);
    conversation.messages.forEach(message => {
      const bubble = node("article", undefined, chatMessages);
      bubble.className = "ca-chat-bubble" + (message.sender_id === context.actor ? " ca-chat-mine" : "");
      node("small", message.sender_id === context.actor ? "Você" : message.sender_id === conversation.request?.requested_by ? "Caixa" : "Equipe de estoque", bubble);
      node("p", message.body, bubble);
      node("time", new Date(message.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }), bubble);
    });
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  async function loadMessages() {
    const request = conversation.request, actor = context.actor, warehouse = context.warehouse;
    if (!request || conversation.loading || !current()) return;
    conversation.loading = true;
    try {
      const response = await context.client.from("wms_caixa_request_messages")
        .select("id,request_id,sender_id,body,created_at").eq("request_id", request.id).order("id", { ascending: true }).limit(100);
      if (!current() || conversation.request?.id !== request.id || actor !== context.actor || warehouse !== context.warehouse) return;
      if (response.error) throw new Error(response.error.message || "Não foi possível carregar a conversa.");
      conversation.messages = response.data || [];
      chatStatus.textContent = "";
      drawMessages();
    } catch (error) { if (conversation.request?.id === request.id) chatStatus.textContent = "Conversa indisponível: " + error.message; }
    finally { conversation.loading = false; }
  }
  async function openChat(request) {
    if (!canChat(request)) return;
    conversation.request = request; conversation.messages = []; conversation.draftId = null;
    chatTitle.textContent = "Conversa · SKU " + request.sku + " · " + request.quantity + " un.";
    chatStatus.textContent = "Carregando conversa...";
    chatInput.value = ""; chat.hidden = false;
    await loadMessages();
  }
  chatForm.addEventListener("submit", async event => {
    event.preventDefault();
    const request = conversation.request, body = chatInput.value.trim();
    if (!request || !current() || !canChat(request) || !body || body.length > 1000 || chatSend.disabled) return;
    chatSend.disabled = true;
    if (!conversation.draftId) conversation.draftId = crypto.randomUUID();
    try {
      await rpc("send_wms_caixa_message", { request_key: request.id, action_key: conversation.draftId, body });
      if (conversation.request?.id !== request.id) return;
      chatInput.value = ""; conversation.draftId = null;
      await loadMessages();
      chatStatus.textContent = "Mensagem enviada.";
    } catch (error) {
      if (conversation.request?.id === request.id) chatStatus.textContent = error.message + " Verifique a conversa antes de reenviar.";
    } finally { chatSend.disabled = false; }
  });
  chatInput.addEventListener("input", () => { conversation.draftId = null; });
  const refresh = async (automatic = false) => {
    const sequence = ++revision, actor = context.actor, warehouse = context.warehouse;
    const response = await context.client.from("wms_caixa_requests").select("*")
      .eq("warehouse_code", warehouse).order("created_at", { ascending: false }).limit(100);
    if (!current() || sequence !== revision || actor !== context.actor || warehouse !== context.warehouse) return;
    if (response.error) throw new Error(response.error.message || "Não foi possível atualizar os pedidos.");
    updated.textContent = "Atualizado às " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const next = JSON.stringify(response.data || []);
    if (next === snapshot) return;
    if (automatic && ((document.activeElement && host.contains(document.activeElement)) || chatInput.value)) return;
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
    if (canSupervise && view.counts.others) {
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
      detail("Solicitante", request.requested_by_name || "Caixa");
      detail("Horário", new Date(request.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
      const owner = node("p", request.claimed_by
        ? request.claimed_by === context.actor ? "EM ATENDIMENTO POR VOCÊ" : "Responsável: " + (request.claimed_by_name || "Estoquista")
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
          const form = node("form", undefined, card); form.className = "ca-resolution"; form.hidden = true;
          const input = node("textarea", undefined, form); input.maxLength = 2000;
          input.placeholder = "Descreva a solução realizada (obrigatório)";
          input.value = state.drafts.resolution || "";
          input.addEventListener("input", () => { state.drafts.resolution = input.value; });
          const submit = node("button", "Enviar para o caixa", form); submit.type = "submit"; submit.className = "primary-button";
          btn.addEventListener("click", () => { form.hidden = !form.hidden; });
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
          button.addEventListener("click", () => { form.hidden = !form.hidden; });
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
      if (canChat(request)) action(actions, "Conversar com caixa", () => openChat(request));
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

  refresh().catch(error => { if (current()) feedback.textContent = error.message; });
  const timer = globalThis.setInterval(() => {
    if (host.dataset.scope !== scope || !host.isConnected) { globalThis.clearInterval(timer); return; }
    if (!current() || busy) return;
    if (!chat.hidden && conversation.request) loadMessages();
    if ((document.activeElement && host.contains(document.activeElement)) ||
      (Array.from(host.querySelectorAll("textarea")).some(input => input.value))) return;
    refresh(true).catch(error => { if (current()) feedback.textContent = error.message; });
  }, 15000);
  timer.unref?.();
}
