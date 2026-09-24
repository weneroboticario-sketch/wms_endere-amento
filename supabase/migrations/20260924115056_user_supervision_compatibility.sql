-- Restore user-management columns that exist in the application contract but
-- may be absent from older production databases.
alter table public.wms_users
  add column if not exists profile text default 'OPERADOR',
  add column if not exists supervisor_id text default '',
  add column if not exists supervisor_name text default '';

update public.wms_users
set profile = coalesce(nullif(profile, ''), role, 'OPERADOR')
where profile is null or profile = '';

create index if not exists idx_users_warehouse_supervisor
  on public.wms_users (default_warehouse_code, supervisor_id);
