create or replace function public.wms_upsert_import_bindings(p_warehouse_code text,p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_input jsonb; v_row public.wms_bindings%rowtype; v_existing text;
  v_saved public.wms_bindings%rowtype; v_result jsonb := '[]'::jsonb;
begin
  if not private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','OPERADOR'])
    or not coalesce(p_warehouse_code=any(private.current_wms_allowed_warehouses()),false)
  then raise exception 'Estoque nao autorizado.' using errcode='42501'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>200
  then raise exception 'Limite de 200 vinculos.'; end if;
  if exists(select 1 from jsonb_array_elements(p_rows) x
    where x->>'warehouse_code' is distinct from p_warehouse_code
      or coalesce(x->>'id','')='' or coalesce(x->>'sku','')='' or coalesce(x->>'location_code','')='')
  then raise exception 'Vinculo invalido ou fora do escopo.' using errcode='42501'; end if;
  for v_input in select value from jsonb_array_elements(p_rows) order by value->>'sku',value->>'location_code' loop
    v_row:=jsonb_populate_record(null::public.wms_bindings,v_input);
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_warehouse_code||':'||v_row.sku,0));
    select id into v_existing from public.wms_bindings
      where warehouse_code=p_warehouse_code and sku=v_row.sku and location_code=v_row.location_code;
    if found then v_row.id:=v_existing; end if;
    begin
      insert into public.wms_bindings(id,sku,rua,rack,linha,letra,location_code,area_code,area_name,
        product_name,warehouse_id,warehouse_code,created_at,updated_at)
      values(v_row.id,v_row.sku,v_row.rua,v_row.rack,v_row.linha,v_row.letra,v_row.location_code,
        coalesce(v_row.area_code,1),coalesce(v_row.area_name,'Alto Giro'),coalesce(v_row.product_name,''),
        v_row.warehouse_id,p_warehouse_code,coalesce(v_row.created_at,now()),coalesce(v_row.updated_at,now()))
      on conflict(id) do update set sku=excluded.sku,rua=excluded.rua,rack=excluded.rack,
        linha=excluded.linha,letra=excluded.letra,location_code=excluded.location_code,
        area_code=excluded.area_code,area_name=excluded.area_name,product_name=excluded.product_name,
        updated_at=excluded.updated_at
      where wms_bindings.warehouse_code=p_warehouse_code
      returning * into v_saved;
      if not found then raise exception 'Vinculo fora do escopo.' using errcode='42501'; end if;
    exception when unique_violation then
      -- A concurrent writer may have created this natural key after the lookup.
      insert into public.wms_bindings(id,sku,rua,rack,linha,letra,location_code,area_code,area_name,
        product_name,warehouse_id,warehouse_code,created_at,updated_at)
      values('binding-'||pg_catalog.gen_random_uuid()::text,v_row.sku,v_row.rua,v_row.rack,v_row.linha,v_row.letra,
        v_row.location_code,coalesce(v_row.area_code,1),coalesce(v_row.area_name,'Alto Giro'),
        coalesce(v_row.product_name,''),v_row.warehouse_id,p_warehouse_code,coalesce(v_row.created_at,now()),coalesce(v_row.updated_at,now()))
      on conflict(warehouse_code,sku,location_code) do update set
        rua=excluded.rua,rack=excluded.rack,linha=excluded.linha,letra=excluded.letra,
        area_code=excluded.area_code,area_name=excluded.area_name,product_name=excluded.product_name,updated_at=excluded.updated_at
      returning * into v_saved;
    end;
    v_result:=v_result||jsonb_build_array(to_jsonb(v_saved));
  end loop;
  return v_result;
end $$;
revoke all on function public.wms_upsert_import_bindings(text,jsonb) from public,anon;
grant execute on function public.wms_upsert_import_bindings(text,jsonb) to authenticated;
notify pgrst,'reload schema';
