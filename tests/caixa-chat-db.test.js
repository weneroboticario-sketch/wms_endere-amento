import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const users = ["c1", "c2", "w1", "w2", "sup", "adm", "att", "inactive", "unknown", "otherWarehouse"];
const uid = name => `00000000-0000-4000-8000-${String(users.indexOf(name) + 1).padStart(12, "0")}`;
const key = "00000000-0000-4000-8000-000000000101";
const secondKey = "00000000-0000-4000-8000-000000000102";
const sql = path => fs.readFileSync(new URL("../supabase/" + path, import.meta.url), "utf8");

async function fixture() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema private;
    grant usage on schema auth,private to authenticated;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('app.uid',true),'')::uuid $$;
    create table wms_users(id text primary key,auth_user_id uuid,name text,role text,active boolean default true,archived boolean default false,allowed_warehouse_codes text,default_warehouse_code text,warehouse_code text);
    create function private.current_wms_profile_id() returns text language sql stable security definer set search_path='' as $$ select id from public.wms_users where auth_user_id=auth.uid() and active and not archived limit 1 $$;
    create function private.current_wms_role() returns text language sql stable security definer set search_path='' as $$ select role from public.wms_users where id=private.current_wms_profile_id() $$;
    create function private.can_access_warehouse(code text) returns boolean language sql stable security definer set search_path='' as $$ select coalesce(exists(select 1 from public.wms_users where id=private.current_wms_profile_id() and default_warehouse_code=upper($1)),false) $$;
    create table wms_warehouses(code text primary key,active boolean default true);
    create table wms_access_requests(status text,role_requested text,password_hash text,email text);
    create table wms_stock(id text primary key,quantity numeric);
    create table wms_replenishment_requests(id text primary key,warehouse_code text,codigo_material text,nome_material text,quantidade_disponivel_loja_informada numeric,quantidade_solicitada numeric,quantidade_atendida numeric,quantidade_pendente numeric,solicitado_por_id text,solicitado_por_nome text,status text,prioridade text,observacao text,created_at timestamptz,updated_at timestamptz,is_deleted boolean default false,responsavel_id text,responsavel_nome text,claimed_by_id text,claimed_by_name text,claimed_at timestamptz);
    create type tipo_tarefa_enum as enum ('AVULSA');
    create table operacao_tarefas(id uuid primary key default gen_random_uuid(),status text default 'PENDENTE',atribuido_para text,data_inicio timestamptz);
    create function criar_tarefa(p_tipo tipo_tarefa_enum,p_titulo varchar,p_descricao text,p_estoque_id varchar,p_sku_alvo text,p_quantidade_planejada numeric,p_referencia_tipo varchar,p_referencia_id varchar) returns operacao_tarefas language plpgsql as $$ declare result public.operacao_tarefas; begin insert into public.operacao_tarefas default values returning * into result; return result; end $$;
    insert into wms_warehouses(code) values ('VDCG'),('VDAR'); insert into wms_stock values ('48060',24);
    do $$ declare tab record; begin for tab in select tablename from pg_tables where schemaname='public' and tablename like 'wms_%' loop
      execute format('alter table %I enable row level security',tab.tablename);
      execute format('create policy existing_access on %I for all to authenticated using (true) with check (true)',tab.tablename);
      execute format('grant all on %I to authenticated',tab.tablename);
    end loop; end $$;`);
  const roles = ["CAIXA", "CAIXA", "OPERADOR", "OPERADOR", "SUPERVISOR", "ADMINISTRADOR", "ATENDENTE", "OPERADOR", null, "OPERADOR"];
  for (let i = 0; i < users.length; i++) await db.query("insert into wms_users(id,auth_user_id,name,role,active,default_warehouse_code) values($1,$2,$1,$3,$4,$5)", [users[i], uid(users[i]), roles[i], users[i] !== "inactive", users[i] === "otherWarehouse" ? "VDAR" : "VDCG"]);
  await db.exec(sql("migrations/20261029153333_caixa_profile_requests.sql"));
  await db.exec(sql("migrations/20261029154622_caixa_urgent_replenishment.sql"));
  await db.exec(sql("migrations/20261029181023_caixa_request_chat_reviewed.sql"));
  return db;
}
async function login(db, name) {
  await db.exec("reset role");
  await db.query("select set_config('app.uid',$1,false)", [uid(name)]);
  await db.exec("set role authenticated");
}
const submit = (db, id = key, kind = "ADJUSTMENT") => db.query("select submit_wms_caixa_request($1,'VDCG',$2,'48060',2,true,'Conferir pedido do cliente')", [id, kind]);
const act = (db, operation, observation = "", id = key) => db.query("select act_wms_caixa_adjustment($1,$2,$3)", [id, operation, observation]);
const send = (db, text, action = crypto.randomUUID(), id = key) => db.query("select send_wms_caixa_message($1,$2,$3) id", [id, action, text]);
const messages = db => db.query("select * from wms_caixa_request_messages order by id");

test("chat migration enforces participant, role, active profile and warehouse matrix for read and send", async () => {
  const db = await fixture(); try {
    await login(db, "c1"); await submit(db); await send(db, "Cliente aguardando");
    await login(db, "w1"); await act(db, "CLAIM"); await send(db, "Vou conferir");
    for (const name of ["c1", "w1", "sup", "adm"]) {
      await login(db, name); assert.equal((await messages(db)).rows.length >= 2, true); await send(db, "Resposta autorizada");
    }
    for (const name of ["c2", "w2", "att", "inactive", "unknown", "otherWarehouse"]) {
      await login(db, name); assert.equal((await messages(db)).rows.length, 0, name);
      await assert.rejects(send(db, "Mensagem não autorizada"), /restrita|identificado/, name);
      if (["att", "inactive", "unknown", "otherWarehouse"].includes(name)) await assert.rejects(act(db, "CLAIM"), /novamente|autorizado/, name);
    }
    await login(db, "sup"); await assert.rejects(db.query("select list_wms_caixa_attendance('VDAR')"), /Sem acesso/);
    await assert.rejects(db.exec("delete from wms_caixa_request_messages"), /permission denied/);
    await assert.rejects(db.exec("update wms_caixa_request_messages set body='alterada'"), /permission denied/);
    await assert.rejects(db.exec("insert into wms_caixa_request_messages(request_id,warehouse_code,sender_id,sender_name,client_action_id,body) values('00000000-0000-4000-8000-000000000101','VDAR','c1','forjado',gen_random_uuid(),'forjado')"), /permission denied/);
    await db.exec("reset role; set role anon"); await assert.rejects(send(db, "anônimo"), /permission denied/);
  } finally { await db.close(); }
});

test("messages are idempotent, distinct per request and remain readable after cashier confirmation", async () => {
  const db = await fixture(); try {
    await login(db, "c1"); await submit(db); await submit(db, secondKey);
    const action = crypto.randomUUID();
    const first = (await send(db, "Pode testar?", action)).rows[0].id;
    assert.equal((await send(db, "Pode testar?", action)).rows[0].id, first);
    await assert.rejects(send(db, "Outro conteúdo", action), /outro conteúdo/);
    await send(db, "Outro pedido do mesmo SKU", action, secondKey);
    await login(db, "w1"); await act(db, "CLAIM");
    await login(db, "w2"); await assert.rejects(act(db, "CLAIM"), /Outro estoquista/);
    await login(db, "w1"); await act(db, "RESOLVE", "Ajuste conferido");
    await assert.rejects(act(db, "CONFIRM"), /caixa solicitante/);
    await login(db, "c1"); await act(db, "REOPEN", "Ainda não passou");
    await login(db, "w1"); await act(db, "RESOLVE", "Corrigido novamente");
    await login(db, "c1"); await act(db, "CONFIRM");
    assert.equal((await send(db, "Pode testar?", action)).rows[0].id, first);
    await assert.rejects(send(db, "Novo envio após encerramento"), /encerrada/);
    assert.equal((await messages(db)).rows.length, 2);
    assert.equal((await db.query("select count(*)::int n from wms_caixa_request_events where event_type='REOPEN'")).rows[0].n, 1);
    await db.exec("reset role"); assert.equal((await db.query("select quantity from wms_stock")).rows[0].quantity, "24");
  } finally { await db.close(); }
});

test("product chat follows the existing replenishment owner and never duplicates fulfillment", async () => {
  const db = await fixture(); try {
    await login(db, "c1"); await submit(db, key, "PRODUCT");
    await db.exec("reset role"); await db.query("update wms_replenishment_requests set responsavel_id='w1',responsavel_nome='Estoquista um',status='EM_SEPARACAO' where id=$1", ["caixa-" + key]);
    await login(db, "w1"); await send(db, "Separando o produto");
    const list = (await db.query("select list_wms_caixa_attendance('VDCG') rows")).rows[0].rows;
    assert.equal(list[0].claimed_by, "w1"); assert.equal(list[0].requested_by_name, "c1"); assert.equal(list[0].status, "EM_SEPARACAO");
    await login(db, "c2"); assert.equal((await db.query("select list_wms_caixa_attendance('VDCG') rows")).rows[0].rows.length, 0);
    await db.exec("reset role"); await db.query("update wms_replenishment_requests set responsavel_id='w2',responsavel_nome='Estoquista dois' where id=$1", ["caixa-" + key]);
    await login(db, "w1"); assert.equal((await messages(db)).rows.length, 0); await assert.rejects(send(db, "Não sou mais responsável"), /restrita/);
    await login(db, "w2"); assert.equal((await messages(db)).rows.length, 1); await send(db, "Assumi o atendimento existente");
    await db.exec("reset role"); assert.equal((await db.query("select count(*)::int n from wms_replenishment_requests")).rows[0].n, 1);
    assert.equal((await db.query("select quantidade_atendida from wms_replenishment_requests")).rows[0].quantidade_atendida, "0");
  } finally { await db.close(); }
});
