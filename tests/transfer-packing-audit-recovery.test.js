import test from 'node:test';
import assert from 'node:assert/strict';
import {createPackingGateway} from '../src/transfer-packing-api.js';
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
function chain(table,row){
 let conditions={};
 const q={select(){return q},eq(k,v){conditions[k]=v;return q},async maybeSingle(){return {data:table==='wms_transfer_events'&&row?.event?row.event:table==='wms_transfers'?row?.transfer:table==='wms_transfer_items'?row?.item:null,error:null}}};
 return q;
}
const req={transferId:'trf-vdar',itemId:'sku-85308',warehouse:'VDCG',revision:1,action:{operation:'QUANTIDADE_MANUAL',quantity:5,code_method:'MANUAL'}};
test('a committed operation is recovered from audit history after a 504 without a second write',async()=>{
 const saved=memory();let writes=0;let row=null;
 const client={rpc:async(_name,payload)=>{
  writes++;
  row={event:{id:'pack-1',payload:{request:payload.p_action,requested_item_id:payload.p_item_id},action_id:payload.p_action_id},transfer:{id:'trf-vdar'},item:{id:'sku-85308',quantidade_lacrada:5}};
  return {status:504,error:{message:'Gateway timeout'}};
 },from:table=>chain(table,row)};
 const gateway=createPackingGateway({client,storage:saved,scope:()=> 'user:VDCG:trf-vdar',uuid:()=> 'uuid-1'});
 const result=await gateway.perform(req);
 assert.equal(result.recoveredFromHistory,true);
 assert.equal(result.data.item.quantidade_lacrada,5);
 assert.equal(gateway.pending(),null);
 assert.equal(writes,2);
});
test('a retry verifies existing event without calling the RPC',async()=>{
 const saved=memory();let writes=0;let lookup=null;
 const client={rpc:async(_name,payload)=>{writes++;return {status:504,error:{message:'Gateway timeout'}};},from:table=>chain(table,lookup)};
 const gateway=createPackingGateway({client,storage:saved,scope:()=> 'user:VDCG:trf-vdar',uuid:()=> 'uuid-2'});
 await assert.rejects(gateway.perform(req),/Gateway timeout/);
 assert.equal(writes,2);
 const pending=gateway.pending();
 lookup={event:{payload:{request:pending.p_action,requested_item_id:pending.p_item_id}},transfer:{id:'trf-vdar'},item:{id:'sku-85308',quantidade_lacrada:5}};
 const recovered=await gateway.retry();
 assert.equal(recovered.recoveredFromHistory,true);
 assert.equal(writes,2);
 assert.equal(gateway.pending(),null);
});
test('mismatched audit request cannot clear pending quantity',async()=>{
 const saved=memory();let row=null;
 const client={rpc:async()=>({status:504,error:{message:'Gateway timeout'}}),from:table=>chain(table,row)};
 const gateway=createPackingGateway({client,storage:saved,scope:()=> 'user:VDCG:trf-vdar',uuid:()=> 'uuid-3'});
 await assert.rejects(gateway.perform(req),/Gateway timeout/);
 row={event:{payload:{request:{operation:'QUANTIDADE_MANUAL',quantity:50},requested_item_id:'sku-85308'}},transfer:{id:'trf-vdar'},item:{id:'sku-85308'}};
 await assert.rejects(gateway.retry(),/não corresponde/);
 assert.ok(gateway.pending());
});
