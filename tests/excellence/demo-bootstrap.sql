
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
 
-- Central de Tarefas
-- Observacao de compatibilidade:
-- O modelo original referenciava "usuarios" com UUID. Neste projeto a tabela
-- de usuarios operacionais e "public.wms_users" com chave texto (id), portanto
-- os campos de usuario foram adaptados para text sem alterar as regras de negocio.



create sequence if not exists public.seq_codigo_tarefa;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tipo_tarefa_enum') then
    create type public.tipo_tarefa_enum as enum (
      'TRANSFERENCIA','REPOSICAO','ENDERECAMENTO','INVENTARIO','AUDITORIA','ORGANIZACAO','AVULSA'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'status_tarefa_enum') then
    create type public.status_tarefa_enum as enum (
      'PENDENTE','ATRIBUIDA','EM_ANDAMENTO','BLOQUEADA','AGUARDANDO_VALIDACAO','CONCLUIDA','CANCELADA'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'prioridade_tarefa_enum') then
    create type public.prioridade_tarefa_enum as enum ('BAIXA','NORMAL','ALTA','URGENTE');
  end if;
end
$$;

create table if not exists public.operacao_tarefas (
  id uuid primary key default gen_random_uuid(),
  codigo_visivel varchar(20) not null unique,
  tipo public.tipo_tarefa_enum not null,
  titulo varchar(120) not null,
  descricao text,
  estoque_id varchar(50) not null,
  localizacao_alvo text,
  sku_alvo text,
  quantidade_planejada numeric(12,2),
  referencia_tipo varchar(50),
  referencia_id varchar(100),
  criado_por text references public.wms_users(id),
  delegado_por text references public.wms_users(id),
  atribuido_para text references public.wms_users(id),
  prioridade public.prioridade_tarefa_enum not null default 'NORMAL',
  prazo_sla timestamptz,
  status public.status_tarefa_enum not null default 'PENDENTE',
  motivo_bloqueio text,
  motivo_cancelamento text,
  resultado_execucao jsonb not null default '{}'::jsonb,
  data_criacao timestamptz not null default now(),
  data_inicio timestamptz,
  data_conclusao timestamptz,
  tempo_execucao_segundos integer,
  constraint operacao_tarefas_ref_chk check (
    (referencia_tipo is null and referencia_id is null)
    or (referencia_tipo is not null and referencia_id is not null)
  )
);

create table if not exists public.operacao_tarefas_historico (
  id bigserial primary key,
  tarefa_id uuid not null references public.operacao_tarefas(id) on delete cascade,
  usuario_id text references public.wms_users(id),
  status_anterior public.status_tarefa_enum,
  status_novo public.status_tarefa_enum,
  responsavel_anterior text references public.wms_users(id),
  responsavel_novo text references public.wms_users(id),
  observacao text,
  data_evento timestamptz not null default now()
);

create index if not exists idx_tarefas_estoque_status
  on public.operacao_tarefas (estoque_id, status);
create index if not exists idx_tarefas_responsavel
  on public.operacao_tarefas (atribuido_para, status);
create index if not exists idx_tarefas_fila
  on public.operacao_tarefas (status, prioridade, data_criacao);
create index if not exists idx_tarefas_ref
  on public.operacao_tarefas (referencia_tipo, referencia_id);
create index if not exists idx_hist_tarefa
  on public.operacao_tarefas_historico (tarefa_id, data_evento desc);


create table wms_transfer_events(id text primary key,warehouse_code text,user_id text,event_type text,created_at timestamptz,sku text,quantity numeric);
 insert into wms_transfer_events values('synthetic-event-1','VDCG','op','CONFERENCIA','2026-11-18T12:00:00Z','01314',4);
 insert into operacao_tarefas(id,codigo_visivel,tipo,titulo,estoque_id,atribuido_para,status,data_conclusao)
 values('12345678-1234-4234-8234-123456789012','TAR-DEMO','ORGANIZACAO','Organização sintética','VDCG','op','CONCLUIDA','2026-11-18T11:00:00Z');
 alter table wms_replenishment_requests add column claimed_at timestamptz,add column responsavel_id text,add column claimed_by_id text,add column finished_at timestamptz,add column quantidade_solicitada numeric default 5,add column quantidade_atendida numeric default 5,add column quantidade_pendente numeric default 0,add column started_at timestamptz,add column duration_seconds integer,add column returned_to_queue_at timestamptz,add column returned_to_queue_by_id text;
 update wms_replenishment_requests set status='CONCLUIDO',responsavel_id='op',finished_at='2026-11-18T10:00:00Z';
update wms_users set name='Guilherme (demonstração)' where id='op';update wms_users set name='Kauã (demonstração)' where id='sup';
alter table wms_replenishment_requests add column if not exists claimed_at timestamptz;
alter table wms_replenishment_requests add primary key(id);
