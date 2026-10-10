begin;
create table if not exists public.wms_replenishment_export_batches (
  id text primary key,
  warehouse_code text not null,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  requests jsonb not null check (jsonb_typeof(requests) = 'array' and jsonb_array_length(requests) > 0)
);
alter table public.wms_replenishment_export_batches enable row level security;
grant select, insert on public.wms_replenishment_export_batches to authenticated;
drop policy if exists replenishment_export_read on public.wms_replenishment_export_batches;
create policy replenishment_export_read on public.wms_replenishment_export_batches
for select to authenticated using (
  warehouse_code = any((select private.current_wms_allowed_warehouses())::text[])
  and (select private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','OPERADOR']))
);
drop policy if exists replenishment_export_insert on public.wms_replenishment_export_batches;
create policy replenishment_export_insert on public.wms_replenishment_export_batches
for insert to authenticated with check (
  warehouse_code = any((select private.current_wms_allowed_warehouses())::text[])
  and created_by = (select auth.uid())
  and (select private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','OPERADOR']))
);
alter table public.wms_replenishment_requests add column if not exists export_batch_id text;
alter table public.wms_replenishment_requests add column if not exists exported_at timestamptz;
create index if not exists idx_replenishment_pending_export
  on public.wms_replenishment_requests (warehouse_code, status)
  where export_batch_id is null and quantidade_atendida > 0 and coalesce(is_deleted, false) = false;
create index if not exists idx_replenishment_export_warehouse
  on public.wms_replenishment_export_batches (warehouse_code, created_at desc);

create or replace function public.create_wms_replenishment_export(p_warehouse_code text, p_batch_id text)
returns public.wms_replenishment_export_batches
language plpgsql security invoker set search_path = '' as $$
declare
  v_batch public.wms_replenishment_export_batches;
  v_requests jsonb;
  v_ids text[];
  v_now timestamptz := now();
begin
  if auth.uid() is null or not private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','OPERADOR'])
     or not (p_warehouse_code = any(private.current_wms_allowed_warehouses())) then
    raise exception 'Estoque nao autorizado.' using errcode = '42501';
  end if;
  if nullif(trim(p_batch_id), '') is null then
    raise exception 'Identificador da exportacao obrigatorio.' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('replenishment-export:' || p_warehouse_code, 0));
  select * into v_batch from public.wms_replenishment_export_batches
    where id = p_batch_id and warehouse_code = p_warehouse_code;
  if found then return v_batch; end if;
  select jsonb_agg(jsonb_build_object('id', r.id, 'warehouse_code', r.warehouse_code,
      'codigo_material', r.codigo_material, 'quantidade_atendida', r.quantidade_atendida,
      'status', r.status, 'finished_at', r.finished_at, 'updated_at', r.updated_at) order by r.id),
    array_agg(r.id) into v_requests, v_ids
  from (
    select * from public.wms_replenishment_requests
    where warehouse_code = p_warehouse_code and status in ('CONCLUIDO','ENTREGUE_NA_LOJA')
      and quantidade_atendida > 0 and coalesce(is_deleted, false) = false and export_batch_id is null
    order by id for update
  ) r;
  if v_requests is null then
    raise exception 'Nenhum pedido concluido pendente de exportacao.' using errcode = 'P0002';
  end if;
  insert into public.wms_replenishment_export_batches (id, warehouse_code, created_at, created_by, requests)
  values (p_batch_id, p_warehouse_code, v_now, auth.uid(), v_requests) returning * into v_batch;
  update public.wms_replenishment_requests set export_batch_id = p_batch_id, exported_at = v_now
    where warehouse_code = p_warehouse_code and id = any(v_ids);
  return v_batch;
end;
$$;
revoke all on function public.create_wms_replenishment_export(text, text) from public, anon;
grant execute on function public.create_wms_replenishment_export(text, text) to authenticated;

create or replace function public.protect_wms_replenishment_export_stamp()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.export_batch_id is not null and (
    new.export_batch_id is distinct from old.export_batch_id or new.exported_at is distinct from old.exported_at
    or new.codigo_material is distinct from old.codigo_material
    or new.quantidade_atendida is distinct from old.quantidade_atendida
    or new.warehouse_code is distinct from old.warehouse_code
  ) then
    raise exception 'Pedido ja exportado: codigo, quantidade e selo preservados.' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_replenishment_export_stamp on public.wms_replenishment_requests;
create trigger protect_replenishment_export_stamp before update on public.wms_replenishment_requests
for each row execute function public.protect_wms_replenishment_export_stamp();

insert into public.wms_schema_version (id, version, description, applied_at, applied_by)
values ('current', '2026.10.10.001', 'Persistent replenishment export batches and duplicate prevention', now(), 'replenishment-export-batches')
on conflict (id) do update set version = excluded.version, description = excluded.description,
  applied_at = excluded.applied_at, applied_by = excluded.applied_by;
notify pgrst, 'reload schema';
commit;
