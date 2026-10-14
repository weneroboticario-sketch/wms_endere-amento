begin;
alter table public.wms_transfers
  add column if not exists expedition_stage text not null default '',
  add column if not exists expedition_responsible_id text,
  add column if not exists expedition_responsible_name text,
  add column if not exists expedition_assigned_at timestamptz,
  add column if not exists collected_at timestamptz,
  add column if not exists transit_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists delivery_resolved_at timestamptz,
  add column if not exists delivery_deadline timestamptz,
  add column if not exists dispatched_boxes integer,
  add column if not exists received_boxes integer,
  add column if not exists delivery_reason text not null default '',
  add column if not exists expedition_action_id text,
  add column if not exists expedition_revision integer not null default 0;
create index if not exists wms_transfers_expedition_queue_idx
  on public.wms_transfers(warehouse_code,expedition_stage,invoice_released_at,id)
  where requires_invoice and not is_deleted;
create index if not exists wms_transfers_period_idx
  on public.wms_transfers(warehouse_code,created_at) where not is_deleted;

create table if not exists public.wms_transfer_sla (
  warehouse_code text primary key,
  delivery_hours integer not null default 24 check(delivery_hours between 1 and 8760),
  attention_percent integer not null default 80 check(attention_percent between 1 and 99),
  updated_at timestamptz not null default now()
);
alter table public.wms_transfer_sla enable row level security;
drop policy if exists transfer_sla_read on public.wms_transfer_sla;
create policy transfer_sla_read on public.wms_transfer_sla for select to authenticated
using(warehouse_code=any((select private.current_wms_allowed_warehouses())::text[])
  and (select private.has_wms_role(array['COMPRAS','ADMINISTRADOR','SUPERVISOR','OPERADOR'])));
drop policy if exists transfer_sla_write on public.wms_transfer_sla;
create policy transfer_sla_write on public.wms_transfer_sla for all to authenticated
using(warehouse_code=any((select private.current_wms_allowed_warehouses())::text[])
  and (select private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR'])))
with check(warehouse_code=any((select private.current_wms_allowed_warehouses())::text[])
  and (select private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR'])));
grant select,insert,update on public.wms_transfer_sla to authenticated;
revoke all on public.wms_transfer_sla from anon;

-- These guards also protect direct Data API updates and old fiscal buttons.
create or replace function private.wms_expedition_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare
  r text:=private.current_wms_role(); u public.wms_users;
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
    select * into u from public.wms_users where id=new.expedition_responsible_id and active
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
drop trigger if exists a0_wms_expedition_guard on public.wms_transfers;
create trigger a0_wms_expedition_guard before insert or update on public.wms_transfers
for each row execute function private.wms_expedition_guard();

create or replace function private.wms_expedition_audit() returns trigger
language plpgsql security invoker set search_path='' as $$
declare k text;n text;begin
  if new.expedition_revision=old.expedition_revision then return new;end if;
  k:='expedition:'||new.id||':'||new.expedition_action_id;
  select name into n from public.wms_users where id=private.current_wms_profile_id();
  insert into public.wms_transfer_events(id,transfer_id,warehouse_code,user_id,user_name,event_type,details,payload)
  values(k,new.id,new.warehouse_code,private.current_wms_profile_id(),n,
    'EXPEDITION_'||coalesce(nullif(new.expedition_stage,''),'REOPENED'),new.delivery_reason,
    jsonb_build_object('stage',new.expedition_stage,'responsible_id',new.expedition_responsible_id,
      'expected_boxes',coalesce(nullif(new.final_box_count,0),nullif(new.total_boxes,0),new.total_caixas),
      'dispatched_boxes',new.dispatched_boxes,'received_boxes',new.received_boxes,
      'difference',new.received_boxes-new.dispatched_boxes,'deadline',new.delivery_deadline,'resolved_at',new.delivery_resolved_at))
  on conflict(id) do nothing;
  if new.expedition_stage='ATRIBUIDA' and new.expedition_responsible_id is distinct from old.expedition_responsible_id then
    insert into public.wms_notifications(id,warehouse_code,user_id,user_name,entity_id,transfer_id,event_type,title,message,idempotency_key,payload)
    values(k||':assigned',new.warehouse_code,new.expedition_responsible_id,new.expedition_responsible_name,new.id,new.id,
      'EXPEDITION_ASSIGNED','Expedicao atribuida','Transferencia disponivel para coleta.',k||':assigned',jsonb_build_object('entity_id',new.id))
    on conflict(id) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists wms_expedition_audit on public.wms_transfers;
create trigger wms_expedition_audit after update on public.wms_transfers
for each row execute function private.wms_expedition_audit();

create or replace function public.wms_expedition_action(p_id text,p_expected_revision integer,p_action text,p_data jsonb,p_action_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.wms_transfers;v_stage text;v_result jsonb;e public.wms_transfer_events;begin
  if nullif(p_action_id,'') is null or length(p_action_id)>150 or p_data is null then raise exception 'Acao invalida.';end if;
  select * into t from public.wms_transfers where id=p_id and warehouse_code=any(private.current_wms_allowed_warehouses())
    and not is_deleted and requires_invoice for update;
  if not found then raise exception 'Transferencia nao encontrada ou nao autorizada.' using errcode='42501';end if;
  select * into e from public.wms_transfer_events where id='expedition:'||p_id||':'||p_action_id and warehouse_code=t.warehouse_code;
  if found then
    if e.user_id<>private.current_wms_profile_id() then raise exception 'Identificador de outra acao.';end if;
    return to_jsonb(t);
  end if;
  if t.expedition_revision is distinct from p_expected_revision then
    raise exception 'Transferencia alterada por outro usuario. Atualize a tela.' using errcode='40001';end if;
  v_stage:=case p_action when 'ASSIGN' then 'ATRIBUIDA' when 'COLLECT' then 'COLETADA' when 'TRANSIT' then 'EM_TRANSITO'
    when 'DELIVER' then case when (p_data->>'boxes')::integer=t.dispatched_boxes and nullif(btrim(p_data->>'reason'),'') is null
      then 'ENTREGUE' else 'ENTREGA_COM_DIVERGENCIA' end when 'RESOLVE' then 'ENTREGUE' end;
  if v_stage is null then raise exception 'Acao de expedicao invalida.';end if;
  update public.wms_transfers set expedition_stage=v_stage,expedition_action_id=p_action_id,
    expedition_responsible_id=case when p_action='ASSIGN' then p_data->>'responsible_id' else expedition_responsible_id end,
    dispatched_boxes=case when p_action='COLLECT' then (p_data->>'boxes')::integer else dispatched_boxes end,
    received_boxes=case when p_action='DELIVER' then (p_data->>'boxes')::integer else received_boxes end,
    delivery_reason=btrim(coalesce(p_data->>'reason','')) where id=p_id returning * into t;
  if not found then raise exception 'Atualizacao bloqueada pelas permissoes.' using errcode='42501';end if;
  -- Reuse fiscal validation, snapshot, PDF and history; both updates share one transaction.
  if p_action='COLLECT' then
    perform public.wms_invoice_action('TRANSFERENCIA',p_id,t.invoice_stage,'DISPATCH','{}',p_action_id||':fiscal');
  elsif p_action='DELIVER' then
    perform public.wms_invoice_action('TRANSFERENCIA',p_id,t.invoice_stage,'RECEIVE','{}',p_action_id||':fiscal');
  end if;
  if p_action='RESOLVE' or (p_action='DELIVER' and v_stage='ENTREGUE') then
    perform public.wms_invoice_action('TRANSFERENCIA',p_id,'RECEBIDA','COMPLETE','{}',p_action_id||':complete');
  end if;
  select to_jsonb(x) into v_result from public.wms_transfers x where id=p_id;
  return v_result;
end $$;
revoke all on function public.wms_expedition_action(text,integer,text,jsonb,text) from public,anon;
grant execute on function public.wms_expedition_action(text,integer,text,jsonb,text) to authenticated;
notify pgrst,'reload schema';
commit;
