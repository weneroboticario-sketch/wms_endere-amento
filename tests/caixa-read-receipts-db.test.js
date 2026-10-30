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
  await db.exec(sql("migrations/20261030125348_caixa_message_read_receipts.sql"));
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

const unread = async db => (await db.query("select * from list_wms_caixa_unread('VDCG')")).rows;
const mark = (db,id,request=key) => db.query('select mark_wms_caixa_read($1,$2)',[request,id]);
test('read receipts enforce identity, request membership, warehouse and monotonicity',async()=>{const db=await fixture();try{
 await login(db,'c1');await submit(db);await submit(db,secondKey);await send(db,'Mensagem própria');
 await login(db,'w1');await act(db,'CLAIM');const first=(await send(db,'Resposta')).rows[0].id;const second=(await send(db,'Outra resposta')).rows[0].id;
 await login(db,'c1');assert.equal(Number((await unread(db)).find(r=>r.request_id===key).unread_count),2);
 await mark(db,second);await mark(db,first);assert.equal(Number((await unread(db)).find(r=>r.request_id===key).unread_count),0);
 await assert.rejects(mark(db,second,secondKey),/pertence/);await assert.rejects(db.exec('update wms_caixa_message_reads set last_message_id=1'),/permission denied/);
 await login(db,'sup');assert.equal((await unread(db)).length,0);
 await login(db,'c2');assert.equal((await unread(db)).length,0);await assert.rejects(mark(db,second),/autorizada/);
 await login(db,'otherWarehouse');await assert.rejects(mark(db,second),/autorizada/);
 await login(db,'w1');assert.equal(Number((await unread(db)).find(r=>r.request_id===key).unread_count),1);
 await db.exec('reset role');await db.exec(sql('migrations/20261030125348_caixa_message_read_receipts.sql'));await db.exec('set role anon');await assert.rejects(mark(db,second),/permission denied/);
 }finally{await db.close();}});
test('closed conversations have no active counters, history remains and new messages are counted independently',async()=>{const db=await fixture();try{
 await login(db,'c1');await submit(db);await submit(db,secondKey);await login(db,'w1');await act(db,'CLAIM');await send(db,'Ainda não lida');await act(db,'RESOLVE','Ajuste pronto');
 await login(db,'c1');await act(db,'CONFIRM');assert.ok(!(await unread(db)).some(r=>r.request_id===key));assert.equal((await messages(db)).rows.length,1);
 await db.exec('reset role');await db.query("update wms_caixa_requests set status='EM_VERIFICACAO',confirmed_at=null where id=$1",[key]);
 await login(db,'c1');assert.equal(Number((await unread(db)).find(r=>r.request_id===key).unread_count),0);
 await login(db,'w1');await send(db,'Nova mensagem após reabertura');await act(db,'CLAIM','',secondKey);await send(db,'Outro ajuste',crypto.randomUUID(),secondKey);
 await login(db,'c1');const rows=await unread(db);assert.equal(Number(rows.find(r=>r.request_id===key).unread_count),1);assert.equal(Number(rows.find(r=>r.request_id===secondKey).unread_count),1);
 }finally{await db.close();}});
