import { escapeHtml } from "./utils.js";

const key = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
let closeActiveDrawer;

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
  const fields = [transfer.code, transfer.name, transfer.originName, transfer.originStoreCode,
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

export function openTransferCentralDrawer({ transfer, items, status, route, onOpen }) {
  closeActiveDrawer?.();
  const previous = document.activeElement;
  const overlay = document.createElement("div");
  overlay.className = "transfer-central-overlay";
  const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("pt-BR") : "Nao informada";
  overlay.innerHTML = `<section class="transfer-central-drawer" role="dialog" aria-modal="true" aria-labelledby="transfer-central-title" tabindex="-1">
    <header><div><small>Transferencia</small><h2 id="transfer-central-title">${escapeHtml(transfer.code)}</h2><span>${escapeHtml(status)}</span></div><button type="button" data-close aria-label="Fechar">&times;</button></header>
    <nav aria-label="Detalhes da transferencia">${["Resumo", "Itens", "Historico"].map((label, i) => `<button type="button" data-tab="${i}" aria-pressed="${i === 0}">${label}</button>`).join("")}</nav>
    <div class="transfer-central-content">
      <section data-panel="0"><h3>Origem → Destino</h3><p>${escapeHtml(route)}</p><dl><dt>Responsavel</dt><dd>${escapeHtml(transfer.responsibleName || "Sem atribuicao")}</dd><dt>Criada</dt><dd>${escapeHtml(date(transfer.createdAt))}</dd><dt>Prioridade</dt><dd>${escapeHtml(transfer.purchasePriority || "Nao informada")}</dd></dl><h3>Etapas registradas</h3><ol class="transfer-central-timeline">${transferTimeline(transfer).map(([label, at]) => `<li><strong>${label}</strong><small>${escapeHtml(date(at))}</small></li>`).join("") || "<li>Nenhuma etapa registrada.</li>"}</ol><p>${escapeHtml(transfer.observation || "")}</p></section>
      <section data-panel="1" hidden><h3>Itens (${items.length})</h3>${items.map(item => `<article><strong>SKU ${escapeHtml(item.sku)}</strong><p>${escapeHtml(item.description || "")}</p><small>Solicitado: ${Number(item.requestedQty || 0)} · Separado: ${Number(item.separatedQty || 0)} · Na caixa: ${Number(item.packedQty || 0)}</small></article>`).join("") || "<p>Nenhum item carregado.</p>"}</section>
      <section data-panel="2" hidden><h3>Historico registrado</h3>${items.filter(item => item.observation).map(item => `<article><strong>SKU ${escapeHtml(item.sku)}</strong><p class="transfer-central-audit">${escapeHtml(item.observation)}</p></article>`).join("") || "<p>Sem observacoes registradas nos itens.</p>"}</section>
    </div><footer><button type="button" data-copy>Copiar codigo completo</button><button type="button" class="primary-button" data-open>Abrir processo</button><small data-feedback role="status"></small></footer></section>`;
  const close = () => { overlay.remove(); document.removeEventListener("keydown", keyboard); closeActiveDrawer = null; if (previous?.isConnected) previous.focus(); };
  const keyboard = event => {
    if (event.key === "Escape") close();
    if (event.key !== "Tab") return;
    const focusable = [...overlay.querySelectorAll("button")].filter(button => !button.closest("[hidden]"));
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
