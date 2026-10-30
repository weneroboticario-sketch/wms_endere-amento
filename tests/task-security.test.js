import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const id='00000000-0000-4000-8000-000000000001';
async function fixture(){
  const db=new PGlite();
  await db.exec(`create schema auth;create schema private;create role anon;create role authenticated;
    grant usage on schema private,auth to authenticated;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create function private.current_wms_role() returns text language sql as $$select nullif(current_setting('test.role',true),'')$$;
    create function private.current_wms_profile_id() returns text language sql as $$select case when current_setting('test.active',true)='false' then null else nullif(current_setting('test.actor',true),'') end$$;
    create function private.current_wms_allowed_warehouses() returns text[] language sql as $$select string_to_array(current_setting('test.warehouse',true),',')$$;
    create function private.can_access_warehouse(text) returns boolean language sql as $$select $1=any(private.current_wms_allowed_warehouses())$$;
    create table wms_users(id text primary key,name text,role text,active boolean,archived boolean,default_warehouse_code text,warehouse_code text,username text,matricula text,auth_email text,updated_at timestamptz);
    insert into wms_users values ('worker','Operador','OPERADOR',true,false,'VDCG','VDCG','worker','001','worker@example.test',now());
    set test.uid='00000000-0000-4000-8000-000000000099';set test.actor='worker';set test.role='SUPERVISOR';set test.warehouse='VDCG';set test.active='true';
  `);
  const central=await read('../supabase/migrations/20261007123000_central_tarefas.sql');
  await db.exec(central.split('create or replace function public.wms_perfil')[0].replace('create extension if not exists pgcrypto;',''));
  await db.exec('alter table operacao_tarefas add column arquivada boolean default false,add column arquivada_por text,add column data_arquivamento timestamptz;');
  await db.exec(await read('./fixtures/task-security-baseline.sql'));
  await db.exec('create trigger test_task_history after insert or update on operacao_tarefas for each row execute function registrar_historico_tarefa();');
  const migration=await read('../supabase/proposals/wms_task_security.sql');await db.exec(migration);await db.exec(migration);
  await db.exec(`insert into operacao_tarefas(id,codigo_visivel,tipo,titulo,estoque_id,atribuido_para,status) values ('${id}','TESTE-1','AVULSA','Teste isolado','VDCG','worker','ATRIBUIDA');`);
  return db;
}
test('task RPCs reject anon, missing sessions, inactive profiles, nonoperational roles and foreign warehouses',async()=>{
  const db=await fixture();try{
    await db.exec('set role anon');await assert.rejects(db.query('select iniciar_tarefa($1)',[id]),/permission denied/);
    await db.exec("set role authenticated;set test.uid=''");await assert.rejects(db.query('select iniciar_tarefa($1)',[id]),/Sessão/);
    await db.exec("set test.uid='00000000-0000-4000-8000-000000000099';set test.active='false'");await assert.rejects(db.query('select iniciar_tarefa($1)',[id]),/Sessão/);
    await db.exec("set test.active='true'");for(const role of ['CAIXA','ATENDENTE','']){await db.exec(`set test.role='${role}'`);await assert.rejects(db.query('select concluir_tarefa($1)',[id]),/Sessão/);}
    await db.exec("set test.role='SUPERVISOR';set test.warehouse='VDAR'");
    for(const call of ['concluir_tarefa($1)','bloquear_tarefa($1,\'Conferir\')','cancelar_tarefa($1,\'Cancelamento de teste\')','validar_tarefa($1)'])await assert.rejects(db.query('select '+call,[id]),/estoque/);
    await db.exec('reset role');assert.equal((await db.query('select status from operacao_tarefas')).rows[0].status,'ATRIBUIDA');
  }finally{await db.close();}
});
test('legitimate task lifecycle and nested code generation survive privilege hardening',async()=>{
  const db=await fixture();try{
    await db.exec("set role authenticated;set test.role='OPERADOR'");await db.query('select iniciar_tarefa($1)',[id]);await db.query('select concluir_tarefa($1)',[id]);
    await db.exec("set test.role='SUPERVISOR'");await db.query('select validar_tarefa($1)',[id]);await db.query('select arquivar_tarefa($1)',[id]);await db.query('select desarquivar_tarefa($1)',[id]);
    const created=(await db.query("select (criar_tarefa('AVULSA','Nova tarefa de teste',p_estoque_id=>'VDCG',p_atribuido_para=>'worker')).id id")).rows[0].id;assert.ok(created);
    await assert.rejects(db.query("select gerar_codigo_tarefa('AVULSA')"),/permission denied/);
    await db.exec('reset role');assert.equal((await db.query('select status from operacao_tarefas where id=$1',[id])).rows[0].status,'CONCLUIDA');
    assert.equal((await db.query('select count(*)::int n from operacao_tarefas')).rows[0].n,2);
    assert.ok((await db.query('select count(*)::int n from operacao_tarefas_historico')).rows[0].n>1);
  }finally{await db.close();}
});
test('public login contract stays available and exact pre-maintenance function recovery is executable',async()=>{
  const db=await fixture();try{
    await db.exec('set role anon');assert.equal((await db.query("select wms_resolve_login_email('worker') email")).rows[0].email,'worker@example.test');
    assert.equal((await db.query('select wms_resolve_login_email($1) email',['a'.repeat(257)])).rows[0].email,null);
    await db.exec('reset role');const before=(await db.query('select count(*)::int n from operacao_tarefas')).rows[0].n;
    await db.exec(await read('./fixtures/task-security-rollback.sql'));
    assert.equal((await db.query("select has_function_privilege('anon','public.iniciar_tarefa(uuid,text)','EXECUTE') ok")).rows[0].ok,true);
    assert.equal((await db.query('select count(*)::int n from operacao_tarefas')).rows[0].n,before);
    await db.exec(await read('../supabase/proposals/wms_task_security.sql'));
    assert.equal((await db.query("select has_function_privilege('anon','public.iniciar_tarefa(uuid,text)','EXECUTE') ok")).rows[0].ok,false);
  }finally{await db.close();}
});

test('isolated baseline reproduces anonymous start of an unassigned task and the reviewed migration closes it',async()=>{
  const db=await fixture();try{
    await db.exec(await read('./fixtures/task-security-rollback.sql'));
    await db.exec("update operacao_tarefas set atribuido_para=null;set test.uid='';set test.actor='';set test.role='';set role anon");
    await db.query('select iniciar_tarefa($1)',[id]);
    await db.exec('reset role');assert.equal((await db.query('select status from operacao_tarefas')).rows[0].status,'EM_ANDAMENTO');
    await db.exec(await read('../supabase/proposals/wms_task_security.sql'));await db.exec('set role anon');await assert.rejects(db.query('select iniciar_tarefa($1)',[id]),/permission denied/);
  }finally{await db.close();}
});
