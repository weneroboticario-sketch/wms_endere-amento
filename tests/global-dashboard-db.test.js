import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("global dashboard authenticates only the two control users and reads active operational warehouses", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      grant usage on schema public,auth,private to authenticated,anon;
      create table wms_warehouses(code text,name text,active boolean);
      create table wms_users(id text,name text,username text,auth_user_id uuid,active boolean,archived boolean,role text,
        default_warehouse_code text,warehouse_code text,available_for_tasks boolean,last_login_at timestamptz);
      create table operacao_tarefas(estoque_id text,id uuid,codigo_visivel text,status text,tipo text,titulo text,prioridade text,
        atribuido_para text,sku_alvo text,quantidade_planejada numeric,data_criacao timestamptz,data_conclusao timestamptz,
        data_inicio timestamptz,prazo_sla timestamptz,arquivada boolean,tempo_execucao_segundos numeric,descricao text,motivo_bloqueio text);
      create table wms_replenishment_requests(warehouse_code text,id text,status text,nome_material text,prioridade text,
        responsavel_id text,claimed_by_id text,responsavel_nome text,claimed_by_name text,solicitado_por_nome text,codigo_material text,
        quantidade_solicitada numeric,created_at timestamptz,updated_at timestamptz,archived boolean,is_deleted boolean,is_test boolean,
        started_at timestamptz,finished_at timestamptz,duration_seconds numeric,quantidade_atendida numeric,quantidade_pendente numeric,localizacao_wms text,observacao text);
      create table wms_transfers(warehouse_code text,id text,codigo_transferencia text,status text,nome_transferencia text,
        responsavel_id text,responsavel_nome text,imported_by_name text,total_expected_quantity numeric,total_items numeric,itens_total numeric,
        divergence_count numeric,itens_divergentes numeric,has_divergence boolean,diferenca_total numeric,estabelecimento_nome text,
        created_at timestamptz,updated_at timestamptz,archived_by_unification boolean,is_deleted boolean,started_at timestamptz,
        finished_at timestamptz,finalizado_em timestamptz,total_duration_seconds numeric,total_skus numeric,total_separated_quantity numeric,
        total_packed_quantity numeric,merged_into_id text,unified_into_transfer_id text,observacao text);
      create table wms_stock_import_batches(warehouse_code text,id text,status text,source_type text,created_at timestamptz,
        finished_at timestamptz,imported_rows integer,archived boolean,file_name text,total_rows integer,inserted_rows integer,
        updated_rows integer,unchanged_rows integer,error_rows integer,error_message text,imported_by_name text,imported_by_id text);
      create table wms_stock_alerts(warehouse_code text,id text,alert_type text,nome_material text,updated_at timestamptz,active boolean);
      create table wms_transfer_items(warehouse_code text,id text,transfer_id text,sku text,descricao text,quantidade_solicitada numeric,quantidade_separada numeric,quantidade_lacrada numeric,has_divergence boolean,endereco_codigo text);
      insert into wms_warehouses values('DOURADOS','Central',true),('14177','TLS',true),('22796','VDDRD',true),('OFF','Desativado',false);
      insert into wms_users(id,name,username,auth_user_id,active,archived,role,default_warehouse_code,available_for_tasks) values
        ('admin','Wener','admin','00000000-0000-0000-0000-000000000001',true,false,'ADMINISTRADOR','DOURADOS',true),
        ('tacito','Tacito','tnogueira','00000000-0000-0000-0000-000000000002',true,false,'ADMINISTRADOR','DOURADOS',true),
        ('other','Outro','other','00000000-0000-0000-0000-000000000003',true,false,'ADMINISTRADOR','DOURADOS',true),
        ('worker','Operador','worker','00000000-0000-0000-0000-000000000004',true,false,'OPERADOR','14177',true),
        ('supervisor','Supervisor','supervisor','00000000-0000-0000-0000-000000000005',true,false,'SUPERVISOR','14177',true),
        ('attendant','Atendente','attendant','00000000-0000-0000-0000-000000000006',true,false,'ATENDENTE','14177',true);
      insert into operacao_tarefas(estoque_id,id,codigo_visivel,status,tipo,titulo,prioridade,atribuido_para,data_criacao,prazo_sla) values
        ('14177','10000000-0000-0000-0000-000000000001','TAR-1','EM_ANDAMENTO','REPOSICAO','Repor','ALTA','worker',now()-interval '2 hours',now()-interval '1 hour'),
        ('DOURADOS','10000000-0000-0000-0000-000000000002','IGNORE','PENDENTE','AVULSA','Antiga','NORMAL',null,now(),null);
      insert into wms_replenishment_requests(warehouse_code,id,status,codigo_material,nome_material,quantidade_solicitada,created_at,updated_at) values
        ('22796','REP-1','PENDENTE','00178','Perfume',5,now(),now()),('DOURADOS','IGNORE','PENDENTE','00178','Ignorar',1,now(),now());
      insert into wms_transfers(warehouse_code,id,codigo_transferencia,status,total_skus,total_separated_quantity,created_at,updated_at) values
        ('22796','TR-1','TR-1','EM_SEPARACAO',3,4,now(),now()),('OFF','IGNORE','IGNORE','PENDENTE',1,0,now(),now());
      insert into wms_stock_import_batches(warehouse_code,id,status,source_type,created_at,finished_at,imported_rows,total_rows,file_name) values
        ('14177','B-1','COMPLETED','CAPTACAO',now()-interval '1 hour',now(),100,100,'base.xlsx');
      alter table wms_users enable row level security;alter table operacao_tarefas enable row level security;
      alter table wms_replenishment_requests enable row level security;alter table wms_transfers enable row level security;`);
    await db.exec(await readFile(new URL("../supabase/migrations/20261013150858_global_admin_overview.sql",import.meta.url),"utf8"));
    await db.exec("select set_config('test.uid','00000000-0000-0000-0000-000000000001',false);set role authenticated;");
    const read = async (section,filters={}) => (await db.query("select public.wms_global_dashboard($1,$2::jsonb,30,0) as data",[section,JSON.stringify(filters)])).rows[0].data;
    const overview = await read("overview");
    await db.exec("reset role");
    await db.exec(await readFile(new URL("../supabase/migrations/20261013205124_global_dashboard_executive.sql",import.meta.url),"utf8"));
    await db.exec("set role authenticated");
    const after = await read("overview");
    for (const domain of ["tasks","replenishment","transfers"]) assert.deepEqual(after[domain].summary,overview[domain].summary);
    const executive=await read("executive");
    assert.equal(executive.queue[0].minutes_0_15,1);
    assert.equal(executive.queue[0].warehouse_code,"22796");
    assert.ok(executive.trends.some(r=>r.domain==="replenishment"&&r.created===1));
    assert.equal((await read("executive",{warehouse:"14177"})).queue.length,0);
    assert.equal(executive.attention.transfers[0].unassigned,true);
    assert.deepEqual((await read("executive",{warehouse:"14177"})).attention.transfers,[]);
    assert.deepEqual(overview.warehouses.map(w=>w.code).sort(),["14177","22796"]);
    assert.equal(overview.tasks.summary[0].overdue,1);
    assert.equal(overview.replenishment.summary.length,1);
    assert.equal(overview.transfers.summary.length,1);
    assert.equal(overview.team.rows.find(w=>w.warehouse_code==="14177").busy,1);
    assert.equal((await read("tasks")).rows[0].id,"10000000-0000-0000-0000-000000000001");
    assert.equal((await read("tasks",{warehouse:"22796"})).rows.length,0);
    assert.equal((await read("replenishment",{query:"Perfume"})).rows.length,1);
    assert.equal((await read("replenishment",{query:"Missing"})).rows.length,0);
    assert.equal((await read("captacao")).rows.find(r=>r.warehouse_code==="14177").file_name,"base.xlsx");
    assert.equal((await read("imports")).rows.length,1);
    assert.equal((await read("users",{warehouse:"14177"})).rows.length,3);
    assert.equal((await read("transfer_items",{id:"TR-1"})).rows.length,0);
    assert.ok((await read("alerts")).rows.length>=2);
    assert.ok((await read("activity")).rows.length<=20);
    await assert.rejects(read("tasks",{since:"2026-10-14",until:"2026-10-13"}),/Periodo invalido/);
    await db.exec("select set_config('test.uid','00000000-0000-0000-0000-000000000002',false)");
    assert.equal((await read("overview")).warehouses.length,2);
    for(const suffix of ["3","4","5","6"]){await db.exec(`select set_config('test.uid','00000000-0000-0000-0000-00000000000${suffix}',false)`);await assert.rejects(read("overview"),/nao autorizada/);}
    await assert.rejects(read("executive"),/nao autorizada/);
    await db.exec("select set_config('test.uid','',false)");await assert.rejects(read("overview"),/nao autorizada/);
    await db.exec("reset role;update wms_users set active=false where id='admin';select set_config('test.uid','00000000-0000-0000-0000-000000000001',false);set role authenticated");
    await assert.rejects(read("overview"),/nao autorizada/);
    await db.exec("reset role;update wms_users set active=true,archived=true where id='admin';set role authenticated");
    await assert.rejects(read("overview"),/nao autorizada/);
    await db.exec("reset role;update wms_users set archived=false,default_warehouse_code='14177' where id='admin';set role authenticated");
    await assert.rejects(read("overview"),/nao autorizada/);
    await db.exec("reset role;update wms_users set default_warehouse_code='DOURADOS' where id='admin';insert into wms_warehouses values('NEW','Novo estoque',true);set role authenticated");
    assert.equal((await read("overview")).warehouses.length,3);
    await db.exec("set role anon");await assert.rejects(read("overview"),/permission denied/);
    await db.exec("reset role");
    assert.equal((await db.query("select warehouse_code from wms_replenishment_requests where id='REP-1'")).rows[0].warehouse_code,"22796");
    assert.equal((await db.query("select count(*) as n from wms_transfers")).rows[0].n,2);
  } finally {await db.close();}
});
