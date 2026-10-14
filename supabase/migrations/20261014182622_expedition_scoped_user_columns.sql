begin;
-- Respect column-level protection on users; no password fields are needed.
create or replace function private.wms_expedition_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare
  r text:=private.current_wms_role(); u record;
  fields text[]:=array['expedition_stage','expedition_responsible_id','expedition_responsible_name',
    'expedition_assigned_at','collected_at','transit_at','delivered_at','delivery_deadline',
    'dispatched_boxes','received_boxes','delivery_reason','delivery_resolved_at','expedition_action_id','expedition_revision'];
  changed boolean; boxes numeric;
begin
  if tg_op='INSERT' then
    new.expedition_stage:='';new.expedition_responsible_id:=null;new.expedition_responsible_name:=null;
    new.expedition_assigned_at:=null;new.collected_at:=null;new.transit_at:=null;new.delivered_at:=null;
    new.delivery_deadline:=null;new.delivery_resolved_at:=null;new.dispatched_boxes:=null;new.received_boxes:=null;
    new.delivery_reason:='';new.expedition_action_id:=null;new.expedition_revision:=0;return new;
  end if;
  changed:=exists(select 1 from unnest(fields) f where to_jsonb(new)->f is distinct from to_jsonb(old)->f);
  if not old.requires_invoice then
    if changed then raise exception 'Expedicao fiscal disponivel somente para transferencias de Compras.';end if;
    return new;
  end if;
  if new.invoice_stage is distinct from old.invoice_stage then
    if new.invoice_stage='DESPACHADA' and new.expedition_stage not in ('COLETADA','EM_TRANSITO') then
      raise exception 'Registre responsavel e caixas na Gestao de Expedicao antes do despacho.';
    elsif new.invoice_stage='RECEBIDA' and new.expedition_stage not in ('ENTREGUE','ENTREGA_COM_DIVERGENCIA') then
      raise exception 'Informe as caixas recebidas na Gestao de Expedicao.';
    elsif new.invoice_stage='FINALIZADA' and new.expedition_stage<>'ENTREGUE' then
      raise exception 'Resolva a divergencia de entrega antes de concluir.';
    elsif new.invoice_stage='CORRECAO_SOLICITADA' and old.expedition_stage<>'' then
      if r not in ('ADMINISTRADOR','SUPERVISOR') or nullif(btrim(new.fiscal_reason),'') is null then
        raise exception 'Reabertura da expedicao restrita ao gestor com justificativa.';
      end if;
      new.expedition_stage:='';new.expedition_responsible_id:=null;new.expedition_responsible_name:=null;
      new.expedition_assigned_at:=null;new.collected_at:=null;new.transit_at:=null;new.delivered_at:=null;
      new.delivery_deadline:=null;new.delivery_resolved_at:=null;new.dispatched_boxes:=null;new.received_boxes:=null;
      new.delivery_reason:=new.fiscal_reason;new.expedition_revision:=old.expedition_revision+1;
      new.expedition_action_id:=new.invoice_last_action_id;return new;
    end if;
  end if;
  if not changed then return new;end if;
  new.delivery_resolved_at:=old.delivery_resolved_at;
  if r not in ('ADMINISTRADOR','SUPERVISOR','OPERADOR')
    or not coalesce(old.warehouse_code=any(private.current_wms_allowed_warehouses()),false) then
    raise exception 'Expedicao nao autorizada.' using errcode='42501';
  end if;
  if not coalesce(old.invoice_stage in ('LIBERADA_PARA_ENVIO','DESPACHADA','RECEBIDA'),false) then
    raise exception 'Conclua a NF e libere a transferencia antes da expedicao.';
  end if;
  if nullif(new.expedition_action_id,'') is null or new.expedition_action_id=old.expedition_action_id then
    raise exception 'Identificador de acao obrigatorio e unico.';
  end if;
  if old.expedition_responsible_id is not null and r='OPERADOR'
    and old.expedition_responsible_id<>private.current_wms_profile_id() then
    raise exception 'Somente o responsavel pela expedicao ou gestor pode executar esta acao.' using errcode='42501';
  end if;
  if new.expedition_stage='ATRIBUIDA' and old.expedition_stage in ('','ATRIBUIDA') then
    select id,name into u from public.wms_users where id=new.expedition_responsible_id and active
      and not coalesce(archived,false) and available_for_tasks is true
      and role in ('OPERADOR','SUPERVISOR','ADMINISTRADOR')
      and coalesce(nullif(default_warehouse_code,''),warehouse_code)=old.warehouse_code;
    if not found then raise exception 'Responsavel deve estar ativo, disponivel e na unidade de origem.';end if;
    if r='OPERADOR' and u.id<>private.current_wms_profile_id() then
      raise exception 'Operador pode assumir somente para si.' using errcode='42501';end if;
    if old.expedition_stage='ATRIBUIDA' and (r not in ('ADMINISTRADOR','SUPERVISOR') or nullif(btrim(new.delivery_reason),'') is null) then
      raise exception 'Reatribuicao exige gestor e justificativa.';end if;
    new.expedition_responsible_name:=u.name;new.expedition_assigned_at:=now();
    new.delivery_deadline:=coalesce(old.delivery_deadline,
      old.invoice_released_at+make_interval(hours=>coalesce((select delivery_hours from public.wms_transfer_sla where warehouse_code=old.warehouse_code),24)));
    new.dispatched_boxes:=old.dispatched_boxes;new.received_boxes:=old.received_boxes;
    new.collected_at:=old.collected_at;new.transit_at:=old.transit_at;new.delivered_at:=old.delivered_at;
  else
    if (new.expedition_responsible_id,new.expedition_responsible_name,new.expedition_assigned_at,new.delivery_deadline)
      is distinct from (old.expedition_responsible_id,old.expedition_responsible_name,old.expedition_assigned_at,old.delivery_deadline) then
      raise exception 'Responsavel e prazo nao podem ser alterados nesta etapa.';end if;
    new.collected_at:=old.collected_at;new.transit_at:=old.transit_at;new.delivered_at:=old.delivered_at;
    if old.expedition_stage='ATRIBUIDA' and new.expedition_stage='COLETADA' then
      boxes:=coalesce(nullif(old.final_box_count,0),nullif(old.total_boxes,0),old.total_caixas,0);
      if new.dispatched_boxes is null or new.dispatched_boxes<1 or new.dispatched_boxes<>boxes then
        raise exception 'Caixas enviadas devem corresponder as caixas conferidas (%).',boxes;end if;
      if new.received_boxes is not null then raise exception 'Recebimento ainda nao permitido.';end if;
      new.collected_at:=now();
    elsif old.expedition_stage='COLETADA' and new.expedition_stage='EM_TRANSITO' then
      new.transit_at:=now();new.dispatched_boxes:=old.dispatched_boxes;new.received_boxes:=old.received_boxes;
    elsif old.expedition_stage in ('COLETADA','EM_TRANSITO') and new.expedition_stage in ('ENTREGUE','ENTREGA_COM_DIVERGENCIA') then
      new.dispatched_boxes:=old.dispatched_boxes;
      if new.received_boxes is null or new.received_boxes<0 then raise exception 'Informe caixas recebidas, inclusive zero.';end if;
      if new.received_boxes<>old.dispatched_boxes and new.expedition_stage<>'ENTREGA_COM_DIVERGENCIA' then
        raise exception 'Quantidade divergente exige ENTREGA_COM_DIVERGENCIA.';end if;
      if new.expedition_stage='ENTREGA_COM_DIVERGENCIA' and nullif(btrim(new.delivery_reason),'') is null then
        raise exception 'Justifique a divergencia da entrega.';end if;
      new.delivered_at:=now();
    elsif old.expedition_stage='ENTREGA_COM_DIVERGENCIA' and new.expedition_stage='ENTREGUE' then
      if r not in ('ADMINISTRADOR','SUPERVISOR') or nullif(btrim(new.delivery_reason),'') is null then
        raise exception 'Resolucao exige gestor e justificativa.';end if;
      if (new.received_boxes,new.dispatched_boxes) is distinct from (old.received_boxes,old.dispatched_boxes) then
        raise exception 'Preserve a contagem original. Registre a resolucao na justificativa.';end if;
      new.delivery_resolved_at:=now();
    else raise exception 'Transicao de expedicao invalida: % -> %',old.expedition_stage,new.expedition_stage;
    end if;
  end if;
  new.expedition_revision:=old.expedition_revision+1;new.updated_at:=now();return new;
end $$;
notify pgrst,'reload schema';
commit;
