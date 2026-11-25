/* global AbortSignal */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPackingGateway} from '../src/transfer-packing-api.js';

test('SKU identification is read-only and keeps original GTIN for a single confirmation', async()=>{
 const src=await readFile(new URL('../src/transfer-packing-view.js',import.meta.url),'utf8');
 const script=await readFile(new URL('../script.js',import.meta.url),'utf8');
 const start=src.indexOf('  locate(t,item,raw){');
 assert.ok(start>0);
 const body=src.slice(start);
 assert.match(body,/lastScanRaw=String\(raw\|\|''\)\.trim\(\)/);
 assert.match(body,/return Promise\.resolve\(true\)/);
 assert.doesNotMatch(body,/perform\(t,item,\{operation:'LEITURA_SKU'/);
 assert.match(src,/scanProof:\(item,raw\)/);
 assert.match(script,/code_read: scanProof\.codeRead, raw_code: scanProof\.rawCode, code_method: scanProof\.codeMethod/);
});

test('504 does not cause a second long-running packing write; UUID stays pending', async()=>{
 const saved=new Map();
 const storage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
 let calls=0;
 const client={rpc:async()=>{calls++;return {status:504,error:{message:'Gateway Timeout'}}}};
 const gw=createPackingGateway({client,storage,scope:()=> 'actor:VDCG:transfer',uuid:()=> 'fixed-id'});
 await assert.rejects(gw.perform({transferId:'transfer',itemId:'item',warehouse:'VDCG',revision:0,action:{operation:'QUANTIDADE_MANUAL',quantity:5}}),/Gateway Timeout/);
 assert.equal(calls,1);
 assert.equal(gw.pending().p_action_id,'fixed-id');
});

test('aborted request retains UUID for safe reconciliation, not blind replay', async()=>{
 const saved=new Map();
 const storage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
 let calls=0;
 const client={rpc:()=>{calls++;
  return {abortSignal:async signal=>{assert.equal(signal instanceof AbortSignal,true);throw Object.assign(new Error('This operation was aborted'),{name:'AbortError'});}};
 }};
 const gw=createPackingGateway({client,storage,scope:()=> 'actor:VDCG:transfer',uuid:()=> 'fixed-id'});
 await assert.rejects(gw.perform({transferId:'transfer',itemId:'item',warehouse:'VDCG',revision:0,action:{operation:'QUANTIDADE_MANUAL',quantity:5}}),/aborted/);
 assert.equal(calls,1);
 assert.equal(gw.pending().p_action_id,'fixed-id');
});
