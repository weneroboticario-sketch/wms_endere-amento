begin;
-- Allow one narrowly scoped cancellation transition; preserve fiscal and stock data.
do $patch$
declare definition text; updated text;
begin
  definition:=replace(pg_get_functiondef('private.wms_invoice_guard()'::regprocedure),chr(13),'');
  updated:=replace(definition,
    'v_old:=to_jsonb(old); v_new:=to_jsonb(new);',
    $guard$v_old:=to_jsonb(old); v_new:=to_jsonb(new);
  if tg_table_name='wms_transfers' and new.status='CANCELADA' and old.status is distinct from 'CANCELADA' then
    if v_role not in ('ADMINISTRADOR','SUPERVISOR','COMPRAS')
      or not coalesce(old.warehouse_code=any(private.current_wms_allowed_warehouses()),false) then
      raise exception 'Cancelamento nao autorizado.' using errcode='42501';
    end if;
    if not old.requires_invoice or old.is_deleted or old.invoice_stage='FINALIZADA'
      or old.expedition_stage='ENTREGUE' or old.status in ('CANCELADO','ARQUIVADA_POR_UNIFICACAO','FINALIZADA') then
      raise exception 'Transferencia encerrada ou fora do fluxo de expedicao.';
    end if;
    if length(btrim(coalesce(new.fiscal_reason,'')))<5 or length(new.fiscal_reason)>4000 then
      raise exception 'Informe justificativa entre 5 e 4000 caracteres.';
    end if;
    if (v_new-array['status','fiscal_reason','fiscal_revision','updated_at'])
      is distinct from (v_old-array['status','fiscal_reason','fiscal_revision','updated_at']) then
      raise exception 'Cancelamento deve preservar NF, itens, caixas e etapas.';
    end if;
    new.fiscal_revision:=old.fiscal_revision+1;new.updated_at:=now();return new;
  end if;$guard$);
  if updated=definition then raise exception 'Guard fiscal diferente do esperado.';end if;
  execute updated;
  definition:=pg_get_functiondef('public.wms_expedition_action(text,integer,text,jsonb,text)'::regprocedure);
  updated:=replace(definition,
    'and not is_deleted and requires_invoice for update;',
    'and not is_deleted and requires_invoice and status not in (''CANCELADA'',''CANCELADO'',''ARQUIVADA_POR_UNIFICACAO'') for update;');
  if updated=definition then raise exception 'RPC de expedicao diferente do esperado.';end if;
  execute updated;
end $patch$;

create or replace function public.wms_cancel_expedition_transfer(
  p_id text,p_expected_revision integer,p_expected_fiscal_revision integer,p_reason text,p_action_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.wms_transfers;actor text:=private.current_wms_profile_id();actor_name text;event_id text;
begin
  if actor is null or private.current_wms_role() not in ('ADMINISTRADOR','SUPERVISOR','COMPRAS') then
    raise exception 'Cancelamento nao autorizado.' using errcode='42501';
  end if;
  if length(btrim(coalesce(p_reason,'')))<5 or length(p_reason)>4000
    or nullif(btrim(p_action_id),'') is null or length(p_action_id)>150 then
    raise exception 'Informe justificativa entre 5 e 4000 caracteres e identificador valido.';
  end if;
  select * into t from public.wms_transfers where id=p_id and requires_invoice and not is_deleted
    and warehouse_code=any(private.current_wms_allowed_warehouses()) for update;
  if not found then raise exception 'Transferencia nao encontrada ou nao autorizada.' using errcode='42501';end if;
  event_id:='expedition-cancel:'||t.id||':'||p_action_id;
  if exists(select 1 from public.wms_transfer_events where id=event_id and transfer_id=t.id
    and warehouse_code=t.warehouse_code and user_id=actor and details=btrim(p_reason)) then return to_jsonb(t);end if;
  if t.expedition_revision is distinct from p_expected_revision or t.fiscal_revision is distinct from p_expected_fiscal_revision then
    raise exception 'Transferencia alterada por outro usuario. Atualize a tela.' using errcode='40001';
  end if;
  if t.status in ('CANCELADA','CANCELADO','ARQUIVADA_POR_UNIFICACAO','FINALIZADA')
    or t.invoice_stage='FINALIZADA' or t.expedition_stage='ENTREGUE' then
    raise exception 'Transferencia ja cancelada ou encerrada.';
  end if;
  update public.wms_transfers set status='CANCELADA',fiscal_reason=btrim(p_reason),updated_at=now()
    where id=t.id and warehouse_code=t.warehouse_code returning * into t;
  if not found then raise exception 'Cancelamento bloqueado pelas permissoes.' using errcode='42501';end if;
  select name into actor_name from public.wms_users where id=actor;
  insert into public.wms_transfer_events(id,transfer_id,warehouse_code,user_id,user_name,event_type,details,payload)
    values(event_id,t.id,t.warehouse_code,actor,actor_name,'EXPEDITION_CANCELLED',btrim(p_reason),
      jsonb_build_object('invoice_number',t.invoice_number,'expedition_stage',t.expedition_stage,
        'dispatched_boxes',t.dispatched_boxes,'received_boxes',t.received_boxes,'fiscal_revision',t.fiscal_revision));
  return to_jsonb(t);
end $$;
revoke all on function public.wms_cancel_expedition_transfer(text,integer,integer,text,text) from public,anon;
grant execute on function public.wms_cancel_expedition_transfer(text,integer,integer,text,text) to authenticated;
notify pgrst,'reload schema';
commit;

