import { escapeHtml as e } from "./utils.js";
import { decorateWorkflow, requestVisualFields } from "./cpalamo-appearance.js";
import { LOSS_STATUS, lossCapabilities, cents, allocatePercent, parseInvoiceXml, financialSheets } from "./losses-domain.js";
import "./losses-dre.css";

const money=value=>Number(value||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const date=value=>value?new Date(value).toLocaleString("pt-BR"):"—";
const month=()=>new Date().toLocaleDateString("sv-SE",{timeZone:"America/Cuiaba"}).slice(0,7);
const badge=status=>`<span class="loss-state ${e(status)}">${e(LOSS_STATUS[status]||status)}</span>`;
const options=(rows,key="id",label="name")=>rows.map(row=>`<option value="${e(row[key])}">${e(row[label])}</option>`).join("");
const table=(headers,rows)=>`<div class="table-wrapper"><table><thead><tr>${headers.map(h=>`<th>${e(h)}</th>`).join("")}</tr></thead><tbody>${rows.join("")||`<tr><td colspan="${headers.length}">Nenhum registro.</td></tr>`}</tbody></table></div>`;
export function createLossesDre(context) {
 const root=document.getElementById("lossesDreContent"),client=()=>context.client(),caps=()=>lossCapabilities(context.user()?.role);
 let types=[],rates=[],centers=[],rows=[],page=0,tab="panel",busy=false,draft=null,items=[],allocations=[],files=[],detail=null,preview=null;
 const commands=new Map();
 let actorId=context.user()?.id;
 const $=selector=>root.querySelector(selector);
 const warehouses=()=>context.warehouses().filter(w=>w.code!=="DOURADOS");
 const warehouseOptions=()=>options(warehouses(),"code","name");
 const tabs={panel:"Painel",new:"Nova Perda",pending:"Pendentes",approved:"Aprovadas",history:"Histórico",exports:"Exportação Financeira",config:"Configuração"};
 root.innerHTML=`<nav class="loss-tabs" aria-label="Perdas e DRE">${Object.entries(tabs).map(([id,label])=>`<button type="button" data-tab="${id}" aria-selected="${id===tab}" ${(id==="config"&&!caps().configure)||(id==="exports"&&!caps().export)?"hidden":""}>${label}</button>`).join("")}</nav>
  <p class="loss-error" role="alert" data-error></p><p role="status" data-notice></p>
  <div class="loss-toolbar" data-filters><label>Competência<input type="month" data-month value="${month()}"></label><label>Loja competente<select data-unit><option value="">Todas autorizadas</option>${warehouseOptions()}</select></label>
  <label>Tipo de perda<select data-type><option value="">Todos</option></select></label><label>Busca<input data-search type="search" maxlength="100" placeholder="Perda, NF, motivo ou pessoa"></label><button class="secondary-button" type="button" data-refresh>Buscar</button></div>
  <div data-panel></div><div data-list></div><div class="button-row" data-pages><button type="button" class="secondary-button" data-prev>Anterior</button><span data-page></span><button type="button" class="secondary-button" data-next>Próxima</button></div>
  <div data-form hidden></div><div data-exports hidden></div><div data-config hidden></div>
  <dialog class="loss-dialog" data-detail><header><h3 data-detail-title></h3><button type="button" class="secondary-button" data-close>Fechar</button></header><p class="loss-error" role="alert" data-detail-error></p><div data-detail-body></div></dialog>`;
 const status=message=>{$("[data-notice]").textContent=message;};
 async function rpc(name,args) {const r=await client().rpc(name,args);if(r.error)throw r.error;return r.data;}
 async function command(action,row,payload={}) {
  const signature=JSON.stringify([action,row?.id,row?.version,payload]);
  if(!commands.has(signature))commands.set(signature,crypto.randomUUID());
  const data=await rpc("wms_loss_action",{p_action:action,p_id:row?.id||null,p_payload:payload,p_action_id:commands.get(signature),p_version:row?.version??null});
  commands.delete(signature);return data;
 }
 async function run(work) {
  if(busy)return;busy=true;$("[data-error]").textContent="";$("[data-detail-error]").textContent="";
  root.setAttribute("aria-busy","true");
  try {await work();} catch(error) {
   const target=$("[data-detail]").open?$("[data-detail-error]"):$("[data-error]");
   target.textContent=error.message||"Não foi possível concluir. Tente novamente.";
  }
  finally {busy=false;root.removeAttribute("aria-busy");}
 }
 async function loadConfig() {
  const results=await Promise.all([
   client().from("wms_loss_types").select("*").order("display_order"),
   client().from("wms_loss_rates").select("*").order("competence_from"),
   client().from("wms_loss_cost_centers").select("*").order("name")
  ]);
  for(const result of results)if(result.error)throw result.error;
  [types,rates,centers]=results.map(r=>r.data||[]);
  const type=$("[data-type]").value;$("[data-type]").innerHTML='<option value="">Todos</option>'+options(types);$("[data-type]").value=type;
 }
 const filters=()=>({competence:$("[data-month]").value,warehouse:$("[data-unit]").value,type:$("[data-type]").value});
 async function loadList() {
  const f=filters();
  let q=client().from("wms_losses").select("*").order("created_at",{ascending:false}).range(page*30,page*30+29);
  if(f.competence)q=q.eq("competence",f.competence);if(f.warehouse)q=q.eq("competent_warehouse_code",f.warehouse);if(f.type)q=q.eq("loss_type_id",f.type);
  if(tab==="pending")q=q.in("status",["PENDENTE","CORRECAO_SOLICITADA"]);
  if(tab==="approved")q=q.eq("status","APROVADA");
  const search=$("[data-search]").value.replace(/[,().%_*\\]/g,"").trim();
  if(search)q=q.or(["loss_code","invoice_number","invoice_key","reason","requester_name","responsible_name"].map(c=>`${c}.ilike.%${search}%`).join(","));
  const result=await q;if(result.error)throw result.error;rows=result.data||[];
  $("[data-list]").innerHTML=table(["Código / Competência","Status","NF / Emissão","Valor NF","Tipo / DRE","Loja","Solicitante / Responsável","Ações"],rows.map(r=>{
   const type=types.find(t=>t.id===r.loss_type_id);
   return `<tr><td>${e(r.loss_code)}<br>${e(r.competence||"Sem competência")}</td><td>${badge(r.status)}</td><td>${e(r.invoice_number||"—")}<br>${e(r.invoice_issue_date||"—")}</td><td>${money(r.invoice_value)}</td><td>${e(r.loss_type_name_snapshot||type?.name||"Sem tipo")}<br>${e(r.dre_label_snapshot||type?.dre_label||"—")}</td><td>${e(r.competent_warehouse_code)}</td><td>${e(r.requester_name)}<br>${e(r.responsible_name||"—")}</td><td><button type="button" class="secondary-button" data-open="${e(r.id)}">Abrir</button></td></tr>`;
  }));
  $("[data-prev]").disabled=page===0;$("[data-next]").disabled=rows.length<30;$("[data-page]").textContent="Página "+(page+1);
 }
 async function loadPanel() {
  const result=await rpc("wms_loss_summary",{p_filters:filters()});
  const gross=Number(result.gross),credits=Number(result.credits);
  $("[data-panel]").innerHTML=`<div class="loss-kpis">${[["Perda Bruta",money(gross)],["Ajustes Positivos",money(credits)],["Perda Líquida",money(gross-credits)],["Lançamentos",result.records],["Pendentes",result.pending],["Aprovadas / Exportadas",result.approved]].map(([label,value])=>`<article><span>${label}</span><strong>${value}</strong></article>`).join("")}</div>
   <p>Ticket médio aprovado: ${money(result.approved?(gross-credits)/result.approved:0)} · Correções: ${result.corrections} · Canceladas: ${result.cancelled}</p>
   <div class="loss-comparison">${[["type","Perdas por tipo"],["dre","Perdas por DRE"],["warehouse","Perdas por loja"]].map(([dimension,title])=>{
    const groups=result.groups.filter(g=>g.dimension===dimension).sort((a,b)=>Number(b.value)-Number(a.value));
    const max=Math.max(1,...groups.map(g=>Math.abs(Number(g.value))));
    return `<section class="loss-band"><h3>${title}</h3><ul class="loss-bars">${groups.map(g=>`<li><span>${e(g.label)} (${g.records})</span><strong>${money(g.value)}</strong><progress max="${max}" value="${Math.abs(Number(g.value))}"></progress></li>`).join("")||"<li>Sem perdas aprovadas.</li>"}</ul></section>`;
   }).join("")}<section class="loss-band"><h3>Evolução por competência</h3>${table(["Competência","Perda líquida"],result.trend.map(r=>`<tr><td>${e(r.competence)}</td><td>${money(r.net)}</td></tr>`))}</section></div>`;
 }
 async function refreshData() {
  if(!caps().read)throw new Error("Acesso não autorizado.");
  if(actorId!==context.user()?.id){actorId=context.user()?.id;tab="panel";page=0;draft=null;items=[];allocations=[];files=[];commands.clear();$("[data-detail]").close();$("[data-form]").innerHTML="";}
  root.querySelectorAll("[data-tab]").forEach(b=>{b.hidden=(b.dataset.tab==="config"&&!caps().configure)||(b.dataset.tab==="exports"&&!caps().export);});
  await loadConfig();
  $("[data-filters]").hidden=["new","config"].includes(tab);
  $("[data-panel]").hidden=tab!=="panel";$("[data-form]").hidden=tab!=="new";$("[data-exports]").hidden=tab!=="exports";$("[data-config]").hidden=tab!=="config";
  $("[data-list]").hidden=["new","config","exports"].includes(tab);$("[data-pages]").hidden=$("[data-list]").hidden;
  root.querySelectorAll("[data-tab]").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.tab===tab)));
  if(tab==="panel")await loadPanel();
  if(!["new","config","exports"].includes(tab))await loadList();
  if(tab==="exports")await renderExports();
  if(tab==="config")renderConfig();
  decorateWorkflow(root);
 }
 function field(label,name,type="text",value="",extra="") {return `<label>${label}<input name="${name}" type="${type}" value="${e(value??"")}" ${extra}></label>`;}
 function renderForm(row=null) {
  draft=row;files=[];
  const value=name=>row?.[name]||"";
  $("[data-form]").innerHTML=`<h3>${row?e(row.loss_code):"Nova Perda"}</h3><form data-loss-form>
   <section class="loss-band"><h3>1. Documento fiscal</h3><div class="loss-form-grid">
    <label class="loss-upload">XML da NF-e (opcional)<input data-xml type="file" accept=".xml,application/xml,text/xml"></label>
    <label>PDF / comprovante<input data-pdf type="file" accept=".pdf,application/pdf"></label>
    ${field("Nº NF","invoice_number","text",value("invoice_number"),'maxlength="80"')}
    ${field("Chave NF-e","invoice_key","text",value("invoice_key"),'pattern="[0-9]{44}" maxlength="44"')}
    ${field("Emissão NF","invoice_issue_date","date",value("invoice_issue_date"))}
    ${field("Valor da NF (R$) *","invoice_value","text",row?Number(row.invoice_value).toFixed(2).replace(".",","):"",'inputmode="decimal" required')}
    ${field("CNPJ emitente","issuer_cnpj","text",value("issuer_cnpj"))}
    ${field("Razão social emitente","issuer_name","text",value("issuer_name"))}
   </div></section>
   <section class="loss-band"><h3>2. Dados e classificação</h3><div class="loss-form-grid">
    ${field("Competência *","competence","month",value("competence"),"required")}
    <label>Tipo de perda *<select name="loss_type_id" required><option value="">Selecione</option>${options(types.filter(t=>t.is_active))}</select></label>
    <label>Classificação DRE<input name="dre" readonly></label>
    <label>Natureza<select name="direction"><option value="LOSS">Perda / despesa</option><option value="CREDIT">Ajuste positivo</option></select></label>
    <label>Loja competente *<select name="competent_warehouse_code" required>${warehouseOptions()}</select></label>
    <label>Origem operacional<select name="origin_warehouse_code"><option value="">Não informada</option>${warehouseOptions()}</select></label>
    <label>Centro de custo<select name="cost_center"><option value="">Centro da loja competente</option>${options(centers.filter(c=>c.is_active),"code","name")}</select></label>
    <label>Responsável<input data-user-search type="search" placeholder="Buscar pessoa"><select name="responsible_id"><option value="">Sem responsável</option>${row?.responsible_id?`<option value="${e(row.responsible_id)}">${e(row.responsible_name)}</option>`:""}</select></label>
    <label>Solicitante<input readonly value="${e(row?.requester_name||context.user().name)}"></label>
    <label>Origem do registro<select name="source_type"><option value="MANUAL">Manual</option><option value="TRANSFERENCIA">Transferência</option><option value="LOGISTICA_REVERSA">Logística Reversa</option></select></label>
    <label data-source-field hidden>Referência operacional<input data-source-search type="search" placeholder="Buscar código"><select name="source_entity_id"><option value="">Selecione</option></select></label>
    <label class="full">Motivo detalhado *<textarea name="reason" minlength="15" maxlength="4000" required>${e(value("reason"))}</textarea></label>
    <label class="full">Observação<textarea name="observation" maxlength="4000">${e(value("observation"))}</textarea></label>
   </div></section>
   <section class="loss-band"><h3>3. Itens (opcional)</h3><div class="loss-toolbar"><label>SKU<input data-sku type="search" maxlength="80"></label><button type="button" class="secondary-button" data-sku-search>Consultar SKU</button></div><div data-sku-results></div><div data-items></div></section>
   <section class="loss-band"><h3>4. Rateio</h3><div class="loss-toolbar"><label>Modo<select data-allocation-mode><option value="percent">Percentual</option><option value="amount">Valor</option></select></label><button type="button" class="secondary-button" data-add-allocation>Adicionar centro de custo</button></div><div data-allocations></div></section>
   <section class="loss-band"><h3>5. Revisão</h3><div data-review></div><div class="button-row"><button type="button" class="secondary-button" data-save>Salvar rascunho</button><button type="button" class="primary-button" data-review-button>Revisar lançamento</button><button type="button" class="primary-button" data-submit hidden>Enviar para análise</button></div></section>
  </form>`;
  const form=$("[data-loss-form]"),f=form.elements;
  for(const name of ["loss_type_id","competent_warehouse_code","origin_warehouse_code","cost_center","responsible_id","direction","source_type"])if(row?.[name])f[name].value=row[name];
  if(!row&&warehouses().some(w=>w.code===context.warehouse()))f.competent_warehouse_code.value=context.warehouse();
  const updateDre=()=>{f.dre.value=types.find(t=>t.id===f.loss_type_id.value)?.dre_label||"";};
  updateDre();f.loss_type_id.addEventListener("change",updateDre);
  form.addEventListener("submit",event=>event.preventDefault());
  form.addEventListener("input",invalidateReview);
  form.addEventListener("change",invalidateReview);
  f.invoice_issue_date.addEventListener("change",()=>{
   const suggestion=f.invoice_issue_date.value.slice(0,7);
   if(suggestion&&suggestion!==f.competence.value&&(!f.competence.value||window.confirm("A emissão da NF sugere competência "+suggestion+". Deseja atualizar?")))f.competence.value=suggestion;
  });
  f.source_type.addEventListener("change",()=>{$("[data-source-field]").hidden=f.source_type.value==="MANUAL";f.source_entity_id.innerHTML='<option value="">Selecione</option>';});
  if(row?.source_entity_id){$("[data-source-field]").hidden=false;f.source_entity_id.innerHTML=`<option value="${e(row.source_entity_id)}">${e(row.source_entity_code)}</option>`;}
  let userTimer,sourceTimer;
  $("[data-user-search]").addEventListener("input",()=>{clearTimeout(userTimer);userTimer=setTimeout(()=>run(async()=>{
   const term=$("[data-user-search]").value.trim();if(term.length<2)return;
   const result=await client().from("wms_users").select("id,name").eq("active",true).eq("archived",false).in("role",["ADMINISTRADOR","SUPERVISOR","COMPRAS"]).ilike("name","%"+term.replace(/[%_]/g,"")+"%").limit(15);
   if(result.error)throw result.error;f.responsible_id.innerHTML='<option value="">Sem responsável</option>'+options(result.data||[]);
  }),300);});
  $("[data-source-search]").addEventListener("input",()=>{clearTimeout(sourceTimer);sourceTimer=setTimeout(()=>run(async()=>{
   const transfer=f.source_type.value==="TRANSFERENCIA",column=transfer?"codigo_transferencia":"gdv_number";
   const result=await client().from(transfer?"wms_transfers":"wms_reverse_logistics").select("id,"+column).eq("is_deleted",false).ilike(column,"%"+$("[data-source-search]").value.replace(/[%_]/g,"")+"%").limit(15);
   if(result.error)throw result.error;f.source_entity_id.innerHTML='<option value="">Selecione</option>'+options(result.data||[],"id",column);
  }),300);});
  $("[data-xml]").addEventListener("change",()=>run(async()=>{
   const file=$("[data-xml]").files[0];if(!file)return;
   if(!/\.xml$/i.test(file.name)||file.size>5*1024*1024||!["","application/xml","text/xml"].includes(file.type))throw new Error("Selecione um XML válido de até 5 MB.");
   const invoice=parseInvoiceXml(await file.text());
   for(const [key,value] of Object.entries(invoice))f[key].value=key==="invoice_value"?Number(value).toFixed(2).replace(".",","):value;
   f.invoice_issue_date.dispatchEvent(new window.Event("change"));files=files.filter(x=>x.type!=="XML");files.push({file,type:"XML"});
   invalidateReview();status("Dados preenchidos a partir do XML. Revise antes de enviar.");
  }));
  $("[data-pdf]").addEventListener("change",()=>run(async()=>{
   const file=$("[data-pdf]").files[0];if(!file)return;
   if(!/\.pdf$/i.test(file.name)||file.size>10*1024*1024||!["","application/pdf"].includes(file.type)||!(await file.slice(0,5).text()).startsWith("%PDF-"))throw new Error("Selecione um PDF válido de até 10 MB.");
   files=files.filter(x=>x.type!=="PDF");files.push({file,type:"PDF"});
  }));
  $("[data-sku-search]").addEventListener("click",()=>run(async()=>{
   const sku=$("[data-sku]").value.trim();if(!sku)return;
   const r=await client().from("wms_stock_positions").select("codigo_material,nome_material,codigo_endereco").eq("warehouse_code",f.competent_warehouse_code.value).eq("active",true).eq("codigo_material",sku).limit(10);
   if(r.error)throw r.error;
   $("[data-sku-results]").innerHTML=(r.data||[]).map((item,i)=>`<button class="secondary-button" type="button" data-add-item="${i}">${e(item.codigo_material)} · ${e(item.nome_material)} · ${e(item.codigo_endereco||"Sem endereço")}</button>`).join("")||"<p>SKU não localizado.</p>";
   $("[data-sku-results]").querySelectorAll("[data-add-item]").forEach(b=>b.addEventListener("click",()=>{
    collectItems();const item=r.data[Number(b.dataset.addItem)];items.push({sku:item.codigo_material,description_snapshot:item.nome_material,location_snapshot:item.codigo_endereco||"",quantity:1,unit_value:0});renderItems();
   }));
  }));
  $("[data-add-allocation]").addEventListener("click",()=>{collectAllocations();allocations.push({cost_center:"",percent:"",amount:""});renderAllocations();});
  $("[data-allocation-mode]").addEventListener("change",()=>{collectAllocations();renderAllocations();});
  $("[data-save]").addEventListener("click",()=>run(async()=>{await saveDraft();status("Rascunho salvo: "+draft.loss_code);}));
  $("[data-review-button]").addEventListener("click",()=>run(async()=>{
   if(!form.reportValidity())return;const p=payload();const applicable=rates.filter(r=>r.is_active&&p.competence>=r.competence_from&&p.competence<=r.competence_to);
   if(applicable.length!==1)throw new Error("Não existe uma única alíquota aplicável à competência.");
   if(cents(p.invoice_value)<=0)throw new Error("Valor deve ser maior que zero.");
   const type=types.find(t=>t.id===p.loss_type_id);
   $("[data-review]").innerHTML=`<dl class="loss-revision"><dt>Competência / NF</dt><dd>${e(p.competence)} · ${e(p.invoice_number||"Sem NF")}</dd><dt>Valor / Alíquota</dt><dd>${money(p.invoice_value)} · ${applicable[0].rate_percent}%</dd><dt>Valor calculado pela alíquota</dt><dd>${money(p.invoice_value*Number(applicable[0].rate_percent)/100)}</dd><dt>Tipo / DRE</dt><dd>${e(type?.name)} · ${e(type?.dre_label)}</dd><dt>Loja / Centro</dt><dd>${e(p.competent_warehouse_code)} · ${e(p.cost_center||p.competent_warehouse_code)}</dd><dt>Motivo</dt><dd>${e(p.reason)}</dd><dt>Anexos novos</dt><dd>${files.map(x=>e(x.file.name)).join(", ")||"Nenhum"}</dd></dl>`;
   $("[data-submit]").hidden=false;
  }));
  $("[data-submit]").addEventListener("click",()=>run(async()=>{
   if(!form.reportValidity())return;await saveDraft();
   const duplicate=await client().from("wms_losses").select("loss_code").neq("id",draft.id).neq("status","CANCELADA").eq("competent_warehouse_code",draft.competent_warehouse_code).eq("invoice_number",draft.invoice_number).eq("invoice_value",draft.invoice_value).eq("competence",draft.competence).limit(3);
   if(duplicate.error)throw duplicate.error;
   let duplicate_reason="";
   if(draft.invoice_number&&duplicate.data?.length){const result=await requestVisualFields("Possível NF duplicada: "+duplicate.data.map(x=>x.loss_code).join(", "),[{name:"reason",label:"Justificativa para manter"}]);if(!result)return;duplicate_reason=result.reason;}
   draft=await command("SUBMIT",draft,{duplicate_reason});status("Perda enviada para análise.");tab="pending";await refreshData();
  }));
  renderItems();renderAllocations();
 }
 function invalidateReview(){if($("[data-submit]"))$("[data-submit]").hidden=true;if($("[data-review]"))$("[data-review]").innerHTML="";}
 function collectItems(){if(!$("[data-items]"))return;items=[...$("[data-items]").querySelectorAll("[data-item-row]")].map(node=>({...items[Number(node.dataset.itemRow)],quantity:node.querySelector("[data-qty]").value,unit_value:node.querySelector("[data-unit-value]").value}));}
 function renderItems(){
  invalidateReview();
  $("[data-items]").innerHTML=table(["SKU / Produto","Quantidade","Valor unitário (R$)","Endereço","Ação"],items.map((item,i)=>`<tr data-item-row="${i}"><td>${e(item.sku)}<br>${e(item.description_snapshot)}</td><td><input data-qty type="number" min="0.001" step="0.001" value="${e(item.quantity)}" aria-label="Quantidade"></td><td><input data-unit-value inputmode="decimal" value="${e(item.unit_value)}" aria-label="Valor unitário"></td><td>${e(item.location_snapshot)}</td><td><button type="button" class="secondary-button" data-remove-item="${i}">Remover</button></td></tr>`));
  $("[data-items]").querySelectorAll("[data-remove-item]").forEach(b=>b.addEventListener("click",()=>{collectItems();items.splice(Number(b.dataset.removeItem),1);renderItems();}));
 }
 function collectAllocations(){if(!$("[data-allocations]"))return;allocations=[...$("[data-allocations]").querySelectorAll("[data-allocation-row]")].map(node=>({cost_center:node.querySelector("select").value,[$("[data-allocation-mode]").value]:node.querySelector("input").value}));}
 function renderAllocations(){
  invalidateReview();
  const mode=$("[data-allocation-mode]").value;
  $("[data-allocations]").innerHTML=allocations.length?table(["Centro de custo",mode==="percent"?"Percentual":"Valor (R$)","Ação"],allocations.map((a,i)=>`<tr data-allocation-row><td><select aria-label="Centro de custo"><option value="">Selecione</option>${centers.filter(c=>c.is_active).map(c=>`<option value="${e(c.code)}" ${a.cost_center===c.code?"selected":""}>${e(c.name)}</option>`).join("")}</select></td><td><input inputmode="decimal" aria-label="Rateio" value="${e(a[mode]??"")}"></td><td><button type="button" class="secondary-button" data-remove-allocation="${i}">Remover</button></td></tr>`)):"<p>Integral no centro de custo da loja competente.</p>";
  $("[data-allocations]").querySelectorAll("[data-remove-allocation]").forEach(b=>b.addEventListener("click",()=>{collectAllocations();allocations.splice(Number(b.dataset.removeAllocation),1);renderAllocations();}));
 }
 function payload(){
  const form=$("[data-loss-form]"),p=Object.fromEntries(new window.FormData(form));delete p.dre;
  p.invoice_value=cents(p.invoice_value||"0")/100;collectItems();collectAllocations();
  p.items=items.map(item=>({...item,quantity:Number(item.quantity),unit_value:cents(item.unit_value)/100}));
  p.allocations=$("[data-allocation-mode]").value==="percent"?(allocations.length?allocatePercent(p.invoice_value,allocations):[]):allocations.map(a=>({cost_center:a.cost_center,amount:cents(a.amount)/100}));
  if(p.allocations.length&&p.allocations.reduce((n,a)=>n+cents(a.amount),0)!==cents(p.invoice_value))throw new Error("Rateio não fecha com o valor da NF.");
  return p;
 }
 async function saveDraft(){
  draft=await command(draft?"SAVE":"CREATE",draft,payload());
  while(files.length){
   const entry=files[0],mime=entry.type==="PDF"?"application/pdf":"application/xml";
   entry.path ||= draft.competent_warehouse_code+"/"+draft.id+"/"+crypto.randomUUID()+"."+entry.type.toLowerCase();
   if(!entry.uploaded){const upload=await client().storage.from("wms-loss-files").upload(entry.path,entry.file,{contentType:mime,upsert:false});if(upload.error)throw upload.error;entry.uploaded=true;}
   draft=await command("ATTACH",draft,{storage_path:entry.path,file_type:entry.type,file_name:entry.file.name,mime_type:mime,file_size:entry.file.size});files.shift();
  }
 }
 async function openDetail(id) {
  const r=await client().from("wms_losses").select("*").eq("id",id).single();if(r.error)throw r.error;detail=r.data;
  const results=await Promise.all(["items","allocations","files","events"].map(name=>client().from("wms_loss_"+name).select("*").eq("loss_id",id).order(name==="events"?"created_at":"id").limit(200)));
  for(const result of results)if(result.error)throw result.error;
  const [itemRows,allocationRows,fileRows,eventRows]=results.map(r=>r.data||[]),r0=detail,type=types.find(t=>t.id===r0.loss_type_id);
  const canEdit=["RASCUNHO","CORRECAO_SOLICITADA"].includes(r0.status)&&(r0.created_by_id===context.user().id||caps().approve);
  const actions=[];
  if(canEdit)actions.push(["EDIT","Editar"]);
  if(caps().approve&&r0.status==="PENDENTE")actions.push(["APPROVE","Aprovar"],["CORRECTION","Solicitar correção"]);
  if(caps().approve&&["APROVADA","EXPORTADA","CANCELADA"].includes(r0.status))actions.push(["REOPEN","Reabrir"]);
  if(r0.status!=="CANCELADA"&&r0.status!=="EXPORTADA"&&(caps().cancel||canEdit))actions.push(["CANCEL","Cancelar"]);
  $("[data-detail-title]").textContent=r0.loss_code;
  $("[data-detail-body]").innerHTML=`${badge(r0.status)}<div class="loss-tabs">${["Resumo","Itens","Documentos","Rateio","Histórico"].map((name,i)=>`<button type="button" data-detail-tab="${i}" aria-selected="${i===0}">${name}</button>`).join("")}</div>
   <div data-detail-pane="0"><dl>${Object.entries({"Competência":r0.competence,"Tipo":r0.loss_type_name_snapshot||type?.name,"DRE":r0.dre_label_snapshot||type?.dre_label,"Loja competente":r0.competent_warehouse_code,"Origem":r0.origin_warehouse_code,"NF":r0.invoice_number,"Emissão":r0.invoice_issue_date,"Valor NF":money(r0.invoice_value),"Alíquota":r0.rate_percent_snapshot==null?"A definir na aprovação":r0.rate_percent_snapshot+"%","Valor calculado pela alíquota":r0.rate_value_snapshot==null?"Não aprovado":money(r0.rate_value_snapshot),"Solicitante":r0.requester_name,"Responsável":r0.responsible_name,"Motivo":r0.reason,"Referência":r0.source_entity_code,"Data lançamento":date(r0.created_at),"Aprovado por":r0.approved_by_name}).map(([k,v])=>`<dt>${e(k)}</dt><dd>${e(v||"—")}</dd>`).join("")}</dl></div>
   <div data-detail-pane="1" hidden>${table(["SKU","Descrição","Quantidade","Unitário","Total"],itemRows.map(i=>`<tr><td>${e(i.sku)}</td><td>${e(i.description_snapshot)}</td><td>${i.quantity}</td><td>${money(i.unit_value)}</td><td>${money(i.total_value)}</td></tr>`))}</div>
   <div data-detail-pane="2" hidden>${fileRows.map((f,i)=>`<p>${e(f.file_name)} · ${Math.ceil(f.file_size/1024)} KB · ${date(f.uploaded_at)} <button type="button" class="secondary-button" data-file="${i}">Visualizar / baixar</button></p>`).join("")||"Sem anexos."}</div>
   <div data-detail-pane="3" hidden>${table(["Centro","Percentual","Valor","Valor calculado"],allocationRows.map(a=>`<tr><td>${e(a.cost_center)}</td><td>${a.percent??"—"}</td><td>${money(a.amount)}</td><td>${a.rate_value_snapshot==null?"—":money(a.rate_value_snapshot)}</td></tr>`))}</div>
   <div data-detail-pane="4" hidden><ol class="loss-history">${eventRows.map(ev=>`<li><strong>${e(ev.event_type)}</strong><small>${date(ev.created_at)} · ${e(ev.user_name)}</small>${e(ev.reason)}</li>`).join("")}</ol></div>
   <div class="button-row">${actions.map(([action,label])=>`<button class="secondary-button" type="button" data-action="${action}">${label}</button>`).join("")}</div>`;
  $("[data-detail-body]").querySelectorAll("[data-detail-tab]").forEach(button=>button.addEventListener("click",()=>{
   $("[data-detail-body]").querySelectorAll("[data-detail-pane]").forEach(p=>p.hidden=p.dataset.detailPane!==button.dataset.detailTab);
   $("[data-detail-body]").querySelectorAll("[data-detail-tab]").forEach(b=>b.setAttribute("aria-selected",String(b===button)));
  }));
  $("[data-detail-body]").querySelectorAll("[data-file]").forEach(button=>button.addEventListener("click",()=>run(async()=>{
   const result=await client().storage.from("wms-loss-files").createSignedUrl(fileRows[Number(button.dataset.file)].storage_path,60);
   if(result.error)throw result.error;window.open(result.data.signedUrl,"_blank","noopener,noreferrer");
  })));
  $("[data-detail-body]").querySelectorAll("[data-action]").forEach(button=>button.addEventListener("click",()=>run(async()=>{
   const action=button.dataset.action;
   if(action==="EDIT"){items=itemRows;allocations=allocationRows;tab="new";$("[data-detail]").close();renderForm(r0);if(allocations.some(a=>a.percent==null))$("[data-allocation-mode]").value="amount";renderAllocations();await refreshData();return;}
   let data={};
   if(["CORRECTION","REOPEN","CANCEL"].includes(action)){const result=await requestVisualFields(button.textContent,[{name:"reason",label:"Justificativa"}]);if(!result)return;data=result;}
   if(action==="APPROVE"){
    if(!window.confirm("Aprovar e congelar a classificação, a alíquota e os valores desta perda?"))return;
    const result=await client().from("wms_losses").select("id").neq("id",r0.id).neq("status","CANCELADA").eq("invoice_number",r0.invoice_number).eq("competent_warehouse_code",r0.competent_warehouse_code).eq("invoice_value",r0.invoice_value).eq("competence",r0.competence).limit(1);
    if(result.error)throw result.error;if(r0.invoice_number&&result.data.length){const confirmation=await requestVisualFields("Possível duplicidade de NF",[{name:"duplicate_reason",label:"Justificativa da aprovação"}]);if(!confirmation)return;data=confirmation;}
   }
   await command(action,r0,data);$("[data-detail]").close();status("Registro atualizado.");await refreshData();
  })));
  $("[data-detail]").showModal();
 }
 function download(batch) {
  if(!window.XLSX)throw new Error("Biblioteca de Excel indisponível. Atualize a página e tente novamente.");
  const {summary,detail}=financialSheets(batch),book=window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(book,window.XLSX.utils.json_to_sheet(summary),"RESUMO_DRE");
  window.XLSX.utils.book_append_sheet(book,window.XLSX.utils.json_to_sheet(detail),"DETALHAMENTO");
  window.XLSX.writeFile(book,batch.batch_code+".xlsx");
 }
 async function renderExports() {
  const f=filters();let query=client().from("wms_loss_export_batches").select("id,batch_code,competence,generated_at,record_count,total_invoice_value,total_rate_value").order("generated_at",{ascending:false}).limit(30);
  if(f.competence)query=query.eq("competence",f.competence);const r=await query;if(r.error)throw r.error;
  $("[data-exports]").innerHTML=`<h3>Exportação Financeira / DRE</h3><div class="button-row"><button class="primary-button" type="button" data-preview>Prévia de fechamento</button><button class="secondary-button" type="button" data-period="REVIEW_PERIOD">Em conferência</button><button class="secondary-button" type="button" data-period="CLOSE_PERIOD">Fechar competência</button><button class="secondary-button" type="button" data-period="REOPEN_PERIOD">Reabrir competência</button></div><div data-export-preview></div><section class="loss-band"><h3>Lotes anteriores</h3>${table(["Lote","Competência","Registros","Valor NFs","Valor calculado","Ação"],(r.data||[]).map(b=>`<tr><td>${e(b.batch_code)}</td><td>${e(b.competence)}</td><td>${b.record_count}</td><td>${money(b.total_invoice_value)}</td><td>${money(b.total_rate_value)}</td><td><button type="button" class="secondary-button" data-batch="${e(b.id)}">Baixar novamente</button></td></tr>`))}</section>`;
  $("[data-preview]").addEventListener("click",()=>run(async()=>{
   if(!f.competence)throw new Error("Selecione a competência.");
   preview=await rpc("wms_loss_export_preview",{p_filters:f});
   $("[data-export-preview]").innerHTML=`<div class="loss-revision"><p>Competência: ${e(f.competence)} · ${preview.records} registros · ${preview.warehouses} lojas · ${preview.invoices} NFs</p><p>Valor NF: ${money(preview.invoice_value)} · Valor calculado: ${money(preview.rate_value)}</p><p>Pendentes de análise: ${preview.pending} · Correções: ${preview.corrections}</p><button type="button" class="primary-button" data-confirm-export ${preview.records?"":"disabled"}>Confirmar lote e baixar Excel</button></div>`;
   $("[data-confirm-export]").addEventListener("click",()=>run(async()=>{
    const batch=await command("EXPORT",null,{...f,signature:preview.signature});
    status("Lote "+batch.batch_code+" criado. O histórico permite baixar novamente.");await renderExports();download(batch);
   }));
  }));
  $("[data-exports]").querySelectorAll("[data-batch]").forEach(button=>button.addEventListener("click",()=>run(async()=>{
   const result=await client().from("wms_loss_export_batches").select("*").eq("id",button.dataset.batch).single();if(result.error)throw result.error;download(result.data);
  })));
  $("[data-exports]").querySelectorAll("[data-period]").forEach(button=>button.addEventListener("click",()=>run(async()=>{
   if(!f.competence)throw new Error("Selecione a competência.");
   const answer=await requestVisualFields(button.textContent+" "+f.competence,[{name:"reason",label:"Justificativa"}]);if(!answer)return;
   await command(button.dataset.period,null,{competence:f.competence,...answer});status("Competência atualizada.");await renderExports();
  })));
 }
 function renderConfig() {
  if(!caps().configure)throw new Error("Configuração exclusiva de administradores.");
  $("[data-config]").innerHTML=`<section class="loss-band"><h3>Tipos de perda e DRE</h3><form data-config-type class="loss-form-grid"><label>Cadastro<select name="id"><option value="">Novo tipo</option>${options(types)}</select></label>
   ${field("Código","code")}${field("Nome","name")}${field("Código DRE","dre_code")}${field("Classificação DRE","dre_label")}${field("Ordem","display_order","number",0)}
   <label>Ativo<select name="is_active"><option value="true">Sim</option><option value="false">Não</option></select></label><button class="primary-button">Salvar tipo</button></form></section>
   <section class="loss-band"><h3>Alíquotas por competência</h3><form data-config-rate class="loss-form-grid"><label>Cadastro<select name="id"><option value="">Nova faixa</option>${rates.map(r=>`<option value="${r.id}">${r.competence_from} a ${r.competence_to} · ${r.rate_percent}% ${r.is_active?"":"(inativa)"}</option>`).join("")}</select></label>
   ${field("Alíquota (%)","rate_percent","number","",'min="0" max="100" step="0.0001" required')}${field("Competência inicial","competence_from","month","","required")}${field("Competência final","competence_to","month","","required")}
   <label>Ativa<select name="is_active"><option value="true">Sim</option><option value="false">Não</option></select></label><button class="primary-button">Salvar faixa</button></form></section>
   <section class="loss-band"><h3>Configurações financeiras</h3><form data-config-settings class="loss-form-grid"><label>Base dos indicadores oficiais<select name="metric_basis"><option value="INVOICE">Valor da NF</option><option value="CALCULATED">Valor calculado pela alíquota</option></select></label><button class="primary-button">Salvar regra</button></form></section>
   <section class="loss-band"><h3>Centros de custo</h3><form data-config-center class="loss-form-grid">${field("Código","code","text","","required")}${field("Nome","name","text","","required")}<label>Loja<select name="warehouse_code">${warehouseOptions()}</select></label><label>Ativo<select name="is_active"><option value="true">Sim</option><option value="false">Não</option></select></label><button class="primary-button">Salvar centro</button></form></section>`;
  for(const [name,action,data] of [["type","CONFIG_TYPE",types],["rate","CONFIG_RATE",rates],["settings","CONFIG_SETTINGS",[]],["center","CONFIG_CENTER",[]]]) {
   const form=$("[data-config-"+name+"]");
   form.elements.id?.addEventListener("change",()=>{
    const row=data.find(r=>r.id===form.elements.id.value);if(!row)return;
    for(const input of form.elements)if(input.name&&row[input.name]!=null)input.value=String(row[input.name]);
   });
   form.addEventListener("submit",event=>{event.preventDefault();run(async()=>{
    const values=Object.fromEntries(new window.FormData(form));if("is_active" in values)values.is_active=values.is_active==="true";
    await command(action,null,values);status("Configuração salva. Aprovações anteriores preservadas.");await refreshData();
   });});
  }
  client().from("wms_loss_financial_settings").select("metric_basis").eq("id",true).single().then(result=>{
   if(result.error){$("[data-error]").textContent=result.error.message;return;}
   const form=$("[data-config-settings]");if(form)form.elements.metric_basis.value=result.data.metric_basis;
  });
 }
 root.querySelectorAll("[data-tab]").forEach(button=>button.addEventListener("click",()=>run(async()=>{
  tab=button.dataset.tab;page=0;preview=null;if(tab==="new"){items=[];allocations=[];renderForm();}await refreshData();
 })));
 $("[data-refresh]").addEventListener("click",()=>run(async()=>{page=0;await refreshData();}));
 $("[data-prev]").addEventListener("click",()=>run(async()=>{page=Math.max(0,page-1);await loadList();}));
 $("[data-next]").addEventListener("click",()=>run(async()=>{page++;await loadList();}));
 $("[data-close]").addEventListener("click",()=>$("[data-detail]").close());
 root.addEventListener("click",event=>{const button=event.target.closest("[data-open]");if(button)run(()=>openDetail(button.dataset.open));});
 return { refresh:()=>run(refreshData) };
}
