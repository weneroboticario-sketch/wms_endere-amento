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
