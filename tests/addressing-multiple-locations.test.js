import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
const source=await readFile(new URL("../script.js",import.meta.url),"utf8");
function fixture(decision,already=false){
  const bindings=[{id:"old",sku:"00178",locationCode:"OLD",areaCode:1}];
  if(already)bindings.push({id:"target",sku:"00178",locationCode:"NEW",areaCode:1});
  const writes=[],deletes=[];
  const state={bindings,history:[]};
  const api=vm.createContext({
    state,Date,Boolean,window:{confirm:()=>true},normalizeSku:v=>v,normalizeSkuKey:v=>v,
    normalizeLocation:code=>({valid:true,code}),unique:xs=>[...new Set(xs)],
    findBySku:sku=>state.bindings.filter(b=>b.sku===sku),
    findByLocation:code=>state.bindings.filter(b=>b.locationCode===code),
    fetchLocationOccupantsForAllocation:async code=>({ok:true,occupants:state.bindings.filter(b=>b.locationCode===code)}),
    locationExistsInMaster:()=>true,isSameSku:(a,b)=>a===b,
    askSkuMoveDecision:async()=>decision,renderScanResults:()=>{},clearScanFieldsForNext:()=>{},
    prepareAnotherLocationScan:()=>{},renderAll:()=>{},setScanMessage:()=>{},
    createBinding:(sku,parsed)=>({id:"new",sku,locationCode:parsed.code,areaCode:1}),
    getAreaByCode:()=>({name:"Area"}),findProductName:()=>"",
    createHistoryItem:()=>({}),buildAddressingOccupantSnapshot:()=>[],
    persistAllocationChange:async(b,ids)=>{writes.push({b,ids});return{ok:true};},
    removeAddressingBindingsForUniqueSku:async rows=>{deletes.push(...rows.map(r=>r.id));state.bindings=state.bindings.filter(b=>!rows.some(r=>r.id===b.id));return{ok:true};}
  });
  vm.runInContext(source.match(/  async function allocateSkuToLocation\([\s\S]*?\n  }/)[0],api);
  return{api,writes,deletes,state};
}
test("keeping multiple addresses adds without moving or deleting the previous one",async()=>{
  const f=fixture("keep");const result=await f.api.allocateSkuToLocation("00178",{code:"NEW"},1);
  assert.equal(result.ok,true);assert.equal(f.writes.length,1);assert.equal(f.writes[0].ids.length,0);
  assert.equal(f.state.bindings.length,2);assert.equal(f.state.bindings[0].locationCode,"OLD");
});
test("existing duplicate can stay unchanged and removing requires explicit move",async()=>{
  const keep=fixture("keep",true);assert.equal((await keep.api.allocateSkuToLocation("00178",{code:"NEW"},1)).ok,true);
  assert.equal(keep.state.bindings.length,2);assert.equal(keep.deletes.length,0);assert.equal(keep.writes.length,0);
  const move=fixture("move",true);assert.equal((await move.api.allocateSkuToLocation("00178",{code:"NEW"},1)).ok,true);
  assert.deepEqual(move.deletes,["old"]);assert.equal(move.state.bindings.length,1);
});
test("cancel does not create or remove any address",async()=>{
  const f=fixture("cancel");assert.equal((await f.api.allocateSkuToLocation("00178",{code:"NEW"},1)).ok,false);
  assert.equal(f.writes.length,0);assert.equal(f.deletes.length,0);assert.equal(f.state.bindings.length,1);
});
test("import plans preserve every SKU and location pair",()=>{
  const api=vm.createContext({normalizeSku:v=>v,normalizeSkuKey:v=>v,normalizeLocation:code=>({valid:true,code})});
  vm.runInContext(source.match(/  function stockImportOfficialLocationPlans\([\s\S]*?\n  }/)[0],api);
  const plans=api.stockImportOfficialLocationPlans([{codigoMaterial:"00178",codigoEndereco:"A"},{codigoMaterial:"00178",codigoEndereco:"B"}]);
  assert.equal(plans.length,2);assert.equal(plans[0].locationCode,"A");assert.equal(plans[1].locationCode,"B");
  const sync=source.match(/  async function syncBindingsFromLocatedStockImport\([\s\S]*?\n  }/)[0];
  assert.match(sync,/locationKeyFromBinding\(binding\) !== plan.locationCode/);
  assert.doesNotMatch(sync,/officialMatches\[0\] \|\| simpleMatches/);
});
