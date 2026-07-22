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

notify pgrst, 'reload schema';
