-- Operators perform the physical addressing workflow. They may remove only
-- binding rows from warehouses already granted to their active WMS profile.
-- Delete permissions for every other operational table remain unchanged.

drop policy if exists wms_bindings_warehouse_delete on public.wms_bindings;

create policy wms_bindings_warehouse_delete
on public.wms_bindings
for delete
to authenticated
using (
  warehouse_code = any(((select private.current_wms_allowed_warehouses()))::text[])
  and private.has_wms_role(array['ADMINISTRADOR', 'SUPERVISOR', 'OPERADOR'])
);

insert into public.wms_schema_version (id, version, description, applied_at, applied_by)
values (
  'current',
  '2026.09.30.004',
  'Operator addressing removal restricted to assigned warehouses',
  now(),
  'addressing-rls-fix'
)
on conflict (id) do update
set version = excluded.version,
    description = excluded.description,
    applied_at = excluded.applied_at,
    applied_by = excluded.applied_by;
