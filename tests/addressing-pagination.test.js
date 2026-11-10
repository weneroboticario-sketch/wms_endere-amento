import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../script.js',import.meta.url),'utf8');
test('address pagination uses a unique tie-breaker and returns every binding once, including same-date imports',async()=>{
 const rows=Array.from({length:1201},(_,i)=>({id:String(i).padStart(5,'0'),updated_at:'2026-11-09',sku:String(10000+i)})),orders=[],ranges=[];
 const c=vm.createContext({activeWarehouseCode:()=> 'VDCG',activeWarehouseId:()=> 'vdcg-id',runSupabaseRequestWithRetry:async(label,fn)=>fn(),supabaseDb:{from:table=>{
  assert.equal(table,'wms_bindings');const fields=[];return {select(){return this;},or(filter){assert.match(filter,/warehouse_code.eq.VDCG/);return this;},order(k,o){fields.push([k,o]);return this;},async range(a,b){orders.push(fields);ranges.push([a,b]);const sorted=fields.some(([k])=>k==='id')?rows:rows.slice(a?1:0).concat(a?[rows[0]]:[]);return {data:sorted.slice(a,b+1),error:null};}};
 }}});
 vm.runInContext(source.match(/  async function fetchWarehouseRowsWithFilter\([^]*?\n  }/)[0],c);
 for(const column of ['updated_at','created_at','id']){
  const result=await c.fetchWarehouseRowsWithFilter('wms_bindings',column,false,true);
  assert.equal(result.length,1201);assert.equal(new Set(result.map(r=>r.id)).size,1201);assert.equal(result[1200].id,'01200');
  assert.ok(orders.every(o=>o.filter(([k])=>k==='id').length===1));orders.length=0;
 }
 assert.deepEqual(ranges.slice(0,3),[[0,499],[500,999],[1000,1499]]);
});
