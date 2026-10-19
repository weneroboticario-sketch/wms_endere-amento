import { escapeHtml, randomId } from "./utils.js";
import { decorateWorkflow, decorateMetrics, workflowErrorMessage, requestVisualFields } from "./cpalamo-appearance.js";

export const FISCAL_LABELS = {
  "": "Em operacao no estoque", PRONTA_PARA_NOTA: "Disponivel para NF", NF_EM_PREPARACAO: "NF em preparacao",
  NF_ANEXADA: "NF anexada", LIBERADA_PARA_ENVIO: "Liberada para envio", DESPACHADA: "Despachada",
  RECEBIDA: "Recebida", FINALIZADA: "Concluida", CORRECAO_SOLICITADA: "Correcao solicitada"
};

export const STOCK_FINAL_STATUSES = ["PRONTA_PARA_NOTA", "PRONTA_PARA_NOTA_COM_DIVERGENCIA"];
export const FISCAL_PENDING_STATUSES = ["PRONTA_PARA_NOTA", "NF_EM_PREPARACAO", "NF_ANEXADA", "LIBERADA_PARA_ENVIO", "DESPACHADA", "RECEBIDA", "CORRECAO_SOLICITADA"];
export const PROCESS_FINAL_STATUSES = ["FINALIZADA", "CANCELADA", "ARQUIVADA_POR_UNIFICACAO"];

export function includeStockReadyTransfers(filter, role) {
  return ["ADMINISTRADOR", "SUPERVISOR"].includes(role) && ["mine", "open", "PRONTA_PARA_NOTA"].includes(filter);
}

export function fiscalQueueStages(filter, role) {
  if (filter === "closed") return ["FINALIZADA"];
  if (filter === "open") return null;
  if (filter !== "mine") return [filter];
  if (["ADMINISTRADOR", "SUPERVISOR"].includes(role)) return ["", ...FISCAL_PENDING_STATUSES];
  return role === "COMPRAS" ? ["PRONTA_PARA_NOTA", "NF_EM_PREPARACAO", "NF_ANEXADA"]
    : ["", "CORRECAO_SOLICITADA", "LIBERADA_PARA_ENVIO", "DESPACHADA", "RECEBIDA"];
}

const money = value => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const stockTotals = row => (row.invoice_snapshot || []).reduce((total, item) => ({
  skus: total.skus + (Number(item.checked) > 0 ? 1 : 0), units: total.units + Number(item.checked || 0)
}), { skus: 0, units: 0 });

export async function validateInvoicePdf(file) {
  if (!file || file.type !== "application/pdf" || !/\.pdf$/i.test(file.name) || file.size <= 0 || file.size > 10 * 1024 * 1024) {
    throw new Error("Selecione um PDF valido, de ate 10 MB.");
  }
  const header = String.fromCharCode(...new Uint8Array(await file.slice(0, 5).arrayBuffer()));
  if (header !== "%PDF-") throw new Error("O arquivo selecionado nao possui formato PDF.");
}

export function fiscalActions(stage, role, domain) {
  const buyer = ["COMPRAS", "ADMINISTRADOR", "SUPERVISOR"].includes(role);
  const stock = ["OPERADOR", "ADMINISTRADOR", "SUPERVISOR"].includes(role);
  const actions = [];
  if (buyer && stage === "PRONTA_PARA_NOTA") actions.push(["PREPARE", "Preparar NF"]);
  if (buyer && ["PRONTA_PARA_NOTA", "NF_EM_PREPARACAO", "NF_ANEXADA"].includes(stage)) actions.push(["CORRECTION", "Devolver para correcao"]);
  if (buyer && stage === "NF_ANEXADA") actions.push(["RELEASE", "Liberar para envio"]);
  if (stock && domain === "REPOSICAO" && ["", "CORRECAO_SOLICITADA"].includes(stage)) actions.push(["READY", "Conferencia e caixas prontas"]);
  if (stock && domain === "REPOSICAO" && stage === "LIBERADA_PARA_ENVIO") actions.push(["DISPATCH", "Confirmar despacho"]);
  if (stock && domain === "REPOSICAO" && stage === "DESPACHADA") actions.push(["RECEIVE", "Confirmar recebimento"]);
  if (stock && domain === "REPOSICAO" && stage === "RECEBIDA") actions.push(["COMPLETE", "Concluir processo"]);
  if (["ADMINISTRADOR", "SUPERVISOR"].includes(role) && ["LIBERADA_PARA_ENVIO", "DESPACHADA", "RECEBIDA", "FINALIZADA"].includes(stage)) actions.push(["REOPEN", "Reabrir com justificativa"]);
  return actions;
}

export function createPurchasesWorkflow(context) {
  const root = document.getElementById("fiscalWorkflowContent");
  let rows = [];
  let selected = null;
  let busy = false;
  let loadedWarehouse = "";
  let pendingAction = null;
  let detailTabValue = "summary";
  let chartCache = null;
  const e = escapeHtml;
  const status = message => {
    document.getElementById("fiscalWorkflowStatus").textContent = message;
    const local = document.getElementById("fiscalUploadStatus");
    if (local) local.textContent = message;
  };
  const originalWarehouse = context.warehouse;
  const unitOptions = context.warehouses().map(w => `<option value="${e(w.code)}">${e(w.code)} - ${e(w.name)}</option>`).join("");
  root.innerHTML = `<div id="fiscalMetrics" class="stock-summary-grid kpi-grid"></div>
    <nav class="fiscal-tabs" aria-label="Etapas fiscais">${[["PRONTA_PARA_NOTA","Aguardando NF"],["NF_EM_PREPARACAO","Em preparacao"],["NF_ANEXADA","NF anexada"],["LIBERADA_PARA_ENVIO","Liberadas"],["closed","Concluidas"],["CORRECAO_SOLICITADA","Com correcao"]].map(([value,label])=>`<button type="button" data-fiscal-tab="${value}" aria-pressed="false">${label}</button>`).join("")}</nav>
    <div class="fiscal-filters filters-bar"><label>Responsabilidade<select id="fiscalQueueFilter"><option value="mine">Aguardando minha acao</option><option value="open">Todos em andamento</option><option value="PRONTA_PARA_NOTA">Aguardando NF</option><option value="NF_EM_PREPARACAO">Em preparacao</option><option value="NF_ANEXADA">NF anexada</option><option value="LIBERADA_PARA_ENVIO">Liberada para envio</option><option value="CORRECAO_SOLICITADA">Com correcao</option><option value="closed">Concluidos</option></select></label><label>Buscar processo<input id="fiscalSearch" type="search" placeholder="Codigo, NFe ou destino"></label><button id="fiscalRefresh" class="secondary-button" type="button">Atualizar</button></div>
    <details class="fiscal-notices"><summary>Notificacoes</summary><div id="fiscalNotifications"></div></details>
    <div class="table-wrapper fiscal-queue"><table class="table-modern fiscal-table"><thead><tr><th>Transferencia</th><th>Origem / destino</th><th>SKUs</th><th>Unidades</th><th>Caixas</th><th>Finalizado (Estoque)</th><th>Tempo na fila</th><th>Status fiscal</th><th>Acao</th></tr></thead><tbody id="fiscalRows"></tbody></table></div>
    <div class="button-row fiscal-pagination"><button id="fiscalPrevious" class="secondary-button" type="button">Anterior</button><button id="fiscalNext" class="secondary-button" type="button">Proxima pagina</button></div>
    <div class="fiscal-charts" id="fiscalCharts"></div>
    <dialog id="fiscalDetail" class="drawer fiscal-drawer" aria-labelledby="fiscalDrawerTitle" hidden></dialog>`;
  const drawer = document.getElementById("fiscalDetail");
  drawer.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
  drawer.addEventListener("close", () => { drawer.hidden = true; });
  decorateWorkflow(root);
  let page = 0;
  if (["ADMINISTRADOR", "SUPERVISOR"].includes(context.user().role)) {
    document.getElementById("fiscalQueueFilter").insertAdjacentHTML("beforeend", '<option value="without_nf">Estoque pronto sem NF</option>');
  }
  if (context.global()) {
    root.insertAdjacentHTML("afterbegin", `<label>Unidade<select id="fiscalUnit">${unitOptions}</select></label>`);
    if (context.warehouses().some(unit => unit.code === originalWarehouse())) document.getElementById("fiscalUnit").value = originalWarehouse();
    context = { ...context, warehouse: () => document.getElementById("fiscalUnit").value || originalWarehouse() };
    document.getElementById("fiscalUnit").addEventListener("change", () => { page = 0; refresh(); });
  }

  function render() {
    const role = context.user().role;
    document.getElementById("fiscalRows").innerHTML = rows.length ? rows.map((row, index) => {
      const buyerStage = ["PRONTA_PARA_NOTA", "NF_EM_PREPARACAO", "NF_ANEXADA"].includes(row.invoice_stage);
      const totals = stockTotals(row);
      const age = Math.max(0, Math.floor((Date.now() - new Date(row.status_changed_at || row.updated_at).getTime()) / 60000));
      const stageTone = row.invoice_stage === "PRONTA_PARA_NOTA" ? "warning" : row.invoice_stage === "CORRECAO_SOLICITADA" ? "danger" : ["NF_ANEXADA","FINALIZADA"].includes(row.invoice_stage) ? "success" : "info";
      const minutes = age < 60 ? age + " min" : age < 1440 ? Math.floor(age/60) + "h " + age%60 + "min" : Math.floor(age/1440) + "d " + Math.floor(age%1440/60) + "h";
      const needsHandoff = row.domain === "TRANSFERENCIA" && row.requires_invoice === false && STOCK_FINAL_STATUSES.includes(row.status);
      return `<tr><td data-label="Transferencia"><strong class="fiscal-code">${e(row.codigo_transferencia || row.codigo_material || row.id)}</strong><small>${e(row.request_origin)} | ${buyerStage ? "Compras" : "Estoque / Expedicao"}</small></td><td data-label="Rota">${e(row.warehouse_code)}<small>${e(row.domain === "TRANSFERENCIA" ? row.destino_nome || "-" : row.nome_material || "Reposicao")}</small></td><td data-label="SKUs">${totals.skus}</td><td data-label="Unidades">${totals.units}</td><td data-label="Caixas">${Number(row.total_caixas || 0)}</td><td data-label="Estoque finalizado">${row.packing_finished_at ? e(new Date(row.packing_finished_at).toLocaleString("pt-BR")) : "-"}<small>${e(row.invoice_number || "Sem NF")} | ${row.invoice_value == null ? "-" : money(row.invoice_value)}</small></td><td data-label="Tempo"><span class="fiscal-time">${minutes}</span></td><td data-label="Status"><span class="status-badge status-${stageTone}">${e(needsHandoff ? "Estoque pronto para NF" : FISCAL_LABELS[row.invoice_stage] || row.status)}</span></td><td data-label="Acao"><button class="primary-button" data-fiscal-open="${index}" type="button">${needsHandoff ? "Encaminhar para NF" : "Abrir"}</button></td></tr>`;
    }).join("") : '<tr><td colspan="9"><p class="empty-state">Nenhum processo neste filtro.</p></td></tr>';
    root.querySelectorAll("[data-fiscal-tab]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.fiscalTab===document.getElementById("fiscalQueueFilter").value)));
    document.getElementById("fiscalPrevious").disabled = page === 0;
    document.getElementById("fiscalNext").disabled = rows.length < 30;
    root.dataset.role = role;
  }

  async function refresh() {
    if (busy) return;
    const warehouse = context.warehouse();
    if (warehouse !== loadedWarehouse) { page = 0; selected = null; document.getElementById("fiscalDetail").close(); document.getElementById("fiscalDetail").hidden = true; }
    loadedWarehouse = warehouse; busy = true;
    root.setAttribute("aria-busy","true");
    if (!document.getElementById("fiscalMetrics").children.length) document.getElementById("fiscalMetrics").innerHTML=Array.from({length:5},()=>'<article class="app-skeleton" aria-label="Carregando indicador"></article>').join("");
    try {
      const filter = document.getElementById("fiscalQueueFilter").value;
      const buyer = ["COMPRAS", "ADMINISTRADOR", "SUPERVISOR"].includes(context.user().role);
      const stages = fiscalQueueStages(filter, context.user().role);
      const search = document.getElementById("fiscalSearch").value.trim().replace(/[^\p{L}\p{N} _-]/gu, "");
      const sources = ["wms_transfers", "wms_replenishment_requests"].map(table => ({ table, handoff: false }));
      if (includeStockReadyTransfers(filter, context.user().role)) sources.push({ table: "wms_transfers", handoff: true });
      const responses = await Promise.all(sources.map(async ({table, handoff}) => {
        if (filter === "without_nf" && table !== "wms_transfers") return [];
        let query = context.client().from(table).select("id,warehouse_code,status,requires_invoice,request_origin,invoice_stage,status_changed_at,updated_at,invoice_number,invoice_value,invoice_snapshot,invoice_file_name" + (table === "wms_transfers" ? ",codigo_transferencia,destino_nome,total_caixas,packing_finished_at" : ",codigo_material,nome_material"))
          .eq("warehouse_code", warehouse).eq("requires_invoice", filter !== "without_nf" && !handoff).eq("is_deleted", false).not("status", "in", '("CANCELADA","CANCELADO","ARQUIVADA_POR_UNIFICACAO")');
        if (search) query = query.or((table === "wms_transfers" ? ["codigo_transferencia", "invoice_number", "destino_nome"] : ["codigo_material", "invoice_number", "nome_material"]).map(field => `${field}.ilike.%${search}%`).join(","));
        if (filter === "without_nf" || handoff) query = query.in("status", STOCK_FINAL_STATUSES).eq("invoice_stage", "").is("sent_at", null);
        else if (stages) query = query.in("invoice_stage", stages); else query = query.neq("invoice_stage", "FINALIZADA");
        const result = await query.order("updated_at", { ascending: false }).range(page * 30, page * 30 + 29);
        if (result.error) throw result.error;
        return (result.data || []).map(row => ({ ...row, domain: table === "wms_transfers" ? "TRANSFERENCIA" : "REPOSICAO", table }));
      }));
      if (warehouse !== context.warehouse()) return;
      rows = responses.flat().sort((a, b) => b.updated_at.localeCompare(a.updated_at)); render();
      const summary = await context.client().rpc("wms_fiscal_summary", { p_warehouse: warehouse });
      if (["ADMINISTRADOR", "SUPERVISOR"].includes(context.user().role) && !summary.error) {
        const handoff = await context.client().from("wms_transfers").select("id", { count: "exact", head: true }).eq("warehouse_code", warehouse).eq("requires_invoice", false).eq("is_deleted", false).in("status", STOCK_FINAL_STATUSES).eq("invoice_stage", "").is("sent_at", null);
        if (handoff.error) throw handoff.error;
        summary.data["Aguardando NF"] = Number(summary.data["Aguardando NF"] || 0) + Number(handoff.count || 0);
      }
      const metricOrder = ["Aguardando NF","Em preparacao","NF anexadas hoje","Liberadas hoje","Valor faturado hoje"];
      if (!summary.error) document.getElementById("fiscalMetrics").innerHTML = Object.entries(summary.data || {}).sort(([a],[b])=>metricOrder.indexOf(a)-metricOrder.indexOf(b)).map(([label, total]) => `<article class="stock-summary-card"><span>${e(label)}</span><strong>${label.startsWith("Valor") ? money(total) : Number(total)}</strong></article>`).join("");
      decorateMetrics(document.getElementById("fiscalMetrics"));
      await renderCharts(warehouse);
      const notices = await context.client().from("wms_notifications").select("id,message,created_at").eq("warehouse_code", warehouse)
        .eq("user_id", buyer ? "role:COMPRAS" : "role:ESTOQUE").order("created_at", { ascending: false }).limit(3);
      if (!notices.error) document.getElementById("fiscalNotifications").innerHTML = (notices.data || []).map(n => `<p class="inline-status">${e(n.message)}</p>`).join("");
      status("");
    } catch (error) { context.diagnostic("fiscal-refresh",error); status(workflowErrorMessage(error)); }
    finally { busy = false; root.removeAttribute("aria-busy"); }
  }

  async function renderCharts(warehouse) {
    const target = document.getElementById("fiscalCharts");
    try {
      if (!chartCache || chartCache.warehouse!==warehouse || Date.now()-chartCache.at>60000) {
        const dataset = [];
        for (const table of ["wms_transfers", "wms_replenishment_requests"]) {
          let offset=0;
          while (true) {
            const response=await context.client().from(table).select("id,invoice_stage,invoice_value,invoice_uploaded_at,invoice_file_path"+(table==="wms_transfers"?",destino_nome":""))
              .eq("warehouse_code",warehouse).eq("requires_invoice",true).eq("is_deleted",false)
              .not("status","in",'("CANCELADA","CANCELADO","ARQUIVADA_POR_UNIFICACAO")').order("id").range(offset,offset+499);
            if(response.error)throw response.error;
            dataset.push(...(response.data||[]));
            if((response.data||[]).length<500)break;
            offset+=500;
          }
        }
        chartCache={warehouse,at:Date.now(),dataset};
      }
      if (warehouse!==context.warehouse()) return;
      const records=chartCache.dataset;
      const day=value=>new Date(value).toLocaleDateString("pt-BR",{timeZone:"America/Cuiaba"});
      const days=Array.from({length:7},(_,index)=>{const date=new Date();date.setDate(date.getDate()-6+index);return {label:day(date),value:0};});
      const counts=new Map(),destinations=new Map();
      for(const row of records) {
        counts.set(row.invoice_stage,(counts.get(row.invoice_stage)||0)+1);
        if(row.invoice_stage==="PRONTA_PARA_NOTA" && row.destino_nome)destinations.set(row.destino_nome,(destinations.get(row.destino_nome)||0)+1);
        if(row.invoice_file_path && row.invoice_stage!=="CORRECAO_SOLICITADA" && row.invoice_uploaded_at) {
          const entry=days.find(entry=>entry.label===day(row.invoice_uploaded_at));if(entry)entry.value+=Number(row.invoice_value||0);
        }
      }
      const max=Math.max(1,...days.map(entry=>entry.value));
      target.innerHTML=`<section><h3>Valor faturado (ultimos 7 dias)</h3><div class="fiscal-daily-bars">${days.map(entry=>`<div><div class="fiscal-daily-bar" style="height:${entry.value/max*120}px" title="${money(entry.value)}"></div><strong>${Number(entry.value).toLocaleString("pt-BR",{notation:"compact",maximumFractionDigits:1})}</strong><small>${entry.label.slice(0,5)}</small></div>`).join("")}</div></section><section><h3>Processos por etapa</h3><ul class="fiscal-chart-list">${[...counts].map(([stage,count])=>`<li><span>${e(FISCAL_LABELS[stage]||stage)}</span><strong>${count}</strong></li>`).join("")||'<li>Nenhum processo fiscal.</li>'}</ul></section><section><h3>Destinos aguardando NF</h3><ul class="fiscal-chart-list">${[...destinations].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,count])=>`<li><span>${e(name)}</span><strong>${count}</strong></li>`).join("")||'<li>Nenhum destino aguardando NF.</li>'}</ul></section>`;
    } catch(error) {
      context.diagnostic("fiscal-charts",error);
      target.innerHTML='<p class="inline-status">Nao foi possivel carregar os graficos. Use Atualizar para tentar novamente.</p>';
    }
  }

  async function open(row) {
    if (selected?.id !== row.id) detailTabValue = "summary";
    const result = await context.client().from(row.table).select("*").eq("id", row.id).eq("warehouse_code", context.warehouse()).single();
    if (result.error) throw result.error;
    selected = { ...result.data, domain: row.domain, table: row.table };
    if (selected.warehouse_code !== context.warehouse()) return;
    const role = context.user().role;
    const editableInvoice = ["COMPRAS", "ADMINISTRADOR", "SUPERVISOR"].includes(role) && ["PRONTA_PARA_NOTA", "NF_EM_PREPARACAO", "NF_ANEXADA"].includes(selected.invoice_stage);
    const detail = document.getElementById("fiscalDetail"); detail.hidden = false;
    let snapshot = selected.invoice_snapshot || [];
    if (!snapshot.length && selected.domain === "TRANSFERENCIA") {
      const items = await context.client().from("wms_transfer_items").select("sku,quantidade_solicitada,quantidade_separada,quantidade_lacrada,observation").eq("transfer_id", selected.id).eq("warehouse_code",selected.warehouse_code).neq("status","REMOVIDO");
      if (items.error) throw items.error;
      snapshot = (items.data || []).map(i => ({ sku:i.sku,requested:i.quantidade_solicitada,separated:i.quantidade_separada,checked:i.quantidade_lacrada,difference:i.quantidade_lacrada-i.quantidade_solicitada,observation:i.observation }));
    } else if (!snapshot.length) snapshot = [{sku:selected.codigo_material,requested:selected.quantidade_solicitada,separated:selected.quantidade_atendida,checked:selected.invoice_checked_quantity || 0,difference:(selected.invoice_checked_quantity || 0)-selected.quantidade_solicitada,observation:selected.resposta_estoque}];
    const date = value => value ? e(new Date(value).toLocaleString("pt-BR")) : "-";
    const info = [["Origem",selected.warehouse_code],["Destino",selected.destino_nome || selected.nome_material || "-"],["Solicitado por",selected.criado_por_nome || selected.request_origin],["Responsavel do estoque",selected.responsavel_nome || "-"],["Criada em",date(selected.created_at)],["Finalizado (Estoque)",date(selected.packing_finished_at)],["SKUs conferidos",stockTotals(selected).skus],["Unidades conferidas",stockTotals(selected).units],["Caixas",selected.total_caixas || selected.invoice_box_count || 0]];
    detail.innerHTML = `<header class="drawer-heading"><div><h3 id="fiscalDrawerTitle">${e(selected.codigo_transferencia || selected.codigo_material || selected.id)}</h3><p>${e(selected.warehouse_code)} / ${e(selected.destino_nome || selected.nome_material || "-")}</p><span class="status-badge status-info">${e(FISCAL_LABELS[selected.invoice_stage])}</span></div><button class="secondary-button icon-button" data-fiscal-close type="button" title="Fechar detalhe" aria-label="Fechar detalhe"></button></header>
      <nav class="drawer-tabs" role="tablist" aria-label="Detalhes da transferencia">${[["summary","Resumo"],["items","Itens"],["invoice","Nota Fiscal"],["history","Historico"]].map(([value,label])=>`<button type="button" role="tab" data-fiscal-detail-tab="${value}" aria-selected="${value==="summary"}">${label}</button>`).join("")}</nav>
      <div class="drawer-body">
      <section data-fiscal-panel="summary"><div id="fiscalTimeline"></div><h4>Informacoes gerais</h4><dl class="drawer-summary">${info.map(([label,value])=>`<dt>${e(label)}</dt><dd>${e(value)}</dd>`).join("")}</dl>${selected.fiscal_reason ? `<p class="inline-status warning">${e(selected.fiscal_reason)}</p>` : ""}</section>
      <section data-fiscal-panel="items" hidden><h4>Itens conferidos</h4><div class="table-wrapper fiscal-items"><table><thead><tr><th>Material</th><th>Solicitada</th><th>Separada</th><th>Conferida / NF</th><th>Diferenca</th><th>Observacao</th></tr></thead><tbody>${snapshot.map(i => `<tr><td>${e(i.sku)}<small>${e(i.description || "")}</small></td><td>${i.requested}</td><td>${i.separated}</td><td>${i.checked}</td><td>${i.difference}</td><td>${e(i.observation || "")}</td></tr>`).join("")}</tbody></table></div></section>
      <section data-fiscal-panel="invoice" hidden><h4>Dados da nota fiscal</h4><dl class="drawer-summary"><dt>NFe</dt><dd>${e(selected.invoice_number || "-")}</dd><dt>Valor</dt><dd>${selected.invoice_value == null ? "-" : money(selected.invoice_value)}</dd><dt>PDF</dt><dd>${e(selected.invoice_file_name || "-")}</dd><dt>Anexado por</dt><dd>${e(selected.invoice_uploaded_by_name || "-")}</dd><dt>Data</dt><dd>${date(selected.invoice_uploaded_at)}</dd></dl>
      ${editableInvoice ? `<form id="fiscalUploadForm"><label>Numero da NFe<input name="number" maxlength="120" value="${e(selected.invoice_number)}" required></label><label>Valor total da NF (R$)<input name="value" type="number" min="0.01" step="0.01" value="${e(selected.invoice_value ?? "")}" required></label><label>Chave da NFe<input name="key" maxlength="44" value="${e(selected.invoice_key)}"></label><label>PDF da NF<div class="fiscal-pdf-drop"><span>Clique para anexar ou arraste o PDF</span><input name="pdf" type="file" accept="application/pdf,.pdf" required><small>Apenas PDF, ate 10 MB</small><span data-pdf-filename></span></div></label><button class="primary-button" type="submit">${selected.invoice_file_path ? "Substituir PDF" : "Anexar NF"}</button></form>` : ""}</section>
      <section data-fiscal-panel="history" hidden><details id="fiscalHistory"><summary>Historico do processo</summary><div id="fiscalHistoryRows"></div></details></section>
      </div>
      <footer class="button-row fiscal-drawer-actions">${fiscalActions(selected.invoice_stage, role, selected.domain).map(([action,label]) => `<button class="secondary-button" data-fiscal-action="${action}" type="button">${label}</button>`).join("")}${selected.invoice_file_path ? '<button class="secondary-button" id="fiscalViewPdf" type="button">Abrir PDF</button>' : ""}${selected.domain === "TRANSFERENCIA" ? '<button class="secondary-button" id="fiscalOpenTransfer" type="button">Abrir transferencia</button>' : ""}</footer>`;
    detail.querySelector("#fiscalUploadForm")?.addEventListener("submit", upload);
    const uploadForm = detail.querySelector("#fiscalUploadForm");
    if (uploadForm) {
      uploadForm.insertAdjacentHTML("afterend", '<p id="fiscalUploadStatus" class="inline-status" role="status" aria-live="polite"></p>');
      uploadForm.addEventListener("invalid", event => {
        const labels = { number: "numero da NFe", value: "valor total da NF maior que zero", pdf: "arquivo PDF da NF" };
        status("Confira o campo: " + (labels[event.target.name] || "chave da NFe") + ".");
      }, true);
    } else {
      detail.insertAdjacentHTML("beforeend", '<p id="fiscalUploadStatus" class="inline-status" role="status" aria-live="polite"></p>');
    }
    const milestones = [
      ["Estoque finalizado", selected.packing_finished_at],
      ["NF anexada", selected.invoice_file_path ? selected.invoice_uploaded_at : null],
      ["Liberada para envio", selected.invoice_released_at],
      ["Despachada", selected.sent_at], ["Recebida", selected.received_at],
      ["Processo concluido", selected.invoice_stage === "FINALIZADA" ? selected.finished_at : null]
    ];
    detail.querySelector("#fiscalTimeline").innerHTML = `<ol class="fiscal-timeline process-timeline">${milestones.map(([label, date]) => `<li class="${date ? "complete" : "pending"}"><strong>${e(label)}</strong><small>${date ? e(new Date(date).toLocaleString("pt-BR")) : "Pendente"}</small></li>`).join("")}</ol>`;
    if (selected.domain === "TRANSFERENCIA" && !selected.requires_invoice && STOCK_FINAL_STATUSES.includes(selected.status) && ["ADMINISTRADOR", "SUPERVISOR"].includes(role)) {
      detail.querySelector(".button-row").insertAdjacentHTML("afterbegin", '<button class="primary-button" data-fiscal-action="ENABLE" type="button">Encaminhar para NF</button>');
    }
    detail.querySelector("#fiscalViewPdf")?.addEventListener("click", async () => {
      const result = await context.client().storage.from("wms-transfer-invoices").createSignedUrl(selected.invoice_file_path, 300);
      if (result.error) return status(result.error.message);
      const link = document.createElement("a"); link.href = result.data.signedUrl; link.target = "_blank"; link.rel = "noopener noreferrer"; link.click();
    });
    detail.querySelector("#fiscalOpenTransfer")?.addEventListener("click", () => { detail.close(); context.openTransfer(selected.id); });
    if (selected.domain === "TRANSFERENCIA" && ["LIBERADA_PARA_ENVIO", "DESPACHADA", "RECEBIDA", "FINALIZADA"].includes(selected.invoice_stage)) {
      const link = document.createElement("button");link.className="secondary-button";link.textContent="Gestao de Expedicao";
      link.addEventListener("click",()=>{detail.close();context.navigate("expedition");});detail.querySelector(".button-row").appendChild(link);
    }
    if (selected.domain === "TRANSFERENCIA") {
      const divergences = await context.client().from("wms_transfer_divergences").select("id,sku,observation,resolved,difference_quantity").eq("transfer_id", selected.id).eq("warehouse_code",selected.warehouse_code).eq("resolved",false).limit(100);
      if (divergences.error) throw divergences.error;
      if (divergences.data?.length) {
        const canResolve = ["ADMINISTRADOR","SUPERVISOR","OPERADOR"].includes(role);
        detail.querySelector('[data-fiscal-panel="summary"]').insertAdjacentHTML("beforeend", `<h4>Divergencias registradas</h4><p>O faturamento considera somente as quantidades conferidas. As diferencas permanecem no historico.</p>${divergences.data.map((d,i) => `<p>${e(d.sku)} | Diferenca: ${Number(d.difference_quantity)} | ${e(d.observation)} ${canResolve ? `<button class="secondary-button" type="button" data-fiscal-resolve="${i}">Registrar resolucao</button>` : ""}</p>`).join("")}`);
        detail.querySelectorAll("[data-fiscal-resolve]").forEach(button => button.addEventListener("click", async () => {
          if (busy) return;
          const answer = await requestVisualFields("Registrar resolucao da divergencia",[{name:"reason",label:"Justificativa"}]);
          const reason = answer?.reason; if (!reason?.trim()) return;
          busy = true; button.disabled = true;
          try {
            const d = divergences.data[Number(button.dataset.fiscalResolve)];
            const result = await context.client().from("wms_transfer_divergences").update({resolved:true,observation:reason.trim()}).eq("id",d.id).eq("warehouse_code",selected.warehouse_code).eq("resolved",false).select("id");
            if(result.error)throw result.error;if(!result.data?.length)throw new Error("Divergencia atualizada por outro usuario. Atualize a tela.");
            await open(selected);context.changed();
          } catch(error){status(error.message);} finally{busy=false;button.disabled=false;}
        }));
      }
    }
    detail.querySelector("#fiscalHistory").addEventListener("toggle", async event => {
      if (!event.target.open) return;
      const query = selected.domain === "TRANSFERENCIA"
        ? context.client().from("wms_transfer_events").select("created_at,event_type,user_name,details").eq("transfer_id", selected.id)
        : context.client().from("wms_history").select("datetime,action,details").like("id", "fiscal:wms_replenishment_requests:" + selected.id + ":%");
      const result = await query.eq("warehouse_code", selected.warehouse_code).order(selected.domain === "TRANSFERENCIA" ? "created_at" : "datetime", { ascending: false }).limit(30);
      document.getElementById("fiscalHistoryRows").textContent = result.error ? workflowErrorMessage(result.error) : (result.data || []).map(item => [new Date(item.created_at || item.datetime).toLocaleString("pt-BR"),FISCAL_LABELS[item.event_type] || item.event_type || item.action,item.user_name || "",item.details || ""].join(" | ")).join("\n");
    });
    decorateWorkflow(detail);
    detail.querySelectorAll("[data-fiscal-panel]").forEach(panel=>panel.hidden=panel.dataset.fiscalPanel!==detailTabValue);
    detail.querySelectorAll("[data-fiscal-detail-tab]").forEach(button=>button.setAttribute("aria-selected",String(button.dataset.fiscalDetailTab===detailTabValue)));
    if (!detail.open) detail.showModal();
    const input = uploadForm?.elements.pdf;
    const drop = detail.querySelector(".fiscal-pdf-drop");
    if (input && drop) {
      input.addEventListener("change", () => { drop.querySelector("[data-pdf-filename]").textContent = input.files[0]?.name || ""; });
      drop.addEventListener("dragover", event => { event.preventDefault(); drop.classList.add("dragging"); });
      drop.addEventListener("dragleave", () => drop.classList.remove("dragging"));
      drop.addEventListener("drop", event => {
        event.preventDefault(); drop.classList.remove("dragging");
        if (event.dataTransfer.files.length !== 1) return status("Selecione um unico PDF.");
        input.files = event.dataTransfer.files; input.dispatchEvent(new window.Event("change"));
      });
    }

  }

  async function act(action, data = {}, id) {
    if (!selected) return;
    const result = await context.client().rpc("wms_invoice_action", { p_domain: selected.domain, p_id: selected.id, p_expected_stage: selected.invoice_stage,
      p_action: action, p_data: data, p_action_id: id || randomId("fiscal") });
    if (result.error) throw result.error;
    chartCache=null;
    await open(selected); context.changed();
  }

  async function upload(event) {
    event.preventDefault();
    if (busy) { status("Aguarde a atualizacao em andamento e tente novamente."); return; }
    busy = true;
    const form = event.target; const button = form.querySelector("button");
    const buttonLabel = button.textContent;
    button.disabled = true; button.textContent = "Anexando...";
    form.setAttribute("aria-busy", "true");
    status("Enviando PDF e vinculando a NF a transferencia...");
    let path = ""; let uploaded = false;
    try {
      const value = Number(form.elements.value.value);
      if (!Number.isFinite(value) || value <= 0) throw new Error("Informe o valor total da NF maior que zero.");
      if (form.elements.key.value && !/^[0-9]{44}$/.test(form.elements.key.value)) throw new Error("A chave da NFe deve conter 44 digitos.");
      const file = form.elements.pdf.files[0]; await validateInvoicePdf(file);
      path = `${selected.warehouse_code}/${selected.table}/${selected.id}/${randomId("nf")}.pdf`;
      const result = await context.client().storage.from("wms-transfer-invoices").upload(path, file, { contentType: "application/pdf", upsert: false });
      if (result.error) throw result.error; uploaded = true;
      await act("UPLOAD", { value: form.elements.value.value, number: form.elements.number.value, key: form.elements.key.value, path, filename: file.name });
      uploaded = false; status("NF anexada. Confira antes de liberar para envio.");
    } catch (error) {
      if (uploaded) {
        const cleanup = await context.client().storage.from("wms-transfer-invoices").remove([path]);
        if (cleanup.error) context.diagnostic("invoice-orphan", cleanup.error);
      }
      context.diagnostic("invoice-upload", error); status(workflowErrorMessage(error,"Nao foi possivel anexar a NF. Tente novamente ou procure o administrador."));
    } finally {
      busy = false; button.disabled = false; button.textContent = buttonLabel;
      form.removeAttribute("aria-busy");
      const message=document.getElementById("fiscalWorkflowStatus").textContent;
      await refresh(); status(message);
    }
  }

  root.addEventListener("click", async event => {
    const tab = event.target.closest("[data-fiscal-tab]");
    if (tab) { document.getElementById("fiscalQueueFilter").value = tab.dataset.fiscalTab; page=0; await refresh(); return; }
    if (event.target.closest("[data-fiscal-close]")) { if (!busy) drawer.close(); return; }
    const detailTab = event.target.closest("[data-fiscal-detail-tab]");
    if (detailTab) {
      const value = detailTab.dataset.fiscalDetailTab;
      detailTabValue = value;
      drawer.querySelectorAll("[data-fiscal-panel]").forEach(panel=>panel.hidden=panel.dataset.fiscalPanel!==value);
      drawer.querySelectorAll("[data-fiscal-detail-tab]").forEach(button=>button.setAttribute("aria-selected",String(button===detailTab)));
      if (value === "history") document.getElementById("fiscalHistory").open=true;
      return;
    }
    const opener = event.target.closest("[data-fiscal-open]");
    if (opener) { try { await open(rows[Number(opener.dataset.fiscalOpen)]); } catch (error) { status(error.message); } return; }
    const button = event.target.closest("[data-fiscal-action]"); if (!button || busy) return;
    const action = button.dataset.fiscalAction; const data = {};
    if (["CORRECTION", "REOPEN", "ENABLE"].includes(action)) { const answer=await requestVisualFields(button.textContent,[{name:"reason",label:"Motivo"}]);data.reason=answer?.reason;if (!data.reason?.trim()) return; }
    if (action === "READY") {
      const answer=await requestVisualFields("Conferencia concluida",[{name:"boxes",label:"Quantidade de caixas prontas",type:"number",value:"1"},{name:"checked",label:"Quantidade efetivamente conferida",type:"number",value:selected.quantidade_atendida || "0"}]);
      if(!answer)return;
      data.boxes = Number(answer.boxes);
      data.checked = Number(answer.checked);
      if (!Number.isInteger(data.boxes) || data.boxes < 1 || !Number.isFinite(data.checked) || data.checked <= 0) return status("Confira caixas e quantidade.");
    }
    if (!pendingAction || pendingAction.entity !== selected.id || pendingAction.action !== action) pendingAction = { entity: selected.id, action, id: randomId("fiscal") };
    button.disabled = true; busy = true;
    try {
      if (action === "ENABLE") {
        const result = await context.client().rpc("wms_transfer_enable_invoice", { p_id: selected.id, p_expected_status: selected.status, p_reason: data.reason, p_action_id: pendingAction.id });
        if (result.error) throw result.error;
        document.getElementById("fiscalQueueFilter").value = "mine";
        await open(selected); context.changed();
      } else await act(action, data, pendingAction.id);
      pendingAction = null; status("Etapa atualizada.");
    }
    catch (error) { context.diagnostic("invoice-action",error); status(error.message); }
    finally { button.disabled = false; busy = false; const message=document.getElementById("fiscalWorkflowStatus").textContent;await refresh();status(message); }
  });
  document.getElementById("fiscalSearch").addEventListener("change", () => { page = 0; refresh(); });
  document.getElementById("fiscalRefresh").addEventListener("click", refresh);
  document.getElementById("fiscalQueueFilter").addEventListener("change", () => { page = 0; refresh(); });
  document.getElementById("fiscalPrevious").addEventListener("click", () => { page = Math.max(0,page-1); refresh(); });
  document.getElementById("fiscalNext").addEventListener("click", () => { page++; refresh(); });
  drawer.addEventListener("keydown", event => {
    if (!event.target.matches("[data-fiscal-detail-tab]") || !["ArrowLeft","ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const tabs=[...drawer.querySelectorAll("[data-fiscal-detail-tab]")],index=tabs.indexOf(event.target);
    const target=tabs[(index+(event.key==="ArrowRight"?1:tabs.length-1))%tabs.length];target.focus();target.click();
  });
  async function openTransferInvoice(id, warehouse) {
    const unit = document.getElementById("fiscalUnit");
    if (unit) unit.value = warehouse;
    if (context.warehouse() !== warehouse) throw new Error("Selecione o estoque da transferencia para acessar a NF.");
    await open({ id, domain: "TRANSFERENCIA", table: "wms_transfers" });
    drawer.querySelector('[data-fiscal-detail-tab="invoice"]').click();
  }
  return { refresh, open, openTransferInvoice, summary: () => context.client().rpc("wms_fiscal_summary", { p_warehouse: context.warehouse() }) };
}
