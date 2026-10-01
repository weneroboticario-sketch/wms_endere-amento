-- Add the store attendant profile with catalog/read access and request creation,
-- while keeping stock and replenishment workflow mutations restricted to staff.
-- Rollback (manual): restore the previous policies and remove the priority
-- constraint/index only after confirming no CLIENTE requests remain.

drop policy if exists wms_warehouses_read_authenticated on public.wms_warehouses;
create policy wms_warehouses_read_authenticated on public.wms_warehouses
for select to authenticated
using ((select private.has_wms_role(array['ADMINISTRADOR', 'SUPERVISOR', 'OPERADOR', 'ATENDENTE'])));

drop policy if exists wms_products_read_authenticated on public.wms_products;
create policy wms_products_read_authenticated on public.wms_products
for select to authenticated
using ((select private.has_wms_role(array['ADMINISTRADOR', 'SUPERVISOR', 'OPERADOR', 'ATENDENTE'])));

drop policy if exists wms_establishments_read_authenticated on public.wms_establishments;
create policy wms_establishments_read_authenticated on public.wms_establishments
for select to authenticated
using ((select private.has_wms_role(array['ADMINISTRADOR', 'SUPERVISOR', 'OPERADOR', 'ATENDENTE'])));

do $$
begin
  if to_regclass('public.wms_product_packaging') is not null then
    drop policy if exists wms_product_packaging_read_authenticated on public.wms_product_packaging;
    create policy wms_product_packaging_read_authenticated on public.wms_product_packaging
    for select to authenticated
    using ((select private.has_wms_role(array['ADMINISTRADOR', 'SUPERVISOR', 'OPERADOR', 'ATENDENTE'])));
  end if;
end
$$;

drop policy if exists wms_sync_metadata_authenticated on public.wms_sync_metadata;
drop policy if exists wms_sync_metadata_staff_write on public.wms_sync_metadata;
create policy wms_sync_metadata_authenticated on public.wms_sync_metadata
for select to authenticated
using ((select private.has_wms_role(array['ADMINISTRADOR', 'SUPERVISOR', 'OPERADOR', 'ATENDENTE'])));
create policy wms_sync_metadata_staff_write on public.wms_sync_metadata
for all to authenticated
using ((select private.has_wms_role(array['ADMINISTRADOR', 'SUPERVISOR', 'OPERADOR'])))
with check ((select private.has_wms_role(array['ADMINISTRADOR', 'SUPERVISOR', 'OPERADOR'])));

drop policy if exists wms_schema_version_read on public.wms_schema_version;
create policy wms_schema_version_read on public.wms_schema_version
for select to authenticated
using ((select private.has_wms_role(array['ADMINISTRADOR', 'SUPERVISOR', 'OPERADOR', 'ATENDENTE'])));

-- Supervisors must see and manage both operational store profiles in warehouses
-- they already manage. The original operator policies remain in place.
drop policy if exists wms_users_supervisor_store_staff_read on public.wms_users;
create policy wms_users_supervisor_store_staff_read on public.wms_users
for select to authenticated
using (
  (select private.current_wms_role()) = 'SUPERVISOR'
  and role in ('OPERADOR', 'ATENDENTE')
  and coalesce(default_warehouse_code, warehouse_code) = any(
    ((select private.current_wms_allowed_warehouses()))::text[]
  )
);

drop policy if exists wms_users_supervisor_store_staff_update on public.wms_users;
create policy wms_users_supervisor_store_staff_update on public.wms_users
for update to authenticated
using (
  (select private.current_wms_role()) = 'SUPERVISOR'
  and role in ('OPERADOR', 'ATENDENTE')
  and coalesce(default_warehouse_code, warehouse_code) = any(
    ((select private.current_wms_allowed_warehouses()))::text[]
  )
)
with check (
  (select private.current_wms_role()) = 'SUPERVISOR'
  and role in ('OPERADOR', 'ATENDENTE')
  and coalesce(default_warehouse_code, warehouse_code) = any(
    ((select private.current_wms_allowed_warehouses()))::text[]
  )
);

-- Keep warehouse reads untouched, but close stock/address writes to attendants.
drop policy if exists wms_bindings_warehouse_insert on public.wms_bindings;
create policy wms_bindings_warehouse_insert on public.wms_bindings
for insert to authenticated
with check (
  warehouse_code = any(((select private.current_wms_allowed_warehouses()))::text[])
  and (select private.has_wms_role(array['ADMINISTRADOR', 'SUPERVISOR', 'OPERADOR']))
);

drop policy if exists wms_bindings_warehouse_update on public.wms_bindings;
create policy wms_bindings_warehouse_update on public.wms_bindings
for update to authenticated
using (
  warehouse_code = any(((select private.current_wms_allowed_warehouses()))::text[])
  and (select private.has_wms_role(array['ADMINISTRADOR', 'SUPERVISOR', 'OPERADOR']))
)
with check (
  warehouse_code = any(((select private.current_wms_allowed_warehouses()))::text[])
  and (select private.has_wms_role(array['ADMINISTRADOR', 'SUPERVISOR', 'OPERADOR']))
);

drop policy if exists wms_bindings_warehouse_delete on public.wms_bindings;
create policy wms_bindings_warehouse_delete on public.wms_bindings
for delete to authenticated
using (
  warehouse_code = any(((select private.current_wms_allowed_warehouses()))::text[])
  and (select private.has_wms_role(array['ADMINISTRADOR', 'SUPERVISOR', 'OPERADOR']))
);

drop policy if exists wms_stock_positions_warehouse_insert on public.wms_stock_positions;
create policy wms_stock_positions_warehouse_insert on public.wms_stock_positions
for insert to authenticated
with check (
  warehouse_code = any(((select private.current_wms_allowed_warehouses()))::text[])
  and (select private.has_wms_role(array['ADMINISTRADOR', 'SUPERVISOR', 'OPERADOR']))
);

drop policy if exists wms_stock_positions_warehouse_update on public.wms_stock_positions;
create policy wms_stock_positions_warehouse_update on public.wms_stock_positions
for update to authenticated
using (
  warehouse_code = any(((select private.current_wms_allowed_warehouses()))::text[])
  and (select private.has_wms_role(array['ADMINISTRADOR', 'SUPERVISOR', 'OPERADOR']))
)
with check (
  warehouse_code = any(((select private.current_wms_allowed_warehouses()))::text[])
  and (select private.has_wms_role(array['ADMINISTRADOR', 'SUPERVISOR', 'OPERADOR']))
);

drop policy if exists wms_stock_positions_warehouse_delete on public.wms_stock_positions;
create policy wms_stock_positions_warehouse_delete on public.wms_stock_positions
for delete to authenticated
using (
  warehouse_code = any(((select private.current_wms_allowed_warehouses()))::text[])
  and (select private.has_wms_role(array['ADMINISTRADOR', 'SUPERVISOR', 'OPERADOR']))
);

drop policy if exists wms_replenishment_requests_warehouse_update on public.wms_replenishment_requests;
create policy wms_replenishment_requests_warehouse_update on public.wms_replenishment_requests
for update to authenticated
using (
  warehouse_code = any(((select private.current_wms_allowed_warehouses()))::text[])
  and (select private.has_wms_role(array['ADMINISTRADOR', 'SUPERVISOR', 'OPERADOR']))
)
with check (
  warehouse_code = any(((select private.current_wms_allowed_warehouses()))::text[])
  and (select private.has_wms_role(array['ADMINISTRADOR', 'SUPERVISOR', 'OPERADOR']))
);

update public.wms_replenishment_requests
set prioridade = 'NORMAL'
where prioridade is null or prioridade not in ('NORMAL', 'CLIENTE');

alter table public.wms_replenishment_requests
  alter column prioridade set default 'NORMAL',
  alter column prioridade set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.wms_replenishment_requests'::regclass
      and conname = 'wms_replenishment_requests_prioridade_check'
  ) then
    alter table public.wms_replenishment_requests
      add constraint wms_replenishment_requests_prioridade_check
      check (prioridade in ('NORMAL', 'CLIENTE')) not valid;
  end if;
end
$$;

alter table public.wms_replenishment_requests
  validate constraint wms_replenishment_requests_prioridade_check;

create index if not exists idx_replenishment_warehouse_priority
  on public.wms_replenishment_requests (warehouse_code, status, prioridade, created_at);

drop policy if exists wms_access_requests_anon_insert on public.wms_access_requests;
create policy wms_access_requests_anon_insert on public.wms_access_requests
for insert to anon
with check (
  status = 'PENDENTE'
  and role_requested in ('OPERADOR', 'ATENDENTE')
  and coalesce(password_hash, '') = ''
);

insert into public.wms_schema_version (id, version, description, applied_at, applied_by)
values (
  'current',
  '2026.10.01.006',
  'Store attendant profile, controlled replenishment priority and restricted operational writes',
  now(),
  'atendente-profile-and-priority'
)
on conflict (id) do update
set version = excluded.version,
    description = excluded.description,
    applied_at = excluded.applied_at,
    applied_by = excluded.applied_by;

notify pgrst, 'reload schema';
