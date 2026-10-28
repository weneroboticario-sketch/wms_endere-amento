import { interpretWhatsAppMessage } from "./whatsapp-message.js";
import { assistedItemState, createAssistedGateway } from "./whatsapp-assisted-api.js";

function element(tag, text, parent) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  parent?.append(node);
  return node;
}

function selectField(parent, label, options) {
  const wrapper = element("label", label + " ", parent);
  const select = element("select", undefined, wrapper);
  options.forEach(([value, text]) => { const option = element("option", text, select); option.value = value; });
  return select;
}

function inputField(parent, label, type = "text") {
  const wrapper = element("label", label + " ", parent);
  const input = element("input", undefined, wrapper);
  input.type = type;
  return input;
}

export function renderWhatsAppAssistedLive(host, context) {
  let panel = host.querySelector("[data-whatsapp-live]");
  if (!context.allowed || context.warehouse !== "VDCG") { panel?.remove(); return; }
  const scope = `${context.actor}:${context.warehouse}:${context.supervisor}`;
  if (panel?.dataset.scope === scope) return;
  panel?.remove();
  panel = element("section", undefined);
  panel.className = "panel";
  panel.dataset.whatsappLive = "true";
  panel.dataset.scope = scope;
  host.prepend(panel);
  const gateway = createAssistedGateway(context.client, context);
  let busy = false;
  let data = { requests: [], items: [] };
  let draft = null;
  let submitted = false;
  const active = () => panel.isConnected && context.isCurrent();
  element("h3", "WhatsApp | Solicitações", panel);
  element("p", "Importação assistida do VDCG. Não acessa o WhatsApp nem movimenta saldos. O horário de entrada é o da aprovação, não o horário comprovado da mensagem.", panel);
  const status = element("p", "", panel);
  status.setAttribute("role", "status");
  const connection = element("p", "Conexão: consultando solicitações…", panel);
  const action = (parent, label, handler) => {
    const button = element("button", label, parent);
    button.type = "button";
    button.className = "secondary-button";
    button.addEventListener("click", async () => {
      if (busy || !active()) return;
      busy = true;
      button.disabled = true;
      status.textContent = "Processando…";
      try {
        await handler();
        if (active()) status.textContent = "Operação concluída. Dados atualizados.";
      } catch (error) {
        if (active()) status.textContent = `Não confirmado: ${error.message}. Se a conexão caiu, atualize para conferir antes de repetir. Não houve confirmação de sucesso.`;
      } finally { busy = false; if (active()) button.disabled = false; }
    });
    return button;
  };
  const filters = element("div", undefined, panel);
  const clientFilter = selectField(filters, "Cliente", [["", "Todos"], ["yes", "Atendimento ao cliente"]]);
  const priorityFilter = selectField(filters, "Prioridade", [["", "Todas"], ["1", "Cliente"], ["2", "Urgência"], ["3", "Abastecimento"], ["4", "Verificação / rotina"]]);
  const stateFilter = selectField(filters, "Status", [["", "Todos"], ...["PENDENTE", "PARCIAL", "VERIFICACAO", "AGUARDANDO_VALIDACAO", "CONCLUIDA", "CANCELADA"].map(state => [state, state])]);
  const ownerFilter = selectField(filters, "Responsável", [["", "Todos"], ...(context.users || []).map(user => [user.id, user.name])]);
  const fromFilter = inputField(filters, "A partir de", "date");
  const toFilter = inputField(filters, "Até", "date");
  const summary = element("p", "", panel);
  const queue = element("div", undefined, panel);
  const renderQueue = () => {
    queue.replaceChildren();
    if (context.supervisor) element("p", `Entrada de novas solicitações: ${data.intakeEnabled ? "habilitada" : "pausada"}. Atendimentos existentes continuam disponíveis.`, queue);
    const clients = data.items.filter(item => item.customer_service && item.kind !== "ADJUSTMENT" && !["CONCLUIDA", "CANCELADA"].includes(assistedItemState(item)));
    summary.textContent = `${context.supervisor ? data.requests.length + " solicitações (até 50 mais recentes)" : "Seus itens atribuídos"} | Cliente pendente: ${clients.length} | Unidades atendidas: ${data.items.filter(item => item.kind === "REPLENISHMENT").reduce((sum, item) => sum + item.attended, 0)} | Unidades pendentes: ${data.items.filter(item => item.kind === "REPLENISHMENT" && assistedItemState(item) !== "CANCELADA").reduce((sum, item) => sum + item.requested - item.attended, 0)} | Ajustes a verificar: ${data.items.filter(item => item.kind === "ADJUSTMENT" && !item.verified_at && assistedItemState(item) !== "CANCELADA").length}`;
    const visible = data.items.filter(item => {
      const date = new Date(item.created_at).toLocaleDateString("sv-SE");
      return (!clientFilter.value || item.customer_service) && (!priorityFilter.value || item.priority === Number(priorityFilter.value))
        && (!stateFilter.value || assistedItemState(item) === stateFilter.value) && (!ownerFilter.value || item.task?.atribuido_para === ownerFilter.value)
        && (!fromFilter.value || date >= fromFilter.value) && (!toFilter.value || date <= toFilter.value);
    }).sort((first, second) => first.priority - second.priority || first.created_at.localeCompare(second.created_at) || first.source_line - second.source_line);
    if (!visible.length) element("p", "Nenhum item para esses filtros.", queue);
    visible.forEach(item => {
      const row = element("fieldset", undefined, queue);
      element("legend", `SKU ${item.sku} — ${item.kind === "ADJUSTMENT" ? "VERIFICAÇÃO DE AJUSTE" : item.customer_service ? "ATENDIMENTO AO CLIENTE — PRIORIDADE MÁXIMA" : "Prioridade " + item.priority}`, row);
      const state = assistedItemState(item);
      const owner = (context.users || []).find(user => user.id === item.task?.atribuido_para);
      element("p", `Solicitação: ${item.request_id} | Status: ${state} | Responsável: ${owner?.name || item.task?.atribuido_para || "Não atribuído"}`, row);
      element("p", `Entrada: ${new Date(item.created_at).toLocaleString("pt-BR")} | Início: ${item.task?.data_inicio ? new Date(item.task.data_inicio).toLocaleString("pt-BR") : "não iniciado"} | Conclusão: ${item.task?.data_conclusao ? new Date(item.task.data_conclusao).toLocaleString("pt-BR") : "não concluído"}`, row);
      element("p", item.kind === "ADJUSTMENT" ? `Quantidade informada para verificação: ${item.requested}. Nenhum saldo será alterado.` : `Solicitada: ${item.requested} | Atendida: ${item.attended} | Pendente: ${item.requested - item.attended}`, row);
      element("p", item.observation, row);
      if (!["CONCLUIDA", "CANCELADA", "AGUARDANDO_VALIDACAO"].includes(state)) {
        if (context.supervisor) {
          const user = selectField(row, "Atribuir para", [["", "Selecione um operador"], ...(context.users || []).map(person => [person.id, person.name])]);
          action(row, "Atribuir", async () => { if (!user.value) throw new Error("Selecione um operador."); await gateway.assign(item, user.value); await changed(); });
        }
        action(row, "Iniciar atendimento", async () => { await gateway.start(item); await changed(); });
        if (item.kind === "ADJUSTMENT" && context.supervisor) {
          const note = inputField(row, "Resultado da verificação (não executa ajuste)");
          note.maxLength = 2000;
          let attempt;
          action(row, "Registrar verificação", async () => {
            if (!attempt && note.value.trim().length < 3) throw new Error("Descreva o resultado da verificação.");
            attempt ||= { note: note.value, key: crypto.randomUUID() };
            note.readOnly = true;
            try { await gateway.verify(item, attempt.note, attempt.key); }
            catch (error) { if (error.confirmedFailure) { attempt = null; note.readOnly = false; } throw error; }
            await changed();
          });
        } else if (item.kind !== "ADJUSTMENT" && item.attended < item.requested) {
          const quantity = inputField(row, "Quantidade atendida agora", "number");
          quantity.min = "1"; quantity.max = String(item.requested - item.attended); quantity.step = "1";
          let attempt;
          action(row, "Registrar quantidade", async () => {
            if (!attempt && (!Number.isSafeInteger(Number(quantity.value)) || Number(quantity.value) < 1 || Number(quantity.value) > item.requested - item.attended)) throw new Error("Informe uma quantidade inteira positiva até a pendente.");
            attempt ||= { quantity: Number(quantity.value), key: crypto.randomUUID() };
            quantity.readOnly = true;
            try { await gateway.fulfill(item, attempt.quantity, attempt.key); }
            catch (error) { if (error.confirmedFailure) { attempt = null; quantity.readOnly = false; } throw error; }
            await changed();
          });
        }
      }
      if (context.supervisor && state === "AGUARDANDO_VALIDACAO") action(row, "Validar atendimento", async () => { await gateway.validate(item); await changed(); });
    });
    if (context.supervisor) data.requests.forEach(request => {
      const details = element("details", undefined, queue);
      const items = data.items.filter(item => item.request_id === request.id);
      const completed = items.filter(item => ["CONCLUIDA", "CANCELADA"].includes(assistedItemState(item))).length;
      const closed = completed === items.length && items.length;
      const cancelled = items.some(item => assistedItemState(item) === "CANCELADA");
      element("summary", `Solicitação ${request.id}: ${completed}/${items.length} resolvidos — ${closed ? cancelled ? "encerrada com cancelamentos" : "concluída" : "com pendências"}`, details);
      element("p", `${request.source_group} | Aprovada por: ${request.approved_by} | ${new Date(request.approved_at).toLocaleString("pt-BR")}`, details);
      element("pre", request.original_text, details);
      const history = element("div", undefined, details);
      action(details, "Carregar histórico da solicitação", async () => {
        const events = await gateway.history(request.id);
        if (!active()) return;
        history.replaceChildren();
        events.forEach(event => element("p", `${new Date(event.created_at).toLocaleString("pt-BR")} | ${event.actor_id} | ${event.event_type} | ${event.amount ?? ""} ${event.note || ""}`, history));
      });
    });
  };
  const refresh = async () => {
    try {
      const result = await gateway.load();
      if (active()) { data = result; renderQueue(); connection.textContent = `Conexão disponível. Última consulta: ${new Date().toLocaleString("pt-BR")}. Atualização manual, sem leitura do WhatsApp.`; }
    } catch (error) { if (active()) connection.textContent = "Falha na consulta. Os dados exibidos podem estar desatualizados."; throw error; }
  };
  const changed = async () => { await refresh(); if (active()) context.onChanged?.(); };
  [clientFilter, priorityFilter, stateFilter, ownerFilter, fromFilter, toFilter].forEach(filter => filter.addEventListener("change", renderQueue));
  action(panel, "Atualizar solicitações", refresh);
  if (context.supervisor) {
    action(panel, "Pausar novas importações", async () => { await gateway.setIntake(false); await refresh(); });
    action(panel, "Retomar novas importações", async () => { await gateway.setIntake(true); await refresh(); });
  }
  if (context.supervisor && context.intake !== false) {
    const editor = element("details", undefined);
    panel.insertBefore(editor, filters);
    element("summary", "Importar e revisar mensagem", editor);
    element("p", "Cole apenas conteúdo operacional autorizado, sem dados pessoais de clientes. Revise todos os trechos antes de aprovar. Sem envio automático de mensagens.", editor);
    const raw = element("textarea", undefined, editor); raw.maxLength = 20000; raw.rows = 6; raw.setAttribute("aria-label", "Mensagem original autorizada");
    const review = element("div", undefined, editor);
    const acknowledge = inputField(editor, "Revisei todos os trechos, SKUs, quantidades e prioridades", "checkbox");
    const duplicate = inputField(editor, "Confirmei que uma mensagem semelhante corresponde a outra solicitação legítima", "checkbox");
    const renderDraft = () => {
      review.replaceChildren();
      draft?.lines.forEach(line => {
        const row = element("fieldset", undefined, review);
        element("legend", `Linha ${line.sourceLine}`, row);
        const sku = inputField(row, "SKU"); sku.value = line.sku; sku.maxLength = 8;
        const quantity = inputField(row, "Quantidade", "number"); quantity.min = "1"; quantity.step = "1"; quantity.value = line.quantity === null ? "" : String(line.quantity);
        const kind = selectField(row, "Operação", [["REPLENISHMENT", "Abastecimento"], ["ADJUSTMENT", "Verificação de ajuste"]]); kind.value = line.kind;
        const priority = selectField(row, "Prioridade", [["1", "Cliente"], ["2", "Urgência"], ["3", "Abastecimento"], ["4", "Rotina"]]); priority.value = String(line.priority);
        const note = inputField(row, "Observação"); note.maxLength = 2000; note.value = line.observation || "";
        [sku, quantity, kind, priority, note].forEach(field => field.addEventListener("input", () => {
          if (submitted) return;
          Object.assign(line, { sku: sku.value.trim(), quantity: quantity.value ? Number(quantity.value) : null, kind: kind.value, priority: kind.value === "ADJUSTMENT" ? 4 : Number(priority.value), client: priority.value === "1", observation: note.value });
          acknowledge.checked = false;
        }));
        element("p", (line.warnings || []).join(" "), row);
      });
    };
    action(editor, "Interpretar mensagem", async () => {
      if (submitted) throw new Error("Atualize e confira o resultado da aprovação anterior antes de limpar ou iniciar outra.");
      const result = interpretWhatsAppMessage(raw.value);
      draft = { id: crypto.randomUUID(), original: result.original, lines: result.lines };
      acknowledge.checked = false; duplicate.checked = false; renderDraft();
      if (result.review.length) element("p", result.review.join(" "), review);
    });
    raw.addEventListener("input", () => { if (!submitted) { draft = null; review.replaceChildren(); acknowledge.checked = false; } });
    action(editor, "Adicionar item manual", async () => {
      if (submitted) throw new Error("Aprovação anterior ainda precisa ser conferida.");
      draft ||= { id: crypto.randomUUID(), original: raw.value, lines: [] };
      draft.lines.push({ sku: "", quantity: null, sourceLine: Math.max(0, ...draft.lines.map(line => line.sourceLine)) + 1, kind: "REPLENISHMENT", priority: 3, client: false, observation: "" });
      acknowledge.checked = false; renderDraft();
    });
    let pending;
    action(editor, "Aprovar e criar tarefas", async () => {
      if (!data.intakeEnabled && !pending) throw new Error("Novas importações estão pausadas. Retome a entrada antes de aprovar.");
      if (!draft || !acknowledge.checked) throw new Error("Revise e confirme todos os itens antes de aprovar.");
      if (!draft.lines.length || draft.lines.length > 100 || draft.lines.some(line => !/^\d{4,8}$/.test(line.sku) || !Number.isSafeInteger(line.quantity) || line.quantity < 1)) throw new Error("Revise os SKUs e quantidades (até 100 itens).");
      pending ||= { draft: JSON.parse(JSON.stringify(draft)), duplicate: duplicate.checked };
      submitted = true;
      raw.readOnly = true;
      review.querySelectorAll("input,select").forEach(field => { field.disabled = true; });
      try { await gateway.approve(pending.draft, pending.duplicate); }
      catch (error) {
        if (error.confirmedFailure) {
          submitted = false; pending = null; raw.readOnly = false;
          review.querySelectorAll("input,select").forEach(field => { field.disabled = false; });
          acknowledge.checked = false;
        }
        throw error;
      }
      await refresh();
      draft = null; pending = null; submitted = false; raw.readOnly = false; raw.value = ""; review.replaceChildren(); acknowledge.checked = false;
      context.onChanged?.();
    });
    action(editor, "Conferir aprovação anterior e liberar nova mensagem", async () => {
      await refresh();
      if (pending && !data.requests.some(request => request.id === pending.draft.id)) throw new Error("A aprovação não consta nas últimas 50 solicitações; tente reenviar a mesma aprovação ou peça conferência ao administrador.");
      submitted = false; pending = null; draft = null; raw.readOnly = false; raw.value = ""; review.replaceChildren(); acknowledge.checked = false;
    });
  }
  refresh().catch(error => { if (active()) status.textContent = `Integração indisponível: ${error.message}. Não aprovar até o banco ser preparado e autorizado.`; });
}
