-- WMS: compatibilidade com a versao operacional atual.
-- Idempotente: pode ser executada mais de uma vez e nao remove dados.

alter table public.wms_transfers add column if not exists import_source text default 'MANUAL';
alter table public.wms_transfers add column if not exists import_batch_id text;
alter table public.wms_transfers add column if not exists import_file_name text;
alter table public.wms_transfers add column if not exists imported_by_id text;
alter table public.wms_transfers add column if not exists imported_by_name text;
alter table public.wms_transfers add column if not exists updated_at timestamptz default now();
alter table public.wms_transfers add column if not exists started_at timestamptz;
alter table public.wms_transfers add column if not exists finished_at timestamptz;

update public.wms_transfers
set import_source = 'MANUAL'
where import_source is null;

alter table public.wms_stock_import_batches add column if not exists inserted_rows integer default 0;
alter table public.wms_stock_import_batches add column if not exists updated_rows integer default 0;
alter table public.wms_stock_import_batches add column if not exists unchanged_rows integer default 0;
alter table public.wms_stock_import_batches add column if not exists deactivated_rows integer default 0;
alter table public.wms_stock_import_batches add column if not exists ignored_rows integer default 0;
alter table public.wms_stock_import_batches add column if not exists error_rows integer default 0;
alter table public.wms_stock_import_batches add column if not exists negative_rows integer default 0;
alter table public.wms_stock_import_batches add column if not exists alert_rows integer default 0;

alter table public.wms_establishments add column if not exists codigo_loja text;
alter table public.wms_establishments add column if not exists codigo_interno text;
alter table public.wms_establishments add column if not exists cnpj text;
alter table public.wms_establishments add column if not exists sigla text;
alter table public.wms_establishments add column if not exists canal text;
alter table public.wms_establishments add column if not exists active boolean default true;
alter table public.wms_establishments add column if not exists updated_at timestamptz default now();

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_establishments' and column_name = 'codigo') then
    execute 'update public.wms_establishments set codigo_loja = codigo where nullif(codigo_loja, '''') is null and codigo is not null';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_establishments' and column_name = 'code') then
    execute 'update public.wms_establishments set codigo_loja = code where nullif(codigo_loja, '''') is null and code is not null';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_establishments' and column_name = 'store_code') then
    execute 'update public.wms_establishments set codigo_loja = store_code where nullif(codigo_loja, '''') is null and store_code is not null';
  end if;
end $$;

alter table public.wms_transfer_items add column if not exists codigo_material text;
alter table public.wms_transfer_items add column if not exists nome_material_snapshot text;
alter table public.wms_transfer_items add column if not exists saldo_captacao_snapshot numeric default 0;
alter table public.wms_transfer_items add column if not exists saldo_loja_snapshot numeric default 0;
alter table public.wms_transfer_items add column if not exists quantidade_retirar_captacao numeric default 0;
alter table public.wms_transfer_items add column if not exists quantidade_retirar_loja numeric default 0;
alter table public.wms_transfer_items add column if not exists quantidade_faltante numeric default 0;
alter table public.wms_transfer_items add column if not exists localizacao_captacao_snapshot text;
alter table public.wms_transfer_items add column if not exists localizacao_wms_snapshot text;
alter table public.wms_transfer_items add column if not exists stock_snapshot_at timestamptz;
alter table public.wms_transfer_items add column if not exists origem_sugerida text;
alter table public.wms_transfer_items add column if not exists status_operacional text default 'PENDENTE';
alter table public.wms_transfer_items add column if not exists status_divergencia text default 'SEM_DIVERGENCIA';
alter table public.wms_transfer_items add column if not exists updated_at timestamptz default now();

alter table public.wms_stock_positions add column if not exists record_hash text;
alter table public.wms_stock_positions add column if not exists updated_at timestamptz default now();

alter table public.wms_stock_import_batches add column if not exists updated_at timestamptz default now();
alter table public.wms_stock_import_batches add column if not exists finished_at timestamptz;
alter table public.wms_stock_import_batches add column if not exists error_message text;
alter table public.wms_stock_import_batches add column if not exists notes text;

alter table public.wms_users add column if not exists archived boolean default false;
alter table public.wms_users add column if not exists archived_at timestamptz;
alter table public.wms_users add column if not exists archived_by_id text;
alter table public.wms_users add column if not exists archived_by_name text;

-- alerta_saldo ja e boolean no schema atual; a mensagem textual fica em alerta_saldo_mensagem.
alter table public.wms_transfer_items add column if not exists alerta_saldo_mensagem text default '';

update public.wms_transfer_items
set codigo_material = coalesce(nullif(codigo_material, ''), sku),
    status_operacional = coalesce(nullif(status_operacional, ''), nullif(status, ''), 'PENDENTE'),
    status_divergencia = coalesce(nullif(status_divergencia, ''), 'SEM_DIVERGENCIA')
where codigo_material is null or codigo_material = ''
   or status_operacional is null or status_operacional = ''
   or status_divergencia is null or status_divergencia = '';

drop index if exists public.idx_wms_transfer_items_updated;
create index if not exists idx_wms_transfer_items_transfer_codigo
on public.wms_transfer_items (transfer_id, codigo_material);
create index if not exists idx_wms_transfer_items_status
on public.wms_transfer_items (transfer_id, status_operacional, status_divergencia);
create index if not exists idx_wms_transfer_items_updated
on public.wms_transfer_items (transfer_id, updated_at desc);
create index if not exists idx_wms_stock_positions_hash
on public.wms_stock_positions (warehouse_code, source_type, codigo_material, record_hash);
create index if not exists idx_wms_stock_batches_processing
on public.wms_stock_import_batches (warehouse_code, source_type, status, created_at);
create index if not exists idx_wms_users_archived
on public.wms_users (default_warehouse_code, active, archived);

update public.wms_stock_import_batches
set status = 'FAILED',
    notes = coalesce(nullif(notes, ''), 'Lote travado por mais de 2 horas. Encerrado com segurança.'),
    error_message = 'Lote travado por mais de 2 horas. Encerrado com segurança.',
    finished_at = coalesce(finished_at, now()),
    updated_at = now()
where status = 'PROCESSING'
  and coalesce(updated_at, created_at) < now() - interval '2 hours';

create table if not exists public.wms_schema_version (
  id text primary key,
  version text not null,
  description text,
  applied_at timestamptz default now(),
  applied_by text
);

insert into public.wms_schema_version (id, version, description, applied_at, applied_by)
values ('current', '2026.08.30.001', 'Estabilizacao de schema: importacao, lotes, estabelecimentos, snapshots e usuarios', now(), 'migration')
on conflict (id) do update set
  version = excluded.version,
  description = excluded.description,
  applied_at = now(),
  applied_by = excluded.applied_by;

create index if not exists idx_wms_transfers_warehouse_status_updated
on public.wms_transfers (warehouse_code, status, updated_at desc);
create index if not exists idx_wms_transfers_import_source
on public.wms_transfers (warehouse_code, import_source, created_at desc);
create index if not exists idx_wms_stock_batches_stats
on public.wms_stock_import_batches (warehouse_code, source_type, status, created_at desc);
create index if not exists idx_wms_establishments_codigo_loja
on public.wms_establishments (codigo_loja);
create index if not exists idx_wms_establishments_sigla
on public.wms_establishments (sigla);
create index if not exists idx_wms_schema_version_id
on public.wms_schema_version (id);

-- Verificacao final: deve retornar todas as colunas esperadas.
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('wms_transfers', 'wms_transfer_items', 'wms_stock_positions', 'wms_stock_import_batches', 'wms_establishments', 'wms_users')
  and column_name in (
    'import_source', 'import_batch_id', 'import_file_name', 'imported_by_id', 'imported_by_name',
    'codigo_loja', 'codigo_interno', 'cnpj', 'sigla', 'canal', 'active',
    'codigo_material', 'nome_material_snapshot', 'saldo_captacao_snapshot', 'saldo_loja_snapshot',
    'quantidade_retirar_captacao', 'quantidade_retirar_loja', 'quantidade_faltante',
    'localizacao_captacao_snapshot', 'localizacao_wms_snapshot', 'stock_snapshot_at',
    'status_operacional', 'status_divergencia', 'record_hash', 'updated_at', 'finished_at',
    'error_message', 'archived'
  )
order by table_name, column_name;

select id, version, applied_at from public.wms_schema_version where id = 'current';
