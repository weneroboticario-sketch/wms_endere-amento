create table if not exists public.wms_bindings (
  id text primary key,
  sku text not null,
  rua integer not null,
  rack integer not null,
  linha integer not null,
  letra text not null,
  location_code text not null,
  area_code integer not null default 1,
  area_name text not null default 'Alto Giro',
  product_name text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wms_bindings add column if not exists sku text not null default '';
alter table public.wms_bindings add column if not exists rua integer not null default 1;
alter table public.wms_bindings add column if not exists rack integer not null default 1;
alter table public.wms_bindings add column if not exists linha integer not null default 1;
alter table public.wms_bindings add column if not exists letra text not null default 'A';
alter table public.wms_bindings add column if not exists location_code text not null default '';
alter table public.wms_bindings add column if not exists area_code integer not null default 1;
alter table public.wms_bindings add column if not exists area_name text not null default 'Alto Giro';
alter table public.wms_bindings add column if not exists product_name text default '';
alter table public.wms_bindings add column if not exists created_at timestamptz not null default now();
alter table public.wms_bindings add column if not exists updated_at timestamptz not null default now();

create index if not exists wms_bindings_location_code_idx
on public.wms_bindings (location_code);

create index if not exists wms_bindings_sku_idx
on public.wms_bindings (sku);

create table if not exists public.wms_warehouses (
  id text primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  code text unique,
  name text,
  active boolean default true,
  notes text default ''
);

insert into public.wms_warehouses (id, code, name, active, notes)
values
  ('warehouse-vdcg', 'VDCG', 'Estoque VDCG', true, 'Estoque principal existente'),
  ('warehouse-vdar', 'VDAR', 'Estoque VDAR', true, 'Segundo estoque operacional'),
  ('warehouse-vdsi', 'VDSI', 'Estoque VDSI', true, 'Terceiro estoque operacional'),
  ('warehouse-vdco', 'VDCO', 'Estoque VDCO', true, 'Quarto estoque operacional')
on conflict (code) do update set
  name = excluded.name,
  active = excluded.active,
  updated_at = now();

update public.wms_warehouses
set id = 'warehouse-vdar',
    code = 'VDAR',
    name = 'Estoque VDAR',
    active = true,
    updated_at = now()
where code = 'VDR'
  and not exists (select 1 from public.wms_warehouses where code = 'VDAR');

delete from public.wms_warehouses
where code in ('VDR', 'DVR');

create index if not exists wms_warehouses_code_idx
on public.wms_warehouses (code);

create index if not exists wms_warehouses_active_idx
on public.wms_warehouses (active);

alter table public.wms_bindings add column if not exists warehouse_id text default 'warehouse-vdcg';
alter table public.wms_bindings add column if not exists warehouse_code text default 'VDCG';

update public.wms_bindings
set warehouse_id = coalesce(nullif(warehouse_id, ''), 'warehouse-vdcg'),
    warehouse_code = coalesce(nullif(warehouse_code, ''), 'VDCG')
where warehouse_code is null or warehouse_code = '' or warehouse_id is null or warehouse_id = '';

alter table public.wms_bindings drop constraint if exists wms_bindings_sku_location_idx;
alter table public.wms_bindings drop constraint if exists wms_bindings_sku_location_key;
drop index if exists wms_bindings_sku_location_idx;

create unique index if not exists wms_bindings_warehouse_sku_location_idx
on public.wms_bindings (warehouse_code, sku, location_code);

create index if not exists wms_bindings_warehouse_idx
on public.wms_bindings (warehouse_code);

create index if not exists wms_bindings_warehouse_sku_idx
on public.wms_bindings (warehouse_code, sku);

create index if not exists wms_bindings_warehouse_location_idx
on public.wms_bindings (warehouse_code, location_code);

create index if not exists wms_bindings_location_parts_idx
on public.wms_bindings (rua, rack, linha, letra);

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_bindings' and column_name = 'codigo_material') then
    execute 'create index if not exists wms_bindings_codigo_material_idx on public.wms_bindings (codigo_material)';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_bindings' and column_name = 'codigo_endereco') then
    execute 'create index if not exists wms_bindings_codigo_endereco_idx on public.wms_bindings (codigo_endereco)';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_bindings' and column_name = 'nome_estacao') then
    execute 'create index if not exists wms_bindings_nome_estacao_idx on public.wms_bindings (nome_estacao)';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_bindings' and column_name = 'nr_rack') then
    execute 'create index if not exists wms_bindings_nr_rack_idx on public.wms_bindings (nr_rack)';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_bindings' and column_name = 'coluna') then
    execute 'create index if not exists wms_bindings_coluna_idx on public.wms_bindings (coluna)';
  end if;
end $$;

create table if not exists public.wms_products (
  sku text primary key,
  product_name text not null
);

alter table public.wms_products add column if not exists product_name text not null default '';

create table if not exists public.wms_history (
  id text primary key,
  datetime timestamptz not null default now(),
  action text not null,
  sku text default '',
  location text default '',
  details text default ''
);

alter table public.wms_history add column if not exists datetime timestamptz not null default now();
alter table public.wms_history add column if not exists action text not null default '';
alter table public.wms_history add column if not exists sku text default '';
alter table public.wms_history add column if not exists location text default '';
alter table public.wms_history add column if not exists details text default '';
alter table public.wms_history add column if not exists warehouse_id text default 'warehouse-vdcg';
alter table public.wms_history add column if not exists warehouse_code text default 'VDCG';

update public.wms_history
set warehouse_id = coalesce(nullif(warehouse_id, ''), 'warehouse-vdcg'),
    warehouse_code = coalesce(nullif(warehouse_code, ''), 'VDCG')
where warehouse_code is null or warehouse_code = '' or warehouse_id is null or warehouse_id = '';

create table if not exists public.wms_users (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null default '',
  username text not null unique,
  matricula text default '',
  password_hash text not null default '',
  role text not null default 'OPERADOR',
  active boolean not null default true,
  available_for_tasks boolean not null default true,
  last_login_at timestamptz
);

alter table public.wms_users add column if not exists created_at timestamptz not null default now();
alter table public.wms_users add column if not exists updated_at timestamptz not null default now();
alter table public.wms_users add column if not exists name text not null default '';
alter table public.wms_users add column if not exists username text not null default '';
alter table public.wms_users add column if not exists matricula text default '';
alter table public.wms_users add column if not exists password_hash text not null default '';
alter table public.wms_users add column if not exists role text not null default 'OPERADOR';
alter table public.wms_users add column if not exists profile text default 'OPERADOR';
alter table public.wms_users add column if not exists active boolean not null default true;
alter table public.wms_users add column if not exists available_for_tasks boolean not null default true;
alter table public.wms_users add column if not exists last_login_at timestamptz;
alter table public.wms_users add column if not exists default_warehouse_id text default 'warehouse-vdcg';
alter table public.wms_users add column if not exists default_warehouse_code text default 'VDCG';
alter table public.wms_users add column if not exists allowed_warehouse_codes text default 'VDCG';
alter table public.wms_users add column if not exists warehouse_id text default 'warehouse-vdcg';
alter table public.wms_users add column if not exists warehouse_code text default 'VDCG';
alter table public.wms_users add column if not exists is_global_admin boolean not null default false;
alter table public.wms_users add column if not exists supervisor_id text default '';
alter table public.wms_users add column if not exists supervisor_name text default '';
alter table public.wms_users add column if not exists archived boolean not null default false;
alter table public.wms_users add column if not exists archived_at timestamptz;
alter table public.wms_users add column if not exists archived_by_id text default '';
alter table public.wms_users add column if not exists archived_by_name text default '';

update public.wms_users
set default_warehouse_id = coalesce(nullif(default_warehouse_id, ''), 'warehouse-vdcg'),
    default_warehouse_code = coalesce(nullif(default_warehouse_code, ''), 'VDCG'),
    warehouse_id = coalesce(nullif(warehouse_id, ''), nullif(default_warehouse_id, ''), 'warehouse-vdcg'),
    warehouse_code = coalesce(nullif(warehouse_code, ''), nullif(default_warehouse_code, ''), 'VDCG'),
    allowed_warehouse_codes = case
      when role = 'ADMINISTRADOR' then coalesce((select string_agg(code, ',' order by code) from public.wms_warehouses where active = true), 'VDCG')
      else coalesce(nullif(allowed_warehouse_codes, ''), nullif(warehouse_code, ''), nullif(default_warehouse_code, ''), 'VDCG')
    end,
    is_global_admin = case when role = 'ADMINISTRADOR' then true else is_global_admin end
where default_warehouse_code is null
   or default_warehouse_code = ''
   or warehouse_code is null
   or warehouse_code = ''
   or allowed_warehouse_codes is null
   or allowed_warehouse_codes = ''
   or role = 'ADMINISTRADOR';

update public.wms_users
set profile = coalesce(nullif(profile, ''), role, 'OPERADOR')
where profile is null or profile = '';

update public.wms_users
set default_warehouse_id = case when default_warehouse_code in ('VDR', 'DVR') or default_warehouse_id in ('warehouse-vdr', 'warehouse-dvr') then 'warehouse-vdar' else default_warehouse_id end,
    default_warehouse_code = case when default_warehouse_code in ('VDR', 'DVR') then 'VDAR' else default_warehouse_code end,
    warehouse_id = case when warehouse_code in ('VDR', 'DVR') or warehouse_id in ('warehouse-vdr', 'warehouse-dvr') then 'warehouse-vdar' else coalesce(nullif(warehouse_id, ''), default_warehouse_id) end,
    warehouse_code = case when warehouse_code in ('VDR', 'DVR') then 'VDAR' else coalesce(nullif(warehouse_code, ''), default_warehouse_code) end,
    allowed_warehouse_codes = replace(replace(coalesce(allowed_warehouse_codes, 'VDCG'), 'VDR', 'VDAR'), 'DVR', 'VDAR'),
    updated_at = now()
where default_warehouse_code in ('VDR', 'DVR')
   or default_warehouse_id in ('warehouse-vdr', 'warehouse-dvr')
   or warehouse_code in ('VDR', 'DVR')
   or warehouse_id in ('warehouse-vdr', 'warehouse-dvr')
   or allowed_warehouse_codes like '%VDR%'
   or allowed_warehouse_codes like '%DVR%';

update public.wms_users
set role = 'ADMINISTRADOR',
    profile = 'ADMINISTRADOR',
    default_warehouse_id = coalesce(nullif(default_warehouse_id, ''), 'warehouse-vdcg'),
    default_warehouse_code = coalesce(nullif(default_warehouse_code, ''), 'VDCG'),
    warehouse_id = coalesce(nullif(warehouse_id, ''), nullif(default_warehouse_id, ''), 'warehouse-vdcg'),
    warehouse_code = coalesce(nullif(warehouse_code, ''), nullif(default_warehouse_code, ''), 'VDCG'),
    allowed_warehouse_codes = coalesce((select string_agg(code, ',' order by code) from public.wms_warehouses where active = true), 'VDCG'),
    is_global_admin = true,
    updated_at = now()
where lower(coalesce(username, '')) = 'admin';

update public.wms_users
set is_global_admin = false,
    allowed_warehouse_codes = coalesce(nullif(warehouse_code, ''), nullif(default_warehouse_code, ''), 'VDCG'),
    updated_at = now()
where role <> 'ADMINISTRADOR'
  and is_global_admin = true;

create unique index if not exists wms_users_username_idx
on public.wms_users (username);

create index if not exists wms_users_active_idx
on public.wms_users (active);

create index if not exists wms_users_default_warehouse_idx
on public.wms_users (default_warehouse_code);

create index if not exists idx_users_warehouse_active
on public.wms_users (default_warehouse_code, active);

create index if not exists idx_users_warehouse_supervisor
on public.wms_users (default_warehouse_code, supervisor_id);

create index if not exists idx_users_warehouse_archived
on public.wms_users (default_warehouse_code, archived, active);

create table if not exists public.wms_access_requests (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null default '',
  username text not null,
  matricula text default '',
  password_hash text not null default '',
  role_requested text not null default 'OPERADOR',
  job_title text default '',
  notes text default '',
  status text not null default 'PENDENTE',
  approved_by text default '',
  approved_at timestamptz,
  rejected_by text default '',
  rejected_at timestamptz,
  rejection_reason text default ''
);

alter table public.wms_access_requests add column if not exists created_at timestamptz not null default now();
alter table public.wms_access_requests add column if not exists updated_at timestamptz not null default now();
alter table public.wms_access_requests add column if not exists name text not null default '';
alter table public.wms_access_requests add column if not exists username text not null default '';
alter table public.wms_access_requests add column if not exists matricula text default '';
alter table public.wms_access_requests add column if not exists password_hash text not null default '';
alter table public.wms_access_requests add column if not exists role_requested text not null default 'OPERADOR';
alter table public.wms_access_requests add column if not exists job_title text default '';
alter table public.wms_access_requests add column if not exists notes text default '';
alter table public.wms_access_requests add column if not exists status text not null default 'PENDENTE';
alter table public.wms_access_requests add column if not exists approved_by text default '';
alter table public.wms_access_requests add column if not exists approved_at timestamptz;
alter table public.wms_access_requests add column if not exists rejected_by text default '';
alter table public.wms_access_requests add column if not exists rejected_at timestamptz;
alter table public.wms_access_requests add column if not exists rejection_reason text default '';
alter table public.wms_access_requests add column if not exists warehouse_code text default 'VDCG';

create index if not exists wms_access_requests_username_status_idx
on public.wms_access_requests (username, status);

create index if not exists wms_access_requests_warehouse_status_idx
on public.wms_access_requests (warehouse_code, status);

create table if not exists public.wms_sessions (
  id text primary key,
  created_at timestamptz not null default now(),
  user_id text,
  user_name text default '',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  active boolean not null default true
);

alter table public.wms_sessions add column if not exists created_at timestamptz not null default now();
alter table public.wms_sessions add column if not exists user_id text;
alter table public.wms_sessions add column if not exists user_name text default '';
alter table public.wms_sessions add column if not exists started_at timestamptz not null default now();
alter table public.wms_sessions add column if not exists ended_at timestamptz;
alter table public.wms_sessions add column if not exists active boolean not null default true;
alter table public.wms_sessions add column if not exists active_warehouse_id text default 'warehouse-vdcg';
alter table public.wms_sessions add column if not exists active_warehouse_code text default 'VDCG';

alter table public.wms_warehouses enable row level security;
alter table public.wms_bindings enable row level security;
alter table public.wms_products enable row level security;
alter table public.wms_history enable row level security;
alter table public.wms_users enable row level security;
alter table public.wms_sessions enable row level security;
alter table public.wms_access_requests enable row level security;

drop policy if exists "wms_warehouses_public_all" on public.wms_warehouses;
create policy "wms_warehouses_public_all"
on public.wms_warehouses
for all
to anon
using (true)
with check (true);

drop policy if exists "wms_bindings_public_all" on public.wms_bindings;
create policy "wms_bindings_public_all"
on public.wms_bindings
for all
to anon
using (true)
with check (true);

drop policy if exists "wms_products_public_all" on public.wms_products;
create policy "wms_products_public_all"
on public.wms_products
for all
to anon
using (true)
with check (true);

drop policy if exists "wms_history_public_all" on public.wms_history;
create policy "wms_history_public_all"
on public.wms_history
for all
to anon
using (true)
with check (true);

drop policy if exists "wms_users_public_all" on public.wms_users;
create policy "wms_users_public_all"
on public.wms_users
for all
to anon
using (true)
with check (true);

drop policy if exists "wms_sessions_public_all" on public.wms_sessions;
create policy "wms_sessions_public_all"
on public.wms_sessions
for all
to anon
using (true)
with check (true);

drop policy if exists "wms_access_requests_public_all" on public.wms_access_requests;
create policy "wms_access_requests_public_all"
on public.wms_access_requests
for all
to anon
using (true)
with check (true);

create table if not exists public.wms_establishments (
  id text primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  codigo text default '',
  nome text default '',
  cnpj text default '',
  ativo boolean default true
);

alter table public.wms_establishments add column if not exists created_at timestamptz default now();
alter table public.wms_establishments add column if not exists updated_at timestamptz default now();
alter table public.wms_establishments add column if not exists codigo text default '';
alter table public.wms_establishments add column if not exists codigo_loja text default '';
alter table public.wms_establishments add column if not exists codigo_interno text default '';
alter table public.wms_establishments add column if not exists canal text default '';
alter table public.wms_establishments add column if not exists nome text default '';
alter table public.wms_establishments add column if not exists cnpj text default '';
alter table public.wms_establishments add column if not exists ativo boolean default true;

create table if not exists public.wms_transfers (
  id text primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  codigo_transferencia text default '',
  nome_transferencia text default '',
  estabelecimento_id text default '',
  estabelecimento_codigo text default '',
  estabelecimento_nome text default '',
  estabelecimento_cnpj text default '',
  responsavel_id text default '',
  responsavel_nome text default '',
  status text default 'PENDENTE',
  observacao text default '',
  criado_por_id text default '',
  criado_por_nome text default '',
  iniciado_em timestamptz,
  separacao_concluida_em timestamptz,
  lacre_concluido_em timestamptz
);

alter table public.wms_transfers add column if not exists created_at timestamptz default now();
alter table public.wms_transfers add column if not exists updated_at timestamptz default now();
alter table public.wms_transfers add column if not exists codigo_transferencia text default '';
alter table public.wms_transfers add column if not exists nome_transferencia text default '';
alter table public.wms_transfers add column if not exists import_source text default '';
alter table public.wms_transfers add column if not exists raw_source_text text default '';
alter table public.wms_transfers add column if not exists origem_id text default '';
alter table public.wms_transfers add column if not exists origem_nome text default '';
alter table public.wms_transfers add column if not exists origem_cnpj text default '';
alter table public.wms_transfers add column if not exists origem_codigo_loja text default '';
alter table public.wms_transfers add column if not exists origem_codigo_interno text default '';
alter table public.wms_transfers add column if not exists origem_canal text default '';
alter table public.wms_transfers add column if not exists destino_id text default '';
alter table public.wms_transfers add column if not exists destino_nome text default '';
alter table public.wms_transfers add column if not exists destino_cnpj text default '';
alter table public.wms_transfers add column if not exists destino_codigo_loja text default '';
alter table public.wms_transfers add column if not exists destino_codigo_interno text default '';
alter table public.wms_transfers add column if not exists destino_canal text default '';
alter table public.wms_transfers add column if not exists estabelecimento_id text default '';
alter table public.wms_transfers add column if not exists estabelecimento_codigo text default '';
alter table public.wms_transfers add column if not exists estabelecimento_nome text default '';
alter table public.wms_transfers add column if not exists estabelecimento_cnpj text default '';
alter table public.wms_transfers add column if not exists responsavel_id text default '';
alter table public.wms_transfers add column if not exists responsavel_nome text default '';
alter table public.wms_transfers add column if not exists status text default 'PENDENTE';
alter table public.wms_transfers add column if not exists observacao text default '';
alter table public.wms_transfers add column if not exists criado_por_id text default '';
alter table public.wms_transfers add column if not exists criado_por_nome text default '';
alter table public.wms_transfers add column if not exists iniciado_em timestamptz;
alter table public.wms_transfers add column if not exists finalizado_em timestamptz;
alter table public.wms_transfers add column if not exists duracao_segundos numeric default 0;
alter table public.wms_transfers add column if not exists separacao_iniciada_em timestamptz;
alter table public.wms_transfers add column if not exists separacao_concluida_em timestamptz;
alter table public.wms_transfers add column if not exists duracao_separacao_segundos numeric default 0;
alter table public.wms_transfers add column if not exists lacre_iniciado_em timestamptz;
alter table public.wms_transfers add column if not exists lacre_concluido_em timestamptz;
alter table public.wms_transfers add column if not exists duracao_lacre_segundos numeric default 0;
alter table public.wms_transfers add column if not exists total_items numeric default 0;
alter table public.wms_transfers add column if not exists total_skus numeric default 0;
alter table public.wms_transfers add column if not exists total_expected_quantity numeric default 0;
alter table public.wms_transfers add column if not exists total_separated_quantity numeric default 0;
alter table public.wms_transfers add column if not exists total_packed_quantity numeric default 0;
alter table public.wms_transfers add column if not exists total_previsto numeric default 0;
alter table public.wms_transfers add column if not exists total_enviado numeric default 0;
alter table public.wms_transfers add column if not exists diferenca_total numeric default 0;
alter table public.wms_transfers add column if not exists itens_total numeric default 0;
alter table public.wms_transfers add column if not exists itens_separados numeric default 0;
alter table public.wms_transfers add column if not exists itens_pendentes numeric default 0;
alter table public.wms_transfers add column if not exists itens_divergentes numeric default 0;
alter table public.wms_transfers add column if not exists total_caixas numeric default 0;
alter table public.wms_transfers add column if not exists current_step text default '';
alter table public.wms_transfers add column if not exists last_action_at timestamptz;
alter table public.wms_transfers add column if not exists last_action_label text default '';
alter table public.wms_transfers add column if not exists separation_started_at timestamptz;
alter table public.wms_transfers add column if not exists separation_finished_at timestamptz;
alter table public.wms_transfers add column if not exists separation_duration_seconds numeric default 0;
alter table public.wms_transfers add column if not exists packing_started_at timestamptz;
alter table public.wms_transfers add column if not exists packing_finished_at timestamptz;
alter table public.wms_transfers add column if not exists packing_duration_seconds numeric default 0;
alter table public.wms_transfers add column if not exists total_started_at timestamptz;
alter table public.wms_transfers add column if not exists total_finished_at timestamptz;
alter table public.wms_transfers add column if not exists total_duration_seconds numeric default 0;
alter table public.wms_transfers add column if not exists has_divergence boolean default false;
alter table public.wms_transfers add column if not exists divergence_count numeric default 0;
alter table public.wms_transfers add column if not exists final_result text default '';
alter table public.wms_transfers add column if not exists is_merged boolean default false;
alter table public.wms_transfers add column if not exists merged_from_ids jsonb default '[]'::jsonb;
alter table public.wms_transfers add column if not exists merged_into_id text default '';
alter table public.wms_transfers add column if not exists unified_into_transfer_id text default '';
alter table public.wms_transfers add column if not exists archived_by_unification boolean default false;
alter table public.wms_transfers add column if not exists merge_status text default '';
alter table public.wms_transfers add column if not exists merged_by_id text default '';
alter table public.wms_transfers add column if not exists merged_by_name text default '';
alter table public.wms_transfers add column if not exists merged_at timestamptz;
alter table public.wms_transfers add column if not exists is_deleted boolean default false;
alter table public.wms_transfers add column if not exists deleted_at timestamptz;
alter table public.wms_transfers add column if not exists deleted_by_id text default '';
alter table public.wms_transfers add column if not exists deleted_by_name text default '';
alter table public.wms_transfers add column if not exists idempotency_key text default '';
alter table public.wms_transfers add column if not exists request_id text default '';
alter table public.wms_transfers add column if not exists warehouse_id text default 'warehouse-vdcg';
alter table public.wms_transfers add column if not exists warehouse_code text default 'VDCG';

update public.wms_transfers
set warehouse_id = coalesce(nullif(warehouse_id, ''), 'warehouse-vdcg'),
    warehouse_code = coalesce(nullif(warehouse_code, ''), 'VDCG')
where warehouse_code is null or warehouse_code = '' or warehouse_id is null or warehouse_id = '';

create table if not exists public.wms_transfer_items (
  id text primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  transfer_id text default '',
  sku text default '',
  descricao text default '',
  quantidade_solicitada numeric default 0,
  unidade_medida text default '',
  tipo_quantidade text default 'UNIDADE',
  quantidade_caixas numeric default 0,
  unidades_por_caixa numeric default 0,
  quantidade_total_unidades numeric default 0,
  quantidade_lacrada_unidades numeric default 0,
  embalagem_observacao text default '',
  quantidade_separada numeric default 0,
  quantidade_lacrada numeric default 0,
  status text default 'PENDENTE'
);

alter table public.wms_transfer_items add column if not exists created_at timestamptz default now();
alter table public.wms_transfer_items add column if not exists updated_at timestamptz default now();
alter table public.wms_transfer_items add column if not exists transfer_id text default '';
alter table public.wms_transfer_items add column if not exists sku text default '';
alter table public.wms_transfer_items add column if not exists descricao text default '';
alter table public.wms_transfer_items add column if not exists quantidade_solicitada numeric default 0;
alter table public.wms_transfer_items add column if not exists unidade_medida text default '';
alter table public.wms_transfer_items add column if not exists tipo_movimentacao text default '';
alter table public.wms_transfer_items add column if not exists loja_origem text default '';
alter table public.wms_transfer_items add column if not exists loja_destino text default '';
alter table public.wms_transfer_items add column if not exists razao_social_origem text default '';
alter table public.wms_transfer_items add column if not exists razao_social_destino text default '';
alter table public.wms_transfer_items add column if not exists agrupamento_razao_social text default '';
alter table public.wms_transfer_items add column if not exists endereco_rua text default '';
alter table public.wms_transfer_items add column if not exists endereco_rack text default '';
alter table public.wms_transfer_items add column if not exists endereco_linha text default '';
alter table public.wms_transfer_items add column if not exists endereco_letra text default '';
alter table public.wms_transfer_items add column if not exists endereco_codigo text default '';
alter table public.wms_transfer_items add column if not exists has_location boolean default false;
alter table public.wms_transfer_items add column if not exists location_warning text default '';
alter table public.wms_transfer_items add column if not exists saldo_loja_disponivel numeric default 0;
alter table public.wms_transfer_items add column if not exists saldo_captacao_disponivel numeric default 0;
alter table public.wms_transfer_items add column if not exists origem_sugerida text default '';
alter table public.wms_transfer_items add column if not exists quantidade_sugerida_captacao numeric default 0;
alter table public.wms_transfer_items add column if not exists quantidade_sugerida_loja numeric default 0;
alter table public.wms_transfer_items add column if not exists alerta_saldo boolean default false;
alter table public.wms_transfer_items add column if not exists alerta_saldo_mensagem text default '';
alter table public.wms_transfer_items add column if not exists localizacao_sugerida text default '';
alter table public.wms_transfer_items add column if not exists tipo_quantidade text default 'UNIDADE';
alter table public.wms_transfer_items add column if not exists tipo_envio text default 'UNIDADE';
alter table public.wms_transfer_items add column if not exists quantidade_caixas numeric default 0;
alter table public.wms_transfer_items add column if not exists unidades_por_caixa numeric default 0;
alter table public.wms_transfer_items add column if not exists quantidade_total_unidades numeric default 0;
alter table public.wms_transfer_items add column if not exists quantidade_lacrada_unidades numeric default 0;
alter table public.wms_transfer_items add column if not exists embalagem_observacao text default '';
alter table public.wms_transfer_items add column if not exists quantidade_separada numeric default 0;
alter table public.wms_transfer_items add column if not exists quantidade_lacrada numeric default 0;
alter table public.wms_transfer_items add column if not exists quantidade_enviada numeric default 0;
alter table public.wms_transfer_items add column if not exists quantidade_extra numeric default 0;
alter table public.wms_transfer_items add column if not exists quantidade_faltante numeric default 0;
alter table public.wms_transfer_items add column if not exists quantidade_excedente numeric default 0;
alter table public.wms_transfer_items add column if not exists total_unidades_caixa numeric default 0;
alter table public.wms_transfer_items add column if not exists diferenca numeric default 0;
alter table public.wms_transfer_items add column if not exists motivo_pendencia text default '';
alter table public.wms_transfer_items add column if not exists observacao_pendencia text default '';
alter table public.wms_transfer_items add column if not exists has_divergence boolean default false;
alter table public.wms_transfer_items add column if not exists is_extra boolean default false;
alter table public.wms_transfer_items add column if not exists divergence_type text default '';
alter table public.wms_transfer_items add column if not exists added_by_id text default '';
alter table public.wms_transfer_items add column if not exists added_by_name text default '';
alter table public.wms_transfer_items add column if not exists input_type text default '';
alter table public.wms_transfer_items add column if not exists observation text default '';
alter table public.wms_transfer_items add column if not exists status text default 'PENDENTE';
alter table public.wms_transfer_items add column if not exists idempotency_key text default '';
alter table public.wms_transfer_items add column if not exists request_id text default '';
alter table public.wms_transfer_items add column if not exists warehouse_id text default 'warehouse-vdcg';
alter table public.wms_transfer_items add column if not exists warehouse_code text default 'VDCG';

update public.wms_transfer_items
set warehouse_id = coalesce(nullif(warehouse_id, ''), 'warehouse-vdcg'),
    warehouse_code = coalesce(nullif(warehouse_code, ''), 'VDCG')
where warehouse_code is null or warehouse_code = '' or warehouse_id is null or warehouse_id = '';

create table if not exists public.wms_product_packaging (
  id text primary key,
  sku text default '',
  descricao text default '',
  unidades_por_caixa numeric default 0,
  updated_at timestamptz default now(),
  updated_by text default ''
);

create table if not exists public.wms_transfer_events (
  id text primary key,
  created_at timestamptz default now(),
  transfer_id text default '',
  item_id text default '',
  user_id text default '',
  user_name text default '',
  event_type text default '',
  sku text default '',
  quantity numeric default 0,
  details text default '',
  payload jsonb default '{}'::jsonb
);

alter table public.wms_transfer_events add column if not exists created_at timestamptz default now();
alter table public.wms_transfer_events add column if not exists transfer_id text default '';
alter table public.wms_transfer_events add column if not exists item_id text default '';
alter table public.wms_transfer_events add column if not exists user_id text default '';
alter table public.wms_transfer_events add column if not exists user_name text default '';
alter table public.wms_transfer_events add column if not exists event_type text default '';
alter table public.wms_transfer_events add column if not exists sku text default '';
alter table public.wms_transfer_events add column if not exists quantity numeric default 0;
alter table public.wms_transfer_events add column if not exists details text default '';
alter table public.wms_transfer_events add column if not exists input_type text default '';
alter table public.wms_transfer_events add column if not exists divergence_type text default '';
alter table public.wms_transfer_events add column if not exists quantity_expected numeric default 0;
alter table public.wms_transfer_events add column if not exists quantity_informed numeric default 0;
alter table public.wms_transfer_events add column if not exists quantity_difference numeric default 0;
alter table public.wms_transfer_events add column if not exists observation text default '';
alter table public.wms_transfer_events add column if not exists payload jsonb default '{}'::jsonb;
alter table public.wms_transfer_events add column if not exists warehouse_id text default 'warehouse-vdcg';
alter table public.wms_transfer_events add column if not exists warehouse_code text default 'VDCG';

update public.wms_transfer_events
set warehouse_id = coalesce(nullif(warehouse_id, ''), 'warehouse-vdcg'),
    warehouse_code = coalesce(nullif(warehouse_code, ''), 'VDCG')
where warehouse_code is null or warehouse_code = '' or warehouse_id is null or warehouse_id = '';

create table if not exists public.wms_transfer_divergences (
  id text primary key,
  created_at timestamptz default now(),
  transfer_id text default '',
  item_id text default '',
  sku text default '',
  descricao text default '',
  divergence_type text default '',
  expected_quantity numeric default 0,
  informed_quantity numeric default 0,
  difference_quantity numeric default 0,
  user_id text default '',
  user_name text default '',
  input_type text default '',
  observation text default '',
  resolved boolean default false,
  resolved_by text default '',
  resolved_at timestamptz
);

alter table public.wms_transfer_divergences add column if not exists created_at timestamptz default now();
alter table public.wms_transfer_divergences add column if not exists transfer_id text default '';
alter table public.wms_transfer_divergences add column if not exists item_id text default '';
alter table public.wms_transfer_divergences add column if not exists sku text default '';
alter table public.wms_transfer_divergences add column if not exists descricao text default '';
alter table public.wms_transfer_divergences add column if not exists divergence_type text default '';
alter table public.wms_transfer_divergences add column if not exists expected_quantity numeric default 0;
alter table public.wms_transfer_divergences add column if not exists informed_quantity numeric default 0;
alter table public.wms_transfer_divergences add column if not exists difference_quantity numeric default 0;
alter table public.wms_transfer_divergences add column if not exists user_id text default '';
alter table public.wms_transfer_divergences add column if not exists user_name text default '';
alter table public.wms_transfer_divergences add column if not exists input_type text default '';
alter table public.wms_transfer_divergences add column if not exists observation text default '';
alter table public.wms_transfer_divergences add column if not exists resolved boolean default false;
alter table public.wms_transfer_divergences add column if not exists resolved_by text default '';
alter table public.wms_transfer_divergences add column if not exists resolved_at timestamptz;
alter table public.wms_transfer_divergences add column if not exists warehouse_id text default 'warehouse-vdcg';
alter table public.wms_transfer_divergences add column if not exists warehouse_code text default 'VDCG';

update public.wms_transfer_divergences
set warehouse_id = coalesce(nullif(warehouse_id, ''), 'warehouse-vdcg'),
    warehouse_code = coalesce(nullif(warehouse_code, ''), 'VDCG')
where warehouse_code is null or warehouse_code = '' or warehouse_id is null or warehouse_id = '';

alter table if exists public.wms_transfer_boxes add column if not exists warehouse_id text default 'warehouse-vdcg';
alter table if exists public.wms_transfer_boxes add column if not exists warehouse_code text default 'VDCG';
alter table if exists public.wms_task_notifications add column if not exists warehouse_id text default 'warehouse-vdcg';
alter table if exists public.wms_task_notifications add column if not exists warehouse_code text default 'VDCG';
alter table if exists public.wms_task_notifications add column if not exists idempotency_key text default '';
alter table if exists public.wms_task_notifications add column if not exists request_id text default '';
alter table if exists public.wms_notifications add column if not exists warehouse_id text default 'warehouse-vdcg';
alter table if exists public.wms_notifications add column if not exists warehouse_code text default 'VDCG';
alter table if exists public.wms_notifications add column if not exists idempotency_key text default '';
alter table if exists public.wms_notifications add column if not exists request_id text default '';

create table if not exists public.wms_transfer_merge_items (
  id text primary key,
  created_at timestamptz default now(),
  merged_transfer_id text default '',
  original_transfer_id text default '',
  sku text default '',
  descricao text default '',
  original_quantity numeric default 0,
  final_quantity numeric default 0,
  unidade_medida text default '',
  conflict_type text default '',
  resolution_type text default '',
  resolved_by_id text default '',
  resolved_by_name text default ''
);

alter table public.wms_transfer_merge_items add column if not exists created_at timestamptz default now();
alter table public.wms_transfer_merge_items add column if not exists merged_transfer_id text default '';
alter table public.wms_transfer_merge_items add column if not exists original_transfer_id text default '';
alter table public.wms_transfer_merge_items add column if not exists sku text default '';
alter table public.wms_transfer_merge_items add column if not exists descricao text default '';
alter table public.wms_transfer_merge_items add column if not exists original_quantity numeric default 0;
alter table public.wms_transfer_merge_items add column if not exists final_quantity numeric default 0;
alter table public.wms_transfer_merge_items add column if not exists unidade_medida text default '';
alter table public.wms_transfer_merge_items add column if not exists conflict_type text default '';
alter table public.wms_transfer_merge_items add column if not exists resolution_type text default '';
alter table public.wms_transfer_merge_items add column if not exists resolved_by_id text default '';
alter table public.wms_transfer_merge_items add column if not exists resolved_by_name text default '';

create index if not exists wms_transfers_responsavel_status_idx
on public.wms_transfers (responsavel_id, status);

create index if not exists wms_transfers_status_idx
on public.wms_transfers (status);

create index if not exists wms_transfers_warehouse_idx
on public.wms_transfers (warehouse_code);

create index if not exists wms_transfers_created_at_idx
on public.wms_transfers (created_at);

create index if not exists wms_transfers_warehouse_status_created_idx
on public.wms_transfers (warehouse_code, status, created_at);

create index if not exists idx_wms_transfers_warehouse_status
on public.wms_transfers (warehouse_code, status);

create index if not exists idx_wms_transfers_warehouse_deleted
on public.wms_transfers (warehouse_code, is_deleted);

create index if not exists wms_transfers_warehouse_status_updated_idx
on public.wms_transfers (warehouse_code, status, updated_at desc);

create index if not exists wms_transfers_warehouse_responsavel_status_idx
on public.wms_transfers (warehouse_code, responsavel_id, status);

create index if not exists idx_wms_transfers_responsavel_status
on public.wms_transfers (warehouse_code, responsavel_id, status);

create index if not exists idx_wms_transfers_updated_at
on public.wms_transfers (warehouse_code, updated_at);

create index if not exists idx_wms_transfers_last_action
on public.wms_transfers (warehouse_code, last_action_at);

create index if not exists wms_transfers_updated_at_idx
on public.wms_transfers (updated_at desc);

create index if not exists wms_transfers_last_action_at_idx
on public.wms_transfers (last_action_at desc);

create unique index if not exists wms_transfers_idempotency_uidx
on public.wms_transfers (warehouse_code, idempotency_key)
where idempotency_key is not null and idempotency_key <> '';

create index if not exists idx_transfer_sync
on public.wms_transfers (warehouse_code, updated_at desc, id);

create index if not exists idx_transfer_open
on public.wms_transfers (warehouse_code, status, is_deleted, updated_at desc);

create index if not exists wms_transfer_items_transfer_sku_idx
on public.wms_transfer_items (transfer_id, sku);

create index if not exists wms_transfer_items_transfer_idx
on public.wms_transfer_items (transfer_id);

create index if not exists idx_wms_transfer_items_transfer
on public.wms_transfer_items (transfer_id);

create index if not exists idx_wms_transfer_items_transfer_id
on public.wms_transfer_items (transfer_id);

create index if not exists wms_transfer_items_sku_idx
on public.wms_transfer_items (sku);

create index if not exists idx_wms_transfer_items_sku
on public.wms_transfer_items (warehouse_code, sku);

create index if not exists wms_transfer_items_warehouse_idx
on public.wms_transfer_items (warehouse_code);

create index if not exists wms_transfer_items_warehouse_transfer_sku_idx
on public.wms_transfer_items (warehouse_code, transfer_id, sku);

create index if not exists wms_transfer_items_updated_at_idx
on public.wms_transfer_items (updated_at desc);

create unique index if not exists wms_transfer_items_idempotency_uidx
on public.wms_transfer_items (warehouse_code, idempotency_key)
where idempotency_key is not null and idempotency_key <> '';

create index if not exists idx_transfer_items_sync
on public.wms_transfer_items (warehouse_code, transfer_id, updated_at desc);

create index if not exists idx_transfer_items_open
on public.wms_transfer_items (warehouse_code, transfer_id, status, sku);

create table if not exists public.wms_stock_import_batches (
  id text primary key,
  created_at timestamptz default now(),
  warehouse_code text not null default 'VDCG',
  source_type text not null,
  file_name text default '',
  imported_by_id text default '',
  imported_by_name text default '',
  total_rows integer default 0,
  imported_rows integer default 0,
  inserted_rows integer default 0,
  updated_rows integer default 0,
  unchanged_rows integer default 0,
  deactivated_rows integer default 0,
  negative_rows integer default 0,
  alert_rows integer default 0,
  ignored_rows integer default 0,
  error_rows integer default 0,
  status text default 'PROCESSING',
  notes text default '',
  import_mode text default 'CARGA_COMPLETA'
);

alter table public.wms_stock_import_batches add column if not exists created_at timestamptz default now();
alter table public.wms_stock_import_batches add column if not exists warehouse_code text not null default 'VDCG';
alter table public.wms_stock_import_batches add column if not exists source_type text not null default 'CAPTACAO';
alter table public.wms_stock_import_batches add column if not exists file_name text default '';
alter table public.wms_stock_import_batches add column if not exists imported_by_id text default '';
alter table public.wms_stock_import_batches add column if not exists imported_by_name text default '';
alter table public.wms_stock_import_batches add column if not exists total_rows integer default 0;
alter table public.wms_stock_import_batches add column if not exists imported_rows integer default 0;
alter table public.wms_stock_import_batches add column if not exists inserted_rows integer default 0;
alter table public.wms_stock_import_batches add column if not exists updated_rows integer default 0;
alter table public.wms_stock_import_batches add column if not exists unchanged_rows integer default 0;
alter table public.wms_stock_import_batches add column if not exists deactivated_rows integer default 0;
alter table public.wms_stock_import_batches add column if not exists negative_rows integer default 0;
alter table public.wms_stock_import_batches add column if not exists alert_rows integer default 0;
alter table public.wms_stock_import_batches add column if not exists ignored_rows integer default 0;
alter table public.wms_stock_import_batches add column if not exists error_rows integer default 0;
alter table public.wms_stock_import_batches add column if not exists status text default 'PROCESSING';
alter table public.wms_stock_import_batches add column if not exists notes text default '';
alter table public.wms_stock_import_batches add column if not exists import_mode text default 'CARGA_COMPLETA';
alter table public.wms_stock_import_batches add column if not exists idempotency_key text default '';
alter table public.wms_stock_import_batches add column if not exists request_id text default '';

create table if not exists public.wms_stock_positions (
  id text primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  warehouse_code text not null default 'VDCG',
  source_type text not null,
  batch_id text default '',
  codigo_material text not null,
  nome_material text default '',
  total_fisico numeric default 0,
  total_alocado numeric default 0,
  total_disponivel numeric default 0,
  estacao text default '',
  rack text default '',
  linha text default '',
  coluna text default '',
  codigo_endereco text default '',
  active boolean default true,
  is_sellable boolean default false,
  record_hash text default '',
  last_seen_batch_id text default ''
);

alter table public.wms_stock_positions add column if not exists created_at timestamptz default now();
alter table public.wms_stock_positions add column if not exists updated_at timestamptz default now();
alter table public.wms_stock_positions add column if not exists warehouse_code text not null default 'VDCG';
alter table public.wms_stock_positions add column if not exists source_type text not null default 'CAPTACAO';
alter table public.wms_stock_positions add column if not exists batch_id text default '';
alter table public.wms_stock_positions add column if not exists codigo_material text not null default '';
alter table public.wms_stock_positions add column if not exists nome_material text default '';
alter table public.wms_stock_positions add column if not exists total_fisico numeric default 0;
alter table public.wms_stock_positions add column if not exists total_alocado numeric default 0;
alter table public.wms_stock_positions add column if not exists total_disponivel numeric default 0;
alter table public.wms_stock_positions add column if not exists estacao text default '';
alter table public.wms_stock_positions add column if not exists rack text default '';
alter table public.wms_stock_positions add column if not exists linha text default '';
alter table public.wms_stock_positions add column if not exists coluna text default '';
alter table public.wms_stock_positions add column if not exists codigo_endereco text default '';
alter table public.wms_stock_positions add column if not exists active boolean default true;
alter table public.wms_stock_positions add column if not exists is_sellable boolean default false;
alter table public.wms_stock_positions add column if not exists record_hash text default '';
alter table public.wms_stock_positions add column if not exists last_seen_batch_id text default '';

create index if not exists wms_stock_batches_warehouse_source_created_idx
on public.wms_stock_import_batches (warehouse_code, source_type, created_at desc);

create index if not exists idx_stock_batches_warehouse_source
on public.wms_stock_import_batches (warehouse_code, source_type, created_at);

create unique index if not exists wms_stock_batches_idempotency_uidx
on public.wms_stock_import_batches (warehouse_code, idempotency_key)
where idempotency_key is not null and idempotency_key <> '';

create index if not exists idx_stock_sync
on public.wms_stock_import_batches (warehouse_code, created_at desc, status);

create index if not exists wms_stock_positions_warehouse_source_active_idx
on public.wms_stock_positions (warehouse_code, source_type, active);

create index if not exists idx_stock_positions_source_active
on public.wms_stock_positions (warehouse_code, source_type, active);

create index if not exists wms_stock_positions_warehouse_sku_active_idx
on public.wms_stock_positions (warehouse_code, codigo_material, active);

create index if not exists idx_stock_positions_warehouse_codigo
on public.wms_stock_positions (warehouse_code, codigo_material, active);

create index if not exists wms_stock_positions_warehouse_source_sku_idx
on public.wms_stock_positions (warehouse_code, source_type, codigo_material);

create index if not exists idx_stock_positions_import_key
on public.wms_stock_positions (warehouse_code, source_type, codigo_material, active);

create index if not exists idx_stock_positions_warehouse_source_codigo
on public.wms_stock_positions (warehouse_code, source_type, codigo_material, active);

create index if not exists idx_stock_positions_hash
on public.wms_stock_positions (warehouse_code, source_type, codigo_material, record_hash);

create index if not exists idx_stock_positions_negative
on public.wms_stock_positions (warehouse_code, source_type, total_disponivel, active);

create index if not exists idx_stock_positions_capture_location
on public.wms_stock_positions (warehouse_code, source_type, codigo_material, estacao, rack, linha, coluna, active);

create index if not exists wms_stock_positions_batch_idx
on public.wms_stock_positions (batch_id);

create index if not exists idx_stock_positions_replenishment
on public.wms_stock_positions (warehouse_code, source_type, total_disponivel, active);

create index if not exists idx_stock_positions_available
on public.wms_stock_positions (warehouse_code, source_type, total_disponivel, active);

create index if not exists idx_stock_positions_codigo_active
on public.wms_stock_positions (warehouse_code, codigo_material, active);

create index if not exists idx_stock_batches_status
on public.wms_stock_import_batches (warehouse_code, source_type, status, created_at);

create table if not exists public.wms_stock_alerts (
  id text primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  resolved_at timestamptz,
  warehouse_code text not null default 'VDCG',
  source_type text default '',
  alert_type text not null default '',
  codigo_material text not null default '',
  nome_material text default '',
  saldo_loja numeric default 0,
  saldo_captacao numeric default 0,
  localizacao_captacao text default '',
  batch_id text default '',
  active boolean default true
);

alter table public.wms_stock_alerts add column if not exists created_at timestamptz default now();
alter table public.wms_stock_alerts add column if not exists updated_at timestamptz default now();
alter table public.wms_stock_alerts add column if not exists resolved_at timestamptz;
alter table public.wms_stock_alerts add column if not exists warehouse_code text not null default 'VDCG';
alter table public.wms_stock_alerts add column if not exists source_type text default '';
alter table public.wms_stock_alerts add column if not exists alert_type text not null default '';
alter table public.wms_stock_alerts add column if not exists codigo_material text not null default '';
alter table public.wms_stock_alerts add column if not exists nome_material text default '';
alter table public.wms_stock_alerts add column if not exists saldo_loja numeric default 0;
alter table public.wms_stock_alerts add column if not exists saldo_captacao numeric default 0;
alter table public.wms_stock_alerts add column if not exists localizacao_captacao text default '';
alter table public.wms_stock_alerts add column if not exists batch_id text default '';
alter table public.wms_stock_alerts add column if not exists active boolean default true;

create unique index if not exists wms_stock_alerts_warehouse_sku_uidx
on public.wms_stock_alerts (warehouse_code, codigo_material);

create index if not exists wms_stock_alerts_active_idx
on public.wms_stock_alerts (warehouse_code, active, alert_type, updated_at desc);

alter table public.wms_stock_import_batches enable row level security;
alter table public.wms_stock_positions enable row level security;
alter table public.wms_stock_alerts enable row level security;

drop policy if exists "wms_stock_import_batches_public_all" on public.wms_stock_import_batches;
create policy "wms_stock_import_batches_public_all" on public.wms_stock_import_batches
for all using (true) with check (true);

drop policy if exists "wms_stock_positions_public_all" on public.wms_stock_positions;
create policy "wms_stock_positions_public_all" on public.wms_stock_positions
for all using (true) with check (true);

drop policy if exists "wms_stock_alerts_public_all" on public.wms_stock_alerts;
create policy "wms_stock_alerts_public_all" on public.wms_stock_alerts
for all using (true) with check (true);

create index if not exists wms_transfer_events_warehouse_idx
on public.wms_transfer_events (warehouse_code);

create index if not exists wms_transfer_divergences_warehouse_idx
on public.wms_transfer_divergences (warehouse_code);

create index if not exists wms_transfer_merge_items_merged_idx
on public.wms_transfer_merge_items (merged_transfer_id);

create index if not exists wms_transfer_merge_items_original_idx
on public.wms_transfer_merge_items (original_transfer_id);

create index if not exists wms_product_packaging_sku_idx
on public.wms_product_packaging (sku);

alter table public.wms_establishments enable row level security;
alter table public.wms_transfers enable row level security;
alter table public.wms_transfer_items enable row level security;
alter table public.wms_transfer_events enable row level security;
alter table public.wms_transfer_divergences enable row level security;
alter table public.wms_transfer_merge_items enable row level security;
alter table public.wms_product_packaging enable row level security;

drop policy if exists "wms_establishments_public_all" on public.wms_establishments;
create policy "wms_establishments_public_all"
on public.wms_establishments
for all
to anon
using (true)
with check (true);

drop policy if exists "wms_transfers_public_all" on public.wms_transfers;
create policy "wms_transfers_public_all"
on public.wms_transfers
for all
to anon
using (true)
with check (true);

drop policy if exists "wms_transfer_items_public_all" on public.wms_transfer_items;
create policy "wms_transfer_items_public_all"
on public.wms_transfer_items
for all
to anon
using (true)
with check (true);

drop policy if exists "wms_transfer_merge_items_public_all" on public.wms_transfer_merge_items;
create policy "wms_transfer_merge_items_public_all"
on public.wms_transfer_merge_items
for all
to anon
using (true)
with check (true);

drop policy if exists "wms_product_packaging_public_all" on public.wms_product_packaging;
create policy "wms_product_packaging_public_all"
on public.wms_product_packaging
for all
to anon
using (true)
with check (true);

drop policy if exists "wms_transfer_events_public_all" on public.wms_transfer_events;
create policy "wms_transfer_events_public_all"
on public.wms_transfer_events
for all
to anon
using (true)
with check (true);

drop policy if exists "wms_transfer_divergences_public_all" on public.wms_transfer_divergences;
create policy "wms_transfer_divergences_public_all"
on public.wms_transfer_divergences
for all
to anon
using (true)
with check (true);

create table if not exists public.wms_conferences (
  id text primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  name text default '',
  document_type text default '',
  xml_key text default '',
  document_number text default '',
  series text default '',
  issuer_cnpj text default '',
  issuer_name text default '',
  recipient_cnpj text default '',
  recipient_name text default '',
  assigned_to_id text default '',
  assigned_to_name text default '',
  created_by_id text default '',
  created_by_name text default '',
  status text default 'PENDENTE',
  started_at timestamptz,
  finished_at timestamptz,
  duration_seconds numeric default 0,
  total_items numeric default 0,
  total_expected_quantity numeric default 0,
  total_checked_quantity numeric default 0,
  correct_items numeric default 0,
  divergence_count numeric default 0,
  accuracy_percent numeric default 0,
  final_result text default '',
  notes text default '',
  payload jsonb default '{}'::jsonb
);

alter table public.wms_conferences add column if not exists created_at timestamptz default now();
alter table public.wms_conferences add column if not exists updated_at timestamptz default now();
alter table public.wms_conferences add column if not exists name text default '';
alter table public.wms_conferences add column if not exists document_type text default '';
alter table public.wms_conferences add column if not exists xml_key text default '';
alter table public.wms_conferences add column if not exists document_number text default '';
alter table public.wms_conferences add column if not exists series text default '';
alter table public.wms_conferences add column if not exists issuer_cnpj text default '';
alter table public.wms_conferences add column if not exists issuer_name text default '';
alter table public.wms_conferences add column if not exists recipient_cnpj text default '';
alter table public.wms_conferences add column if not exists recipient_name text default '';
alter table public.wms_conferences add column if not exists assigned_to_id text default '';
alter table public.wms_conferences add column if not exists assigned_to_name text default '';
alter table public.wms_conferences add column if not exists created_by_id text default '';
alter table public.wms_conferences add column if not exists created_by_name text default '';
alter table public.wms_conferences add column if not exists status text default 'PENDENTE';
alter table public.wms_conferences add column if not exists started_at timestamptz;
alter table public.wms_conferences add column if not exists finished_at timestamptz;
alter table public.wms_conferences add column if not exists duration_seconds numeric default 0;
alter table public.wms_conferences add column if not exists total_items numeric default 0;
alter table public.wms_conferences add column if not exists total_expected_quantity numeric default 0;
alter table public.wms_conferences add column if not exists total_checked_quantity numeric default 0;
alter table public.wms_conferences add column if not exists correct_items numeric default 0;
alter table public.wms_conferences add column if not exists divergence_count numeric default 0;
alter table public.wms_conferences add column if not exists accuracy_percent numeric default 0;
alter table public.wms_conferences add column if not exists final_result text default '';
alter table public.wms_conferences add column if not exists notes text default '';
alter table public.wms_conferences add column if not exists payload jsonb default '{}'::jsonb;
alter table public.wms_conferences add column if not exists warehouse_id text default 'warehouse-vdcg';
alter table public.wms_conferences add column if not exists warehouse_code text default 'VDCG';

update public.wms_conferences
set warehouse_id = coalesce(nullif(warehouse_id, ''), 'warehouse-vdcg'),
    warehouse_code = coalesce(nullif(warehouse_code, ''), 'VDCG')
where warehouse_code is null or warehouse_code = '' or warehouse_id is null or warehouse_id = '';

create table if not exists public.wms_conference_items (
  id text primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  conference_id text default '',
  sku text default '',
  ean text default '',
  codigo_item text default '',
  descricao text default '',
  unidade text default '',
  quantidade_xml numeric default 0,
  quantidade_conferida numeric default 0,
  diferenca numeric default 0,
  status text default 'PENDENTE',
  divergence_type text default '',
  is_extra boolean default false,
  observation text default '',
  payload jsonb default '{}'::jsonb
);

alter table public.wms_conference_items add column if not exists created_at timestamptz default now();
alter table public.wms_conference_items add column if not exists updated_at timestamptz default now();
alter table public.wms_conference_items add column if not exists conference_id text default '';
alter table public.wms_conference_items add column if not exists sku text default '';
alter table public.wms_conference_items add column if not exists ean text default '';
alter table public.wms_conference_items add column if not exists codigo_item text default '';
alter table public.wms_conference_items add column if not exists descricao text default '';
alter table public.wms_conference_items add column if not exists unidade text default '';
alter table public.wms_conference_items add column if not exists quantidade_xml numeric default 0;
alter table public.wms_conference_items add column if not exists quantidade_conferida numeric default 0;
alter table public.wms_conference_items add column if not exists diferenca numeric default 0;
alter table public.wms_conference_items add column if not exists status text default 'PENDENTE';
alter table public.wms_conference_items add column if not exists divergence_type text default '';
alter table public.wms_conference_items add column if not exists is_extra boolean default false;
alter table public.wms_conference_items add column if not exists observation text default '';
alter table public.wms_conference_items add column if not exists payload jsonb default '{}'::jsonb;
alter table public.wms_conference_items add column if not exists warehouse_id text default 'warehouse-vdcg';
alter table public.wms_conference_items add column if not exists warehouse_code text default 'VDCG';

update public.wms_conference_items
set warehouse_id = coalesce(nullif(warehouse_id, ''), 'warehouse-vdcg'),
    warehouse_code = coalesce(nullif(warehouse_code, ''), 'VDCG')
where warehouse_code is null or warehouse_code = '' or warehouse_id is null or warehouse_id = '';

create table if not exists public.wms_conference_events (
  id text primary key,
  created_at timestamptz default now(),
  conference_id text default '',
  item_id text default '',
  user_id text default '',
  user_name text default '',
  event_type text default '',
  codigo_informado text default '',
  sku text default '',
  ean text default '',
  quantidade numeric default 0,
  input_type text default '',
  divergence_type text default '',
  observation text default '',
  payload jsonb default '{}'::jsonb
);

alter table public.wms_conference_events add column if not exists created_at timestamptz default now();
alter table public.wms_conference_events add column if not exists conference_id text default '';
alter table public.wms_conference_events add column if not exists item_id text default '';
alter table public.wms_conference_events add column if not exists user_id text default '';
alter table public.wms_conference_events add column if not exists user_name text default '';
alter table public.wms_conference_events add column if not exists event_type text default '';
alter table public.wms_conference_events add column if not exists codigo_informado text default '';
alter table public.wms_conference_events add column if not exists sku text default '';
alter table public.wms_conference_events add column if not exists ean text default '';
alter table public.wms_conference_events add column if not exists quantidade numeric default 0;
alter table public.wms_conference_events add column if not exists input_type text default '';
alter table public.wms_conference_events add column if not exists divergence_type text default '';
alter table public.wms_conference_events add column if not exists observation text default '';
alter table public.wms_conference_events add column if not exists payload jsonb default '{}'::jsonb;
alter table public.wms_conference_events add column if not exists warehouse_id text default 'warehouse-vdcg';
alter table public.wms_conference_events add column if not exists warehouse_code text default 'VDCG';

update public.wms_conference_events
set warehouse_id = coalesce(nullif(warehouse_id, ''), 'warehouse-vdcg'),
    warehouse_code = coalesce(nullif(warehouse_code, ''), 'VDCG')
where warehouse_code is null or warehouse_code = '' or warehouse_id is null or warehouse_id = '';

create table if not exists public.wms_conference_divergences (
  id text primary key,
  created_at timestamptz default now(),
  conference_id text default '',
  item_id text default '',
  sku text default '',
  ean text default '',
  descricao text default '',
  divergence_type text default '',
  expected_quantity numeric default 0,
  checked_quantity numeric default 0,
  difference_quantity numeric default 0,
  user_id text default '',
  user_name text default '',
  resolved boolean default false,
  resolved_by text default '',
  resolved_at timestamptz,
  observation text default '',
  payload jsonb default '{}'::jsonb
);

alter table public.wms_conference_divergences add column if not exists created_at timestamptz default now();
alter table public.wms_conference_divergences add column if not exists conference_id text default '';
alter table public.wms_conference_divergences add column if not exists item_id text default '';
alter table public.wms_conference_divergences add column if not exists sku text default '';
alter table public.wms_conference_divergences add column if not exists ean text default '';
alter table public.wms_conference_divergences add column if not exists descricao text default '';
alter table public.wms_conference_divergences add column if not exists divergence_type text default '';
alter table public.wms_conference_divergences add column if not exists expected_quantity numeric default 0;
alter table public.wms_conference_divergences add column if not exists checked_quantity numeric default 0;
alter table public.wms_conference_divergences add column if not exists difference_quantity numeric default 0;
alter table public.wms_conference_divergences add column if not exists user_id text default '';
alter table public.wms_conference_divergences add column if not exists user_name text default '';
alter table public.wms_conference_divergences add column if not exists resolved boolean default false;
alter table public.wms_conference_divergences add column if not exists resolved_by text default '';
alter table public.wms_conference_divergences add column if not exists resolved_at timestamptz;
alter table public.wms_conference_divergences add column if not exists observation text default '';
alter table public.wms_conference_divergences add column if not exists payload jsonb default '{}'::jsonb;
alter table public.wms_conference_divergences add column if not exists warehouse_id text default 'warehouse-vdcg';
alter table public.wms_conference_divergences add column if not exists warehouse_code text default 'VDCG';

update public.wms_conference_divergences
set warehouse_id = coalesce(nullif(warehouse_id, ''), 'warehouse-vdcg'),
    warehouse_code = coalesce(nullif(warehouse_code, ''), 'VDCG')
where warehouse_code is null or warehouse_code = '' or warehouse_id is null or warehouse_id = '';

create index if not exists wms_conferences_assigned_status_idx
on public.wms_conferences (assigned_to_id, status);

create index if not exists wms_conferences_warehouse_idx
on public.wms_conferences (warehouse_code);

create index if not exists wms_conference_items_conference_sku_idx
on public.wms_conference_items (conference_id, sku);

create index if not exists wms_conference_items_warehouse_idx
on public.wms_conference_items (warehouse_code);

create index if not exists wms_conference_events_warehouse_idx
on public.wms_conference_events (warehouse_code);

create index if not exists wms_conference_divergences_warehouse_idx
on public.wms_conference_divergences (warehouse_code);

alter table public.wms_conferences enable row level security;
alter table public.wms_conference_items enable row level security;
alter table public.wms_conference_events enable row level security;
alter table public.wms_conference_divergences enable row level security;

drop policy if exists "wms_conferences_public_all" on public.wms_conferences;
create policy "wms_conferences_public_all"
on public.wms_conferences
for all
to anon
using (true)
with check (true);

drop policy if exists "wms_conference_items_public_all" on public.wms_conference_items;
create policy "wms_conference_items_public_all"
on public.wms_conference_items
for all
to anon
using (true)
with check (true);

drop policy if exists "wms_conference_events_public_all" on public.wms_conference_events;
create policy "wms_conference_events_public_all"
on public.wms_conference_events
for all
to anon
using (true)
with check (true);

drop policy if exists "wms_conference_divergences_public_all" on public.wms_conference_divergences;
create policy "wms_conference_divergences_public_all"
on public.wms_conference_divergences
for all
to anon
using (true)
with check (true);

do $$
declare
  tbl_name text;
  tables text[] := array[
    'wms_bindings',
    'wms_history',
    'wms_transfers',
    'wms_transfer_items',
    'wms_transfer_events',
    'wms_transfer_divergences',
    'wms_transfer_merge_items',
    'wms_transfer_boxes',
    'wms_notifications',
    'wms_task_notifications',
    'wms_conferences',
    'wms_conference_items',
    'wms_conference_events',
    'wms_conference_divergences'
  ];
begin
  foreach tbl_name in array tables loop
    if to_regclass('public.' || tbl_name) is not null then
      if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = tbl_name
          and column_name = 'warehouse_code'
      ) then
        execute format('update public.%I set warehouse_code = $1 where warehouse_code in ($2, $3)', tbl_name)
        using 'VDAR', 'VDR', 'DVR';
      end if;
      if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = tbl_name
          and column_name = 'warehouse_id'
      ) then
        execute format('update public.%I set warehouse_id = $1 where warehouse_id in ($2, $3)', tbl_name)
        using 'warehouse-vdar', 'warehouse-vdr', 'warehouse-dvr';
      end if;
    end if;
  end loop;
end $$;

do $$
begin
  if to_regclass('public.wms_locations') is not null then
    alter table public.wms_locations add column if not exists warehouse_code text default 'VDCG';
    update public.wms_locations
    set warehouse_code = coalesce(nullif(warehouse_code, ''), 'VDCG')
    where warehouse_code is null or warehouse_code = '';
    execute 'create index if not exists wms_locations_codigo_endereco_idx on public.wms_locations (codigo_endereco)';
    execute 'create index if not exists wms_locations_parts_idx on public.wms_locations (nome_estacao, nr_rack, linha, coluna)';
  end if;

  if to_regclass('public.wms_location_skus') is not null then
    alter table public.wms_location_skus add column if not exists warehouse_code text default 'VDCG';
    update public.wms_location_skus
    set warehouse_code = coalesce(nullif(warehouse_code, ''), 'VDCG')
    where warehouse_code is null or warehouse_code = '';
    execute 'create index if not exists wms_location_skus_sku_idx on public.wms_location_skus (sku)';
    execute 'create index if not exists wms_location_skus_codigo_material_idx on public.wms_location_skus (codigo_material)';
    execute 'create index if not exists wms_location_skus_location_id_idx on public.wms_location_skus (location_id)';
  end if;
end $$;

create table if not exists public.wms_sync_metadata (
  module_name text primary key,
  last_sync_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.wms_pending_sync_actions (
  id text primary key,
  created_at timestamptz default now(),
  action_type text default '',
  payload jsonb default '{}'::jsonb,
  status text default 'PENDENTE',
  retry_count integer default 0,
  last_error text default '',
  warehouse_code text default 'VDCG'
);

alter table public.wms_sync_metadata enable row level security;
alter table public.wms_pending_sync_actions enable row level security;

drop policy if exists "wms_sync_metadata_public_all" on public.wms_sync_metadata;
create policy "wms_sync_metadata_public_all"
on public.wms_sync_metadata
for all
to anon
using (true)
with check (true);

drop policy if exists "wms_pending_sync_actions_public_all" on public.wms_pending_sync_actions;
create policy "wms_pending_sync_actions_public_all"
on public.wms_pending_sync_actions
for all
to anon
using (true)
with check (true);

do $$
begin
  if to_regclass('public.wms_users') is not null then
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_users' and column_name = 'username') then execute 'create index if not exists wms_users_username_idx on public.wms_users (username)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_users' and column_name = 'active') then execute 'create index if not exists wms_users_active_idx on public.wms_users (active)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_users' and column_name = 'role') then execute 'create index if not exists wms_users_role_idx on public.wms_users (role)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_users' and column_name = 'default_warehouse_code') then execute 'create index if not exists wms_users_default_warehouse_idx on public.wms_users (default_warehouse_code)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_users' and column_name = 'default_warehouse_code') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_users' and column_name = 'active') then execute 'create index if not exists wms_users_warehouse_active_idx on public.wms_users (default_warehouse_code, active)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_users' and column_name = 'default_warehouse_code') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_users' and column_name = 'supervisor_id') then execute 'create index if not exists idx_users_warehouse_supervisor on public.wms_users (default_warehouse_code, supervisor_id)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_users' and column_name = 'default_warehouse_code') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_users' and column_name = 'archived') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_users' and column_name = 'active') then execute 'create index if not exists idx_users_warehouse_archived on public.wms_users (default_warehouse_code, archived, active)'; end if;
  end if;

  if to_regclass('public.wms_establishments') is not null then
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_establishments' and column_name = 'sigla') then execute 'create index if not exists wms_establishments_sigla_idx on public.wms_establishments (sigla)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_establishments' and column_name = 'cnpj') then execute 'create index if not exists wms_establishments_cnpj_idx on public.wms_establishments (cnpj)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_establishments' and column_name = 'codigo_loja') then execute 'create index if not exists wms_establishments_codigo_loja_idx on public.wms_establishments (codigo_loja)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_establishments' and column_name = 'codigo_interno') then execute 'create index if not exists wms_establishments_codigo_interno_idx on public.wms_establishments (codigo_interno)'; end if;
  end if;

  if to_regclass('public.wms_bindings') is not null then
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_bindings' and column_name = 'warehouse_code') then execute 'create index if not exists wms_bindings_warehouse_idx on public.wms_bindings (warehouse_code)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_bindings' and column_name = 'warehouse_code') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_bindings' and column_name = 'sku') then execute 'create index if not exists wms_bindings_warehouse_sku_idx on public.wms_bindings (warehouse_code, sku)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_bindings' and column_name = 'location_code') then execute 'create index if not exists wms_bindings_location_code_idx on public.wms_bindings (location_code)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_bindings' and column_name = 'warehouse_code') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_bindings' and column_name = 'location_code') then execute 'create index if not exists wms_bindings_warehouse_location_idx on public.wms_bindings (warehouse_code, location_code)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_bindings' and column_name = 'warehouse_code') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_bindings' and column_name = 'codigo_material') then execute 'create index if not exists wms_bindings_warehouse_codigo_material_idx on public.wms_bindings (warehouse_code, codigo_material)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_bindings' and column_name = 'warehouse_code') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_bindings' and column_name = 'codigo_endereco') then execute 'create index if not exists wms_bindings_warehouse_codigo_endereco_idx on public.wms_bindings (warehouse_code, codigo_endereco)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_bindings' and column_name = 'nome_estacao') then execute 'create index if not exists wms_bindings_nome_estacao_idx on public.wms_bindings (nome_estacao)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_bindings' and column_name = 'nr_rack') then execute 'create index if not exists wms_bindings_nr_rack_idx on public.wms_bindings (nr_rack)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_bindings' and column_name = 'linha') then execute 'create index if not exists wms_bindings_linha_idx on public.wms_bindings (linha)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_bindings' and column_name = 'coluna') then execute 'create index if not exists wms_bindings_coluna_idx on public.wms_bindings (coluna)'; end if;
  end if;

  if to_regclass('public.wms_transfers') is not null then
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_transfers' and column_name = 'responsavel_id') then execute 'create index if not exists wms_transfers_responsavel_status_idx on public.wms_transfers (responsavel_id, status)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_transfers' and column_name = 'origem_sigla') then execute 'create index if not exists wms_transfers_origem_sigla_idx on public.wms_transfers (origem_sigla)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_transfers' and column_name = 'destino_sigla') then execute 'create index if not exists wms_transfers_destino_sigla_idx on public.wms_transfers (destino_sigla)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_transfers' and column_name = 'warehouse_code') then execute 'create index if not exists wms_transfers_warehouse_responsavel_status_idx on public.wms_transfers (warehouse_code, responsavel_id, status)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_transfers' and column_name = 'warehouse_code') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_transfers' and column_name = 'last_action_at') then execute 'create index if not exists wms_transfers_warehouse_last_action_idx on public.wms_transfers (warehouse_code, last_action_at desc)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_transfers' and column_name = 'warehouse_code') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_transfers' and column_name = 'updated_at') then execute 'create index if not exists idx_transfer_sync on public.wms_transfers (warehouse_code, updated_at desc, id)'; end if;
  end if;

  if to_regclass('public.wms_transfer_items') is not null then
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_transfer_items' and column_name = 'transfer_id') then execute 'create index if not exists wms_transfer_items_transfer_sku_idx on public.wms_transfer_items (transfer_id, sku)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_transfer_items' and column_name = 'status') then execute 'create index if not exists wms_transfer_items_status_idx on public.wms_transfer_items (status)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_transfer_items' and column_name = 'warehouse_code') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_transfer_items' and column_name = 'status') then execute 'create index if not exists wms_transfer_items_warehouse_status_idx on public.wms_transfer_items (warehouse_code, status)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_transfer_items' and column_name = 'warehouse_code') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_transfer_items' and column_name = 'transfer_id') then execute 'create index if not exists wms_transfer_items_warehouse_transfer_idx on public.wms_transfer_items (warehouse_code, transfer_id)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_transfer_items' and column_name = 'warehouse_code') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_transfer_items' and column_name = 'updated_at') then execute 'create index if not exists idx_transfer_items_sync on public.wms_transfer_items (warehouse_code, transfer_id, updated_at desc)'; end if;
  end if;

  if to_regclass('public.wms_notifications') is not null then
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_notifications' and column_name = 'user_id') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_notifications' and column_name = 'read') then execute 'create index if not exists wms_notifications_user_read_created_idx on public.wms_notifications (user_id, read, created_at desc)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_notifications' and column_name = 'warehouse_code') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_notifications' and column_name = 'user_id') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_notifications' and column_name = 'read') then execute 'create index if not exists idx_wms_notifications_user_read on public.wms_notifications (warehouse_code, user_id, read)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_notifications' and column_name = 'warehouse_code') then execute 'create index if not exists wms_notifications_warehouse_created_idx on public.wms_notifications (warehouse_code, created_at desc)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_notifications' and column_name = 'warehouse_code') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_notifications' and column_name = 'transfer_id') then execute 'create index if not exists idx_wms_notifications_transfer on public.wms_notifications (warehouse_code, transfer_id)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_notifications' and column_name = 'warehouse_code') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_notifications' and column_name = 'created_at') then execute 'create index if not exists idx_notifications_sync on public.wms_notifications (warehouse_code, created_at desc)'; end if;
  end if;

  if to_regclass('public.wms_task_notifications') is not null then
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_task_notifications' and column_name = 'user_id') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_task_notifications' and column_name = 'warehouse_code') then execute 'create index if not exists wms_task_notifications_user_warehouse_idx on public.wms_task_notifications (user_id, warehouse_code)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_task_notifications' and column_name = 'warehouse_code') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_task_notifications' and column_name = 'user_id') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_task_notifications' and column_name = 'read') then execute 'create index if not exists idx_wms_task_notifications_user_read on public.wms_task_notifications (warehouse_code, user_id, read)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_task_notifications' and column_name = 'warehouse_code') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_task_notifications' and column_name = 'created_at') then execute 'create index if not exists wms_task_notifications_warehouse_created_idx on public.wms_task_notifications (warehouse_code, created_at desc)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_task_notifications' and column_name = 'warehouse_code') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_task_notifications' and column_name = 'transfer_id') then execute 'create index if not exists idx_wms_task_notifications_transfer on public.wms_task_notifications (warehouse_code, transfer_id)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_task_notifications' and column_name = 'warehouse_code') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_task_notifications' and column_name = 'created_at') then execute 'create index if not exists idx_task_notifications_sync on public.wms_task_notifications (warehouse_code, created_at desc)'; end if;
  end if;

  if to_regclass('public.wms_locations') is not null then
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_locations' and column_name = 'warehouse_code') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_locations' and column_name = 'codigo_endereco') then execute 'create index if not exists wms_locations_warehouse_codigo_idx on public.wms_locations (warehouse_code, codigo_endereco)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_locations' and column_name = 'warehouse_code') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_locations' and column_name = 'nome_estacao') then execute 'create index if not exists wms_locations_warehouse_parts_idx on public.wms_locations (warehouse_code, nome_estacao, nr_rack, linha, coluna)'; end if;
  end if;

  if to_regclass('public.wms_location_skus') is not null then
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_location_skus' and column_name = 'warehouse_code') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_location_skus' and column_name = 'sku') then execute 'create index if not exists wms_location_skus_warehouse_sku_idx on public.wms_location_skus (warehouse_code, sku)'; end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_location_skus' and column_name = 'warehouse_code') and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_location_skus' and column_name = 'active') then execute 'create index if not exists wms_location_skus_warehouse_active_idx on public.wms_location_skus (warehouse_code, active)'; end if;
  end if;
end $$;

create table if not exists public.wms_replenishment_requests (
  id text primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  warehouse_code text not null default 'VDCG',
  codigo_material text not null,
  nome_material text,
  quantidade_disponivel_loja_informada numeric default 0,
  quantidade_solicitada numeric not null default 0,
  quantidade_atendida numeric not null default 0,
  quantidade_pendente numeric not null default 0,
  localizacao_wms text,
  localizacao_estacao text,
  localizacao_rack text,
  localizacao_linha text,
  localizacao_coluna text,
  captacao_estacao text,
  captacao_rack text,
  captacao_linha text,
  captacao_coluna text,
  solicitado_por_id text,
  solicitado_por_nome text,
  responsavel_id text,
  responsavel_nome text,
  claimed_by_id text,
  claimed_by_name text,
  claimed_at timestamptz,
  returned_to_queue_at timestamptz,
  returned_to_queue_by_id text,
  returned_to_queue_by_name text,
  return_reason text,
  status text not null default 'PENDENTE',
  prioridade text default 'NORMAL',
  observacao text,
  motivo_cancelamento text,
  started_at timestamptz,
  finished_at timestamptz,
  duration_seconds integer default 0,
  is_deleted boolean default false,
  deleted_at timestamptz,
  deleted_by_id text,
  deleted_by_name text
);

alter table public.wms_replenishment_requests add column if not exists created_at timestamptz default now();
alter table public.wms_replenishment_requests add column if not exists updated_at timestamptz default now();
alter table public.wms_replenishment_requests add column if not exists warehouse_code text not null default 'VDCG';
alter table public.wms_replenishment_requests add column if not exists codigo_material text;
alter table public.wms_replenishment_requests add column if not exists nome_material text;
alter table public.wms_replenishment_requests add column if not exists quantidade_disponivel_loja_informada numeric default 0;
alter table public.wms_replenishment_requests add column if not exists quantidade_solicitada numeric not null default 0;
alter table public.wms_replenishment_requests add column if not exists quantidade_atendida numeric not null default 0;
alter table public.wms_replenishment_requests add column if not exists quantidade_pendente numeric not null default 0;
alter table public.wms_replenishment_requests add column if not exists localizacao_wms text;
alter table public.wms_replenishment_requests add column if not exists localizacao_estacao text;
alter table public.wms_replenishment_requests add column if not exists localizacao_rack text;
alter table public.wms_replenishment_requests add column if not exists localizacao_linha text;
alter table public.wms_replenishment_requests add column if not exists localizacao_coluna text;
alter table public.wms_replenishment_requests add column if not exists captacao_estacao text;
alter table public.wms_replenishment_requests add column if not exists captacao_rack text;
alter table public.wms_replenishment_requests add column if not exists captacao_linha text;
alter table public.wms_replenishment_requests add column if not exists captacao_coluna text;
alter table public.wms_replenishment_requests add column if not exists solicitado_por_id text;
alter table public.wms_replenishment_requests add column if not exists solicitado_por_nome text;
alter table public.wms_replenishment_requests add column if not exists responsavel_id text;
alter table public.wms_replenishment_requests add column if not exists responsavel_nome text;
alter table public.wms_replenishment_requests add column if not exists claimed_by_id text;
alter table public.wms_replenishment_requests add column if not exists claimed_by_name text;
alter table public.wms_replenishment_requests add column if not exists claimed_at timestamptz;
alter table public.wms_replenishment_requests add column if not exists returned_to_queue_at timestamptz;
alter table public.wms_replenishment_requests add column if not exists returned_to_queue_by_id text;
alter table public.wms_replenishment_requests add column if not exists returned_to_queue_by_name text;
alter table public.wms_replenishment_requests add column if not exists return_reason text;
alter table public.wms_replenishment_requests add column if not exists status text not null default 'PENDENTE';
alter table public.wms_replenishment_requests add column if not exists prioridade text default 'NORMAL';
alter table public.wms_replenishment_requests add column if not exists observacao text;
alter table public.wms_replenishment_requests add column if not exists motivo_cancelamento text;
alter table public.wms_replenishment_requests add column if not exists started_at timestamptz;
alter table public.wms_replenishment_requests add column if not exists finished_at timestamptz;
alter table public.wms_replenishment_requests add column if not exists duration_seconds integer default 0;
alter table public.wms_replenishment_requests add column if not exists is_deleted boolean default false;
alter table public.wms_replenishment_requests add column if not exists deleted_at timestamptz;
alter table public.wms_replenishment_requests add column if not exists deleted_by_id text;
alter table public.wms_replenishment_requests add column if not exists deleted_by_name text;
alter table public.wms_replenishment_requests add column if not exists idempotency_key text default '';
alter table public.wms_replenishment_requests add column if not exists request_id text default '';
alter table public.wms_replenishment_requests add column if not exists client_action_id text default '';
alter table public.wms_replenishment_requests add column if not exists created_by_id text default '';

update public.wms_replenishment_requests
set quantidade_pendente = greatest(0, coalesce(quantidade_solicitada, 0) - coalesce(quantidade_atendida, 0))
where quantidade_pendente is null;

create index if not exists wms_replenishment_warehouse_status_idx
on public.wms_replenishment_requests (warehouse_code, status, updated_at desc);

create index if not exists wms_replenishment_responsavel_idx
on public.wms_replenishment_requests (warehouse_code, responsavel_id, status);

create index if not exists wms_replenishment_solicitante_idx
on public.wms_replenishment_requests (warehouse_code, solicitado_por_id, status);

create index if not exists wms_replenishment_sku_idx
on public.wms_replenishment_requests (warehouse_code, codigo_material);

create index if not exists idx_replenishment_open_sku
on public.wms_replenishment_requests (warehouse_code, codigo_material, status);

create index if not exists idx_replenishment_queue
on public.wms_replenishment_requests (warehouse_code, status, created_at);

create index if not exists idx_replenishment_responsavel_status
on public.wms_replenishment_requests (warehouse_code, responsavel_id, status);

create index if not exists idx_replenishment_codigo_status
on public.wms_replenishment_requests (warehouse_code, codigo_material, status);

create index if not exists idx_replenishment_updated
on public.wms_replenishment_requests (warehouse_code, updated_at);

create unique index if not exists wms_replenishment_idempotency_uidx
on public.wms_replenishment_requests (warehouse_code, idempotency_key)
where idempotency_key is not null and idempotency_key <> '';

create index if not exists idx_replenishment_idempotency
on public.wms_replenishment_requests (warehouse_code, idempotency_key);

create unique index if not exists uq_replenishment_idempotency
on public.wms_replenishment_requests (warehouse_code, idempotency_key)
where idempotency_key is not null and idempotency_key <> '';

create index if not exists idx_replenishment_sync
on public.wms_replenishment_requests (warehouse_code, updated_at desc, id);

create index if not exists idx_replenishment_open
on public.wms_replenishment_requests (warehouse_code, is_deleted, status, codigo_material);

alter table public.wms_replenishment_requests enable row level security;

drop policy if exists "wms_replenishment_requests_public_all" on public.wms_replenishment_requests;
create policy "wms_replenishment_requests_public_all"
on public.wms_replenishment_requests
for all
using (true)
with check (true);

create index if not exists wms_pending_sync_actions_status_created_idx
on public.wms_pending_sync_actions (status, created_at);

do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'wms_transfers',
    'wms_transfer_items',
    'wms_transfer_events',
    'wms_transfer_divergences',
    'wms_task_notifications',
    'wms_notifications',
    'wms_replenishment_requests'
  ]
  loop
    if to_regclass('public.' || relation_name) is not null then
      execute format('alter table public.%I replica identity full', relation_name);
      if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
        and not exists (
          select 1
          from pg_publication_tables
          where pubname = 'supabase_realtime'
            and schemaname = 'public'
            and tablename = relation_name
        ) then
        execute format('alter publication supabase_realtime add table public.%I', relation_name);
      end if;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
