import { createElement, MessageCircle } from "lucide";
import { caixaAttendanceView } from "./caixa-attendance.js";
import { mountCaixaChat } from "./caixa-chat.js";
import { createCaixaUnread } from "./caixa-unread.js";
import { createCaixaProductLookup } from "./caixa-product-lookup.js";
import { mountCaixaRequestComposer } from "./caixa-request-composer.js";
import { isCaixaClosed } from "./caixa-queue-view.js";
import { createOperationalSync } from "./operational-sync.js";
import { recordOperationalDiagnostic } from "./operational-diagnostics.js";

export { validateCaixaRequest } from "./caixa-request-composer.js";

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
  host.caixaStop?.();
  host.replaceChildren(); host.dataset.scope = scope;
  const current = () => host.isConnected && host.dataset.scope === scope && context.isCurrent();
  const isStock = ["OPERADOR", "SUPERVISOR", "ADMINISTRADOR"].includes(context.role);
  const canSupervise = ["SUPERVISOR", "ADMINISTRADOR"].includes(context.role);
  let busy = false, rows = [], revision = 0, snapshot = "", initialized = false;
  const filter = { tab: "available", search: "" };
  const detailsState = new Map();
  let renderPending = () => {};
  const header = node("header", undefined, host); header.className = "ca-header";
  const title = node("div", undefined, header);
  node("h2", "CLIENTE NO CAIXA", title);
  node("p", context.role === "CAIXA" ? "Solicitações prioritárias para o estoque" : "Fila de atendimento prioritário · cliente sempre tem preferência", title);
  const syncState = node("small", "Sincronização: conectando…", title); syncState.setAttribute("role", "status");
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
  let observedInitialized = false, feedLoading = false;
  const unread = createCaixaUnread({ client: context.client, warehouse: context.warehouse, isCurrent: current });
  function showUnread() {
    context.onUnreadMessages?.({ count: 0 }); // Retire the legacy global banner.
    if (!current()) return;
    for (const button of host.querySelectorAll("button")) {
      const id = button.dataset.chatRequest;
      if (!id) continue;
      const request = observed.get(id);
      const count = request && canChat(request) && !isCaixaClosed(request) && request.status !== "CONCLUIDO" ? unread.count(id) : 0;
      button.replaceChildren();
      button.className = "secondary-button ca-chat-indicator" + (count ? " ca-chat-unread" : "");
      if (document.createElementNS) button.append(createElement(MessageCircle, {width:18,height:18,"aria-hidden":"true"}));
      if (count) node("span", String(count), button).className = "ca-chat-count";
      button.setAttribute("aria-label", "Conversar · SKU " + (request?.sku || "") + (count ? " · " + count + " não lidas" : ""));
      button.title = count ? count + " mensagens não lidas" : "Conversar";
    }
  }
  function observeRequests(nextRows) {
    for (const id of observed.keys()) if (!nextRows.some(request => request.id === id)) observed.delete(id);
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
      await unread.refresh();
      if (!current()) return;
      showUnread();
    } finally { feedLoading = false; }
  }
  const rpc = async (name, args) => {
    if (!current()) throw new Error("Usuário ou estoque mudou. Reabra a tela.");
    const response = await context.client.rpc(name, args);
    if (!current()) throw new Error("Usuário ou estoque mudou. Reabra a tela.");
    if (response.error) {
      recordOperationalDiagnostic({ module: "caixa", event: "rpc", warehouse: context.warehouse, operationId: args.request_key, category: response.error.code || "api", result: "failed" });
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
  const chat = mountCaixaChat({ host, context, rpc, canChat, onRead: async (requestId, messages) => {
    await unread.acknowledge(requestId, messages); showUnread();
  } });
  const refresh = async (automatic = false) => {
    const sequence = ++revision, actor = context.actor, warehouse = context.warehouse;
    const response = await context.client.rpc("list_wms_caixa_attendance", { code: warehouse });
    if (!current() || sequence !== revision || actor !== context.actor || warehouse !== context.warehouse) return;
    if (response.error) throw new Error(response.error.message || "Não foi possível atualizar os pedidos.");
    updated.textContent = "Atualizado às " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (!Array.isArray(response.data)) throw new Error("A central aguarda ativação da migration de atendimento.");
    const nextRows = response.data;
    observeRequests(nextRows); chat.reconcile(nextRows); renderPending(nextRows);
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
      if (context.role === "ADMINISTRADOR" && context.canDeletePermanently === true) {
        const toggle = node("button", "Excluir definitivamente", actions); toggle.type = "button"; toggle.className = "danger-button";
        const deletion = node("form", undefined, card); deletion.className = "ca-delete-form"; deletion.hidden = !state.deleteOpen;
        node("p", "Excluir definitivamente SKU " + request.sku + " · " + request.quantity + " un. · estoque " + context.warehouse + " · solicitação " + request.id + "?", deletion);
        node("p", "Serão apagados esta solicitação, mensagens, histórico, tarefas e reposição vinculada, inclusive seus registros de exportação no sistema. Esta ação não pode ser desfeita e não estorna saldos ou arquivos já baixados.", deletion);
        const label = node("label", "Digite EXCLUIR para confirmar", deletion);
        const input = node("input", undefined, label); input.type = "text"; input.autocomplete = "off"; input.maxLength = 7; input.value = state.drafts.deletion || "";
        input.setAttribute("aria-label", "Confirmar exclusão · solicitação " + request.id);
        input.addEventListener("input", () => { state.drafts.deletion = input.value; });
        const error = node("p", "", deletion); error.setAttribute("role", "status");
        const send = node("button", "Confirmar exclusão definitiva", deletion); send.type = "submit"; send.className = "danger-button";
        const cancel = node("button", "Cancelar", deletion); cancel.type = "button"; cancel.className = "secondary-button";
        toggle.addEventListener("click", () => { deletion.hidden = !deletion.hidden; state.deleteOpen = !deletion.hidden; if (!deletion.hidden) input.focus?.(); });
        cancel.addEventListener("click", () => { deletion.hidden = true; state.deleteOpen = false; state.drafts.deletion = ""; input.value = ""; });
        deletion.addEventListener("submit", async event => {
          event.preventDefault(); if (busy || !current()) return;
          if (input.value !== "EXCLUIR") { error.textContent = "Digite EXCLUIR para confirmar."; return; }
          busy = true; send.disabled = true; cancel.disabled = true;
          let deleted = false;
          try {
            const result = await rpc("delete_wms_caixa_request_permanently", { request_key: request.id, code: context.warehouse, confirmation: input.value, expected_updated_at: request.updated_at });
            if (result !== true) throw new Error("O servidor não confirmou a exclusão.");
            if (!current()) return;
            deleted = true; ++revision; rows = rows.filter(row => row.id !== request.id); snapshot = "";
            observed.delete(request.id); detailsState.delete(request.id);
            notices.length = 0; notice.textContent = ""; chat.reconcile(rows); renderPending(rows); renderList(); showUnread();
            feedback.textContent = "Solicitação e dados vinculados excluídos definitivamente.";
            await context.onDeleted?.(request); await refresh();
          } catch (failure) {
            if (current()) { if (deleted) feedback.textContent = "Exclusão concluída. Atualize a fila para recarregar os demais dados.";
              else error.textContent = failure.message + " Nenhum sucesso de exclusão foi confirmado. Atualize antes de tentar novamente."; }
          } finally { busy = false; if (current()) { send.disabled = false; cancel.disabled = false; } }
        });
      }
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
      }
      if (request.kind === "PRODUCT" && isStock) {
        if (!request.claimed_by && request.status === "PENDENTE" && context.claimProduct) action(actions, "Assumir atendimento", async () => { await context.claimProduct(request.replenishment_id); snapshot = ""; await refresh(); filter.tab = "mine"; renderList(); }).className = "primary-button";
        else if (request.claimed_by === context.actor && context.openProduct && !["CONCLUIDO", "CANCELADO", "ENTREGUE_NA_LOJA", "SEM_ESTOQUE"].includes(request.status)) action(actions, "Atender na reposição", () => context.openProduct(request.replenishment_id)).className = "primary-button";
      }
      if (canChat(request) && !(context.role === "CAIXA" && request.kind === "ADJUSTMENT" && !isCaixaClosed(request))) {
        const button = action(actions, context.role === "CAIXA" ? "Conversar com estoque" : "Conversar com caixa", () => chat.open(request));
        button.dataset.chatRequest = request.id;
      }
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
    showUnread();
  }
  action(compactControls, "Atualizar", async () => { snapshot = ""; await refresh(); });

  if (context.role === "CAIXA") {
    const lookup = createCaixaProductLookup({ client: context.client, warehouse: context.warehouse, isCurrent: current });
    const layout = node("div", undefined); layout.className = "ca-cashier-layout"; host.insertBefore(layout, controls);
    const composer = node("section", undefined, layout); composer.className = "ca-composer-panel";
    const side = node("aside", undefined, layout); side.className = "ca-pending-panel";
    const tracking = node("details", undefined, host); tracking.className = "ca-cashier-tracking";
    node("summary", "Pedidos e histórico detalhado", tracking);
    for (const element of [controls, feedback, compactControls, secondary, list]) tracking.append(element);
    const descriptions = new Map(), requestedDescriptions = new Set();
    let pendingRows = [], showAll = false, historyOpen = false;
    const pendingCards = new Map();
    const heading = node("div", undefined, side); heading.className = "ca-pending-heading";
    node("h3", "Pendentes de Ajuste", heading); const count = node("strong", "0", heading);
    const newAdjustment = node("button", "+ Novo ajuste", side); newAdjustment.type = "button"; newAdjustment.className = "secondary-button ca-new-adjustment";
    const sideFeedback = node("p", "", side); sideFeedback.className = "ca-side-feedback"; sideFeedback.setAttribute("role", "status");
    const pendingList = node("div", undefined, side);
    const more = node("button", "", side); more.type = "button"; more.className = "secondary-button";
    more.addEventListener("click", () => { showAll = !showAll; renderPending(pendingRows); });
    const history = node("details", undefined, side); history.className = "ca-pending-history";
    history.addEventListener("toggle", () => { historyOpen = history.open; });
    node("small", "Estoque " + context.warehouse + " · atualização automática a cada 15 s · até 100 solicitações.", side).className = "ca-pending-limit";
    async function changePending(id, operation, observation = "") {
      const request = pendingRows.find(row => row.id === id);
      if (!current() || !request || request.status !== "AGUARDANDO_CONFIRMACAO_CAIXA" || isCaixaClosed(request)) throw new Error("Aguarde a resposta do estoquista ou atualize o painel.");
      await rpc("act_wms_caixa_adjustment", { request_key: id, operation, observation });
      snapshot = ""; await refresh();
    }
    function reveal(request) {
      rows = pendingRows;
      tracking.open = true;
      filter.tab = isCaixaClosed(request) ? "closed" : request.status === "AGUARDANDO_CONFIRMACAO_CAIXA" ? "waiting" : "available";
      filter.search = ""; search.value = "";
      const state = detailsState.get(request.id) || { drafts: {}, history: null }; state.open = true; detailsState.set(request.id, state);
      renderList();
      const row = Array.from(list.querySelectorAll("article")).find(element => element.dataset.requestId === request.id);
      row?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    renderPending = nextRows => {
      if (!current()) return;
      pendingRows = nextRows.filter(request => request.warehouse_code === context.warehouse && request.requested_by === context.actor);
      const open = pendingRows.filter(request => request.kind === "ADJUSTMENT" && !isCaixaClosed(request) && request.status !== "CONCLUIDO")
        .sort((a,b) => Number(!!b.customer_service)-Number(!!a.customer_service) || Date.parse(a.created_at)-Date.parse(b.created_at));
      count.textContent = String(open.length);
      const visible = showAll ? open : open.slice(0,5);
      for (const [id, cached] of pendingCards) {
        if (!visible.some(request => request.id === id)) { cached.row.remove(); pendingCards.delete(id); }
      }
      const empty = pendingList.querySelectorAll("p");
      for (const element of empty) { if (element.className === "ca-pending-empty") element.remove(); }
      if (!open.length) node("p", "Nenhum ajuste pendente", pendingList).className = "ca-pending-empty";
      for (const request of visible) {
        const signature = JSON.stringify([request, descriptions.get(request.sku)]);
        const cached = pendingCards.get(request.id);
        if (cached?.signature === signature) continue;
        // Keep an active correction draft attached while an unrelated field updates.
        if (cached?.row.contains(document.activeElement) && request.status === "AGUARDANDO_CONFIRMACAO_CAIXA") continue;
        const row = cached?.row || node("article", undefined, pendingList); row.replaceChildren(); row.className = "ca-pending-row"; row.dataset.pendingId = request.id;
        pendingCards.set(request.id, { row, signature });
        const top = node("div", undefined, row); node("strong", request.sku, top); node("span", request.quantity + " un.", top);
        node("p", request.product_name || request.nome_material || descriptions.get(request.sku) || "Ajuste solicitado", row);
        // Existing REOPEN preserves the resolution text/owner but clears resolved_at.
        const returned = request.status === "EM_VERIFICACAO" && request.claimed_by && request.resolution_notes && !request.resolved_at;
        const status = request.status === "AGUARDANDO_CONFIRMACAO_CAIXA" ? "AGUARDANDO CAIXA" : returned ? "DEVOLVIDO PARA CORREÇÃO" : request.claimed_by ? "EM ATENDIMENTO" : "AGUARDANDO ESTOQUE";
        node("small", status, row).className = "ca-pending-status";
        if (request.claimed_by_name) node("small", "Responsável: " + request.claimed_by_name, row);
        if (request.notes) node("small", "Motivo: " + request.notes, row);
        const time = node("time", new Date(request.updated_at || request.created_at).toLocaleString("pt-BR"), row);
        if (!request.claimed_by) time.textContent += " · na fila há " + Math.max(0, Math.floor((Date.now() - Date.parse(request.created_at)) / 60000)) + " min";
        if (request.resolution_notes && request.status === "AGUARDANDO_CONFIRMACAO_CAIXA") node("small", "Resolução: " + request.resolution_notes, row);
        const actions = node("div", undefined, row); actions.className = "ca-pending-actions";
        const state = detailsState.get(request.id) || { drafts: {}, history: null }; detailsState.set(request.id,state);
        const sideAction = (label, execute) => action(actions, label, async () => {
          try { await execute(); if (current() && label !== "Conversar") sideFeedback.textContent = "Solicitação atualizada."; }
          catch (error) { if (current()) sideFeedback.textContent = error.message; throw error; }
        });
        if (request.status === "AGUARDANDO_CONFIRMACAO_CAIXA") {
          sideAction("Passou", () => changePending(request.id, "CONFIRM")).className = "primary-button";
          const failure = node("form", undefined, row); failure.className = "ca-pending-failure"; failure.hidden = !state.failureOpen;
          const input = node("textarea", undefined, failure); input.maxLength = 2000; input.rows = 2; input.placeholder = "Informe o que continua errado"; input.setAttribute("aria-label", "Motivo da correção · SKU " + request.sku);
          input.value = state.drafts.failure || ""; input.addEventListener("input", () => { state.drafts.failure = input.value; });
          const button = node("button", "Não passou", actions); button.type = "button"; button.className = "secondary-button";
          button.addEventListener("click", () => { failure.hidden = !failure.hidden; state.failureOpen = !failure.hidden; if (!failure.hidden) input.focus?.(); });
          const send = node("button", "Devolver para correção", failure); send.type = "submit"; send.className = "secondary-button";
          failure.addEventListener("submit", async event => {
            event.preventDefault(); if (busy || !current()) return;
            const value = input.value.trim();
            if (value.length < 3) { sideFeedback.textContent = "Informe por que não passou."; return; }
            busy = true; send.disabled = true;
            try { await changePending(request.id,"REOPEN",value); state.drafts.failure = ""; state.failureOpen = false; if (current()) sideFeedback.textContent = "Devolvido para correção."; }
            catch (error) { if (current()) sideFeedback.textContent = error.message; }
            finally { busy = false; if (current()) send.disabled = false; }
          });
        }
        if (canChat(request)) { const button = sideAction("Conversar", () => chat.open(pendingRows.find(row => row.id === request.id) || request)); button.dataset.chatRequest = request.id; button.dataset.compactChat = "true"; row.append(button); }
        const button = node("button", "Ver detalhes", actions); button.type = "button"; button.className = "secondary-button"; button.addEventListener("click", () => reveal(request));
        if (!request.product_name && !request.nome_material && !descriptions.has(request.sku) && !requestedDescriptions.has(request.sku)) {
          requestedDescriptions.add(request.sku);
          lookup.lookup(request.sku).then(result => { if (current() && result.state === "found" && result.item.name) { descriptions.set(request.sku,result.item.name); renderPending(pendingRows); } }).catch(() => {});
        }
      }
      more.hidden = open.length <= 5; more.textContent = showAll ? "Mostrar menos" : "Ver todos os ajustes (" + open.length + ")";
      const closed = pendingRows.filter(isCaixaClosed).sort((a,b) => Date.parse(b.updated_at || b.created_at)-Date.parse(a.updated_at || a.created_at));
      history.replaceChildren(); history.open = historyOpen; node("summary", "Histórico de solicitações (" + closed.length + ")", history);
      for (const request of closed.slice(0,5)) {
        const row = node("div", undefined, history); row.className = "ca-history-row";
        node("strong", request.sku + " · " + request.quantity + " un.", row);
        if (canChat(request)) action(row, "Consultar conversa", () => chat.open(request));
        node("small", (labels[request.status] || request.status) + " · " + new Date(request.updated_at || request.created_at).toLocaleString("pt-BR"), row);
      }
      if (closed.length) {
        const all = node("button", "Ver todas", history); all.type = "button"; all.className = "secondary-button"; all.addEventListener("click", () => reveal(closed[0]));
      } else node("p", "Nenhuma solicitação encerrada.", history);
      showUnread();
    };
    const requestComposer = mountCaixaRequestComposer(composer, { ...context, lookup, rpc, isCurrent: current, onSubmitted: refresh, onFound: item => { if (item.name) { descriptions.set(item.sku,item.name); renderPending(pendingRows); } } });
    newAdjustment.addEventListener("click", () => { if (!requestComposer.newAdjustment()) sideFeedback.textContent = "Confirme o envio em andamento antes de iniciar outro ajuste."; });
  }

  refresh().then(() => pollMessageNotices()).catch(error => { if (current()) feedback.textContent = error.message; });
  const synchronization = createOperationalSync({ client: context.client, actor: context.actor, role: context.role, warehouse: context.warehouse, isCurrent: current,
    allowRealtime: context.allowOperationalRealtime === true,
    onStop: () => { chat.clear(); context.onUnreadMessages?.({ count: 0 }); },
    onState: value => { syncState.textContent = "Sincronização: " + ({ CONECTADO: "conectado", RECONECTANDO: "reconectando", SINCRONIZANDO: "atualizando", DADOS_POSSIVELMENTE_DESATUALIZADOS: "consulta de segurança ativa", FALHA_SINCRONIZACAO: "falha ao atualizar; nova tentativa automática" }[value] || value); },
    onRefresh: async ({ tables }) => {
      if (busy) return false;
      if (tables.includes("all") || tables.includes("wms_caixa_requests")) await refresh(true);
      if (tables.includes("all") || tables.includes("wms_caixa_request_messages")) { await pollMessageNotices(); await chat.poll(); }
      return true;
    }
  });
  host.caixaStop = () => { synchronization.stop(); chat.clear(); context.onUnreadMessages?.({ count: 0 }); };
}
