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

create unique index if not exists wms_bindings_sku_location_idx
on public.wms_bindings (sku, location_code);

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
alter table public.wms_users add column if not exists active boolean not null default true;
alter table public.wms_users add column if not exists available_for_tasks boolean not null default true;
alter table public.wms_users add column if not exists last_login_at timestamptz;

create unique index if not exists wms_users_username_idx
on public.wms_users (username);

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

create index if not exists wms_access_requests_username_status_idx
on public.wms_access_requests (username, status);

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

alter table public.wms_bindings enable row level security;
alter table public.wms_products enable row level security;
alter table public.wms_history enable row level security;
alter table public.wms_users enable row level security;
alter table public.wms_sessions enable row level security;
alter table public.wms_access_requests enable row level security;

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
alter table public.wms_transfers add column if not exists has_divergence boolean default false;
alter table public.wms_transfers add column if not exists divergence_count numeric default 0;
alter table public.wms_transfers add column if not exists final_result text default '';

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
alter table public.wms_transfer_items add column if not exists tipo_quantidade text default 'UNIDADE';
alter table public.wms_transfer_items add column if not exists quantidade_caixas numeric default 0;
alter table public.wms_transfer_items add column if not exists unidades_por_caixa numeric default 0;
alter table public.wms_transfer_items add column if not exists quantidade_total_unidades numeric default 0;
alter table public.wms_transfer_items add column if not exists quantidade_separada numeric default 0;
alter table public.wms_transfer_items add column if not exists quantidade_lacrada numeric default 0;
alter table public.wms_transfer_items add column if not exists quantidade_extra numeric default 0;
alter table public.wms_transfer_items add column if not exists quantidade_faltante numeric default 0;
alter table public.wms_transfer_items add column if not exists quantidade_excedente numeric default 0;
alter table public.wms_transfer_items add column if not exists is_extra boolean default false;
alter table public.wms_transfer_items add column if not exists divergence_type text default '';
alter table public.wms_transfer_items add column if not exists added_by_id text default '';
alter table public.wms_transfer_items add column if not exists added_by_name text default '';
alter table public.wms_transfer_items add column if not exists input_type text default '';
alter table public.wms_transfer_items add column if not exists observation text default '';
alter table public.wms_transfer_items add column if not exists status text default 'PENDENTE';

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

create index if not exists wms_transfers_responsavel_status_idx
on public.wms_transfers (responsavel_id, status);

create index if not exists wms_transfer_items_transfer_sku_idx
on public.wms_transfer_items (transfer_id, sku);

alter table public.wms_establishments enable row level security;
alter table public.wms_transfers enable row level security;
alter table public.wms_transfer_items enable row level security;
alter table public.wms_transfer_events enable row level security;
alter table public.wms_transfer_divergences enable row level security;

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

create index if not exists wms_conferences_assigned_status_idx
on public.wms_conferences (assigned_to_id, status);

create index if not exists wms_conference_items_conference_sku_idx
on public.wms_conference_items (conference_id, sku);

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
