-- WMS RLS security hardening.
-- Rollback (manual): restore the previous policies from a database backup only
-- during an incident. Do not re-enable anon-wide CRUD. No table/data is removed.

do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename like 'wms_%'
  loop
    execute format('drop policy if exists %I on %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  end loop;
end
$$;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'wms_warehouses','wms_bindings','wms_products','wms_history','wms_users',
    'wms_sessions','wms_access_requests','wms_establishments','wms_transfers',
    'wms_transfer_items','wms_transfer_merge_items','wms_product_packaging',
    'wms_notifications','wms_task_notifications','wms_transfer_divergences',
    'wms_conferences','wms_conference_items','wms_conference_events',
    'wms_conference_divergences','wms_sync_metadata','wms_pending_sync_actions',
    'wms_stock_import_batches','wms_stock_positions','wms_stock_alerts',
    'wms_replenishment_requests','wms_maintenance_logs','wms_schema_version',
    'wms_locations','wms_location_skus'
  ] loop
    if to_regclass('public.' || target_table) is not null then
      execute format('alter table public.%I enable row level security', target_table);
      execute format('revoke all on table public.%I from public, anon', target_table);
      execute format('grant select, insert, update, delete on table public.%I to authenticated', target_table);
    end if;
  end loop;
end
$$;

-- Warehouse catalog and global product catalog.
create policy wms_warehouses_read_authenticated on public.wms_warehouses
for select to authenticated
using (private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','OPERADOR']));

create policy wms_warehouses_admin_write on public.wms_warehouses
for all to authenticated
using (private.current_wms_is_global_admin())
with check (private.current_wms_is_global_admin());

create policy wms_products_read_authenticated on public.wms_products
for select to authenticated
using (private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','OPERADOR']));

create policy wms_products_admin_write on public.wms_products
for all to authenticated
using (private.current_wms_is_global_admin())
with check (private.current_wms_is_global_admin());

create policy wms_establishments_read_authenticated on public.wms_establishments
for select to authenticated
using (private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','OPERADOR']));

create policy wms_establishments_staff_write on public.wms_establishments
for all to authenticated
using (private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR']))
with check (private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR']));

do $$
begin
  if to_regclass('public.wms_product_packaging') is not null then
    execute $policy$
      create policy wms_product_packaging_read_authenticated on public.wms_product_packaging
      for select to authenticated
      using (private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','OPERADOR']))
    $policy$;
    execute $policy$
      create policy wms_product_packaging_staff_write on public.wms_product_packaging
      for all to authenticated
      using (private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR']))
      with check (private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR']))
    $policy$;
  end if;
end
$$;

create policy wms_transfer_merge_items_warehouse_read on public.wms_transfer_merge_items
for select to authenticated
using (exists (
  select 1 from public.wms_transfers transfer
  where transfer.id = wms_transfer_merge_items.merged_transfer_id
    and private.can_access_warehouse(transfer.warehouse_code)
));

create policy wms_transfer_merge_items_warehouse_write on public.wms_transfer_merge_items
for all to authenticated
using (exists (
  select 1 from public.wms_transfers transfer
  where transfer.id = wms_transfer_merge_items.merged_transfer_id
    and private.can_access_warehouse(transfer.warehouse_code)
))
with check (exists (
  select 1 from public.wms_transfers transfer
  where transfer.id = wms_transfer_merge_items.merged_transfer_id
    and private.can_access_warehouse(transfer.warehouse_code)
));

-- Profiles: no password column is granted to browser roles.
revoke all on table public.wms_users from public, anon, authenticated;
grant select (
  id, created_at, updated_at, name, username, matricula, role, active,
  available_for_tasks, last_login_at, default_warehouse_id,
  default_warehouse_code, warehouse_id, warehouse_code,
  allowed_warehouse_codes, is_global_admin, supervisor_id, supervisor_name,
  archived, archived_at, archived_by_id, archived_by_name, auth_user_id,
  auth_email, must_change_password, auth_migrated_at
) on public.wms_users to authenticated;
grant update (
  updated_at, name, username, matricula, role, active, available_for_tasks,
  default_warehouse_id, default_warehouse_code, warehouse_id, warehouse_code,
  allowed_warehouse_codes, is_global_admin, supervisor_id, supervisor_name,
  archived, archived_at, archived_by_id, archived_by_name, must_change_password,
  last_login_at
) on public.wms_users to authenticated;

create policy wms_users_read_authorized on public.wms_users
for select to authenticated
using (
  auth_user_id = (select auth.uid())
  or private.current_wms_is_global_admin()
  or (
    private.current_wms_role() = 'SUPERVISOR'
    and role = 'OPERADOR'
    and private.can_access_warehouse(coalesce(default_warehouse_code, warehouse_code))
  )
);

create policy wms_users_update_authorized on public.wms_users
for update to authenticated
using (
  private.can_manage_wms_user(role, coalesce(default_warehouse_code, warehouse_code))
)
with check (
  private.can_manage_wms_user(role, coalesce(default_warehouse_code, warehouse_code))
);

-- Anonymous users may request access, but cannot read requests or submit a password.
revoke all on table public.wms_access_requests from public, anon, authenticated;
grant insert (id, created_at, updated_at, name, username, matricula, role_requested, job_title, notes, status, warehouse_code)
  on public.wms_access_requests to anon;
grant select (id, created_at, updated_at, name, username, matricula, role_requested, job_title, notes, status, approved_by, approved_at, rejected_by, rejected_at, rejection_reason, warehouse_code),
      update (updated_at, status, approved_by, approved_at, rejected_by, rejected_at, rejection_reason)
  on public.wms_access_requests to authenticated;

create policy wms_access_requests_anon_insert on public.wms_access_requests
for insert to anon
with check (status = 'PENDENTE' and role_requested = 'OPERADOR' and coalesce(password_hash, '') = '');

create policy wms_access_requests_staff_read on public.wms_access_requests
for select to authenticated
using (
  private.current_wms_is_global_admin()
  or (private.current_wms_role() = 'SUPERVISOR' and private.can_access_warehouse(warehouse_code))
);

create policy wms_access_requests_staff_update on public.wms_access_requests
for update to authenticated
using (
  private.current_wms_is_global_admin()
  or (private.current_wms_role() = 'SUPERVISOR' and private.can_access_warehouse(warehouse_code))
)
with check (
  private.current_wms_is_global_admin()
  or (private.current_wms_role() = 'SUPERVISOR' and private.can_access_warehouse(warehouse_code))
);

-- Custom session rows are retained only as an audit trail; Supabase Auth is authoritative.
create policy wms_sessions_own_rows on public.wms_sessions
for select to authenticated
using (user_id = private.current_wms_profile_id() or private.current_wms_is_global_admin());

-- Warehouse-scoped operational tables.
do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'wms_bindings','wms_history','wms_transfers','wms_transfer_items',
    'wms_notifications','wms_task_notifications','wms_transfer_divergences',
    'wms_conferences','wms_conference_items','wms_conference_events',
    'wms_conference_divergences','wms_pending_sync_actions',
    'wms_stock_import_batches','wms_stock_positions','wms_stock_alerts',
    'wms_replenishment_requests','wms_locations','wms_location_skus'
  ] loop
    if to_regclass('public.' || target_table) is not null
       and exists (
         select 1 from information_schema.columns c
         where c.table_schema = 'public' and c.table_name = target_table and c.column_name = 'warehouse_code'
       ) then
      execute format(
        'create policy %I on public.%I for select to authenticated using (private.can_access_warehouse(warehouse_code))',
        target_table || '_warehouse_read', target_table
      );
      execute format(
        'create policy %I on public.%I for insert to authenticated with check (private.can_access_warehouse(warehouse_code))',
        target_table || '_warehouse_insert', target_table
      );
      execute format(
        'create policy %I on public.%I for update to authenticated using (private.can_access_warehouse(warehouse_code)) with check (private.can_access_warehouse(warehouse_code))',
        target_table || '_warehouse_update', target_table
      );
      execute format(
        'create policy %I on public.%I for delete to authenticated using (private.can_access_warehouse(warehouse_code) and private.has_wms_role(array[''ADMINISTRADOR'',''SUPERVISOR'']))',
        target_table || '_warehouse_delete', target_table
      );
    end if;
  end loop;
end
$$;

-- Legacy detailed transfer events are intentionally outside the live app.
-- Keep the table for historical compatibility but expose it to no browser role.
do $$
begin
  if to_regclass('public.wms_transfer_events') is not null then
    revoke all on table public.wms_transfer_events from public, anon, authenticated;
    alter table public.wms_transfer_events enable row level security;
  end if;
end
$$;

-- Sync metadata is not warehouse-scoped but still requires an active WMS profile.
create policy wms_sync_metadata_authenticated on public.wms_sync_metadata
for all to authenticated
using (private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','OPERADOR']))
with check (private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','OPERADOR']));

create policy wms_maintenance_logs_admin on public.wms_maintenance_logs
for all to authenticated
using (private.current_wms_is_global_admin())
with check (private.current_wms_is_global_admin());

revoke all on table public.wms_schema_version from public, anon, authenticated;
grant select on table public.wms_schema_version to authenticated;
create policy wms_schema_version_read on public.wms_schema_version
for select to authenticated
using (private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','OPERADOR']));

insert into public.wms_schema_version (id, version, description, applied_at, applied_by)
values ('current', '2026.09.23.002', 'Supabase Auth profile linkage and warehouse-scoped RLS', now(), 'security-hardening')
on conflict (id) do update
set version = excluded.version,
    description = excluded.description,
    applied_at = excluded.applied_at,
    applied_by = excluded.applied_by;
