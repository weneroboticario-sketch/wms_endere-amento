alter table public.wms_replenishment_requests add column if not exists claimed_by_id text;
alter table public.wms_replenishment_requests add column if not exists claimed_by_name text;
alter table public.wms_replenishment_requests add column if not exists claimed_at timestamptz;
alter table public.wms_replenishment_requests add column if not exists returned_to_queue_at timestamptz;
alter table public.wms_replenishment_requests add column if not exists returned_to_queue_by_id text;
alter table public.wms_replenishment_requests add column if not exists returned_to_queue_by_name text;
alter table public.wms_replenishment_requests add column if not exists return_reason text;

update public.wms_replenishment_requests
set
  claimed_by_id = coalesce(nullif(claimed_by_id, ''), nullif(responsavel_id, '')),
  claimed_by_name = coalesce(nullif(claimed_by_name, ''), nullif(responsavel_nome, '')),
  claimed_at = coalesce(claimed_at, started_at)
where coalesce(responsavel_id, '') <> ''
  and status in ('ATRIBUIDO', 'EM_SEPARACAO', 'ATENDIDO_PARCIAL', 'SEPARADO');

create index if not exists idx_replenishment_queue
on public.wms_replenishment_requests (warehouse_code, status, created_at);

create index if not exists idx_replenishment_responsavel_status
on public.wms_replenishment_requests (warehouse_code, responsavel_id, status);

create index if not exists idx_replenishment_codigo_status
on public.wms_replenishment_requests (warehouse_code, codigo_material, status);

create index if not exists idx_replenishment_updated
on public.wms_replenishment_requests (warehouse_code, updated_at);

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
exception when duplicate_object then
  null;
end $$;

notify pgrst, 'reload schema';
