-- Additive dashboard-only aggregates. No operational tables, policies or rows change.
create or replace function private.wms_global_executive_data(p_filters jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_result jsonb;
  v_since timestamptz:=coalesce(nullif(p_filters->>'since','')::timestamptz,now()-interval '7 days');
  v_until timestamptz:=coalesce(nullif(p_filters->>'until','')::timestamptz,now());
  v_stalled interval:=make_interval(hours=>greatest(1,least(168,coalesce((p_filters->>'stalled_hours')::integer,4))));
begin
  if auth.uid() is null or not private.is_wms_global_administrator() then
    raise exception 'Visao Geral nao autorizada.' using errcode='42501';
  end if;
  if v_since>v_until then raise exception 'Periodo invalido.'; end if;
  with operations as materialized (
    select 'tasks' as domain,r.* from private.wms_global_operation_rows('tasks') r
    union all select 'replenishment',r.* from private.wms_global_operation_rows('replenishment') r
    union all select 'transfers',r.* from private.wms_global_operation_rows('transfers') r
  ), filtered as materialized (
    select r.*,extract(epoch from now()-created_at)/60 as age_minutes,
      (not closed and deadline<now()) as overdue,
      (not closed and updated_at<now()-v_stalled) as stalled,
      nullif(responsible_id,'') is null as unassigned,
      exists(select 1 from public.wms_users u where u.id=responsible_id and (not u.active or coalesce(u.archived,false) or u.available_for_tasks is not true)) as unavailable_responsible
    from operations r where not archived
      and (nullif(p_filters->>'warehouse','') is null or warehouse_code=p_filters->>'warehouse')
      and (nullif(p_filters->>'responsible','') is null or responsible_id=p_filters->>'responsible')
      and (nullif(p_filters->>'status','') is null or status=p_filters->>'status')
      and (nullif(p_filters->>'priority','') is null or priority=p_filters->>'priority')
      and (nullif(p_filters->>'kind','') is null or domain<>'tasks' or kind=p_filters->>'kind')
  ), queue as (
    select warehouse_code,
      count(*) filter(where age_minutes<=15) as minutes_0_15,
      count(*) filter(where age_minutes>15 and age_minutes<=30) as minutes_15_30,
      count(*) filter(where age_minutes>30 and age_minutes<=60) as minutes_30_60,
      count(*) filter(where age_minutes>60) as minutes_60_plus,min(created_at) as oldest_at
    from filtered where domain='replenishment' and not closed group by warehouse_code
  ), events as (
    select domain,case when domain='transfers' then nullif(detail->>'started_at','')::timestamptz else created_at end as at,'created' as metric from filtered
    union all select domain,nullif(detail->>'finished_at','')::timestamptz,'finished' from filtered
      where status in ('CONCLUIDA','CONCLUIDO','ENTREGUE_NA_LOJA','FINALIZADA')
  ), trends as (
    select domain,(at at time zone 'America/Cuiaba')::date as day,
      count(*) filter(where metric='created') as created,count(*) filter(where metric='finished') as finished
    from events where at between greatest(v_since,v_until-interval '30 days') and v_until group by domain,(at at time zone 'America/Cuiaba')::date
  ), attention as (
    select d.domain,coalesce(jsonb_agg(to_jsonb(top) order by top.overdue desc nulls last,
      case when top.overdue then top.deadline end asc nulls last,
      case when d.domain='transfers' then top.updated_at else top.created_at end,top.id) filter(where top.id is not null),'[]'::jsonb) as rows
    from (values('tasks'),('replenishment'),('transfers')) d(domain)
    left join lateral (
      select r.* from filtered r where r.domain=d.domain and not closed
        and (overdue or stalled or unassigned or unavailable_responsible or divergence>0 or status in ('BLOQUEADA','SEM_ESTOQUE','ATENDIDO_PARCIAL') or (domain='replenishment' and age_minutes>60))
      order by overdue desc nulls last,case when overdue then deadline end asc nulls last,
        case when r.domain='transfers' then updated_at else created_at end,id limit 10
    ) top on true group by d.domain
  )
  select jsonb_build_object('queue',coalesce((select jsonb_agg(to_jsonb(queue)) from queue),'[]'::jsonb),
    'trends',coalesce((select jsonb_agg(to_jsonb(trends) order by day,domain) from trends),'[]'::jsonb),
    'attention',coalesce((select jsonb_object_agg(domain,rows) from attention),'{}'::jsonb)) into v_result;
  return v_result;
end;
$$;
revoke all on function private.wms_global_executive_data(jsonb) from public,anon;
grant execute on function private.wms_global_executive_data(jsonb) to authenticated;
create or replace function public.wms_global_dashboard(
  p_section text default 'overview',p_filters jsonb default '{}'::jsonb,p_limit integer default 50,p_offset integer default 0
) returns jsonb language sql stable security invoker set search_path='' as $$
  select case when p_section='executive' then private.wms_global_executive_data(coalesce(p_filters,'{}'::jsonb))
    else private.wms_global_dashboard_data(p_section,coalesce(p_filters,'{}'::jsonb),coalesce(p_limit,50),coalesce(p_offset,0)) end;
$$;
revoke all on function public.wms_global_dashboard(text,jsonb,integer,integer) from public,anon;
grant execute on function public.wms_global_dashboard(text,jsonb,integer,integer) to authenticated;
notify pgrst, 'reload schema';
