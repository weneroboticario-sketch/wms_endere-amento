import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {workflowDatabase} from "./purchases-workflow-db.test.js";
import {canRetireTransfer,retentionLabel} from "../src/transfer-retention.js";
import {purgeExpiredTransfers,transferDocumentPrefix} from "../supabase/functions/purge-transfer-retention/worker.js";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
async function database(){
  const db=await workflowDatabase();
  await db.exec(`reset role;create role service_role;
    alter table wms_users add column if not exists available_for_tasks boolean default true;
    alter table wms_transfers add column if not exists origem_codigo_loja text;
    alter table wms_transfers add column if not exists destino_codigo_loja text;
    alter table wms_transfers add column if not exists estabelecimento_codigo text;
    alter table wms_users add column if not exists warehouse_code text;
    alter table wms_notifications add column if not exists archived boolean default false;
    alter table wms_notifications add column if not exists archived_at timestamptz;
    create table operacao_tarefas(id text primary key,referencia_tipo text,referencia_id text,status text,
      arquivada boolean default false,arquivada_por text,data_arquivamento timestamptz,motivo_cancelamento text);
    create table operacao_tarefas_historico(id text primary key,tarefa_id text references operacao_tarefas on delete cascade);
    update wms_users set default_warehouse_code='A';`);
  for(const path of ["supabase/migrations/20261014162858_transfer_expedition_lifecycle.sql","supabase/migrations/20261014182622_expedition_scoped_user_columns.sql","docs/expedition-assignment-access.sql","docs/expedition-cancellation.sql","docs/transfer-retention.sql"])
    await db.exec(await read(path));
  await db.exec("set role authenticated;select set_config('test.role','COMPRAS',false)");return db;
}
async function seed(db,id="test"){
  await db.query("insert into wms_transfers(id,warehouse_code,status) values($1,'A','PENDENTE')",[id]);
  await db.query("insert into wms_transfer_items(id,transfer_id,warehouse_code,sku,quantidade_solicitada) values($1,$2,'A','001',5)",[id+"-item",id]);
  await db.exec("reset role");
  await db.query("insert into operacao_tarefas(id,referencia_tipo,referencia_id,status) values($1,'TRANSFERENCIA',$2,'EM_ANDAMENTO')",[id+"-task",id]);
  await db.query("insert into operacao_tarefas_historico values($1,$2)",[id+"-history",id+"-task"]);
  await db.exec("set role authenticated");
}
const retire=(db,id,kind="DELETED",reason="Solicitacao duplicada",expected=null)=>db.query(
  "select wms_retire_transfer($1,$2,$3,coalesce($4::timestamptz,(select updated_at from wms_transfers where id=$1))) result",[id,kind,reason,expected]);

test("retention: atomic retirement, mandatory reason, permissions, frozen data and task archive",async()=>{
  const db=await database();try{
    await seed(db);
    await assert.rejects(retire(db,"test","DELETED"," "),/justificativa/);
    await assert.rejects(retire(db,"test","DELETED","Motivo valido","2000-01-01T00:00:00Z"),/alterada/);
    await db.exec("select set_config('test.role','OPERADOR',false)");
    await assert.rejects(retire(db,"test"),/autorizada/);
    await db.exec("select set_config('test.role','COMPRAS',false)");
    const row=(await retire(db,"test")).rows[0].result;
    assert.equal(row.is_deleted,true);assert.equal(row.removal_kind,"DELETED");assert.equal(row.status,"PENDENTE");
    assert.equal(Date.parse(row.purge_after)-Date.parse(row.deleted_at),60*86400000);
    assert.equal((await retire(db,"test")).rows[0].result.purge_after,row.purge_after);
    assert.equal((await db.query("select count(*)::int n from wms_transfer_items where transfer_id='test'")).rows[0].n,1);
    await assert.rejects(db.exec("update wms_transfers set status='FINALIZADA' where id='test'"),/fora da operacao/);
    await assert.rejects(db.exec("delete from wms_transfers where id='test'"),/60 dias/);
    await assert.rejects(db.exec("select wms_transfer_purge_candidates()"),/permission denied/);
    await db.exec("reset role");
    const task=(await db.query("select * from operacao_tarefas where id='test-task'")).rows[0];
    assert.equal(task.arquivada,true);assert.equal(task.status,"CANCELADA");
    assert.equal((await db.query("select count(*)::int n from wms_transfer_events where event_type='TRANSFER_DELETED' and transfer_id='test'")).rows[0].n,1);
    await db.exec("set role authenticated;select set_config('test.role','COMPRAS',false)");
    await seed(db,"fiscal");
    await db.exec("select set_config('test.role','OPERADOR',false);update wms_transfer_items set quantidade_separada=5,quantidade_lacrada=5,status='LACRADO' where transfer_id='fiscal';update wms_transfers set total_caixas=6,separation_finished_at=now(),status='PRONTA_PARA_NOTA' where id='fiscal';");
    await db.exec(`select set_config('test.role','COMPRAS',false);
      insert into storage.objects(id,bucket_id,name,metadata) values('fiscal-pdf','wms-transfer-invoices','A/wms_transfers/fiscal/nf.pdf','{"size":500,"mimetype":"application/pdf"}');
      select wms_invoice_action('TRANSFERENCIA','fiscal','PRONTA_PARA_NOTA','UPLOAD','{"number":"9999999","path":"A/wms_transfers/fiscal/nf.pdf","filename":"nf.pdf"}','upload');
      select wms_invoice_action('TRANSFERENCIA','fiscal','NF_ANEXADA','RELEASE','{}','release');
      select set_config('test.role','SUPERVISOR',false);
      select wms_expedition_action('fiscal',0,'ASSIGN','{"responsible_id":"actor"}','assign');
      select wms_expedition_action('fiscal',1,'COLLECT','{"boxes":6}','collect');
      select wms_expedition_action('fiscal',2,'DELIVER','{"boxes":5,"reason":"Uma caixa pendente"}','deliver');`);
    const fiscal=(await retire(db,"fiscal")).rows[0].result;
    assert.equal(fiscal.is_deleted,true);assert.equal(fiscal.invoice_number,"9999999");
    assert.equal(fiscal.invoice_stage,"RECEBIDA");assert.equal(fiscal.received_boxes,5);
    await db.exec("set role service_role");
    assert.deepEqual((await db.query("select wms_transfer_purge_candidates() result")).rows[0].result,[]);
  }finally{await db.close();}
});
test("retention: archive is indefinite; purge only expires after 60 days and Storage removal",async()=>{
  const db=await database();try{
    await seed(db,"archived");await seed(db,"deleted");await seed(db,"unrelated");
    const archive=(await retire(db,"archived","ARCHIVED")).rows[0].result;
    assert.equal(archive.purge_after,null);await retire(db,"deleted");
    await db.exec(`reset role;alter table wms_transfers disable trigger a00_transfer_retirement;
      update wms_transfers set deleted_at=now()-interval '61 days',purge_after=now()-interval '1 day' where id='deleted';
      alter table wms_transfers enable trigger a00_transfer_retirement;
      insert into storage.objects(id,bucket_id,name) values('old-pdf','wms-transfer-invoices','A/wms_transfers/deleted/nf.pdf');set role service_role;`);
    const rows=(await db.query("select wms_transfer_purge_candidates() result")).rows[0].result;
    assert.equal(rows.length,1);assert.equal(rows[0].id,"deleted");
    await assert.rejects(db.query("select wms_transfer_purge_finish('deleted',$1)",[rows[0].purge_claim]),/Storage/);
    await db.exec("reset role;delete from storage.objects where id='old-pdf';set role service_role;");
    assert.equal((await db.query("select wms_transfer_purge_finish('deleted',$1) result",[rows[0].purge_claim])).rows[0].result,true);
    await db.exec("reset role");
    for(const table of ["wms_transfers","wms_transfer_items","wms_transfer_events","operacao_tarefas","operacao_tarefas_historico"])
      assert.equal((await db.query(`select count(*)::int n from ${table} where id like 'deleted%' or id like 'retirement:deleted:%'`)).rows[0].n,0,table);
    assert.equal((await db.query("select count(*)::int n from wms_transfers where id in ('archived','unrelated')")).rows[0].n,2);
  }finally{await db.close();}
});
test("retention: roles and countdown never manufacture missing deadlines",()=>{
  assert.equal(canRetireTransfer({role:"COMPRAS"}),true);assert.equal(canRetireTransfer({role:"OPERADOR"}),false);
  assert.match(retentionLabel({removal_kind:"ARCHIVED"}),/sem apagamento/);
  assert.equal(retentionLabel({removal_kind:"DELETED"}),"Prazo não disponível");
  assert.equal(retentionLabel({purge_after:"2026-12-01T00:00:00Z"},Date.parse("2026-11-30T12:00:00Z")),"Exclusão definitiva em 1 dia(s)");
  assert.throws(()=>transferDocumentPrefix({id:"../other",warehouse_code:"A"}),/Invalid/);
});
test("purge worker: API deletes files before data; failed Storage leaves process for retry",async()=>{
  for(const storageFailure of [false,true]){
    const calls=[];
    const client={async rpc(name){calls.push(name);return name==="wms_transfer_purge_candidates"?{data:[{id:"one",warehouse_code:"A",purge_claim:"lease"}]}:{data:true};},storage:{from(){return {
      async list(){return {data:[{id:"file",name:"nf.pdf"}]};},async remove(paths){calls.push(paths[0]);return storageFailure?{error:new Error("Storage unavailable")}:{data:[]};}
    };}}};
    const result=await purgeExpiredTransfers(client);
    assert.equal(result.failed,storageFailure?1:0);assert.equal(calls.includes("wms_transfer_purge_finish"),!storageFailure);
    if(!storageFailure)assert.ok(calls.indexOf("A/wms_transfers/one/nf.pdf")<calls.indexOf("wms_transfer_purge_finish"));
  }
});
test("retention entry points are scoped to CP and shared across packing, fiscal and expedition",async()=>{
  const script=await read("script.js");
  assert.match(script,/async function deleteTransferPermanently\(id\)\s*\{\s*if \(IS_CP_ALAMO\)/);
  assert.match(script,/async function cancelTransfer\(id\)\s*\{\s*if \(IS_CP_ALAMO\)/);
  assert.match(script,/transferRemovedSection/);
  for(const path of ["src/purchases-workflow.js","src/expedition-workflow.js"])
    assert.match(await read(path),/mountTransferRemovalActions\(detail.querySelector\("footer"\),selected,context\)/);
  const schedule=await read("docs/transfer-retention-schedule.sql");
  assert.match(schedule,/vault\.decrypted_secrets/);
  assert.doesNotMatch(schedule,/sb_secret_|eyJ/);
});
