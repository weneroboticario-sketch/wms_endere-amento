import "./purchase-transfer-builder.css";
import { escapeHtml as e, randomId } from "./utils.js";
import { hasPurchaseCapability } from "./access-control.js";
import { STORE_NEED_CONFIG, parseStoreNeedText, compareNeedWithCapture, validatePurchaseCart, summarizePurchaseCart } from "./purchase-transfer-model.js";

export function createPurchaseTransferBuilder(context) {
  const root = document.getElementById("purchaseTransferContent");
  let units = [], origin = "", destination = "", rows = [], page = 0, total = 0, summary = {}, cart = new Map();
  let step = 1, busy = false, message = "", changes = [], duplicates = [], acknowledged = false, result = null;
  let responsible = "", staff = [], priority = "NORMAL", observation = "", actionId = randomId("purchase"), generation = 0;
  let search = "", filter = "NEED", sort = "ZERO", target = STORE_NEED_CONFIG.target, selected = new Set();
  let loadedUser = "", batchId = "", batchCheckedAt = 0;
  let attention = [], pageFilter = "ALL";
  const draftKey = () => `purchase-draft:${context.user().id}:${new URL(context.client().supabaseUrl || window.location.origin).hostname}`;
  const unit = code => units.find(w => w.code === code);
  const options = value => units.map(w => `<option value="${e(w.code)}" ${value === w.code ? "selected" : ""}>${e(w.code)} - ${e(w.name)}</option>`).join("");
  const rpc = async (name,params) => { const r = await context.client().rpc(name,params); if(r.error) throw r.error; return r.data; };
  function draw() {
    const items = [...cart.values()], counts = summarizePurchaseCart(items);
    root.className = "purchase-builder";
    root.innerHTML = `<h2>Necessidade das Lojas</h2><p class="pb-subtitle">Abastecimento por destino</p>
      <nav class="pb-steps" aria-label="Etapas">${["Unidade","Produtos","Revisao"].map((label,i)=>`<span class="${step===i+1?"current":""}">${i+1}. ${label}</span>`).join("")}</nav>
      <div class="pb-units"><label>Estoque de origem<select id="pbOrigin" ${busy||step===3?"disabled":""}>${options(origin)}</select></label><label>Loja destino<select id="pbDestination" ${busy||step===3?"disabled":""}>${options(destination)}</select></label></div>
      <p id="pbImportNotice" role="status"></p>
      ${message?`<p class="pb-error" role="status">${e(message)}</p>`:""}
      ${result?`<section><h3>Transferencia criada com sucesso</h3><p><strong>${e(result.code)}</strong> | ${counts.skus} SKUs analisados | ${items.filter(i=>i.quantity>0).length} enviados | ${counts.partial} parciais | ${counts.zero} sem envio</p><div class="button-row"><button data-pb="open" class="primary-button">Abrir transferencia</button><button data-pb="another" class="secondary-button">Criar outra para esta loja</button><button data-screen-target="fiscalWorkflow" class="secondary-button">Central de Compras / NF</button></div></section>`:
      step===1?`<div class="pb-options"><button data-pb="start" class="primary-button" ${busy?"disabled":""}>Nova transferencia</button><button data-pb="restore" class="secondary-button">Recuperar rascunho</button></div>
      <h3>Lojas que precisam de atencao</h3><div class="pb-grid"><table><thead><tr><th>Loja</th><th>Zerados</th><th>Baixo estoque</th><th>Transferencias abertas</th><th>Ultima atualizacao</th><th>Acao</th></tr></thead><tbody>${attention.map(a=>`<tr><td data-label="Produto">${e(a.code)} - ${e(a.name)}</td><td data-label="Zerados">${a.zero??"Sem base"}</td><td data-label="Baixo estoque">${a.low??"Sem base"}</td><td data-label="Transferencias abertas">${a.open_transfers}</td><td data-label="Atualizacao">${a.updated_at?e(new Date(a.updated_at).toLocaleString()):"Sem base LOJA"}</td><td data-label="Acao"><button class="secondary-button" data-pb-destination="${e(a.code)}">Selecionar loja</button></td></tr>`).join("")}</tbody></table></div>`:
      `<div class="pb-layout"><div>${step===2?productsHtml():reviewHtml(items)}${cartTable(items)}
      <div class="pb-options"><label>Responsavel do estoque<select id="pbResponsible" ${busy||step===3?"disabled":""}><option value="">Selecione</option>${staff.map(u=>`<option value="${e(u.id)}" ${responsible===u.id?"selected":""}>${e(u.name)} (${e(u.role)})</option>`).join("")}</select></label>
      <label>Prioridade<select id="pbPriority" ${busy||step===3?"disabled":""}>${["NORMAL","ALTA","URGENTE"].map(p=>`<option ${p===priority?"selected":""}>${p}</option>`).join("")}</select></label><label class="pb-wide">Observacao<textarea id="pbObservation" maxlength="4000" ${busy||step===3?"disabled":""}>${e(observation)}</textarea></label></div>
      </div><aside class="pb-cart"><h3>Transferencia em montagem</h3><dl><dt>Origem</dt><dd>${e(origin)}</dd><dt>Destino</dt><dd>${e(destination)}</dd><dt>SKUs</dt><dd>${counts.skus}</dd><dt>Necessidade</dt><dd>${counts.need}</dd><dt>A enviar</dt><dd>${counts.units}</dd><dt>Integrais</dt><dd>${counts.full}</dd><dt>Parciais</dt><dd>${counts.partial}</dd><dt>Sem envio</dt><dd>${counts.zero}</dd></dl>
      <p>Saldo baseado na ultima atualizacao da CAPTACAO.</p><div class="button-row"><button data-pb="${step===3?"create":"review"}" class="primary-button pb-review" ${busy?"disabled":""}>${busy?"Processando...":step===3?"Criar transferencia":"Revalidar e revisar"}</button><button data-pb="save" class="secondary-button" ${busy?"disabled":""}>Salvar rascunho</button>${step===3?'<button data-pb="back" class="secondary-button">Voltar e corrigir</button>':""}</div></aside></div><div class="pb-mobile-bar"><span>${counts.skus} SKUs | ${counts.units} unidades</span><button class="primary-button" data-pb="${step===3?"create":"review"}" ${busy?"disabled":""}>${step===3?"Confirmar":"Revisar"}</button></div>`}`;
  }
  function productsHtml() {
    const visible=visibleRows();
    return `<div class="pb-kpis"><span>Zerados<strong>${Number(summary.zero||0)}</strong></span><span>Baixo estoque<strong>${Number(summary.low||0)}</strong></span><span>Com necessidade<strong>${Number(summary.needs||0)}</strong></span><span>Com saldo nesta pagina<strong>${rows.filter(r=>r.available>0).length}</strong></span><span>Em transferencia nesta pagina<strong>${rows.filter(r=>r.open_transfers?.length).length}</strong></span></div>
      <div class="pb-toolbar"><label>SKU ou descricao<input id="pbSearch" value="${e(search)}"></label><label>Filtro<select id="pbFilter">${[["NEED","Com necessidade"],["ALL","Todos"],["ZERO","Zerados"],["LOW","Estoque baixo"]].map(([v,l])=>`<option value="${v}" ${v===filter?"selected":""}>${l}</option>`).join("")}</select></label><label>Ordenar<select id="pbSort">${[["ZERO","Zerados primeiro"],["NEED","Maior necessidade"],["LOW","Menor saldo"],["NAME","Nome"]].map(([v,l])=>`<option value="${v}" ${v===sort?"selected":""}>${l}</option>`).join("")}</select></label><label>Estoque alvo<input id="pbTarget" type="number" min="1" max="100000" value="${target}"></label><button data-pb="search" class="secondary-button" ${busy?"disabled":""}>Buscar</button></div>
      <div class="button-row"><label>Disponibilidade nesta pagina<select id="pbPageFilter">${[["ALL","Todos"],["AVAILABLE","Com saldo"],["ZERO","Sem saldo"],["PARTIAL","Parcial"],["SELECTED","Selecionados"]].map(([v,l])=>`<option value="${v}" ${pageFilter===v?"selected":""}>${l}</option>`).join("")}</select></label><button data-pb="select-page" class="secondary-button">Selecionar pagina</button><button data-pb="add" class="primary-button" ${busy?"disabled":""}>Adicionar selecionados</button></div>
      <div class="pb-grid"><table><thead><tr><th>Selecionar</th><th>Produto</th><th>Saldo destino (${e(destination)})</th><th>Necessidade</th><th>Disponivel origem (${e(origin)})</th><th>Sugerido</th><th>Situacao</th></tr></thead><tbody>${visible.map(r=>`<tr><td data-label="Selecionar"><input type="checkbox" data-pb-select="${e(r.sku)}" ${selected.has(r.sku)?"checked":""}></td><td data-label="Produto"><strong>${e(r.sku)}</strong><small>${e(r.description)}</small><small>${e(r.location||"Sem localizacao")}</small><small>${r.capture_at?e(new Date(r.capture_at).toLocaleString()):"Base nao encontrada"}</small></td><td data-label="Saldo destino"><strong>${r.store_available??"Nao consultado"}</strong><small>${e(destination)} - Loja</small></td><td data-label="Necessidade">${r.need}</td><td data-label="Disponivel origem"><strong>${r.available??"Nao encontrado"}</strong><small>${e(origin)} - CAPTACAO</small></td><td data-label="Sugerido">${r.suggested}</td><td data-label="Situacao"><span class="pb-badge ${r.suggested<r.need?"warn":""}">${e(r.situation)}</span>${r.open_transfers?.length?'<small>Ja em transferencia aberta</small>':""}</td></tr>`).join("")}</tbody></table>${!visible.length?'<p class="pb-empty">Nenhum produto retornado. Cole uma necessidade para analise.</p>':""}</div>
      <div class="button-row"><button data-pb="prev" class="secondary-button" ${page===0||busy?"disabled":""}>Anterior</button><span>${page+1} | ${total} produtos</span><button data-pb="next" class="secondary-button" ${(page+1)*40>=total||busy?"disabled":""}>Proxima</button></div>
      <details><summary>Colar necessidade / adicionar SKU</summary><label>SKU;QUANTIDADE<textarea id="pbPaste" placeholder="01302;20&#10;94137;8"></textarea></label><button data-pb="paste" class="secondary-button" ${busy?"disabled":""}>Analisar necessidade</button></details>`;
  }
  function visibleRows() {
    return rows.filter(r=>pageFilter==="ALL"||pageFilter==="AVAILABLE"&&r.available>0||pageFilter==="ZERO"&&r.available===0||pageFilter==="PARTIAL"&&r.suggested>0&&r.suggested<r.need||pageFilter==="SELECTED"&&selected.has(r.sku));
  }
  function cartTable(items) {
    if(!items.length)return "";
    return `<h3>Itens da transferencia</h3><div class="pb-grid"><table><thead><tr><th>Produto</th><th>Saldo destino (${e(destination)})</th><th>Necessidade</th><th>Disponivel origem (${e(origin)})</th><th>A enviar</th><th>Faltante</th><th>Situacao</th><th>Acao</th></tr></thead><tbody>${items.map(i=>`<tr><td data-label="Produto"><strong>${e(i.sku)}</strong><small>${e(i.description)}</small><small>${e(i.location||"Sem localizacao")}</small></td><td data-label="Saldo destino"><strong>${i.store_available??"Nao consultado"}</strong><small>${e(destination)} - Loja</small></td><td data-label="Necessidade">${i.need}</td><td data-label="Disponivel origem"><strong>${i.available??"Indisponivel"}</strong><small>${e(origin)} - CAPTACAO</small></td><td data-label="A enviar">${step===3?i.quantity:`<input aria-label="Enviar ${e(i.sku)}" data-pb-quantity="${e(i.sku)}" type="number" min="0" max="1000000" value="${i.quantity}" ${busy?"disabled":""}>`}</td><td data-label="Faltante">${Math.max(0,i.need-i.quantity)}</td><td data-label="Situacao"><span class="pb-badge ${i.quantity<i.need?"warn":""}">${i.quantity>Number(i.available)?"ACIMA DO SALDO":i.quantity===0?"SEM ENVIO":i.quantity<i.need?"PARCIAL":"INTEGRAL"}</span></td><td data-label="Acao">${step===2?`<button type="button" data-pb-remove="${e(i.sku)}" class="secondary-button" aria-label="Remover ${e(i.sku)}">Remover</button>`:"-"}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function reviewHtml(items) {
    return `<h3>Revisar transferencia</h3><p>${e(unit(origin)?.name)} → ${e(unit(destination)?.name)} | ${e(staff.find(u=>u.id===responsible)?.name||"Sem responsavel")} | ${e(priority)} | NF obrigatoria</p>
      ${changes.length?`<div class="pb-changes">O saldo de ${changes.length} item(ns) mudou.${changes.map(c=>`<p>${e(c.sku)}: antes ${c.before??"-"} / agora ${c.after??"-"}</p>`).join("")}</div>`:""}
      ${duplicates.length?`<div class="pb-changes"><p>${new Set(duplicates.map(d=>d.sku)).size} produto(s) ja aparecem em transferencia aberta.</p>${[...new Map(duplicates.map(d=>[d.id,d])).values()].map(d=>`<button class="secondary-button" data-pb-existing="${e(d.id)}">${e(d.code)} - Ver transferencia</button>`).join("")}<label><input id="pbDuplicateAck" type="checkbox" ${acknowledged?"checked":""}> Continuar mesmo assim</label></div>`:""}
      <p>${items.filter(i=>i.quantity===0).length} item(ns) sem envio permanecem somente na analise, nao serao criados no estoque.</p>`;
  }
  async function capture(items) {
    const data = await rpc("wms_purchase_capture",{p_warehouse_code:origin,p_skus:items.map(i=>i.sku)});
    const map = new Map((data||[]).map(i=>[i.sku,i]));
    return items.map(i=>compareNeedWithCapture(i,map.get(i.sku)));
  }
  async function loadRows() {
    const token=++generation, o=origin, d=destination;
    const data=await rpc("wms_purchase_store_needs",{p_destination_code:d,p_origin_code:o,p_search:search,p_filter:filter,p_sort:sort,p_target:target,p_page:page});
    if(token!==generation||o!==origin||d!==destination)return;
    rows=(data.rows||[]).map(i=>compareNeedWithCapture(i,i.available===null?null:{available:i.available,description:i.description,location:i.location,updated_at:i.capture_at}));
    total=Number(data.total||0);summary=data.summary||{};selected.clear();
  }
  async function loadStaff() {
    const r=await context.client().from("wms_users").select("id,name,role,default_warehouse_code")
      .eq("active",true).eq("archived",false).eq("available_for_tasks",true).eq("default_warehouse_code",origin).in("role",["OPERADOR","SUPERVISOR"]).order("name");
    if(r.error)throw r.error;staff=r.data||[];if(!staff.some(u=>u.id===responsible))responsible="";
  }
  async function review() {
    if(!responsible)throw new Error("Selecione um responsavel do estoque.");
    const old=[...cart.values()];if(!old.length)throw new Error("Adicione produtos a transferencia.");
    const current=await capture(old);changes=current.filter((i,n)=>i.available!==old[n].available).map((i,n)=>({sku:i.sku,before:old.find(o=>o.sku===i.sku).available,after:i.available,index:n}));
    cart=new Map(current.map(i=>[i.sku,i]));duplicates=await rpc("wms_purchase_open_duplicates",{p_origin_code:origin,p_destination_code:destination,p_skus:old.map(i=>i.sku)});acknowledged=false;
    const error=validatePurchaseCart(current);if(error)throw new Error(`${changes.length?"O saldo mudou. ":""}${error} Ajuste a quantidade e revise novamente.`);
    step=3;
  }
  async function create() {
    const actor = context.user().id;
    if(duplicates.length&&!acknowledged)throw new Error("Confirme a continuidade dos produtos ja em transferencia.");
    const current=await capture([...cart.values()]);
    const error=validatePurchaseCart(current);if(error){cart=new Map(current.map(i=>[i.sku,i]));step=2;throw new Error(error+" Revalide e revise novamente.");}
    const different=current.some(i=>i.available!==cart.get(i.sku).available);
    if(different){step=2;cart=new Map(current.map(i=>[i.sku,i]));throw new Error("A CAPTACAO mudou durante a revisao. Revalide e revise novamente.");}
    if(actor!==context.user()?.id || !hasPurchaseCapability(context.user()?.role,"purchases.transfer.create"))throw new Error("A sessao mudou. Abra novamente a montagem.");
    result=await rpc("wms_create_purchase_transfer",{p_warehouse_code:origin,p_destination_id:unit(destination).id,p_responsible_id:responsible,p_priority:priority,p_observation:observation,
      p_items:current.filter(i=>i.quantity>0).map(i=>({sku:i.sku,requested_quantity:i.quantity,store_need_quantity:i.need})),p_client_action_id:actionId});
    try{localStorage.removeItem(draftKey());}catch{ /* Creation is committed even when local storage is unavailable. */ }
    context.changed();
  }
  async function refresh() {
    if(!hasPurchaseCapability(context.user()?.role,"purchases.transfer.create")) {root.textContent="Acesso nao autorizado.";return;}
    if(loadedUser!==context.user().id){
      loadedUser=context.user().id;units=[];origin="";destination="";cart.clear();rows=[];staff=[];step=1;result=null;
      message="";responsible="";priority="NORMAL";observation="";actionId=randomId("purchase");generation++;
    }
    const freshUnits=context.warehouses();
    if(units.length && JSON.stringify(freshUnits)===JSON.stringify(units)){
      if(step>=2 && Date.now()-batchCheckedAt>=60000 && !busy){
        batchCheckedAt=Date.now();
        const r=await context.client().from("wms_stock_import_batches").select("id,finished_at").eq("warehouse_code",origin).eq("source_type","CAPTACAO").eq("status","COMPLETED").order("finished_at",{ascending:false}).limit(1).maybeSingle();
        if(!r.error && r.data){if(batchId && batchId!==r.data.id && root.querySelector("#pbImportNotice"))root.querySelector("#pbImportNotice").textContent="Nova CAPTACAO disponivel. Revalide antes de criar.";batchId=r.data.id;}
      }
      return;
    }
    units=freshUnits;
    if(!unit(origin))origin=units.some(w=>w.code===context.warehouse())?context.warehouse():units[0]?.code||"";
    if(!unit(destination))destination=units.find(w=>w.code!==origin)?.code||"";
    if(!units.length)message="Nenhuma unidade ativa autorizada.";
    else if(units.length===1)message="Para transferir entre lojas, o administrador precisa autorizar a unidade de origem e a loja destino no seu cadastro.";
    draw();
    if(units.length){const actor=loadedUser;try{const data=await rpc("wms_purchase_attention",{p_target:target});if(actor!==context.user()?.id)return;attention=data;}catch(error){message="Resumo das lojas indisponivel: "+error.message;}draw();}
  }
  root.addEventListener("change",event=>{
    const el=event.target;if(busy)return;
    if(el.id==="pbOrigin"||el.id==="pbDestination"){
      if(cart.size){message="Remova os itens do carrinho antes de trocar origem ou destino.";draw();return;}
      if(el.id==="pbOrigin")origin=el.value;else destination=el.value;step=1;rows=[];staff=[];responsible="";page=0;generation++;draw();
    }
    if(el.dataset.pbSelect){if(el.checked)selected.add(el.dataset.pbSelect);else selected.delete(el.dataset.pbSelect);}
    if(el.dataset.pbQuantity){const i=cart.get(el.dataset.pbQuantity);i.quantity=Number(el.value);message=validatePurchaseCart([...cart.values()]);draw();}
    if(el.id==="pbResponsible")responsible=el.value;
    if(el.id==="pbPriority")priority=el.value;
    if(el.id==="pbObservation")observation=el.value;
    if(el.id==="pbDuplicateAck")acknowledged=el.checked;
    if(el.id==="pbPageFilter"){pageFilter=el.value;draw();}
  });
  root.addEventListener("click",async event=>{
    if(busy)return;
    const navigation=event.target.closest("[data-screen-target]");if(navigation){context.navigate(navigation.dataset.screenTarget);return;}
    const remove=event.target.closest("[data-pb-remove]");if(remove){cart.delete(remove.dataset.pbRemove);message="";draw();return;}
    const dest=event.target.closest("[data-pb-destination]");if(dest){destination=dest.dataset.pbDestination;if(origin===destination)origin=units.find(w=>w.code!==destination)?.code||"";draw();return;}
    const existing=event.target.closest("[data-pb-existing]");if(existing){context.openTransfer(existing.dataset.pbExisting);return;}
    const button=event.target.closest("[data-pb]");if(!button)return;
    const action=button.dataset.pb;message="";
    const actor=context.user().id;
    // Read current inputs before rendering replaces the DOM.
    if(action==="search"){search=root.querySelector("#pbSearch").value.trim();filter=root.querySelector("#pbFilter").value;sort=root.querySelector("#pbSort").value;target=Number(root.querySelector("#pbTarget").value);page=0;}
    const pasted=action==="paste"?parseStoreNeedText(root.querySelector("#pbPaste").value):null;
    busy=true;draw();
    try{
      if(action==="start"){if(!origin||!destination||origin===destination)throw new Error("Selecione origem e destino diferentes.");await loadStaff();await loadRows();step=2;}
      if(action==="search"||action==="next"||action==="prev"){if(action==="next")page++;if(action==="prev")page=Math.max(0,page-1);await loadRows();}
      if(action==="select-page")visibleRows().forEach(i=>selected.add(i.sku));
      if(action==="add"){const addition=rows.filter(i=>selected.has(i.sku)&&!cart.has(i.sku));if(cart.size+addition.length>500)throw new Error("Limite de 500 SKUs.");for(const i of addition)cart.set(i.sku,{...i});}
      if(action==="paste"){if(pasted.errors.length)throw new Error(pasted.errors.join(" "));rows=await capture(pasted.rows);total=rows.length;page=0;selected=new Set(rows.map(i=>i.sku));}
      if(action==="review")await review();if(action==="create")await create();if(action==="back")step=2;
      if(action==="open")context.openTransfer(result.id);
      if(action==="another"){result=null;cart.clear();changes=[];duplicates=[];actionId=randomId("purchase");step=1;}
      if(action==="save"){localStorage.setItem(draftKey(),JSON.stringify({origin,destination,items:[...cart.values()],priority,observation,responsible,actionId}));message="Rascunho salvo neste navegador. Nenhuma tarefa foi criada.";}
      if(action==="restore"){
        const draft=JSON.parse(localStorage.getItem(draftKey())||"null");if(!draft)throw new Error("Nenhum rascunho encontrado.");
        if(!unit(draft.origin)||!unit(draft.destination)||!Array.isArray(draft.items)||draft.items.length>500)throw new Error("Rascunho fora das unidades autorizadas.");
        origin=draft.origin;destination=draft.destination;priority=draft.priority;observation=draft.observation;responsible=draft.responsible;actionId=draft.actionId||randomId("purchase");
        cart=new Map(draft.items.map(i=>[String(i.sku),i]));await loadStaff();step=2;await loadRows();message="Rascunho recuperado. Revalide os saldos antes de criar.";
      }
    }catch(error){message=error.message||String(error);context.diagnostic("purchase-builder",error);}
    finally{busy=false;if(actor!==context.user()?.id)await refresh();else draw();}
  });
  return {refresh,selectDestination(code){
    if(cart.size)throw new Error("Salve ou finalize o carrinho atual antes de abrir outra loja.");
    if(!unit(code))throw new Error("Loja nao autorizada.");
    destination=code;if(origin===code)origin=units.find(w=>w.code!==code)?.code||"";step=1;result=null;draw();
  }};
}
