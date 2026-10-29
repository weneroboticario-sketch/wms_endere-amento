import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { mountCaixaRequests } from "../src/caixa-requests.js";

class Element {
  constructor(tag) { this.tag=tag; this.children=[]; this.dataset={}; this.listeners={}; this.value=""; }
  get isConnected() { return this.root || this.parent?.isConnected; }
  append(child) { child.parent=this; this.children.push(child); }
  replaceChildren() { this.children=[]; }
  insertBefore(child,ref) { child.parent=this; this.children.splice(this.children.indexOf(ref),0,child); }
  setAttribute() {}
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
    const inputs=host.querySelectorAll("input"); inputs[0].value="00123"; inputs[1].value="16";
    host.querySelectorAll("select")[0].value="PRODUCT";
    host.querySelectorAll("textarea")[0].value="Cliente aguardando";
    const send=host.querySelectorAll("button").find(button=>button.textContent==="Enviar solicitação");
    await send.listeners.click(); assert.equal(inputs[0].disabled,true);
    await send.listeners.click(); assert.equal(calls.length,2); assert.deepEqual(calls[0],calls[1]);
    assert.equal(calls[0].args.units,16); assert.equal(calls[0].args.product_code,"00123");
    assert.equal(inputs[0].value,""); assert.equal(inputs[0].disabled,false);
    assert.ok(!host.querySelectorAll("button").some(button=>button.textContent==="Encaminhar à verificação"));
  } finally {globalThis.document=previous;}
});
