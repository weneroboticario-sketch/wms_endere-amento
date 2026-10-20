import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source=await readFile(new URL("../script.js",import.meta.url),"utf8");
const address="R01-RK01-L01-A",otherAddress="R02-RK01-L01-A";
const now="2026-10-20T13:00:00Z";
const key=value=>String(value||"").trim().replace(/^0+(?=\d)/,"");

export function harness(bindings=[],templates=[{locationCode:address,area:2}],script=source){
  const calls={fetches:0,templates:0,splits:0,yields:0,upserts:[],deletes:[],progress:[],cache:[]};
  let serial=0;
  const split=value=>{calls.splits++;return [...new Set(String(value||"").split(";").filter(Boolean))];};
  const state={bindings:[],products:[]};
  const api=vm.createContext({
    Map,Promise,state,
    normalizeSku:value=>String(value||"").trim(),normalizeSkuKey:key,normalizeText:value=>String(value||"").trim(),
    normalizeWarehouseCode:value=>String(value).toUpperCase(),warehouseIdForCode:value=>value,
    normalizeLocation:code=>({valid:!!code,code,rua:code===otherAddress?2:1,rack:1,linha:1,letra:"A"}),
    locationKeyFromCode:value=>value,locationKeyFromBinding:value=>value.locationCode,
    bindingMatchesWarehouseCode:(binding,warehouse)=>binding.warehouseCode===warehouse,
    splitSkuValues:split,fromDbBinding:row=>({...row}),toDbBinding:row=>({...row}),
    fetchWarehouseRows:async()=>{calls.fetches++;return bindings;},
    buildLinhaSeparacaoTemplateRows:()=>{calls.templates++;return templates;},
    getAreaByCode:code=>[1,2].includes(Number(code))?{name:"Area "+code}:null,
    sortByDateDesc:(a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt),findProductName:()=>"",
    createBinding:(sku,parsed,areaCode,productName)=>({id:"new-"+(++serial),sku,...parsed,locationCode:parsed.code,areaCode,productName,warehouseCode:"VDCG"}),
    deleteBindingsByIds:async ids=>calls.deletes.push(...ids),
    runSupabaseRequestWithRetry:async(_name,request)=>request(),
    supabaseDb:{rpc:async(_name,payload)=>{calls.upserts.push(...payload.p_rows);return {data:payload.p_rows,error:null};}},
    expandBindingsWithMultipleSkus:rows=>rows.flatMap(row=>split(row.sku).map(sku=>({...row,sku}))),
    writeModuleCacheForWarehouse:async(...args)=>calls.cache.push(args),unique:rows=>[...new Set(rows)],
    setStatus:(_id,message)=>calls.progress.push(message),
    window:{setTimeout:callback=>{calls.yields++;callback();}}
  });
  for(const name of ["stockImportOfficialLocationPlans","importedLocationAreaCode","syncBindingsFromLocatedStockImport"]){
    const body=script.match(new RegExp("  (?:async )?function "+name+"\\([^]*?\\n  }"))?.[0];
    assert.ok(body,name);vm.runInContext(body,api);
  }
  return {api,calls,state,run:rows=>api.syncBindingsFromLocatedStockImport("CAPTACAO",rows,"VDCG",now)};
}

const binding=(id,sku,locationCode=address,extra={})=>({id,sku,locationCode,warehouseCode:"VDCG",areaCode:2,areaName:"Area 2",rua:locationCode===otherAddress?2:1,rack:1,linha:1,letra:"A",productName:"Produto",updatedAt:now,...extra});
const row=(sku,locationCode=address)=>({codigoMaterial:sku,codigoEndereco:locationCode,nomeMaterial:"Produto"});

test("unchanged large import uses indexed lookups and constructs the address map once",async()=>{
  const count=32429,bindings=Array.from({length:count},(_,i)=>binding("id-"+i,String(i+1)));
  const h=harness(bindings);
  const result=await h.run(bindings.map(item=>row(item.sku)));
  assert.equal(result.created,0);assert.equal(result.synced,0);assert.equal(result.duplicatesRemoved,0);
  assert.equal(h.calls.templates,1);assert.equal(h.calls.fetches,1);assert.equal(h.calls.upserts.length,0);
  assert.equal(h.state.bindings.length,count);
  assert.ok(h.calls.splits<count*8,"SKU parsing must remain linear rather than scanning all bindings for every row");
  assert.equal(h.calls.yields,Math.floor(count/250));assert.equal(h.calls.progress.length,h.calls.yields);
});

test("preserves a second address and other warehouses while deleting only an exact duplicate",async()=>{
  const h=harness([
    binding("old","001",address,{updatedAt:"2026-10-19T00:00:00Z"}),binding("new","1"),
    binding("second-address","1",otherAddress),binding("other-warehouse","1",address,{warehouseCode:"VDAR"})
  ]);
  const result=await h.run([row("1")]);
  assert.equal(result.duplicatesRemoved,1);assert.deepEqual(h.calls.deletes,["old"]);
  assert.deepEqual(h.state.bindings.map(item=>item.id).sort(),["new","second-address"]);
  assert.equal(h.calls.upserts.length,0);
});

test("updates the index when a shared binding is split across successive plans",async()=>{
  const h=harness([binding("shared","1;2;3")]);
  const result=await h.run([row("1"),row("2")]);
  assert.equal(result.created,2);
  assert.equal(h.state.bindings.find(item=>item.id==="shared").sku,"3");
  assert.equal(h.calls.upserts.filter(item=>item.id==="shared").length,1);
  assert.equal(h.calls.upserts.find(item=>item.id==="shared").sku,"3");
  assert.deepEqual(h.state.bindings.map(item=>item.sku).sort(),["1","2","3"]);
});

test("keeps stable ordering for equal dates and the first matching template area",async()=>{
  const h=harness([binding("first","1"),binding("second","01")],[{locationCode:address,area:2},{locationCode:address,area:1}]);
  const result=await h.run([row("1")]);
  assert.equal(result.duplicatesRemoved,1);assert.deepEqual(h.calls.deletes,["second"]);
  assert.equal(h.state.bindings[0].areaCode,2);
});

test("keeps both imported locations and skips reconciliation for non-capture imports",async()=>{
  const h=harness([binding("original","1")]);
  assert.equal((await h.run([row("1"),row("1",otherAddress)])).created,1);
  assert.equal(h.state.bindings.length,2);
  assert.deepEqual(h.state.bindings.map(item=>item.locationCode).sort(),[address,otherAddress]);
  const loja=harness();await loja.api.syncBindingsFromLocatedStockImport("LOJA",[row("1")],"VDCG",now);
  assert.equal(loja.calls.fetches,0);assert.equal(loja.calls.templates,0);assert.equal(loja.calls.upserts.length,0);
});

test("missing template uses the existing area while an invalid area falls back to one",async()=>{
  const h=harness([binding("existing","1",otherAddress)],[]);
  await h.run([row("1",otherAddress)]);
  assert.equal(h.state.bindings[0].areaCode,2);
  const invalid=harness([],[{locationCode:address,area:999}]);await invalid.run([row("2")]);
  assert.equal(invalid.calls.upserts[0].areaCode,1);
});
