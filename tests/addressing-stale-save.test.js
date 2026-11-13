import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../script.js',import.meta.url),'utf8');
function load(c,names){for(const name of names){const body=source.match(new RegExp('  (?:async )?function '+name+'\\([^]*?\\n  }'))?.[0];assert.ok(body,name);vm.runInContext(body,c);}}
test('a stale session saving history cannot restore removed bindings or overwrite a replacement',async()=>{
 const writes=[],remote=new Map([['new',{id:'new',sku:'88694'}]]);
 const state={bindings:[{id:'old',sku:'88688',locationCode:'R03-RK01-L01-D'}],history:[{id:'h'}],products:{}};
 const c=vm.createContext({state,historySchemaAvailable:true,productsDirty:false,isSupabaseReady:()=>true,canUseNetwork:()=>true,
  upsertInChunks:async(table,rows)=>{writes.push({table,rows});if(table==='wms_bindings')rows.forEach(r=>remote.set(r.id,r));},
  toDbHistory:r=>r,writeModuleCache:async()=>{},updateSupabaseStatus:()=>{},showToast:()=>{},formatSupabaseError:e=>e.message,console});
 load(c,['saveData']);assert.equal(await c.saveData(),true);
 assert.equal(writes.length,1);assert.equal(writes[0].table,'wms_history');assert.equal(remote.has('old'),false);assert.equal(remote.get('new').sku,'88694');
 state.history=[];assert.equal(await c.saveData(),true);assert.equal(writes.length,1);
});
test('explicit sample writes persist only the supplied new bindings, never cached addresses',async()=>{
 const writes=[],state={bindings:[{id:'stale',sku:'88688'}],history:[],products:{}};
 const c=vm.createContext({state,historySchemaAvailable:true,productsDirty:false,isSupabaseReady:()=>true,canUseNetwork:()=>true,
  dedupeBindingsForSave:r=>r,toDbBinding:r=>r,upsertInChunks:async(table,rows)=>writes.push({table,rows}),writeModuleCache:async()=>{},console});
 load(c,['saveData']);assert.equal(await c.saveData([{id:'sample',sku:'100'}]),true);assert.equal(writes[0].rows.length,1);assert.equal(writes[0].rows[0].id,'sample');
});
function allocation(decision){
 const state={bindings:[{id:'old',sku:'88688',locationCode:'R03-RK01-L01-D',areaCode:2}],history:[]},writes=[];
 const c=vm.createContext({state,Date,Boolean,normalizeSku:v=>v,normalizeSkuKey:v=>v,normalizeLocation:code=>({valid:true,code}),unique:r=>[...new Set(r)],
  findBySku:sku=>state.bindings.filter(b=>b.sku===sku),findByLocation:code=>state.bindings.filter(b=>b.locationCode===code),
  fetchLocationOccupantsForAllocation:async()=>({ok:true,occupants:state.bindings.slice()}),locationExistsInMaster:()=>true,isSameSku:(a,b)=>a===b,
  askLocationConflictDecision:async()=>decision,renderScanResults:()=>{},prepareAnotherLocationScan:()=>{},renderAll:()=>{},setScanMessage:()=>{},
  createBinding:(sku,p)=>({id:'new',sku,locationCode:p.code,areaCode:2}),getAreaByCode:()=>({name:'Area'}),findProductName:()=>'',
  createHistoryItem:(action,sku,location,details)=>({action,sku,location,details}),buildAddressingOccupantSnapshot:()=>[],
  persistAllocationChange:async(binding,ids,history)=>{writes.push({binding,ids,history});return {ok:true};}});
 load(c,['allocateSkuToLocation']);return {c,state,writes};
}
test('replace retains only 88694, include retains both, and cancel leaves the original unchanged',async()=>{
 for(const decision of ['replace','include','cancel']){
  const f=allocation(decision);const result=await f.c.allocateSkuToLocation('88694',{code:'R03-RK01-L01-D',rua:3,rack:1,linha:1,letra:'D'},2);
  assert.equal(result.ok,decision!=='cancel');
  assert.deepEqual(f.state.bindings.map(b=>b.sku).sort(),decision==='replace'?['88694']:decision==='include'?['88688','88694']:['88688']);
  if(decision==='replace'){assert.equal(f.writes[0].ids[0],'old');assert.match(f.writes[0].history[0].details,/removendo os outros/);assert.equal(f.writes[0].history[1].sku,'88688');}
  if(decision==='include'){assert.equal(f.writes[0].ids.length,0);assert.match(f.writes[0].history[0].details,/sem remover/);}
  if(decision==='cancel')assert.equal(f.writes.length,0);
 }
});
