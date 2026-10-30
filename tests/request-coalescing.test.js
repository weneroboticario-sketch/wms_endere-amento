import test from 'node:test';
import assert from 'node:assert/strict';
import {createScopedSingleFlight} from '../src/request-coalescing.js';
test('catalog requests share only simultaneous reads of the same user/role/warehouse and never retain stale values or failures',async()=>{
  const read=createScopedSingleFlight();let calls=0,finish;
  const a=read('one:OPERADOR:VDCG',()=>{calls++;return new Promise(resolve=>{finish=resolve;});});
  const b=read('one:OPERADOR:VDCG',()=>{throw Error('must share');});assert.equal(a,b);await Promise.resolve();assert.equal(calls,1);
  assert.equal(await read('two:OPERADOR:VDAR',async()=>{calls++;return 'other';}),'other');finish('fresh');assert.equal(await a,'fresh');assert.equal(await b,'fresh');
  assert.equal(await read('one:OPERADOR:VDCG',async()=>{calls++;return 'updated';}),'updated');assert.equal(calls,3);
  await assert.rejects(read('failure',()=>{throw Error('offline');}),/offline/);assert.equal(await read('failure',async()=>'recovered'),'recovered');
});
