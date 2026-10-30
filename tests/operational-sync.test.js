import test from 'node:test';
import assert from 'node:assert/strict';
import {createOperationalSync} from '../src/operational-sync.js';
import {recordOperationalDiagnostic,operationalDiagnostics} from '../src/operational-diagnostics.js';
function fixture(options={}){
  let active=true,interval,cleaned=0;const timeouts=new Map(),channels=[],refreshes=[],states=[];let next=0;
  const timers={setInterval(fn){interval=fn;return 1;},clearInterval(){interval=null;},setTimeout(fn,delay){timeouts.set(++next,{fn,delay});return next;},clearTimeout(id){timeouts.delete(id);}};
  const client={channel(name){const listeners=[];const channel={name,listeners,on(_,config,fn){listeners.push({config,fn});return channel;},subscribe(fn){channel.status=fn;return channel;}};channels.push(channel);return channel;},removeChannel(channel){channel.removed=true;}};
  const sync=createOperationalSync({client,actor:'cashier',role:'CAIXA',warehouse:'VDCG',isCurrent:()=>active,onRefresh:async event=>{refreshes.push(event);},onState:state=>states.push(state),onStop:()=>{cleaned++;},timers,...options});
  return {sync,channels,refreshes,states,timeouts,deactivate(){active=false;},get cleaned(){return cleaned;},tick:()=>interval?.(),async fire(delay){const found=[...timeouts].find(([,task])=>task.delay===delay);assert.ok(found,'timer '+delay);timeouts.delete(found[0]);await found[1].fn();await Promise.resolve();}};
}
test('scoped operational channel coalesces events, ignores foreign stock, deduplicates and preserves safety reconciliation',async()=>{
  const f=fixture(),channel=f.channels[0];assert.ok(channel.name.includes('VDCG:cashier:CAIXA'));
  assert.ok(channel.listeners.every(({config})=>config.filter==='warehouse_code=eq.VDCG'));
  channel.status('SUBSCRIBED');const listener=channel.listeners.find(({config})=>config.table==='wms_caixa_request_messages').fn;
  listener({eventType:'INSERT',new:{id:1,warehouse_code:'VDAR'}});assert.equal(f.timeouts.size,0);
  listener({eventType:'INSERT',new:{id:2,warehouse_code:'VDCG',body:'Nunca registrar conteúdo'}});listener({eventType:'INSERT',new:{id:2,warehouse_code:'VDCG'}});
  assert.equal(f.timeouts.size,1);await f.fire(300);assert.deepEqual(f.refreshes[0].tables,['wms_caixa_request_messages']);
  for(let i=0;i<3;i++)await f.tick();assert.equal(f.refreshes.length,1);await f.tick();assert.equal(f.refreshes.length,2);assert.equal(f.refreshes[1].reason,'reconciliation');f.sync.stop();
});
test('reconnection uses 2,5,15,30 seconds, fallback remains active, recovery reconciles and old channels cannot revive',async()=>{
  const f=fixture();let old=f.channels[0];old.status('CHANNEL_ERROR');assert.equal(old.removed,true);await f.tick();assert.equal(f.refreshes.length,1);
  for(const delay of [2000,5000,15000,30000]){await f.fire(delay);const current=f.channels.at(-1);if(delay!==30000)current.status('TIMED_OUT');}
  f.channels.at(-1).status('SUBSCRIBED');await f.fire(300);assert.ok(f.states.includes('RECONECTANDO'));assert.equal(f.states.at(-1),'CONECTADO');
  const before=f.refreshes.length;f.deactivate();await f.tick();assert.equal(f.cleaned,1);assert.equal(f.channels.at(-1).removed,true);old.status('SUBSCRIBED');assert.equal(f.refreshes.length,before);assert.equal(f.timeouts.size,0);
});
test('diagnostics retain only allowlisted metadata and bounded history',()=>{
  for(let i=0;i<110;i++)recordOperationalDiagnostic({module:'caixa',event:'test',warehouse:'VDCG',operationId:String(i),token:'secret',body:'private',password:'password'});
  const events=operationalDiagnostics();assert.equal(events.length,100);assert.ok(!JSON.stringify(events).includes('secret'));assert.ok(!JSON.stringify(events).includes('private'));events[0].event='modified';assert.notEqual(operationalDiagnostics()[0].event,'modified');
});
test('unapplied publication keeps channels disabled and the existing 15-second read fallback active',async()=>{
  const f=fixture({allowRealtime:false});assert.equal(f.channels.length,0);await f.tick();assert.equal(f.refreshes.length,1);assert.equal(f.refreshes[0].reason,'poll');f.sync.stop();
});
