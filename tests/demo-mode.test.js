import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createDemoSession, FEATURE_DEMO_MODE, getDemoDashboardSummary, loadDemoScenario } from "../src/demo-scenario.js";
import { createDemoRequestGuard } from "../src/demo-request-guard.js";

test("demo is disabled by default and activation/actions require a current administrator",()=>{
  assert.equal(FEATURE_DEMO_MODE,false);
  for(const role of ["OPERADOR","SUPERVISOR","COMPRAS","ATENDENTE"])assert.throws(()=>createDemoSession(()=>({role})).activate("22796"),/ADMINISTRADOR/);
  let user={role:"ADMINISTRADOR"};const session=createDemoSession(()=>user);
  assert.equal(session.isDemoMode(),false);session.activate("22796");assert.equal(session.isDemoMode(),true);
  user={role:"OPERADOR"};assert.equal(session.isDemoMode(),false);assert.throws(()=>session.advanceDemoTransfer(),/administrador/);
});

test("demo simulates quantities and invoice handoff without touching the input or real records",()=>{
  const real={balance:154,warehouse_code:"22796"};const before=JSON.stringify(real);
  const session=createDemoSession(()=>({role:"ADMINISTRADOR"}),()=>"2026-10-14T12:00:00Z");session.activate(real.warehouse_code);
  session.createDemoTransfer();assert.equal(session.advanceDemoTransfer(),"EM_SEPARACAO");
  assert.equal(session.advanceDemoTransfer(),"SEPARACAO_CONCLUIDA");
  let s=session.getScenario(),summary=getDemoDashboardSummary(s);assert.equal(summary.requested,9);assert.equal(summary.separated,8);assert.equal(summary.checked,8);assert.equal(summary.divergence,1);
  assert.equal(s.transfer.items[0].sku,"01302");assert.equal(s.transfer.boxes,2);
  session.advanceDemoTransfer();session.advanceDemoTransfer();assert.equal(session.getScenario().transfer.status,"PRONTA_PARA_NOTA");
  assert.throws(()=>session.advanceDemoTransfer(),/PDF DEMO/);
  session.attachDemoPdf("NF_DEMO_000001.pdf");assert.equal(session.getScenario().transfer.pdf.source,"SIMULADO");
  for(const stage of ["LIBERADA_PARA_ENVIO","DESPACHADA","RECEBIDA","FINALIZADA"])assert.equal(session.advanceDemoTransfer(),stage);
  assert.equal(getDemoDashboardSummary(session.getScenario()).open,0);assert.equal(JSON.stringify(real),before);
  assert.equal(session.getScenario().notifications.length,2);
  session.resetDemoScenario();s=session.getScenario();assert.equal(s.transfer.status,"AGUARDANDO_SEPARACAO");assert.equal(s.transfer.pdf,null);assert.equal(s.transfer.timeline.length,0);
  session.deactivate();assert.equal(session.isDemoMode(),false);assert.throws(()=>session.getScenario(),/DEMO/);
});

test("reverse logistics demo counts exactly 72 of 100 and replenishment stays local",()=>{
  const session=createDemoSession(()=>({role:"ADMINISTRADOR"}));session.activate("22796");
  let summary=getDemoDashboardSummary(session.getScenario());assert.equal(summary.realized,72);assert.equal(summary.percent,72);assert.equal(summary.remaining,28);
  for(let n=0;n<3;n++)session.createDemoReverseLogistics();assert.equal(getDemoDashboardSummary(session.getScenario()).realized,72);
  for(const stage of ["EM_SEPARACAO","SEPARADO","CONCLUIDO"])assert.equal(session.advanceDemoReplenishment(),stage);
  assert.equal(session.getScenario().replenishment.attended,2);assert.equal(getDemoDashboardSummary(session.getScenario()).replenishments,0);
  assert.throws(()=>session.setWarehouseReference("VDCO",["22796"]),/autorizada/);
  const s=loadDemoScenario();assert.equal(s.is_demo,true);assert.ok(s.reverse.every(r=>r.is_demo));assert.ok(s.transfer.items.every(i=>i.is_demo));
  summary=getDemoDashboardSummary(s);assert.equal(summary.open,1);assert.equal(summary.replenishments,1);
});

test("demo modules have no persistence or operational write clients",async()=>{
  const state=await readFile(new URL("../src/demo-scenario.js",import.meta.url),"utf8");
  const view=await readFile(new URL("../src/demo-mode.js",import.meta.url),"utf8");
  assert.doesNotMatch(state+view,/\.from\(|\.rpc\(|\.storage\.|\.insert\(|\.update\(|\.upsert\(|localStorage|indexedDB|fetch\(/);
  const source=await readFile(new URL("../script.js",import.meta.url),"utf8");
  const context=source.slice(source.indexOf("async function openDemoModeScreen"),source.indexOf("async function openCpWorkflowScreen"));
  assert.match(context,/\.select\("codigo_material,nome_material,total_disponivel,codigo_endereco"\)/);
  assert.match(context,/\.eq\("warehouse_code",code\)/);assert.match(context,/\.limit\(1\)/);
  assert.doesNotMatch(context,/\.insert\(|\.update\(|\.upsert\(|\.rpc\(|\.storage\./);
  assert.match(source,/if \(screenId === "demoMode"\) return IS_CP_ALAMO && isAdmin\(\);/);
});

test("DEMO network guard blocks real mutations/uploads/RPCs while preserving reads and normal mode",async()=>{
  const calls=[];let active=true;const response={ok:true};
  const guarded=createDemoRequestGuard(async (...args)=>{calls.push(args);return response;},()=>active);
  for(const path of ["rest/v1/wms_transfers","rest/v1/rpc/wms_invoice_action","storage/v1/object/wms-transfer-invoices/file.pdf","functions/v1/manage-wms-user"]) {
    for(const method of ["POST","PATCH","PUT","DELETE"])await assert.rejects(guarded("https://example.supabase.co/"+path,{method}),/bloqueados/);
  }
  assert.equal(calls.length,0);
  await assert.rejects(guarded("https://example.supabase.co/auth/v1/user",{method:"PUT"}),/bloqueados/);
  assert.equal(await guarded("https://example.supabase.co/rest/v1/wms_stock_positions",{method:"GET"}),response);
  // Refreshing authentication is infrastructure, not a demo business operation.
  assert.equal(await guarded("https://example.supabase.co/auth/v1/token",{method:"POST"}),response);
  active=false;const options={method:"POST",body:"original"};
  assert.equal(await guarded("https://example.supabase.co/rest/v1/wms_transfers",options),response);
  assert.equal(calls[2][1],options);
});
