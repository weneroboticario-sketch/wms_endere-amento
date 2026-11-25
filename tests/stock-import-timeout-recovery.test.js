import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const script=await readFile(new URL('../script.js',import.meta.url),'utf8');
const start=script.indexOf('  async function upsertStockImportPositions(');
const end=script.indexOf('\n  async function clearBindingsForUnlocatedStockImport(',start);
assert.ok(start>=0&&end>start,'Import function must exist');
const functionSource=script.slice(start,end);

function makeHarness({failFirst=false}={}){
 const calls=[],progress=[],waits=[];
 let first=true;
 const scope=vm.createContext({
  supabaseDb:{rpc:async(name,params)=>{
   assert.equal(name,'wms_upsert_import_positions');
   calls.push(params);
   if(failFirst&&first){first=false;return {error:{code:'57014',status:500,message:'canceling statement due to statement timeout'}};}
   return {data:params.p_rows.length,error:null};
  }},
  runSupabaseRequestWithRetry:async(name,fn)=>{
   assert.equal(name,'upsert-stock-import-positions');
   return fn();
  },
  delay:async ms=>waits.push(ms)
 });
 vm.runInContext(functionSource,scope);
 return {calls,progress,waits,run:rows=>scope.upsertStockImportPositions(rows,'VDCG','CAPTACAO','batch-one',p=>progress.push({...p}))};
}
test('small imports finish with sequential bounded writes',async()=>{
 const h=makeHarness(),rows=Array.from({length:245},(_,i)=>({id:String(i)}));
 await h.run(rows);
 assert.deepEqual(h.calls.map(c=>c.p_rows.length),[120,120,5]);
 assert.equal(h.progress.at(-1).processed,245);
 assert.ok(h.calls.every(c=>c.p_batch_id==='batch-one'));
});
test('large imports shrink a timed-out batch without skipping records or changing warehouse',async()=>{
 const h=makeHarness({failFirst:true}),rows=Array.from({length:5101},(_,i)=>({id:String(i)}));
 await h.run(rows);
 assert.equal(h.calls[0].p_rows.length,60);
 assert.equal(h.calls[1].p_rows.length,30);
 assert.equal(h.calls[1].p_rows[0].id,'0');
 const successful=h.calls.slice(1).flatMap(c=>c.p_rows.map(r=>r.id));
 assert.deepEqual(successful,rows.map(r=>r.id));
 assert.ok(h.calls.every(c=>c.p_warehouse_code==='VDCG'&&c.p_source_type==='CAPTACAO'));
 assert.equal(h.progress.at(-1).processed,5101);
 assert.ok(h.progress.some(p=>p.reducingBatch));
});
test('permanent errors are not silently skipped',async()=>{
 const h=makeHarness();
 h.calls.length=0;
 const scope=vm.createContext({
  supabaseDb:{rpc:async()=>({error:{code:'42501',message:'Estoque nao autorizado'}})},
  runSupabaseRequestWithRetry:async(_name,fn)=>fn(),
  delay:async()=>{}
 });
 vm.runInContext(functionSource,scope);
 await assert.rejects(scope.upsertStockImportPositions([{id:'1'}],'VDCG','CAPTACAO','batch-one'),error=>error.code==='42501'&&error.message==='Estoque nao autorizado');
});
