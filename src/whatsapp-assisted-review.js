import { interpretWhatsAppMessage } from "./whatsapp-message.js";
import { approveAssistedDraft, fulfillAssistedLine, assistedQueue } from "./whatsapp-assisted-workflow.js";
import { renderWhatsAppAssistedLive } from "./whatsapp-assisted-live.js";

export function renderWhatsAppAssistedReview(host, context) {
  if (!context.live && context.demo !== true) {
    host.querySelector("[data-whatsapp-review]")?.remove();
    host.querySelector("[data-whatsapp-live]")?.remove();
    return;
  }
  if (context.live) {
    host.querySelector("[data-whatsapp-review]")?.remove();
    renderWhatsAppAssistedLive(host, context);
    return;
  }
  host.querySelector("[data-whatsapp-live]")?.remove();
  let panel = host.querySelector("[data-whatsapp-review]");
  if (!context.allowed || context.warehouse !== "VDCG") { panel?.remove(); return; }
  const scope = `${context.actor}:${context.warehouse}`;
  if (panel?.dataset.scope === scope) return;
  panel?.remove();
  panel = document.createElement("section");
  panel.className = "panel";
  panel.dataset.whatsappReview = "true";
  panel.dataset.scope = scope;
  const title = document.createElement("h3");
  title.textContent = "WhatsApp | Solicitações — revisão experimental";
  const explanation = document.createElement("p");
  explanation.textContent = "Cole uma mensagem do grupo VDCG | Abastecimento Loja. Revisão local: nada será salvo ou enviado e nenhuma tarefa será criada nesta etapa. Nomes citados não atribuem responsáveis. Limpe ao terminar.";
  const input = document.createElement("textarea");
  input.maxLength = 20000;
  input.rows = 8;
  input.setAttribute("aria-label", "Mensagem original do WhatsApp");
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  const output = document.createElement("div");
  let draft = null;
  const requests = [];
  const queue = document.createElement("div");
  const approve = document.createElement("button");
  approve.type = "button";
  approve.textContent = "Simular aprovação — não cria tarefas reais";
  approve.disabled = true;
  const acknowledge = document.createElement("input");
  acknowledge.type = "checkbox";
  const acknowledgeLabel = document.createElement("label");
  acknowledgeLabel.textContent = "Revisei todos os itens, prioridades e possíveis duplicidades. ";
  acknowledgeLabel.append(acknowledge);
  const drawQueue = () => {
    queue.replaceChildren();
    if (!requests.length) return;
    const heading = document.createElement("h3");
    heading.textContent = "Fila simulada — somente na memória desta tela";
    queue.append(heading);
    assistedQueue(requests).forEach(line => {
      const row = document.createElement("fieldset");
      const description = document.createElement("legend");
      description.textContent = `SKU ${line.sku} | ${line.client ? "CLIENTE" : "Prioridade " + line.priority} | Atendido: ${line.attended} | Pendente: ${line.pending}`;
      const amount = document.createElement("input");
      amount.type = "number";
      amount.min = "1";
      amount.max = String(line.pending);
      amount.value = String(line.pending);
      amount.setAttribute("aria-label", `Quantidade atendida do SKU ${line.sku}`);
      const register = document.createElement("button");
      register.type = "button";
      register.textContent = line.kind === "ADJUSTMENT" ? "Ajuste aguardando verificação" : "Simular atendimento";
      register.disabled = line.kind === "ADJUSTMENT";
      register.addEventListener("click", () => {
        try {
          const request = requests.find(item => item.id === line.requestId);
          fulfillAssistedLine(request, { lineId: line.id, amount: Number(amount.value), operationId: crypto.randomUUID(), expectedRevision: request.revision });
          drawQueue();
        } catch (error) { status.textContent = error.message; }
      });
      row.append(description, amount, register);
      queue.append(row);
    });
    requests.forEach(request => {
      const summary = document.createElement("p");
      summary.textContent = `Solicitação ${request.id}: ${request.lines.filter(line => line.status === "FULFILLED").length}/${request.lines.length} itens atendidos. ${request.status === "FULFILLED" ? "Totalmente atendida." : "Ainda há itens pendentes."} Histórico: ${request.history.length} eventos.`;
      queue.append(summary);
    });
  };
  const analyze = document.createElement("button");
  analyze.type = "button";
  analyze.className = "primary-button";
  analyze.textContent = "Interpretar para revisão";
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "secondary-button";
  clear.textContent = "Limpar mensagem";
  const reset = () => { output.replaceChildren(); status.textContent = ""; draft = null; approve.disabled = true; acknowledge.checked = false; };
  input.addEventListener("input", reset);
  clear.addEventListener("click", () => { input.value = ""; reset(); requests.splice(0); drawQueue(); });
  approve.addEventListener("click", () => {
    if (!draft || !acknowledge.checked) { status.textContent = "Confirme a revisão antes de simular a aprovação."; return; }
    try {
      approveAssistedDraft(requests, draft);
      approve.disabled = true;
      status.textContent = "Aprovação simulada. Nenhuma tarefa real foi criada; nada foi salvo no banco.";
      drawQueue();
    } catch (error) { status.textContent = error.message; }
  });
  analyze.addEventListener("click", () => {
    reset();
    try {
      const result = interpretWhatsAppMessage(input.value);
      draft = { id: crypto.randomUUID(), original: result.original, lines: result.lines.map(line => ({ ...line })) };
      approve.disabled = !draft.lines.length;
      status.textContent = `${result.lines.length} itens identificados. Confiança indica apenas leitura explícita, não validação de catálogo. ${result.review.join(" ")}`;
      result.lines.forEach(line => {
        const item = document.createElement("fieldset");
        const legend = document.createElement("legend");
        legend.textContent = `SKU ${line.sku} — ${line.kind === "ADJUSTMENT" ? "SOLICITAÇÃO DE AJUSTE" : line.client ? "ATENDIMENTO AO CLIENTE — PRIORIDADE MÁXIMA" : line.priority === 2 ? "URGÊNCIA OPERACIONAL" : "ABASTECIMENTO DE LOJA"}`;
        const original = document.createElement("p");
        original.textContent = `Original: ${line.original}`;
        const label = document.createElement("label");
        label.textContent = "Quantidade para revisão ";
        const quantity = document.createElement("input");
        quantity.type = "number";
        quantity.min = "1";
        quantity.step = "1";
        quantity.value = line.quantity === null ? "" : String(line.quantity);
        quantity.addEventListener("input", () => {
          const edited = draft?.lines.find(item => item.sourceLine === line.sourceLine);
          if (edited) edited.quantity = quantity.value.trim() ? Number(quantity.value) : null;
          acknowledge.checked = false;
        });
        const clientLabel = document.createElement("label");
        clientLabel.textContent = " Atendimento ao cliente ";
        const client = document.createElement("input");
        client.type = "checkbox";
        client.checked = line.client;
        client.addEventListener("change", () => {
          const edited = draft?.lines.find(item => item.sourceLine === line.sourceLine);
          if (edited) { edited.client = client.checked; edited.priority = edited.kind === "ADJUSTMENT" ? 4 : client.checked ? 1 : 3; }
          acknowledge.checked = false;
        });
        clientLabel.append(client);
        label.append(quantity);
        const note = document.createElement("p");
        note.textContent = `Interpretação: ${line.confidence === "EXPLICIT" ? "dados explícitos" : "exige revisão"}. ${line.warnings.join(" ")} Alterações aqui são apenas rascunho; não aprovam tarefa.`;
        item.append(legend, original, label, clientLabel, note);
        output.append(item);
      });
    } catch (error) { status.textContent = error.message; }
  });
  panel.append(title, explanation, input, analyze, clear, status, output, acknowledgeLabel, approve, queue);
  host.prepend(panel);
}
