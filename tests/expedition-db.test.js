import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { workflowDatabase } from "./purchases-workflow-db.test.js";
import { deliverySla,expeditionActions } from "../src/expedition-workflow.js";

async function database() {
  const db = await workflowDatabase();
  await db.exec("reset role;alter table wms_users add column if not exists available_for_tasks boolean default true;");
  await db.exec(`alter table wms_transfers add column if not exists origem_codigo_loja text;
    alter table wms_transfers add column if not exists destino_codigo_loja text;
    alter table wms_transfers add column if not exists estabelecimento_codigo text;
    alter table wms_transfers add column if not exists archived_by_unification boolean default false;
    alter table wms_transfers add column if not exists total_skus numeric default 0;
    alter table wms_transfers add column if not exists total_expected_quantity numeric default 0;`);
  await db.exec(await readFile(new URL("../supabase/migrations/20261014162858_transfer_expedition_lifecycle.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../supabase/migrations/20261014163200_transfer_executive_metrics.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../supabase/migrations/20261014182622_expedition_scoped_user_columns.sql", import.meta.url), "utf8"));
  await db.exec(`revoke select on wms_users from authenticated;
    grant select(id,name,role,active,archived,available_for_tasks,default_warehouse_code,warehouse_code) on wms_users to authenticated;`);
  await db.exec("update wms_users set default_warehouse_code='A',available_for_tasks=true where id='actor';set role authenticated;");
  return db;
}

async function release(db,id="shipment") {
  await db.exec("select set_config('test.role','COMPRAS',false)");
  await db.query("insert into wms_transfers(id,warehouse_code,status) values($1,'A','PENDENTE')",[id]);
  await db.exec("select set_config('test.role','OPERADOR',false)");
  await db.query("insert into wms_transfer_items(id,transfer_id,warehouse_code,sku,quantidade_solicitada,quantidade_separada,quantidade_lacrada,status) values($1,$2,'A','00123',6,6,6,'LACRADO')",[id+"-item",id]);
  await db.query("update wms_transfers set total_caixas=6,separation_finished_at=now(),status='PRONTA_PARA_NOTA' where id=$1",[id]);
  await db.exec("select set_config('test.role','COMPRAS',false)");
  const path=`A/wms_transfers/${id}/nf.pdf`;
  await db.query("insert into storage.objects(id,bucket_id,name,metadata) values($1,'wms-transfer-invoices',$2,'{\"size\":500,\"mimetype\":\"application/pdf\"}')",[id+"-pdf",path]);
  await db.query("select wms_invoice_action('TRANSFERENCIA',$1,'PRONTA_PARA_NOTA','UPLOAD',$2,'upload')",[id,JSON.stringify({number:"0001",path,filename:"nf.pdf"})]);
  await db.query("select wms_invoice_action('TRANSFERENCIA',$1,'NF_ANEXADA','RELEASE','{}','release')",[id]);
  await db.exec("select set_config('test.role','OPERADOR',false)");
}

test("expedition: same transfer, atomic fiscal handoff, six versus five and audited resolution",async()=>{
  const db=await database();
  try {
    await release(db);
    const act=async(revision,action,data={},key=action)=>
      (await db.query("select wms_expedition_action('shipment',$1,$2,$3,$4) result",[revision,action,JSON.stringify(data),key])).rows[0].result;
    await assert.rejects(db.exec("select wms_invoice_action('TRANSFERENCIA','shipment','LIBERADA_PARA_ENVIO','DISPATCH','{}','bypass')"),/Gestao de Expedicao/);
    await assert.rejects(act(0,"COLLECT",{boxes:6}),/Transicao/);
    await db.exec("select set_config('test.role','COMPRAS',false)");
    await assert.rejects(act(0,"ASSIGN",{responsible_id:"actor"}),/autorizada/);
    await db.exec("select set_config('test.role','OPERADOR',false)");
    const assigned=await act(0,"ASSIGN",{responsible_id:"actor"});
    assert.ok(assigned.delivery_deadline);assert.equal(assigned.expedition_revision,1);
    await act(0,"ASSIGN",{responsible_id:"actor"});
    await assert.rejects(act(0,"COLLECT",{boxes:6}),/outro usuario/);
    await assert.rejects(act(1,"COLLECT",{boxes:5}),/conferidas/);
    const sent=await act(1,"COLLECT",{boxes:6});assert.equal(sent.invoice_stage,"DESPACHADA");
    await act(2,"TRANSIT");
    await assert.rejects(act(3,"DELIVER",{boxes:5}),/Justifique/);
    const divergent=await act(3,"DELIVER",{boxes:5,reason:"Uma caixa nao recebida"});
    assert.equal(divergent.expedition_stage,"ENTREGA_COM_DIVERGENCIA");
    assert.equal(divergent.invoice_stage,"RECEBIDA");assert.equal(divergent.finished_at,null);
    await assert.rejects(db.exec("select wms_invoice_action('TRANSFERENCIA','shipment','RECEBIDA','COMPLETE','{}','bypass-complete')"),/Resolva/);
    await assert.rejects(act(4,"RESOLVE",{reason:"Aceite"}),/gestor/);
    await db.exec("select set_config('test.role','SUPERVISOR',false)");
    await assert.rejects(db.exec("update wms_transfers set expedition_stage='ENTREGUE',received_boxes=null,expedition_action_id='erase-count',delivery_reason='Aceite' where id='shipment'"),/contagem original/);
    const done=await act(4,"RESOLVE",{reason:"Caixa localizada e entrega confirmada"});
    assert.equal(done.invoice_stage,"FINALIZADA");assert.equal(done.received_boxes,5);assert.ok(done.finished_at);
    assert.ok(done.delivery_resolved_at);assert.equal(done.delivered_at,divergent.delivered_at);
    assert.equal((await db.query("select count(*)::int n from wms_transfer_events where id like 'expedition:shipment:%'")).rows[0].n,5);
    assert.equal((await db.query("select count(*)::int n from wms_notifications where event_type='EXPEDITION_ASSIGNED'")).rows[0].n,1);
    await db.exec("select wms_invoice_action('TRANSFERENCIA','shipment','FINALIZADA','REOPEN','{\"reason\":\"Recontagem\"}','reopen')");
    assert.equal((await db.query("select expedition_stage from wms_transfers where id='shipment'")).rows[0].expedition_stage,"");
  } finally {await db.close();}
});

test("expedition: compatible assignee, scope, integral delivery and no changes to legacy",async()=>{
  const db=await database();
  try {
    await release(db,"integral");
    const act=(id,revision,action,data,key)=>db.query("select wms_expedition_action($1,$2,$3,$4,$5) result",[id,revision,action,JSON.stringify(data),key]);
    await assert.rejects(act("missing",0,"ASSIGN",{responsible_id:"actor"},"assign"),/nao encontrada/);
    await db.exec("reset role;insert into wms_users(id,name,username,role,default_warehouse_code,available_for_tasks) values('other','Other','other','OPERADOR','B',true);set role authenticated;");
    await assert.rejects(act("integral",0,"ASSIGN",{responsible_id:"other"},"other"),/unidade de origem/);
    await db.exec("update wms_users set available_for_tasks=false where id='actor'");
    await assert.rejects(act("integral",0,"ASSIGN",{responsible_id:"actor"},"unavailable"),/disponivel/);
    await db.exec("update wms_users set available_for_tasks=true where id='actor'");
    await act("integral",0,"ASSIGN",{responsible_id:"actor"},"assign");
    await act("integral",1,"COLLECT",{boxes:6},"collect");
    const done=(await act("integral",2,"DELIVER",{boxes:6},"deliver")).rows[0].result;
    assert.equal(done.invoice_stage,"FINALIZADA");assert.equal(done.expedition_stage,"ENTREGUE");
    const summary=(await db.query("select wms_transfer_executive_summary(current_date-1,current_date+1,'A') result")).rows[0].result;
    assert.equal(summary.created,1);assert.equal(summary.delivered,1);assert.equal(summary.otd_percent,100);
    assert.equal(summary.received_boxes,6);assert.equal(summary.daily.reduce((n,d)=>n+d.transfers,0),summary.created);
    assert.equal((await db.query("select wms_transfer_executive_summary(current_date-1,current_date+1,'A',null,'absent') result")).rows[0].result.created,0);
    const empty=(await db.query("select wms_transfer_executive_summary(current_date-1,current_date+1,'A',null,null,'EM_TRANSITO') result")).rows[0].result;
    assert.equal(empty.created,0);assert.equal(empty.otd_percent,null);
    await assert.rejects(db.exec("select wms_transfer_executive_summary(current_date-1,current_date+1,'B')"),/nao autorizados/);
    await assert.rejects(db.exec("select wms_transfer_executive_summary(current_date-400,current_date,'A')"),/periodo/);
    await db.exec("insert into wms_transfers(id,warehouse_code,status) values('legacy','A','PENDENTE');update wms_transfers set status='FINALIZADA' where id='legacy'");
    assert.equal((await db.query("select expedition_stage from wms_transfers where id='legacy'")).rows[0].expedition_stage,"");
  } finally {await db.close();}
});

test("delivery SLA has exact deadline, configurable attention and does not invent missing dates",()=>{
  const start=Date.parse("2026-10-14T12:00:00Z"),end=start+24*3600000;
  const r={invoice_released_at:new Date(start).toISOString(),delivery_deadline:new Date(end).toISOString()};
  assert.equal(deliverySla(r,start+19*3600000),"No prazo");
  assert.equal(deliverySla(r,start+20*3600000),"Atencao");
  assert.equal(deliverySla(r,start+20*3600000,90),"No prazo");
  assert.equal(deliverySla(r,end+1),"Atrasado");
  assert.equal(deliverySla({...r,delivered_at:new Date(end).toISOString()},end+100),"No prazo");
  assert.equal(deliverySla({}),"Sem prazo");
  assert.deepEqual(expeditionActions({expedition_stage:"EM_TRANSITO",expedition_responsible_id:"a"},{id:"b",role:"OPERADOR"}),[]);
  assert.deepEqual(expeditionActions({invoice_stage:"LIBERADA_PARA_ENVIO"},{id:"a",role:"COMPRAS"}),[["ASSIGN","Atribuir expedicao"]]);
  assert.deepEqual(expeditionActions({expedition_stage:"EM_TRANSITO"},{id:"a",role:"COMPRAS"}),[]);
});

test("expedition assignment: purchases can assign active users across units without operational privileges",async()=>{
  const db=await database();
  try {
    await db.exec("reset role");
    await db.exec(await readFile(new URL("../docs/expedition-assignment-access.sql",import.meta.url),"utf8"));
    await db.exec("insert into wms_users(id,name,username,role,default_warehouse_code,available_for_tasks) values('buyer','Buyer','buyer','COMPRAS','B',false),('inactive','Inactive','inactive','OPERADOR','B',true);update wms_users set active=false where id='inactive';set role authenticated;");
    await release(db,"assignment-access");
    await db.exec("select set_config('test.role','COMPRAS',false)");
    const act=(revision,action,data,key)=>db.query("select wms_expedition_action('assignment-access',$1,$2,$3,$4) result",[revision,action,JSON.stringify(data),key]);
    await assert.rejects(act(0,"ASSIGN",{responsible_id:"inactive"},"inactive"),/ativo/);
    const result=(await act(0,"ASSIGN",{responsible_id:"buyer"},"buyer")).rows[0].result;
    assert.equal(result.expedition_responsible_id,"buyer");
    assert.equal(result.expedition_responsible_name,"Buyer");
    await assert.rejects(act(1,"COLLECT",{boxes:6},"collect"),/autorizada/);
    await assert.rejects(act(1,"ASSIGN",{responsible_id:"actor"},"missing-reason"),/justificativa/);
    await act(1,"ASSIGN",{responsible_id:"actor",reason:"Nova equipe"},"reassign");
    await db.exec("select set_config('test.role','OPERADOR',false)");
    await act(2,"COLLECT",{boxes:6},"operator-collect");
  } finally {await db.close();}
});

