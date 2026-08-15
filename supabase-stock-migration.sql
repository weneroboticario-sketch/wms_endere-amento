alter table public.wms_transfer_items add column if not exists saldo_loja_disponivel numeric default 0;
alter table public.wms_transfer_items add column if not exists saldo_captacao_disponivel numeric default 0;
alter table public.wms_transfer_items add column if not exists origem_sugerida text default '';
alter table public.wms_transfer_items add column if not exists quantidade_sugerida_captacao numeric default 0;
alter table public.wms_transfer_items add column if not exists quantidade_sugerida_loja numeric default 0;
alter table public.wms_transfer_items add column if not exists alerta_saldo boolean default false;
alter table public.wms_transfer_items add column if not exists alerta_saldo_mensagem text default '';
alter table public.wms_transfer_items add column if not exists localizacao_sugerida text default '';

create table if not exists public.wms_stock_import_batches (
  id text primary key,
  created_at timestamptz default now(),
  warehouse_code text not null default 'VDCG',
  source_type text not null default 'CAPTACAO',
  file_name text default '',
  imported_by_id text default '',
  imported_by_name text default '',
  total_rows integer default 0,
  imported_rows integer default 0,
  ignored_rows integer default 0,
  error_rows integer default 0,
  status text default 'PROCESSING',
  notes text default ''
);

create table if not exists public.wms_stock_positions (
  id text primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  warehouse_code text not null default 'VDCG',
  source_type text not null default 'CAPTACAO',
  batch_id text default '',
  codigo_material text not null default '',
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
  is_sellable boolean default false
);

create index if not exists wms_stock_batches_warehouse_source_created_idx
on public.wms_stock_import_batches (warehouse_code, source_type, created_at desc);

create index if not exists wms_stock_positions_warehouse_source_active_idx
on public.wms_stock_positions (warehouse_code, source_type, active);

create index if not exists wms_stock_positions_warehouse_sku_active_idx
on public.wms_stock_positions (warehouse_code, codigo_material, active);

create index if not exists wms_stock_positions_warehouse_source_sku_idx
on public.wms_stock_positions (warehouse_code, source_type, codigo_material);

create index if not exists wms_stock_positions_batch_idx
on public.wms_stock_positions (batch_id);

alter table public.wms_stock_import_batches enable row level security;
alter table public.wms_stock_positions enable row level security;

drop policy if exists "wms_stock_import_batches_public_all" on public.wms_stock_import_batches;
create policy "wms_stock_import_batches_public_all" on public.wms_stock_import_batches
for all using (true) with check (true);

drop policy if exists "wms_stock_positions_public_all" on public.wms_stock_positions;
create policy "wms_stock_positions_public_all" on public.wms_stock_positions
for all using (true) with check (true);

notify pgrst, 'reload schema';
