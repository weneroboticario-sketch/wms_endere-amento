import test from 'node:test';
import assert from 'node:assert/strict';
import {createMagazineStockReader} from '../src/magazines-stock.js';

function fixture(){
 const tables={wms_bindings:[],wms_stock_positions:[],wms_stock_import_batches:[],wms_replenishment_requests:[]};
 const reads=[];let warehouse='VDCG',fault=false;
 class Query{
  constructor(table){this.table=table;this.filters=[];}
  select(){return this;}eq(k,v){this.filters.push(r=>r[k]===v);return this;}in(k,v){this.filters.push(r=>v.includes(r[k]));return this;}
  or(){this.filters.push(r=>!r.is_deleted);return this;}order(){return this;}limit(n){this.limitValue=n;return this;}
  result(a=0,b=499){reads.push({table:this.table,a,b,warehouse});return fault?{error:new Error('consulta indisponível')}:{data:tables[this.table].filter(r=>this.filters.every(f=>f(r))).slice(a,this.limitValue??b+1)};}
  range(a,b){return Promise.resolve(this.result(a,b));}then(resolve,reject){return Promise.resolve(this.result()).then(resolve,reject);}
 }
 const client={from:table=>new Query(table)};
 const load=createMagazineStockReader({client:()=>client,warehouse:()=>warehouse,user:()=>({id:'operator'}),positionColumns:()=>'*',mapPosition:p=>({id:p.id,codigoMaterial:p.codigo_material,sourceType:p.source_type,available:p.total_disponivel}),aliases:keys=>keys.flatMap(k=>[k,k.padStart(5,'0')]),splitSku:s=>s.split('/'),openStatuses:['PENDENTE'],buildSuggestion:(sku,min,rows)=>({storeFound:rows.some(p=>p.sourceType==='LOJA'),storeAvailable:rows.filter(p=>p.sourceType==='LOJA').reduce((n,p)=>n+p.available,0),captureFound:rows.some(p=>p.sourceType==='CAPTACAO'),captureAvailable:rows.filter(p=>p.sourceType==='CAPTACAO').reduce((n,p)=>n+p.available,0)})});
 return {tables,reads,load,setWarehouse:v=>{warehouse=v;},setFault:v=>{fault=v;}};
}
test('magazine consultation refreshes stock, pages addresses, respects zero aliases and never hides pending requests',async()=>{
 const f=fixture(),warehouse_code='VDCG';
 f.tables.wms_bindings=Array.from({length:501},(_,i)=>({id:i,warehouse_code,sku:i===500?'01314/48060':'9',location_code:i===500?'R01-RK01-L01-A':''}));
 f.tables.wms_stock_positions=[{id:1,warehouse_code,active:true,codigo_material:'01314',source_type:'CAPTACAO',total_disponivel:12},{id:2,warehouse_code,active:true,codigo_material:'1314',source_type:'LOJA',total_disponivel:0}];
 f.tables.wms_replenishment_requests=[{id:1,warehouse_code,codigo_material:'01314',status:'PENDENTE',quantidade_solicitada:2},{id:2,warehouse_code:'VDAR',codigo_material:'01314',status:'PENDENTE'}];
 const result=(await f.load(['1314'])).get('1314');assert.equal(result.captureAvailable,12);assert.equal(result.storeAvailable,0);assert.equal(result.pending.length,1);assert.equal(result.location,'R01-RK01-L01-A');assert.ok(f.reads.some(r=>r.table==='wms_bindings'&&r.a===500));
 f.tables.wms_stock_positions[0].total_disponivel=3;assert.equal((await f.load(['01314'])).get('1314').captureAvailable,3);
 f.tables.wms_stock_positions[0].total_disponivel=null;const missing=(await f.load(['1314'])).get('1314');assert.equal(missing.captureFound,false);assert.equal(missing.captureAvailable,null);
 f.setWarehouse('VDAR');assert.equal((await f.load(['1314'])).get('1314').captureFound,false);
});
test('failed stock reads are explicit and do not reuse a previous quantity',async()=>{
 const f=fixture();f.setFault(true);const result=(await f.load(['48060'])).get('48060');assert.match(result.error,/indisponível/);assert.equal(result.captureAvailable,undefined);
});
