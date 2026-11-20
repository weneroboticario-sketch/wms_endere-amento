-- Only authorized, unique GTIN mappings are accepted for transfer packing.
-- Never assume a SKU from a GTIN substring or accept an ambiguous cross-warehouse code.
create or replace function private.wms_transfer_scan_matches(p_warehouse text,p_raw_code text,p_sku text)
returns boolean language plpgsql stable security invoker set search_path='' as $wms$
declare matches jsonb;
begin
 if p_raw_code=p_sku or
    (p_raw_code~'^[0-9]+$' and p_sku~'^[0-9]+$' and ltrim(p_raw_code,'0')=ltrim(p_sku,'0')) then
   return true;
 end if;
 if not private.wms_valid_gtin(p_raw_code) then return false; end if;
 matches:=private.lookup_wms_sku_photo(p_warehouse,p_raw_code,'GTIN');
 if jsonb_typeof(matches) is distinct from 'array' or jsonb_array_length(matches)<>1 then return false;end if;
 return ltrim(coalesce(matches->0->>'sku',''),'0')=ltrim(coalesce(p_sku,''),'0');
end;
$wms$;
revoke all on function private.wms_transfer_scan_matches(text,text,text) from public,anon;
grant execute on function private.wms_transfer_scan_matches(text,text,text) to authenticated;

-- Preserve the existing idempotent, revision-checked and warehouse-scoped packing RPC.
CREATE OR REPLACE FUNCTION private.apply_wms_packing_action(p_transfer_id text, p_item_id text, p_warehouse text, p_action_id uuid, p_expected_revision integer, p_action jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
   if raw_code='' or not private.wms_transfer_scan_matches(p_warehouse,raw_code,i.sku) then raise exception using errcode='22023',message='Código capturado não corresponde ao SKU deste item ou EAN não vinculado a este estoque.';end if;
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
end $function$;
