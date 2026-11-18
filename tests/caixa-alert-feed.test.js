import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCaixaAlertFeed } from '../src/caixa-alert-feed.js';

const row = (id, extra={}) => ({id,sku:'01314',kind:'ADJUSTMENT',warehouse_code:'VDCG',requested_by:'cashier',status:'PENDENTE',customer_service:false,...extra});
function fixture(options={}) {
  let rows=[],current=true,finish,failure;
  const alerts=[],counts=[],calls=[],saved=new Map(),listeners=[];
  const storage={getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)};
  const client={rpc:async(name,args)=>{calls.push({name,args});if(failure)throw failure;if(options.delayed)return new Promise(resolve=>{finish=resolve;});return {data:rows};},channel(){const channel={on(_,config,fn){listeners.push({config,fn});return channel;},subscribe(){return channel;}};return channel;},removeChannel(){}};
  const timers={setInterval(){return 1;},clearInterval(){},setTimeout(){return 1;},clearTimeout(){}};
  const feed=createCaixaAlertFeed({client,actor:'stock',role:'OPERADOR',warehouse:'VDCG',isCurrent:()=>current,onAlert:items=>alerts.push(items),onCount:n=>counts.push(n),storage,timers,...options});
  return {feed,alerts,counts,calls,listeners,storage,rows(value){rows=value;},invalidate(){current=false;},fail(error){failure=error;},finish(value){finish(value);}};
}

test('global feed starts from a silent baseline and counts pending without changing tabs or claiming requests',async()=>{
  const f=fixture();f.rows([row('old')]);await f.feed.read();
  assert.equal(f.counts.at(-1),1);assert.equal(f.alerts.length,0);
  f.rows([row('new',{customer_service:false}),row('old')]);await f.feed.read();
  assert.equal(f.alerts.length,1);assert.equal(f.alerts[0][0].sku,'01314');assert.equal(f.counts.at(-1),2);
  assert.ok(f.calls.every(call=>call.name==='list_wms_caixa_attendance'&&call.args.code==='VDCG'));
});

test('Supabase updates do not repeat alerts; distinct requests of the same SKU remain distinct',async()=>{
  const f=fixture();await f.feed.read();f.rows([row('one')]);await f.feed.read();
  f.rows([row('one',{updated_at:'later'})]);await f.feed.read();
  assert.equal(f.alerts.length,1);
  f.rows([row('two'),row('one')]);await f.feed.read();assert.equal(f.alerts.length,2);
});

test('closed, assigned, foreign warehouse and other cashier data are never urgent new requests',async()=>{
  const f=fixture();await f.feed.read();
  f.rows([row('closed',{status:'CANCELADO'}),row('claimed',{claimed_by:'other'}),row('foreign',{warehouse_code:'VDAR'})]);await f.feed.read();
  assert.equal(f.alerts.length,0);assert.equal(f.counts.at(-1),1);
  const c=fixture({role:'CAIXA',actor:'cashier'});await c.feed.read();c.rows([row('own'),row('not-own',{requested_by:'other'})]);await c.feed.read();
  assert.equal(c.feed.snapshot().length,1);assert.equal(c.alerts.length,0);
});

test('equivalent simultaneous feed reads share one RPC; logout discards response and cleans count',async()=>{
  const f=fixture({delayed:true});const one=f.feed.read(),two=f.feed.read();assert.equal(one,two);assert.equal(f.calls.length,1);
  f.invalidate();f.finish({data:[row('obsolete')]});await assert.rejects(one,/mudou/);
  assert.equal(f.counts.length,0);f.feed.close();assert.equal(f.counts.at(-1),0);
});

test('two tabs share notification IDs without hiding pending requests or deduplicating by SKU',async()=>{
  const first=fixture(),second=fixture({storage:null});
  first.feed.close();second.feed.close();
  const saved=new Map(),storage={getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)};
  const a=fixture({storage}),b=fixture({storage});await a.feed.read();await b.feed.read();
  a.rows([row('new')]);b.rows([row('new')]);await a.feed.read();await b.feed.read();
  assert.equal(a.alerts.length+b.alerts.length,1);assert.equal(a.counts.at(-1),1);assert.equal(b.counts.at(-1),1);
});

test('a new tab silent baseline cannot consume an alert belonging to an already active tab',async()=>{
  const saved=new Map(),storage={getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)};
  const active=fixture({storage}),opening=fixture({storage,delayed:true});await active.feed.read();
  const baseline=opening.feed.read();opening.finish({data:[row('new')]});await baseline;
  active.rows([row('new')]);await active.feed.read();assert.equal(active.alerts.length,1);
});

test('connection failure retains last pending count and does not synthesize rows',async()=>{
  const f=fixture();f.rows([row('real')]);await f.feed.read();f.fail(Error('offline'));
  await assert.rejects(f.feed.read(),/offline/);assert.equal(f.counts.at(-1),1);assert.equal(f.feed.snapshot()[0].id,'real');assert.equal(f.alerts.length,0);
});

test('a new request assigned directly to the current operator still alerts once',async()=>{
  const f=fixture();await f.feed.read();f.rows([row('assigned',{claimed_by:'stock',status:'EM_VERIFICACAO'})]);await f.feed.read();
  assert.equal(f.alerts.length,1);await f.feed.read();assert.equal(f.alerts.length,1);
});

test('one scoped channel follows requests, chat and linked product status; settings close removes listeners',async()=>{
  const f=fixture();let updates=0;const unsub=f.feed.subscribe(()=>updates++);f.feed.start();await f.feed.read();
  assert.deepEqual(f.listeners.map(x=>x.config.table),['wms_caixa_requests','wms_caixa_request_messages','wms_replenishment_requests']);
  assert.ok(f.listeners.every(x=>x.config.filter==='warehouse_code=eq.VDCG'));
  const initial=updates;unsub();await f.feed.read();assert.equal(updates,initial);f.feed.close();
});

test('cashier panel belongs only to its own screen; urgent presentation never navigates or changes forms on arrival',async()=>{
  const [html,ui,source]=await Promise.all(['../index.html','../src/caixa-alerts.js','../script.js'].map(file=>readFile(new URL(file,import.meta.url),'utf8')));
  const replenishment=html.slice(html.indexOf('<section class="screen" id="reposicao">'),html.indexOf('<section class="screen" id="transferencias"'));
  assert.ok(!replenishment.includes('id="caixaRequestsRoot"'));
  assert.match(html,/<section class="screen" id="atendimentosCaixa" hidden>/);
  assert.match(ui,/setTimeout\(dismiss, 8000\)/);assert.match(ui,/later\.onclick = dismiss/);
  assert.doesNotMatch(ui,/\.focus\(|showModal|dialog\.close\(|getUserMedia|showScreen|innerHTML/);
  assert.match(source,/if \(screenId === "atendimentosCaixa"\)/);
});

test('legacy fixed task panel excludes cashier products and adjustments while retaining other tasks',async()=>{
  const source=await readFile(new URL('../script.js',import.meta.url),'utf8');
  const code=source.slice(source.indexOf('  function getActiveUserTasks()'),source.indexOf('  function renderOperatorTasksAlert()'));
  const env={IS_CP_ALAMO:false,authState:{currentUser:{id:'stock',role:'OPERADOR'}},getVisibleTransfers:()=>[],
    getMyOperationalTasks:()=>[{id:'cashier-adjustment',referenceType:'CAIXA_AJUSTE',status:'EM_EXECUCAO'},{id:'regular-task',status:'EM_EXECUCAO'}],
    getVisibleReplenishmentRequests:()=>[{id:'caixa-product',status:'PENDENTE'},{id:'regular-product',status:'PENDENTE'}],
    canClaimReplenishmentRequest:()=>true,normalizeText:value=>String(value||'')};
  const read=new Function('env','with(env){'+code+';return getActiveUserTasks;}')(env);
  assert.deepEqual(read().map(task=>task.id),['regular-task','regular-product']);
});
