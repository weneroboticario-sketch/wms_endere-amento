begin;
create or replace function public.wms_transfer_executive_summary(
  p_from date,p_until date,p_warehouse text default null,p_origin text default null,
  p_destination text default null,p_stage text default null,p_operation text default null
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;begin
  if not coalesce(private.has_wms_role(array['COMPRAS','ADMINISTRADOR','SUPERVISOR','OPERADOR']),false)
    or (p_warehouse is not null and not coalesce(p_warehouse=any(private.current_wms_allowed_warehouses()),false)) then
    raise exception 'Indicadores nao autorizados.' using errcode='42501';end if;
  if p_from is null or p_until is null or p_until<p_from or p_until-p_from>366 then
    raise exception 'Selecione um periodo de ate 367 dias.';end if;
  with scoped as materialized (
    select t.id,t.created_at,t.finished_at,t.status,t.request_origin,t.invoice_stage,t.invoice_released_at,
      t.invoice_uploaded_at,t.lacre_concluido_em,t.separation_finished_at,t.separacao_concluida_em,
      t.iniciado_em,t.sent_at,t.delivered_at,t.delivery_resolved_at,t.delivery_deadline,t.dispatched_boxes,t.received_boxes,
      t.expedition_stage,t.expedition_assigned_at,
      coalesce(nullif(t.origem_codigo_loja,''),t.warehouse_code) origin,
      coalesce(nullif(t.destino_codigo_loja,''),nullif(t.estabelecimento_codigo,''),'Nao informado') destination,
      coalesce(nullif(t.expedition_stage,''),nullif(t.invoice_stage,''),t.status) stage,
      coalesce(nullif(t.final_box_count,0),nullif(t.total_boxes,0),t.total_caixas,0) boxes,
      coalesce(t.total_skus,0) skus,coalesce(t.total_expected_quantity,0) units
    from public.wms_transfers t
    where not t.is_deleted and not coalesce(t.archived_by_unification,false)
      and t.warehouse_code=any(private.current_wms_allowed_warehouses())
      and (p_warehouse is null or t.warehouse_code=p_warehouse)
      and t.created_at>=(p_from::timestamp at time zone 'America/Cuiaba')
      and t.created_at<((p_until+1)::timestamp at time zone 'America/Cuiaba')
      and (p_origin is null or coalesce(nullif(t.origem_codigo_loja,''),t.warehouse_code)=p_origin)
      and (p_destination is null or coalesce(nullif(t.destino_codigo_loja,''),nullif(t.estabelecimento_codigo,''),'Nao informado')=p_destination)
      and (p_stage is null or coalesce(nullif(t.expedition_stage,''),nullif(t.invoice_stage,''),t.status)=p_stage)
      and (p_operation is null or t.request_origin=p_operation)
  ), daily as (
    select (created_at at time zone 'America/Cuiaba')::date as "day",count(*) transfers,
      sum(skus) skus,sum(units) units,sum(boxes) boxes from scoped group by 1 order by 1
  ), distribution as (select stage,count(*) total from scoped group by stage order by total desc,stage),
  origins as (select origin code,count(*) total from scoped group by origin order by total desc,origin limit 5),
  destinations as (select destination code,count(*) total from scoped group by destination order by total desc,destination limit 5)
  select jsonb_build_object(
    'created',count(*),'open',count(*) filter(where finished_at is null and status not in ('CANCELADA','CANCELADO','FINALIZADA')),
    'completed',count(*) filter(where finished_at is not null or status='FINALIZADA'),
    'awaiting_invoice',count(*) filter(where invoice_stage in ('PRONTA_PARA_NOTA','NF_EM_PREPARACAO','NF_ANEXADA')),
    'awaiting_expedition',count(*) filter(where invoice_stage='LIBERADA_PARA_ENVIO'),
    'in_transit',count(*) filter(where expedition_stage in ('COLETADA','EM_TRANSITO')),
    'delivered',count(*) filter(where delivered_at is not null),
    'delivery_divergences',count(*) filter(where expedition_stage='ENTREGA_COM_DIVERGENCIA'),
    'late',count(*) filter(where delivery_deadline<case when expedition_stage='ENTREGA_COM_DIVERGENCIA' then now() else coalesce(delivery_resolved_at,delivered_at,now()) end and expedition_stage<>''),
    'otd_eligible',count(*) filter(where delivered_at is not null and delivery_deadline is not null),
    'otd_unknown',count(*) filter(where delivered_at is not null and delivery_deadline is null),
    'otd_percent',round(100.0*count(*) filter(where coalesce(delivery_resolved_at,delivered_at)<=delivery_deadline and expedition_stage='ENTREGUE')/
      nullif(count(*) filter(where delivered_at is not null and delivery_deadline is not null),0),1),
    'boxes',coalesce(sum(boxes),0),'dispatched_boxes',coalesce(sum(dispatched_boxes),0),'received_boxes',coalesce(sum(received_boxes),0),
    'avg_lead_hours',round((avg(extract(epoch from (finished_at-created_at))) filter(where finished_at>=created_at))/3600,1),
    'avg_stock_hours',round((avg(extract(epoch from (coalesce(separation_finished_at,separacao_concluida_em)-iniciado_em)))
      filter(where coalesce(separation_finished_at,separacao_concluida_em)>=iniciado_em))/3600,1),
    'avg_invoice_hours',round((avg(extract(epoch from (invoice_released_at-lacre_concluido_em)))
      filter(where invoice_released_at>=lacre_concluido_em))/3600,1),
    'avg_expedition_hours',round((avg(extract(epoch from (sent_at-invoice_released_at)))
      filter(where sent_at>=invoice_released_at))/3600,1),
    'avg_delivery_hours',round((avg(extract(epoch from (coalesce(delivery_resolved_at,delivered_at)-sent_at))) filter(where coalesce(delivery_resolved_at,delivered_at)>=sent_at))/3600,1),
    'today_created',count(*) filter(where (created_at at time zone 'America/Cuiaba')::date=(now() at time zone 'America/Cuiaba')::date),
    'daily',coalesce((select jsonb_agg(to_jsonb(d)) from daily d),'[]'::jsonb),
    'statuses',coalesce((select jsonb_agg(to_jsonb(d)) from distribution d),'[]'::jsonb),
    'top_origins',coalesce((select jsonb_agg(to_jsonb(d)) from origins d),'[]'::jsonb),
    'top_destinations',coalesce((select jsonb_agg(to_jsonb(d)) from destinations d),'[]'::jsonb)
  ) into result from scoped;
  return result;
end $$;
revoke all on function public.wms_transfer_executive_summary(date,date,text,text,text,text,text) from public,anon;
grant execute on function public.wms_transfer_executive_summary(date,date,text,text,text,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
