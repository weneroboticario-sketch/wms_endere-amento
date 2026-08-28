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

create index if not exists idx_replenishment_requests_warehouse_status
on public.wms_replenishment_requests (warehouse_code, status);

create index if not exists wms_replenishment_responsavel_idx
on public.wms_replenishment_requests (warehouse_code, responsavel_id, status);

create index if not exists wms_replenishment_solicitante_idx
on public.wms_replenishment_requests (warehouse_code, solicitado_por_id, status);

create index if not exists wms_replenishment_sku_idx
on public.wms_replenishment_requests (warehouse_code, codigo_material);

create index if not exists idx_replenishment_requests_warehouse_codigo
on public.wms_replenishment_requests (warehouse_code, codigo_material);

create unique index if not exists wms_replenishment_idempotency_uidx
on public.wms_replenishment_requests (warehouse_code, idempotency_key)
where idempotency_key is not null and idempotency_key <> '';

create index if not exists idx_replenishment_requests_idempotency
on public.wms_replenishment_requests (warehouse_code, idempotency_key);

create unique index if not exists uq_replenishment_requests_idempotency
on public.wms_replenishment_requests (warehouse_code, idempotency_key)
where idempotency_key is not null and idempotency_key <> '';

create index if not exists idx_replenishment_sync
on public.wms_replenishment_requests (warehouse_code, updated_at desc, id);

create index if not exists idx_replenishment_open
on public.wms_replenishment_requests (warehouse_code, is_deleted, status, codigo_material);

create or replace function public.wms_replenishment_schema_diagnostics()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'table', 'public.wms_replenishment_requests',
    'table_exists', to_regclass('public.wms_replenishment_requests') is not null,
    'columns', coalesce((
      select jsonb_object_agg(column_name, true)
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'wms_replenishment_requests'
        and column_name in (
          'idempotency_key',
          'client_action_id',
          'created_by_id',
          'updated_at',
          'warehouse_code'
        )
    ), '{}'::jsonb),
    'indexes', coalesce((
      select jsonb_object_agg(indexname, true)
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'wms_replenishment_requests'
        and indexname in (
          'idx_replenishment_requests_idempotency',
          'uq_replenishment_requests_idempotency',
          'wms_replenishment_idempotency_uidx'
        )
    ), '{}'::jsonb)
  );
$$;

grant execute on function public.wms_replenishment_schema_diagnostics() to anon, authenticated;

alter table public.wms_replenishment_requests enable row level security;

drop policy if exists "wms_replenishment_requests_public_all" on public.wms_replenishment_requests;
create policy "wms_replenishment_requests_public_all"
on public.wms_replenishment_requests
for all
using (true)
with check (true);

alter table public.wms_replenishment_requests replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'wms_replenishment_requests'
    ) then
    alter publication supabase_realtime add table public.wms_replenishment_requests;
  end if;
end $$;

notify pgrst, 'reload schema';
