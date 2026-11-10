import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../script.js',import.meta.url),'utf8');
function harness(overrides={}){
 const binding=(sku,locationCode,updatedAt)=>({sku,locationCode,updatedAt,warehouseCode:'VDCG',rua:3,rack:1,linha:1,letra:'D',areaCode:2});
 const state={bindings:[binding('88688','R03-RK01-L01-D','2026-11-09')],products:{}};
 let warehouse='VDCG';const user={id:'admin'};
 const c=vm.createContext({state,authState:{currentUser:user},isSupabaseReady:()=>true,canUseNetwork:()=>true,activeWarehouseCode:()=>warehouse,
  fetchWarehouseRows:async()=>[binding('88688','R03-RK01-L01-D','2026-11-09'),binding('88694','R03-RK01-L01-D','2026-11-10')],expandDbBindingRows:r=>r,
  bindingMatchesActiveWarehouse:b=>b.warehouseCode===warehouse,activeWarehouseBindings:()=>state.bindings,sortByDateDesc:(a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt),
  locationKeyFromBinding:b=>b.locationCode,splitSkuValues:s=>s.split(';'),firstSkuValue:s=>s.split(';')[0],normalizeSkuKey:s=>s.replace(/^0+(?=\d)/,''),
  buildLinhaSeparacaoTemplateRows:()=>[{locationCode:'R03-RK01-L01-D',rua:3,rack:1,linha:1,letra:'D',area:2}],locationKeyFromCode:c=>c,
  linhaSeparacaoRow:(rua,rack,area,linha,letra,sku)=>[rua,rack,area,linha,letra,sku],sortByLocationThenSku:()=>0,...overrides});
 for(const name of ['refreshAddressExportBindings','createLinhaSeparacaoExportRows','linhaSeparacaoRowFromGroup']){
  const body=source.match(new RegExp('  (?:async )?function '+name+'\\([^]*?\\n  }'))?.[0];assert.ok(body);vm.runInContext(body,c);
 }
 return {c,state,changeWarehouse:v=>{warehouse=v;}};
}
test('fresh export includes 88694 with 88688 at the same address, without replacing the other occupant',async()=>{
 const h=harness();assert.equal(h.c.createLinhaSeparacaoExportRows()[0][5],'88688');
 await h.c.refreshAddressExportBindings();const rows=h.c.createLinhaSeparacaoExportRows();assert.equal(rows.length,1);assert.equal(rows[0][5],'88688;88694');assert.equal(h.state.bindings.length,2);
});
test('offline or failed refresh cannot silently export stale addressing',async()=>{
 for(const options of [{canUseNetwork:()=>false},{fetchWarehouseRows:async()=>{throw Error('network failed');}}]){
  const h=harness(options);await assert.rejects(h.c.refreshAddressExportBindings());assert.equal(h.state.bindings.length,1);
 }
});
test('scope change while fetching rejects the old data before adopting it',async()=>{
 let complete;const h=harness({fetchWarehouseRows:()=>new Promise(r=>{complete=r;})});const p=h.c.refreshAddressExportBindings();h.changeWarehouse('VDAR');complete([]);await assert.rejects(p,/estoque mudou/);assert.equal(h.state.bindings.length,1);
});
test('actual Excel handler refreshes before generation and does not save addressing back to the database',async()=>{
 for(const fail of [false,true]){
  const h=harness(fail?{fetchWarehouseRows:async()=>{throw Error('network failed');}}:{}),written=[],sheets=[],messages=[];
  Object.assign(h.c,{$:()=>({}),ensureActiveWarehouse:()=>true,ensureWarehouseSeparatedTable:async()=>true,beginTransferAction:()=>true,endTransferAction:()=>{},setStatus:(id,msg)=>messages.push(msg),showToast:()=>{},formatSupabaseError:e=>e.message,
   validateAddressExportState:()=>({valid:true}),isAdmin:()=>true,REQUIRED_COLUMNS:['station','rack','area','line','column','sku'],LEGEND_ROWS:[],dateForFileName:()=> '10-11-2026',
   recordAuthHistory:async()=>{},writeModuleCacheForWarehouse:async()=>{},recordPerformanceError:()=>{},publishAddressCacheInvalidation:async()=>true,
   saveData:()=>{throw Error('Export must not write bindings');},window:{XLSX:{utils:{aoa_to_sheet:rows=>{sheets.push(rows);return {};},decode_range:()=>({e:{r:0}}),book_new:()=>({}),book_append_sheet:()=>{}},writeFile:(book,name)=>written.push(name)}}});
  vm.runInContext(source.match(/  async function exportExcel\([^]*?\n  }/)[0],h.c);await h.c.exportExcel();
  assert.equal(written.length,fail?0:1);
  if(fail)assert.ok(messages.some(m=>m.includes('network failed')));else assert.equal(sheets[0][1][5],'88688;88694');
 }
});
