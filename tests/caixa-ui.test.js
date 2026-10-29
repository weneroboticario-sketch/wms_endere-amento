import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { mountCaixaRequests } from "../src/caixa-requests.js";

class Element {
  constructor(tag) { this.tag=tag; this.children=[]; this.dataset={}; this.listeners={}; this.value=""; }
  get isConnected() { return this.root || this.parent?.isConnected; }
  append(child) { if(child.parent) child.parent.children=child.parent.children.filter(node=>node!==child); child.parent=this; this.children.push(child); }
  replaceChildren() { this.children=[]; }
  insertBefore(child,ref) { if(child.parent) child.parent.children=child.parent.children.filter(node=>node!==child); child.parent=this; this.children.splice(this.children.indexOf(ref),0,child); }
  setAttribute(name,value) { this.attributes ||= {}; this.attributes[name]=value; }
  contains(target) { return this===target || this.children.some(child=>child.contains(target)); }
  scrollIntoView() {}
  focus() { globalThis.document.activeElement=this; }
  click() { return this.listeners.click?.(); }
  remove() { if(this.parent) this.parent.children=this.parent.children.filter(child=>child!==this); this.parent=null; }
  addEventListener(name,handler) { this.listeners[name]=handler; }
  querySelectorAll(selector) { return this.children.flatMap(child=>[...(selector.split(",").includes(child.tag)?[child]:[]),...child.querySelectorAll(selector)]); }
}

test("Caixa retry reuses the exact operation after a lost response and never exposes review actions",async()=>{
  const previous=globalThis.document;
  globalThis.document={createElement:tag=>new Element(tag)};
  try {
    const host=new Element("main"); host.root=true;
    const calls=[];
    const client={
      from() {const chain={then(resolve){return Promise.resolve({data:[]}).then(resolve);}}; for(const method of ["select","eq","order","limit"]) chain[method]=()=>chain; return chain;},
      async rpc(name,args) {if(name==="list_wms_caixa_attendance")return {data:[]};if(name==="lookup_wms_caixa_item")return {data:{found:true,sku:args.product_code,name:"Produto real de teste",captureAvailable:10,storeAvailable:null}};calls.push({name,args}); return calls.length===1?{error:{message:"Resposta perdida"}}:{data:args.request_key};}
    };
    mountCaixaRequests(host,{actor:"c1",role:"CAIXA",warehouse:"VDCG",client,isCurrent:()=>true});
    await setImmediate();
    const form=host.querySelectorAll("fieldset")[0];
    const inputs=form.querySelectorAll("input"); inputs[0].value="00123"; inputs[1].value="16";
    await inputs[0].listeners.keydown({key:"Enter",preventDefault(){}});
    form.querySelectorAll("textarea")[0].value="Cliente aguardando";
    const send=form.querySelectorAll("button").find(button=>button.dataset.requestSubmit);
    await send.listeners.click(); assert.equal(inputs[0].disabled,true);
    await send.listeners.click(); assert.equal(calls.length,2); assert.deepEqual(calls[0],calls[1]);
    assert.equal(calls[0].args.units,16); assert.equal(calls[0].args.product_code,"00123");
    assert.equal(inputs[0].value,""); assert.equal(inputs[0].disabled,false);
    const adjustment=form.querySelectorAll("button").find(button=>button.dataset.requestKind==="ADJUSTMENT");
    assert.ok(adjustment);
    adjustment.listeners.click();
    assert.equal(adjustment.attributes["aria-pressed"],"true");
    inputs[0].value="94133"; inputs[1].value="2";
    await inputs[0].listeners.keydown({key:"Enter",preventDefault(){}});
    form.querySelectorAll("textarea")[0].value="Liberar quantidade no pedido";
    await send.listeners.click();
    assert.equal(calls[2].args.request_kind,"ADJUSTMENT");
    assert.equal(calls[2].args.product_code,"94133");
    assert.ok(!host.querySelectorAll("button").some(button=>button.textContent==="Encaminhar à verificação"));
  } finally {globalThis.document=previous;}
});


test("urgent attendance shows only available, mine and waiting, preserving separate equal-SKU requests",async()=>{
  const previous=globalThis.document, previousInterval=globalThis.setInterval;
  let poll;
  globalThis.setInterval=fn=>{poll=fn;return {unref(){}};};
  globalThis.document={createElement:tag=>new Element(tag)};
  try {
    const host=new Element("main"); host.root=true;
    let rows=[
      {id:"a",sku:"48060",kind:"ADJUSTMENT",warehouse_code:"VDCG",quantity:2,status:"EM_VERIFICACAO",created_at:"2026-10-29T14:00:00Z",claimed_by:"worker",claimed_by_name:"Responsável",requested_by:"c1",notes:"Conferir"},
      {id:"b",sku:"48060",kind:"ADJUSTMENT",warehouse_code:"VDCG",quantity:5,status:"AGUARDANDO_CONFIRMACAO_CAIXA",created_at:"2026-10-29T15:00:00Z",claimed_by:"worker",requested_by:"c1",resolution_notes:"feito"},
      {id:"c",sku:"00123",kind:"PRODUCT",warehouse_code:"VDCG",quantity:1,attended:0,status:"PENDENTE",customer_service:true,created_at:"2026-10-29T16:00:00Z",requested_by:"c1"}
    ];
    const calls=[];
    const client={from(table){const query={then(resolve){return Promise.resolve({data:table==="wms_caixa_requests"?rows:[{created_at:"2026-10-29T14:00:00Z",event_type:"CLAIM",status:"EM_VERIFICACAO",observation:"Conferência iniciada"}]}).then(resolve);}};for(const method of ["select","eq","order","limit"])query[method]=()=>query;return query;},async rpc(name,args){if(name==="list_wms_caixa_attendance")return {data:rows};calls.push({name,args});return {data:args.request_key};}};
    mountCaixaRequests(host,{actor:"worker",role:"OPERADOR",warehouse:"VDCG",client,isCurrent:()=>true});
    await setImmediate();
    const cards=()=>host.querySelectorAll("article").filter(row=>row.dataset.requestId);
    const button=prefix=>host.querySelectorAll("button").find(b=>b.textContent?.startsWith(prefix));
    assert.deepEqual(cards().map(x=>x.dataset.requestId),["a"]);
    button("Disponíveis").listeners.click();
    assert.deepEqual(cards().map(x=>x.dataset.requestId),["c"]);
    button("Meus atendimentos").listeners.click();
    assert.deepEqual(cards().map(x=>x.dataset.requestId),["a"]);
    assert.ok(button("Informar resolução"));
    assert.ok(button("Conversar com caixa"));
    const detail=cards()[0].querySelectorAll("details")[0];detail.open=true;detail.listeners.toggle();
    await button("Carregar histórico").listeners.click();
    rows=rows.map(row=>row.id==="a"?{...row,notes:"Conferir novamente"}:row);
    await button("Atualizar").listeners.click();
    assert.equal(cards()[0].querySelectorAll("details")[0].open,true);
    button("Aguardando caixa").listeners.click();
    assert.deepEqual(cards().map(x=>x.dataset.requestId),["b"]);
    assert.ok(!button("Passou / deu certo")); // Somente caixa pode confirmar.
    await poll(); await setImmediate();
    assert.equal(calls.length,0);
  } finally {globalThis.document=previous;globalThis.setInterval=previousInterval;}
});

test("claimed stock operator can exchange messages bound to request without changing stock",async()=>{
  const previous=globalThis.document;
  globalThis.document={createElement:tag=>new Element(tag)};
  try {
    const host=new Element("main");host.root=true;
    const calls=[];
    const request={id:"req-a",sku:"48060",kind:"ADJUSTMENT",warehouse_code:"VDCG",quantity:2,status:"EM_VERIFICACAO",claimed_by:"worker",requested_by:"cashier",created_at:new Date().toISOString()};
    const client={from(table){
      const query={then(resolve){return Promise.resolve({data:table==="wms_caixa_requests"?[request]:[]}).then(resolve);}};
      for(const method of ["select","eq","order","limit"])query[method]=()=>query;
      return query;
    },async rpc(name,args){if(name==="list_wms_caixa_attendance")return {data:[request]};calls.push({name,args});return {data:1};}};
    mountCaixaRequests(host,{actor:"worker",role:"OPERADOR",warehouse:"VDCG",client,isCurrent:()=>true});await setImmediate();
    const button=prefix=>host.querySelectorAll("button").find(b=>b.textContent?.startsWith(prefix));
    button("Meus atendimentos").listeners.click();
    await button("Conversar com caixa").listeners.click();await setImmediate();
    const chatForm=host.querySelectorAll("form").find(f=>f.className==="ca-chat-form");
    const input=chatForm.querySelectorAll("textarea")[0];input.value="Pode testar novamente?";
    await chatForm.listeners.submit({preventDefault(){}});await setImmediate();
    assert.equal(calls.length,1);
    assert.equal(calls[0].name,"send_wms_caixa_message");
    assert.equal(calls[0].args.request_key,"req-a");
    assert.equal(calls[0].args.body,"Pode testar novamente?");
  } finally {globalThis.document=previous;}
});

test("cashier sees confirmation and return actions while completed adjustments have no fulfillment action",async()=>{
  const previous=globalThis.document;
  globalThis.document={createElement:tag=>new Element(tag)};
  try {
    const host=new Element("main");host.root=true;
    const row={id:"a",sku:"48060",kind:"ADJUSTMENT",warehouse_code:"VDCG",requested_by:"c1",quantity:5,status:"AGUARDANDO_CONFIRMACAO_CAIXA",created_at:new Date().toISOString()};
    const client={from(){const query={then(resolve){return Promise.resolve({data:[row]}).then(resolve);}};for(const method of ["select","eq","order","limit"])query[method]=()=>query;return query;},async rpc(){return {data:[row]};}};
    mountCaixaRequests(host,{actor:"c1",role:"CAIXA",warehouse:"VDCG",client,isCurrent:()=>true});await setImmediate();
    const labels=host.querySelectorAll("button").map(button=>button.textContent);
    assert.equal(labels.filter(label=>label==="Passou").length,1);assert.equal(labels.filter(label=>label==="Não passou").length,1);assert.ok(!labels.includes("Assumir atendimento"));
    assert.ok(!host.querySelectorAll("article").filter(row=>row.dataset.requestId).some(row=>row.querySelectorAll("button").some(button=>["Passou","Não passou","Conversar"].includes(button.textContent))));
  } finally {globalThis.document=previous;}
});

test("cashier receives existing unread messages before opening chat and the alert clears only after reading",async()=>{
  const previous=globalThis.document;globalThis.document={createElement:tag=>new Element(tag)};
  try {
    const host=new Element("main");host.root=true;const alerts=[];let screenOpened=0;
    const values=new Map();const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
    const request={id:"a",sku:"48060",kind:"ADJUSTMENT",warehouse_code:"VDCG",quantity:2,requested_by:"cashier",status:"AGUARDANDO_CONFIRMACAO_CAIXA",created_at:new Date().toISOString()};
    const messages=[1,2].map(id=>({id,request_id:"a",sender_id:"stock",body:"Pode testar?",created_at:new Date().toISOString()}));
    const client={async rpc(){return {data:[request]};},from(){const query={then(resolve){return Promise.resolve({data:messages}).then(resolve);}};for(const method of ["select","eq","order","limit"])query[method]=()=>query;return query;}};
    mountCaixaRequests(host,{actor:"cashier",role:"CAIXA",warehouse:"VDCG",client,storage,isCurrent:()=>true,onUnreadMessages:info=>alerts.push(info),openRequestsScreen:async()=>{screenOpened++;}});
    await setImmediate();assert.equal(alerts.at(-1).count,2);
    assert.ok(host.querySelectorAll("button").some(button=>button.textContent==="Conversar (2 não lidas)"));
    await alerts.at(-1).open();assert.equal(screenOpened,1);assert.equal(alerts.at(-1).count,0);
    const reopened=new Element("main");reopened.root=true;const next=[];
    mountCaixaRequests(reopened,{actor:"cashier",role:"CAIXA",warehouse:"VDCG",client,storage,isCurrent:()=>true,onUnreadMessages:info=>next.push(info)});
    await setImmediate();assert.equal(next.at(-1).count,0);
  } finally {globalThis.document=previous;}
});

test("cashier adjustment panel excludes closed, foreign-stock and other-cashier records and preserves equal-SKU requests",async()=>{
  const previous=globalThis.document;globalThis.document={createElement:tag=>new Element(tag)};
  try {
    const host=new Element("main");host.root=true;
    const base={sku:"48060",kind:"ADJUSTMENT",warehouse_code:"VDCG",quantity:2,requested_by:"cashier",status:"PENDENTE",created_at:new Date().toISOString()};
    const rows=[{...base,id:"a"},{...base,id:"b",quantity:5,status:"AGUARDANDO_CONFIRMACAO_CAIXA"},{...base,id:"closed",status:"CONCLUIDO",confirmed_at:new Date().toISOString()},{...base,id:"foreign",warehouse_code:"VDAR"},{...base,id:"other",requested_by:"other-cashier"},{...base,id:"product",kind:"PRODUCT"}];
    const client={async rpc(name){return name==="lookup_wms_caixa_item"?{data:{found:true,name:"Produto de teste",captureAvailable:4}}:{data:rows};},from(){const query={then(resolve){return Promise.resolve({data:[]}).then(resolve);}};for(const method of ["select","eq","order","limit"])query[method]=()=>query;return query;}};
    mountCaixaRequests(host,{actor:"cashier",role:"CAIXA",warehouse:"VDCG",client,isCurrent:()=>true});await setImmediate();
    const pending=host.querySelectorAll("article").filter(article=>article.dataset.pendingId);
    assert.deepEqual(pending.map(article=>article.dataset.pendingId),["a","b"]);
    const tracking=host.querySelectorAll("details").find(details=>details.className==="ca-cashier-tracking");assert.ok(!tracking.open);
    pending[1].querySelectorAll("button").find(button=>button.textContent==="Ver detalhes").listeners.click();assert.equal(tracking.open,true);
    assert.ok(host.querySelectorAll("article").some(article=>article.dataset.requestId==="b"));
  } finally {globalThis.document=previous;}
});

test("side actions confirm and reopen the exact equal-SKU request, preserve drafts on polling and keep composer intact",async()=>{
  const previous=globalThis.document, interval=globalThis.setInterval;let poll;
  globalThis.document={createElement:tag=>new Element(tag)};globalThis.setInterval=fn=>{poll=fn;return {unref(){}};};
  try {
    const host=new Element("main");host.root=true;const calls=[];
    const base={sku:"48060",kind:"ADJUSTMENT",warehouse_code:"VDCG",requested_by:"cashier",quantity:2,status:"AGUARDANDO_CONFIRMACAO_CAIXA",claimed_by:"stock",claimed_by_name:"Equipe",resolution_notes:"Resolvido",resolved_at:new Date().toISOString(),created_at:new Date().toISOString()};
    let rows=[{...base,id:"a"},{...base,id:"b",quantity:5}];
    const client={from(){const query={then:resolve=>Promise.resolve({data:[]}).then(resolve)};for(const method of ["select","eq","order","limit"])query[method]=()=>query;return query;},async rpc(name,args){
      if(name==="list_wms_caixa_attendance")return {data:rows.map(row=>({...row}))};
      if(name==="lookup_wms_caixa_item")return {data:{found:true,name:"Produto",sku:args.product_code}};
      calls.push({name,args});rows=rows.map(row=>row.id!==args.request_key?row:{...row,status:args.operation==="CONFIRM"?"CONCLUIDO":"EM_VERIFICACAO",confirmed_at:args.operation==="CONFIRM"?new Date().toISOString():null,resolved_at:args.operation==="REOPEN"?null:row.resolved_at});return {data:args.request_key};
    }};
    mountCaixaRequests(host,{actor:"cashier",role:"CAIXA",warehouse:"VDCG",client,isCurrent:()=>true});await setImmediate();
    const card=id=>host.querySelectorAll("article").find(row=>row.dataset.pendingId===id);
    const button=(row,label)=>row.querySelectorAll("button").find(button=>button.textContent===label);
    const composer=host.querySelectorAll("fieldset")[0],code=composer.querySelectorAll("input")[0];code.value="00123";
    button(card("b"),"Não passou").click();let form=card("b").querySelectorAll("form")[0],input=form.querySelectorAll("textarea")[0];
    input.value="x";await form.listeners.submit({preventDefault(){}});assert.equal(calls.length,0);
    input.value="Ainda não entrou";input.listeners.input();input.focus();
    rows=rows.map(row=>row.id==="a"?{...row,claimed_by_name:"Nome atualizado"}:row);await poll();
    assert.equal(card("b").querySelectorAll("textarea")[0],input);assert.equal(input.value,"Ainda não entrou");assert.equal(form.hidden,false);assert.equal(code.value,"00123");
    await form.listeners.submit({preventDefault(){}});
    assert.deepEqual(calls[0],{name:"act_wms_caixa_adjustment",args:{request_key:"b",operation:"REOPEN",observation:"Ainda não entrou"}});
    assert.ok(card("b").querySelectorAll("small").some(node=>node.textContent==="DEVOLVIDO PARA CORREÇÃO"));assert.ok(!button(card("b"),"Passou"));
    await button(card("a"),"Passou").click();assert.equal(calls[1].args.request_key,"a");assert.equal(calls[1].args.operation,"CONFIRM");assert.ok(!card("a"));
    assert.ok(host.querySelectorAll("strong").some(node=>node.textContent==="48060 · 2 un."));
    button(host,"+ Novo ajuste").click();assert.equal(code.value,"00123");assert.equal(globalThis.document.activeElement,code);
    assert.equal(composer.querySelectorAll("button").find(button=>button.dataset.requestKind==="ADJUSTMENT").attributes["aria-pressed"],"true");
  } finally {globalThis.document=previous;globalThis.setInterval=interval;}
});

test("two cashier sessions observe stock progress and confirmation through existing polling without clearing a new request",async()=>{
  const previous=globalThis.document, interval=globalThis.setInterval;const polls=[];
  globalThis.document={createElement:tag=>new Element(tag)};globalThis.setInterval=fn=>{polls.push(fn);return {unref(){}};};
  try {
    let request={id:"a",sku:"48060",kind:"ADJUSTMENT",warehouse_code:"VDCG",requested_by:"cashier",quantity:2,status:"EM_VERIFICACAO",created_at:new Date().toISOString()};
    const client={from(){const query={then:resolve=>Promise.resolve({data:[]}).then(resolve)};for(const method of ["select","eq","order","limit"])query[method]=()=>query;return query;},async rpc(name,args){
      if(name==="lookup_wms_caixa_item")return {data:{found:true,name:"Produto",sku:args.product_code}};
      if(name==="act_wms_caixa_adjustment")request={...request,status:"CONCLUIDO",confirmed_at:new Date().toISOString()};
      return {data:name==="list_wms_caixa_attendance"?[{...request}]:request.id};
    }};
    const hosts=[new Element("main"),new Element("main")];for(const host of hosts){host.root=true;mountCaixaRequests(host,{actor:"cashier",role:"CAIXA",warehouse:"VDCG",client,isCurrent:()=>true});}await setImmediate();
    const pending=host=>host.querySelectorAll("article").find(row=>row.dataset.pendingId==="a");
    const text=host=>host.querySelectorAll("small").map(node=>node.textContent);
    assert.ok(text(pending(hosts[0])).includes("AGUARDANDO ESTOQUE"));assert.ok(!pending(hosts[0]).querySelectorAll("button").some(node=>node.textContent==="Passou"));
    const code=hosts[1].querySelectorAll("fieldset")[0].querySelectorAll("input")[0];code.value="00123";
    request={...request,claimed_by:"stock",claimed_by_name:"Responsável"};for(const poll of polls)await poll();
    assert.ok(text(pending(hosts[1])).includes("EM ATENDIMENTO"));assert.equal(code.value,"00123");
    request={...request,status:"AGUARDANDO_CONFIRMACAO_CAIXA",resolution_notes:"Pronto",resolved_at:new Date().toISOString()};for(const poll of polls)await poll();
    assert.ok(text(pending(hosts[1])).includes("AGUARDANDO CAIXA"));
    await pending(hosts[0]).querySelectorAll("button").find(node=>node.textContent==="Passou").click();await polls[1]();
    assert.ok(!pending(hosts[0]));assert.ok(!pending(hosts[1]));assert.equal(code.value,"00123");
  } finally {globalThis.document=previous;globalThis.setInterval=interval;}
});

test("side conversation stays bound to the selected request when two adjustments share a SKU",async()=>{
  const previous=globalThis.document;globalThis.document={createElement:tag=>new Element(tag)};
  try {
    const host=new Element("main");host.root=true;const calls=[];
    const base={sku:"48060",kind:"ADJUSTMENT",warehouse_code:"VDCG",requested_by:"cashier",quantity:2,status:"EM_VERIFICACAO",claimed_by:"stock",created_at:new Date().toISOString()};
    const client={from(){const query={then:resolve=>Promise.resolve({data:[]}).then(resolve)};for(const method of ["select","eq","order","limit"])query[method]=()=>query;return query;},async rpc(name,args){
      if(name==="list_wms_caixa_attendance")return {data:[{...base,id:"a"},{...base,id:"b"}]};if(name==="lookup_wms_caixa_item")return {data:{found:true,name:"Produto"}};calls.push({name,args});return {data:1};
    }};
    mountCaixaRequests(host,{actor:"cashier",role:"CAIXA",warehouse:"VDCG",client,isCurrent:()=>true});await setImmediate();
    const card=host.querySelectorAll("article").find(node=>node.dataset.pendingId==="b");await card.querySelectorAll("button").find(node=>node.textContent==="Conversar").click();
    const form=host.querySelectorAll("form").find(node=>node.className==="ca-chat-form");form.querySelectorAll("textarea")[0].value="Pode conferir?";await form.listeners.submit({preventDefault(){}});
    assert.equal(calls[0].name,"send_wms_caixa_message");assert.equal(calls[0].args.request_key,"b");
  } finally {globalThis.document=previous;}
});
