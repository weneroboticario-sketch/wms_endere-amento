import { escapeHtml, randomId } from "./utils.js";

export const FISCAL_LABELS = {
  "": "Em operacao no estoque", PRONTA_PARA_NOTA: "Disponivel para NF", NF_EM_PREPARACAO: "NF em preparacao",
  NF_ANEXADA: "NF anexada", LIBERADA_PARA_ENVIO: "Liberada para envio", DESPACHADA: "Despachada",
  RECEBIDA: "Recebida", FINALIZADA: "Concluida", CORRECAO_SOLICITADA: "Correcao solicitada"
};

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
  if (stock && stage === "LIBERADA_PARA_ENVIO") actions.push(["DISPATCH", "Confirmar despacho"]);
  if (stock && stage === "DESPACHADA") actions.push(["RECEIVE", "Confirmar recebimento"]);
  if (stock && stage === "RECEBIDA") actions.push(["COMPLETE", "Concluir processo"]);
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
  const e = escapeHtml;
  const status = message => { document.getElementById("fiscalWorkflowStatus").textContent = message; };
  const originalWarehouse = context.warehouse;
  const unitOptions = context.warehouses().map(w => `<option value="${e(w.code)}">${e(w.code)} - ${e(w.name)}</option>`).join("");
  root.innerHTML = `<div class="button-row"><select id="fiscalQueueFilter" aria-label="Filtro de responsabilidade"><option value="mine">Aguardando minha acao</option><option value="open">Todos em andamento</option><option value="closed">Concluidos</option></select><button id="fiscalRefresh" class="secondary-button" type="button">Atualizar</button></div><div id="fiscalMetrics" class="stock-summary-grid"></div><div id="fiscalNotifications"></div><div class="table-wrapper"><table><thead><tr><th>Processo</th><th>Origem</th><th>Etapa</th><th>Responsabilidade</th><th>Tempo na etapa</th><th>Acao</th></tr></thead><tbody id="fiscalRows"></tbody></table></div><div class="button-row"><button id="fiscalPrevious" class="secondary-button" type="button">Anterior</button><button id="fiscalNext" class="secondary-button" type="button">Proxima pagina</button></div><section id="fiscalDetail" hidden></section>`;
  let page = 0;
  if (context.global()) {
    root.insertAdjacentHTML("afterbegin", `<label>Unidade<select id="fiscalUnit">${unitOptions}</select></label>`);
    context = { ...context, warehouse: () => document.getElementById("fiscalUnit").value || originalWarehouse() };
    document.getElementById("fiscalUnit").addEventListener("change", () => { page = 0; refresh(); });
  }

  function render() {
    const role = context.user().role;
    document.getElementById("fiscalRows").innerHTML = rows.length ? rows.map((row, index) => {
      const buyerStage = ["PRONTA_PARA_NOTA", "NF_EM_PREPARACAO", "NF_ANEXADA"].includes(row.invoice_stage);
      const age = Math.max(0, Math.floor((Date.now() - new Date(row.status_changed_at || row.updated_at).getTime()) / 60000));
      return `<tr><td>${e(row.codigo_transferencia || row.codigo_material || row.id)}<small>${e(row.domain === "TRANSFERENCIA" ? row.destino_nome || "Transferencia" : row.nome_material || "Reposicao")}</small></td><td>Compras</td><td>${e(FISCAL_LABELS[row.invoice_stage] || row.status)}</td><td>${buyerStage ? "Compras" : "Estoque / Expedicao"}</td><td>${age} min</td><td><button class="secondary-button" data-fiscal-open="${index}" type="button">Abrir</button></td></tr>`;
    }).join("") : '<tr><td colspan="6">Nenhum processo neste filtro.</td></tr>';
    document.getElementById("fiscalPrevious").disabled = page === 0;
    document.getElementById("fiscalNext").disabled = rows.length < 30;
    root.dataset.role = role;
  }

  async function refresh() {
    if (busy) return;
    const warehouse = context.warehouse();
    if (warehouse !== loadedWarehouse) { page = 0; selected = null; document.getElementById("fiscalDetail").hidden = true; }
    loadedWarehouse = warehouse; busy = true;
    try {
      const filter = document.getElementById("fiscalQueueFilter").value;
      const buyer = context.user().role === "COMPRAS";
      const stages = filter === "closed" ? ["FINALIZADA"] : filter === "mine"
        ? buyer ? ["PRONTA_PARA_NOTA", "NF_EM_PREPARACAO", "NF_ANEXADA"] : ["", "CORRECAO_SOLICITADA", "LIBERADA_PARA_ENVIO", "DESPACHADA", "RECEBIDA"] : null;
      const responses = await Promise.all(["wms_transfers", "wms_replenishment_requests"].map(async (table) => {
        let query = context.client().from(table).select("id,warehouse_code,status,request_origin,invoice_stage,status_changed_at,updated_at" + (table === "wms_transfers" ? ",codigo_transferencia,destino_nome" : ",codigo_material,nome_material"))
          .eq("warehouse_code", warehouse).eq("requires_invoice", true).eq("is_deleted", false);
        if (stages) query = query.in("invoice_stage", stages); else query = query.neq("invoice_stage", "FINALIZADA");
        const result = await query.order("updated_at", { ascending: false }).range(page * 30, page * 30 + 29);
        if (result.error) throw result.error;
        return (result.data || []).map(row => ({ ...row, domain: table === "wms_transfers" ? "TRANSFERENCIA" : "REPOSICAO", table }));
      }));
      if (warehouse !== context.warehouse()) return;
      rows = responses.flat().sort((a, b) => b.updated_at.localeCompare(a.updated_at)); render();
      const summary = await context.client().rpc("wms_fiscal_summary", { p_warehouse: warehouse });
      if (!summary.error) document.getElementById("fiscalMetrics").innerHTML = Object.entries(summary.data || {}).map(([label, total]) => `<article class="stock-summary-card"><span>${e(label)}</span><strong>${total}</strong></article>`).join("");
      const notices = await context.client().from("wms_notifications").select("id,message,created_at").eq("warehouse_code", warehouse)
        .eq("user_id", buyer ? "role:COMPRAS" : "role:ESTOQUE").order("created_at", { ascending: false }).limit(3);
      if (!notices.error) document.getElementById("fiscalNotifications").innerHTML = (notices.data || []).map(n => `<p class="inline-status">${e(n.message)}</p>`).join("");
      status("");
    } catch (error) { status(error.message || String(error)); }
    finally { busy = false; }
  }

  async function open(row) {
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
    detail.innerHTML = `<h3>Documento fiscal - ${e(selected.codigo_transferencia || selected.codigo_material || selected.id)}</h3><p>Origem da solicitacao: Compras | ${e(FISCAL_LABELS[selected.invoice_stage])}</p><p>Caixas: ${Number(selected.total_caixas || selected.invoice_box_count || 0)} | NFe: ${e(selected.invoice_number || "-")}</p><p>Anexado por: ${e(selected.invoice_uploaded_by_name || "-")} | ${e(selected.invoice_uploaded_at ? new Date(selected.invoice_uploaded_at).toLocaleString() : "-")}</p>${selected.fiscal_reason ? `<p class="inline-status warning">${e(selected.fiscal_reason)}</p>` : ""}
      <div class="table-wrapper"><table><thead><tr><th>Material</th><th>Solicitada</th><th>Separada</th><th>Conferida / NF</th><th>Diferenca</th><th>Observacao</th></tr></thead><tbody>${snapshot.map(i => `<tr><td>${e(i.sku)}</td><td>${i.requested}</td><td>${i.separated}</td><td>${i.checked}</td><td>${i.difference}</td><td>${e(i.observation || "")}</td></tr>`).join("")}</tbody></table></div>
      <div class="button-row">${fiscalActions(selected.invoice_stage, role, selected.domain).map(([action,label]) => `<button class="secondary-button" data-fiscal-action="${action}" type="button">${label}</button>`).join("")}${selected.invoice_file_path ? '<button class="secondary-button" id="fiscalViewPdf" type="button">Abrir PDF</button>' : ""}${selected.domain === "TRANSFERENCIA" ? '<button class="secondary-button" id="fiscalOpenTransfer" type="button">Abrir transferencia</button>' : ""}</div>
      ${editableInvoice ? `<form id="fiscalUploadForm"><label>Numero da NFe<input name="number" maxlength="120" value="${e(selected.invoice_number)}" required></label><label>Chave da NFe<input name="key" maxlength="44" value="${e(selected.invoice_key)}"></label><label>PDF da NF<input name="pdf" type="file" accept="application/pdf,.pdf" required></label><button class="primary-button" type="submit">${selected.invoice_file_path ? "Substituir PDF" : "Anexar NF"}</button></form>` : ""}<details id="fiscalHistory"><summary>Historico do processo</summary><div id="fiscalHistoryRows"></div></details>`;
    detail.querySelector("#fiscalUploadForm")?.addEventListener("submit", upload);
    detail.querySelector("#fiscalViewPdf")?.addEventListener("click", async () => {
      const result = await context.client().storage.from("wms-transfer-invoices").createSignedUrl(selected.invoice_file_path, 300);
      if (result.error) return status(result.error.message);
      const link = document.createElement("a"); link.href = result.data.signedUrl; link.target = "_blank"; link.rel = "noopener noreferrer"; link.click();
    });
    detail.querySelector("#fiscalOpenTransfer")?.addEventListener("click", () => context.openTransfer(selected.id));
    if (selected.domain === "TRANSFERENCIA") {
      const divergences = await context.client().from("wms_transfer_divergences").select("id,sku,observation,resolved,difference_quantity").eq("transfer_id", selected.id).eq("warehouse_code",selected.warehouse_code).eq("resolved",false).limit(100);
      if (divergences.error) throw divergences.error;
      if (divergences.data?.length) {
        const canResolve = ["ADMINISTRADOR","SUPERVISOR","OPERADOR"].includes(role);
        detail.insertAdjacentHTML("beforeend", `<h4>Divergencias impeditivas</h4>${divergences.data.map((d,i) => `<p>${e(d.sku)} | Diferenca: ${Number(d.difference_quantity)} | ${e(d.observation)} ${canResolve ? `<button class="secondary-button" type="button" data-fiscal-resolve="${i}">Registrar resolucao</button>` : ""}</p>`).join("")}`);
        detail.querySelectorAll("[data-fiscal-resolve]").forEach(button => button.addEventListener("click", async () => {
          if (busy) return;
          const reason = window.prompt("Justifique a resolucao ou aceite da divergencia:",""); if (!reason?.trim()) return;
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
      document.getElementById("fiscalHistoryRows").textContent = result.error ? result.error.message : (result.data || []).map(item => [item.created_at || item.datetime,item.event_type || item.action,item.user_name || "",item.details || ""].join(" | ")).join("\n");
    });
  }

  async function act(action, data = {}, id) {
    if (!selected) return;
    const result = await context.client().rpc("wms_invoice_action", { p_domain: selected.domain, p_id: selected.id, p_expected_stage: selected.invoice_stage,
      p_action: action, p_data: data, p_action_id: id || randomId("fiscal") });
    if (result.error) throw result.error;
    await open(selected); context.changed();
  }

  async function upload(event) {
    event.preventDefault(); if (busy) return; busy = true;
    const form = event.target; const button = form.querySelector("button"); button.disabled = true;
    let path = ""; let uploaded = false;
    try {
      const file = form.elements.pdf.files[0]; await validateInvoicePdf(file);
      path = `${selected.warehouse_code}/${selected.table}/${selected.id}/${randomId("nf")}.pdf`;
      const result = await context.client().storage.from("wms-transfer-invoices").upload(path, file, { contentType: "application/pdf", upsert: false });
      if (result.error) throw result.error; uploaded = true;
      await act("UPLOAD", { number: form.elements.number.value, key: form.elements.key.value, path, filename: file.name });
      uploaded = false; status("NF anexada. Confira antes de liberar para envio.");
    } catch (error) {
      if (uploaded) {
        const cleanup = await context.client().storage.from("wms-transfer-invoices").remove([path]);
        if (cleanup.error) context.diagnostic("invoice-orphan", cleanup.error);
      }
      context.diagnostic("invoice-upload", error); status(error.message || String(error));
    } finally { busy = false; button.disabled = false; const message=document.getElementById("fiscalWorkflowStatus").textContent;await refresh();status(message); }
  }

  root.addEventListener("click", async event => {
    const opener = event.target.closest("[data-fiscal-open]");
    if (opener) { try { await open(rows[Number(opener.dataset.fiscalOpen)]); } catch (error) { status(error.message); } return; }
    const button = event.target.closest("[data-fiscal-action]"); if (!button || busy) return;
    const action = button.dataset.fiscalAction; const data = {};
    if (["CORRECTION", "REOPEN"].includes(action)) { data.reason = window.prompt("Informe o motivo:", ""); if (!data.reason?.trim()) return; }
    if (action === "READY") {
      data.boxes = Number(window.prompt("Quantidade de caixas prontas:", "1"));
      data.checked = Number(window.prompt("Quantidade efetivamente conferida:", selected.quantidade_atendida || "0"));
      if (!Number.isInteger(data.boxes) || data.boxes < 1 || !Number.isFinite(data.checked) || data.checked <= 0) return status("Confira caixas e quantidade.");
    }
    if (!pendingAction || pendingAction.entity !== selected.id || pendingAction.action !== action) pendingAction = { entity: selected.id, action, id: randomId("fiscal") };
    button.disabled = true; busy = true;
    try { await act(action, data, pendingAction.id); pendingAction = null; status("Etapa atualizada."); }
    catch (error) { context.diagnostic("invoice-action",error); status(error.message); }
    finally { button.disabled = false; busy = false; const message=document.getElementById("fiscalWorkflowStatus").textContent;await refresh();status(message); }
  });
  document.getElementById("fiscalRefresh").addEventListener("click", refresh);
  document.getElementById("fiscalQueueFilter").addEventListener("change", () => { page = 0; refresh(); });
  document.getElementById("fiscalPrevious").addEventListener("click", () => { page = Math.max(0,page-1); refresh(); });
  document.getElementById("fiscalNext").addEventListener("click", () => { page++; refresh(); });
  return { refresh, open, summary: () => context.client().rpc("wms_fiscal_summary", { p_warehouse: context.warehouse() }) };
}
