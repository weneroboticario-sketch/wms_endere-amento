import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {isGlobalAdministrator,isGlobalView,operationalWarehouses,captacaoFreshness,warehouseAttention,createGlobalDashboardService} from "../src/global-dashboard-service.js";

const control={id:"1",username:"admin",active:true,archived:false,role:"ADMINISTRADOR",defaultWarehouseCode:"DOURADOS"};
test("control scope uses username, active profile, role, default warehouse and current scope",()=>{
  assert.equal(isGlobalAdministrator(control),true);
  assert.equal(isGlobalAdministrator({...control,username:"tnogueira"}),true);
  for(const change of [{username:"other"},{active:false},{archived:true},{role:"SUPERVISOR"},{role:"OPERADOR"},{role:"ATENDENTE"},{defaultWarehouseCode:"14177"}])assert.equal(isGlobalAdministrator({...control,...change}),false);
  assert.equal(isGlobalView(control,"DOURADOS"),true);
  assert.equal(isGlobalView(control,"22796"),false);
  assert.deepEqual(operationalWarehouses([{code:"DOURADOS",active:true},{code:"NEW",active:true},{code:"OFF",active:false}]).map(w=>w.code),["NEW"]);
});
test("freshness and attention thresholds are configurable and missing data is not online presence",()=>{
  const now=Date.parse("2026-10-13T14:00:00Z");
  const batch={status:"COMPLETED",finished_at:"2026-10-13T10:00:00Z"};
  assert.equal(captacaoFreshness(batch,{freshHours:2,staleHours:3},now),"DESATUALIZADO");
  assert.equal(captacaoFreshness({...batch,status:"FAILED"},undefined,now),"ERRO");
  assert.equal(captacaoFreshness(null),"DESATUALIZADO");
  assert.equal(warehouseAttention({active:1,available:2,pending:1,freshness:"ATUALIZADO"}),"NORMAL");
  assert.equal(warehouseAttention({active:0}),"CRITICO");
});
test("short cache is user scoped and targeted invalidation preserves unrelated domains",async()=>{
  let user=control;
  const calls=[];
  const client={rpc:async(_,args)=>{calls.push(args.p_section);return {data:{rows:[]},error:null};}};
  const service=createGlobalDashboardService(client,()=>user);
  await service.getDetails("tasks",{});await service.getDetails("tasks",{});
  assert.deepEqual(calls,["tasks"]);
  await service.getDetails("transfers",{});
  service.invalidate("tasks");await service.getDetails("transfers",{});await service.getDetails("tasks",{});
  assert.deepEqual(calls,["tasks","transfers","tasks"]);
  user={...control,id:"2",username:"tnogueira"};await service.getDetails("tasks",{});
  assert.equal(calls.length,4);
  user={...control,username:"other"};await assert.rejects(service.getDetails("tasks",{}),/nao autorizada/);
});
test("overview isolates a failed source and does not load stock positions or transfer items",async()=>{
  const sections=[];
  const query={select:()=>query,eq:()=>query,neq:()=>query,order:async()=>({data:[{code:"NEW",name:"Novo",active:true},{code:"DOURADOS",active:true}]})};
  const service=createGlobalDashboardService({from:table=>{assert.equal(table,"wms_warehouses");return query;},rpc:async(_,args)=>{sections.push(args.p_section);return args.p_section==="replenishment_summary"?{error:{message:"Unavailable"}}:{data:{summary:[],rows:[]}};}},()=>control);
  const data=await service.getGlobalOverview();
  assert.equal(data.warehouses.length,1);
  assert.equal(data.errors.replenishment,"Unavailable");
  assert.ok(data.tasks);assert.ok(data.transfers);assert.equal(sections.length,7);
});
test("an event in tasks does not cancel an in-flight transfer query",async()=>{
  let finish;
  const service=createGlobalDashboardService({rpc:()=>new Promise(resolve=>{finish=resolve;})},()=>control);
  const query=service.getDetails("transfers",{});
  service.invalidate("tasks");finish({data:{rows:[]}});
  assert.deepEqual(await query,{rows:[]});
});
test("login and warehouse switching keep operational loading outside the global path",async()=>{
  const source=await readFile(new URL("../script.js",import.meta.url),"utf8");
  const login=source.slice(source.indexOf("  async function enterAuthenticatedApp("),source.indexOf("  function showLogin("));
  assert.ok(login.indexOf('if (isGlobalDashboardScope())')<login.indexOf('ensureOperationalCatalog()'));
  assert.match(login,/showScreen\("globalDashboard"\);[\s\S]*?return;/);
  const realtime=await readFile(new URL("../src/global-dashboard-view.js",import.meta.url),"utf8");
  assert.doesNotMatch(realtime,/wms_stock_positions/);
  assert.match(realtime,/operacao_tarefas:"tasks"/);
  assert.match(realtime,/wms_stock_import_batches:"captacao"/);
});
