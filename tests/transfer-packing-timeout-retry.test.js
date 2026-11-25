import test from 'node:test';
import assert from 'node:assert/strict';
import {createPackingGateway} from '../src/transfer-packing-api.js';

const storage=()=>{
 const values=new Map();
 return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
};
const args={transferId:'trf-vdar',itemId:'item-1',warehouse:'VDCG',revision:0,action:{operation:'LEITURA_SKU',raw_code:'85308',code_method:'MANUAL'}};
test('a 504 retries with the same action UUID and never creates a second event',async()=>{
 const saved=storage(),requests=[];
 const gateway=createPackingGateway({
  client:{rpc:async(_name,payload)=>{
   requests.push(payload);
   if(requests.length===1)return {status:504,error:{message:'Gateway timeout'}};
   return {data:{event:{id:'event-a',sku:'85308'},item:{id:'item-1'}}};
  }},
  storage:saved,scope:()=> 'VDCG:trf-vdar',uuid:()=> 'fixed-uuid'
 });
 const response=await gateway.perform(args);
 assert.equal(response.recovered,true);
 assert.equal(requests.length,2);
 assert.deepEqual(requests[0],requests[1]);
 assert.equal(requests[0].p_action_id,'fixed-uuid');
 assert.equal(gateway.pending(),null);
});
test('a persistent 504 keeps the identical action for explicit recovery',async()=>{
 const saved=storage(),requests=[];
 let fail=true;
 const gateway=createPackingGateway({
  client:{rpc:async(_name,payload)=>{
   requests.push(payload);
   if(fail)return {status:504,error:{message:'Gateway timeout'}};
   return {data:{event:{id:'event-a'}}};
  }},
  storage:saved,scope:()=> 'VDCG:trf-vdar',uuid:()=> 'fixed-uuid'
 });
 await assert.rejects(gateway.perform(args),/Gateway timeout/);
 assert.equal(requests.length,2);
 assert.equal(gateway.pending().p_action_id,'fixed-uuid');
 fail=false;
 await gateway.retry();
 assert.deepEqual(requests[0],requests[2]);
 assert.equal(gateway.pending(),null);
});
test('authorization and SKU mismatch errors are not automatically retried',async()=>{
 const saved=storage();
 let count=0;
 const gateway=createPackingGateway({
  client:{rpc:async()=>{count++;return {status:400,error:{code:'22023',message:'Código capturado não corresponde ao SKU'}}}},
  storage:saved,scope:()=> 'VDCG:trf-vdar',uuid:()=> 'fixed-uuid'
 });
 await assert.rejects(gateway.perform(args),/não corresponde/);
 assert.equal(count,1);
 assert.equal(gateway.pending().p_action_id,'fixed-uuid');
 gateway.discardRejected('22023');
 assert.equal(gateway.pending(),null);
});
