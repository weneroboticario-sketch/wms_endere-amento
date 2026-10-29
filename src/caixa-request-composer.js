export const DEFAULT_CAIXA_ADJUSTMENT_REASON = "Solicitação de ajuste no atendimento ao cliente.";

export function validateCaixaRequest(request) {
  if (!["PRODUCT", "ADJUSTMENT"].includes(request.kind)) throw new Error("Selecione produto ou ajuste.");
  if (!/^\d{4,8}$/.test(request.sku)) throw new Error("Informe o SKU com 4 a 8 dígitos, mantendo zeros à esquerda.");
  if (!Number.isSafeInteger(request.quantity) || request.quantity < 1 || request.quantity > 9999999) throw new Error("Informe uma quantidade inteira positiva.");
  if (request.notes.length > 2000 || (request.kind === "ADJUSTMENT" && request.notes.trim().length < 3)) throw new Error("Informe o motivo da verificação do ajuste (até 2.000 caracteres).");
  return request;
}

function node(tag, text, parent) {
  const element = document.createElement(tag); if (text !== undefined) element.textContent = text; parent?.append(element); return element;
}

export function mountCaixaRequestComposer(host, context) {
  const form = node("fieldset", undefined, host); form.className = "ca-quick-form";
  node("legend", "Nova solicitação", form);
  let kind = "PRODUCT", item = null, pending = null, sending = false, sequence = 0, timer;
  const choices = node("div", undefined, form); choices.className = "ca-operation"; choices.setAttribute("role", "group"); choices.setAttribute("aria-label", "Tipo da solicitação");
  const buttons = [];
  const codeLabel = node("label", "Código SKU/EAN", form);
  const code = node("input", undefined, codeLabel); code.type = "text"; code.inputMode = "numeric"; code.maxLength = 14; code.autocomplete = "off"; code.placeholder = "Bipe ou digite o código do produto";
  const product = node("div", undefined, form); product.className = "ca-product-preview"; product.setAttribute("role", "status");
  const quantityGroup = node("div", undefined, form); quantityGroup.className = "ca-quantity";
  const quantityLabel = node("label", "Quantidade", quantityGroup);
  const stepper = node("div", undefined, quantityLabel); stepper.className = "ca-stepper";
  const minus = node("button", "−", stepper); minus.type = "button"; minus.setAttribute("aria-label", "Diminuir quantidade");
  const quantity = node("input", undefined, stepper); quantity.type = "number"; quantity.min = "1"; quantity.max = "9999999"; quantity.step = "1"; quantity.value = "1"; quantity.setAttribute("aria-label", "Quantidade");
  const plus = node("button", "+", stepper); plus.type = "button"; plus.setAttribute("aria-label", "Aumentar quantidade");
  const warning = node("p", "", form); warning.className = "ca-balance-warning";
  const reason = node("p", "", form); reason.className = "ca-default-reason";
  const observation = node("details", undefined, form); observation.className = "ca-optional-notes";
  node("summary", "Observação (opcional)", observation);
  const notes = node("textarea", undefined, observation); notes.maxLength = 2000; notes.rows = 2; notes.setAttribute("aria-label", "Observação opcional");
  const status = node("p", "", form); status.setAttribute("role", "status");
  const submit = node("button", "Pedir produto", form); submit.type = "button"; submit.className = "primary-button ca-request-submit"; submit.dataset.requestSubmit = "true";
  function update() {
    const frozen = sending || !!pending;
    for (const input of [code, quantity, notes, minus, plus, ...buttons]) input.disabled = frozen;
    submit.disabled = sending || (!pending && !item);
    submit.textContent = pending && !sending ? "Verificar envio / reenviar" : kind === "ADJUSTMENT" ? "Solicitar ajuste" : "Pedir produto";
    reason.textContent = kind === "ADJUSTMENT" ? "Motivo padrão: " + DEFAULT_CAIXA_ADJUSTMENT_REASON : "";
    reason.hidden = kind !== "ADJUSTMENT";
    quantityGroup.hidden = !item;
    warning.textContent = item && item.captureAvailable !== null && item.captureAvailable !== undefined && Number(quantity.value) > Number(item.captureAvailable) ? "Quantidade acima do saldo disponível na CAPTAÇÃO. A solicitação pode ser enviada para conferência." : "";
  }
  for (const [value, label] of [["PRODUCT", "Pedir produto"], ["ADJUSTMENT", "Solicitar ajuste"]]) {
    const button = node("button", label, choices); button.type = "button"; button.className = "secondary-button"; button.dataset.requestKind = value;
    buttons.push(button);
    button.addEventListener("click", () => {
      if (sending || pending || !context.isCurrent()) return;
      kind = value; buttons.forEach(choice => choice.setAttribute("aria-pressed", String(choice.dataset.requestKind === value))); update();
    });
    button.setAttribute("aria-pressed", String(value === kind));
  }
  function clearProduct(message = "Bipe ou digite um SKU para localizar o produto.") {
    item = null; product.replaceChildren(); node("p", message, product); update();
  }
  async function lookupNow() {
    globalThis.clearTimeout(timer);
    if (sending || pending || !context.isCurrent()) return;
    const requested = code.value.trim(), currentSequence = ++sequence;
    clearProduct("Consultando produto…");
    const result = await context.lookup.lookup(requested);
    if (!context.isCurrent() || sequence !== currentSequence || code.value.trim() !== requested) return;
    if (result.state !== "found") { clearProduct(result.message || "Consulta cancelada."); return; }
    item = result.item; product.replaceChildren();
    node("strong", item.sku, product); node("p", item.name || "Produto sem descrição cadastrada", product);
    const balances = node("div", undefined, product); balances.className = "ca-product-balances";
    const format = value => value === null || value === undefined ? "Saldo indisponível" : Number(value).toLocaleString("pt-BR") + " un.";
    node("span", "CAPTAÇÃO: " + format(item.captureAvailable), balances);
    node("span", "LOJA: " + format(item.storeAvailable), balances);
    const date = item.updatedAt ? new Date(item.updatedAt) : null;
    node("small", date && !Number.isNaN(date.getTime()) ? "Saldo atualizado em " + date.toLocaleString("pt-BR") : "Data de atualização indisponível.", product);
    if (date && Date.now() - date.getTime() > 4 * 60 * 60 * 1000) node("small", "Base sem atualização há mais de 4 horas. Confirme a disponibilidade com o estoque.", product);
    context.onFound?.(item); status.textContent = ""; update();
  }
  code.addEventListener("input", () => {
    sequence++; globalThis.clearTimeout(timer); quantity.value = "1"; clearProduct(code.value ? "Aguardando leitura do código…" : undefined);
    if (code.value.trim()) timer = globalThis.setTimeout(lookupNow, 350);
  });
  code.addEventListener("keydown", async event => { if (event.key === "Enter") { event.preventDefault(); await lookupNow(); } });
  quantity.addEventListener("input", update);
  minus.addEventListener("click", () => { if (!minus.disabled) { quantity.value = String(Math.max(1, (Number(quantity.value) || 1) - 1)); update(); } });
  plus.addEventListener("click", () => { if (!plus.disabled) { quantity.value = String(Math.min(9999999, (Number(quantity.value) || 1) + 1)); update(); } });
  submit.addEventListener("click", async () => {
    if (sending || !context.isCurrent()) return;
    try {
      if (!pending) {
        if (!item || code.value.trim() !== item.sku) throw new Error("Localize o produto antes de enviar.");
        pending = validateCaixaRequest({ id: crypto.randomUUID(), kind, sku: item.sku, quantity: Number(quantity.value), customer: kind === "PRODUCT", notes: notes.value.trim() || (kind === "ADJUSTMENT" ? DEFAULT_CAIXA_ADJUSTMENT_REASON : "") });
      }
      sending = true; update();
      await context.rpc("submit_wms_caixa_request", { request_key: pending.id, code: context.warehouse, request_kind: pending.kind, product_code: pending.sku, units: pending.quantity, customer: pending.customer, observation: pending.notes });
      await context.onSubmitted();
      if (!context.isCurrent()) return;
      pending = null; code.value = ""; notes.value = ""; quantity.value = "1"; clearProduct(); status.textContent = "Solicitação urgente enviada."; code.focus?.();
    } catch (error) {
      if (!context.isCurrent()) return;
      if (error.confirmedFailure) pending = null;
      status.textContent = pending ? "Não foi possível confirmar o envio. Use Verificar envio / reenviar para evitar duplicidade." : error.message;
    } finally { sending = false; if (context.isCurrent()) { update(); if (!pending && !code.value) code.focus?.(); } }
  });
  clearProduct();
  return { lookupNow, newAdjustment() {
    if (sending || pending || !context.isCurrent()) return false;
    buttons.find(button => button.dataset.requestKind === "ADJUSTMENT").click();
    code.focus?.(); code.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    return true;
  } };
}
