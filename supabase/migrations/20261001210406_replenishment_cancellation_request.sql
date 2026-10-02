-- Allow an attendant to request cancellation of their own replenishment order
-- without granting access to any operational status or quantity mutation.
-- The warehouse team keeps the existing authority to confirm the cancellation.

alter table public.wms_replenishment_requests
  add column if not exists cancellation_requested_at timestamptz,
  add column if not exists cancellation_requested_by_id text default '',
  add column if not exists cancellation_requested_by_name text default '',
  add column if not exists cancellation_request_reason text default '';

create index if not exists idx_replenishment_cancellation_requested
  on public.wms_replenishment_requests (warehouse_code, cancellation_requested_at desc)
  where cancellation_requested_at is not null
    and status not in ('CONCLUIDO', 'ENTREGUE_NA_LOJA', 'SEM_ESTOQUE', 'CANCELADO');

drop policy if exists wms_replenishment_requests_attendant_cancellation_update
  on public.wms_replenishment_requests;
create policy wms_replenishment_requests_attendant_cancellation_update
on public.wms_replenishment_requests
for update to authenticated
using (
  (select private.current_wms_role()) = 'ATENDENTE'
  and solicitado_por_id = (select private.current_wms_profile_id())
  and warehouse_code = any(
    ((select private.current_wms_allowed_warehouses()))::text[]
  )
  and coalesce(is_deleted, false) is false
  and status not in ('CONCLUIDO', 'ENTREGUE_NA_LOJA', 'SEM_ESTOQUE', 'CANCELADO')
)
with check (
  (select private.current_wms_role()) = 'ATENDENTE'
  and solicitado_por_id = (select private.current_wms_profile_id())
  and warehouse_code = any(
    ((select private.current_wms_allowed_warehouses()))::text[]
  )
  and coalesce(is_deleted, false) is false
  and status not in ('CONCLUIDO', 'ENTREGUE_NA_LOJA', 'SEM_ESTOQUE', 'CANCELADO')
);

create or replace function private.guard_wms_replenishment_attendant_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select private.current_wms_role()) <> 'ATENDENTE' then
    return new;
  end if;

  if old.cancellation_requested_at is not null then
    raise exception using errcode = '42501', message = 'Cancellation was already requested for this order.';
  end if;

  if (
    to_jsonb(new) - array[
      'cancellation_requested_at',
      'cancellation_requested_by_id',
      'cancellation_requested_by_name',
      'cancellation_request_reason',
      'updated_at'
    ]::text[]
  ) is distinct from (
    to_jsonb(old) - array[
      'cancellation_requested_at',
      'cancellation_requested_by_id',
      'cancellation_requested_by_name',
      'cancellation_request_reason',
      'updated_at'
    ]::text[]
  ) then
    raise exception using errcode = '42501', message = 'Attendants cannot change the operational replenishment workflow.';
  end if;

  new.cancellation_requested_at := now();
  new.cancellation_requested_by_id := (select private.current_wms_profile_id());
  new.cancellation_requested_by_name := coalesce(old.solicitado_por_nome, '');
  new.cancellation_request_reason := left(trim(coalesce(new.cancellation_request_reason, '')), 500);
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists trg_wms_replenishment_attendant_update
  on public.wms_replenishment_requests;
create trigger trg_wms_replenishment_attendant_update
before update on public.wms_replenishment_requests
for each row execute function private.guard_wms_replenishment_attendant_update();

revoke all on function private.guard_wms_replenishment_attendant_update() from public, anon;
grant execute on function private.guard_wms_replenishment_attendant_update() to authenticated;

create or replace function public.request_wms_replenishment_cancellation(
  p_request_id text,
  p_reason text default ''
)
returns public.wms_replenishment_requests
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_profile_id text;
  v_request public.wms_replenishment_requests%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  v_profile_id := (select private.current_wms_profile_id());

  if v_profile_id is null or (select private.current_wms_role()) <> 'ATENDENTE' then
    raise exception using errcode = '42501', message = 'Only an active attendant can request this cancellation.';
  end if;

  select request_row.*
  into v_request
  from public.wms_replenishment_requests request_row
  where request_row.id = p_request_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Replenishment request not found.';
  end if;

  if coalesce(v_request.is_deleted, false)
     or v_request.status in ('CONCLUIDO', 'ENTREGUE_NA_LOJA', 'SEM_ESTOQUE', 'CANCELADO') then
    raise exception using errcode = '22023', message = 'This replenishment request can no longer be cancelled.';
  end if;

  if v_request.solicitado_por_id is distinct from v_profile_id
     or not (
       v_request.warehouse_code = any(
         ((select private.current_wms_allowed_warehouses()))::text[]
       )
     ) then
    raise exception using errcode = '42501', message = 'The attendant can request cancellation only for their own warehouse order.';
  end if;

  if v_request.cancellation_requested_at is not null then
    return v_request;
  end if;

  update public.wms_replenishment_requests request_row
  set cancellation_requested_at = now(),
      cancellation_requested_by_id = v_profile_id,
      cancellation_requested_by_name = coalesce(v_request.solicitado_por_nome, ''),
      cancellation_request_reason = left(trim(coalesce(p_reason, '')), 500),
      updated_at = now()
  where request_row.id = p_request_id
  returning request_row.* into v_request;

  if not found then
    raise exception using errcode = '42501', message = 'Cancellation request was blocked by warehouse access rules.';
  end if;

  return v_request;
end
$$;

revoke all on function public.request_wms_replenishment_cancellation(text, text) from public, anon;
grant execute on function public.request_wms_replenishment_cancellation(text, text) to authenticated;

comment on function public.request_wms_replenishment_cancellation(text, text) is
  'Records an attendant cancellation request for their own open replenishment order without changing operational status.';

insert into public.wms_schema_version (id, version, description, applied_at, applied_by)
values (
  'current',
  '2026.10.01.007',
  'Attendant cancellation requests for open replenishment orders',
  now(),
  'replenishment-cancellation-request'
)
on conflict (id) do update
set version = excluded.version,
    description = excluded.description,
    applied_at = excluded.applied_at,
    applied_by = excluded.applied_by;

notify pgrst, 'reload schema';
