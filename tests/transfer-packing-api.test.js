import test from 'node:test';
import assert from 'node:assert/strict';
import {createPackingGateway} from '../src/transfer-packing-api.js';
test('lost acknowledgement is automatically reconciled with same UUID without submitting a new quantity',async()=>{
 const store=new Map(),calls=[];let fail=true;
 const gateway=createPackingGateway({
  scope:()=> 'op:VDCG:t',
  storage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
  uuid:()=> 'stable-uuid',
  client:{async rpc(name,request){
   calls.push(JSON.parse(JSON.stringify(request)));
   if(fail){fail=false;throw new Error('network');}
   return {data:{replayed:true,item:{sku:'94660',quantidade_lacrada:4}}};
  }}
 });
 const action={transferId:'t',itemId:'i',warehouse:'VDCG',revision:0,action:{operation:'QUANTIDADE_MANUAL',quantity:4}};
 await assert.rejects(gateway.perform(action),/network/);
 assert.ok(gateway.pending());
 assert.throws(()=>gateway.discardRejected('NETWORK'),/incerto/);
 const recovered=await gateway.perform({...action,revision:1,action:{operation:'QUANTIDADE_MANUAL',quantity:6}});
 assert.equal(recovered.recoveredPending,true);
 assert.deepEqual(calls[0],calls[1]);
 assert.equal(calls.length,2);
 assert.equal(gateway.pending(),null);
});
test('known server rejection clears stale action without sending a new quantity',async()=>{
 const store=new Map();let fail=true,calls=0;
 const gateway=createPackingGateway({
  scope:()=> 'op:VDCG:t',
  storage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
  uuid:()=> 'stable-uuid',
  client:{async rpc(){calls++;if(fail){fail=false;throw new Error('network');}return {error:{code:'40001',message:'item alterado'}};}}
 });
 const action={transferId:'t',itemId:'i',warehouse:'VDCG',revision:0,action:{operation:'QUANTIDADE_MANUAL',quantity:4}};
 await assert.rejects(gateway.perform(action),/network/);
 await assert.rejects(gateway.perform({...action,revision:1,action:{operation:'QUANTIDADE_MANUAL',quantity:6}}),/operação anterior foi recusada/);
 assert.equal(calls,2);
 assert.equal(gateway.pending(),null);
});
test('explicit retry preserves same operation without optimistic success',async()=>{
 const store=new Map();let failure=true,calls=[];
 const gateway=createPackingGateway({
  scope:()=> 'op:VDCG:t',
  storage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
  uuid:()=> 'stable-uuid',
  client:{async rpc(name,req){calls.push(req);if(failure){failure=false;throw new Error('network');}return {data:{replayed:true}};}}
 });
 const action={transferId:'t',itemId:'i',warehouse:'VDCG',revision:0,action:{operation:'LEITURA_UNITARIA',quantity:1}};
 await assert.rejects(gateway.perform(action),/network/);
 assert.equal((await gateway.retry()).data.replayed,true);
 assert.deepEqual(calls[0],calls[1]);
 assert.equal(gateway.pending(),null);
});
