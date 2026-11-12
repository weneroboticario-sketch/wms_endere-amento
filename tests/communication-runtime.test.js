import test from 'node:test';
import assert from 'node:assert/strict';
import {setInterval,clearInterval} from 'node:timers';
import {createCommunicationRuntime} from '../src/communication-runtime.js';

function environment(){
 const oldWindow=globalThis.window,oldDocument=globalThis.document;
 const handlers=new Map();
 globalThis.window={localStorage:{getItem:()=>null,setItem:()=>{}},
  addEventListener:(key,fn)=>handlers.set(key,fn),removeEventListener:(key,fn)=>{if(handlers.get(key)===fn)handlers.delete(key);},
  setInterval,clearInterval};
 globalThis.document={visibilityState:'visible',addEventListener:(key,fn)=>handlers.set(key,fn),removeEventListener:(key,fn)=>{if(handlers.get(key)===fn)handlers.delete(key);}};
 return {handlers,restore(){if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;}};
}
function fakeClient(unread){
 let removed=0;
 const channel={on:()=>channel,subscribe:()=>channel};
 return {client:{rpc:async(_name,args)=>args.p_action==='UNREAD'?unread():{data:{}},channel:()=>channel,removeChannel:async()=>{removed++;}},removed:()=>removed};
}

test('simultaneous navigation mounts one chat and disposal clears private state without waiting for presence',async()=>{
 const env=environment();let runtime,resolveView,resolveUnread,resolvePresence,loads=0,mounts=0,opens=0,disposed=0;
 const badges=[],root={value:'old account',replaceChildren(){this.value='';}};
 const {client,removed}=fakeClient(()=>new Promise(resolve=>{resolveUnread=resolve;}));
 const view={connection:()=>{},open:async()=>{opens++;},refresh:async()=>{},setActive:()=>new Promise(resolve=>{resolvePresence=resolve;}),dispose:()=>{disposed++;}};
 try{
  runtime=createCommunicationRuntime({client,getUser:()=>({id:'op'}),getWarehouse:()=>'VDCG',root,onBadge:n=>badges.push(n),onToast:()=>{},isOpen:()=>true,
   loadView:()=>{loads++;return new Promise(resolve=>{resolveView=resolve;});}});
  const first=runtime.show(),second=runtime.show();assert.equal(loads,1);
  resolveView({mountCommunication:()=>{mounts++;return view;}});await Promise.all([first,second]);assert.equal(mounts,1);assert.equal(opens,2);
  await runtime.dispose();assert.equal(disposed,1);assert.equal(removed(),1);assert.equal(root.value,'');assert.equal(env.handlers.size,0);
  root.value='new account';resolvePresence();resolveUnread({data:{count:8}});await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(root.value,'new account');assert.deepEqual(badges,[0]);
 }finally{await runtime?.dispose();env.restore();}
});

test('account or warehouse changes during lazy loading never mount the previous private view',async()=>{
 const env=environment();let runtime,finishLoad,actor='cash',unit='VDCG',mounts=0;
 const {client}=fakeClient(async()=>({data:{count:0}}));
 try{
  runtime=createCommunicationRuntime({client,getUser:()=>({id:actor}),getWarehouse:()=>unit,root:{replaceChildren(){}},onBadge:()=>{},onToast:()=>{},isOpen:()=>true,
   loadView:()=>new Promise(resolve=>{finishLoad=resolve;})});
  const opening=runtime.show();actor='op';unit='VDAR';finishLoad({mountCommunication:()=>{mounts++;}});await opening;
  assert.equal(mounts,0);await runtime.dispose();assert.equal(env.handlers.size,0);
 }finally{await runtime?.dispose();env.restore();}
});
