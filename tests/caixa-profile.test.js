import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { validateCaixaRequest } from "../src/caixa-requests.js";

const proposal=fs.readFileSync(new URL("../supabase/proposals/caixa_profile.sql",import.meta.url),"utf8");
const key="00000000-0000-4000-8000-000000000001";
async function fixture(urgent=false) {
  const db=new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create schema auth; create schema private;
    grant usage on schema auth,private to authenticated;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('app.uid',true),'')::uuid $$;
    create function private.current_wms_profile_id() returns text language sql as $$ select current_setting('app.actor',true) $$;
    create function private.current_wms_role() returns text language sql as $$ select current_setting('app.role',true) $$;
    create function private.can_access_warehouse(code text) returns boolean language sql as $$ select code=current_setting('app.warehouse',true) $$;
    create table wms_users(id text primary key,auth_user_id uuid,name text,role text,active boolean default true,archived boolean default false,allowed_warehouse_codes text,default_warehouse_code text,warehouse_code text);
    create table wms_warehouses(code text primary key,active boolean default true);
    create table wms_access_requests(status text,role_requested text,password_hash text,email text);
    create table wms_stock(id text primary key,quantity numeric);
    create table wms_replenishment_requests(id text primary key,warehouse_code text,codigo_material text,nome_material text,quantidade_disponivel_loja_informada numeric,quantidade_solicitada numeric,quantidade_atendida numeric,quantidade_pendente numeric,solicitado_por_id text,solicitado_por_nome text,status text,prioridade text,observacao text,created_at timestamptz,updated_at timestamptz,is_deleted boolean default false);
    create type tipo_tarefa_enum as enum ('AVULSA');
    create table operacao_tarefas(id uuid primary key default gen_random_uuid(),status text default 'PENDENTE');
    create function criar_tarefa(p_tipo tipo_tarefa_enum,p_titulo varchar,p_descricao text,p_estoque_id varchar,p_sku_alvo text,p_quantidade_planejada numeric,p_referencia_tipo varchar,p_referencia_id varchar) returns operacao_tarefas language plpgsql as $$
      declare result public.operacao_tarefas; begin insert into public.operacao_tarefas default values returning * into result; return result; end $$;
    insert into wms_users(id,auth_user_id,name,role,default_warehouse_code) values
      ('c1','00000000-0000-4000-8000-000000000011','Caixa um','CAIXA','VDCG'),
      ('c2','00000000-0000-4000-8000-000000000012','Caixa dois','CAIXA','VDCG');
    insert into wms_warehouses(code) values ('VDCG'),('VDAR'); insert into wms_stock values ('54150',5);
    do $$ declare tab record; begin for tab in select tablename from pg_tables where schemaname='public' and tablename like 'wms_%' loop
      execute format('alter table %I enable row level security',tab.tablename);
      execute format('create policy existing_access on %I for all to authenticated using (true) with check (true)',tab.tablename);
      execute format('grant all on %I to authenticated',tab.tablename);
    end loop; end $$;
    set app.uid='00000000-0000-4000-8000-000000000011'; set app.actor='c1'; set app.role='CAIXA'; set app.warehouse='VDCG';
  `);
  await db.exec(proposal);
  if (urgent) {
    await db.exec("alter table operacao_tarefas add column atribuido_para text, add column data_inicio timestamptz");
    await db.exec(fs.readFileSync(new URL("../supabase/proposals/caixa_urgent_replenishment.sql",import.meta.url),"utf8"));
  }
  return db;
}
const submit=(db,id=key,kind="PRODUCT",warehouse="VDCG")=>db.query("select submit_wms_caixa_request($1::uuid,$2,$3,'00123',15,true,'Conferir quantidade')",[id,warehouse,kind]);

test("Caixa validation preserves leading zeroes and requires an adjustment reason",()=>{
  assert.equal(validateCaixaRequest({kind:"PRODUCT",sku:"00123",quantity:16,notes:""}).sku,"00123");
  for(const quantity of [0,-1,1.5,NaN]) assert.throws(()=>validateCaixaRequest({kind:"PRODUCT",sku:"00123",quantity,notes:""}));
  assert.throws(()=>validateCaixaRequest({kind:"ADJUSTMENT",sku:"00123",quantity:1,notes:""}));
});
test("product request is idempotent, preserves unknown balance and follows actual overdelivery",async()=>{
  const db=await fixture(); try {
    await db.exec("set role authenticated"); await submit(db); await submit(db);
    await db.exec("reset role");
    const row=(await db.query("select * from wms_replenishment_requests")).rows[0];
    assert.equal(row.solicitado_por_id,"c1"); assert.equal(row.quantidade_disponivel_loja_informada,null); assert.equal(row.prioridade,"CLIENTE");
    assert.equal((await db.query("select count(*)::int n from wms_replenishment_requests")).rows[0].n,1);
    await db.exec("update wms_replenishment_requests set quantidade_atendida=16,status='CONCLUIDO'");
    await db.exec("set role authenticated");
    const own=(await db.query("select * from wms_caixa_requests")).rows[0];
    assert.equal(Number(own.attended),16); assert.equal(own.status,"CONCLUIDO");
    assert.equal((await db.query("select * from wms_caixa_request_events")).rows.length,2);
    await assert.rejects(submit(db,key,"ADJUSTMENT"),/outro conteúdo/);
  } finally {await db.close();}
});
test("Caixa only reads own requests, cannot read stock, alter profile or directly write requests",async()=>{
  const db=await fixture(); try {
    await db.exec("set role authenticated"); await submit(db);
    assert.equal((await db.query("select * from wms_stock")).rows.length,0);
    assert.equal((await db.query("select * from wms_replenishment_requests")).rows.length,0);
    assert.equal((await db.query("select * from wms_users")).rows.length,1);
    await assert.rejects(db.exec("update wms_users set role='ADMINISTRADOR'"),/row-level security/);
    await assert.rejects(db.exec("delete from wms_caixa_requests"),/permission denied/);
    await assert.rejects(submit(db,"00000000-0000-4000-8000-000000000002","PRODUCT","VDAR"),/autorizado/);
    await db.exec("set app.actor='c2'; set app.uid='00000000-0000-4000-8000-000000000012'");
    assert.equal((await db.query("select * from wms_caixa_requests")).rows.length,0);
    assert.equal((await db.query("select * from wms_caixa_request_events")).rows.length,0);
    await assert.rejects(submit(db),/outro conteúdo/);
    await db.exec("set app.role='OPERADOR'");
    assert.equal((await db.query("select * from wms_stock")).rows.length,1);
    await assert.rejects(submit(db),/Caixa ativo/);
  } finally {await db.close();}
});
test("adjustment awaits supervisor, creates one verification task and mirrors completion",async()=>{
  const db=await fixture(); try {
    await db.exec("set role authenticated"); await submit(db,key,"ADJUSTMENT");
    await assert.rejects(db.query("select review_wms_caixa_adjustment($1)",[key]),/supervisão/);
    await db.exec("reset role"); assert.equal((await db.query("select * from wms_replenishment_requests")).rows.length,0);
    await db.exec("set app.role='SUPERVISOR'; set app.warehouse='VDAR'; set role authenticated");
    await assert.rejects(db.query("select review_wms_caixa_adjustment($1)",[key]),/autorizado/);
    await db.exec("set app.warehouse='VDCG'");
    await db.query("select review_wms_caixa_adjustment($1)",[key]); await db.query("select review_wms_caixa_adjustment($1)",[key]);
    await db.exec("reset role"); assert.equal((await db.query("select * from operacao_tarefas")).rows.length,1);
    await db.exec("update operacao_tarefas set status='CONCLUIDA'; set app.role='CAIXA'; set role authenticated");
    assert.equal((await db.query("select status from wms_caixa_requests")).rows[0].status,"CONCLUIDO");
  } finally {await db.close();}
});

test("urgent adjustment is claimed by one stock worker and only the requesting cashier can confirm or reopen",async()=>{
  const db=await fixture(true); try {
    await db.exec("set role authenticated"); await submit(db,key,"ADJUSTMENT");
    const act=(operation,observation="")=>db.query("select act_wms_caixa_adjustment($1,$2,$3)",[key,operation,observation]);
    await assert.rejects(act("CLAIM"),/equipe de estoque/);
    await db.exec("set app.role='OPERADOR'"); await act("CLAIM");
    const request=(await db.query("select * from wms_caixa_requests")).rows[0];
    assert.equal(request.claimed_by,"c1"); assert.equal(request.claimed_by_name,"Caixa um");
    await assert.rejects(act("RESOLVE"),/Descreva/);
    await db.exec("set app.actor='c2'"); await assert.rejects(act("CLAIM"),/Outro estoquista/); await assert.rejects(act("RESOLVE","Resolvido"),/estoquista que puxou/);
    await db.exec("set app.actor='c1'; set app.warehouse='VDAR'"); await assert.rejects(act("RESOLVE","Resolvido"),/autorizado/);
    await db.exec("set app.warehouse='VDCG'"); await act("RESOLVE","Conferido e liberado");
    await assert.rejects(act("CONFIRM"),/caixa solicitante/);
    await db.exec("set app.role='CAIXA'; set app.actor='c2'"); await assert.rejects(act("CONFIRM"),/caixa solicitante/);
    await db.exec("set app.actor='c1'"); await act("REOPEN","Ainda não entrou no pedido");
    assert.equal((await db.query("select status from wms_caixa_requests")).rows[0].status,"EM_VERIFICACAO");
    await db.exec("set app.role='OPERADOR'"); await act("RESOLVE","Corrigido e liberado novamente");
    await db.exec("set app.role='CAIXA'"); await act("CONFIRM"); await act("CONFIRM");
    const closed=(await db.query("select * from wms_caixa_requests")).rows[0]; assert.ok(closed.confirmed_at); assert.equal(closed.status,"CONCLUIDO");
    const events=(await db.query("select * from wms_caixa_request_events where event_type='REOPEN'")).rows; assert.equal(events[0].observation,"Ainda não entrou no pedido");
    await db.exec("reset role"); assert.equal((await db.query("select quantity from wms_stock")).rows[0].quantity,"5");
  } finally {await db.close();}
});

test("every Caixa product is urgent even when the client flag is false",async()=>{
  const db=await fixture(true); try {
    await db.exec("set role authenticated");
    await db.query("select submit_wms_caixa_request($1,'VDCG','PRODUCT','00123',2,false,'')",[key]);
    await db.exec("reset role");
    assert.equal((await db.query("select prioridade from wms_replenishment_requests")).rows[0].prioridade,"CLIENTE");
  } finally {await db.close();}
});

test("Caixa lookup returns one SKU only in permitted warehouse without granting stock table access",async()=>{
  const db=await fixture(); try {
    await db.exec(`create table wms_products(sku text,product_name text);
      create table wms_stock_positions(warehouse_code text,codigo_material text,nome_material text,source_type text,total_disponivel numeric,active boolean,archived boolean,updated_at timestamptz);
      insert into wms_stock_positions values ('VDCG','00123','Produto sintético','LOJA',3,true,false,now()),('VDCG','00123','Produto sintético','CAPTACAO',16,true,false,now()),('VDAR','00123','Outro estoque','CAPTACAO',999,true,false,now()),('VDCG','00123','Inativo','CAPTACAO',500,false,false,now());`);
    await db.exec(fs.readFileSync(new URL("../supabase/proposals/caixa_item_lookup.sql",import.meta.url),"utf8"));
    await db.exec("set role authenticated");
    const lookup=(code,sku)=>db.query("select lookup_wms_caixa_item($1,$2) item",[code,sku]);
    const item=(await lookup("VDCG","00123")).rows[0].item;
    assert.equal(item.sku,"00123"); assert.equal(item.storeAvailable,3); assert.equal(item.captureAvailable,16);
    assert.equal((await lookup("VDCG","99999")).rows[0].item.found,false);
    await assert.rejects(lookup("VDAR","00123"),/autorizado/);
    await assert.rejects(lookup("VDCG","%"),/SKU/);
    await assert.rejects(db.query("select * from wms_stock_positions"),/permission denied/);
    await db.exec("set app.role='OPERADOR'"); await assert.rejects(lookup("VDCG","00123"),/Caixa ativo/);
  } finally {await db.close();}
});
