begin;
-- Administrators may explicitly create purchases requests without changing their profile.
create or replace function private.wms_invoice_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare
  v_role text:=private.current_wms_role(); v_old jsonb; v_new jsonb:=to_jsonb(new);
  v_stage text; v_previous text; v_snapshot jsonb; v_boxes numeric; v_meta jsonb;
  v_allowed text[]:=array['invoice_stage','invoice_number','invoice_key','invoice_file_path','invoice_file_name','invoice_file_size',
    'invoice_uploaded_at','invoice_uploaded_by_id','invoice_uploaded_by_name','fiscal_reason','fiscal_revision',
    'status','status_changed_at','updated_at','invoice_last_action_id','invoice_snapshot','invoice_released_at'];
begin
  if tg_op='INSERT' then
    new.request_origin:=case when v_role='COMPRAS' or (v_role='ADMINISTRADOR' and new.request_origin='COMPRAS') then 'COMPRAS' else 'ESTOQUE' end;
    new.requires_invoice:=new.request_origin='COMPRAS'; new.invoice_stage:='';
    new.status_changed_at:=now(); return new;
  end if;
  v_old:=to_jsonb(old); v_new:=to_jsonb(new);
  if new.request_origin is distinct from old.request_origin or new.requires_invoice is distinct from old.requires_invoice then
    raise exception 'A origem da solicitacao nao pode ser alterada.' using errcode='42501';
  end if;
  if v_role='COMPRAS' and (v_new-v_allowed) is distinct from (v_old-v_allowed) then
    raise exception 'Compras nao pode alterar itens, quantidades, responsavel, destino ou caixas.' using errcode='42501';
  end if;
  if not old.requires_invoice then return new; end if;
  if new.warehouse_code is distinct from old.warehouse_code then
    raise exception 'A unidade do processo fiscal nao pode ser alterada.' using errcode='42501';
  end if;
  v_previous:=old.invoice_stage; v_stage:=new.invoice_stage;
  if (new.invoice_file_path,new.invoice_number,new.invoice_key,new.invoice_file_name) is distinct from
    (old.invoice_file_path,old.invoice_number,old.invoice_key,old.invoice_file_name)
    and v_role not in ('COMPRAS','ADMINISTRADOR','SUPERVISOR') then
    raise exception 'Documento fiscal sob responsabilidade de Compras.' using errcode='42501';
  end if;
  new.sent_at:=old.sent_at;new.received_at:=old.received_at;new.invoice_released_at:=old.invoice_released_at;
  if v_stage is distinct from v_previous then
    if v_stage='DESPACHADA' then new.sent_at:=now(); end if;
    if v_stage='RECEBIDA' then new.received_at:=now(); end if;
    if v_stage='LIBERADA_PARA_ENVIO' then new.invoice_released_at:=now(); end if;
  end if;
  if new.invoice_file_path=old.invoice_file_path then
    new.invoice_uploaded_at:=old.invoice_uploaded_at;new.invoice_uploaded_by_id:=old.invoice_uploaded_by_id;
    new.invoice_uploaded_by_name:=old.invoice_uploaded_by_name;
  end if;
  if v_previous not in ('','CORRECAO_SOLICITADA') and v_stage=v_previous and new.status is distinct from old.status then
    raise exception 'Utilize uma transicao fiscal para alterar o processo.';
  end if;
  if v_role='COMPRAS' and new.status is distinct from old.status then
    if (tg_table_name='wms_transfers' and not (v_stage in ('NF_EM_PREPARACAO','NF_ANEXADA','LIBERADA_PARA_ENVIO','CORRECAO_SOLICITADA') and new.status=v_stage))
      or (tg_table_name='wms_replenishment_requests' and not(v_stage='CORRECAO_SOLICITADA' and new.status='EM_SEPARACAO')) then
      raise exception 'Compras nao pode mudar o status operacional.';
    end if;
  end if;
  if new.invoice_snapshot is distinct from old.invoice_snapshot and v_stage<>'CORRECAO_SOLICITADA' then
    raise exception 'A fotografia da conferencia e mantida pelo estoque.';
  end if;
  if tg_table_name='wms_transfers' and new.status in ('PRONTA_PARA_NOTA','PRONTA_PARA_NOTA_COM_DIVERGENCIA')
    and old.status is distinct from new.status then v_stage:='PRONTA_PARA_NOTA'; end if;
  if v_stage='PRONTA_PARA_NOTA' and v_stage is distinct from v_previous then
    if v_role not in ('ADMINISTRADOR','SUPERVISOR','OPERADOR') then raise exception 'Somente Estoque pode concluir a conferencia.'; end if;
    if v_previous not in ('','CORRECAO_SOLICITADA') then raise exception 'Etapa fiscal invalida.'; end if;
    if tg_table_name='wms_transfers' then
      v_boxes:=coalesce(nullif((v_new->>'final_box_count')::numeric,0),nullif((v_new->>'total_boxes')::numeric,0),(v_new->>'total_caixas')::numeric,0);
      if coalesce(v_new->>'separacao_concluida_em',v_new->>'separation_finished_at','')='' then raise exception 'Conclua a separacao antes da NF.'; end if;
      if exists(select 1 from public.wms_transfer_items i where i.transfer_id=new.id and i.warehouse_code=new.warehouse_code
        and (i.quantidade_lacrada<0 or i.quantidade_separada<0 or i.quantidade_lacrada>i.quantidade_separada)) then
        raise exception 'Quantidades de conferencia inconsistentes.';
      end if;
      select jsonb_agg(jsonb_build_object('id',q.id,'sku',q.sku,'requested',q.requested,
        'separated',q.separated,'checked',q.checked,
        'difference',q.checked-q.requested,'observation',q.observation) order by q.id)
      into v_snapshot from (
        select i.id,i.sku,i.observation,
          i.quantidade_solicitada*case when i.tipo_quantidade='CAIXA' then coalesce(nullif((to_jsonb(i)->>'unidades_por_caixa')::numeric,0),1) else 1 end requested,
          i.quantidade_separada separated,
          case when coalesce(v_new->>'flow_type',v_new->>'tipo_fluxo','')='CONFERENCIA_XML' then i.quantidade_separada
            when i.tipo_quantidade='CAIXA' then i.quantidade_lacrada_unidades else i.quantidade_lacrada end checked
        from public.wms_transfer_items i where i.transfer_id=new.id and i.warehouse_code=new.warehouse_code and i.status<>'REMOVIDO'
      ) q;
    else
      v_boxes:=(v_new->>'invoice_box_count')::numeric;
      if new.status not in ('SEPARADO','ATENDIDO_PARCIAL') or (v_new->>'quantidade_atendida')::numeric<=0
        or (v_new->>'invoice_checked_quantity')::numeric is distinct from (v_new->>'quantidade_atendida')::numeric then
        raise exception 'Confira a quantidade atendida e informe as caixas antes da NF.';
      end if;
      v_snapshot:=jsonb_build_array(jsonb_build_object('id',new.id,'sku',v_new->>'codigo_material',
        'requested',(v_new->>'quantidade_solicitada')::numeric,'separated',(v_new->>'quantidade_atendida')::numeric,
        'checked',(v_new->>'invoice_checked_quantity')::numeric,
        'difference',(v_new->>'quantidade_atendida')::numeric-(v_new->>'quantidade_solicitada')::numeric));
    end if;
    if v_boxes is null or v_boxes<1 or v_boxes<>trunc(v_boxes) or v_snapshot is null
      or not exists(select 1 from jsonb_array_elements(v_snapshot) x where (x->>'checked')::numeric>0) then
      raise exception 'Informe caixas inteiras e positivas e conclua a conferencia.';
    end if;
    new.invoice_snapshot:=v_snapshot;
    -- The fiscal phase continues after the operational packing milestone.
    new.finished_at:=null;
  end if;
  if v_previous in ('PRONTA_PARA_NOTA','NF_EM_PREPARACAO','NF_ANEXADA','LIBERADA_PARA_ENVIO','DESPACHADA','RECEBIDA','FINALIZADA')
    and v_stage<>'CORRECAO_SOLICITADA' then
    if tg_table_name='wms_transfers' and (v_new->'destino_id',v_new->'destino_codigo_loja',v_new->'total_caixas',v_new->'final_box_count',v_new->'total_boxes')
      is distinct from (v_old->'destino_id',v_old->'destino_codigo_loja',v_old->'total_caixas',v_old->'final_box_count',v_old->'total_boxes') then
      raise exception 'Destino e caixas estao bloqueados. Solicite correcao.';
    elsif tg_table_name='wms_replenishment_requests' and (v_new->'codigo_material',v_new->'quantidade_solicitada',v_new->'quantidade_atendida',v_new->'invoice_box_count',v_new->'invoice_checked_quantity')
      is distinct from (v_old->'codigo_material',v_old->'quantidade_solicitada',v_old->'quantidade_atendida',v_old->'invoice_box_count',v_old->'invoice_checked_quantity') then
      raise exception 'Quantidades conferidas estao bloqueadas. Solicite correcao.';
    end if;
  end if;
  if v_stage is distinct from v_previous then
    if not ((v_previous in ('','CORRECAO_SOLICITADA') and v_stage='PRONTA_PARA_NOTA')
      or (v_previous='PRONTA_PARA_NOTA' and v_stage='NF_EM_PREPARACAO')
      or (v_previous in ('PRONTA_PARA_NOTA','NF_EM_PREPARACAO','NF_ANEXADA') and v_stage='NF_ANEXADA')
      or (v_previous='NF_ANEXADA' and v_stage='LIBERADA_PARA_ENVIO')
      or (v_previous='LIBERADA_PARA_ENVIO' and v_stage='DESPACHADA')
      or (v_previous='DESPACHADA' and v_stage='RECEBIDA')
      or (v_previous='RECEBIDA' and v_stage='FINALIZADA')
      or (v_stage='CORRECAO_SOLICITADA' and nullif(btrim(new.fiscal_reason),'') is not null
        and (v_role in ('ADMINISTRADOR','SUPERVISOR') or (v_role='COMPRAS' and v_previous in ('PRONTA_PARA_NOTA','NF_EM_PREPARACAO','NF_ANEXADA'))))) then
      raise exception 'Transicao fiscal invalida: % -> %',v_previous,v_stage;
    end if;
    if v_stage in ('NF_EM_PREPARACAO','NF_ANEXADA','LIBERADA_PARA_ENVIO') and v_role not in ('COMPRAS','ADMINISTRADOR','SUPERVISOR') then
      raise exception 'Etapa sob responsabilidade de Compras.' using errcode='42501';
    end if;
    if v_stage in ('DESPACHADA','RECEBIDA','FINALIZADA') and v_role not in ('ADMINISTRADOR','SUPERVISOR','OPERADOR') then
      raise exception 'Etapa sob responsabilidade do Estoque.' using errcode='42501';
    end if;
    new.fiscal_revision:=old.fiscal_revision+1; new.status_changed_at:=now();
  end if;
  if v_stage in ('NF_ANEXADA','LIBERADA_PARA_ENVIO') then
    if nullif(btrim(new.invoice_number),'') is null or new.invoice_file_path not like new.warehouse_code||'/'||tg_table_name||'/'||new.id||'/%.pdf' then
      raise exception 'Numero da NFe e PDF do processo obrigatorios.';
    end if;
    select metadata into v_meta from storage.objects where bucket_id='wms-transfer-invoices' and name=new.invoice_file_path;
    if v_meta is null or coalesce(v_meta->>'mimetype','')<>'application/pdf'
      or coalesce((v_meta->>'size')::bigint,0)<=0 or (v_meta->>'size')::bigint>10485760 then
      raise exception 'PDF privado invalido, ausente ou maior que 10 MB.';
    end if;
    if tg_table_name='wms_transfers' and v_stage='LIBERADA_PARA_ENVIO' and exists(
      select 1 from public.wms_transfer_divergences where transfer_id=new.id and warehouse_code=new.warehouse_code and coalesce(resolved,false)=false
    ) then raise exception 'Resolva as divergencias impeditivas antes de liberar.'; end if;
    new.invoice_file_size:=(v_meta->>'size')::bigint;
  end if;
  if v_previous in ('LIBERADA_PARA_ENVIO','DESPACHADA','RECEBIDA','FINALIZADA')
    and v_stage<>'CORRECAO_SOLICITADA' and (new.invoice_file_path,new.invoice_number,new.invoice_key) is distinct from (old.invoice_file_path,old.invoice_number,old.invoice_key) then
    raise exception 'Reabra com justificativa antes de substituir a NF.';
  end if;
  if new.invoice_file_path is distinct from old.invoice_file_path and v_stage=v_previous then
    new.fiscal_revision:=old.fiscal_revision+1;
  end if;
  if new.invoice_file_path is distinct from old.invoice_file_path and new.invoice_file_path<>'' then
    new.invoice_uploaded_at:=now(); new.invoice_uploaded_by_id:=private.current_wms_profile_id();
    select name into new.invoice_uploaded_by_name from public.wms_users where id=private.current_wms_profile_id();
  end if;
  if new.status in ('FINALIZADA','CONCLUIDO','ENTREGUE_NA_LOJA') and v_stage<>'FINALIZADA' then
    raise exception 'Conclua o recebimento e o fluxo fiscal antes de finalizar.';
  end if;
  new.invoice_stage:=v_stage; new.updated_at:=now(); return new;
end $$;
insert into public.wms_schema_version(id,version,description,applied_at,applied_by)
values('current','2026.10.14.003','Administrador pode criar pedido de Compras com NF',now(),'admin-purchases-mode')
on conflict(id) do update set version=excluded.version,description=excluded.description,applied_at=excluded.applied_at,applied_by=excluded.applied_by;
notify pgrst,'reload schema';
commit;
