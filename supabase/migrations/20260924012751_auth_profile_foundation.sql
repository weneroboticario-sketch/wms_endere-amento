-- WMS authentication profile foundation.
-- Safe rollback (manual): revoke the helper grants, drop the functions in the
-- private schema, then remove only the four additive columns after confirming
-- that no auth.users linkage is in use. This migration never removes data.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

alter table public.wms_users
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists auth_email text default '',
  add column if not exists must_change_password boolean not null default true,
  add column if not exists auth_migrated_at timestamptz;

create unique index if not exists wms_users_auth_user_id_uidx
  on public.wms_users (auth_user_id)
  where auth_user_id is not null;

create unique index if not exists wms_users_auth_email_uidx
  on public.wms_users (lower(auth_email))
  where auth_email is not null and auth_email <> '';

create or replace function private.current_wms_profile_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from public.wms_users u
  where u.auth_user_id = (select auth.uid())
    and u.active is true
    and coalesce(u.archived, false) is false
  limit 1
$$;

create or replace function private.current_wms_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.role
  from public.wms_users u
  where u.auth_user_id = (select auth.uid())
    and u.active is true
    and coalesce(u.archived, false) is false
  limit 1
$$;

create or replace function private.current_wms_is_global_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select u.role = 'ADMINISTRADOR' and coalesce(u.is_global_admin, false)
    from public.wms_users u
    where u.auth_user_id = (select auth.uid())
      and u.active is true
      and coalesce(u.archived, false) is false
    limit 1
  ), false)
$$;

create or replace function private.current_wms_allowed_warehouses()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when u.role = 'ADMINISTRADOR' and coalesce(u.is_global_admin, false) then
      coalesce((select array_agg(upper(w.code) order by w.code) from public.wms_warehouses w where w.active is true), array[]::text[])
    else array(
      select distinct upper(trim(code))
      from unnest(regexp_split_to_array(coalesce(nullif(u.allowed_warehouse_codes, ''), u.default_warehouse_code, u.warehouse_code, ''), '\\s*,\\s*')) code
      where trim(code) <> ''
    )
  end
  from public.wms_users u
  where u.auth_user_id = (select auth.uid())
    and u.active is true
    and coalesce(u.archived, false) is false
  limit 1
$$;

create or replace function private.has_wms_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_wms_role() = any(allowed_roles), false)
$$;

create or replace function private.can_access_warehouse(target_warehouse text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.current_wms_is_global_admin()
    or upper(coalesce(target_warehouse, '')) = any(private.current_wms_allowed_warehouses()),
    false
  )
$$;

create or replace function private.can_manage_wms_user(target_role text, target_warehouse text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.current_wms_is_global_admin() then true
    when private.current_wms_role() = 'SUPERVISOR' then
      target_role = 'OPERADOR' and private.can_access_warehouse(target_warehouse)
    else false
  end
$$;

revoke all on function private.current_wms_profile_id() from public, anon;
revoke all on function private.current_wms_role() from public, anon;
revoke all on function private.current_wms_is_global_admin() from public, anon;
revoke all on function private.current_wms_allowed_warehouses() from public, anon;
revoke all on function private.has_wms_role(text[]) from public, anon;
revoke all on function private.can_access_warehouse(text) from public, anon;
revoke all on function private.can_manage_wms_user(text, text) from public, anon;
grant execute on function private.current_wms_profile_id() to authenticated;
grant execute on function private.current_wms_role() to authenticated;
grant execute on function private.current_wms_is_global_admin() to authenticated;
grant execute on function private.current_wms_allowed_warehouses() to authenticated;
grant execute on function private.has_wms_role(text[]) to authenticated;
grant execute on function private.can_access_warehouse(text) to authenticated;
grant execute on function private.can_manage_wms_user(text, text) to authenticated;

comment on column public.wms_users.auth_user_id is 'Supabase Auth identity. Legacy text id remains stable for operational foreign references.';
comment on column public.wms_users.must_change_password is 'Requires a password change before normal WMS navigation.';
