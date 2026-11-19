-- Automatic operational monitoring for Logística de Excelência.
-- This is read-only monitoring: it counts work already recorded by the WMS and does not require an evaluation cycle.
create or replace function public.wms_excellence_operational_overview(
  p_warehouse text,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  start_ts timestamptz;
  end_ts timestamptz;
  result jsonb;
begin
  if not private.excellence_leader(upper(p_warehouse)) then
    raise exception 'Liderança necessária.' using errcode='42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or (p_to - p_from) > 62 then
    raise exception 'Período inválido. Use até 63 dias.';
  end if;

  start_ts := p_from::timestamp at time zone 'America/Cuiaba';
  end_ts := (p_to + 1)::timestamp at time zone 'America/Cuiaba';

  with people as (
    select
      u.id,
      coalesce(nullif(u.name,''),nullif(u.username,''),u.id) as name,
      u.role,
      coalesce(nullif(to_jsonb(u)->>'profile',''),u.role) as profile
    from public.wms_users u
    where private.excellence_user(upper(p_warehouse),u.id)
      and (
        u.role in ('OPERADOR','SUPERVISOR')
        or coalesce(nullif(to_jsonb(u)->>'profile',''),u.role) in ('OPERADOR','SUPERVISOR')
      )
  ),
  rep as (
    select
      e.actor_id as user_id,
      count(distinct e.request_id) filter(where e.event_type in ('ATTENDED','COMPLETED'))::integer as replenishments_handled,
      count(distinct e.request_id) filter(where e.event_type='REQUESTED')::integer as replenishments_requested,
      coalesce(sum(case when e.event_type='ATTENDED' and coalesce(e.quantity_delta,0)>0 then e.quantity_delta else 0 end),0)::numeric as replenishment_units
    from public.wms_replenishment_participation_events e
    where e.warehouse_code=upper(p_warehouse)
      and e.event_at>=start_ts and e.event_at<end_ts
    group by e.actor_id
  ),
  transfer_stats as (
    select
      e.user_id,
      count(distinct (
        coalesce(nullif(to_jsonb(e)->>'transfer_id',''),e.id)
        || ':' ||
        coalesce(nullif(to_jsonb(e)->>'item_id',''),nullif(e.sku,''),e.id)
      )) filter(where upper(coalesce(e.event_type,''))<>'FINALIZACAO')::integer as transfer_items,
      count(distinct coalesce(nullif(to_jsonb(e)->>'transfer_id',''),e.id))
        filter(where upper(coalesce(e.event_type,''))='FINALIZACAO')::integer as transfers_finalized
    from public.wms_transfer_events e
    where e.warehouse_code=upper(p_warehouse)
      and e.created_at>=start_ts and e.created_at<end_ts
      and nullif(e.user_id,'') is not null
    group by e.user_id
  ),
  task_stats as (
    select
      t.atribuido_para as user_id,
      count(*) filter(
        where upper(coalesce(t.referencia_tipo,''))='EXCELLENCE_STANDARD'
          and t.status::text in ('CONCLUIDA','AGUARDANDO_VALIDACAO')
      )::integer as standard_tasks_completed,
      count(*) filter(
        where upper(coalesce(t.referencia_tipo,'')) not in ('REPOSICAO','TRANSFERENCIA','EXCELLENCE_STANDARD')
          and t.status::text in ('CONCLUIDA','AGUARDANDO_VALIDACAO')
      )::integer as tasks_completed
    from public.operacao_tarefas t
    where t.estoque_id=upper(p_warehouse)
      and t.data_conclusao>=start_ts and t.data_conclusao<end_ts
      and nullif(t.atribuido_para,'') is not null
    group by t.atribuido_para
  ),
  rows as (
    select
      p.id as user_id,
      p.name,
      p.role,
      p.profile,
      coalesce(r.replenishments_handled,0) as replenishments_handled,
      coalesce(r.replenishments_requested,0) as replenishments_requested,
      coalesce(r.replenishment_units,0) as replenishment_units,
      coalesce(x.transfer_items,0) as transfer_items,
      coalesce(x.transfers_finalized,0) as transfers_finalized,
      coalesce(t.tasks_completed,0) as tasks_completed,
      coalesce(t.standard_tasks_completed,0) as standard_tasks_completed,
      (
        coalesce(r.replenishments_handled,0)
        + coalesce(x.transfer_items,0)
        + coalesce(x.transfers_finalized,0)
        + coalesce(t.tasks_completed,0)
        + coalesce(t.standard_tasks_completed,0)
      )::integer as activity_records
    from people p
    left join rep r on r.user_id=p.id
    left join transfer_stats x on x.user_id=p.id
    left join task_stats t on t.user_id=p.id
  )
  select jsonb_build_object(
    'period',jsonb_build_object('from',p_from,'to',p_to,'timeZone','America/Cuiaba'),
    'updated_at',now(),
    'totals',jsonb_build_object(
      'replenishments_handled',coalesce(sum(replenishments_handled),0),
      'replenishments_requested',coalesce(sum(replenishments_requested),0),
      'replenishment_units',coalesce(sum(replenishment_units),0),
      'transfer_items',coalesce(sum(transfer_items),0),
      'transfers_finalized',coalesce(sum(transfers_finalized),0),
      'tasks_completed',coalesce(sum(tasks_completed),0),
      'standard_tasks_completed',coalesce(sum(standard_tasks_completed),0),
      'activity_records',coalesce(sum(activity_records),0)
    ),
    'people',coalesce(
      jsonb_agg(to_jsonb(rows) order by activity_records desc,name asc),
      '[]'::jsonb
    ),
    'rules',jsonb_build_array(
      'Reposição é contabilizada por pedido com participação registrada, sem duplicar ATTENDED e COMPLETED do mesmo colaborador.',
      'Unidades repostas são somadas apenas a partir de quantidade positiva registrada no evento ATTENDED.',
      'Transferências contam itens distintos trabalhados e finalizações registradas com autoria.',
      'Tarefas concluídas da Central são contabilizadas sem duplicar tarefas derivadas de Reposição ou Transferência.',
      'Rotinas avaliadas aparecem em coluna separada e continuam sujeitas à validação quando aplicável.',
      'Este painel é acompanhamento operacional e não altera automaticamente a nota de 0–100.'
    )
  ) into result
  from rows;

  return coalesce(result,jsonb_build_object(
    'period',jsonb_build_object('from',p_from,'to',p_to,'timeZone','America/Cuiaba'),
    'updated_at',now(),
    'totals',jsonb_build_object(
      'replenishments_handled',0,'replenishments_requested',0,'replenishment_units',0,
      'transfer_items',0,'transfers_finalized',0,'tasks_completed',0,
      'standard_tasks_completed',0,'activity_records',0
    ),
    'people','[]'::jsonb,
    'rules','[]'::jsonb
  ));
end $$;

revoke all on function public.wms_excellence_operational_overview(text,date,date)
from public,anon,authenticated,service_role;
grant execute on function public.wms_excellence_operational_overview(text,date,date)
to authenticated;
