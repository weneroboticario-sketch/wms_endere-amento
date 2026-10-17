import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {lossDatabase} from "./losses-dre-db.test.js";
const migration=await readFile(new URL("../supabase/migrations/20261017002616_manager_finance_capabilities.sql",import.meta.url),"utf8");
async function database() {
 const db=await lossDatabase();await db.exec(`reset role;
 alter table wms_users add column auth_user_id uuid,add column username text,add column allowed_warehouse_codes text,add column default_warehouse_code text,add column warehouse_code text;
 update wms_users set allowed_warehouse_codes='A,B,C',default_warehouse_code='A',warehouse_code='A' where id='actor';
 insert into wms_users(id,name,role,allowed_warehouse_codes,default_warehouse_code,warehouse_code) values
 ('operator','Operator','OPERADOR','A','A','A'),('manager','Manager','GERENTE','A,B','A','A'),('finance','Finance','FINANCEIRO','A,B','A','A');
 create or replace function private.current_wms_profile_id() returns text language sql as $$select coalesce(nullif(current_setting('test.actor',true),''),'actor')$$;
 alter table wms_transfers add column status text,add column delivery_deadline timestamptz,add column delivered_at timestamptz,
 add column invoice_stage text,add column responsavel_nome text,add column status_changed_at timestamptz,add column expedition_responsible_name text,
 add column requires_invoice boolean,add column invoice_file_path text;
 create table wms_transfer_divergences(id text,transfer_id text,warehouse_code text,resolved boolean);
 create table wms_replenishment_requests(id text,warehouse_code text,status text,is_deleted boolean,requires_invoice boolean,invoice_file_path text);
 create table wms_transfer_items(id text,transfer_id text,warehouse_code text,sku text);
 create table wms_transfer_events(id text,transfer_id text,warehouse_code text,created_at timestamptz);
 create table wms_stock_positions(id text,warehouse_code text,active boolean,total_disponivel numeric);
 alter table wms_reverse_logistics add column responsible_name text,add column status text,add column status_changed_at timestamptz;
 alter table wms_transfers enable row level security;alter table wms_stock_positions enable row level security;
 alter table wms_users enable row level security;
 create policy old_users_write on wms_users for all to authenticated using(true) with check(true);
 create policy old_transfer_write on wms_transfers for all to authenticated using(true) with check(true);
 create policy old_stock_write on wms_stock_positions for all to authenticated using(true) with check(true);
 grant select,insert,update,delete on wms_transfers,wms_stock_positions to authenticated;
 grant select,update on wms_users to authenticated;
 grant select on wms_warehouses to authenticated;
 `);await db.exec(migration);await db.exec("set role authenticated");return db;
}
async function as(db,role,actor) {await db.query("select set_config('test.role',$1,false),set_config('test.actor',$2,false)",[role,actor]);}
async function action(db,act,row,payload={},key=crypto.randomUUID()) {return (await db.query("select wms_loss_action($1,$2,$3,$4,$5) result",[act,row?.id||null,JSON.stringify(payload),key,row?.version??null])).rows[0].result;}
const payload={competent_warehouse_code:"A",competence:"2026-09",invoice_issue_date:"2026-09-28",invoice_number:"00015",invoice_value:1000,loss_type_id:"damage",reason:"Produtos danificados durante transporte"};
test("new roles have scoped capabilities, no operational write and no user administration",async()=>{
 const db=await database();try{
  await db.exec("reset role;insert into wms_stock_positions values('one','A',true,5),('other','C',true,9);insert into wms_transfers(id,warehouse_code,status,invoice_stage,is_deleted) values('local','A','EM_SEPARACAO','',false),('outside','C','PENDENTE','',false);set role authenticated");
  for(const [role,actor] of [["GERENTE","manager"],["FINANCEIRO","finance"]]) {
   await as(db,role,actor);
   const caps=(await db.query("select wms_profile_capabilities() result")).rows[0].result.capabilities;
   assert.ok(caps.includes(role==="GERENTE"?"manager.loss.approve":"finance.loss.validate"));
   assert.ok(!caps.includes("finance.close_competence"));
   assert.equal((await db.query("update wms_stock_positions set total_disponivel=100 returning id")).rows.length,0);
   assert.equal((await db.query("update wms_transfers set status='FINALIZADA',invoice_stage='LIBERADA_PARA_ENVIO' returning id")).rows.length,0);
   assert.equal((await db.query("update wms_users set role='ADMINISTRADOR' where id=$1 returning id",[actor])).rows.length,0);
   await assert.rejects(db.query("select wms_profile_record_detail('transfers','outside')"),/fora do escopo/);
   await assert.rejects(db.query("insert into wms_stock_positions values('bad','A',true,100)"),/row-level security|sem permissao operacional/);
   await assert.rejects(db.query("select wms_profile_capabilities('manager','finance.close_competence',true,'unauthorized')"),/administrador/);
   await assert.rejects(action(db,"CREATE",null,payload),/sem permissao/);
   await assert.rejects(action(db,"CLOSE_PERIOD",null,{competence:"2026-09",reason:"Conferencia encerrada"}),/sem permissao/);
  }
  await as(db,"GERENTE","manager");
  const stock=(await db.query("select wms_profile_records('stock') result")).rows[0].result;
  assert.equal(stock.total,1);assert.equal(stock.rows[0].id,"one");
  await as(db,"FINANCEIRO","finance");await assert.rejects(db.query("select wms_profile_records('stock')"),/nao autorizada/);
  await as(db,"ADMINISTRADOR","actor");await db.query("select wms_profile_capabilities('manager','transfer.read',false,'Acesso suspenso para conferencia')");
  await as(db,"GERENTE","manager");await assert.rejects(db.query("select wms_profile_records('transfers')"),/nao autorizada/);
  // A definer command cannot bypass the physical guard either.
  await db.exec("reset role");await assert.rejects(db.query("update wms_stock_positions set total_disponivel=100 where id='one'"),/sem permissao operacional/);
 }finally{await db.close();}
});
test("manager approval and financial validation are separate; competence and historical rates reconcile",async()=>{
 const db=await database();try{
  await as(db,"OPERADOR","operator");let row=await action(db,"CREATE",null,payload);row=await action(db,"SUBMIT",row);
  await db.exec("reset role;insert into wms_loss_files(loss_id,file_type,storage_path,file_name,mime_type,file_size,uploaded_by) select id,'PDF',id||'/doc.pdf','doc.pdf','application/pdf',50,'operator' from wms_losses;set role authenticated");
  await as(db,"GERENTE","manager");row=await action(db,"APPROVE",row);
  assert.equal(row.competence,"2026-09");assert.equal(Number(row.rate_value_snapshot),4.8);
  await assert.rejects(action(db,"CONFIG_RATE",null,{}),/sem permissao/);
  await as(db,"FINANCEIRO","finance");
  await assert.rejects(action(db,"EXPORT",null,{competence:"2026-09"}),/conferencia financeira/);
  const key=crypto.randomUUID();row=await action(db,"VALIDATE_FINANCE",row,{reason:"Documento e competencia conferidos"},key);
  assert.ok(row.financial_validated_at);
  assert.equal((await action(db,"VALIDATE_FINANCE",{...row,version:row.version-1},{reason:"Documento e competencia conferidos"},key)).id,row.id);
  await as(db,"ADMINISTRADOR","actor");
  await action(db,"CONFIG_RATE",null,{id:(await db.query("select id from wms_loss_rates limit 1")).rows[0].id,rate_percent:1,competence_from:"0001-01",competence_to:"9999-12",is_active:true});
  assert.equal(Number((await db.query("select rate_value_snapshot from wms_losses where id=$1",[row.id])).rows[0].rate_value_snapshot),4.8);
  await db.query("select wms_profile_capabilities('finance','finance.close_competence',true,'Fechamento autorizado')");
  await as(db,"FINANCEIRO","finance");
  await assert.rejects(action(db,"REVIEW_PERIOD",null,{competence:"2026-09",reason:"Fechamento conferido"}),/todas as unidades/);
  await as(db,"ADMINISTRADOR","actor");await db.exec("reset role;update wms_users set allowed_warehouse_codes='A,B,C' where id='finance';set role authenticated");
  await as(db,"FINANCEIRO","finance");
  await action(db,"REVIEW_PERIOD",null,{competence:"2026-09",reason:"Documentos conferidos"});
  await action(db,"CLOSE_PERIOD",null,{competence:"2026-09",reason:"Fechamento conferido"});
  assert.equal((await db.query("select status from wms_loss_periods where competence='2026-09'")).rows[0].status,"FECHADA");
  const preview=(await db.query("select wms_loss_export_preview('{\"competence\":\"2026-09\"}') result")).rows[0].result;
  const batch=await action(db,"EXPORT",null,{competence:"2026-09",signature:preview.signature});
  assert.equal(batch.detail_snapshot[0].invoice_number,"00015");assert.equal(Number(batch.total_invoice_value),1000);assert.equal(Number(batch.total_rate_value),4.8);
  await as(db,"GERENTE","manager");await db.exec("reset role;update wms_losses set status='PENDENTE',created_by_id='manager' where id='"+row.id+"';set role authenticated");
  row=(await db.query("select * from wms_losses where id=$1",[row.id])).rows[0];
  await assert.rejects(action(db,"APPROVE",row),/propria perda/);
 }finally{await db.close();}
});
