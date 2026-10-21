import { escapeHtml } from "./utils.js";

const key = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
let closeActiveDrawer;

export function transferPublicCode(transfer) {
  const number = String(transfer.publicNumber || "");
  return /^[1-9]\d*$/.test(number) ? "TRF-" + number.padStart(4, "0") : transfer.code || "-";
}

export function transferPrimaryAction(transfer, user, inWarehouse) {
  if (!user || !inWarehouse || !["OPERADOR", "SUPERVISOR", "ADMINISTRADOR"].includes(user.role)) return null;
  if (transfer.responsibleId !== user.id) return null;
  if (transfer.invoiceStage && transfer.invoiceStage !== "CORRECAO_SOLICITADA") return null;
  if (["PENDENTE", "ATRIBUIDA", "AGUARDANDO_SEPARACAO"].includes(transfer.status)) return "Iniciar separacao";
  if (transfer.status === "EM_SEPARACAO") return "Continuar separacao";
  if (["SEPARACAO_CONCLUIDA", "EM_LACRE", "EM_MONTAGEM_CAIXA", "CORRECAO_SOLICITADA", "EM_CORRECAO"].includes(transfer.status)) return "Abrir montagem";
  return null;
}

export function transferStatusTone(transfer) {
  if (transfer.hasDivergence || Number(transfer.divergenceCount) > 0 || /DIVERGENCIA|CORRECAO/.test(transfer.status)) return "danger";
  if (/CANCELADA|ARQUIVADA|UNIFICADA/.test(transfer.status)) return "neutral";
  if (/CONCLUIDA|FINALIZADA|RECEBIDA/.test(transfer.status)) return "success";
  if (/TRANSITO|DESPACHADA/.test(transfer.invoiceStage || transfer.status)) return "transit";
  if (/MONTAGEM|LACRE|CONFERENCIA/.test(transfer.status)) return "conference";
  if (transfer.status === "EM_SEPARACAO") return "attention";
  return "pending";
}

export function transferUnitLabel(units, code, fallback) {
  const matches = units.filter(unit => unit.active !== false && [unit.code, unit.storeCode, unit.internalCode].some(value => value && key(value) === key(code)));
  if (matches.length !== 1) return fallback || code || "Nao informado";
  const unit = matches[0];
  return unit.loja || (/\D/.test(unit.code || "") ? unit.code : "") || unit.name || fallback || code;
}

export function transferMatchesQuickFilter(transfer, filter) {
  if (filter === "unassigned") return !transfer.responsibleId;
  if (filter === "pending") return ["PENDENTE", "ATRIBUIDA", "AGUARDANDO_SEPARACAO"].includes(transfer.status);
  if (filter === "separating") return transfer.status === "EM_SEPARACAO";
  if (filter === "packing") return ["SEPARACAO_CONCLUIDA", "EM_LACRE", "EM_MONTAGEM_CAIXA", "EM_CORRECAO", "CORRECAO_SOLICITADA"].includes(transfer.status);
  if (filter === "invoice") return ["PRONTA_PARA_NOTA", "PRONTA_PARA_NOTA_COM_DIVERGENCIA"].includes(transfer.status) && !["LIBERADA_PARA_ENVIO", "DESPACHADA", "RECEBIDA", "FINALIZADA"].includes(transfer.invoiceStage);
  if (filter === "divergent") return transferStatusTone(transfer) === "danger";
  return true;
}

export function transferCentralRowHtml({ transfer, stats, origin, destination, status, primaryAction, moreActions = "" }) {
  const id = escapeHtml(transfer.id), tone = transferStatusTone(transfer);
  return `<article class="transfer-central-row tone-${tone}" data-central-row="${id}">
    <div><button class="transfer-central-code" type="button" data-transfer-central="${id}" title="${escapeHtml(transfer.code)}">${escapeHtml(transferPublicCode(transfer))}</button><small>${escapeHtml(origin)} → ${escapeHtml(destination)}</small></div>
    <div><small>Caixas / itens / unidades</small><strong>${Number(transfer.totalBoxes || 0)} cx · ${Number(stats.totalItems || 0)} itens · ${Number(stats.requested || 0)} un.</strong>${transfer.invoiceNumber ? `<small>NF ${escapeHtml(transfer.invoiceNumber)}</small>` : ""}</div>
    <div><span class="transfer-central-badge tone-${tone}">${escapeHtml(status)}</span>${Number(transfer.divergenceCount || 0) ? `<small class="transfer-central-alert">${Number(transfer.divergenceCount)} divergencia(s)</small>` : ""}</div>
    <div><small>Responsavel</small><strong>${escapeHtml(transfer.responsibleName || "Sem atribuicao")}</strong><small>Prazo: nao informado</small></div>
    <div class="transfer-central-actions">${primaryAction ? `<button type="button" class="primary-button" data-transfer-execute="${id}">${escapeHtml(primaryAction)}</button>` : ""}<button type="button" class="secondary-button" data-transfer-central="${id}">Detalhes</button></div>
    ${moreActions ? `<details><summary>Mais acoes e acompanhamento</summary>${moreActions}</details>` : ""}</article>`;
}

export function resolveTransferUnit(records, token) {
  const wanted = key(token);
  if (!wanted) return null;
  const candidates = records.filter(row => row.active !== false);
  const values = row => [row.code, row.storeCode, row.internalCode, row.name, row.loja, row.cnpj, ...(row.aliases || [])].map(key).filter(Boolean);
  const exact = candidates.filter(row => values(row).includes(wanted));
  if (exact.length) return exact.length === 1 ? exact[0] : null;
  const partial = candidates.filter(row => values(row).some(value => value.includes(wanted)));
  return partial.length === 1 ? partial[0] : null;
}

export function transferSearchText(transfer, units = []) {
  const fields = [transfer.code, transferPublicCode(transfer), transfer.name, transfer.originName, transfer.originStoreCode,
    transfer.destinationName, transfer.destinationStoreCode, transfer.establishmentName,
    transfer.establishmentCode, transfer.responsibleName, transfer.invoiceNumber];
  const linked = units.filter(unit => [unit.code, unit.storeCode, unit.internalCode].some(value => value && fields.some(field => key(field) === key(value))));
  return [...fields, ...linked.flatMap(unit => [unit.name, unit.loja, unit.code, unit.storeCode, unit.internalCode])].join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function transferTimeline(transfer) {
  return [["Solicitacao criada", transfer.createdAt], ["Separacao iniciada", transfer.separationStartedAt],
    ["Separacao concluida", transfer.separationFinishedAt], ["Montagem iniciada", transfer.packingStartedAt],
    ["Montagem concluida", transfer.packingFinishedAt], ["Finalizacao registrada", transfer.finishedAt]]
    .filter(([, date]) => date && Number.isFinite(Date.parse(date)))
    .sort((a, b) => Date.parse(a[1]) - Date.parse(b[1]));
}

export function openTransferCentralDrawer({ transfer, items, status, route, onOpen, primaryAction }) {
  closeActiveDrawer?.();
  const previous = document.activeElement;
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  const selectedRow = previous?.closest("[data-central-row]");
  selectedRow?.classList.add("is-selected");
  const overlay = document.createElement("div");
  overlay.className = "transfer-central-overlay";
  const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("pt-BR") : "Nao informada";
  const tone = transferStatusTone(transfer);
  const totals = items.reduce((sum, item) => ({ requested: sum.requested + Number(item.requestedQty || 0), separated: sum.separated + Number(item.separatedQty || 0), packed: sum.packed + Number(item.packedQty || 0) }), { requested: 0, separated: 0, packed: 0 });
  const divergent = items.filter(item => item.divergenceType || item.pendingReason || Number(item.missingQty) > 0 || Number(item.excessQty) > 0);
  const timeline = transferTimeline(transfer);
  const skuCount = new Set(items.map(item => item.sku).filter(Boolean)).size;
  overlay.innerHTML = `<section class="transfer-central-drawer" role="dialog" aria-modal="true" aria-labelledby="transfer-central-title" tabindex="-1">
    <header><div><small>Detalhes da transferencia</small><h2 id="transfer-central-title" title="${escapeHtml(transfer.code)}">${escapeHtml(transferPublicCode(transfer))}</h2><span class="transfer-central-badge tone-${tone}">${escapeHtml(status)}</span></div><button type="button" data-close aria-label="Fechar">&times;</button></header>
    <nav aria-label="Detalhes da transferencia">${["Resumo", "Itens", "Historico"].map((label, i) => `<button type="button" data-tab="${i}" aria-pressed="${i === 0}">${label}</button>`).join("")}</nav>
    <div class="transfer-central-content">
      <section data-panel="0"><h3>Origem → Destino</h3><p class="transfer-central-route">${escapeHtml(route)}</p><div class="transfer-central-totals"><span><strong>${items.length}</strong>SKUs</span><span><strong>${totals.requested}</strong>Solicitadas</span><span><strong>${totals.separated}</strong>Separadas</span><span><strong>${totals.packed}</strong>Na caixa</span></div><dl><dt>Responsavel</dt><dd>${escapeHtml(transfer.responsibleName || "Sem atribuicao")}</dd><dt>Criada</dt><dd>${escapeHtml(date(transfer.createdAt))}</dd><dt>Prioridade</dt><dd>${escapeHtml(transfer.purchasePriority || "Nao informada")}</dd><dt>Caixas</dt><dd>${Number(transfer.totalBoxes || 0)}</dd><dt>Prazo</dt><dd>Nao informado</dd><dt>Fiscal</dt><dd>${escapeHtml(transfer.invoiceStage || (transfer.requiresInvoice ? "NF obrigatoria" : "Nao informado"))}${transfer.invoiceNumber ? " · NF " + escapeHtml(transfer.invoiceNumber) : ""}</dd></dl>${divergent.length ? `<aside class="transfer-central-attention"><h3>Precisa de atencao (${divergent.length})</h3>${divergent.map(item => `<p><strong>SKU ${escapeHtml(item.sku)}</strong> · ${escapeHtml(item.pendingReason || item.divergenceType || "Diferenca de quantidade")}<br><small>Falta: ${Number(item.missingQty || 0)} · Excesso: ${Number(item.excessQty || 0)}</small></p>`).join("")}</aside>` : ""}<h3>Etapas registradas</h3><ol class="transfer-central-timeline">${timeline.map(([label, at]) => `<li><strong>${label}</strong><small>${escapeHtml(date(at))}</small></li>`).join("") || "<li>Nenhuma etapa registrada.</li>"}</ol><p class="transfer-central-current"><strong>Etapa atual:</strong> ${escapeHtml(status)}</p><details><summary>Codigo completo e observacoes</summary><p class="transfer-central-audit">${escapeHtml(transfer.code)}</p><p>${escapeHtml(transfer.observation || "Sem observacoes.")}</p></details></section>
      <section data-panel="1" hidden><h3>Itens (${items.length})</h3>${items.map(item => `<article><strong>SKU ${escapeHtml(item.sku)}</strong><p>${escapeHtml(item.description || "")}</p><small>Solicitado: ${Number(item.requestedQty || 0)} · Separado: ${Number(item.separatedQty || 0)} · Na caixa: ${Number(item.packedQty || 0)}</small></article>`).join("") || "<p>Nenhum item carregado.</p>"}</section>
      <section data-panel="2" hidden><h3>Historico registrado</h3>${timeline.map(([label, at]) => `<article><strong>${escapeHtml(label)}</strong><p>${escapeHtml(date(at))}</p>${label === "Solicitacao criada" && transfer.createdByName ? `<small>${escapeHtml(transfer.createdByName)}</small>` : ""}</article>`).join("")}${items.filter(item => item.observation).map(item => `<article><strong>SKU ${escapeHtml(item.sku)}</strong><p class="transfer-central-audit">${escapeHtml(item.observation)}</p></article>`).join("") || "<p>Sem observacoes registradas nos itens.</p>"}</section>
    </div><footer><button type="button" data-copy>Copiar codigo completo</button><button type="button" class="primary-button" data-open>${escapeHtml(primaryAction || "Consultar processo")}</button><small data-feedback role="status"></small></footer></section>`;
  overlay.querySelector(".transfer-central-totals strong").textContent = String(skuCount);
  const close = () => { overlay.remove(); document.body.style.overflow = previousOverflow; selectedRow?.classList.remove("is-selected"); document.removeEventListener("keydown", keyboard); closeActiveDrawer = null; if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  const keyboard = event => {
    if (event.key === "Escape") close();
    if (event.key !== "Tab") return;
    const focusable = [...overlay.querySelectorAll("button, summary")].filter(button => !button.closest("[hidden]") && !button.disabled);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  overlay.addEventListener("click", async event => {
    if (event.target === overlay || event.target.closest("[data-close]")) close();
    const tab = event.target.closest("[data-tab]");
    if (tab) {
      overlay.querySelectorAll("[data-panel]").forEach(panel => { panel.hidden = panel.dataset.panel !== tab.dataset.tab; });
      overlay.querySelectorAll("[data-tab]").forEach(button => button.setAttribute("aria-pressed", String(button === tab)));
    }
    if (event.target.closest("[data-open]")) { close(); await onOpen(); }
    if (event.target.closest("[data-copy]")) {
      try { await navigator.clipboard.writeText(transfer.code); overlay.querySelector("[data-feedback]").textContent = "Codigo copiado."; }
      catch { overlay.querySelector("[data-feedback]").textContent = "Nao foi possivel copiar. Selecione o codigo no cabecalho."; }
    }
  });
  document.body.append(overlay);
  closeActiveDrawer = close;
  document.addEventListener("keydown", keyboard);
  overlay.querySelector("[data-close]").focus();
}
