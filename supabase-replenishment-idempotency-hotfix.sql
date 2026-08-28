alter table public.wms_replenishment_requests add column if not exists idempotency_key text;
alter table public.wms_replenishment_requests add column if not exists client_action_id text;
alter table public.wms_replenishment_requests add column if not exists created_by_id text;
alter table public.wms_replenishment_requests add column if not exists updated_at timestamptz default now();
alter table public.wms_replenishment_requests add column if not exists warehouse_code text default 'VDCG';

create index if not exists idx_replenishment_requests_warehouse_status
on public.wms_replenishment_requests (warehouse_code, status);

create index if not exists idx_replenishment_requests_warehouse_codigo
on public.wms_replenishment_requests (warehouse_code, codigo_material);

create index if not exists idx_replenishment_requests_idempotency
on public.wms_replenishment_requests (warehouse_code, idempotency_key);

create unique index if not exists uq_replenishment_requests_idempotency
on public.wms_replenishment_requests (warehouse_code, idempotency_key)
where idempotency_key is not null and idempotency_key <> '';

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
          'uq_replenishment_requests_idempotency'
        )
    ), '{}'::jsonb)
  );
$$;

grant execute on function public.wms_replenishment_schema_diagnostics() to anon, authenticated;

notify pgrst, 'reload schema';

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'wms_replenishment_requests'
  and column_name = 'idempotency_key';

select public.wms_replenishment_schema_diagnostics();
