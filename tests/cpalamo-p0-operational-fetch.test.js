import test from "node:test";
import assert from "node:assert/strict";
import { createCpOperationalFetchGuard } from "../src/cpalamo-p0-operational-fetch.js";

const URL_ROOT = "https://ztxdqvxvkfgfqowaiaep.supabase.co";
const ids = count => Array.from({length:count},(_,i)=>"00000000-0000-4000-8000-"+String(i).padStart(12,"0"));
const url = ids => URL_ROOT+"/rest/v1/operacao_tarefas_historico?select=id%2Ctarefa_id%2Cdata_evento&tarefa_id=in.("+ids.join(",")+")&order=data_evento.desc";
const okay = obj => new globalThis.Response(JSON.stringify(obj),{status:200,headers:{"content-type":"application/json"}});
const auth = exp => "Bearer a."+globalThis.btoa(JSON.stringify({exp}))+".c";
const memoryStore = initial => {
  const data=new Map(Object.entries(initial||{}));
  return {getItem:key=>data.get(key)||null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k),keys:()=>[...data.keys()]};
};

test("normal queries do not get rewritten",async()=>{
  let called=0;
  const guard=createCpOperationalFetchGuard((input,init)=>{called++;assert.equal(init?.method,"PATCH");return Promise.resolve(okay([]));});
  assert.ok((await guard(URL_ROOT+"/rest/v1/wms_replenishment_requests",{method:"PATCH"})).ok);
  assert.equal(called,1);
});

test("history request splits large .in list, preserves union and global newest order",async()=>{
  const idList=ids(77), batches=[];
  const guard=createCpOperationalFetchGuard(async input=>{
    const u=new URL(input);
    const subset=u.searchParams.get("tarefa_id").slice(4,-1).split(",");
    batches.push(subset);
    assert.ok(subset.length<=35);
    return okay(subset.map((id,i)=>({id:i+1,tarefa_id:id,data_evento:new Date(1793000000000+(Number(id.slice(-6))*1000)).toISOString()})));
  });
  const response=await guard(url(idList));
  assert.equal(response.status,200);
  const rows=await response.json();
  assert.equal(batches.length,3);
  assert.equal(rows.length,77);
  assert.deepEqual(new Set(rows.map(x=>x.tarefa_id)),new Set(idList));
  assert.ok(rows[0].data_evento>=rows[76].data_evento);
});

test("history query remains unchanged when small",async()=>{
  const target=url(ids(10)); let called=0;
  const guard=createCpOperationalFetchGuard(async input=>{called++;assert.equal(input,target);return okay([{x:1}]);});
  assert.deepEqual(await (await guard(target)).json(),[{x:1}]);
  assert.equal(called,1);
});

test("batch failure returns server error, never partial history",async()=>{
  let called=0;
  const guard=createCpOperationalFetchGuard(async()=>{called++;return called===2?new globalThis.Response('{"error":"timeout"}',{status:500}):okay([{id:1}]);});
  const res=await guard(url(ids(70)));
  assert.equal(res.status,500);
});

test("expired-token 401 retries a GET once after Supabase has refreshed in storage",async()=>{
  const earlier=auth(100), refreshed=auth(5000);
  const attempts=memoryStore(),storage=memoryStore({"wms-supabase-auth":JSON.stringify({access_token:refreshed.slice(7)})});
  const headers={authorization:earlier}; let calls=0,reloads=0;
  const guard=createCpOperationalFetchGuard(async(input,init)=>{
    calls++;
    if(calls===1){assert.equal(new globalThis.Headers(init.headers).get('authorization'),earlier);return new globalThis.Response('{}',{status:401});}
    assert.equal(new globalThis.Headers(init.headers).get('authorization'),refreshed);
    return okay([{ok:true}]);
  },{storage,attempts,wait:()=>Promise.resolve(),now:()=>1_000_000,reload:()=>reloads++});
  const res=await guard(URL_ROOT+"/rest/v1/operacao_tarefas",{headers});
  assert.deepEqual(await res.json(),[{ok:true}]);
  assert.equal(calls,2);assert.equal(reloads,0);
});

test("401 with a still valid JWT is not transformed or treated as expired",async()=>{
  let reloads=0;
  const guard=createCpOperationalFetchGuard(async()=>new globalThis.Response('{}',{status:401}),{reload:()=>reloads++,now:()=>1000});
  const res=await guard(URL_ROOT+"/rest/v1/operacao_tarefas",{headers:{authorization:auth(9999)}});
  assert.equal(res.status,401);assert.equal(reloads,0);
});

test("expired-token 401 reloads once and then fails closed without deleting other keys",async()=>{
  const storage=memoryStore({"wms-supabase-auth":JSON.stringify({access_token:auth(5).slice(7)}),theme:"dark"});
  const attempts=memoryStore();let reloads=0;
  const fetcher=async()=>new globalThis.Response('{}',{status:401});
  const options={storage,attempts,wait:()=>Promise.resolve(),now:()=>1_000_000,reload:()=>reloads++};
  await createCpOperationalFetchGuard(fetcher,options)(URL_ROOT+"/rest/v1/wms_replenishment_requests",{headers:{authorization:auth(5)}});
  assert.equal(reloads,1);assert.ok(storage.getItem("wms-supabase-auth"));
  await createCpOperationalFetchGuard(fetcher,options)(URL_ROOT+"/rest/v1/wms_replenishment_requests",{headers:{authorization:auth(5)}});
  assert.equal(reloads,2);assert.equal(storage.getItem("wms-supabase-auth"),null);assert.equal(storage.getItem("theme"),"dark");
});

test("non-CP Auth requests are neither retried nor redirected",async()=>{
  let reloads=0;
  const guard=createCpOperationalFetchGuard(async()=>new globalThis.Response('{}',{status:401}),{now:()=>1000,reload:()=>reloads++});
  assert.equal((await guard(URL_ROOT+"/auth/v1/token",{method:"POST",headers:{authorization:auth(5)}})).status,401);
  assert.equal(reloads,0);
});
