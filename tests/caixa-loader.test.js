import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate} from 'node:timers/promises';
import {createCaixaLoader} from '../src/caixa-loader.js';
const element=()=>({dataset:{},isConnected:true,children:[],replaceChildren(){this.children=[];},append(child){this.children.push(child);}});
test('lazy Caixa load mounts only the latest actor/warehouse and shares the module download',async()=>{
  const previous=globalThis.document;globalThis.document={createElement:()=>({setAttribute(){}})};
  try{
    let resolve,downloads=0;const mounted=[];const mount=createCaixaLoader(()=>{downloads++;return new Promise(done=>{resolve=done;});});const host=element();
    mount(host,{actor:'one',role:'CAIXA',warehouse:'VDCG',isCurrent:()=>false});
    mount(host,{actor:'two',role:'CAIXA',warehouse:'VDAR',isCurrent:()=>true});
    resolve({mountCaixaRequests:(_,context)=>mounted.push(context.actor+':'+context.warehouse)});await setImmediate();
    assert.equal(downloads,1);assert.deepEqual(mounted,['two:VDAR']);
  }finally{globalThis.document=previous;}
});
test('module download failure shows a retryable state and never mounts after logout',async()=>{
  const previous=globalThis.document;globalThis.document={createElement:()=>({setAttribute(){}})};
  try{
    let attempts=0,mounted=0;const mount=createCaixaLoader(async()=>{if(++attempts===1)throw Error('offline');return {mountCaixaRequests:()=>{mounted++;}};});const host=element();
    mount(host,{actor:'one',role:'CAIXA',warehouse:'VDCG',isCurrent:()=>true});await setImmediate();assert.match(host.children[0].textContent,/Não foi possível/);
    mount(host,{actor:'one',role:'CAIXA',warehouse:'VDCG',isCurrent:()=>false});await setImmediate();assert.equal(attempts,2);assert.equal(mounted,0);
  }finally{globalThis.document=previous;}
});
