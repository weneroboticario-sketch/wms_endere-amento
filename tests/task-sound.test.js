import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createTaskSound} from '../src/task-sound.js';
function fixture(options={}) {
 let actor='a';const saved=options.saved||new Map(),contexts=[];
 const controller=createTaskSound({getUser:()=>actor,storage:{getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)},createContext:()=>{
  const context={state:'running',currentTime:0,destination:{},gains:[],oscillators:[],closed:0,createGain(){const gain={values:[],gain:{setValueAtTime(value){gain.values.push(value);},exponentialRampToValueAtTime(value){gain.values.push(value);}},connect(){},disconnect(){}};this.gains.push(gain);return gain;},createOscillator(){const oscillator={frequency:{},connect(){},disconnect(){},start(){oscillator.started=true;},stop(){oscillator.stopped=true;}};this.oscillators.push(oscillator);return oscillator;},close(){this.closed++;return Promise.resolve();},...options.context};contexts.push(context);return context;
 },...options});
 return {controller,saved,contexts,user(value){actor=value;}};
}
test('default 90% uses short safe sine pulses; full and half volumes are applied to master gain',async()=>{const f=fixture();assert.equal(f.controller.current().volume,0.9);for(const volume of [1,0.5]){f.controller.set({volume});assert.equal(await f.controller.play(),true);const c=f.contexts.at(-1);assert.equal(c.gains[0].values.at(-1),volume);assert.equal(c.oscillators.length,2);assert.ok(c.oscillators.every(o=>o.type==='sine'));assert.ok(c.gains.slice(1).every(g=>Math.max(...g.values)<=0.55));}});
test('mute and zero are silent, immediately stop playback, and retain separate volume preference',async()=>{const f=fixture();await f.controller.play();f.controller.set({enabled:false});assert.equal(f.contexts[0].closed,1);assert.ok(f.contexts[0].oscillators.every(o=>o.stopped));assert.equal(await f.controller.play(),false);assert.equal(f.contexts.length,1);assert.equal(f.controller.current().volume,0.9);f.controller.set({enabled:true,volume:0});assert.equal(await f.controller.play(),false);assert.equal(f.controller.current().enabled,true);});
test('live slider changes update current playback and do not start another sound',async()=>{const f=fixture();await f.controller.play();f.controller.set({volume:0.5});assert.equal(f.contexts[0].gains[0].values.at(-1),0.5);assert.equal(f.contexts.length,1);f.controller.set({volume:0});assert.equal(f.contexts[0].closed,1);});
test('refresh restores both preferences without playing and shared devices keep users separate',()=>{const f=fixture();f.controller.set({volume:0.5,enabled:false});const reloaded=fixture({saved:f.saved});assert.deepEqual(reloaded.controller.current(),{enabled:false,volume:0.5});assert.equal(reloaded.contexts.length,0);f.user('b');assert.deepEqual(f.controller.current(),{enabled:true,volume:0.9});f.controller.set({volume:0.2});f.user('a');assert.deepEqual(f.controller.current(),{enabled:false,volume:0.5});});
test('user changes and repeated playback cannot leave overlapping contexts',async()=>{const f=fixture();await f.controller.play();await f.controller.play();assert.equal(f.contexts[0].closed,1);f.user('b');f.controller.current();assert.equal(f.contexts[1].closed,1);f.user(null);assert.equal(await f.controller.play(),false);});
test('autoplay failure is contained and a later user-initiated retry can play',async()=>{let denied=true;const f=fixture({context:{state:'suspended',resume:async()=>{if(denied)throw Error('NotAllowedError');}}});assert.equal(await f.controller.play(),false);assert.equal(f.contexts[0].closed,1);denied=false;assert.equal(await f.controller.play(),true);});
test('disabling while browser audio is initializing prevents late playback',async()=>{let resume;const f=fixture({context:{state:'suspended',resume:()=>new Promise(resolve=>{resume=resolve;})}});const playing=f.controller.play();f.controller.set({enabled:false});resume();assert.equal(await playing,false);assert.equal(f.contexts[0].oscillators.length,0);});
test('blocked storage remains functional; malformed and out-of-range settings stay bounded',async()=>{const f=fixture({storage:{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}}});f.controller.set({volume:2});assert.equal(f.controller.current().volume,1);f.controller.set({volume:-1});assert.equal(await f.controller.play(),false);});
test('existing task signature flow keeps first load silent, visual alerts enabled and no repeated sound',()=>{const source=fs.readFileSync(new URL('../script.js',import.meta.url),'utf8');const start=source.indexOf('  function taskSignature('),end=source.indexOf('  function playTaskSound()',start);let sounds=0,toasts=0,enabled=true;const sandbox={taskAlertState:{initialized:false,audioUnlocked:true},isTaskSoundEnabled:()=>enabled,playTaskSound:()=>{sounds++;},showToast:()=>{toasts++;}};vm.createContext(sandbox);vm.runInContext(source.slice(start,end),sandbox);sandbox.notifyTaskChanges([{type:'task',id:'1'}]);assert.equal(sounds,0);sandbox.notifyTaskChanges([{type:'task',id:'2'}]);sandbox.notifyTaskChanges([{type:'task',id:'2'}]);assert.equal(sounds,1);enabled=false;sandbox.notifyTaskChanges([{type:'task',id:'3'}]);assert.equal(sounds,1);assert.equal(toasts,2);});

test('actual replenishment alert obeys sidebar volume, zero and immediate mute',async()=>{
 const f=fixture();
 const source=fs.readFileSync(new URL('../script.js',import.meta.url),'utf8');
 const context=vm.createContext({
  taskSound:f.controller,
  isTaskSoundEnabled:()=>{const settings=f.controller.current();return settings.enabled && settings.volume>0;},
  localStorage:{getItem:()=>null},REPLENISHMENT_SOUND_KEY:'enabled',REPLENISHMENT_SOUND_VOLUME_KEY:'volume'
 });
 vm.runInContext(source.slice(source.indexOf('  function isReplenishmentSoundEnabled()'),source.indexOf('  function saveReplenishmentSoundSetting()'))+
 source.slice(source.indexOf('  function playReplenishmentSound()'),source.indexOf('  function startTaskPolling()')),context);
 f.controller.set({volume:1});context.playReplenishmentSound();await Promise.resolve();
 const full=f.contexts.at(-1);
 assert.equal(full.oscillators[0].type,'square');
 assert.equal(full.gains[0].values.at(-1),1);
 assert.equal(Math.max(...full.gains[1].values),0.26);
 f.controller.set({volume:0.1});context.playReplenishmentSound();await Promise.resolve();
 assert.equal(f.contexts.at(-1).gains[0].values.at(-1),0.1);
 const count=f.contexts.length;f.controller.set({volume:0});context.playReplenishmentSound();await Promise.resolve();assert.equal(f.contexts.length,count);
 f.controller.set({volume:0.5});context.playReplenishmentSound();await Promise.resolve();
 const active=f.contexts.at(-1);f.controller.set({enabled:false});assert.equal(active.closed,1);const muted=f.contexts.length;
 context.playReplenishmentSound();await Promise.resolve();assert.equal(f.contexts.length,muted);
});

test('completed replenishment pulse releases audio resources',async()=>{
 const f=fixture();await f.controller.play("replenishment",0.26);
 const c=f.contexts.at(-1);c.oscillators[1].onended();
 assert.equal(c.closed,1);
});
test('another tab can refresh shared user volume and stop an already playing alert',async()=>{
 const first=fixture(),second=fixture({saved:first.saved});
 await second.controller.play("replenishment",0.26);
 first.controller.set({volume:0,enabled:false});
 const settings=second.controller.reload();
 assert.equal(settings.enabled,false);assert.equal(settings.volume,0);
 assert.equal(second.contexts[0].closed,1);
 assert.equal(await second.controller.play("replenishment",0.26),false);
});

test('visual browser notifications request silence so the OS cannot add a second uncontrolled tone',()=>{
 const source=fs.readFileSync(new URL('../script.js',import.meta.url),'utf8');
 const notifications=[];
 function Notification(title,options){notifications.push({title,options});}
 Notification.permission='granted';
 const context=vm.createContext({Notification,window:{Notification},activeWarehouseCode:()=> 'VDCG'});
 vm.runInContext(source.slice(source.indexOf('  function showBrowserNotification('),source.indexOf('  function createReplenishmentNotification(')),context);
 context.showBrowserNotification('Novo pedido','Produto');
 assert.equal(notifications.length,1);assert.equal(notifications[0].options.silent,true);assert.equal(notifications[0].title,'Novo pedido');
});
