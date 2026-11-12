import test from 'node:test';
import assert from 'node:assert/strict';
import {Blob} from 'node:buffer';
import {createCommunicationApi,createCommunicationRealtime,mergeCommunicationMessages} from '../src/communication-api.js';
import {setCommunicationPush} from '../src/communication-media.js';

test('communication rejects a response after account/unit changes and merges bigint IDs without duplicates',async()=>{
 let current=true,resolve;
 const api=createCommunicationApi({warehouse:'VDCG',isCurrent:()=>current,client:{rpc:()=>new Promise(done=>{resolve=done;})}});
 const result=api.rpc('LIST');current=false;resolve({data:[{id:'private'}]});
 await assert.rejects(result,/alterada/);
 const merged=mergeCommunicationMessages([{id:'9007199254740993',body:'old'}],[{id:'9007199254740992'},{id:'9007199254740993',body:'new'}]);
 assert.deepEqual(merged.map(row=>row.id),['9007199254740992','9007199254740993']);assert.equal(merged[1].body,'new');
});

test('persisted message survives push failure; upload retry finalizes the original immutable object',async()=>{
 let uploads=0,finalizations=0;const actions=[];
 const client={rpc:async(_name,args)=>{actions.push(args);return {data:args.p_action==='SEND'?{id:'42'}:{id:'asset',storage_path:'reserved/path'}};},
  functions:{invoke:async(_name,{body})=>{if(body.action==='finalize'&&++finalizations===1)return {error:{message:'Connection lost'}};if(body.action==='notify')return {error:{message:'No push'}};return {data:{ok:true}};}},
  storage:{from:()=>({upload:async()=>{uploads++;return {data:{}};}})}};
 const api=createCommunicationApi({client,warehouse:'VDCG',isCurrent:()=>true});
 assert.equal((await api.send({conversation_id:'conv',body:'Persisted',client_action_id:'same'})).id,'42');
 const pending={},image={blob:new Blob(['synthetic'],{type:'image/png'})};
 await assert.rejects(api.upload(image,'conv',pending),/Connection lost/);
 assert.equal(await api.upload(image,'conv',pending),'asset');assert.equal(uploads,1);
 assert.equal(actions.filter(a=>a.p_action==='RESERVE_ATTACHMENT').length,1);
});

test('one scoped realtime channel coalesces bursts, resynchronizes reconnect and stops after disposal',async()=>{
 let subscribed,removed=0,syncs=0;const events=[],states=[];
 const channel={on:(_event,filter,callback)=>{events.push({filter,callback});return channel;},subscribe:callback=>{subscribed=callback;return channel;}};
 const realtime=createCommunicationRealtime({client:{channel:()=>channel,removeChannel:async()=>{removed++;}},warehouse:'VDCG',actor:'cash',onSync:async()=>{syncs++;},onState:value=>states.push(value)});
 subscribed('SUBSCRIBED');for(let i=0;i<15;i++)events[0].callback();
 await new Promise(resolve=>setTimeout(resolve,300));assert.equal(syncs,1);
 subscribed('CHANNEL_ERROR');subscribed('SUBSCRIBED');await new Promise(resolve=>setTimeout(resolve,300));assert.equal(syncs,2);
 assert.equal(events[0].filter.filter,'warehouse_code=eq.VDCG');assert.equal(events[1].filter.filter,'profile_id=eq.cash');
 realtime.close();events[0].callback();await new Promise(resolve=>setTimeout(resolve,300));assert.equal(syncs,2);assert.equal(removed,1);assert.ok(states.includes('Reconectando…'));
});

test('push gracefully handles unsupported browsers and denied permission without subscribing',async()=>{
 const originalWindow=globalThis.window,originalNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');let subscribed=0,permissionCalls=0;
 try{
  globalThis.window={};Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}});
  await assert.rejects(setCommunicationPush({},true),/indisponível/);
  globalThis.window={PushManager:class{},Notification:{permission:'default',requestPermission:()=>{permissionCalls++;return Promise.resolve('denied');}}};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{serviceWorker:{getRegistration:async()=>({pushManager:{getSubscription:async()=>null,subscribe:async()=>{subscribed++;}}})}}});
  await assert.rejects(setCommunicationPush({},true,{configured:true}),/não concedida/);assert.equal(subscribed,0);assert.equal(permissionCalls,1);
  await assert.rejects(setCommunicationPush({},true,{configured:false}),/não configurado/);assert.equal(permissionCalls,1);
 }finally{if(originalWindow===undefined)delete globalThis.window;else globalThis.window=originalWindow;if(originalNavigator)Object.defineProperty(globalThis,'navigator',originalNavigator);else delete globalThis.navigator;}
});
