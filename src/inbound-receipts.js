import { escapeHtml as e } from "./utils.js";
import { inboundRoles, inboundLabels, inboundItemStatus, inboundSummary, findInboundItems, inboundScanUnit, previewInboundXml, inboundReportRows } from "./inbound-receipts-domain.js";
import { inboundShell, inboundActiveCard, inboundDetail, inboundItemEditor, inboundItemRows, decorateInboundIcons } from "./inbound-receipts-view.js";
import "./inbound-receipts.css";

export function mountInboundReceipts(context) {
  const root = document.getElementById("inboundReceiptRoot");
  let scope = "", generation = 0, receipt = null, items = [], busy = false, pending = null, selectedItem = null, lastHistoryMode = false, scanMode = "LOCATE", itemFilter = "ALL", activeRows = [], historyMode = false;
  const $ = selector => root.querySelector(selector);
  const actor = () => context.user();
  const allowed = () => inboundRoles.includes(actor()?.role);
  const manager = () => ["ADMINISTRADOR", "SUPERVISOR"].includes(actor()?.role);
  const identity = () => actor()?.id + ":" + context.warehouse();
  const editable = () => receipt?.status === "EM_CONFERENCIA" && receipt.assigned_to === actor()?.id;
  const qty = value => Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 6 });
  const date = value => value ? new Date(value).toLocaleString("pt-BR") : "—";
  const message = text => { $("[data-message]").textContent = text; };
  const checked = result => { if (result.error) throw result.error; return result.data; };
  function setup() {
    root.innerHTML = inboundShell(manager());
    decorateInboundIcons(root);
    $("[data-filter]").onsubmit = event => { event.preventDefault(); refresh().catch(fail); };
    $("[data-file]").onchange = async () => {
      const token = generation, file = $("[data-file]").files[0];
      $("[data-preview]").textContent = "";
      if (!file) return;
      try {
        if (file.size > 5242880) throw new Error("XML acima de 5 MB.");
        const preview = previewInboundXml(await file.text()); if (token !== generation) return;
        $("[data-preview]").textContent = `NF ${preview.number} · ${preview.source} · ${preview.items} produtos · CNPJ destinatário ${preview.destination}. A validação final será feita no servidor.`;
      } catch (error) { if (token === generation) fail(error); }
    };
    $("[data-import-form]").onsubmit = async event => {
      event.preventDefault(); if (busy || !manager()) return;
      const file = $("[data-file]").files[0], token = generation, ownScope = identity();
      if (!file) return;
      busy = true; lock(true);
      try {
        if (file.size > 5242880) throw new Error("XML acima de 5 MB.");
        const xml = await file.text(); previewInboundXml(xml);
        if (token !== generation || ownScope !== identity()) return;
        const id = checked(await context.client().rpc("import_wms_inbound", { p_warehouse: context.warehouse(), p_xml: xml, p_action_id: crypto.randomUUID() }));
        if (token !== generation || ownScope !== identity()) return;
        await open(id); message("NF-e importada. Se já existia, o recebimento anterior foi aberto sem duplicação."); await list();
      } catch (error) { if (token === generation) fail(error); }
      finally { if (ownScope === identity()) { busy = false; lock(false); } }
    };
    root.onchange = event => { if (event.target.hasAttribute("data-current-select")) renderCurrent(event.target.value); };
    root.onclick = event => {
      const button = event.target.closest("button"); if (!button || busy) return;
      if (button.dataset.open) open(button.dataset.open).catch(fail);
      if (button.dataset.itemFilter) { itemFilter = button.dataset.itemFilter; renderItemRows(); }
      if (button.dataset.step && $("[data-quantity]")) {
        const input = $("[data-quantity]"); input.value = String(Math.max(0, Math.round((Number(input.value || 0) + Number(button.dataset.step)) * 1000000) / 1000000));
      }
      if (button.dataset.line) edit(items.find(i => i.id === button.dataset.line));
      if (button.hasAttribute("data-start")) act("START", {}).catch(fail);
      if (button.hasAttribute("data-assign")) act("ASSIGN", { user_id: $("[data-user]").value }).catch(fail);
      if (button.hasAttribute("data-finish")) finish().catch(fail);
      if (button.hasAttribute("data-validate")) act("VALIDATE", {}).catch(fail);
      if (button.hasAttribute("data-report")) report(false);
      if (button.hasAttribute("data-divergences")) report(true);
      if (button.hasAttribute("data-extra")) extra();
      if (button.hasAttribute("data-reload")) refresh().catch(fail);
      if (button.hasAttribute("data-history")) history().catch(fail);
      if (button.hasAttribute("data-xml")) download(receipt.xml_content, `NFe_${receipt.invoice_key}.xml`, "application/xml");
      if (button.hasAttribute("data-cancel-receipt")) manageReceipt("CANCEL").catch(fail);
      if (button.hasAttribute("data-delete-receipt")) manageReceipt("DELETE").catch(fail);
    };
  }
  function fail(error) { message(error?.message || "Não foi possível concluir. Atualize e tente novamente."); }
  function lock(value) { root.querySelectorAll("button,input,select").forEach(el => { el.disabled = value; }); }
  async function list() {
    const token = generation, warehouse = context.warehouse();
    let query = context.client().from("wms_inbound_receipts").select("id,invoice_number,series,source_name,assigned_name,status,created_at,version").eq("warehouse_code", warehouse).order("created_at", { ascending: false }).limit(200);
    const state = $("[data-status]").value, day = $("[data-date]").value;
    const search = $("[data-search]").value.trim().replace(/[^\p{L}\p{N} -]/gu, " ").replace(/\s+/g, " ").slice(0,100);
    if (search) query = query.or(`invoice_number.ilike.%${search}%,source_name.ilike.%${search}%,assigned_name.ilike.%${search}%`);
    if (state === "CONCLUIDOS") query = query.in("status", ["CONCLUIDO_CORRETO", "CONCLUIDO_DIVERGENTE", "CANCELADO"]);
    else if (state) query = query.eq("status", state);
    if (day) { const start = new Date(day + "T00:00:00"), end = new Date(start); end.setDate(end.getDate() + 1); query = query.gte("created_at", start.toISOString()).lt("created_at", end.toISOString()); }
    const rows = checked(await query);
    if (token !== generation || warehouse !== context.warehouse()) return;
    const visible = rows;
    $("[data-list]").innerHTML = `<small>Até 200 recebimentos recentes, conforme seus filtros e permissões.</small><table><thead><tr><th>NF / Série</th><th>Origem</th><th>Conferente</th><th>Situação</th><th>Importação</th><th></th></tr></thead><tbody>${visible.map(r => `<tr><td>${e(r.invoice_number)} / ${e(r.series)}</td><td>${e(r.source_name)}</td><td>${e(r.assigned_name || "Não atribuído")}</td><td><span class="inbound-badge inbound-badge--${r.status==='CONCLUIDO_CORRETO'?'correct':r.status==='CONCLUIDO_DIVERGENTE'?'excess':r.status==='CANCELADO'?'pending':'working'}">${e(inboundLabels[r.status])}</span></td><td>${e(date(r.created_at))}</td><td><button type="button" class="secondary-button" data-open="${e(r.id)}">Abrir</button></td></tr>`).join("") || '<tr><td colspan="6">Nenhum recebimento encontrado.</td></tr>'}</tbody></table>`;
    const ongoing = checked(await context.client().from("wms_inbound_receipts").select("id,invoice_number,series,source_name,assigned_name,status,created_at").eq("warehouse_code", warehouse).in("status", ["EM_CONFERENCIA", "AGUARDANDO"]).order("created_at", { ascending: false }).limit(100));
    if (token !== generation || warehouse !== context.warehouse()) return;
    activeRows = ongoing; renderCurrent();
    if (!receipt && !activeRows.length) $("[data-browser]").open = true;
  }
  function renderCurrent(selectedId = receipt?.id) {
    $("[data-current]").innerHTML = inboundActiveCard(activeRows, { id: selectedId });
    decorateInboundIcons($("[data-current]"));
  }
  function renderItemRows() {
    if (!receipt || !$("[data-item-rows]")) return;
    $("[data-item-rows]").innerHTML = inboundItemRows(items, { editable: editable(), selectedId: selectedItem?.id, filter: itemFilter });
    root.querySelectorAll("[data-item-filter]").forEach(button => { const active = button.dataset.itemFilter === itemFilter; button.className = active ? "primary-button" : "secondary-button"; button.setAttribute("aria-pressed", String(active)); });
    decorateInboundIcons($("[data-item-rows]"));
  }

  async function open(id) {
    const token = ++generation, warehouse = context.warehouse(); selectedItem = null;
    const record = checked(await context.client().from("wms_inbound_receipts").select("*").eq("id", id).eq("warehouse_code", warehouse).single());
    const lines = checked(await context.client().from("wms_inbound_receipt_items").select("*").eq("receipt_id", id).order("line_number").limit(6001));
    if (token !== generation || identity() !== scope || warehouse !== context.warehouse()) return;
    receipt = record; items = lines; detail(); message("");
  }
  function detail() {
    const r = receipt, summary = inboundSummary(items);
    $("[data-detail]").hidden = false;
    const users = context.users().filter(u => u.active && !u.archived && u.role === "OPERADOR" && context.userWarehouse(u));
    $("[data-detail]").innerHTML = inboundDetail({ receipt: r, items, summary, isManager: manager(), isAdministrator: actor()?.role === "ADMINISTRADOR", editable: editable(), actorId: actor()?.id, users, filter: itemFilter, selectedId: selectedItem?.id });
    decorateInboundIcons($("[data-detail]"));
      if(context.share){const share=document.createElement("button");share.type="button";share.className="secondary-button comm-share";share.textContent="Compartilhar conferência na Comunicação";share.onclick=()=>context.share({type:"RECEIPT",id:r.id}).catch(fail);$("[data-detail]").prepend(share);}
    renderCurrent();
    if ($("[data-scan]")) $("[data-scan]").onsubmit = event => {
      event.preventDefault(); const matches = findInboundItems(items, $("[data-code]").value);
      if (matches.length !== 1) { message(matches.length ? "Há mais de uma linha correspondente. Escolha a linha do XML abaixo." : "Código sem vínculo. Escolha a linha e associe o SKU WMS, ou registre produto não previsto."); return; }
      const code = $("[data-code]").value.trim(), item = matches[0];
      if (scanMode === "ADD") {
        const unit = inboundScanUnit(item, code);
        if (!unit) { message("Este código não identifica a unidade física. Escolha a unidade e lance a quantidade manualmente."); edit(item, code); return; }
        $("[data-code]").value = ""; selectedItem = item;
        act("COUNT", { item_id: item.id, quantity: "1", unit, mode: "ADD", observation: item.observation }).catch(fail);
      } else edit(item, code);
    };
    if ($("[data-scan]")) {
      const label = document.createElement("label"); label.textContent = "Modo da bipagem";
      const select = document.createElement("select"); select.innerHTML = '<option value="LOCATE">Localizar item</option><option value="ADD">Somar 1 por bipagem</option>'; select.value = scanMode;
      select.onchange = () => { scanMode = select.value; $("[data-scan-mode-label]").textContent = "Modo: " + (scanMode === "ADD" ? "Somar 1 por bipagem" : "Localizar item"); $("[data-scan] button[type=submit]").textContent = scanMode === "ADD" ? "Registrar +1" : "Localizar"; }; label.appendChild(select); $("[data-scan-options]").prepend(label);
      $("[data-scan-mode-label]").textContent = "Modo: " + (scanMode === "ADD" ? "Somar 1 por bipagem" : "Localizar item");
      $("[data-scan] button[type=submit]").textContent = scanMode === "ADD" ? "Registrar +1" : "Localizar";
    }
  }
  function edit(item, scannedCode = "") {
    if (!editable() || !item) return; selectedItem = item;
    const editor = $("[data-editor]"); editor.hidden = false;
    editor.innerHTML = inboundItemEditor(item, receipt);
    if ($("[data-product-empty]")) $("[data-product-empty]").hidden = true;
    decorateInboundIcons(editor); renderItemRows();
    $("[data-map]").onsubmit = event => { event.preventDefault(); act("MAP", { item_id: item.id, sku: $("[data-map-sku]").value.trim() }).catch(fail); };
    $("[data-count]").onsubmit = event => { event.preventDefault(); act("COUNT", { item_id: item.id, quantity: $("[data-quantity]").value, unit: $("[data-unit]").value, mode: $("[data-mode]").value, observation: $("[data-observation]").value }).catch(fail); };
    $("[data-one]").onclick = () => act("COUNT", { item_id: item.id, quantity: "1", unit: $("[data-unit]").value, mode: "ADD", observation: $("[data-observation]").value }).catch(fail);
    if (scannedCode && item.commercial_unit !== item.tributary_unit) {
      if (scannedCode === item.tributary_ean && scannedCode !== item.ean) $("[data-unit]").value = item.tributary_unit;
      else if (scannedCode !== item.ean) {
        const placeholder = document.createElement("option"); placeholder.value = ""; placeholder.textContent = "Escolha a unidade física"; $("[data-unit]").prepend(placeholder); $("[data-unit]").value = "";
      }
    }
    $("[data-unit]").required = true;
    $("[data-mode]").onchange = () => {
      const total = $("[data-mode]").value === "SET";
      $("[data-quantity-label]").textContent = total ? "Total recebido" : "Quantidade a adicionar";
      $("[data-count-mode-label]").textContent = "Opções de contagem · " + (total ? "definir total recebido" : "adicionar à contagem");
    };
    $("[data-one]").onclick = () => {
      if (!$("[data-unit]").value) { message("Escolha a unidade física antes de contar."); return; }
      act("COUNT", { item_id: item.id, quantity: "1", unit: $("[data-unit]").value, mode: "ADD", observation: $("[data-observation]").value }).catch(fail);
    };
    const catalogStatus = document.createElement("small"); catalogStatus.textContent = "Buscando correspondência no cadastro WMS..."; $("[data-map]").appendChild(catalogStatus);
    const candidates = [item.supplier_code];
    if (/^\d+$/.test(item.supplier_code)) candidates.push(item.supplier_code.replace(/^0+(?=\d)/, ""), item.supplier_code.padStart(5, "0"));
    const token = generation;
    context.client().from("wms_products").select("sku,product_name").in("sku", [...new Set(candidates)]).limit(10).then(result => {
      if (token !== generation || selectedItem?.id !== item.id || !catalogStatus.isConnected) return;
      if (result.error) { catalogStatus.textContent = "Cadastro indisponível. A nota original foi preservada."; return; }
      catalogStatus.textContent = result.data.length ? "Possíveis correspondências (confirme antes de vincular): " + result.data.map(p => p.sku + " · " + p.product_name).join("; ") : "Sem correspondência pelo código da nota. Informe o SKU interno, se conhecido.";
    }).catch(() => { if (catalogStatus.isConnected) catalogStatus.textContent = "Não foi possível consultar o cadastro."; });
    editor.scrollIntoView({ block: "nearest" });
  }
  function extra() {
    if (!editable()) return;
    const editor = $("[data-editor]"); editor.hidden = false;
    editor.innerHTML = '<h4>Produto não previsto na NF-e</h4><form data-extra-form class="inbound-toolbar"><label>Código<input name="code" required maxlength="100"></label><label>Descrição<input name="description" required maxlength="300"></label><label>Quantidade<input name="quantity" type="number" min="0.000001" step="0.000001" required></label><label>Unidade<input name="unit" required maxlength="20" placeholder="Ex.: UN"></label><label>Observação<input name="observation" maxlength="500"></label><button type="submit" class="primary-button">Registrar divergência</button></form>';
    $("[data-extra-form]").onsubmit = event => { event.preventDefault(); const form = event.currentTarget; const data = {}; ["code", "description", "quantity", "unit", "observation"].forEach(key => { data[key] = form.elements.namedItem(key).value; }); act("EXTRA", data).catch(fail); };
  }
  async function act(action, data) {
    if (busy || !receipt || !allowed() || scope !== identity()) return;
    const signature = JSON.stringify([receipt.id, action, data]);
    if (!pending || pending.signature !== signature) pending = { signature, id: crypto.randomUUID(), version: receipt.version };
    const request = pending, token = generation, ownScope = scope, id = receipt.id, reopen = selectedItem?.id;
    busy = true; lock(true);
    try {
      checked(await context.client().rpc("act_wms_inbound", { p_id: id, p_action: action, p_data: data, p_version: request.version, p_action_id: request.id }));
      if (token !== generation || ownScope !== identity()) return;
      pending = null; await open(id); await list(); message("Recebimento atualizado.");
      if (["COUNT", "MAP"].includes(action) && reopen) { edit(items.find(i => i.id === reopen)); if (data.unit) $("[data-unit]").value = data.unit; }
    } catch (error) {
      if (token === generation) {
        if (error.code && !["PGRST000", "PGRST001", "PGRST002"].includes(error.code)) pending = null;
        fail(error);
      }
    } finally { if (ownScope === identity()) { busy = false; lock(false); if (scanMode === "ADD") $("[data-code]")?.focus(); } }
  }
  async function finish() {
    const summary = inboundSummary(items);
    if (summary.pending) { message("Há itens pendentes. Informe zero nos produtos não recebidos."); return; }
    if (summary.divergent && !$("[data-confirm]").checked) { message("Revise as divergências e marque a confirmação antes de finalizar."); return; }
    if (!window.confirm(`Finalizar NF ${receipt.invoice_number} com ${summary.divergent} divergência(s)? A contagem ficará encerrada e disponível no histórico.`)) return;
    await act("FINISH", { confirm_divergences: $("[data-confirm]").checked });
  }
  async function manageReceipt(action) {
    if (busy || !receipt || !manager() || (action === "DELETE" && actor()?.role !== "ADMINISTRADOR")) return;
    const snapshot = receipt, ownScope = identity(), warehouse = context.warehouse();
    const data = {};
    if (action === "DELETE") {
      const confirmation = window.prompt(`Excluir definitivamente o recebimento da NF ${snapshot.invoice_number}, série ${snapshot.series}?\nSerão apagados o XML importado, os itens, as contagens e o histórico deste recebimento. Esta ação não pode ser desfeita.\nDigite o número da NF para confirmar:`);
      if (confirmation === null) return;
      if (confirmation.trim() !== snapshot.invoice_number) { message("Número da NF não confere. Nada foi excluído."); return; }
      data.confirmation = confirmation.trim();
    } else {
      const reason = window.prompt(`Cancelar o recebimento da NF ${snapshot.invoice_number}?\nA contagem e o histórico serão preservados. Informe o motivo para confirmar:`);
      if (reason === null) return;
      if (!reason.trim()) { message("Informe o motivo do cancelamento."); return; }
      data.reason = reason.trim().slice(0, 500);
    }
    if (ownScope !== identity() || receipt?.id !== snapshot.id) return;
    busy = true; lock(true);
    try {
      checked(await context.client().rpc("manage_wms_inbound", { p_id: snapshot.id, p_warehouse: warehouse, p_action: action, p_data: data, p_version: snapshot.version, p_action_id: crypto.randomUUID() }));
      if (ownScope !== identity()) return;
      if (action === "DELETE") {
        ++generation; receipt = null; items = []; selectedItem = null; pending = null;
        $("[data-detail]").hidden = true; $("[data-detail]").innerHTML = "";
      } else await open(snapshot.id);
      await list(); message(action === "DELETE" ? "Recebimento excluído definitivamente." : "Recebimento cancelado. Contagens e histórico preservados.");
    } finally { if (ownScope === identity()) { busy = false; lock(false); } }
  }
  async function history() {
    const token = generation, id = receipt.id;
    const events = checked(await context.client().from("wms_inbound_receipt_events").select("action,actor_name,created_at,request_data,result_data").eq("receipt_id", id).order("id", { ascending: false }).limit(100));
    if (token !== generation || receipt.id !== id) return;
    $("[data-events]").innerHTML = `<h4>Últimas 100 ações</h4>${events.map(event => `<p>${e(date(event.created_at))} · ${e(event.actor_name)} · ${e(event.action)}<small>${e(JSON.stringify(event.request_data))}</small></p>`).join("")}`;
  }
  function download(text, name, type) { const url = URL.createObjectURL(new Blob([text], { type })); const link = document.createElement("a"); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function report(divergences) {
    const lines = divergences ? items.filter(i => !["PENDENTE", "CORRETO"].includes(inboundItemStatus(i))) : items;
    const rows = inboundReportRows(receipt, lines);
    const csv = rows.map(row => row.map(value => '"' + String(value ?? "").replace(/^[=+@-]/, "'$&").replace(/"/g, '""') + '"').join(";")).join("\r\n");
    download("\ufeff" + csv, `Recebimento_${receipt.invoice_number}_${divergences ? "divergencias" : "completo"}.csv`, "text/csv;charset=utf-8");
  }
  async function refresh() { if (receipt) await open(receipt.id); await list(); }
  async function render(showHistory = false) {
    historyMode = showHistory;
    const needsSetup = scope !== identity(), modeChanged = historyMode !== lastHistoryMode;
    if (!allowed()) { ++generation; scope = ""; receipt = null; items = []; root.innerHTML = ""; return; }
    if (scope !== identity()) { ++generation; scope = identity(); receipt = null; items = []; pending = null; busy = false; activeRows = []; itemFilter = "ALL"; setup(); }
    if (historyMode !== lastHistoryMode) {
      if (!$("[data-status] option[value=CONCLUIDOS]")) { const option = document.createElement("option"); option.value = "CONCLUIDOS"; option.textContent = "Concluídos e cancelados"; $("[data-status]").appendChild(option); }
      $("[data-status]").value = historyMode ? "CONCLUIDOS" : ""; lastHistoryMode = historyMode;
    }
    root.classList.toggle("inbound-history-mode", historyMode);
    if (needsSetup || modeChanged) $("[data-browser]").open = historyMode;
    await list();
  }
  window.setInterval(async () => {
    if (scope && scope !== identity()) { ++generation; receipt = null; items = []; pending = null; scope = ""; root.innerHTML = ""; return; }
    if (!receipt || busy || !root.closest(".transfer-section") || root.closest(".transfer-section").hidden) return;
    try {
      const ownId = receipt.id, token = generation;
      const row = checked(await context.client().from("wms_inbound_receipts").select("version").eq("id", ownId).eq("warehouse_code", context.warehouse()).maybeSingle());
      if (token === generation && (!row || row.version !== receipt.version)) message("Este recebimento mudou. Clique em Atualizar recebimento antes de continuar.");
    } catch { /* Explicit refresh surfaces network failures without losing entered values. */ }
  }, 15000);
  return { render, open };
}
