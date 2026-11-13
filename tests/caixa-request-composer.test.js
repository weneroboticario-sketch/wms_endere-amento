import test from "node:test";
import assert from "node:assert/strict";
import { mountCaixaRequestComposer, DEFAULT_CAIXA_ADJUSTMENT_REASON } from "../src/caixa-request-composer.js";
import { createCaixaProductLookup } from "../src/caixa-product-lookup.js";

class Element {
  constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.listeners={};this.value="";}
  append(child){this.children.push(child);}
  replaceChildren(){this.children=[];}
  setAttribute(name,value){this.attributes||={};this.attributes[name]=value;}
  addEventListener(name,handler){this.listeners[name]=handler;}
  querySelectorAll(tag){return this.children.flatMap(child=>[...(child.tag===tag?[child]:[]),...child.querySelectorAll(tag)]);}
}
const text=element=>[element.textContent||"",...element.children.map(text)].join(" ");
async function fixture(run,read=async()=>({data:{found:true,name:"Produto de teste",captureAvailable:0,storeAvailable:null,updatedAt:"2026-01-01T12:00:00Z"}})){
  const prior=globalThis.document;globalThis.document={createElement:tag=>new Element(tag)};
  try {
    const host=new Element("main"),writes=[];let active=true;
    const lookup=createCaixaProductLookup({client:{rpc:read},warehouse:"VDCG",isCurrent:()=>active});
    mountCaixaRequestComposer(host,{lookup,warehouse:"VDCG",isCurrent:()=>active,rpc:async(name,args)=>{writes.push({name,args});return args.request_key;},onSubmitted:async()=>{}});
    const form=host.children[0],code=form.querySelectorAll("input")[0],quantity=form.querySelectorAll("input")[1];
    const button=label=>form.querySelectorAll("button").find(button=>button.textContent===label);
    await run({host,form,code,quantity,writes,button,deactivate:()=>{active=false;}});
  } finally {globalThis.document=prior;}
}
test("scanner Enter resolves real item without submitting; adjustment uses transparent generic reason and permits quantity above stock",async()=>fixture(async({form,code,quantity,writes,button})=>{
  code.value="00123";let prevented=false;await code.listeners.keydown({key:"Enter",preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(writes.length,0);assert.equal(quantity.value,"1");
  assert.match(text(form),/Produto de teste/);assert.match(text(form),/CAPTAÇÃO: 0 un/);assert.match(text(form),/LOJA: Saldo indisponível/);assert.match(text(form),/mais de 4 horas/);
  button("−").listeners.click();assert.equal(quantity.value,"1");button("+").listeners.click();assert.equal(quantity.value,"2");
  form.querySelectorAll("button").find(button=>button.dataset.requestKind==="ADJUSTMENT").listeners.click();
  const submit=form.querySelectorAll("button").find(button=>button.dataset.requestSubmit);
  assert.equal(submit.disabled,false);assert.match(text(form),/Quantidade acima/);assert.match(text(form),new RegExp(DEFAULT_CAIXA_ADJUSTMENT_REASON));
  await submit.listeners.click();assert.equal(writes.length,1);assert.equal(writes[0].args.product_code,"00123");assert.equal(writes[0].args.units,2);assert.equal(writes[0].args.observation,DEFAULT_CAIXA_ADJUSTMENT_REASON);assert.equal(code.value,"");assert.equal(quantity.value,"1");
}));
test("changing code clears previous description immediately and late replies cannot overwrite the new item",async()=>{
  let finish;
  await fixture(async({form,code})=>{
    code.value="00123";const old=code.listeners.keydown({key:"Enter",preventDefault(){}});
    code.value="48060";code.listeners.input();assert.ok(!text(form).includes("Produto anterior"));
    await code.listeners.keydown({key:"Enter",preventDefault(){}});
    finish({data:{found:true,name:"Produto anterior",captureAvailable:99}});await old;
    assert.match(text(form),/Produto atual/);assert.ok(!text(form).includes("Produto anterior"));
  },(name,args)=>args.product_code==="00123"?new Promise(resolve=>{finish=resolve;}):Promise.resolve({data:{found:true,name:"Produto atual",captureAvailable:4,storeAvailable:2}}));
});
test("missing or failed lookup disables submission, and zero or negative quantities never create requests",async()=>{
  await fixture(async({form,code})=>{
    code.value="48060";await code.listeners.keydown({key:"Enter",preventDefault(){}});
    assert.match(text(form),/Saldo indisponível/);assert.equal(form.querySelectorAll("button").find(button=>button.dataset.requestSubmit).disabled,true);
  },async()=>({error:{message:"offline"}}));
  await fixture(async({form,code,quantity,writes})=>{
    code.value="48060";await code.listeners.keydown({key:"Enter",preventDefault(){}});
    for(const invalid of ["0","-2"]){quantity.value=invalid;await form.querySelectorAll("button").find(button=>button.dataset.requestSubmit).listeners.click();}
    assert.equal(writes.length,0);assert.match(text(form),/quantidade inteira positiva/);
  });
});

test("rapid manual typing is debounced and Enter reuses the lookup rather than sending twice",async()=>{
  const previousSet=globalThis.setTimeout,previousClear=globalThis.clearTimeout;
  const scheduled=new Map();let nextId=0,reads=0;
  globalThis.setTimeout=handler=>{scheduled.set(++nextId,handler);return nextId;};globalThis.clearTimeout=id=>scheduled.delete(id);
  try {
    await fixture(async({code,writes})=>{
      for(const value of ["4","48","480","4806","48060"]){code.value=value;code.listeners.input();}
      assert.equal(scheduled.size,1);assert.equal(reads,0);
      await [...scheduled.values()][0]();
      await code.listeners.keydown({key:"Enter",preventDefault(){}});
      assert.equal(reads,1);assert.equal(writes.length,0);
    },async()=>{reads++;return {data:{found:true,name:"Produto",captureAvailable:4,storeAvailable:2}};});
  } finally {globalThis.setTimeout=previousSet;globalThis.clearTimeout=previousClear;}
});
