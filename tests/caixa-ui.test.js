import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { mountCaixaRequests } from "../src/caixa-requests.js";

class Element {
  constructor(tag) { this.tag=tag; this.children=[]; this.dataset={}; this.listeners={}; this.value=""; }
  get isConnected() { return this.root || this.parent?.isConnected; }
  append(child) { child.parent=this; this.children.push(child); }
  replaceChildren() { this.children=[]; }
  insertBefore(child,ref) { if(child.parent) child.parent.children=child.parent.children.filter(node=>node!==child); child.parent=this; this.children.splice(this.children.indexOf(ref),0,child); }
  setAttribute(name,value) { this.attributes ||= {}; this.attributes[name]=value; }
  contains(target) { return this===target || this.children.some(child=>child.contains(target)); }
  scrollIntoView() {}
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
      async rpc(name,args) {calls.push({name,args}); return calls.length===1?{error:{message:"Resposta perdida"}}:{data:args.request_key};}
    };
    mountCaixaRequests(host,{actor:"c1",role:"CAIXA",warehouse:"VDCG",client,isCurrent:()=>true});
    await setImmediate();
    const form=host.querySelectorAll("fieldset")[0];
    const inputs=form.querySelectorAll("input"); inputs[0].value="00123"; inputs[1].value="16";
    form.querySelectorAll("select")[0].value="PRODUCT";
    form.querySelectorAll("textarea")[0].value="Cliente aguardando";
    const send=host.querySelectorAll("button").find(button=>button.textContent==="Enviar solicitação");
    await send.listeners.click(); assert.equal(inputs[0].disabled,true);
    await send.listeners.click(); assert.equal(calls.length,2); assert.deepEqual(calls[0],calls[1]);
    assert.equal(calls[0].args.units,16); assert.equal(calls[0].args.product_code,"00123");
    assert.equal(inputs[0].value,""); assert.equal(inputs[0].disabled,false);
    const adjustment=host.querySelectorAll("button").find(button=>button.textContent==="Solicitar ajuste");
    assert.ok(adjustment);
    adjustment.listeners.click();
    assert.equal(form.querySelectorAll("select")[0].value,"ADJUSTMENT");
    inputs[0].value="94133"; inputs[1].value="2";
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
    const client={from(table){const query={then(resolve){return Promise.resolve({data:table==="wms_caixa_requests"?rows:[{created_at:"2026-10-29T14:00:00Z",event_type:"CLAIM",status:"EM_VERIFICACAO",observation:"Conferência iniciada"}]}).then(resolve);}};for(const method of ["select","eq","order","limit"])query[method]=()=>query;return query;},async rpc(name,args){calls.push({name,args});return {data:args.request_key};}};
    mountCaixaRequests(host,{actor:"worker",role:"OPERADOR",warehouse:"VDCG",client,isCurrent:()=>true});
    await setImmediate();
    const cards=()=>host.querySelectorAll("article").filter(row=>row.dataset.requestId);
    const button=prefix=>host.querySelectorAll("button").find(b=>b.textContent?.startsWith(prefix));
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
    },async rpc(name,args){calls.push({name,args});return {data:1};}};
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
    const row={id:"a",sku:"48060",kind:"ADJUSTMENT",quantity:5,status:"AGUARDANDO_CONFIRMACAO_CAIXA",created_at:new Date().toISOString()};
    const client={from(){const query={then(resolve){return Promise.resolve({data:[row]}).then(resolve);}};for(const method of ["select","eq","order","limit"])query[method]=()=>query;return query;}};
    mountCaixaRequests(host,{actor:"c1",role:"CAIXA",warehouse:"VDCG",client,isCurrent:()=>true});await setImmediate();
    const labels=host.querySelectorAll("button").map(button=>button.textContent);
    assert.ok(labels.includes("Passou / deu certo"));assert.ok(labels.includes("Não passou"));assert.ok(!labels.includes("Assumir atendimento"));
  } finally {globalThis.document=previous;}
});
