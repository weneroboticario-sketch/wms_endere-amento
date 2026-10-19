import { escapeHtml as e, randomId } from "./utils.js";
import { decorateWorkflow } from "./cpalamo-appearance.js";
import { createElement, Truck, ClipboardList, Users, PackageCheck, TriangleAlert, Search, RefreshCw, X, FileText, History, ArrowLeftRight, Package, Clock } from "lucide";

export const EXPEDITION_LABELS = Object.freeze({
  "": "Aguardando expedicao", ATRIBUIDA: "Atribuida", COLETADA: "Coletada",
  EM_TRANSITO: "Em transito", ENTREGUE: "Entregue", ENTREGA_COM_DIVERGENCIA: "Entrega com divergencia"
});

export function deliverySla(row, now = Date.now(), attention = 80) {
  const start=Date.parse(row.invoice_released_at), deadline=Date.parse(row.delivery_deadline);
  const confirmed=row.expedition_stage!=="ENTREGA_COM_DIVERGENCIA"&&(row.delivery_resolved_at||row.delivered_at);
  const end=confirmed?Date.parse(confirmed):now;
  if (!Number.isFinite(start)||!Number.isFinite(deadline)||!Number.isFinite(end)||deadline<=start) return "Sem prazo";
  if (end>deadline) return "Atrasado";
  if (confirmed) return "No prazo";
  return (end-start)/(deadline-start)*100>=attention?"Atencao":"No prazo";
}

export function expeditionActions(row,user) {
  if (user.role==="COMPRAS") return (!row.expedition_stage&&row.invoice_stage==="LIBERADA_PARA_ENVIO")||row.expedition_stage==="ATRIBUIDA" ? [["ASSIGN",row.expedition_stage?"Reatribuir":"Atribuir expedicao"]] : [];
  if (!["ADMINISTRADOR","SUPERVISOR","OPERADOR"].includes(user.role)) return [];
  const manager=["ADMINISTRADOR","SUPERVISOR"].includes(user.role);
  const owner=manager||row.expedition_responsible_id===user.id;
  if (!row.expedition_stage && row.invoice_stage==="LIBERADA_PARA_ENVIO") return [["ASSIGN",manager?"Atribuir expedicao":"Assumir expedicao"]];
  if (!owner) return [];
  if (row.expedition_stage==="ATRIBUIDA") return [...(manager?[["ASSIGN","Reatribuir"]]:[]),["COLLECT","Confirmar coleta"]];
  if (row.expedition_stage==="COLETADA") return [["TRANSIT","Registrar transito"],["DELIVER","Registrar entrega"]];
  if (row.expedition_stage==="EM_TRANSITO") return [["DELIVER","Registrar entrega"]];
  if (row.expedition_stage==="ENTREGA_COM_DIVERGENCIA" && manager) return [["RESOLVE","Resolver divergencia"]];
  return [];
}

const FIELDS="id,codigo_transferencia,warehouse_code,origem_codigo_loja,destino_codigo_loja,destino_nome,invoice_stage,invoice_number,invoice_file_path,invoice_released_at,expedition_stage,expedition_responsible_id,expedition_responsible_name,expedition_revision,delivery_deadline,delivered_at,delivery_resolved_at,collected_at,transit_at,dispatched_boxes,received_boxes,total_caixas,final_box_count,total_boxes,delivery_reason";
const date=value=>value?new Date(value).toLocaleString("pt-BR",{timeZone:"America/Cuiaba"}):"-";
export function expeditionBoxCount(value) {
  if (value === null || value === undefined || value === "") return null;
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : null;
}
export function expeditionReadyBoxes(row) {
  return [row.final_box_count, row.total_boxes, row.total_caixas].map(expeditionBoxCount).find(value => value !== null) ?? null;
}
const boxes = expeditionReadyBoxes;
const boxLabel = value => expeditionBoxCount(value) === null ? "—" : Number(value).toLocaleString("pt-BR");
export function expeditionBoxDifference(row) {
  const sent = expeditionBoxCount(row.dispatched_boxes), received = expeditionBoxCount(row.received_boxes);
  return sent === null || received === null ? null : received - sent;
}
export function expeditionTimeline(row, events = []) {
  const entries = events.filter(event => event.event_type?.startsWith("EXPEDITION_") && Number.isFinite(Date.parse(event.created_at))).map(event => ({
    stage: event.event_type.replace("EXPEDITION_", ""), at: event.created_at, actor: event.user_name || "", detail: event.details || ""
  }));
  const milestones = [["", row.invoice_released_at], ["COLETADA", row.collected_at], ["EM_TRANSITO", row.transit_at], [row.expedition_stage === "ENTREGA_COM_DIVERGENCIA" ? "ENTREGA_COM_DIVERGENCIA" : "ENTREGUE", row.delivered_at]];
  if (row.delivery_resolved_at) milestones.push(["RESOLVIDA", row.delivery_resolved_at]);
  for (const [stage, at] of milestones) {
    if (Number.isFinite(Date.parse(at)) && !entries.some(event => event.stage === stage)) entries.push({ stage, at, actor: "", detail: "" });
  }
  return entries.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
const QUEUES = [["all", "Todas"], ["", "Aguardando despacho"], ["ATRIBUIDA", "Atribuídas"], ["COLETADA", "Coletadas"], ["EM_TRANSITO", "Em trânsito"], ["ENTREGUE", "Entregues"], ["ENTREGA_COM_DIVERGENCIA", "Divergências"]];
const KPIS = [["", "Aguardando despacho", "pending"], ["ATRIBUIDA", "Atribuídas", "assigned"], ["EM_TRANSITO", "Em trânsito", "transit"], ["ENTREGUE", "Entregues", "delivered"], ["ENTREGA_COM_DIVERGENCIA", "Divergências", "divergence"]];
const ICONS = { pending: ClipboardList, assigned: Users, transit: Truck, delivered: PackageCheck, divergence: TriangleAlert, search: Search, refresh: RefreshCw, close: X, document: FileText, history: History, transfer: ArrowLeftRight, boxes: Package, clock: Clock };
function decorateExpedition(root) {
  root.querySelectorAll("[data-exp-icon]").forEach(node => {
    if (!node.children.length) node.append(createElement(ICONS[node.dataset.expIcon] || Truck, { width: 20, height: 20, "aria-hidden": "true", "stroke-width": 1.8 }));
  });
}
function expeditionBadge(row) {
  const stage = row.expedition_stage || "";
  const tone = ({ "": "pending", ATRIBUIDA: "assigned", COLETADA: "assigned", EM_TRANSITO: "transit", ENTREGUE: "delivered", ENTREGA_COM_DIVERGENCIA: "divergence" })[stage] || "pending";
  return `<span class="exp-badge exp-${tone}">${e(EXPEDITION_LABELS[stage] || stage)}</span>`;
}
function slaHtml(row, attention) {
  const label = deliverySla(row, Date.now(), attention);
  return `<span class="exp-sla exp-sla-${label === "Atrasado" ? "late" : label === "Atencao" ? "attention" : label === "No prazo" ? "ok" : "unknown"}">${e(label === "Atencao" ? "Atenção" : label)}</span>`;
}

export function createExpeditionWorkflow(context) {
  const root=document.getElementById("expeditionContent");
  if (!document.getElementById("expeditionVisualStyles")) {
    const style = document.createElement("link"); style.id = "expeditionVisualStyles"; style.rel = "stylesheet";
    style.href = new URL("./expedition-workflow.css", import.meta.url).href; document.head.append(style);
  }
  root.classList.add("expedition-workspace");
  const unitOptions=context.warehouses().map(w=>`<option value="${e(w.code)}">${e(w.code)} - ${e(w.name)}</option>`).join("");
  root.innerHTML=`<header class="exp-heading"><span class="exp-heading-icon" data-exp-icon="transit"></span><div><h2>Gestão de Expedição</h2><p>Transferências liberadas para envio</p></div></header>
    <div class="exp-kpis" aria-label="Indicadores de expedição">${KPIS.map(([value,label,tone])=>`<button type="button" class="exp-kpi exp-kpi-${tone}" data-expedition-tab="${value}" aria-pressed="false"><span class="exp-kpi-icon" data-exp-icon="${tone}"></span><span class="exp-kpi-text"><span>${label}</span><strong data-kpi="${value}">—</strong><small>Na unidade selecionada</small></span></button>`).join("")}</div>
    <section class="exp-filter-band"><nav class="exp-tabs" aria-label="Filas de expedição">${QUEUES.map(([value,label])=>`<button type="button" data-expedition-tab="${value}" aria-pressed="${value===""}">${label}</button>`).join("")}</nav>
    <div class="exp-filters"><label>Unidade<select data-unit>${unitOptions}</select></label><label>Fila<select data-queue>${QUEUES.map(([value,label])=>`<option value="${value}">${label}</option>`).join("")}</select></label><label class="exp-search-label">Código ou NF<span class="exp-search"><span data-exp-icon="search"></span><input data-search type="search" placeholder="Buscar código ou número da NF" maxlength="100"></span></label><button type="button" class="secondary-button exp-refresh" data-refresh><span data-exp-icon="refresh"></span>Atualizar</button></div></section>
    <p data-status role="status" class="inline-status"></p>
    <section class="exp-list-band"><header class="exp-list-heading"><h3>Transferências de expedição <span data-total></span></h3><span data-updated></span></header><div class="table-wrapper exp-table-wrap"><table class="exp-table"><thead><tr><th>Transferência</th><th>Origem / Destino</th><th>NFe</th><th>Caixas</th><th>Responsável</th><th>Etapa</th><th>Prazo</th><th>Ação</th></tr></thead><tbody data-rows></tbody></table></div>
    <div class="exp-pagination"><span data-page></span><div><button type="button" class="secondary-button" data-prev>Anterior</button><button type="button" class="secondary-button" data-next>Próxima</button></div></div></section>
    <dialog data-detail class="exp-drawer" aria-labelledby="expDrawerTitle" hidden></dialog><details class="exp-executive-disclosure" data-executive-disclosure><summary>Indicadores detalhados e prazos</summary><section data-executive></section></details>`;
  const find=s=>root.querySelector(s),status=(msg,tone="")=>{find("[data-status]").textContent=msg;find("[data-status]").dataset.tone=tone;const local=find("[data-detail-status]");if(local){local.textContent=msg;local.dataset.tone=tone;}};
  const detail = find("[data-detail]");
  let focusReturn=null,detailTab="summary",detailGeneration=0,eventPage=0,eventRows=[],historyLoading=false;
  detail.addEventListener("cancel", event=>{if(busy)event.preventDefault();});
  detail.addEventListener("close",()=>{detail.hidden=true;(focusReturn?.isConnected?focusReturn:find("[data-search]")).focus({preventScroll:true});});
  detail.addEventListener("keydown",event=>{
    const tab=event.target.closest("[data-detail-tab]");if(!tab||!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;
    event.preventDefault();const tabs=[...detail.querySelectorAll("[data-detail-tab]")],index=tabs.indexOf(tab);
    const target=event.key==="Home"?0:event.key==="End"?tabs.length-1:(index+(event.key==="ArrowRight"?1:tabs.length-1))%tabs.length;
    tabs[target].click();tabs[target].focus();
  });
  root.querySelectorAll("[data-expedition-tab]").forEach(button=>button.addEventListener("click",()=>{
    if (busy) return;
    find("[data-queue]").value=button.dataset.expeditionTab;
    find("[data-queue]").dispatchEvent(new window.Event("change",{bubbles:true}));
  }));
  let page=0,rows=[],selected=null,generation=0,busy=false,actionKey=null,attention=80,total=null,metricGeneration=0,loadedWarehouse=null,loadedActor=null;
  const warehouse=()=>context.global()?find("[data-unit]").value:context.warehouse();
  find("[data-unit]").value=context.global()?context.warehouses()[0]?.code:context.warehouse();
  find("[data-unit]").disabled=!context.global();
  find("[data-queue]").value="";
  const executive=createTransferExecutive(find("[data-executive]"),context,warehouse);
  let executiveLoading=false;
  async function refreshExecutive(){if(executiveLoading||!find("[data-executive-disclosure]").open)return;executiveLoading=true;try{await executive.refresh();}finally{executiveLoading=false;}}
  find("[data-executive-disclosure]").addEventListener("toggle",refreshExecutive);
  const baseQuery = columns => context.client().from("wms_transfers").select(columns, {count:"exact",...(columns==="id"?{head:true}:{})}).eq("warehouse_code",warehouse()).eq("requires_invoice",true).eq("is_deleted",false);
  async function refreshMetrics(){
    const ticket=++metricGeneration,w=warehouse(),actor=context.user()?.id;
    const results=await Promise.all(KPIS.map(async([stage])=>{
      let query=baseQuery("id").eq("expedition_stage",stage);
      query=stage===""?query.eq("invoice_stage","LIBERADA_PARA_ENVIO"):query.in("invoice_stage",["LIBERADA_PARA_ENVIO","DESPACHADA","RECEBIDA","FINALIZADA"]);
      const result=await query;return result;
    }));
    if(ticket!==metricGeneration||w!==warehouse()||actor!==context.user()?.id)return;
    results.forEach((result,i)=>{
      const value=root.querySelector(`[data-kpi="${KPIS[i][0]}"]`);
      value.textContent=result.error||typeof result.count!=="number"?"—":result.count.toLocaleString("pt-BR");
      value.closest("button").title=result.error?"Não foi possível carregar este indicador":"";
    });
  }
  function renderRows(){
    find("[data-rows]").innerHTML=rows.length?rows.map((r,i)=>`<tr class="${selected?.id===r.id?"exp-row-selected":""}"><td data-label="Transferência"><button type="button" class="exp-code" data-open="${i}">${e(r.codigo_transferencia||r.id)}</button></td><td data-label="Origem / Destino"><span class="exp-route">${e(r.origem_codigo_loja||r.warehouse_code)}<span aria-hidden="true"> → </span>${e(r.destino_codigo_loja||r.destino_nome||"—")}</span><small>${e(r.destino_nome||"")}</small></td><td data-label="NFe"><span class="exp-invoice-number">${e(r.invoice_number||"—")}</span></td><td data-label="Caixas"><span class="exp-boxes-inline"><b>${boxLabel(boxes(r))}</b> prontas</span><small>${boxLabel(r.dispatched_boxes)} enviadas · ${boxLabel(r.received_boxes)} recebidas</small></td><td data-label="Responsável">${e(r.expedition_responsible_name||"Não atribuída")}</td><td data-label="Etapa">${expeditionBadge(r)}</td><td data-label="Prazo">${slaHtml(r,attention)}<small>${e(date(r.delivery_deadline))}</small></td><td data-label="Ação"><button type="button" class="secondary-button exp-open" data-open="${i}">Abrir</button></td></tr>`).join(""):'<tr class="exp-empty"><td colspan="8"><span data-exp-icon="boxes"></span><strong>Nenhuma transferência nesta fila</strong></td></tr>';
    find("[data-page]").textContent=`Página ${page+1}${total===null?"":` · ${total.toLocaleString("pt-BR")} transferências`}`;
    find("[data-total]").textContent=total===null?"":`(${total.toLocaleString("pt-BR")})`;
    find("[data-prev]").disabled=page===0;find("[data-next]").disabled=total===null?rows.length<30:(page+1)*30>=total;
    root.querySelectorAll("[data-expedition-tab]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.expeditionTab===find("[data-queue]").value)));
    decorateExpedition(root);
  }
  async function refresh() {
    const ticket=++generation,w=warehouse(),role=context.user()?.id;
    if(loadedWarehouse!==null&&(loadedWarehouse!==w||loadedActor!==role)){detail.close();selected=null;page=0;}
    loadedWarehouse=w;loadedActor=role;
    root.setAttribute("aria-busy","true");status("Carregando expedições...");
    try {
      let query=baseQuery(FIELDS);
      const queue=find("[data-queue]").value;
      if(queue!=="all")query=query.eq("expedition_stage",queue);
      if(queue==="")query=query.eq("invoice_stage","LIBERADA_PARA_ENVIO");
      else query=query.in("invoice_stage",["LIBERADA_PARA_ENVIO","DESPACHADA","RECEBIDA","FINALIZADA"]);
      const search=find("[data-search]").value.trim().replace(/[,().%_*\\]/g,"");
      if(search)query=query.or(`codigo_transferencia.ilike.%${search}%,invoice_number.ilike.%${search}%`);
      const cfg=await context.client().from("wms_transfer_sla").select("attention_percent").eq("warehouse_code",w).maybeSingle();
      if(cfg.error)throw cfg.error;
      attention=cfg.data?.attention_percent??80;
      const result=await query.order("invoice_released_at").order("id").range(page*30,page*30+29);
      if(result.error)throw result.error;
      if(ticket!==generation||w!==warehouse()||role!==context.user()?.id)return;
      rows=result.data||[];total=typeof result.count==="number"?result.count:null;
      renderRows();find("[data-updated]").textContent=`Atualizado às ${new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}`;
      status("");
      await refreshMetrics();
    }catch(error){if(ticket===generation)status(error.message,"error");}
    finally{if(ticket===generation)root.removeAttribute("aria-busy");}
    await refreshExecutive();
  }
  function setDetailTab(value){
    detailTab=value;
    detail.querySelectorAll("[data-detail-panel]").forEach(panel=>panel.hidden=panel.dataset.detailPanel!==value);
    detail.querySelectorAll("[data-detail-tab]").forEach(button=>{button.setAttribute("aria-selected",String(button.dataset.detailTab===value));button.tabIndex=button.dataset.detailTab===value?0:-1;});
  }
  const timelineLabel=stage=>stage==="RESOLVIDA"?"Divergência resolvida":stage==="REOPENED"?"Expedição reaberta":EXPEDITION_LABELS[stage]||stage.replaceAll("_"," ");
  function renderTimeline(){
    if(!selected||!find("[data-timeline]"))return;
    const timeline=expeditionTimeline(selected,eventRows);
    find("[data-timeline]").innerHTML=timeline.length?`<ol class="exp-timeline">${timeline.map(event=>`<li class="${event.stage==="ENTREGA_COM_DIVERGENCIA"?"exp-timeline-alert":""}"><span class="exp-timeline-dot" aria-hidden="true"></span><div><strong>${e(timelineLabel(event.stage))}</strong><time>${e(date(event.at))}</time>${event.actor?`<small>${e(event.actor)}</small>`:""}</div></li>`).join("")}</ol>`:'<p class="exp-muted">Nenhum evento de expedição registrado.</p>';
  }
  async function history(){
    if(historyLoading||!selected||!detail.open)return;
    const entity=selected.id,w=warehouse(),ticket=detailGeneration,user=context.user()?.id;
    historyLoading=true;
    const button=detail.querySelector("[data-more-history]");if(button)button.disabled=true;
    try{
      const result=await context.client().from("wms_transfer_events").select("id,created_at,user_name,event_type,details,payload").eq("transfer_id",entity).eq("warehouse_code",w).order("created_at",{ascending:false}).order("id").range(eventPage*30,eventPage*30+29);
      if(result.error)throw result.error;
      if(ticket!==detailGeneration||selected?.id!==entity||warehouse()!==w||context.user()?.id!==user||!detail.open)return;
      const incoming=result.data||[];eventRows.push(...incoming);eventPage++;
      detail.querySelector("[data-events]").innerHTML=eventRows.length?eventRows.map(v=>`<article class="exp-history-event"><strong>${e(v.event_type?.startsWith("EXPEDITION_")?timelineLabel(v.event_type.replace("EXPEDITION_","")):v.event_type||"Evento")}</strong><time>${e(date(v.created_at))}${v.user_name?` · ${e(v.user_name)}`:""}</time>${v.details?`<p>${e(v.details)}</p>`:""}${v.payload?.received_boxes!=null?`<small>Caixas: ${boxLabel(v.payload.dispatched_boxes)} enviadas / ${boxLabel(v.payload.received_boxes)} recebidas</small>`:""}</article>`).join(""):'<p class="exp-muted">Nenhum evento registrado para esta transferência.</p>';
      button.disabled=incoming.length<30;button.hidden=incoming.length<30;
      renderTimeline();
    }catch(error){if(ticket===detailGeneration&&detail.open){detail.querySelector("[data-events]").textContent=error.message;if(button)button.disabled=false;}}
    finally{if(ticket===detailGeneration)historyLoading=false;}
  }
  async function open(row) {
    const ticket=++detailGeneration,w=warehouse(),user=context.user()?.id;
    if(!detail.open){focusReturn=document.activeElement;detail.hidden=false;detail.showModal();}
    detail.innerHTML='<header class="exp-drawer-heading"><h3 id="expDrawerTitle">Detalhes da expedição</h3><button type="button" class="exp-icon-button" data-close aria-label="Fechar detalhes" title="Fechar detalhes"><span data-exp-icon="close"></span></button></header><div class="exp-drawer-body"><p data-detail-status role="status">Carregando transferência...</p></div>';
    decorateExpedition(detail);
    try{
      const result=await context.client().from("wms_transfers").select(FIELDS+",invoice_snapshot").eq("id",row.id).eq("warehouse_code",w).single();
      if(result.error)throw result.error;
      if(ticket!==detailGeneration||w!==warehouse()||user!==context.user()?.id||!detail.open)return;
      const same=selected?.id===row.id;selected=result.data;actionKey=null;eventPage=0;eventRows=[];historyLoading=false;
      if(!same)detailTab="summary";
      const actions=expeditionActions(selected,context.user());
      const primary=["COLLECT","TRANSIT","DELIVER","RESOLVE","ASSIGN"].find(action=>actions.some(([value])=>value===action));
      const difference=expeditionBoxDifference(selected);
      const itemRows=Array.isArray(selected.invoice_snapshot)?selected.invoice_snapshot:[];
      const info=[["Origem → Destino",`${selected.origem_codigo_loja||selected.warehouse_code} → ${selected.destino_codigo_loja||selected.destino_nome||"—"}`],["NFe",selected.invoice_number||"—"],["Responsável",selected.expedition_responsible_name||"Não atribuída"],["Etapa",EXPEDITION_LABELS[selected.expedition_stage]||selected.expedition_stage],["Prazo",date(selected.delivery_deadline)],["Data da coleta",date(selected.collected_at)]];
      detail.innerHTML=`<header class="exp-drawer-heading"><div><span class="exp-drawer-eyebrow">Detalhes da expedição</span><h3 id="expDrawerTitle">${e(selected.codigo_transferencia||selected.id)}</h3>${expeditionBadge(selected)}<p>NF liberada em ${e(date(selected.invoice_released_at))}</p></div><button type="button" class="exp-icon-button" data-close aria-label="Fechar detalhes" title="Fechar detalhes"><span data-exp-icon="close"></span></button></header>
        <nav class="exp-drawer-tabs" role="tablist" aria-label="Detalhes da expedição">${[["summary","Resumo"],["items","Itens"],["history","Histórico"],["documents","Documentos"]].map(([key,label])=>`<button type="button" id="exp-tab-${key}" role="tab" aria-controls="exp-panel-${key}" data-detail-tab="${key}">${label}${key==="items"&&itemRows.length?` (${itemRows.length})`:""}</button>`).join("")}</nav>
        <div class="exp-drawer-body"><p data-detail-status role="status" class="inline-status"></p>
        <section id="exp-panel-summary" role="tabpanel" aria-labelledby="exp-tab-summary" data-detail-panel="summary"><section class="exp-detail-section"><h4><span data-exp-icon="transfer"></span>Informações gerais</h4><dl class="exp-summary">${info.map(([label,value])=>`<div><dt>${e(label)}</dt><dd>${e(value)}</dd></div>`).join("")}</dl>${slaHtml(selected,attention)}</section>
        <section class="exp-detail-section"><h4><span data-exp-icon="boxes"></span>Caixas da expedição</h4><dl class="exp-box-counts">${[["Prontas",boxes(selected)],["Enviadas",selected.dispatched_boxes],["Recebidas",selected.received_boxes],["Diferença",difference]].map(([label,value])=>`<div><dt>${label}</dt><dd${label==="Diferença"&&difference!==null&&difference!==0?' class="exp-difference"':""}>${label==="Diferença"?(value===null?"—":e(String(value))):boxLabel(value)}</dd></div>`).join("")}</dl>${selected.delivery_reason?`<p class="exp-reason">${e(selected.delivery_reason)}</p>`:""}</section>
        <form class="exp-action-form" data-action-form hidden><h4 data-action-title></h4><label data-responsible-label>Responsável<select name="responsible"></select></label><label data-boxes-label>Quantidade de caixas<input name="boxes" type="number" min="0" step="1"></label><label data-reason-label>Justificativa<textarea name="reason" maxlength="4000"></textarea></label><div class="button-row"><button class="primary-button" type="submit">Confirmar</button><button class="secondary-button" type="button" data-cancel>Cancelar</button></div></form>
        <section class="exp-detail-section"><h4><span data-exp-icon="history"></span>Andamento</h4><div data-timeline></div></section></section>
        <section id="exp-panel-items" role="tabpanel" aria-labelledby="exp-tab-items" data-detail-panel="items" hidden><h4>Itens conferidos</h4>${itemRows.length?`<div class="exp-items-list">${itemRows.map(item=>`<article><span class="exp-item-icon" data-exp-icon="boxes"></span><div><strong>${e(item.sku||"—")}</strong><p>${e(item.description||"Descrição não disponível")}</p></div><span><small>Conferido</small><b>${item.checked==null?"—":e(String(item.checked))}</b></span></article>`).join("")}</div>`:'<p class="exp-empty-panel">Nenhum item disponível no registro fiscal desta transferência.</p>'}</section>
        <section id="exp-panel-history" role="tabpanel" aria-labelledby="exp-tab-history" data-detail-panel="history" hidden><details data-history open><summary>Histórico da transferência</summary><div data-events>Carregando histórico...</div><button type="button" class="secondary-button" data-more-history>Carregar mais</button></details></section>
        <section id="exp-panel-documents" role="tabpanel" aria-labelledby="exp-tab-documents" data-detail-panel="documents" hidden><section class="exp-detail-section"><h4><span data-exp-icon="document"></span>Nota fiscal</h4><dl class="exp-summary"><div><dt>Número da NF</dt><dd>${e(selected.invoice_number||"—")}</dd></div><div><dt>Documento</dt><dd>${selected.invoice_file_path?"PDF da nota fiscal":"Documento não disponível"}</dd></div></dl><button type="button" class="secondary-button" data-pdf ${selected.invoice_file_path?"":"disabled"}><span data-exp-icon="document"></span>Abrir NF</button></section></section>
        </div><footer class="exp-drawer-footer"><div class="exp-primary-actions">${actions.map(([action,label])=>`<button type="button" class="${action===primary?"primary-button":"secondary-button"}" data-action="${action}">${label}</button>`).join("")}</div><div class="exp-secondary-actions"><button type="button" class="secondary-button" data-transfer><span data-exp-icon="transfer"></span>Ver transferência</button><button type="button" class="secondary-button" data-show-history><span data-exp-icon="history"></span>Ver histórico</button></div></footer>`;
      setDetailTab(detailTab);renderTimeline();renderRows();decorateExpedition(detail);detail.querySelector("[data-close]").focus({preventScroll:true});
      detail.querySelector("[data-action-form]").addEventListener("submit",submit);
      await history();
    }catch(error){if(ticket===detailGeneration)status(error.message,"error");}
  }
  async function prepare(action) {
    if(busy||!selected)return;
    if(!expeditionActions(selected,context.user()).some(([value])=>value===action))return;
    setDetailTab("summary");
    const form=find("[data-action-form]"),entity=selected.id,w=warehouse();
    form.reset();form.dataset.action=action;
    find("[data-action-title]").textContent=expeditionActions(selected,context.user()).find(([a])=>a===action)?.[1]||action;
    find("[data-responsible-label]").hidden=action!=="ASSIGN";
    find("[data-boxes-label]").hidden=!["COLLECT","DELIVER"].includes(action);
    find("[data-reason-label]").hidden=action==="TRANSIT";
    form.elements.boxes.value=(action==="COLLECT"?boxes(selected):selected.dispatched_boxes)??"";
    form.elements.boxes.required=["COLLECT","DELIVER"].includes(action);
    form.elements.reason.required=action==="RESOLVE"||(action==="ASSIGN"&&selected.expedition_stage==="ATRIBUIDA");
    if(action==="ASSIGN"){
      const result=await context.client().from("wms_users").select("id,name,role,default_warehouse_code,warehouse_code").eq("active",true).eq("archived",false).order("name");
      if(result.error)throw result.error;
      if(selected?.id!==entity||warehouse()!==w)return;
      const users=(result.data||[]).filter(u=>context.user().role!=="OPERADOR"||u.id===context.user().id);
      form.elements.responsible.innerHTML=users.map(u=>`<option value="${e(u.id)}">${e(u.name)} (${e(u.role)})</option>`).join("");
      if(!users.length)throw new Error("Nenhum responsavel ativo encontrado.");
    }
    form.hidden=false;actionKey=null;form.scrollIntoView({block:"nearest"});form.querySelector("label:not([hidden]) :is(input,select,textarea)")?.focus({preventScroll:true});
  }
  async function submit(event){
    event.preventDefault();if(busy||!selected)return;
    const form=event.target,action=form.dataset.action,data={reason:form.elements.reason.value.trim()};
    if(action==="ASSIGN")data.responsible_id=form.elements.responsible.value;
    if(["COLLECT","DELIVER"].includes(action)){
      if(form.elements.boxes.value==="")return status("Informe uma quantidade inteira de caixas.","error");
      data.boxes=Number(form.elements.boxes.value);
      if(!Number.isSafeInteger(data.boxes)||data.boxes<0)return status("Informe uma quantidade inteira de caixas.");
      if(action==="DELIVER"&&data.boxes!==selected.dispatched_boxes&&!data.reason)return status("Justifique a diferenca de caixas recebidas.");
    }
    const fingerprint=JSON.stringify({id:selected.id,revision:selected.expedition_revision,action,data});
    if(actionKey?.fingerprint!==fingerprint)actionKey={fingerprint,id:randomId("expedition")};
    const w=warehouse(),row=selected;busy=true;root.inert=true;form.querySelector("button").disabled=true;
    try{
      const result=await context.client().rpc("wms_expedition_action",{p_id:row.id,p_expected_revision:row.expedition_revision,p_action:action,p_data:data,p_action_id:actionKey.id});
      if(result.error)throw result.error;
      context.changed();
      if(w===warehouse()){await open(row);await refresh();}
      status("Etapa registrada.","success");
    }catch(error){context.diagnostic("expedition-action",error);status(error.message);}
    finally{busy=false;root.inert=false;form.querySelector("button").disabled=false;}
  }
  root.addEventListener("click",async event=>{
    try{
      if(event.target.closest("[data-close]")&&!busy){detail.close();return;}
      const tab=event.target.closest("[data-detail-tab]");if(tab&&!busy){setDetailTab(tab.dataset.detailTab);return;}
      if(event.target.closest("[data-show-history]")&&!busy){setDetailTab("history");detail.querySelector('[data-detail-tab="history"]').focus();return;}
      if(event.target.closest("[data-more-history]")&&!busy){await history();return;}
      if(event.target.closest("[data-cancel]")&&!busy){find("[data-action-form]").hidden=true;return;}
      if(event.target.closest("[data-transfer]")&&!busy&&selected){const id=selected.id;detail.close();await context.openTransfer(id);return;}
      if(event.target.closest("[data-pdf]")&&!busy&&selected?.invoice_file_path){
        const entity=selected.id,w=warehouse();
        const result=await context.client().storage.from("wms-transfer-invoices").createSignedUrl(selected.invoice_file_path,300);
        if(result.error)throw result.error;
        if(selected?.id!==entity||warehouse()!==w||!detail.open)return;
        const link=document.createElement("a");link.href=result.data.signedUrl;link.target="_blank";link.rel="noopener noreferrer";link.click();return;
      }
      const opener=event.target.closest("[data-open]");if(opener&&!busy)await open(rows[Number(opener.dataset.open)]);
      const action=event.target.closest("button[data-action]");if(action)await prepare(action.dataset.action);
    }catch(error){status(error.message);}
  });
  function reset(){if(busy)return;page=0;selected=null;actionKey=null;detailGeneration++;detail.close();refresh();}
  find("[data-unit]").addEventListener("change",reset);find("[data-queue]").addEventListener("change",reset);
  find("[data-refresh]").addEventListener("click",refresh);
  let searchTimer;
  find("[data-search]").addEventListener("input",()=>{window.clearTimeout(searchTimer);searchTimer=window.setTimeout(reset,250);});
  find("[data-prev]").addEventListener("click",()=>{page=Math.max(0,page-1);refresh();});
  find("[data-next]").addEventListener("click",()=>{page++;refresh();});
  decorateExpedition(root);
  return {refresh};
}

export function createTransferExecutive(root,context,warehouse,allowConfig=true) {
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Cuiaba",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const options='<option value="">Todas</option>'+context.warehouses().map(w=>`<option value="${e(w.code)}">${e(w.code)} - ${e(w.name)}</option>`).join("");
  root.innerHTML=`<h3>Indicadores de transferencias</h3><form data-filter class="button-row"><label>Criadas desde<input name="from" type="date" value="${today.slice(0,7)}-01" required></label><label>Ate<input name="until" type="date" value="${today}" required></label><label>Origem<select name="origin">${options}</select></label><label>Destino<select name="destination">${options}</select></label><label>Operacao<select name="operation"><option value="">Todas</option><option value="COMPRAS">Compras</option><option value="ESTOQUE">Estoque</option><option value="LEGADO">Legado</option></select></label><label>Etapa<select name="stage"><option value="">Todas</option>${[...new Set([...Object.keys(EXPEDITION_LABELS).filter(Boolean),"PENDENTE","ATRIBUIDA","EM_SEPARACAO","PRONTA_PARA_NOTA","NF_EM_PREPARACAO","NF_ANEXADA","LIBERADA_PARA_ENVIO","CORRECAO_SOLICITADA","FINALIZADA"])].map(v=>`<option value="${v}">${e(EXPEDITION_LABELS[v]||v.replaceAll("_"," "))}</option>`).join("")}</select></label><button class="secondary-button" type="submit">Filtrar</button></form><p data-error role="status"></p><div data-summary></div>
    ${allowConfig&&["ADMINISTRADOR","SUPERVISOR"].includes(context.user().role)?'<details><summary>Prazo de entrega por unidade</summary><form data-sla class="button-row"><label>Horas apos liberacao da NF<input type="number" name="hours" min="1" max="8760" step="1" value="24" required></label><label>Atencao a partir de (%)<input type="number" name="attention" min="1" max="99" step="1" value="80" required></label><button class="secondary-button" type="submit">Salvar prazo</button></form></details>':""}`;
  const find=s=>root.querySelector(s);let generation=0,loadedUnit=null;
  async function refresh(){
    const ticket=++generation,w=warehouse(),actor=context.user()?.id,form=find("[data-filter]");
    try{
      const result=await context.client().rpc("wms_transfer_executive_summary",{p_from:form.elements.from.value,p_until:form.elements.until.value,p_warehouse:w,p_origin:form.elements.origin.value||null,p_destination:form.elements.destination.value||null,p_operation:form.elements.operation.value||null,p_stage:form.elements.stage.value||null});
      if(result.error)throw result.error;
      if(ticket!==generation||w!==warehouse()||actor!==context.user()?.id)return;
      const d=result.data||{},metrics=[["Criadas",d.created],["Abertas",d.open],["Concluidas",d.completed],["Aguardando NF",d.awaiting_invoice],["Aguardando expedicao",d.awaiting_expedition],["Em transito",d.in_transit],["Entregues",d.delivered],["Divergencias de entrega",d.delivery_divergences],["Atrasadas",d.late],["OTD",d.otd_percent==null?"Sem entregas com prazo":`${d.otd_percent}%`],["Caixas enviadas",d.dispatched_boxes],["Caixas recebidas",d.received_boxes]];
      const table=(title,headers,rows)=>`<h4>${title}</h4><div class="table-wrapper"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr>${r.map(v=>`<td>${e(String(v??"-"))}</td>`).join("")}</tr>`).join(""):`<tr><td colspan="${headers.length}">Sem dados no periodo.</td></tr>`}</tbody></table></div>`;
      find("[data-summary]").innerHTML=`<div class="stock-summary-grid">${metrics.map(([label,v])=>`<article class="stock-summary-card"><span>${label}</span><strong>${e(String(v??0))}</strong></article>`).join("")}</div><p>OTD: ${Number(d.otd_eligible||0)} entregas com prazo registrado. Sem prazo: ${Number(d.otd_unknown||0)}.</p>
        ${table("Duracao media",["Fase","Horas"],[["Separacao",d.avg_stock_hours],["NF",d.avg_invoice_hours],["Expedicao",d.avg_expedition_hours],["Entrega",d.avg_delivery_hours],["Criacao ate conclusao",d.avg_lead_hours]])}
        ${table("Volume diario",["Data","Transferencias","SKUs","Unidades","Caixas"],(d.daily||[]).map(v=>[v.day,v.transfers,v.skus,v.units,v.boxes]))}
        ${table("Distribuicao por etapa",["Etapa","Transferencias"],(d.statuses||[]).map(v=>[EXPEDITION_LABELS[v.stage]||v.stage,v.total]))}
        ${table("Top 5 origens",["Unidade","Transferencias"],(d.top_origins||[]).map(v=>[v.code,v.total]))}
        ${table("Top 5 destinos",["Unidade","Transferencias"],(d.top_destinations||[]).map(v=>[v.code,v.total]))}`;
      find("[data-error]").textContent="";
      if(loadedUnit!==w&&find("[data-sla]")){
        const cfg=await context.client().from("wms_transfer_sla").select("delivery_hours,attention_percent").eq("warehouse_code",w).maybeSingle();
        if(cfg.error)throw cfg.error;
        if(w===warehouse()&&ticket===generation){find("[data-sla]").elements.hours.value=cfg.data?.delivery_hours??24;find("[data-sla]").elements.attention.value=cfg.data?.attention_percent??80;loadedUnit=w;}
      }
    }catch(error){if(ticket===generation){find("[data-error]").textContent=error.message;find("[data-summary]").innerHTML="";}}
  }
  find("[data-filter]").addEventListener("submit",event=>{event.preventDefault();refresh();});
  find("[data-sla]")?.addEventListener("submit",async event=>{
    event.preventDefault();const f=event.target,w=warehouse(),button=f.querySelector("button");button.disabled=true;
    try{
      const result=await context.client().from("wms_transfer_sla").upsert({warehouse_code:w,delivery_hours:Number(f.elements.hours.value),attention_percent:Number(f.elements.attention.value),updated_at:new Date().toISOString()},{onConflict:"warehouse_code"});
      if(result.error)throw result.error;
      find("[data-error]").textContent="Prazo salvo para as proximas atribuicoes. Prazos ja registrados foram preservados.";
    }catch(error){find("[data-error]").textContent=error.message;}finally{button.disabled=false;}
  });
  return {refresh};
}

