import test from "node:test";
import assert from "node:assert/strict";
import { mountCaixaChat } from "../src/caixa-chat.js";

class Element {
  constructor(tag) { this.tag=tag;this.children=[];this.listeners={};this.value="";this.dataset={}; }
  get isConnected() { return this.root || this.parent?.isConnected; }
  append(child) { child.parent=this;this.children.push(child); }
  replaceChildren() { this.children=[]; }
  setAttribute() {}
  addEventListener(name,handler) { this.listeners[name]=handler; }
  querySelectorAll(tag) { return this.children.flatMap(child=>[...(child.tag===tag?[child]:[]),...child.querySelectorAll(tag)]); }
}
const request = (id="a") => ({id,sku:"48060",quantity:2,kind:"ADJUSTMENT",requested_by:"cashier",claimed_by:"worker",warehouse_code:"VDCG",status:"EM_VERIFICACAO"});
async function fixture(run) {
  const previous=globalThis.document;globalThis.document={createElement:tag=>new Element(tag)};
  try {
    const host=new Element("main");host.root=true;
    let active=true;
    const store={messages:[],calls:[],fail:false,delay:null};
    const notices=[],reads=[];
    const client={from(){const filters={};let limit=100;let descending=false;
      const query={eq(key,value){filters[key]=value;return query;},lt(key,value){filters.before=value;return query;},select(){return query;},order(key,options){descending=options.ascending===false;return query;},limit(value){limit=value;return query;},then(resolve){let data=store.messages.filter(message=>message.request_id===filters.request_id && (!filters.before || message.id<filters.before));data=data.sort((a,b)=>descending?b.id-a.id:a.id-b.id).slice(0,limit);return Promise.resolve({data}).then(resolve);}};return query;}};
    const chat=mountCaixaChat({host,context:{actor:"worker",warehouse:"VDCG",role:"OPERADOR",client,isCurrent:()=>active},canChat:row=>row.claimed_by==="worker"&&row.warehouse_code==="VDCG",notify:(key,text)=>notices.push({key,text}),onRead:async(id,rows)=>reads.push({id,rows}),rpc:async(name,args)=>{store.calls.push({name,args:{...args}});if(store.delay)await store.delay;if(store.fail)throw new Error("Resposta perdida");return 1;}});
    const form=host.querySelectorAll("form")[0],input=form.querySelectorAll("textarea")[0];
    const button=label=>host.querySelectorAll("button").find(item=>item.textContent===label);
    await run({host,chat,store,notices,reads,form,input,button,deactivate:()=>{active=false;}});
  } finally {globalThis.document=previous;}
}
test("chat loads newest messages, paginates older history and preserves a typed reply while receiving",async()=>fixture(async({chat,store,input,button,notices,host})=>{
  store.messages=Array.from({length:150},(_,i)=>({id:i+1,request_id:"a",sender_id:"cashier",sender_name:"Caixa de teste",body:`Mensagem ${i+1}`,created_at:"2026-10-29T15:00:00Z"}));
  await chat.open(request());
  let bodies=host.querySelectorAll("article").map(article=>article.querySelectorAll("p")[0].textContent);
  assert.equal(bodies.length,100);assert.equal(bodies[0],"Mensagem 51");assert.equal(bodies.at(-1),"Mensagem 150");
  await button("Carregar mensagens anteriores").listeners.click();
  assert.equal(host.querySelectorAll("article").length,150);
  input.value="Ainda estou digitando";input.listeners.input();
  store.messages.push({id:151,request_id:"a",sender_id:"cashier",body:"Pode conferir?",created_at:"2026-10-29T15:01:00Z"});
  await chat.poll();await chat.poll();
  assert.equal(input.value,"Ainda estou digitando");assert.equal(host.querySelectorAll("article").length,151);assert.equal(notices.length,0);
}));
test("unknown send response freezes the exact UUID and body across close, another request and retry",async()=>fixture(async({chat,store,form,input,button})=>{
  await chat.open(request());input.value="Ajuste realizado";input.listeners.input();store.fail=true;
  await form.listeners.submit({preventDefault(){}});const first=store.calls[0];assert.equal(input.disabled,true);
  button("Fechar").listeners.click();await chat.open(request("b"));assert.equal(input.value,"");assert.equal(input.disabled,false);
  input.value="Mensagem para o outro pedido";input.listeners.input();store.fail=false;await form.listeners.submit({preventDefault(){}});
  assert.equal(store.calls[1].args.request_key,"b");
  await chat.open(request());assert.equal(input.value,"Ajuste realizado");assert.equal(input.disabled,true);
  await form.listeners.submit({preventDefault(){}});assert.deepEqual(store.calls[2],first);assert.equal(input.value,"");assert.equal(input.disabled,false);
}));
test("scope changes discard conversation state and cannot clear or expose another user's response",async()=>fixture(async({chat,store,input,form,deactivate,host})=>{
  await chat.open(request());input.value="Mensagem reservada";input.listeners.input();
  let finish;store.delay=new Promise(resolve=>{finish=resolve;});
  const sending=form.listeners.submit({preventDefault(){}});
  deactivate();await chat.poll();finish();await sending;
  assert.equal(input.value,"");assert.equal(host.querySelectorAll("aside")[0].hidden,true);assert.equal(host.querySelectorAll("article").length,0);
}));
test("revoked ownership closes the chat and closed requests keep read-only history",async()=>fixture(async({chat,input,host})=>{
  await chat.open(request());chat.reconcile([{...request(),confirmed_at:"2026-10-29T15:00:00Z",status:"CONCLUIDO"}]);
  assert.equal(input.disabled,true);assert.equal(host.querySelectorAll("aside")[0].hidden,false);
  chat.reconcile([{...request(),claimed_by:"another-worker"}]);assert.equal(host.querySelectorAll("aside")[0].hidden,true);
}));

test("only visible bubbles advance read state; hidden tabs and scrolled-away new messages remain unread",async()=>fixture(async({chat,store,host,reads})=>{
 globalThis.document.visibilityState='visible';
 Element.prototype.getBoundingClientRect=function(){return this.className==='ca-chat-messages'?{top:0,bottom:100,height:100}:this.dataset.messageId==='2'?{top:200,bottom:240,height:40}:{top:10,bottom:50,height:40};};
 try{store.messages=[{id:1,request_id:'a',sender_id:'cashier',body:'Visível',created_at:new Date().toISOString()}];await chat.open(request());assert.deepEqual(reads.map(r=>r.rows.map(m=>m.id)),[[1]]);
 store.messages.push({id:2,request_id:'a',sender_id:'cashier',body:'Fora da área visível',created_at:new Date().toISOString()});await chat.poll();assert.equal(reads.length,1);
 globalThis.document.visibilityState='hidden';await chat.poll();assert.equal(reads.length,1);
 globalThis.document.visibilityState='visible';Element.prototype.getBoundingClientRect=function(){return {top:0,bottom:100,height:100};};await host.querySelectorAll('div').find(d=>d.className==='ca-chat-messages').listeners.scroll();await Promise.resolve();assert.deepEqual(reads.at(-1).rows.map(m=>m.id),[1,2]);
 }finally{delete Element.prototype.getBoundingClientRect;}
}));
