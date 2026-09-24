-- Run with psql/Supabase CLI against a disposable branch or local database.
-- The transaction always rolls back fixture mutations.
\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(condition, false) then raise exception 'RLS assertion failed: %', message; end if;
end
$$;

select pg_temp.assert_true(
  not exists (
    select 1
    from information_schema.tables table_info
    where table_info.table_schema = 'public'
      and table_info.table_name like 'wms_%'
      and has_table_privilege('anon', format('%I.%I', table_info.table_schema, table_info.table_name), 'SELECT')
  ),
  'anon must not have SELECT on any WMS table'
);
select pg_temp.assert_true(
  not has_column_privilege('anon', 'public.wms_users', 'password_hash', 'SELECT'),
  'anon must never read password_hash'
);
select pg_temp.assert_true(
  not has_column_privilege('authenticated', 'public.wms_users', 'password_hash', 'SELECT'),
  'authenticated must never read password_hash'
);

select auth_user_id as operator_auth_user_id
from public.wms_users
where role = 'OPERADOR' and default_warehouse_code = 'VDCG' and auth_user_id is not null and active is true
limit 1 \gset

\if :{?operator_auth_user_id}
select set_config('request.jwt.claims', jsonb_build_object('sub', :'operator_auth_user_id', 'role', 'authenticated')::text, true);
set local role authenticated;
select pg_temp.assert_true(
  not exists(select 1 from public.wms_transfers where warehouse_code = 'VDAR'),
  'VDCG operator must not read VDAR transfers'
);
reset role;
\else
\echo 'SKIP: create/link an active VDCG operator to exercise the cross-warehouse runtime assertion.'
\endif

select auth_user_id as supervisor_auth_user_id
from public.wms_users
where role = 'SUPERVISOR' and auth_user_id is not null and active is true
limit 1 \gset

\if :{?supervisor_auth_user_id}
select set_config('request.jwt.claims', jsonb_build_object('sub', :'supervisor_auth_user_id', 'role', 'authenticated')::text, true);
set local role authenticated;
select pg_temp.assert_true(
  not private.can_manage_wms_user('ADMINISTRADOR', 'VDCG'),
  'supervisor must not promote a user to ADMINISTRADOR'
);
reset role;
\else
\echo 'SKIP: create/link an active supervisor to exercise the promotion assertion.'
\endif

rollback;
