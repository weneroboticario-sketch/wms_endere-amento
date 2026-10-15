import { escapeHtml as e, randomId } from "./utils.js";
import { decorateWorkflow } from "./cpalamo-appearance.js";

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
const boxes=row=>Number(row.final_box_count||row.total_boxes||row.total_caixas||0);

export function createExpeditionWorkflow(context) {
  const root=document.getElementById("expeditionContent");
  const unitOptions=context.warehouses().map(w=>`<option value="${e(w.code)}">${e(w.code)} - ${e(w.name)}</option>`).join("");
  root.innerHTML=`<div class="button-row"><label>Unidade<select data-unit>${unitOptions}</select></label><label>Fila<select data-queue><option value="">Aguardando expedicao</option>${Object.entries(EXPEDITION_LABELS).filter(([k])=>k).map(([k,v])=>`<option value="${k}">${v}</option>`).join("")}<option value="all">Todas</option></select></label><button class="secondary-button" data-refresh>Atualizar</button></div>
    <p data-status role="status" class="inline-status"></p>
    <div class="table-wrapper"><table><thead><tr><th>Transferencia</th><th>Origem / Destino</th><th>NFe</th><th>Caixas</th><th>Responsavel</th><th>Etapa</th><th>Prazo</th><th>Acao</th></tr></thead><tbody data-rows></tbody></table></div>
    <div class="button-row"><button class="secondary-button" data-prev>Anterior</button><span data-page></span><button class="secondary-button" data-next>Proxima</button></div>
    <section data-detail hidden></section><section data-executive></section>`;
  const find=s=>root.querySelector(s),status=msg=>{find("[data-status]").textContent=msg;};
  root.insertAdjacentHTML("afterbegin", `<nav class="fiscal-tabs" aria-label="Filas de expedicao">${[["","Aguardando despacho"],["ATRIBUIDA","Atribuidas"],["EM_TRANSITO","Em transito"],["ENTREGUE","Entregues"],["ENTREGA_COM_DIVERGENCIA","Divergencias"]].map(([value,label])=>`<button type="button" data-expedition-tab="${value}" aria-pressed="${value===""}">${label}</button>`).join("")}</nav>`);
  root.querySelectorAll("[data-expedition-tab]").forEach(button=>button.addEventListener("click",()=>{
    find("[data-queue]").value=button.dataset.expeditionTab;
    find("[data-queue]").dispatchEvent(new window.Event("change",{bubbles:true}));
  }));
  let page=0,rows=[],selected=null,generation=0,busy=false,actionKey=null;
  const warehouse=()=>context.global()?find("[data-unit]").value:context.warehouse();
  find("[data-unit]").value=context.global()?context.warehouses()[0]?.code:context.warehouse();
  find("[data-unit]").disabled=!context.global();
  const executive=createTransferExecutive(find("[data-executive]"),context,warehouse);
  async function refresh() {
    const ticket=++generation,w=warehouse(),role=context.user()?.id;
    try {
      let query=context.client().from("wms_transfers").select(FIELDS).eq("warehouse_code",w).eq("requires_invoice",true).eq("is_deleted",false);
      const queue=find("[data-queue]").value;
      if(queue!=="all")query=query.eq("expedition_stage",queue);
      if(queue==="")query=query.eq("invoice_stage","LIBERADA_PARA_ENVIO");
      else query=query.in("invoice_stage",["LIBERADA_PARA_ENVIO","DESPACHADA","RECEBIDA","FINALIZADA"]);
      const cfg=await context.client().from("wms_transfer_sla").select("attention_percent").eq("warehouse_code",w).maybeSingle();
      if(cfg.error)throw cfg.error;
      const attention=cfg.data?.attention_percent??80;
      const result=await query.order("invoice_released_at").order("id").range(page*30,page*30+29);
      if(result.error)throw result.error;
      if(ticket!==generation||w!==warehouse()||role!==context.user()?.id)return;
      rows=result.data||[];
      find("[data-rows]").innerHTML=rows.length?rows.map((r,i)=>`<tr><td>${e(r.codigo_transferencia||r.id)}</td><td>${e(r.origem_codigo_loja||r.warehouse_code)} / ${e(r.destino_codigo_loja||r.destino_nome)}</td><td>${e(r.invoice_number||"-")}</td><td>${boxes(r)} prontas<br>${r.dispatched_boxes??"-"} enviadas / ${r.received_boxes??"-"} recebidas</td><td>${e(r.expedition_responsible_name||"Nao atribuida")}</td><td>${e(EXPEDITION_LABELS[r.expedition_stage]||r.expedition_stage)}</td><td>${e(deliverySla(r,Date.now(),attention))}<br>${e(date(r.delivery_deadline))}</td><td><button class="secondary-button" data-open="${i}">Abrir</button></td></tr>`).join(""):'<tr><td colspan="8">Nenhuma transferencia nesta fila.</td></tr>';
      find("[data-page]").textContent=`Pagina ${page+1}`;
      find("[data-prev]").disabled=page===0;find("[data-next]").disabled=rows.length<30;
      root.querySelectorAll("[data-expedition-tab]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.expeditionTab===queue)));
      decorateWorkflow(root);
    }catch(error){status(error.message);}
    await executive.refresh();
  }
  async function open(row) {
    const ticket=generation,w=warehouse(),user=context.user()?.id;
    const result=await context.client().from("wms_transfers").select(FIELDS+",invoice_snapshot").eq("id",row.id).eq("warehouse_code",w).single();
    if(result.error)throw result.error;
    if(ticket!==generation||w!==warehouse()||user!==context.user()?.id)return;
    selected=result.data;actionKey=null;
    const detail=find("[data-detail]");detail.hidden=false;
    detail.innerHTML=`<h3>${e(selected.codigo_transferencia||selected.id)}</h3><p>${e(EXPEDITION_LABELS[selected.expedition_stage])} | NFe ${e(selected.invoice_number)} | ${boxes(selected)} caixas conferidas</p>
      <p>Coleta: ${e(date(selected.collected_at))} | Transito: ${e(date(selected.transit_at))} | Entrega: ${e(date(selected.delivered_at))}</p>
      ${selected.delivery_resolved_at?`<p>Resolucao da entrega: ${e(date(selected.delivery_resolved_at))}</p>`:""}
      <p>Enviadas: ${selected.dispatched_boxes??"-"} | Recebidas: ${selected.received_boxes??"-"} | Diferenca: ${selected.received_boxes===null?"-":selected.received_boxes-selected.dispatched_boxes}</p>
      <p>${e(selected.delivery_reason)}</p><div class="button-row">${expeditionActions(selected,context.user()).map(([a,label])=>`<button class="secondary-button" data-action="${a}">${label}</button>`).join("")}<button class="secondary-button" data-pdf>Abrir NF</button><button class="secondary-button" data-transfer>Ver transferencia</button></div>
      <form data-action-form hidden><h4 data-action-title></h4><label data-responsible-label>Responsavel<select name="responsible"></select></label><label data-boxes-label>Quantidade de caixas<input name="boxes" type="number" min="0" step="1"></label><label data-reason-label>Justificativa<textarea name="reason" maxlength="4000"></textarea></label><div class="button-row"><button class="primary-button" type="submit">Confirmar</button><button class="secondary-button" type="button" data-cancel>Cancelar</button></div></form>
      <details data-history><summary>Historico da transferencia</summary><div data-events></div><button class="secondary-button" data-more-history>Carregar mais</button></details>`;
    let eventPage=0;
    async function history(){
      const entity=selected.id;
      const result=await context.client().from("wms_transfer_events").select("created_at,user_name,event_type,details,payload").eq("transfer_id",entity).eq("warehouse_code",w).order("created_at",{ascending:false}).order("id").range(eventPage*30,eventPage*30+29);
      if(result.error)return status(result.error.message);
      if(selected?.id!==entity||warehouse()!==w)return;
      detail.querySelector("[data-events]").insertAdjacentHTML("beforeend",(result.data||[]).map(v=>`<p>${e(date(v.created_at))} | ${e(v.user_name)} | ${e(v.event_type)}<br>${e(v.details||"")} ${v.payload?.received_boxes!=null?`| Caixas: ${Number(v.payload.dispatched_boxes)} / ${Number(v.payload.received_boxes)}`:""}</p>`).join(""));
      detail.querySelector("[data-more-history]").disabled=result.data.length<30;eventPage++;
    }
    detail.querySelector("[data-history]").addEventListener("toggle",()=>{if(!eventPage&&detail.querySelector("[data-history]").open)history();});
    detail.querySelector("[data-more-history]").addEventListener("click",history);
    detail.querySelector("[data-transfer]").addEventListener("click",()=>context.openTransfer(selected.id));
    detail.querySelector("[data-pdf]").addEventListener("click",async()=>{
      const result=await context.client().storage.from("wms-transfer-invoices").createSignedUrl(selected.invoice_file_path,300);
      if(result.error)return status(result.error.message);
      const a=document.createElement("a");a.href=result.data.signedUrl;a.target="_blank";a.rel="noopener noreferrer";a.click();
    });
    detail.querySelector("[data-action-form]").addEventListener("submit",submit);
    detail.querySelector("[data-cancel]").addEventListener("click",()=>{detail.querySelector("[data-action-form]").hidden=true;});
  }
  async function prepare(action) {
    if(busy||!selected)return;
    const form=find("[data-action-form]"),entity=selected.id,w=warehouse();
    form.reset();form.dataset.action=action;
    find("[data-action-title]").textContent=expeditionActions(selected,context.user()).find(([a])=>a===action)?.[1]||action;
    find("[data-responsible-label]").hidden=action!=="ASSIGN";
    find("[data-boxes-label]").hidden=!["COLLECT","DELIVER"].includes(action);
    find("[data-reason-label]").hidden=action==="TRANSIT";
    form.elements.boxes.value=action==="COLLECT"?boxes(selected):selected.dispatched_boxes??0;
    form.elements.boxes.required=["COLLECT","DELIVER"].includes(action);
    form.elements.reason.required=action==="RESOLVE"||(action==="ASSIGN"&&selected.expedition_stage==="ATRIBUIDA");
    if(action==="ASSIGN"){
      const result=await context.client().from("wms_users").select("id,name,role,default_warehouse_code,warehouse_code").eq("active",true).eq("available_for_tasks",true).eq("archived",false).in("role",["OPERADOR","SUPERVISOR","ADMINISTRADOR"]);
      if(result.error)throw result.error;
      if(selected?.id!==entity||warehouse()!==w)return;
      const users=(result.data||[]).filter(u=>(u.default_warehouse_code||u.warehouse_code)===w&&(context.user().role!=="OPERADOR"||u.id===context.user().id));
      form.elements.responsible.innerHTML=users.map(u=>`<option value="${e(u.id)}">${e(u.name)} (${e(u.role)})</option>`).join("");
      if(!users.length)throw new Error("Nenhum responsavel ativo e disponivel nesta unidade.");
    }
    form.hidden=false;actionKey=null;form.scrollIntoView({block:"nearest"});
  }
  async function submit(event){
    event.preventDefault();if(busy||!selected)return;
    const form=event.target,action=form.dataset.action,data={reason:form.elements.reason.value.trim()};
    if(action==="ASSIGN")data.responsible_id=form.elements.responsible.value;
    if(["COLLECT","DELIVER"].includes(action)){
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
      context.changed();status("Etapa registrada.");
      if(w===warehouse()){await open(row);await refresh();}
    }catch(error){context.diagnostic("expedition-action",error);status(error.message);}
    finally{busy=false;root.inert=false;form.querySelector("button").disabled=false;}
  }
  root.addEventListener("click",async event=>{
    try{
      const opener=event.target.closest("[data-open]");if(opener&&!busy)await open(rows[Number(opener.dataset.open)]);
      const action=event.target.closest("button[data-action]");if(action)await prepare(action.dataset.action);
    }catch(error){status(error.message);}
  });
  function reset(){page=0;selected=null;actionKey=null;find("[data-detail]").hidden=true;refresh();}
  find("[data-unit]").addEventListener("change",reset);find("[data-queue]").addEventListener("change",reset);
  find("[data-refresh]").addEventListener("click",refresh);
  find("[data-prev]").addEventListener("click",()=>{page=Math.max(0,page-1);refresh();});
  find("[data-next]").addEventListener("click",()=>{page++;refresh();});
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
