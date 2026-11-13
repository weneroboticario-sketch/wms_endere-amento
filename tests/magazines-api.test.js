import test from 'node:test';import assert from 'node:assert/strict';import {createMagazineApi,submitMagazineReplenishments} from '../src/magazines-api.js';
function memory(){const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};}
test('unknown RPC response retains the exact action and changing warehouse cannot adopt the old result',async()=>{
 const storage=memory(),calls=[];let fail=true,stock='VDCG';const client={async rpc(name,request){calls.push(JSON.parse(JSON.stringify(request)));if(fail){fail=false;throw new Error('network');}return {data:{magazine:{id:'draft'}},error:null};}};
 const api=createMagazineApi({client:()=>client,user:()=>({id:'adm',role:'ADMINISTRADOR'}),warehouse:()=>stock,storage});await assert.rejects(api.act('id','CREATE',{file_name:'a.pdf'}),/network/);await assert.rejects(api.act('id','CREATE',{}),/sem confirmação/);assert.ok(api.pending());await api.retry();assert.deepEqual(calls[0],calls[1]);assert.equal(api.pending(),null);
 client.rpc=async()=>{stock='VDAR';return {data:{},error:null};};await assert.rejects(api.act('id','CREATE',{}),/estoque mudou/);
});
test('bulk replenishment reuses existing flow and stable keys after lost acknowledgement, preserving already completed requests',async()=>{
 const storage=memory(),saved=new Map(),calls=[];let fail=true;
 const options={rows:[{sku:'01314',qty:2,store:0},{sku:'48060',qty:1,store:0}],scope:'adm:OPERADOR:VDCG',currentScope:()=> 'adm:OPERADOR:VDCG',storage,findByKey:async k=>saved.get(k),create:async data=>{calls.push(data);const result={id:'request-'+data.codigoMaterial};saved.set(data.idempotencyKey,result);if(fail){fail=false;throw new Error('lost response');}return result;}};
 await assert.rejects(submitMagazineReplenishments(options),/lost response/);const result=await submitMagazineReplenishments(options);assert.equal(result.length,2);assert.equal(calls.length,2);assert.equal(calls[0].codigoMaterial,'01314');assert.equal(calls[0].requestedQty,2);assert.equal(result[0].requestId,'request-01314');assert.equal(result.every(r=>r.done),true);
});
