-- Outbound packing only. No historical quantities/events are rewritten.
alter table public.wms_transfer_items add column if not exists packing_revision integer not null default 0;
alter table public.wms_transfers add column if not exists packing_audit_version integer not null default 0;
alter table public.wms_transfer_events add column if not exists audit_version integer not null default 0;
alter table public.wms_transfer_events add column if not exists action_id uuid;
alter table public.wms_transfer_events add column if not exists quantity_before numeric;
alter table public.wms_transfer_events add column if not exists quantity_after numeric;
alter table public.wms_transfer_events add column if not exists code_method text;
alter table public.wms_transfer_events add column if not exists quantity_method text;
alter table public.wms_transfer_events add column if not exists box_number text;
create unique index if not exists wms_packing_action_uidx on public.wms_transfer_events(warehouse_code,action_id) where action_id is not null;
create index if not exists wms_packing_history_idx on public.wms_transfer_events(transfer_id,item_id,created_at,id);
create unique index if not exists wms_packing_revision_uidx on public.wms_transfer_events(warehouse_code,transfer_id,item_id,((payload->>'revision_after')::integer)) where audit_version=1 and item_id<>'';
alter table public.wms_transfer_events enable row level security;
revoke all on public.wms_transfer_events from public,anon,authenticated;
grant select on public.wms_transfer_events to authenticated;
drop policy if exists wms_packing_history_read on public.wms_transfer_events;
create policy wms_packing_history_read on public.wms_transfer_events for select to authenticated using(
 private.current_wms_profile_id() is not null and private.current_wms_role() in ('ADMINISTRADOR','SUPERVISOR','OPERADOR')
 and private.can_access_warehouse(warehouse_code)
 and exists(select 1 from public.wms_transfers t where t.id=transfer_id and t.warehouse_code=wms_transfer_events.warehouse_code)
);

create or replace function private.packing_outbound(t public.wms_transfers) returns boolean language sql immutable set search_path='' as $$
 select case when coalesce(nullif(t.flow_type,''),nullif(t.tipo_fluxo,''),nullif(t.tipo_transferencia,''))='CONFERENCIA_XML' then false
 when coalesce(nullif(t.flow_type,''),nullif(t.tipo_fluxo,''),nullif(t.tipo_transferencia,''))='TRANSFERENCIA_EXCEL' then true
 else lower(concat(t.codigo_transferencia,' ',t.nome_transferencia,' ',t.observacao)) not like '%xml%' end
$$;
create or replace function private.packing_box(i public.wms_transfer_items) returns boolean language sql immutable set search_path='' as $$
 select upper(coalesce(nullif(i.tipo_envio,''),i.tipo_quantidade,''))='CAIXA' or upper(coalesce(i.unidade_medida,'')) in ('CX','CAIXA','CAIXAS')
$$;
create or replace function private.packing_units(i public.wms_transfer_items) returns numeric language sql immutable set search_path='' as $$
 select case when not private.packing_box(i) then coalesce(i.quantidade_lacrada,0)
 when coalesce(i.quantidade_lacrada_unidades,0)>0 then i.quantidade_lacrada_unidades
 when coalesce(i.unidades_por_caixa,0)>0 then coalesce(i.quantidade_lacrada,0)*i.unidades_por_caixa
 else coalesce(i.quantidade_lacrada,0) end
$$;
create or replace function private.packing_expected(i public.wms_transfer_items) returns numeric language sql immutable set search_path='' as $$
 select case when private.packing_box(i) then case when coalesce(i.unidades_por_caixa,0)>0 then coalesce(i.quantidade_solicitada,0)*i.unidades_por_caixa else null end else coalesce(i.quantidade_solicitada,0) end
$$;

create or replace function private.guard_packing_event() returns trigger language plpgsql set search_path='' as $$
begin if old.audit_version=1 then raise exception 'Evento de conferência imutável. Registre uma correção.'; end if; return case when tg_op='DELETE' then old else new end; end $$;
drop trigger if exists guard_packing_event on public.wms_transfer_events;
create trigger guard_packing_event before update or delete on public.wms_transfer_events for each row execute function private.guard_packing_event();

create or replace function private.guard_packing_transfer_delete() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.wms_transfer_events where transfer_id=old.id and audit_version=1) then raise exception 'Transferência auditada não pode ser apagada. Preserve o histórico e registre uma correção.';end if;
 return old;
end $$;
drop trigger if exists guard_packing_transfer_delete on public.wms_transfers;
create trigger guard_packing_transfer_delete before delete on public.wms_transfers for each row execute function private.guard_packing_transfer_delete();

-- Deferred consistency checks also protect direct REST writes/old clients: a
-- quantity cannot commit without a matching, server-authored audit event.
create or replace function private.check_packing_item_audit() returns trigger language plpgsql security definer set search_path='' as $$
declare t public.wms_transfers; changed boolean; prior numeric:=0; prior_revision integer:=0;
begin
 select * into t from public.wms_transfers where id=coalesce(new.transfer_id,old.transfer_id);
 if not found or not private.packing_outbound(t) then return null; end if;
 if tg_op='DELETE' then
  if exists(select 1 from public.wms_transfer_events where item_id=old.id and audit_version=1) then raise exception 'Item auditado não pode ser apagado. Remova a quantidade com evento.'; end if; return null;
 end if;
 if tg_op='INSERT' then changed:=coalesce(new.quantidade_lacrada,0)<>0 or coalesce(new.quantidade_lacrada_unidades,0)<>0;
 else
  changed:=row(new.quantidade_lacrada,new.quantidade_lacrada_unidades,new.unidades_por_caixa,new.packing_revision,new.quantidade_enviada,new.diferenca) is distinct from row(old.quantidade_lacrada,old.quantidade_lacrada_unidades,old.unidades_por_caixa,old.packing_revision,old.quantidade_enviada,old.diferenca);
  prior:=private.packing_units(old); prior_revision:=old.packing_revision;
  if private.packing_box(old) and coalesce(old.unidades_por_caixa,0)<=0 and coalesce(old.quantidade_lacrada_unidades,0)<=0 and coalesce(new.unidades_por_caixa,0)>0 then prior:=coalesce(old.quantidade_lacrada,0)*new.unidades_por_caixa;end if;
  if old.packing_revision>0 and row(new.quantidade_solicitada,new.transfer_id,new.warehouse_code,new.sku,new.unidade_medida,new.tipo_quantidade,new.tipo_envio,new.is_extra) is distinct from row(old.quantidade_solicitada,old.transfer_id,old.warehouse_code,old.sku,old.unidade_medida,old.tipo_quantidade,old.tipo_envio,old.is_extra) then raise exception 'Identidade e previsão do item auditado são protegidas.'; end if;
 end if;
 if changed and not exists(select 1 from public.wms_transfer_events e where e.item_id=new.id and e.transfer_id=new.transfer_id and e.warehouse_code=new.warehouse_code and e.audit_version=1 and (e.payload->>'revision_before')::integer=prior_revision and (e.payload->>'revision_after')::integer=new.packing_revision and new.packing_revision=prior_revision+1 and e.quantity_before=prior and e.quantity_after=private.packing_units(new)) then raise exception 'Quantidade sem auditoria transacional. Atualize o WMS e repita pela conferência.'; end if;
 return null;
end $$;
drop trigger if exists check_packing_item_audit on public.wms_transfer_items;
create constraint trigger check_packing_item_audit after insert or update or delete on public.wms_transfer_items deferrable initially deferred for each row execute function private.check_packing_item_audit();

create or replace function private.check_packing_final_audit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if private.packing_outbound(new) and new.status is distinct from old.status and new.status in ('PRONTA_PARA_NOTA','PRONTA_PARA_NOTA_COM_DIVERGENCIA') and not exists(select 1 from public.wms_transfer_events where transfer_id=new.id and audit_version=1 and event_type='FINALIZACAO' and payload->>'transaction_id'=txid_current()::text and payload->>'status'=new.status and created_at>=coalesce(old.packing_started_at,old.lacre_iniciado_em,old.created_at)) then raise exception 'Finalização exige conferência e auditoria transacional.'; end if;
 return null;
end $$;
drop trigger if exists check_packing_final_audit on public.wms_transfers;
create constraint trigger check_packing_final_audit after update on public.wms_transfers deferrable initially deferred for each row execute function private.check_packing_final_audit();

create or replace function private.check_packing_summary() returns trigger language plpgsql security definer set search_path='' as $$
declare expected numeric;packed numeric;
begin
 if old.packing_audit_version>0 and (new.packing_audit_version<old.packing_audit_version or row(new.id,new.warehouse_code,new.flow_type,new.tipo_fluxo,new.tipo_transferencia) is distinct from row(old.id,old.warehouse_code,old.flow_type,old.tipo_fluxo,old.tipo_transferencia)) then raise exception 'A unidade, o fluxo e a versão da auditoria são protegidos.';end if;
 if new.packing_audit_version<1 or not private.packing_outbound(new) then return null;end if;
 if row(new.total_packed_quantity,new.total_enviado,new.total_expected_quantity,new.total_previsto,new.diferenca_total) is not distinct from row(old.total_packed_quantity,old.total_enviado,old.total_expected_quantity,old.total_previsto,old.diferenca_total) then return null;end if;
 select case when bool_or(private.packing_expected(x) is null) then null else sum(private.packing_expected(x)) filter(where not coalesce(x.is_extra,false)) end,
 case when bool_or(private.packing_box(x) and coalesce(x.unidades_por_caixa,0)<=0 and coalesce(x.quantidade_lacrada_unidades,0)<=0 and coalesce(x.quantidade_lacrada,0)>0) then null else sum(private.packing_units(x)) end
 into expected,packed from public.wms_transfer_items x where x.transfer_id=new.id and x.warehouse_code=new.warehouse_code;
 if row(new.total_packed_quantity,new.total_enviado,new.total_expected_quantity,new.total_previsto,new.diferenca_total) is distinct from row(packed,packed,expected,expected,packed-expected) then raise exception 'Resumo incompatível com os itens auditados.';end if;
 return null;
end $$;
drop trigger if exists check_packing_summary on public.wms_transfers;
create constraint trigger check_packing_summary after update on public.wms_transfers deferrable initially deferred for each row execute function private.check_packing_summary();

create or replace function private.apply_wms_packing_action(p_transfer_id text,p_item_id text,p_warehouse text,p_action_id uuid,p_expected_revision integer,p_action jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor text:=private.current_wms_profile_id(); role_name text:=private.current_wms_role(); actor_name text;
 t public.wms_transfers; i public.wms_transfer_items; old_i public.wms_transfer_items; prior public.wms_transfer_events;
 operation text:=p_action->>'operation'; code_method text:=p_action->>'code_method'; quantity_method text;
 qty numeric; units numeric; factor numeric; before_units numeric; after_units numeric; expected numeric; delta numeric;
 raw_code text:=coalesce(p_action->>'raw_code',''); reason text:=trim(coalesce(p_action->>'reason','')); revision integer; reads integer:=0;
 ts timestamptz:=clock_timestamp(); event_id text:='pack-'||p_action_id::text; payload jsonb; final_boxes integer; bad integer:=0; missing_trace integer:=0;
 total_expected numeric; total_packed numeric; total_separated numeric; unknown_count integer; final_status text; item_count integer;
begin
 if auth.uid() is null or actor is null or not coalesce(role_name in ('ADMINISTRADOR','SUPERVISOR','OPERADOR'),false) or not coalesce(private.can_access_warehouse(p_warehouse),false) then raise exception using errcode='42501',message='Conferência não autorizada neste estoque.'; end if;
 if p_action_id is null or jsonb_typeof(p_action) is distinct from 'object' or operation is null or operation not in ('LEITURA_SKU','LEITURA_UNITARIA','QUANTIDADE_MANUAL','AJUSTE_QUANTIDADE','REMOCAO_DA_CAIXA','ITEM_EXTRA','CORRECAO','REVALIDACAO','FINALIZACAO') then raise exception using errcode='22023',message='Ação de conferência inválida.'; end if;
 select * into t from public.wms_transfers where id=p_transfer_id and warehouse_code=p_warehouse for update;
 ts:=clock_timestamp();
 if not found or coalesce(t.is_deleted,false) or not private.packing_outbound(t) or (role_name='OPERADOR' and t.responsavel_id is distinct from actor) then raise exception using errcode='42501',message='Transferência não autorizada para este conferente.'; end if;
 select name into actor_name from public.wms_users where id=actor;
 select * into prior from public.wms_transfer_events where warehouse_code=p_warehouse and action_id=p_action_id;
 if found then
  if prior.transfer_id<>p_transfer_id or prior.user_id<>actor or prior.payload->'request' is distinct from p_action or prior.payload->>'requested_item_id' is distinct from coalesce(p_item_id,'') then raise exception using errcode='22023',message='Identificador reutilizado para outra operação.'; end if;
  select * into i from public.wms_transfer_items where id=prior.item_id and transfer_id=t.id;
  return jsonb_build_object('item',case when i.id is not null then to_jsonb(i) else null end,'transfer',to_jsonb(t),'event',to_jsonb(prior),'replayed',true);
 end if;
 if t.status not in ('SEPARACAO_CONCLUIDA','EM_LACRE','EM_MONTAGEM_CAIXA','CORRECAO_SOLICITADA','EM_CORRECAO') then raise exception using errcode='22023',message='Transferência fora da etapa de montagem/correção.'; end if;
 if length(reason)>1000 or length(raw_code)>128 then raise exception using errcode='22023',message='Observação ou código muito longo.'; end if;

 if operation='FINALIZACAO' then
  if nullif(p_action->>'expected_updated_at','')::timestamptz is distinct from t.updated_at then raise exception using errcode='40001',message='Transferência alterada. Atualize antes de finalizar.'; end if;
  final_boxes:=(p_action->>'final_boxes')::integer;
  if final_boxes is null or final_boxes<0 or final_boxes>100000 then raise exception using errcode='22023',message='Informe a quantidade final de caixas.'; end if;
  if final_boxes=0 and exists(select 1 from public.wms_transfer_items x where x.transfer_id=t.id and private.packing_units(x)>0) then raise exception using errcode='22023',message='Há produtos na caixa. Informe o número de caixas maior que zero.';end if;
  for i in select * from public.wms_transfer_items where transfer_id=t.id and warehouse_code=p_warehouse order by id for update loop
   expected:=private.packing_expected(i);after_units:=private.packing_units(i);
   if expected is null or after_units<>expected or (coalesce(i.is_extra,false) and after_units>0) then bad:=bad+1; end if;
   select * into prior from public.wms_transfer_events e where item_id=i.id and audit_version=1 order by (e.payload->>'revision_after')::integer desc limit 1;
   if not found or prior.quantity_after<>after_units or (prior.payload->>'revision_after')::integer<>i.packing_revision then missing_trace:=missing_trace+1;
   else
    select count(*) into item_count from public.wms_transfer_events where item_id=i.id and audit_version=1;
    if item_count<>i.packing_revision then missing_trace:=missing_trace+1; end if;
    select least(coalesce(min(quantity_after),0),coalesce((array_agg(quantity_before order by (e.payload->>'revision_after')::integer))[1],0)) into units from public.wms_transfer_events e where item_id=i.id and audit_version=1;
    if units>0 then missing_trace:=missing_trace+1; end if;
   end if;
  end loop;
  if bad+missing_trace>0 and (not coalesce((p_action->>'allow_divergence')::boolean,false) or reason='') then raise exception using errcode='22023',message='Há divergência ou histórico incompleto. Revise ou finalize com divergência e motivo.'; end if;
  final_status:=case when bad+missing_trace>0 then 'PRONTA_PARA_NOTA_COM_DIVERGENCIA' else 'PRONTA_PARA_NOTA' end;
  update public.wms_transfers set status=final_status,packing_audit_version=1,total_caixas=final_boxes,final_box_count=final_boxes,total_boxes=final_boxes,
   lacre_concluido_em=ts,packing_finished_at=ts,finalizado_em=ts,total_finished_at=ts,packing_duration_seconds=greatest(0,extract(epoch from ts-coalesce(packing_started_at,lacre_iniciado_em,ts)))::integer,
   has_divergence=bad+missing_trace>0,divergence_count=bad,final_result=final_status,updated_at=ts,last_action_at=ts,last_action_label='Conferência finalizada com auditoria' where id=t.id returning * into t;
  payload:=jsonb_build_object('request',p_action,'requested_item_id',coalesce(p_item_id,''),'status',final_status,'transaction_id',txid_current()::text,'incomplete_items',missing_trace,'divergent_items',bad,'reason',reason,'physical_scanner_proven',false);
  insert into public.wms_transfer_events(id,transfer_id,user_id,user_name,event_type,sku,quantity,payload,input_type,warehouse_code,warehouse_id,created_at,audit_version,action_id,quantity_before,quantity_after,code_method,quantity_method,observation)
  values(event_id,t.id,actor,actor_name,operation,'',0,payload,'FINALIZACAO',p_warehouse,t.warehouse_id,ts,1,p_action_id,0,0,'NAO_IDENTIFICADO','SEM_QUANTIDADE',reason) returning * into prior;
 else
  if code_method is null or code_method not in ('MODO_SCANNER','MANUAL','NAO_IDENTIFICADO') then raise exception using errcode='22023',message='Informe o modo de entrada do código.'; end if;
  if operation='ITEM_EXTRA' then
   if coalesce(p_action->>'sku','')!~'^[A-Za-z0-9._-]{1,64}$' or reason='' then raise exception using errcode='22023',message='Código e motivo do extra obrigatórios.'; end if;
   if exists(select 1 from public.wms_transfer_items where transfer_id=t.id and ltrim(sku,'0')=ltrim(p_action->>'sku','0')) then raise exception using errcode='40001',message='SKU já presente. Atualize a transferência.'; end if;
   insert into public.wms_transfer_items(id,transfer_id,sku,descricao,warehouse_code,warehouse_id,quantidade_solicitada,quantidade_separada,quantidade_lacrada,unidade_medida,tipo_quantidade,is_extra,added_by_id,added_by_name,observation,status)
   values('trfi-'||p_action_id::text,t.id,p_action->>'sku',left(coalesce(p_action->>'description','Item extra'),300),p_warehouse,t.warehouse_id,0,0,0,'UN','UNIDADE',true,actor,actor_name,reason,'EXTRA') returning * into i;
  else
   select * into i from public.wms_transfer_items where id=p_item_id and transfer_id=t.id and warehouse_code=p_warehouse for update;
   if not found then raise exception using errcode='42501',message='Item não encontrado nesta transferência.'; end if;
   if p_expected_revision is distinct from i.packing_revision then raise exception using errcode='40001',message='Item alterado por outro colaborador. Atualize antes de repetir.'; end if;
  end if;
  old_i:=i;revision:=i.packing_revision;before_units:=private.packing_units(i);
  if private.packing_box(i) and coalesce(i.quantidade_lacrada,0)>0 and coalesce(i.unidades_por_caixa,0)<=0 and coalesce(i.quantidade_lacrada_unidades,0)<=0 then
   factor:=(p_action->>'units_per_box')::numeric;
   if operation not in ('CORRECAO','REVALIDACAO') or reason='' or factor is null or factor<=0 or factor<>trunc(factor) then raise exception using errcode='22023',message='Caixas históricas sem conversão exigem correção explícita com motivo e UN/CX.';end if;
   before_units:=coalesce(i.quantidade_lacrada,0)*factor;
  end if;
  if operation in ('LEITURA_SKU','LEITURA_UNITARIA') or coalesce((p_action->>'code_read')::boolean,false) then
   if raw_code='' or (raw_code<>i.sku and not (raw_code~'^[0-9]+$' and i.sku~'^[0-9]+$' and ltrim(raw_code,'0')=ltrim(i.sku,'0'))) then raise exception using errcode='22023',message='Código capturado não corresponde ao SKU deste item.';end if;
  end if;
  if operation in ('AJUSTE_QUANTIDADE','REMOCAO_DA_CAIXA','CORRECAO','REVALIDACAO') and reason='' then raise exception using errcode='22023',message='Informe o motivo do ajuste.'; end if;
  if operation='LEITURA_SKU' then quantity_method:='SEM_QUANTIDADE';reads:=1;
  else
   qty:=(p_action->>'quantity')::numeric;
   if qty is null or qty<0 or qty>1000000 or qty<>trunc(qty) then raise exception using errcode='22023',message='Quantidade inteira não negativa obrigatória.'; end if;
   if operation='LEITURA_UNITARIA' and (private.packing_box(i) or qty<>1 or code_method<>'MODO_SCANNER') then raise exception using errcode='22023',message='Leitura unitária registra uma única unidade UN no modo scanner.'; end if;
   quantity_method:=case when operation='LEITURA_UNITARIA' then 'UNITARIA' when operation in ('QUANTIDADE_MANUAL','ITEM_EXTRA') then 'MANUAL' else 'AJUSTE' end;
   reads:=case when operation='LEITURA_UNITARIA' or coalesce((p_action->>'code_read')::boolean,false) then 1 else 0 end;
   factor:=coalesce(nullif((p_action->>'units_per_box')::numeric,0),nullif(i.unidades_por_caixa,0),0);
   if factor<0 or factor>1000000 or factor<>trunc(factor) then raise exception using errcode='22023',message='Conversão UN/CX inválida.'; end if;
   if private.packing_box(i) then
    if coalesce((p_action->>'mixed')::boolean,false) then units:=(p_action->>'units')::numeric;if qty>0 and (units is null or units<=0 or units<>trunc(units)) then raise exception using errcode='22023',message='Informe o total real em unidades da caixa mista.'; end if;
    else if factor<=0 and qty>0 then raise exception using errcode='22023',message='Informe unidades por caixa.'; end if;units:=qty*factor;end if;
   else units:=qty;end if;
   if operation in ('QUANTIDADE_MANUAL','LEITURA_UNITARIA','ITEM_EXTRA') then
    i.quantidade_lacrada:=coalesce(i.quantidade_lacrada,0)+qty;after_units:=before_units+coalesce(units,0);
   else i.quantidade_lacrada:=qty;after_units:=coalesce(units,0);end if;
   if private.packing_box(i) then i.unidades_por_caixa:=factor;i.quantidade_lacrada_unidades:=after_units;i.embalagem_observacao:=case when coalesce((p_action->>'mixed')::boolean,false) then 'Caixas com quantidades diferentes' else coalesce(i.embalagem_observacao,'') end;end if;
  end if;
  after_units:=case when operation='LEITURA_SKU' then before_units else after_units end;delta:=after_units-before_units;expected:=private.packing_expected(i);
  i.packing_revision:=revision+1;
  if operation<>'LEITURA_SKU' then
   i.quantidade_enviada:=after_units;i.diferenca:=after_units-expected;i.quantidade_total_unidades:=expected;
   i.quantidade_faltante:=case when expected is null then null else greatest(0,expected-after_units) end;i.quantidade_excedente:=case when expected is null then null else greatest(0,after_units-expected) end;
   i.status:=case when i.is_extra then case when after_units>0 then 'EXTRA' else 'REMOVIDO' end when i.quantidade_lacrada=0 then 'NAO_ATENDIDO' when i.quantidade_lacrada>=coalesce(i.quantidade_separada,0) then 'ENVIADO' else 'EM_CAIXA' end;
   i.divergence_type:=case when i.is_extra and after_units>0 then 'ITEM_EXTRA' when expected is null then 'CONVERSAO_INDEFINIDA' when after_units<expected then 'FALTA_DE_ITEM' when after_units>expected then 'QUANTIDADE_EXCEDENTE' else '' end;
   i.has_divergence:=coalesce(i.is_extra,false) and after_units>0 or expected is null or after_units<>expected;
   i.input_type:=code_method;if reason<>'' then i.observation:=reason;end if;
  end if;
  i.updated_at:=ts;
  update public.wms_transfer_items set quantidade_lacrada=i.quantidade_lacrada,quantidade_lacrada_unidades=i.quantidade_lacrada_unidades,unidades_por_caixa=i.unidades_por_caixa,quantidade_total_unidades=i.quantidade_total_unidades,quantidade_enviada=i.quantidade_enviada,diferenca=i.diferenca,quantidade_faltante=i.quantidade_faltante,quantidade_excedente=i.quantidade_excedente,status=i.status,divergence_type=i.divergence_type,has_divergence=i.has_divergence,input_type=i.input_type,observation=i.observation,embalagem_observacao=i.embalagem_observacao,packing_revision=i.packing_revision,updated_at=ts where id=i.id;
  payload:=jsonb_build_object('request',p_action,'requested_item_id',coalesce(p_item_id,''),'raw_code',raw_code,'code_reads',reads,'revision_before',revision,'revision_after',revision+1,'quantity_packages_before',old_i.quantidade_lacrada,'quantity_packages_after',i.quantidade_lacrada,'physical_scanner_proven',false,'reason',reason,'units','UN');
  insert into public.wms_transfer_events(id,transfer_id,item_id,user_id,user_name,event_type,sku,quantity,payload,input_type,warehouse_code,warehouse_id,created_at,audit_version,action_id,quantity_before,quantity_after,code_method,quantity_method,box_number,observation)
  values(event_id,t.id,i.id,actor,actor_name,operation,i.sku,delta,payload,code_method,p_warehouse,t.warehouse_id,ts,1,p_action_id,before_units,after_units,code_method,quantity_method,left(p_action->>'box_number',80),reason) returning * into prior;
  if operation<>'LEITURA_SKU' then
   update public.wms_transfer_divergences set resolved=true,resolved_by=actor,resolved_at=ts where transfer_id=t.id and item_id=i.id and warehouse_code=p_warehouse and not coalesce(resolved,false);
   if coalesce(i.has_divergence,false) then insert into public.wms_transfer_divergences(id,transfer_id,item_id,sku,descricao,divergence_type,expected_quantity,informed_quantity,difference_quantity,user_id,user_name,input_type,observation,warehouse_code,warehouse_id)
   values('pack-div-'||p_action_id::text,t.id,i.id,i.sku,i.descricao,i.divergence_type,expected,after_units,after_units-expected,actor,actor_name,code_method,reason,p_warehouse,t.warehouse_id);end if;
  end if;
 end if;
 -- Canonical summaries in comparable UN only; unknown conversions stay NULL.
 select count(*),count(*) filter(where private.packing_expected(x) is null),sum(private.packing_expected(x)) filter(where not coalesce(x.is_extra,false)),sum(private.packing_units(x)),sum(case when private.packing_box(x) then x.quantidade_separada*nullif(x.unidades_por_caixa,0) else x.quantidade_separada end)
 into item_count,unknown_count,total_expected,total_packed,total_separated from public.wms_transfer_items x where x.transfer_id=t.id and x.warehouse_code=p_warehouse;
 if unknown_count>0 then total_expected:=null;total_separated:=null;end if;
 if exists(select 1 from public.wms_transfer_items x where x.transfer_id=t.id and private.packing_box(x) and coalesce(x.unidades_por_caixa,0)<=0 and coalesce(x.quantidade_lacrada_unidades,0)<=0 and coalesce(x.quantidade_lacrada,0)>0) then total_packed:=null;end if;
 update public.wms_transfers set packing_audit_version=1,total_items=item_count,total_skus=item_count,total_expected_quantity=total_expected,total_previsto=total_expected,total_separated_quantity=total_separated,total_packed_quantity=total_packed,total_enviado=total_packed,diferenca_total=total_packed-total_expected,updated_at=ts,last_action_at=ts,last_action_label=operation where id=t.id returning * into t;
 return jsonb_build_object('item',case when operation<>'FINALIZACAO' then to_jsonb(i) else null end,'transfer',to_jsonb(t),'event',to_jsonb(prior),'replayed',false);
end $$;
revoke all on function private.apply_wms_packing_action(text,text,text,uuid,integer,jsonb) from public,anon;
grant execute on function private.apply_wms_packing_action(text,text,text,uuid,integer,jsonb) to authenticated;
create or replace function public.apply_wms_packing_action(p_transfer_id text,p_item_id text,p_warehouse text,p_action_id uuid,p_expected_revision integer,p_action jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.apply_wms_packing_action(p_transfer_id,p_item_id,p_warehouse,p_action_id,p_expected_revision,p_action) $$;
revoke all on function public.apply_wms_packing_action(text,text,text,uuid,integer,jsonb) from public,anon;
grant execute on function public.apply_wms_packing_action(text,text,text,uuid,integer,jsonb) to authenticated;
