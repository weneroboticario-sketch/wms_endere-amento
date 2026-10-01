-- Commit one addressing allocation in a single transaction. The function runs
-- with the caller's privileges, so the existing warehouse RLS remains active.
-- Rollback: drop function public.wms_commit_binding_allocation(jsonb).

create or replace function public.wms_commit_binding_allocation(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_warehouse_code text := upper(trim(coalesce(p_payload->>'warehouse_code', '')));
  v_location_code text := trim(coalesce(p_payload->>'location_code', ''));
  v_binding jsonb := p_payload->'binding';
  v_binding_id text := trim(coalesce(p_payload->'binding'->>'id', ''));
  v_binding_sku text := trim(coalesce(p_payload->'binding'->>'sku', ''));
  v_binding_location_code text := trim(coalesce(p_payload->'binding'->>'location_code', ''));
  v_warehouse_id text;
  v_expected_tokens text[];
  v_current_tokens text[];
  v_ids_to_remove text[];
  v_expected_delete_count integer := 0;
  v_deleted_count integer := 0;
  v_history jsonb := coalesce(p_payload->'history_items', '[]'::jsonb);
  v_occupants jsonb;
begin
  if v_warehouse_code = '' or v_location_code = '' or v_binding is null or
     v_binding_id = '' or v_binding_sku = '' or v_binding_location_code = '' then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  if v_binding_location_code <> v_location_code then
    raise exception 'binding_location_mismatch' using errcode = '22023';
  end if;

  if not private.can_access_warehouse(v_warehouse_code) then
    raise exception 'warehouse_access_denied' using errcode = '42501';
  end if;

  select warehouse.id
    into v_warehouse_id
    from public.wms_warehouses warehouse
    where upper(warehouse.code) = v_warehouse_code
      and warehouse.active is true
    limit 1;

  if v_warehouse_id is null then
    raise exception 'warehouse_not_found' using errcode = '22023';
  end if;

  select coalesce(array_agg(expected.token order by expected.token), array[]::text[])
    into v_expected_tokens
    from (
      select distinct
        trim(item->>'id') || chr(31) || trim(coalesce(item->>'sku', '')) as token
      from jsonb_array_elements(coalesce(p_payload->'expected_occupants', '[]'::jsonb)) item
      where trim(coalesce(item->>'id', '')) <> ''
    ) expected;

  select coalesce(array_agg(removal.id order by removal.id), array[]::text[])
    into v_ids_to_remove
    from (
      select distinct trim(value) as id
      from jsonb_array_elements_text(coalesce(p_payload->'ids_to_remove', '[]'::jsonb))
      where trim(value) <> ''
    ) removal;

  if v_binding_id = any(v_ids_to_remove) then
    raise exception 'binding_cannot_remove_itself' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_warehouse_code || ':' || v_location_code, 0)
  );

  select coalesce(array_agg(current_row.token order by current_row.token), array[]::text[])
    into v_current_tokens
    from (
      select binding.id || chr(31) || trim(coalesce(binding.sku, '')) as token
      from public.wms_bindings binding
      where binding.warehouse_code = v_warehouse_code
        and binding.location_code = v_location_code
    ) current_row;

  if v_current_tokens is distinct from v_expected_tokens then
    select coalesce(jsonb_agg(to_jsonb(binding) order by binding.id), '[]'::jsonb)
      into v_occupants
      from public.wms_bindings binding
      where binding.warehouse_code = v_warehouse_code
        and binding.location_code = v_location_code;
    return jsonb_build_object('conflict', true, 'occupants', v_occupants);
  end if;

  insert into public.wms_bindings (
    id, sku, rua, rack, linha, letra, location_code, area_code, area_name,
    product_name, warehouse_id, warehouse_code, created_at, updated_at
  )
  values (
    v_binding_id,
    v_binding_sku,
    coalesce((v_binding->>'rua')::integer, 1),
    coalesce((v_binding->>'rack')::integer, 1),
    coalesce((v_binding->>'linha')::integer, 1),
    coalesce(v_binding->>'letra', 'A'),
    v_location_code,
    coalesce((v_binding->>'area_code')::integer, 1),
    coalesce(v_binding->>'area_name', ''),
    coalesce(v_binding->>'product_name', ''),
    v_warehouse_id,
    v_warehouse_code,
    coalesce((v_binding->>'created_at')::timestamptz, now()),
    coalesce((v_binding->>'updated_at')::timestamptz, now())
  )
  on conflict (id) do update set
    sku = excluded.sku,
    rua = excluded.rua,
    rack = excluded.rack,
    linha = excluded.linha,
    letra = excluded.letra,
    location_code = excluded.location_code,
    area_code = excluded.area_code,
    area_name = excluded.area_name,
    product_name = excluded.product_name,
    warehouse_id = excluded.warehouse_id,
    warehouse_code = excluded.warehouse_code,
    updated_at = excluded.updated_at
  where wms_bindings.warehouse_code = v_warehouse_code;

  if not exists (
    select 1
    from public.wms_bindings binding
    where binding.id = v_binding_id
      and binding.warehouse_code = v_warehouse_code
      and binding.location_code = v_location_code
      and binding.sku = v_binding_sku
  ) then
    raise exception 'binding_commit_not_persisted' using errcode = '42501';
  end if;

  if cardinality(v_ids_to_remove) > 0 then
    select count(*)
      into v_expected_delete_count
      from public.wms_bindings binding
      where binding.warehouse_code = v_warehouse_code
        and binding.id = any(v_ids_to_remove);

    delete from public.wms_bindings binding
    where binding.warehouse_code = v_warehouse_code
      and binding.id = any(v_ids_to_remove);
    get diagnostics v_deleted_count = row_count;

    if v_deleted_count <> v_expected_delete_count then
      raise exception 'binding_removal_incomplete' using errcode = '42501';
    end if;
  end if;

  if jsonb_array_length(v_history) > 0 then
    insert into public.wms_history (
      id, datetime, action, sku, location, details, warehouse_id, warehouse_code
    )
    select
      coalesce(history_item->>'id', pg_catalog.gen_random_uuid()::text),
      coalesce((history_item->>'datetime')::timestamptz, now()),
      coalesce(history_item->>'action', ''),
      coalesce(history_item->>'sku', ''),
      coalesce(history_item->>'location', ''),
      coalesce(history_item->>'details', ''),
      v_warehouse_id,
      v_warehouse_code
    from jsonb_array_elements(v_history) history_item
    on conflict (id) do nothing;
  end if;

  select coalesce(jsonb_agg(to_jsonb(binding) order by binding.id), '[]'::jsonb)
    into v_occupants
    from public.wms_bindings binding
    where binding.warehouse_code = v_warehouse_code
      and binding.location_code = v_location_code;

  return jsonb_build_object('conflict', false, 'occupants', v_occupants);
end;
$$;

revoke all on function public.wms_commit_binding_allocation(jsonb) from public, anon;
grant execute on function public.wms_commit_binding_allocation(jsonb) to authenticated;

notify pgrst, 'reload schema';

insert into public.wms_schema_version (id, version, description, applied_at, applied_by)
values (
  'current',
  '2026.09.30.005',
  'Atomic addressing allocation with per-location lock and optimistic conflict detection',
  now(),
  'addressing-concurrency-fast-path'
)
on conflict (id) do update
set version = excluded.version,
    description = excluded.description,
    applied_at = excluded.applied_at,
    applied_by = excluded.applied_by;
