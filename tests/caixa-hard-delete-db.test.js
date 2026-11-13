import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const a="00000000-0000-4000-8000-000000000001", b="00000000-0000-4000-8000-000000000002", other="00000000-0000-4000-8000-000000000003";
const ta="10000000-0000-4000-8000-000000000001",tb="10000000-0000-4000-8000-000000000002";
const stamp="2026-10-29T10:00:00Z";
async function fixture() {
  const db=new PGlite();
  await db.exec(`
    create schema auth;create schema private;create role anon;create role authenticated;
    grant usage on schema auth,private to authenticated;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('app.uid',true),'')::uuid $$;
    create function private.current_wms_role() returns text language sql as $$ select current_setting('app.role',true) $$;
    create function private.current_wms_is_global_admin() returns boolean language sql as $$ select current_setting('app.global',true)='true' $$;
    create function private.can_access_warehouse(text) returns boolean language sql as $$ select $1=current_setting('app.warehouse',true) $$;
    create table wms_replenishment_requests(id text primary key,warehouse_code text,quantity numeric);
    create table operacao_tarefas(id uuid primary key,estoque_id text,referencia_tipo text,referencia_id text);
    create table wms_caixa_requests(id uuid primary key,warehouse_code text,sku text,status text,replenishment_id text unique references wms_replenishment_requests(id),task_id uuid references operacao_tarefas(id),updated_at timestamptz);
    create table wms_caixa_request_events(id int,request_id uuid references wms_caixa_requests(id));
    create table wms_caixa_request_messages(id int,request_id uuid references wms_caixa_requests(id) on delete restrict);
    create table operacao_tarefas_historico(id int,tarefa_id uuid references operacao_tarefas(id));
    create table wms_assisted_request_items(task_id uuid references operacao_tarefas(id));
    create table wms_task_notifications(id text,warehouse_code text,warehouse_id text,request_id text,entity_id text,transfer_id text);
    create table wms_notifications(like wms_task_notifications);
    create table wms_replenishment_export_batches(id text primary key,warehouse_code text,requests jsonb check(jsonb_array_length(requests)>0));
    create table physical_stock(sku text,quantity int); insert into physical_stock values ('48060',24);
    insert into wms_replenishment_requests values ('caixa-b','VDCG',5),('other','VDCG',5);
    insert into operacao_tarefas values ('${ta}','VDCG','CAIXA_AJUSTE','${a}'),('${tb}','VDCG','REPOSICAO','caixa-b');
    insert into wms_caixa_requests values
      ('${a}','VDCG','48060','CONCLUIDO',null,'${ta}','${stamp}'),
      ('${b}','VDCG','48060','PENDENTE','caixa-b',null,'${stamp}'),
      ('${other}','VDAR','48060','CONCLUIDO',null,null,'${stamp}');
    insert into wms_caixa_request_events values (1,'${a}'),(2,'${b}'),(3,'${other}');
    insert into wms_caixa_request_messages values (1,'${a}'),(2,'${b}'),(3,'${other}');
    insert into operacao_tarefas_historico values (1,'${ta}'),(2,'${tb}');
    insert into wms_replenishment_export_batches values
      ('mixed','VDCG','[{"id":"caixa-b"},{"id":"other","quantity":5}]'),
      ('only','VDCG','[{"id":"caixa-b"}]'),('foreign','VDAR','[{"id":"other"}]');
    insert into wms_notifications values ('target','VDCG',null,'${b}',null,''),('task','VDCG',null,null,'${tb}',null),('other','VDCG',null,'other',null,null),('foreign','VDAR',null,'${b}',null,null),('transfer','VDCG',null,'${b}',null,'transfer-1');
    insert into wms_task_notifications select * from wms_notifications;
    set app.uid='00000000-0000-4000-8000-000000000099';set app.role='ADMINISTRADOR';set app.global='true';set app.warehouse='VDCG';
  `);
  await db.exec(await readFile(new URL('../supabase/proposals/caixa_hard_delete.sql',import.meta.url),'utf8'));
  return db;
}
const remove=(db,id=a,code='VDCG',confirmation='EXCLUIR',updated=stamp)=>db.query('select public.delete_wms_caixa_request_permanently($1::uuid,$2,$3,$4::timestamptz) ok',[id,code,confirmation,updated]);

test('permanent Caixa deletion is restricted to active global admin, exact warehouse and explicit confirmation',async()=>{
  const db=await fixture();try {
    await db.exec('set role authenticated');
    for(const role of ['CAIXA','OPERADOR','SUPERVISOR']) { await db.exec(`set app.role='${role}'`);await assert.rejects(remove(db),/administrador geral/); }
    await db.exec("set app.role='ADMINISTRADOR';set app.global='false'");await assert.rejects(remove(db),/administrador geral/);
    await db.exec("set app.global='true';set app.uid=''");await assert.rejects(remove(db),/administrador geral/);
    await db.exec("set app.uid='00000000-0000-4000-8000-000000000099'");
    await assert.rejects(remove(db,a,'VDAR'),/Estoque/);await assert.rejects(remove(db,other),/outro estoque/);
    await assert.rejects(remove(db,a,'VDCG','sim'),/Digite EXCLUIR/);
    await assert.rejects(db.exec('delete from public.wms_caixa_requests'),/permission denied/);
    await db.exec('set role anon');await assert.rejects(remove(db),/permission denied/);
    await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from wms_caixa_requests')).rows[0].n,3);
  }finally{await db.close();}
});

test('deletion removes only the selected request, its messages, events, tasks and export entries without changing physical stock',async()=>{
  const db=await fixture();try {
    await db.exec('set role authenticated');assert.equal((await remove(db,b)).rows[0].ok,true);assert.equal((await remove(db,b)).rows[0].ok,true);
    await db.exec('reset role');
    for(const table of ['wms_caixa_request_events','wms_caixa_request_messages'])assert.deepEqual((await db.query(`select request_id from ${table} order by request_id`)).rows.map(row=>row.request_id),[a,other]);
    assert.equal((await db.query('select count(*)::int n from wms_replenishment_requests where id=$1',['caixa-b'])).rows[0].n,0);
    assert.equal((await db.query('select count(*)::int n from operacao_tarefas where id=$1',[tb])).rows[0].n,0);
    assert.equal((await db.query('select count(*)::int n from operacao_tarefas_historico where tarefa_id=$1',[tb])).rows[0].n,0);
    for(const table of ['wms_notifications','wms_task_notifications'])assert.deepEqual((await db.query(`select id from ${table} order by id`)).rows.map(row=>row.id),['foreign','other','transfer']);
    assert.deepEqual((await db.query("select requests from wms_replenishment_export_batches where id='mixed'")).rows[0].requests,[{id:'other',quantity:5}]);
    assert.equal((await db.query("select count(*)::int n from wms_replenishment_export_batches where id='only'")).rows[0].n,0);
    assert.equal((await db.query('select quantity from physical_stock')).rows[0].quantity,24);
    assert.equal((await remove(db,a)).rows[0].ok,true);
    assert.deepEqual((await db.query('select id from wms_caixa_requests')).rows,[{id:other}]);
  }finally{await db.close();}
});

test('a late deletion failure rolls back chat, task history, notifications and export snapshots',async()=>{
  const db=await fixture();try {
    await db.exec("create function fail_delete() returns trigger language plpgsql as $$ begin raise exception 'Falha simulada';end $$;create trigger fail_delete before delete on wms_replenishment_requests for each row execute function fail_delete();set role authenticated");
    await assert.rejects(remove(db,b),/Falha simulada/);await db.exec('reset role');
    for(const table of ['wms_caixa_requests','wms_caixa_request_events','wms_caixa_request_messages'])assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n,3);
    assert.equal((await db.query('select count(*)::int n from operacao_tarefas_historico')).rows[0].n,2);
    assert.equal((await db.query('select count(*)::int n from wms_notifications')).rows[0].n,5);
    assert.equal((await db.query('select count(*)::int n from wms_replenishment_export_batches')).rows[0].n,3);
  }finally{await db.close();}
});

test('stale confirmation and shared or foreign tasks stop deletion without removing any related data',async()=>{
  const db=await fixture();try {
    await assert.rejects(remove(db,a,'VDCG','EXCLUIR','2026-10-28T10:00:00Z'),/mudou/);
    await db.exec(`insert into wms_assisted_request_items values ('${ta}')`);await assert.rejects(remove(db),/compartilhada/);
    await db.exec(`delete from wms_assisted_request_items;update operacao_tarefas set estoque_id='VDAR' where id='${ta}'`);await assert.rejects(remove(db),/outro estoque/);
    assert.equal((await db.query('select count(*)::int n from wms_caixa_requests')).rows[0].n,3);
    assert.equal((await db.query('select count(*)::int n from wms_caixa_request_messages')).rows[0].n,3);
  }finally{await db.close();}
});
