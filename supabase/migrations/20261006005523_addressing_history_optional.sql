-- Restore the columns expected by the atomic addressing RPC. History is
-- auxiliary: the frontend also retries the allocation without history when an
-- older or partially migrated installation cannot persist the audit row.

alter table public.wms_history
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists datetime timestamptz,
  add column if not exists location text,
  add column if not exists location_code text,
  add column if not exists warehouse_id text,
  add column if not exists warehouse_code text;

update public.wms_history
set datetime = coalesce(datetime, created_at, updated_at, now()),
    location = coalesce(nullif(location, ''), nullif(location_code, ''), ''),
    location_code = coalesce(nullif(location_code, ''), nullif(location, ''), '')
where datetime is null
   or location is null
   or location_code is null;

alter table public.wms_history
  alter column datetime set default now(),
  alter column datetime set not null;

create index if not exists idx_wms_history_warehouse_datetime
  on public.wms_history (warehouse_code, datetime desc);

alter table public.wms_history enable row level security;

drop policy if exists wms_history_warehouse_read on public.wms_history;
create policy wms_history_warehouse_read
on public.wms_history
for select
to authenticated
using (
  warehouse_code = any(((select private.current_wms_allowed_warehouses()))::text[])
  and (select private.has_wms_role(array['ADMINISTRADOR', 'SUPERVISOR', 'OPERADOR']))
);

drop policy if exists wms_history_warehouse_insert on public.wms_history;
create policy wms_history_warehouse_insert
on public.wms_history
for insert
to authenticated
with check (
  warehouse_code = any(((select private.current_wms_allowed_warehouses()))::text[])
  and (select private.has_wms_role(array['ADMINISTRADOR', 'SUPERVISOR', 'OPERADOR']))
);

notify pgrst, 'reload schema';

insert into public.wms_schema_version (id, version, description, applied_at, applied_by)
values (
  'current',
  '2026.10.05.008',
  'Addressing history compatibility with non-blocking audit fallback',
  now(),
  'addressing-history-optional'
)
on conflict (id) do update
set version = excluded.version,
    description = excluded.description,
    applied_at = excluded.applied_at,
    applied_by = excluded.applied_by;
