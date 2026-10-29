import { isCaixaClosed } from "./caixa-queue-view.js";

function node(tag, text, parent) {
  const element = document.createElement(tag); if (text !== undefined) element.textContent = text; parent?.append(element); return element;
}

export function mountCaixaChat({ host, context, rpc, canChat, notify }) {
  const states = new Map();
  let request = null;
  const current = () => host.isConnected && context.isCurrent();
  const chat = node("aside", undefined, host); chat.className = "ca-chat"; chat.hidden = true;
  chat.setAttribute("aria-label", "Conversa da solicitação");
  const header = node("header", undefined, chat);
  const title = node("strong", "Conversa da solicitação", header);
  const closeButton = node("button", "Fechar", header); closeButton.type = "button"; closeButton.className = "secondary-button";
  const metadata = node("p", "", chat); metadata.className = "ca-chat-context";
  const status = node("p", "", chat); status.setAttribute("role", "status");
  const earlier = node("button", "Carregar mensagens anteriores", chat); earlier.type = "button"; earlier.hidden = true; earlier.className = "secondary-button";
  const messages = node("div", undefined, chat); messages.className = "ca-chat-messages";
  const form = node("form", undefined, chat); form.className = "ca-chat-form";
  const input = node("textarea", undefined, form); input.maxLength = 1000; input.placeholder = "Escreva ao caixa ou estoquista..."; input.setAttribute("aria-label", "Mensagem");
  const submit = node("button", "Enviar mensagem", form); submit.type = "submit"; submit.className = "primary-button";
  const stateFor = id => {
    if (!states.has(id)) states.set(id, { draft: "", pending: null, sending: false, loading: false, messages: [], snapshot: "", hasEarlier: false, loaded: false });
    return states.get(id);
  };
  const saveDraft = () => { if (request) stateFor(request.id).draft = input.value; };
  function drawInput() {
    if (!request || !current()) return;
    const state = stateFor(request.id);
    if (input.value !== state.draft) input.value = state.draft;
    input.disabled = state.sending || !!state.pending || isCaixaClosed(request);
    submit.disabled = state.sending || (isCaixaClosed(request) && !state.pending);
    submit.textContent = state.pending && !state.sending ? "Verificar envio / reenviar" : "Enviar mensagem";
    metadata.textContent = `Solicitante: ${request.requested_by_name || "Caixa"} · Responsável: ${request.claimed_by_name || "Não assumido"} · ${request.status === "AGUARDANDO_CONFIRMACAO_CAIXA" ? "Aguardando confirmação do caixa" : isCaixaClosed(request) ? "Encerrado · histórico" : "Em atendimento"}`;
  }
  function drawMessages(state, prepend = false) {
    const snapshot = JSON.stringify(state.messages);
    if (snapshot === state.snapshot) return;
    const oldTop = messages.scrollTop || 0, oldHeight = messages.scrollHeight || 0;
    const atBottom = oldHeight - oldTop - (messages.clientHeight || 0) < 60;
    state.snapshot = snapshot; messages.replaceChildren();
    if (!state.messages.length) node("p", "Nenhuma mensagem ainda.", messages);
    for (const message of state.messages) {
      const bubble = node("article", undefined, messages); bubble.className = "ca-chat-bubble" + (message.sender_id === context.actor ? " ca-chat-mine" : "");
      node("small", message.sender_id === context.actor ? "Você" : message.sender_name || (message.sender_id === request.requested_by ? "Caixa" : "Equipe de estoque"), bubble);
      node("p", message.body, bubble);
      node("time", new Date(message.created_at).toLocaleString("pt-BR"), bubble);
    }
    messages.scrollTop = prepend ? oldTop + (messages.scrollHeight || 0) - oldHeight : atBottom ? messages.scrollHeight : oldTop;
  }
  async function loadMessages(older = false) {
    const captured = request;
    if (!captured || !current() || !canChat(captured)) return;
    const state = stateFor(captured.id);
    if (state.loading) return;
    state.loading = true;
    try {
      let query = context.client.from("wms_caixa_request_messages").select("id,request_id,sender_id,sender_name,body,created_at").eq("request_id", captured.id).order("id", { ascending: false }).limit(100);
      if (older && state.messages.length) query = query.lt("id", state.messages[0].id);
      const response = await query;
      if (!current() || request?.id !== captured.id || !canChat(request)) return;
      if (response.error) throw new Error(response.error.message || "Não foi possível carregar a conversa.");
      const batch = response.data || [], initial = !state.loaded;
      state.loaded = true;
      const known = new Set(state.messages.map(message => String(message.id)));
      const merged = new Map(state.messages.map(message => [String(message.id), message]));
      batch.forEach(message => merged.set(String(message.id), message));
      state.messages = [...merged.values()].sort((a, b) => String(a.id).localeCompare(String(b.id), "en", { numeric: true }));
      if (older || initial) state.hasEarlier = batch.length === 100;
      earlier.hidden = !state.hasEarlier;
      if (!initial && !older) batch.filter(message => !known.has(String(message.id)) && message.sender_id !== context.actor).forEach(message => notify(`message:${captured.id}:${message.id}`, `Nova mensagem · SKU ${captured.sku}`));
      drawMessages(state, older);
      if (!state.pending) status.textContent = isCaixaClosed(request) ? "Solicitação encerrada. Histórico preservado." : "";
    } catch (error) { if (current() && request?.id === captured.id) status.textContent = "Conversa indisponível: " + error.message; }
    finally { state.loading = false; }
  }
  function close(clear = false) {
    if (!clear) saveDraft();
    request = null; chat.hidden = true; input.value = ""; messages.replaceChildren(); status.textContent = "";
    if (clear) states.clear();
  }
  closeButton.addEventListener("click", () => close());
  input.addEventListener("input", () => { if (request && !stateFor(request.id).pending) stateFor(request.id).draft = input.value; });
  earlier.addEventListener("click", () => loadMessages(true));
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const captured = request;
    if (!captured || !current() || !canChat(captured)) return;
    const state = stateFor(captured.id);
    if (state.sending || (isCaixaClosed(captured) && !state.pending)) return;
    const body = state.pending?.body || input.value.trim();
    if (!body || body.length > 1000) { status.textContent = "Escreva uma mensagem de até 1.000 caracteres."; return; }
    state.draft = body; state.pending ||= { id: crypto.randomUUID(), body }; state.sending = true; drawInput();
    try {
      await rpc("send_wms_caixa_message", { request_key: captured.id, action_key: state.pending.id, body: state.pending.body });
      if (!current()) return;
      state.pending = null; state.draft = "";
      if (request?.id === captured.id) { input.value = ""; await loadMessages(); status.textContent = "Mensagem enviada."; }
    } catch (error) {
      if (!current()) return;
      if (error.confirmedFailure) state.pending = null;
      if (request?.id === captured.id) status.textContent = error.message + (state.pending ? " Use Verificar envio / reenviar; o mesmo envio será verificado sem duplicar." : " Corrija e tente novamente.");
    } finally { state.sending = false; if (request?.id === captured.id) drawInput(); }
  });
  return {
    async open(next) {
      if (!current() || !canChat(next)) return;
      saveDraft(); request = next; const state = stateFor(next.id); state.snapshot = "";
      title.textContent = `Conversa · SKU ${next.sku} · ${next.quantity} un.`;
      chat.hidden = false; drawInput(); drawMessages(state); status.textContent = "Carregando conversa..."; await loadMessages();
    },
    async poll() { if (!current()) { close(true); return; } if (request && !chat.hidden) await loadMessages(); },
    reconcile(rows) {
      if (!current()) { close(true); return; }
      if (!request) return;
      const next = rows.find(row => row.id === request.id);
      if (!next || !canChat(next)) { close(true); return; }
      request = next; drawInput();
    },
    hasDraft: () => !!input.value,
    clear: () => close(true)
  };
}
