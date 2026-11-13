import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
export async function communicationFixture(){
 const db=new PGlite();
 await db.exec(`
 create schema auth;create schema private;create role anon;create role authenticated;create role service_role bypassrls;
 grant usage on schema private,auth to authenticated,service_role;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table wms_users(id text primary key,name text,role text,active boolean default true,archived boolean default false,
  auth_user_id uuid,allowed_warehouse_codes text,default_warehouse_code text,warehouse_code text,is_global_admin boolean default false,username text,matricula text,auth_email text,updated_at timestamptz);
 insert into wms_users(id,name,role,auth_user_id,allowed_warehouse_codes,default_warehouse_code,warehouse_code,username) values
 ('admin','Admin','ADMINISTRADOR','00000000-0000-4000-8000-000000000001','VDCG','VDCG','VDCG','admin'),
 ('sup','Líder','SUPERVISOR','00000000-0000-4000-8000-000000000002','VDCG','VDCG','VDCG','sup'),
 ('op','Operador','OPERADOR','00000000-0000-4000-8000-000000000003','VDCG','VDCG','VDCG','op'),
 ('cash','Caixa','CAIXA','00000000-0000-4000-8000-000000000004','VDCG','VDCG','VDCG','cash'),
 ('other','Outra unidade','OPERADOR','00000000-0000-4000-8000-000000000005','VDAR','VDAR','VDAR','other'),
 ('att','Atendente','ATENDENTE','00000000-0000-4000-8000-000000000006','VDCG','VDCG','VDCG','att'),
 ('outsider','Admin não membro','ADMINISTRADOR','00000000-0000-4000-8000-000000000007','VDCG','VDCG','VDCG','outsider');
 insert into auth.users select auth_user_id from wms_users;
 create function private.current_wms_profile_id() returns text language sql stable security definer set search_path='' as $$select id from public.wms_users where auth_user_id=auth.uid() and active and not archived$$;
 create function private.current_wms_role() returns text language sql stable security definer set search_path='' as $$select role from public.wms_users where id=private.current_wms_profile_id()$$;
 create function private.current_wms_allowed_warehouses() returns text[] language sql stable security definer set search_path='' as $$select string_to_array(allowed_warehouse_codes,',') from public.wms_users where id=private.current_wms_profile_id()$$;
 create function private.can_access_warehouse(code text) returns boolean language sql stable security definer set search_path='' as $$select coalesce($1=any(private.current_wms_allowed_warehouses()),false)$$;
 create table wms_warehouses(code text primary key);insert into wms_warehouses values('VDCG'),('VDAR');
 create table wms_products(sku text primary key,product_name text);insert into wms_products values('01314','Produto com zero');
 create table wms_bindings(id text,warehouse_code text,sku text,location_code text,codigo_endereco text);
 insert into wms_bindings values('address-1','VDCG','01314','R01-RK01-L01-A',null);
 create table wms_transfers(id text,warehouse_code text,codigo_transferencia text,origem_nome text,destino_nome text,status text,responsavel_id text,responsavel_nome text,is_deleted boolean);
 insert into wms_transfers values('transfer-1','VDCG','TRF-1','VDCG','VDAR','PENDENTE','op','Operador',false);
 create table wms_replenishment_requests(id text,warehouse_code text,codigo_material text,status text,solicitado_por_id text,is_deleted boolean,prioridade text default 'NORMAL');
 insert into wms_replenishment_requests(id,warehouse_code,codigo_material,status,solicitado_por_id,is_deleted) values('rep-1','VDCG','01314','PENDENTE','cash',false);
 create table wms_transfer_divergences(id text,warehouse_code text,sku text,transfer_id text,divergence_type text,created_at timestamptz default now());
 insert into wms_transfer_divergences(id,warehouse_code,sku,transfer_id) values('div-1','VDCG','01314','transfer-1');
 create table wms_inbound_receipts(id uuid,warehouse_code text,invoice_number text,status text,assigned_to text);
 create table stock_balance(sku text,qty numeric);insert into stock_balance values('01314',20);
 `);
 const central=await read('../supabase/migrations/20261007123000_central_tarefas.sql');
 await db.exec(central.split('create or replace function public.wms_perfil')[0].replace('create extension if not exists pgcrypto;',''));
 await db.exec('alter table operacao_tarefas add column arquivada boolean default false,add column arquivada_por text,add column data_arquivamento timestamptz');
 await db.exec(await read('./fixtures/task-security-baseline.sql'));
 await db.exec('create trigger test_chat_task_history after insert or update on operacao_tarefas for each row execute function registrar_historico_tarefa()');
 await db.exec(await read('../supabase/migrations/20261112134100_wms_communication_core.sql'));
 return db;
}
const actorIds={admin:'1',sup:'2',op:'3',cash:'4',other:'5',att:'6',outsider:'7'};
export async function asActor(db,id){
 await db.exec('reset role');
 await db.query("select set_config('test.uid',$1,false)",[id?'00000000-0000-4000-8000-'+actorIds[id].padStart(12,'0'):'']);
 await db.exec('set role authenticated');
}
export async function chat(db,action,data={},unit='VDCG'){
 return (await db.query('select public.wms_chat_api($1,$2,$3::jsonb) result',[unit,action,JSON.stringify(data)])).rows[0].result;
}
