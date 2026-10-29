import test from "node:test";
import assert from "node:assert/strict";
import { createCaixaProductLookup } from "../src/caixa-product-lookup.js";

test("lookup preserves leading zeros and warehouse, shares in-flight reads and never invents an EAN mapping",async()=>{
  const calls=[];let complete;
  const lookup=createCaixaProductLookup({warehouse:"VDCG",isCurrent:()=>true,client:{rpc(name,args){calls.push({name,args});return new Promise(resolve=>{complete=resolve;});}}});
  const first=lookup.lookup("00123"),second=lookup.lookup("00123");
  assert.equal(calls.length,1);complete({data:{found:true,name:"Produto",captureAvailable:0,storeAvailable:null}});
  const result=await first;assert.deepEqual(result,await second);assert.equal(result.item.sku,"00123");assert.equal(result.item.captureAvailable,0);assert.equal(result.item.storeAvailable,null);
  assert.deepEqual(calls[0],{name:"lookup_wms_caixa_item",args:{code:"VDCG",product_code:"00123"}});
  assert.equal((await lookup.lookup("7891234567890")).state,"unsupported");assert.equal(calls.length,1);
});
test("connection failure is not cached as zero stock, missing SKU is explicit and scope changes invalidate the response",async()=>{
  let attempt=0,active=true;
  const lookup=createCaixaProductLookup({warehouse:"VDAR",isCurrent:()=>active,client:{async rpc(){attempt++;return attempt===1?{error:{message:"offline"}}:{data:{found:false}};}}});
  assert.equal((await lookup.lookup("48060")).state,"error");assert.equal((await lookup.lookup("48060")).state,"missing");assert.equal(attempt,2);
  active=false;assert.equal((await lookup.lookup("48060")).state,"stale");
});
