import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const proposal = fs.readFileSync(new URL("../supabase/proposals/whatsapp_assisted_approval.sql", import.meta.url), "utf8");
const payload = [
  { sku: "00123", quantity: 2, sourceLine: 1, kind: "REPLENISHMENT", client: true, priority: 1 },
  { sku: "57500", quantity: 1, sourceLine: 2, kind: "ADJUSTMENT", client: false, priority: 4 }
];
const key = "00000000-0000-4000-8000-000000000001";

async function fixture() {
  const database = new PGlite();
  await database.exec(`
    create role anon;
    create role authenticated;
    create schema private;
    create schema auth;
    grant usage on schema private,auth to authenticated;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('app.uid',true),'')::uuid $$;
    create function private.current_wms_profile_id() returns text language sql as $$ select nullif(current_setting('app.actor',true),'') $$;
    create function private.current_wms_role() returns text language sql as $$ select current_setting('app.role',true) $$;
    create function private.can_access_warehouse(code text) returns boolean language sql as $$ select code=current_setting('app.warehouse',true) $$;
    create table public.wms_users (id text primary key);
    insert into public.wms_users values ('admin'),('other');
    create type public.tipo_tarefa_enum as enum ('AVULSA','REPOSICAO');
    create type public.prioridade_tarefa_enum as enum ('URGENTE','ALTA','NORMAL');
    create table public.operacao_tarefas (
      id uuid primary key default gen_random_uuid(),tipo public.tipo_tarefa_enum,titulo text,
      referencia_tipo text,referencia_id text,sku_alvo text,prioridade public.prioridade_tarefa_enum,
      estoque_id text default 'VDCG',atribuido_para text,status text default 'PENDENTE',
      quantidade_planejada numeric,data_inicio timestamptz
    );
    grant select on public.operacao_tarefas to authenticated;
    create function public.concluir_tarefa(p_tarefa_id uuid,p_resultado_execucao jsonb default '{}'::jsonb,p_observacao text default null)
    returns public.operacao_tarefas language plpgsql as $$
    declare result public.operacao_tarefas;
    begin
      update public.operacao_tarefas set status=case when private.current_wms_role()='OPERADOR' then 'AGUARDANDO_VALIDACAO' else 'CONCLUIDA' end
      where id=p_tarefa_id returning * into result;
      return result;
    end $$;
    create function public.criar_tarefa(
      p_tipo public.tipo_tarefa_enum,p_titulo varchar,p_descricao text default null,
      p_estoque_id varchar default null,p_localizacao_alvo text default null,p_sku_alvo text default null,
      p_quantidade_planejada numeric default null,p_referencia_tipo varchar default null,
      p_referencia_id varchar default null,p_atribuido_para text default null,
      p_prioridade public.prioridade_tarefa_enum default 'NORMAL',p_prazo_sla timestamptz default null,
      p_resultado_execucao jsonb default '{}'::jsonb
    ) returns public.operacao_tarefas language plpgsql as $$
    declare result public.operacao_tarefas;
    begin
      if p_sku_alvo=current_setting('app.fail_sku',true) then raise exception 'synthetic failure'; end if;
      insert into public.operacao_tarefas(tipo,titulo,referencia_tipo,referencia_id,sku_alvo,prioridade)
      values(p_tipo,p_titulo,p_referencia_tipo,p_referencia_id,p_sku_alvo,p_prioridade) returning * into result;
      return result;
    end $$;
    set app.uid='00000000-0000-4000-8000-000000000099';
    set app.actor='admin';
    set app.role='ADMINISTRADOR';
    set app.warehouse='VDCG';
  `);
  await database.exec(proposal);
  await database.exec("update public.wms_assisted_settings set intake_enabled=true");
  return database;
}

const approve = (database, requestKey = key, items = payload, reviewed = false) => database.query(
  "select public.approve_whatsapp_assisted_request($1::uuid,$2,$3::jsonb,$4)",
  [requestKey, "Mensagem sintética de teste", JSON.stringify(items), reviewed]
);

test("server-side pause blocks new approvals but preserves retries and work already approved", async () => {
  const database = await fixture();
  try {
    await approve(database);
    await database.exec("select public.set_whatsapp_assisted_intake(false)");
    await approve(database);
    await assert.rejects(approve(database,"00000000-0000-4000-8000-000000000004",payload,true),/pausadas/);
    const item=(await database.query("select id from public.wms_assisted_request_items where kind='REPLENISHMENT'")).rows[0];
    await database.query("select public.record_whatsapp_assisted_work($1,$2,0,1)",[item.id,"00000000-0000-4000-8000-000000000044"]);
    await database.exec("set app.role='OPERADOR'");
    await assert.rejects(database.exec("select public.set_whatsapp_assisted_intake(true)"),/Sem permissão/);
  } finally { await database.close(); }
});

test("retention redacts only closed requests and preserves task links and quantities", async () => {
  const database = await fixture();
  try {
    await approve(database);
    const items = (await database.query("select * from public.wms_assisted_request_items order by source_line")).rows;
    await database.query("select public.record_whatsapp_assisted_work($1,$2,0,2)",[items[0].id,"00000000-0000-4000-8000-000000000041"]);
    await database.query("select public.record_whatsapp_assisted_work($1,$2,0,null,'Verificação sintética autorizada.')",[items[1].id,"00000000-0000-4000-8000-000000000042"]);
    await approve(database,"00000000-0000-4000-8000-000000000003",payload,true);
    await database.exec("update public.wms_assisted_requests set approved_at=now()-interval '60 days'");
    await assert.rejects(database.query("select public.redact_whatsapp_assisted_closed_requests(now())"),/30 dias/);
    const result = await database.query("select public.redact_whatsapp_assisted_closed_requests(now()-interval '30 days') as redacted");
    assert.equal(result.rows[0].redacted,1);
    assert.equal((await database.query("select count(*)::int as total from public.wms_assisted_request_items where task_id is not null")).rows[0].total,4);
    assert.equal((await database.query("select count(*)::int as total from public.wms_assisted_requests where redacted_at is not null")).rows[0].total,1);
    assert.equal((await database.query("select attended from public.wms_assisted_request_items where id=$1",[items[0].id])).rows[0].attended,2);
  } finally { await database.close(); }
});

test("atomic approval creates connected tasks and supports idempotent retries", async () => {
  const database = await fixture();
  try {
    await approve(database);
    await approve(database);
    const result = await database.query("select item.sku,item.kind,task.tipo,task.prioridade from public.wms_assisted_request_items item join public.operacao_tarefas task on task.id=item.task_id order by source_line");
    assert.deepEqual(result.rows, [
      { sku: "00123", kind: "REPLENISHMENT", tipo: "REPOSICAO", prioridade: "URGENTE" },
      { sku: "57500", kind: "ADJUSTMENT", tipo: "AVULSA", prioridade: "NORMAL" }
    ]);
    assert.equal((await database.query("select count(*)::int as total from public.wms_assisted_request_events")).rows[0].total, 1);
    await assert.rejects(approve(database, key, [{ ...payload[0], quantity: 9 }]), /Chave já usada/);
  } finally { await database.close(); }
});

test("partial work is atomic, versioned, idempotent, and cannot bypass the task completion guard", async () => {
  const database = await fixture();
  try {
    await approve(database);
    const item = (await database.query("select * from public.wms_assisted_request_items where sku='00123'")).rows[0];
    await assert.rejects(database.query("update public.operacao_tarefas set status='CONCLUIDA' where id=$1", [item.task_id]), /Registre o atendimento/);
    const args = [item.id, "00000000-0000-4000-8000-000000000010", 0, 1];
    await database.query("select public.record_whatsapp_assisted_work($1,$2,$3,$4)", args);
    await database.query("select public.record_whatsapp_assisted_work($1,$2,$3,$4)", args);
    assert.equal((await database.query("select attended from public.wms_assisted_request_items where id=$1", [item.id])).rows[0].attended, 1);
    await assert.rejects(database.query("select public.record_whatsapp_assisted_work($1,$2,0,1)", [item.id,"00000000-0000-4000-8000-000000000011"]), /Item alterado/);
    await assert.rejects(database.query("select public.record_whatsapp_assisted_work($1,$2,1,2)", [item.id,"00000000-0000-4000-8000-000000000011"]), /Quantidade inválida/);
    await database.query("select public.record_whatsapp_assisted_work($1,$2,1,1)", [item.id,"00000000-0000-4000-8000-000000000011"]);
    assert.equal((await database.query("select status from public.operacao_tarefas where id=$1", [item.task_id])).rows[0].status, "CONCLUIDA");
  } finally { await database.close(); }
});

test("operators can only attend assigned items; adjustments require documented supervisor verification", async () => {
  const database = await fixture();
  try {
    await approve(database);
    const items = (await database.query("select * from public.wms_assisted_request_items order by source_line")).rows;
    await database.exec("set app.role='OPERADOR'");
    await assert.rejects(database.query("select public.record_whatsapp_assisted_work($1,$2,0,1)", [items[0].id,"00000000-0000-4000-8000-000000000020"]), /não atribuído/);
    await database.exec("set app.role='SUPERVISOR'");
    await database.query("update public.operacao_tarefas set atribuido_para='admin' where id=$1", [items[0].task_id]);
    await database.exec("set app.role='OPERADOR'");
    await database.query("select public.record_whatsapp_assisted_work($1,$2,0,2)", [items[0].id,"00000000-0000-4000-8000-000000000020"]);
    assert.equal((await database.query("select status from public.operacao_tarefas where id=$1", [items[0].task_id])).rows[0].status,"AGUARDANDO_VALIDACAO");
    await database.exec("set app.role='SUPERVISOR'");
    await assert.rejects(database.query("select public.record_whatsapp_assisted_work($1,$2,0,1)", [items[1].id,"00000000-0000-4000-8000-000000000021"]), /verificação documentada/);
    await database.query("select public.record_whatsapp_assisted_work($1,$2,0,null,'Verificado; encaminhado para autorização no sistema oficial.')", [items[1].id,"00000000-0000-4000-8000-000000000021"]);
    const adjusted = (await database.query("select attended,verified_at from public.wms_assisted_request_items where id=$1",[items[1].id])).rows[0];
    assert.equal(adjusted.attended,0);
    assert.ok(adjusted.verified_at);
  } finally { await database.close(); }
});

test("failures roll back source, items and existing task API writes", async () => {
  const database = await fixture();
  try {
    await database.exec("set app.fail_sku='57500'");
    await assert.rejects(approve(database), /synthetic failure/);
    for (const table of ["wms_assisted_requests", "wms_assisted_request_items", "operacao_tarefas"]) {
      assert.equal((await database.query(`select count(*)::int as total from public.${table}`)).rows[0].total, 0);
    }
  } finally { await database.close(); }
});

test("unprivileged or wrong warehouse users cannot approve or write tables directly", async () => {
  const database = await fixture();
  try {
    await database.exec("set app.role='OPERADOR'");
    await assert.rejects(approve(database), /Sem permissão/);
    await database.exec("set app.role='SUPERVISOR'; set app.warehouse='VDAR'");
    await assert.rejects(approve(database), /Sem permissão/);
    await database.exec("set app.warehouse='VDCG'; set app.uid=''");
    await assert.rejects(approve(database), /Sem permissão/);
    await database.exec("set role authenticated");
    await assert.rejects(database.exec("insert into public.wms_assisted_request_events(request_id,actor_id,event_type) values ('00000000-0000-4000-8000-000000000001','admin','FORGED')"), /permission denied/);
    await database.exec("reset role");
    assert.equal((await database.query("select has_function_privilege('anon','public.approve_whatsapp_assisted_request(uuid,text,jsonb,boolean)','EXECUTE') as allowed")).rows[0].allowed, false);
  } finally { await database.close(); }
});

test("suspicious duplicate requires explicit review and warehouse RLS isolates raw messages", async () => {
  const database = await fixture();
  try {
    await approve(database);
    const second = "00000000-0000-4000-8000-000000000002";
    await assert.rejects(approve(database, second), /Possível duplicidade/);
    await approve(database, second, payload, true);
    await database.exec("set role authenticated; set app.role='SUPERVISOR'; set app.warehouse='VDAR'");
    assert.equal((await database.query("select count(*)::int as total from public.wms_assisted_requests")).rows[0].total, 0);
    assert.equal((await database.query("select count(*)::int as total from public.wms_assisted_request_items")).rows[0].total, 0);
    await database.exec("set app.warehouse='VDCG'");
    assert.equal((await database.query("select count(*)::int as total from public.wms_assisted_requests")).rows[0].total, 2);
  } finally { await database.close(); }
});

test("existing task SQL supports creation, assignment, start, partial completion and supervisor validation", async () => {
  const database = await fixture();
  try {
    await database.exec(`
      alter table public.operacao_tarefas add column codigo_visivel varchar(20), add column descricao text,
        add column localizacao_alvo text, add column criado_por text, add column delegado_por text,
        add column prazo_sla timestamptz, add column resultado_execucao jsonb default '{}'::jsonb,
        add column data_criacao timestamptz default now(), add column data_conclusao timestamptz,
        add column tempo_execucao_segundos integer, add column motivo_bloqueio text;
      create type public.status_tarefa_enum as enum ('PENDENTE','ATRIBUIDA','EM_ANDAMENTO','BLOQUEADA','AGUARDANDO_VALIDACAO','CONCLUIDA','CANCELADA');
      alter table public.operacao_tarefas alter column status drop default;
      alter table public.operacao_tarefas alter column status type public.status_tarefa_enum using status::public.status_tarefa_enum;
      alter table public.operacao_tarefas alter column status set default 'PENDENTE';
      create sequence public.task_test_code;
      create function public.gerar_codigo_tarefa(public.tipo_tarefa_enum) returns varchar language sql as $$ select ('T-'||nextval('public.task_test_code'))::varchar $$;
      create function public.wms_estoque() returns varchar language sql as $$ select 'VDCG'::varchar $$;
      create function public.validar_responsavel_mesmo_estoque(text,text) returns void language plpgsql as $$ begin if $1<>'other' or $2<>'VDCG' then raise exception 'invalid assignee'; end if; end $$;
    `);
    const taskSql = fs.readFileSync(new URL("../supabase/migrations/20261007123000_central_tarefas.sql", import.meta.url), "utf8");
    for (const name of ["criar_tarefa", "atribuir_tarefa", "iniciar_tarefa", "concluir_tarefa", "validar_tarefa"]) {
      const definition = taskSql.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`));
      assert.ok(definition, name);
      await database.exec(definition[0]);
    }
    await approve(database);
    const item = (await database.query("select * from public.wms_assisted_request_items where kind='REPLENISHMENT'")).rows[0];
    await database.query("select public.atribuir_tarefa($1,'other','Teste sintético')",[item.task_id]);
    await database.exec("set app.actor='other'; set app.role='OPERADOR'");
    await database.query("select public.iniciar_tarefa($1,'Início sintético')",[item.task_id]);
    await database.query("select public.record_whatsapp_assisted_work($1,$2,0,1)",[item.id,"00000000-0000-4000-8000-000000000031"]);
    await assert.rejects(database.query("select public.concluir_tarefa($1)",[item.task_id]),/Registre o atendimento/);
    await database.query("select public.record_whatsapp_assisted_work($1,$2,1,1)",[item.id,"00000000-0000-4000-8000-000000000032"]);
    assert.equal((await database.query("select status from public.operacao_tarefas where id=$1",[item.task_id])).rows[0].status,"AGUARDANDO_VALIDACAO");
    await database.exec("set app.actor='admin'; set app.role='SUPERVISOR'");
    await database.query("select public.validar_tarefa($1,'Validação sintética')",[item.task_id]);
    assert.equal((await database.query("select status from public.operacao_tarefas where id=$1",[item.task_id])).rows[0].status,"CONCLUIDA");
    await database.exec("set app.warehouse='VDAR'");
    await assert.rejects(database.query("update public.operacao_tarefas set status='ATRIBUIDA' where id=$1",[item.task_id]),/Sem permissão/);
  } finally { await database.close(); }
});
