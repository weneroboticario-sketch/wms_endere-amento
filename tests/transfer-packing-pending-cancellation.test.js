import test from 'node:test';
import assert from 'node:assert/strict';
import {createPackingGateway} from '../src/transfer-packing-api.js';

const memory=()=>{const state=new Map();return {getItem:k=>state.get(k)||null,setItem:(k,v)=>state.set(k,v),removeItem:k=>state.delete(k)};};
const request={transferId:'trf-vdar',itemId:'item-85308',warehouse:'VDCG',revision:1,action:{operation:'QUANTIDADE_MANUAL',quantity:5,code_method:'MANUAL'}};

test('server cancellation reserves pending UUID without counting units',async()=>{
 const storage=memory();let cancelledId='';
 const client={rpc:async(name,payload)=>{
  if(name==='apply_wms_packing_action')return {status:504,error:{message:'Gateway timeout'}};
  assert.equal(name,'cancel_wms_pending_packing_action');cancelledId=payload.p_action_id;
  return {data:{status:'cancelled',event:{event_type:'OPERACAO_DESCARTADA',quantity:0}}};
 }};
 const gateway=createPackingGateway({client,storage,scope:()=> 'user:VDCG:trf-vdar',uuid:()=> 'fixed-id'});
 await assert.rejects(gateway.perform(request),/Gateway timeout/);
 const result=await gateway.cancelPending();
 assert.equal(result.status,'cancelled');
 assert.equal(cancelledId,'fixed-id');
 assert.equal(gateway.pending(),null);
});
test('confirmed event requires item refresh before pending is removed',async()=>{
 const storage=memory();let available=false;
 const client={rpc:async(name)=>{
  if(name==='apply_wms_packing_action')return {status:504,error:{message:'Gateway timeout'}};
  return {data:{status:'confirmed',event:{event_type:'QUANTIDADE_MANUAL',quantity:5},transfer:{id:'trf-vdar'}}};
 },from:()=>({select(){return this},eq(){return this},async maybeSingle(){return {data:available?{id:'item-85308',quantidade_lacrada:5}:null,error:null}}})};
 const gateway=createPackingGateway({client,storage,scope:()=> 'user:VDCG:trf-vdar',uuid:()=> 'fixed-id'});
 await assert.rejects(gateway.perform(request),/Gateway timeout/);
 await assert.rejects(gateway.cancelPending(),/não foi possível atualizar/);
 assert.ok(gateway.pending());
 available=true;
 const res=await gateway.cancelPending();
 assert.equal(res.item.quantidade_lacrada,5);
 assert.equal(gateway.pending(),null);
});
test('cancelled audit tombstone is not mistaken for successful quantity',async()=>{
 const storage=memory();
 const client={rpc:async(_n,payload)=>({data:{event:{event_type:'OPERACAO_DESCARTADA',quantity:0},transfer:{id:payload.p_transfer_id}}})};
 const gateway=createPackingGateway({client,storage,scope:()=> 'user:VDCG:trf-vdar',uuid:()=> 'fixed-id'});
 const result=await gateway.perform(request);
 assert.equal(result.cancelled,true);
 assert.equal(gateway.pending(),null);
});
