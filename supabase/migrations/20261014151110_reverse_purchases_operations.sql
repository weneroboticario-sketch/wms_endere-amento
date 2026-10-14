create or replace function private.wms_reverse_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare v_id text:=private.current_wms_profile_id(); v_name text; v_role text:=private.current_wms_role(); begin
  select name into v_name from public.wms_users where id=v_id;
  if v_role not in ('ADMINISTRADOR','SUPERVISOR','OPERADOR','COMPRAS') then raise exception 'Perfil sem permissao de alteracao.' using errcode='42501'; end if;
  if tg_table_name='wms_reverse_logistics_monthly_targets' then
    if v_role='OPERADOR' and new.unit_code is distinct from (select coalesce(default_warehouse_code,warehouse_code) from public.wms_users where id=v_id) then
      raise exception 'A unidade pode alterar somente sua propria meta.';
    end if;
    select name into new.unit_name from public.wms_warehouses where code=new.unit_code and active;
    if new.unit_name is null then raise exception 'Unidade invalida.';end if;
    new.updated_by_id:=v_id; new.updated_by_name:=v_name; new.updated_at:=now(); return new;
  end if;
  new.gdv_number:=btrim(new.gdv_number); new.nfe_number:=btrim(new.nfe_number);
  new.gdv_normalized:=upper(regexp_replace(new.gdv_number,'\s+','','g'));
  new.nfe_normalized:=upper(regexp_replace(new.nfe_number,'\s+','','g'));
  if tg_op='INSERT' then
    new.created_by_id:=v_id;new.created_by_name:=v_name;
    new.responsible_id:=v_id;new.responsible_name:=v_name;
    new.status:='REGISTRADA';new.counted_at:=null;
    new.competence_month:=date_trunc('month',now() at time zone 'America/Cuiaba')::date;
  else
    new.counted_at:=old.counted_at;new.sent_at:=old.sent_at;new.received_at:=old.received_at;new.finished_at:=old.finished_at;
    new.created_by_name:=old.created_by_name;new.created_at:=old.created_at;
    new.responsible_id:=old.responsible_id;new.responsible_name:=old.responsible_name;
    new.status_changed_at:=old.status_changed_at;
    if new.warehouse_code is distinct from old.warehouse_code or new.competence_month is distinct from old.competence_month
      or new.created_by_id is distinct from old.created_by_id or new.idempotency_key is distinct from old.idempotency_key then
      raise exception 'Unidade, competencia e autor sao imutaveis.';
    end if;
    if (new.box_quantity,new.gdv_number,new.nfe_number) is distinct from (old.box_quantity,old.gdv_number,old.nfe_number)
      and old.status not in ('REGISTRADA','AGUARDANDO_ENVIO','DIVERGENCIA') then raise exception 'Reabra antes de alterar o processo.'; end if;
    if new.status is distinct from old.status then
      if not ((old.status='REGISTRADA' and new.status in ('AGUARDANDO_ENVIO','ENVIADA','CANCELADA','DIVERGENCIA'))
        or(old.status='AGUARDANDO_ENVIO' and new.status in ('ENVIADA','CANCELADA','DIVERGENCIA'))
        or(old.status='ENVIADA' and new.status in ('RECEBIDA','CANCELADA','DIVERGENCIA'))
        or(old.status='RECEBIDA' and new.status in ('CONCLUIDA','CANCELADA','DIVERGENCIA'))
        or(old.status='DIVERGENCIA' and new.status in ('AGUARDANDO_ENVIO','ENVIADA','CANCELADA'))
        or(v_role in ('ADMINISTRADOR','SUPERVISOR') and new.status='DIVERGENCIA' and new.fiscal_reason<>'')) then raise exception 'Transicao de logistica reversa invalida.'; end if;
      if new.status in ('CANCELADA','DIVERGENCIA') and btrim(new.fiscal_reason)='' then raise exception 'Informe o motivo.'; end if;
      new.status_changed_at:=now();
      if old.status in ('CANCELADA','CONCLUIDA') and new.status='DIVERGENCIA' then new.counted_at:=null;end if;
      if new.status='ENVIADA' then new.sent_at:=coalesce(old.sent_at,now());new.counted_at:=coalesce(old.counted_at,now());end if;
      if new.status='RECEBIDA' then new.received_at:=now();end if;
      if new.status='CONCLUIDA' then new.finished_at:=now();end if;
    end if;
    if new.is_deleted and not old.is_deleted then
      if v_role not in ('ADMINISTRADOR','SUPERVISOR') or btrim(new.fiscal_reason)='' then raise exception 'Arquivamento exige gestor e motivo.';end if;
      new.deleted_at:=now();new.deleted_by_id:=v_id;new.deleted_by_name:=v_name;
    end if;
  end if;
  new.unit_origin_code:=new.warehouse_code;
  select name into new.unit_origin_name from public.wms_warehouses where code=new.warehouse_code and active;
  if new.unit_origin_name is null then raise exception 'Unidade de origem invalida.';end if;
  new.updated_at:=now(); return new;
end $$;
alter policy reverse_update on public.wms_reverse_logistics
using (
  warehouse_code=any((select private.current_wms_allowed_warehouses())::text[])
  and (select private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','OPERADOR','COMPRAS']))
)
with check (warehouse_code=any((select private.current_wms_allowed_warehouses())::text[]));
alter policy reverse_insert on public.wms_reverse_logistics_monthly_targets
with check (
  unit_code=any((select private.current_wms_allowed_warehouses())::text[])
  and (select private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','OPERADOR','COMPRAS']))
);
alter policy reverse_update on public.wms_reverse_logistics_monthly_targets
using (
  unit_code=any((select private.current_wms_allowed_warehouses())::text[])
  and (select private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','OPERADOR','COMPRAS']))
)
with check (unit_code=any((select private.current_wms_allowed_warehouses())::text[]));
alter policy reverse_purchase_creation_history on public.wms_history
with check (
  warehouse_code=any((select private.current_wms_allowed_warehouses())::text[])
  and (select private.current_wms_role())='COMPRAS'
  and action='Logistica Reversa'
  and exists (
    select 1 from public.wms_reverse_logistics r
    where r.warehouse_code=wms_history.warehouse_code
      and wms_history.id='reverse:'||r.id||':'||coalesce(r.client_action_id,'created')
  )
);
notify pgrst,'reload schema';
