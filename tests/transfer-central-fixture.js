import "../style.css";
import "../src/transfer-central.css";
import { openTransferCentralDrawer, transferCentralRowHtml } from "../src/transfer-central.js";

// Isolated visual fixture: no authentication, backend calls or operational writes.
document.body.innerHTML = '<main style="padding:24px;max-width:1280px;margin:auto"><h1>Transferencias</h1><p>Validacao visual local · dados de teste</p><article class="transfer-central-row"><div><strong title="TRF-20261020-133914-23696-20347">TRF-0018</strong><small>VDDRD → TLS1</small></div><div><strong>Em separacao</strong><small>1 SKU · 5 un.</small></div><div><strong>Operador de teste</strong><small>20/10/2026, 13:39</small></div><div class="transfer-central-actions"><button class="primary-button" type="button" id="execute">Continuar separacao</button><button class="secondary-button" type="button" id="open">Detalhes</button></div></article><p id="result" role="status"></p></main>';
const transfer = { id: "fixture", code: "TRF-20261020-133914-23696-20347", publicNumber: 18, createdAt: "2026-10-20T13:39:14Z", separationStartedAt: "2026-10-20T14:00:00Z", responsibleName: "Operador de teste", totalBoxes: 2, status: "EM_SEPARACAO", hasDivergence: true, divergenceCount: 1 };
const items = [{ sku: "88699", description: "Produto de teste", requestedQty: 5, separatedQty: 3, packedQty: 0, missingQty: 2, pendingReason: "Quantidade pendente de verificacao" }];
const search = document.createElement("input"); search.type = "search"; search.setAttribute("aria-label", "Busca de teste"); search.value = "TLS1";
document.querySelector(".transfer-central-row").before(search);
document.querySelector(".transfer-central-row").outerHTML = transferCentralRowHtml({ transfer, stats: { totalItems: 1, requested: 5 }, origin: "VDDRD", destination: "TLS1", status: "Em separacao", primaryAction: "Continuar separacao" });
document.querySelector("main").onclick = event => {
  if (event.target.closest("[data-transfer-execute]")) document.getElementById("result").textContent = "Execucao direta em um clique.";
  if (event.target.closest("[data-transfer-central]")) openTransferCentralDrawer({ transfer, items, status: "Em separacao", route: "VDDRD → TLS1", primaryAction: "Continuar separacao", onOpen: () => { document.getElementById("result").textContent = "Acao existente acionada."; } });
};
