import { escapeHtml as e } from "./utils.js";
import { decorateWorkflow, workflowErrorMessage, requestVisualFields } from "./cpalamo-appearance.js";
import "./management-workspace.css";

export const CONSULTATIONS={transfers:["Transferências","transfer.read"],replenishment:["Pedidos de Reposição","replenishment.read"],
 invoices:["Compras / NF — Transferências","invoice.read"],invoiceReplenishment:["Compras / NF — Reposições","invoice.read"],dispatch:["Gestão de Expedição","dispatch.read"],deliveries:["Entregas","dispatch.read"],
 reverse:["Logística Reversa","reverse.read"],stock:["Consulta SKU / Base de Estoque","manager.dashboard.read"],
 users:["Consulta de Usuários","manager.dashboard.read"],warehouses:["Consulta de Estoques","manager.dashboard.read"]};
const money=v=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const date=v=>v?new Date(v).toLocaleString("pt-BR"):"—";
const table=(heads,rows)=>`<div class="table-wrapper"><table><thead><tr>${heads.map(h=>`<th>${e(h)}</th>`).join("")}</tr></thead><tbody>${rows.join("")||`<tr><td colspan="${heads.length}">Nenhum registro nas unidades autorizadas.</td></tr>`}</tbody></table></div>`;
export function recordSummary(row,module) {
 return {code:row.codigo_transferencia||row.codigo_material||row.gdv_number||row.username||row.code||row.id,
  name:row.nome_material||row.name||row.nome_transferencia||row.unit_origin_name||row.destino_nome||"—",
  unit:row.warehouse_code||row.default_warehouse_code||row.code,
  status:(["invoices","invoiceReplenishment"].includes(module)?row.invoice_stage:["dispatch","deliveries"].includes(module)?row.expedition_stage:null)||row.status||(row.active===false?"Inativo":"Ativo"),
  owner:row.responsavel_nome||row.responsible_name||row.created_by_name||"—",module};
}
export function createManagementWorkspace(context,screenId) {
 const root=document.getElementById(screenId+"Content"),central=screenId==="managerCentral";
 let module="",rows=[],offset=0,total=0,busy=false,actor=null;
 const $=s=>root.querySelector(s),has=cap=>context.capabilities().includes(cap);
 root.classList.add("management-workspace");
 root.innerHTML=`<p role="alert" class="loss-error" data-error></p><p role="status" data-notice></p>
  <div data-overview></div><form class="management-toolbar" data-search-form>
   <label>Módulo<select data-module></select></label><label>Buscar<input type="search" maxlength="100" data-search placeholder="Código, unidade ou responsável"></label>
   <button type="submit" class="secondary-button">Atualizar</button><button type="button" class="secondary-button" data-export>Exportar página</button></form>
  <div data-records></div><div class="button-row"><button type="button" class="secondary-button" data-prev>Anterior</button><span data-page></span><button type="button" class="secondary-button" data-next>Próxima</button></div>
  <details data-grants hidden><summary>Permissões adicionais dos perfis</summary><form class="management-toolbar" data-grant-form>
   <label>Usuário<select name="user" required></select></label><label>Permissão<select name="capability" required></select></label>
   <label>Autorização<select name="enabled"><option value="true">Habilitar</option><option value="false">Bloquear</option></select></label>
   <label>Justificativa<input name="reason" required minlength="5" maxlength="1000"></label><button type="submit" class="primary-button">Salvar autorização</button></form></details>
  <dialog class="management-drawer" aria-label="Detalhes do processo" data-detail><header><h3 data-title></h3><button type="button" class="secondary-button" data-close>Fechar</button></header><div data-body></div></dialog>`;
 async function rpc(name,args) {const r=await context.client().rpc(name,args);if(r.error)throw r.error;return r.data;}
 async function run(work) {if(busy)return;busy=true;root.setAttribute("aria-busy","true");$("[data-error]").textContent="";try{await work();}catch(error){$("[data-error]").textContent=workflowErrorMessage(error);}finally{busy=false;root.removeAttribute("aria-busy");}}
 async function overview() {
  if(!central){$("[data-overview]").innerHTML="";return;}
  const data=await rpc("wms_manager_overview");if(!data.authorized)throw new Error("Central Gerencial não autorizada.");
  const k=data.kpis;
  const group=(title,metrics)=>`<section class="management-band"><h3>${title}</h3><div class="management-metrics">${metrics.map(([label,value])=>`<article><span>${label}</span><strong>${value}</strong></article>`).join("")}</div></section>`;
  $("[data-overview]").innerHTML=group("Operação",[["Transferências abertas",k.transfers],["Reposições pendentes",k.replenishment],["Aguardando NF",k.invoices],["Expedições pendentes",k.dispatch]])+
   group("Pendências e decisões",[["Perdas aguardando aprovação",k.losses],["Divergências abertas",k.divergences],["Transferências atrasadas",k.late],["Pedidos acima do SLA",k.sla]])+
   `<section class="management-band"><h3>Fila priorizada <small>${data.total} pendências</small></h3>${table(["Código","Módulo","Unidade","Responsável","Status","Tempo na etapa","Prioridade","Ação"],data.queue.map((r,i)=>{
    const age=r.since?Math.max(0,Math.floor((Date.now()-Date.parse(r.since))/60000)):null;
    return `<tr><td>${e(r.code)}</td><td>${e(r.module==="losses"?"Perdas e DRE":CONSULTATIONS[r.module]?.[0]||r.module)}</td><td>${e(r.warehouse)}</td><td>${e(r.owner||"—")}</td><td>${e(r.status)}</td><td>${age==null?"Sem registro":`${Math.floor(age/60)}h ${age%60}min`}</td><td>${r.priority}</td><td><button type="button" class="secondary-button" data-queue="${i}">Abrir</button></td></tr>`;
   }))}</section>`;
  $("[data-overview]").querySelectorAll("[data-queue]").forEach(button=>button.addEventListener("click",()=>run(async()=>{
   const item=data.queue[Number(button.dataset.queue)];
   if(item.module==="losses"){await context.openLoss(item.id);return;}
   const r=await rpc("wms_profile_records",{p_module:item.module,p_search:item.id,p_offset:0});
   const row=r.rows.find(r=>r.id===item.id);if(!row)throw new Error("Registro indisponível. Atualize a fila.");await openDetail(row,item.module);
  })));
 }
 async function openDetail(row,kind=module) {
  const process=await rpc("wms_profile_record_detail",{p_module:kind,p_id:row.id});row=process.record;
  const summary=recordSummary(row,kind);$("[data-title]").textContent=summary.code;
  const fields={"Unidade":summary.unit,"Nome":summary.name,"Status":summary.status,"Responsável":summary.owner,
   "Criado em":date(row.created_at),"Atualização":date(row.updated_at),"Origem":row.origem_codigo_loja||row.unit_origin_code,
   "Destino":row.destino_codigo_loja||row.destination,"Solicitante":row.solicitado_por_nome||row.criado_por_nome||row.created_by_name,
   "NF":row.invoice_number||row.nfe_number,"Chave NF-e":row.invoice_key,"Valor NF":row.invoice_value==null?null:money(row.invoice_value),
   "Emissão":row.invoice_issue_date,"Competência financeira":row.financial_competence,"Competência operacional":row.competence_month,
   "Etapa fiscal":row.invoice_stage,"Etapa expedição":row.expedition_stage,"Prazo entrega":row.delivery_deadline?date(row.delivery_deadline):null,
   "Caixas":row.final_box_count||row.box_quantity,"GDV":row.gdv_number,"Quantidade solicitada":row.quantidade_solicitada,
   "Quantidade atendida":row.quantidade_atendida,"Conferidos":row.total_packed_quantity,"Disponível":row.total_disponivel,
   "Físico":row.total_fisico,"Alocado":row.total_alocado,"Endereço":row.codigo_endereco,"Origem da base":row.source_type,
   "Perfil":row.role,"Ativo":row.active==null?null:row.active?"Sim":"Não","Observação":row.observacao||row.observation,
   "Resposta do estoque":row.resposta_estoque,"Motivo fiscal":row.fiscal_reason};
  $("[data-body]").innerHTML=`<dl>${Object.entries(fields).filter(([,v])=>v!==null&&v!==undefined&&v!=="").map(([label,value])=>`<dt>${e(label)}</dt><dd>${e(value)}</dd>`).join("")}</dl>
   ${row.invoice_file_path?'<button type="button" class="secondary-button" data-pdf>Visualizar PDF da NF</button>':""}
   ${process.items.length?'<h3>Itens conferidos</h3>'+table(["SKU","Produto","Solicitado","Separado","Conferido"],process.items.map(i=>`<tr><td>${e(i.sku)}</td><td>${e(i.descricao)}</td><td>${Number(i.quantidade_total_unidades??i.quantidade_solicitada??0)}</td><td>${Number(i.quantidade_separada||0)}</td><td>${Number(i.quantidade_lacrada_unidades??i.quantidade_lacrada??0)}</td></tr>`)):""}
   ${process.events.length?'<h3>Histórico</h3><ol class="loss-history">'+process.events.map(ev=>`<li><strong>${e(ev.event_type)}</strong><small>${e(date(ev.created_at))} · ${e(ev.user_name)}</small>${e(ev.details||ev.observation||"")}</li>`).join("")+"</ol>":""}`;
  $("[data-pdf]")?.addEventListener("click",()=>run(async()=>{const result=await context.client().storage.from("wms-transfer-invoices").createSignedUrl(row.invoice_file_path,60);if(result.error)throw result.error;window.open(result.data.signedUrl,"_blank","noopener,noreferrer");}));
  $("[data-detail]").showModal();
 }
 async function loadRecords() {
  const r=await rpc("wms_profile_records",{p_module:module,p_offset:offset,p_search:$("[data-search]").value});rows=r.rows;total=r.total;
  $("[data-records]").innerHTML=table(["Código","Nome / destino","Unidade","Status","Responsável","Ação"],rows.map((row,i)=>{
   const s=recordSummary(row,module);return `<tr><td>${e(s.code)}</td><td>${e(s.name)}</td><td>${e(s.unit)}</td><td>${e(s.status)}</td><td>${e(s.owner)}</td><td><button type="button" class="secondary-button" data-open="${i}">Detalhes</button></td></tr>`;
  }));
  $("[data-records]").querySelectorAll("[data-open]").forEach(b=>b.addEventListener("click",()=>run(()=>openDetail(rows[Number(b.dataset.open)]))));
  $("[data-page]").textContent=`${total?offset+1:0}–${Math.min(offset+rows.length,total)} de ${total}`;
  $("[data-prev]").disabled=offset===0;$("[data-next]").disabled=offset+50>=total;
 }
 async function grants() {
  const admin=context.user().role==="ADMINISTRADOR";$("[data-grants]").hidden=!admin;if(!admin)return;
  const result=await context.client().from("wms_users").select("id,name,role").in("role",["GERENTE","FINANCEIRO"]).order("name");if(result.error)throw result.error;
  const permissions=await rpc("wms_profile_capabilities"),form=$("[data-grant-form]");
  form.elements.user.innerHTML=result.data.map(u=>`<option value="${e(u.id)}">${e(u.name)} · ${e(u.role)}</option>`).join("");
  const update=()=>{const user=result.data.find(u=>u.id===form.elements.user.value);form.elements.capability.innerHTML=(permissions.catalog||[]).filter(c=>c.grant_roles.includes(user?.role)).map(c=>`<option value="${e(c.code)}">${e(c.code)}</option>`).join("");};
  form.elements.user.onchange=update;update();
 }
 async function refresh() {
  if(actor!==context.user().id){actor=context.user().id;offset=0;module="";$("[data-search]").value="";$("[data-detail]").close();$("[data-body]").innerHTML="";}
  const available=Object.entries(CONSULTATIONS).filter(([,v])=>has(v[1]));
  if(!available.some(([key])=>key===module))module=available[0]?.[0];
  $("[data-module]").innerHTML=available.map(([key,[name]])=>`<option value="${key}" ${key===module?"selected":""}>${e(name)}</option>`).join("");
  $("[data-export]").hidden=!has("report.export");
  await overview();if(module)await loadRecords();await grants();decorateWorkflow(root);
 }
 $("[data-search-form]").addEventListener("submit",event=>{event.preventDefault();run(async()=>{offset=0;await refresh();});});
 $("[data-module]").addEventListener("change",()=>run(async()=>{module=$("[data-module]").value;offset=0;await loadRecords();decorateWorkflow(root);}));
 for(const [selector,delta] of [["[data-prev]",-50],["[data-next]",50]])$(selector).addEventListener("click",()=>run(async()=>{offset=Math.max(0,offset+delta);await loadRecords();decorateWorkflow(root);}));
 $("[data-close]").addEventListener("click",()=>$("[data-detail]").close());
 $("[data-export]").addEventListener("click",()=>run(async()=>{
  if(!window.XLSX)throw new Error("Excel indisponível. Atualize a página.");
  const answer=await requestVisualFields("Exportar página do relatório",[{name:"reason",label:"Finalidade"}]);if(!answer)return;
  const batch=await rpc("wms_management_export",{p_module:module,p_offset:offset,p_search:$("[data-search]").value,p_reason:answer.reason});
  const records=batch.rows.map(r=>{const s=recordSummary(r,module);return {"Código":String(s.code),"Nome":s.name,"Unidade":s.unit,"Status":s.status,"Responsável":s.owner};});
  const book=window.XLSX.utils.book_new();window.XLSX.utils.book_append_sheet(book,window.XLSX.utils.json_to_sheet(records),"CONSULTA");window.XLSX.writeFile(book,"WMS-"+module+".xlsx");
 }));
 $("[data-grant-form]").addEventListener("submit",event=>{event.preventDefault();run(async()=>{
  const form=event.target;await rpc("wms_profile_capabilities",{p_target:form.elements.user.value,p_capability:form.elements.capability.value,p_enabled:form.elements.enabled.value==="true",p_reason:form.elements.reason.value});
  $("[data-notice]").textContent="Autorização registrada com histórico de auditoria.";
 });});
 return {refresh:()=>run(refresh)};
}
