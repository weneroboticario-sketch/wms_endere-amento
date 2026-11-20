-- WMS Endereçamento: distinguish administrator maintenance (null profile)
-- from authenticated ATENDENTE. RLS continues enforcing client permissions.
create or replace function private.guard_wms_replenishment_attendant_update()
returns trigger language plpgsql set search_path to '' as $guard$
begin
  if (select private.current_wms_role()) is distinct from 'ATENDENTE' then
    return new;
  end if;
  if old.cancellation_requested_at is not null then
    raise exception using errcode='42501',message='Cancellation was already requested for this order.';
  end if;
  if (
    to_jsonb(new) - array['cancellation_requested_at','cancellation_requested_by_id',
      'cancellation_requested_by_name','cancellation_request_reason','updated_at']::text[]
  ) is distinct from (
    to_jsonb(old) - array['cancellation_requested_at','cancellation_requested_by_id',
      'cancellation_requested_by_name','cancellation_request_reason','updated_at']::text[]
  ) then
    raise exception using errcode='42501',message='Attendants cannot change the operational replenishment workflow.';
  end if;
  new.cancellation_requested_at := now();
  new.cancellation_requested_by_id := (select private.current_wms_profile_id());
  new.cancellation_requested_by_name := coalesce(old.solicitado_por_nome,'');
  new.cancellation_request_reason := left(trim(coalesce(new.cancellation_request_reason,'')),500);
  new.updated_at := now();
  return new;
end
$guard$;

-- Cancel only newer, unclaimed, never-attended duplicates with their matching originals intact.
do $maintenance$
declare changed integer;
begin
 with pairs(duplicate_id,keeper_id,sku,qty) as (
  values
  ('rep-21cd8c2d-a36b-4557-afc1-5ec06a1681f2','rep-15248c65-a144-40b3-bbef-ccffae5a44cf','51213',9::numeric),
  ('rep-985b6e99-89c8-435d-ab01-be01a0ac3cc1','rep-f929fffe-1c86-4204-b94b-aa2f335cf569','59403',4::numeric)
 ), verified as (
  select p.* from pairs p
  join public.wms_replenishment_requests d on d.id=p.duplicate_id
  join public.wms_replenishment_requests k on k.id=p.keeper_id
  where d.warehouse_code='VDCG' and k.warehouse_code=d.warehouse_code
    and d.codigo_material=p.sku and k.codigo_material=p.sku
    and d.quantidade_solicitada=p.qty and k.quantidade_solicitada=p.qty
    and d.solicitado_por_id=k.solicitado_por_id and d.created_at>k.created_at
    and d.status='PENDENTE' and k.status='PENDENTE'
    and coalesce(d.is_deleted,false)=false and coalesce(d.archived,false)=false
    and coalesce(d.quantidade_atendida,0)=0
    and coalesce(d.responsavel_id,'')='' and coalesce(d.claimed_by_id,'')=''
    and d.claimed_at is null and d.started_at is null and d.export_batch_id is null
    and coalesce(d.loja_credito_processado,false)=false
    and coalesce(d.captacao_debito_quantidade,0)=0
    and coalesce(d.loja_credito_quantidade,0)=0
    and not exists(select 1 from public.wms_caixa_requests c where c.replenishment_id=d.id)
    and exists(select 1 from public.operacao_tarefas t where t.referencia_tipo='REPOSICAO'
      and t.referencia_id=d.id and t.status='PENDENTE'
      and t.data_inicio is null and t.atribuido_para is null)
 ), updated as (
  update public.wms_replenishment_requests r set status='CANCELADO',
    motivo_cancelamento='Duplicidade da solicitação '||v.keeper_id||'. Pedido original preservado, sem movimentação de estoque.',
    updated_at=now()
  from verified v where r.id=v.duplicate_id and r.status='PENDENTE'
  returning r.id
 )
 select count(*) into changed from updated;
 if changed <> 2 then
   raise exception 'Manutenção interrompida: esperados 2 duplicados sem trabalho iniciado, encontrados %. Transação revertida.',changed;
 end if;
end $maintenance$;

-- Protection against two simultaneous tabs, even with distinct client action IDs.
create unique index if not exists wms_pending_replenishment_owner_sku_qty_uidx
  on public.wms_replenishment_requests (
    warehouse_code,
    (regexp_replace(trim(codigo_material),'^0+','')),
    solicitado_por_id,
    quantidade_solicitada
  )
  where status='PENDENTE'
    and coalesce(is_deleted,false)=false
    and coalesce(archived,false)=false
    and coalesce(quantidade_atendida,0)=0
    and coalesce(responsavel_id,'')=''
    and coalesce(solicitado_por_id,'')<>'';
