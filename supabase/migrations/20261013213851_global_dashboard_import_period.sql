-- New dashboard-only section; the legacy imports section remains compatible.
create or replace function private.wms_global_import_period_data(p_filters jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_result jsonb;
  v_since timestamptz:=coalesce(nullif(p_filters->>'since','')::timestamptz,now()-interval '7 days');
  v_until timestamptz:=coalesce(nullif(p_filters->>'until','')::timestamptz,now());
begin
  if auth.uid() is null or not private.is_wms_global_administrator() then
    raise exception 'Visao Geral nao autorizada.' using errcode='42501';
  end if;
  if v_since>v_until then raise exception 'Periodo invalido.'; end if;
  with imports as (
    select b.warehouse_code,(b.created_at at time zone 'America/Cuiaba')::date as day,b.source_type,b.status,count(*) as total,
      avg(extract(epoch from b.finished_at-b.created_at)) filter(where b.finished_at>=b.created_at) as average_seconds,
      count(*) filter(where b.finished_at>=b.created_at) as duration_samples,
      count(*) filter(where (b.created_at at time zone 'America/Cuiaba')::date=(now() at time zone 'America/Cuiaba')::date) as today
    from public.wms_stock_import_batches b join public.wms_warehouses w on w.code=b.warehouse_code
    where w.active is true and w.code<>'DOURADOS' and not coalesce(b.archived,false)
      and b.created_at between v_since and v_until
      and (nullif(p_filters->>'warehouse','') is null or b.warehouse_code=p_filters->>'warehouse')
      and (nullif(p_filters->>'responsible','') is null or b.imported_by_id=p_filters->>'responsible')
      and (nullif(p_filters->>'status','') is null or b.status=p_filters->>'status')
    group by b.warehouse_code,(b.created_at at time zone 'America/Cuiaba')::date,b.source_type,b.status
  ) select jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(imports)),'[]'::jsonb)) into v_result from imports;
  return v_result;
end;
$$;
revoke all on function private.wms_global_import_period_data(jsonb) from public,anon;
grant execute on function private.wms_global_import_period_data(jsonb) to authenticated;
create or replace function public.wms_global_dashboard(
  p_section text default 'overview',p_filters jsonb default '{}'::jsonb,p_limit integer default 50,p_offset integer default 0
) returns jsonb language sql stable security invoker set search_path='' as $$
  select case when p_section='executive' then private.wms_global_executive_data(coalesce(p_filters,'{}'::jsonb))
    when p_section='imports_period' then private.wms_global_import_period_data(coalesce(p_filters,'{}'::jsonb))
    else private.wms_global_dashboard_data(p_section,coalesce(p_filters,'{}'::jsonb),coalesce(p_limit,50),coalesce(p_offset,0)) end;
$$;
revoke all on function public.wms_global_dashboard(text,jsonb,integer,integer) from public,anon;
grant execute on function public.wms_global_dashboard(text,jsonb,integer,integer) to authenticated;
notify pgrst, 'reload schema';
