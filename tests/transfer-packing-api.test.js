import test from 'node:test';import assert from 'node:assert/strict';
import {createPackingGateway} from '../src/transfer-packing-api.js';
test('lost acknowledgement retains exact action for retry; no optimistic success or duplicate action',async()=>{
 const store=new Map(),calls=[];let fail=true;
 const gateway=createPackingGateway({scope:()=> 'op:VDCG:t',storage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},uuid:()=> 'stable-uuid',client:{async rpc(name,request){calls.push(JSON.parse(JSON.stringify(request)));if(fail){fail=false;throw new Error('network');}return {data:{replayed:true}};}}});
 const action={transferId:'t',itemId:'i',warehouse:'VDCG',revision:0,action:{operation:'LEITURA_UNITARIA',quantity:1}};
 await assert.rejects(gateway.perform(action),/network/);assert.ok(gateway.pending());
 await assert.rejects(gateway.perform(action),/sem confirmação/);assert.throws(()=>gateway.discardRejected('NETWORK'),/incerto/);
 assert.equal((await gateway.retry()).data.replayed,true);assert.deepEqual(calls[0],calls[1]);assert.equal(gateway.pending(),null);
});
