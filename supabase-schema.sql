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

alter table public.wms_bindings enable row level security;
alter table public.wms_products enable row level security;
alter table public.wms_history enable row level security;

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
