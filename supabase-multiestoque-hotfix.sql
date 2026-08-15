-- Hotfix multiestoque para Transferencias
-- Execute no SQL Editor do Supabase do projeto bzqulgdtfpcmkyaldssy.

alter table public.wms_transfers add column if not exists warehouse_id text default 'warehouse-vdcg';
alter table public.wms_transfers add column if not exists warehouse_code text default 'VDCG';
alter table public.wms_transfers add column if not exists is_deleted boolean default false;
alter table public.wms_transfers add column if not exists deleted_at timestamptz;
alter table public.wms_transfers add column if not exists deleted_by_id text default '';
alter table public.wms_transfers add column if not exists deleted_by_name text default '';

alter table public.wms_transfer_items add column if not exists warehouse_id text default 'warehouse-vdcg';
alter table public.wms_transfer_items add column if not exists warehouse_code text default 'VDCG';

alter table if exists public.wms_task_notifications add column if not exists warehouse_id text default 'warehouse-vdcg';
alter table if exists public.wms_task_notifications add column if not exists warehouse_code text default 'VDCG';
alter table if exists public.wms_notifications add column if not exists warehouse_id text default 'warehouse-vdcg';
alter table if exists public.wms_notifications add column if not exists warehouse_code text default 'VDCG';

update public.wms_transfers
set warehouse_id = coalesce(nullif(warehouse_id, ''), 'warehouse-vdcg'),
    warehouse_code = coalesce(nullif(warehouse_code, ''), 'VDCG'),
    is_deleted = coalesce(is_deleted, false)
where warehouse_code is null
   or warehouse_code = ''
   or warehouse_id is null
   or warehouse_id = ''
   or is_deleted is null;

update public.wms_transfer_items
set warehouse_id = coalesce(nullif(warehouse_id, ''), 'warehouse-vdcg'),
    warehouse_code = coalesce(nullif(warehouse_code, ''), 'VDCG')
where warehouse_code is null
   or warehouse_code = ''
   or warehouse_id is null
   or warehouse_id = '';

do $$
begin
  if to_regclass('public.wms_task_notifications') is not null then
    update public.wms_task_notifications
    set warehouse_id = coalesce(nullif(warehouse_id, ''), 'warehouse-vdcg'),
        warehouse_code = coalesce(nullif(warehouse_code, ''), 'VDCG')
    where warehouse_code is null
       or warehouse_code = ''
       or warehouse_id is null
       or warehouse_id = '';
  end if;

  if to_regclass('public.wms_notifications') is not null then
    update public.wms_notifications
    set warehouse_id = coalesce(nullif(warehouse_id, ''), 'warehouse-vdcg'),
        warehouse_code = coalesce(nullif(warehouse_code, ''), 'VDCG')
    where warehouse_code is null
       or warehouse_code = ''
       or warehouse_id is null
       or warehouse_id = '';
  end if;
end $$;

create index if not exists idx_wms_transfers_warehouse_status
on public.wms_transfers (warehouse_code, status);

create index if not exists idx_wms_transfers_warehouse_deleted
on public.wms_transfers (warehouse_code, is_deleted);

create index if not exists idx_wms_transfers_updated_at
on public.wms_transfers (warehouse_code, updated_at);

create index if not exists idx_wms_transfer_items_transfer_id
on public.wms_transfer_items (transfer_id);

create index if not exists idx_wms_transfer_items_sku
on public.wms_transfer_items (warehouse_code, sku);

do $$
begin
  if to_regclass('public.wms_task_notifications') is not null then
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_task_notifications' and column_name = 'warehouse_code')
      and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_task_notifications' and column_name = 'transfer_id') then
      execute 'create index if not exists idx_wms_task_notifications_transfer on public.wms_task_notifications (warehouse_code, transfer_id)';
    end if;
  end if;

  if to_regclass('public.wms_notifications') is not null then
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_notifications' and column_name = 'warehouse_code')
      and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'wms_notifications' and column_name = 'transfer_id') then
      execute 'create index if not exists idx_wms_notifications_transfer on public.wms_notifications (warehouse_code, transfer_id)';
    end if;
  end if;
end $$;

alter table public.wms_transfers replica identity full;
alter table public.wms_transfer_items replica identity full;
alter table if exists public.wms_task_notifications replica identity full;
alter table if exists public.wms_notifications replica identity full;

do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'wms_transfers',
    'wms_transfer_items',
    'wms_task_notifications',
    'wms_notifications'
  ]
  loop
    if to_regclass('public.' || relation_name) is not null then
      if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
        and not exists (
          select 1
          from pg_publication_tables
          where pubname = 'supabase_realtime'
            and schemaname = 'public'
            and tablename = relation_name
        ) then
        execute format('alter publication supabase_realtime add table public.%I', relation_name);
      end if;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
