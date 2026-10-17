import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

export async function lossDatabase() {
 const db = new PGlite();
 await db.exec(`
 create role anon;create role authenticated;
 create schema private;create schema auth;create schema storage;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function private.current_wms_profile_id() returns text language sql as $$select 'actor'$$;
 create function private.current_wms_role() returns text language sql as $$select current_setting('test.role',true)$$;
 create function private.current_wms_allowed_warehouses() returns text[] language sql as $$select string_to_array(current_setting('test.scope',true),',')$$;
 create function private.has_wms_role(text[]) returns boolean language sql as $$select private.current_wms_role()=any($1)$$;
 create table public.wms_warehouses(code text primary key,name text,active boolean default true);
 insert into public.wms_warehouses values('A','Alpha',true),('B','Beta',true),('C','Other',true);
 create table public.wms_users(id text primary key,name text,role text,active boolean default true,archived boolean default false);
 insert into public.wms_users values('actor','Actor','ADMINISTRADOR',true,false);
 create table public.wms_transfers(id text,codigo_transferencia text,warehouse_code text,is_deleted boolean);
 create table public.wms_reverse_logistics(id text,gdv_number text,warehouse_code text,is_deleted boolean);
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
 alter table storage.objects enable row level security;
 grant usage on schema public,private,auth,storage to authenticated;
 grant select,insert on storage.objects to authenticated;
 select set_config('test.uid','00000000-0000-0000-0000-000000000001',false);
 select set_config('test.role','ADMINISTRADOR',false);select set_config('test.scope','A,B',false);
 `);
 await db.exec(await readFile(new URL("../supabase/migrations/20261016191905_losses_dre_core.sql",import.meta.url),"utf8"));
 await db.exec("set role authenticated");
 return db;
}
const payload = { competent_warehouse_code:"A",competence:"2026-09",invoice_issue_date:"2026-09-28",invoice_value:15000,loss_type_id:"damage",reason:"Mercadorias avariadas durante movimentacao",allocations:[{cost_center:"A",percent:60,amount:9000},{cost_center:"B",percent:40,amount:6000}] };
async function action(db,act,row,data={},key=crypto.randomUUID()) {
 return (await db.query("select wms_loss_action($1,$2,$3,$4,$5) result",[act,row?.id || null,JSON.stringify(data),key,row?.version ?? null])).rows[0].result;
}

test("initial 0.48 percent applies to historical and future competences",async()=>{
 const db=await lossDatabase();
 try {
  for(const competence of ["2020-01","2026-01","2026-10","2027-12"]) {
   let row=await action(db,"CREATE",null,{...payload,competence});
   row=await action(db,"SUBMIT",row);
   row=await action(db,"APPROVE",row);
   assert.equal(Number(row.rate_percent_snapshot),0.48);
   assert.equal(Number(row.rate_value_snapshot),72);
   assert.equal(row.competence,competence);
  }
 } finally {await db.close();}
});

for(const role of ["ADMINISTRADOR","COMPRAS","SUPERVISOR"]) {
 test(`${role} can export and close a reconciled competence`,async()=>{
  const db=await lossDatabase();
  try {
   let row=await action(db,"CREATE",null,payload);
   row=await action(db,"SUBMIT",row);
   await action(db,"APPROVE",row);
   await db.query("select set_config('test.role',$1,false)",[role]);
   await db.exec("select set_config('test.scope','A,B,C',false)");
   const period={competence:payload.competence,reason:"Conferencia financeira concluida"};
   await assert.rejects(action(db,"CLOSE_PERIOD",null,period),/exporte aprovadas/);
   const preview=(await db.query("select wms_loss_export_preview($1) result",[JSON.stringify(period)])).rows[0].result;
   const batch=await action(db,"EXPORT",null,{...period,signature:preview.signature});
   assert.equal(Number(batch.total_rate_value),72);
   await action(db,"CLOSE_PERIOD",null,period);
   assert.equal((await db.query("select status from wms_loss_periods where competence=$1",[period.competence])).rows[0].status,"FECHADA");
   await assert.rejects(action(db,"EXPORT",null,{...period,signature:preview.signature}),/fechada/);
   await db.exec("select set_config('test.role','OPERADOR',false)");
   await assert.rejects(action(db,"REOPEN_PERIOD",null,period),/financeiro/);
   await assert.rejects(action(db,"EXPORT",null,period),/financeiro/);
  } finally {await db.close();}
 });
}
test("loss workflow freezes type/rate, reconciles allocations, exports once and preserves historical batch",async()=>{
 const db=await lossDatabase();
 try {
  let row=await action(db,"CREATE",null,payload,"create-test");
  assert.equal(row.status,"RASCUNHO");
  const repeat=await action(db,"CREATE",null,payload,"create-test");assert.equal(repeat.id,row.id);
  await assert.rejects(action(db,"CREATE",null,{...payload,invoice_value:1},"create-test"),/outro comando/);
  row=await action(db,"SUBMIT",row);
  const pending=row;
  row=await action(db,"APPROVE",row);
  assert.equal(row.dre_label_snapshot,"PERDAS DE ESTOQUE");assert.equal(Number(row.rate_value_snapshot),72);
  assert.equal(row.competence,"2026-09");
  await assert.rejects(action(db,"APPROVE",pending),/outro usuario/);
  await assert.rejects(db.query("update wms_losses set invoice_value=1 where id=$1",[row.id]),/permission denied/);
  const preview=(await db.query("select wms_loss_export_preview('{\"competence\":\"2026-09\"}') result")).rows[0].result;
  const exportPayload={competence:"2026-09",signature:preview.signature};
  const batch=await action(db,"EXPORT",null,exportPayload,"export-test");
  assert.equal(Number(batch.total_rate_value),72);assert.equal(batch.detail_snapshot.length,2);
  assert.equal(batch.detail_snapshot.reduce((n,r)=>n+Number(r.invoice_value),0),15000);
  assert.equal(batch.detail_snapshot.reduce((n,r)=>n+Number(r.rate_value),0),72);
  assert.equal((await action(db,"EXPORT",null,exportPayload,"export-test")).id,batch.id);
  await assert.rejects(action(db,"EXPORT",null,{competence:"2026-09"}),/Nenhuma perda/);
  const current=(await db.query("select * from wms_losses")).rows[0];
  const reopened=await action(db,"REOPEN",current,{reason:"Revisao formal de valores"});
  assert.equal(reopened.status,"CORRECAO_SOLICITADA");
  assert.deepEqual((await db.query("select detail_snapshot from wms_loss_export_batches")).rows[0].detail_snapshot,batch.detail_snapshot);
 } finally {await db.close();}
});
test("loss permissions, invalid allocations, competence and approval roles",async()=>{
 const db=await lossDatabase();
 try {
  await assert.rejects(action(db,"CREATE",null,{...payload,invoice_value:"NaN",allocations:[{cost_center:"A",amount:"NaN"}]}),/check constraint/);
  await assert.rejects(action(db,"CREATE",null,{...payload,competent_warehouse_code:"C"}),/autorizada/);
  let row=await action(db,"CREATE",null,{...payload,competence:null,allocations:[]});
  await assert.rejects(action(db,"SUBMIT",row),/competencia/);
  row=await action(db,"SAVE",row,{...payload,allocations:[{cost_center:"A",amount:100}]});
  await assert.rejects(action(db,"SUBMIT",row),/Rateio/);
  row=await action(db,"SAVE",row,payload);row=await action(db,"SUBMIT",row);
  await db.exec("select set_config('test.role','COMPRAS',false)");
  await assert.rejects(action(db,"APPROVE",row),/gestor/);
  await db.exec("select set_config('test.role','SUPERVISOR',false)");
  row=await action(db,"APPROVE",row);
  await db.exec("select set_config('test.scope','C',false)");
  assert.equal((await db.query("select * from wms_losses")).rows.length,0);
  await assert.rejects(action(db,"CANCEL",row,{reason:"Cancelamento"}),/autorizada/);
  await db.exec("reset role;set role anon;");
  await assert.rejects(action(db,"CREATE",null,payload),/permission denied/);
 } finally {await db.close();}
});

test("historical rate snapshots survive future configuration and residual cents stay nonnegative",async()=>{
 const db=await lossDatabase();
 try {
  let historical=await action(db,"CREATE",null,payload);
  historical=await action(db,"SUBMIT",historical);historical=await action(db,"APPROVE",historical);
  const rate=(await db.query("select * from wms_loss_rates")).rows[0];
  await action(db,"CONFIG_RATE",null,{...rate,competence_to:"2026-10"});
  await action(db,"CONFIG_RATE",null,{rate_percent:0.52,competence_from:"2026-11",competence_to:"9999-12",is_active:true});
  let future=await action(db,"CREATE",null,{...payload,competence:"2026-11"});
  future=await action(db,"SUBMIT",future);future=await action(db,"APPROVE",future);
  assert.equal(Number(future.rate_value_snapshot),78);
  assert.equal(Number((await db.query("select rate_percent_snapshot from wms_losses where id=$1",[historical.id])).rows[0].rate_percent_snapshot),0.48);
  await db.exec("select set_config('test.scope','A,B,C',false)");
  let small=await action(db,"CREATE",null,{...payload,invoice_value:2.11,allocations:[{cost_center:"A",amount:1.05},{cost_center:"B",amount:1.05},{cost_center:"C",amount:0.01}]});
  small=await action(db,"SUBMIT",small);small=await action(db,"APPROVE",small);
  const amounts=(await db.query("select rate_value_snapshot from wms_loss_allocations where loss_id=$1",[small.id])).rows.map(r=>Number(r.rate_value_snapshot));
  assert.ok(amounts.every(n=>n>=0));assert.equal(amounts.reduce((a,b)=>a+b,0),0.01);
 } finally {await db.close();}
});

test("attachments require matching storage metadata and cannot cross losses",async()=>{
 const db=await lossDatabase();
 try {
  let row=await action(db,"CREATE",null,payload);
  const path=`A/${row.id}/${crypto.randomUUID()}.pdf`;
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('wms-loss-files',$1,$2)",[path,JSON.stringify({size:120,mimetype:"application/pdf"})]);
  const attachment={storage_path:path,file_type:"PDF",file_name:"nota.pdf",mime_type:"application/pdf",file_size:120};
  await assert.rejects(action(db,"ATTACH",row,{...attachment,file_size:1}),/tamanho/);
  const other=await action(db,"CREATE",null,payload);
  await assert.rejects(action(db,"ATTACH",other,attachment),/fora do registro/);
  row=await action(db,"ATTACH",row,attachment);
  assert.equal((await db.query("select count(*)::int n from wms_loss_files where loss_id=$1",[row.id])).rows[0].n,1);
  row=await action(db,"SUBMIT",row);
  await assert.rejects(action(db,"ATTACH",row,attachment),/estado/);
 } finally {await db.close();}
});
