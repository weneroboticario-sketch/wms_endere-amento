begin;
do $$ declare t text; begin
  foreach t in array array['wms_transfers','wms_replenishment_requests'] loop
    execute format('alter table public.%I
      add column if not exists request_origin text not null default ''LEGADO'',
      add column if not exists requires_invoice boolean not null default false,
      add column if not exists invoice_stage text not null default '''',
      add column if not exists invoice_number text not null default '''',
      add column if not exists invoice_key text not null default '''',
      add column if not exists invoice_file_path text not null default '''',
      add column if not exists invoice_file_name text not null default '''',
      add column if not exists invoice_file_size bigint,
      add column if not exists invoice_uploaded_at timestamptz,
      add column if not exists invoice_released_at timestamptz,
      add column if not exists invoice_uploaded_by_id text,
      add column if not exists invoice_uploaded_by_name text,
      add column if not exists invoice_snapshot jsonb,
      add column if not exists fiscal_reason text not null default '''',
      add column if not exists fiscal_revision integer not null default 0,
      add column if not exists invoice_last_action_id text,
      add column if not exists status_changed_at timestamptz,
      add column if not exists sent_at timestamptz,
      add column if not exists received_at timestamptz',t);
    if not exists(select 1 from pg_constraint where conname=t||'_origin_check') then
      execute format('alter table public.%I add constraint %I check(request_origin in (''LEGADO'',''ESTOQUE'',''COMPRAS''))',t,t||'_origin_check');
    end if;
    execute format('create index if not exists %I on public.%I(warehouse_code,invoice_stage,updated_at) where requires_invoice and not is_deleted',t||'_fiscal_queue_idx',t);
  end loop;
end $$;
alter table public.wms_replenishment_requests
  add column if not exists invoice_box_count integer,
  add column if not exists invoice_checked_quantity numeric;

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
    new.request_origin:=case when v_role='COMPRAS' then 'COMPRAS' else 'ESTOQUE' end;
    new.requires_invoice:=v_role='COMPRAS'; new.invoice_stage:='';
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

create or replace function private.wms_invoice_item_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare t public.wms_transfers; begin
  if private.current_wms_role()='COMPRAS' and tg_op<>'INSERT' then
    raise exception 'Compras nao altera itens operacionais.' using errcode='42501';
  end if;
  if private.current_wms_role()='COMPRAS' and tg_op='INSERT'
    and (coalesce(new.quantidade_separada,0)<>0 or coalesce(new.quantidade_lacrada,0)<>0 or coalesce(new.quantidade_lacrada_unidades,0)<>0) then
    raise exception 'Compras nao informa quantidades fisicas.' using errcode='42501';
  end if;
  select * into t from public.wms_transfers where id=coalesce(to_jsonb(new)->>'transfer_id',to_jsonb(old)->>'transfer_id') for update;
  if t.requires_invoice and t.invoice_stage not in ('','CORRECAO_SOLICITADA') then
    raise exception 'Itens conferidos bloqueados. Use Devolver para correcao.' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if; return new;
end $$;
drop trigger if exists wms_invoice_items_guard on public.wms_transfer_items;
create trigger wms_invoice_items_guard before insert or update or delete on public.wms_transfer_items
for each row execute function private.wms_invoice_item_guard();

create or replace function private.wms_invoice_audit() returns trigger
language plpgsql security invoker set search_path='' as $$
declare v_event text; v_id text; v_name text; u record; v_key text; begin
  if not new.requires_invoice then return new; end if;
  v_id:=private.current_wms_profile_id();
  select name into v_name from public.wms_users where id=v_id;
  if tg_op='INSERT' then v_event:='CREATED_BY_PURCHASES';
  elsif new.invoice_stage is distinct from old.invoice_stage then v_event:=new.invoice_stage;
  elsif new.invoice_file_path is distinct from old.invoice_file_path then v_event:='INVOICE_REPLACED';
  else return new; end if;
  v_key:='fiscal:'||tg_table_name||':'||new.id||':'||new.fiscal_revision||':'||v_event;
  if tg_table_name='wms_transfers' then
    insert into public.wms_transfer_events(id,transfer_id,warehouse_code,user_id,user_name,event_type,details,payload)
    values(v_key,new.id,new.warehouse_code,v_id,v_name,v_event,new.fiscal_reason,
      jsonb_build_object('invoice_path',new.invoice_file_path,'invoice_number',new.invoice_number,'stage',new.invoice_stage)) on conflict(id) do nothing;
  else
    insert into public.wms_history(id,datetime,action,warehouse_code,sku,details)
    values(v_key,now(),'Workflow Compras',new.warehouse_code,to_jsonb(new)->>'codigo_material',
      jsonb_build_object('entity_id',new.id,'event',v_event,'user_id',v_id,'user_name',v_name,'reason',new.fiscal_reason,'invoice_path',new.invoice_file_path)::text)
    on conflict(id) do nothing;
  end if;
  if new.invoice_stage in ('PRONTA_PARA_NOTA','LIBERADA_PARA_ENVIO','CORRECAO_SOLICITADA') and tg_op='UPDATE' and new.invoice_stage is distinct from old.invoice_stage then
    insert into public.wms_notifications(id,warehouse_code,user_id,user_name,entity_id,transfer_id,event_type,title,message,idempotency_key,payload)
    values(v_key||':handoff',new.warehouse_code,
      case when new.invoice_stage='PRONTA_PARA_NOTA' then 'role:COMPRAS' else 'role:ESTOQUE' end,
      'Workflow',new.id,case when tg_table_name='wms_transfers' then new.id else '' end,
      v_event,'Workflow Compras',case when new.invoice_stage='PRONTA_PARA_NOTA' then 'Processo disponivel para NF.'
        when new.invoice_stage='LIBERADA_PARA_ENVIO' then 'NF concluida. Processo liberado para envio.' else 'Compras solicitou correcao: '||new.fiscal_reason end,v_key||':handoff',
      jsonb_build_object('domain',tg_table_name,'entity_id',new.id,'stage',new.invoice_stage))
    on conflict(id) do nothing;
  end if;
  return new;
end $$;
do $$ declare t text; begin foreach t in array array['wms_transfers','wms_replenishment_requests'] loop
  execute format('drop trigger if exists aa_wms_invoice_guard on public.%I',t);
  execute format('create trigger aa_wms_invoice_guard before insert or update on public.%I for each row execute function private.wms_invoice_guard()',t);
  execute format('drop trigger if exists wms_invoice_audit on public.%I',t);
  execute format('create trigger wms_invoice_audit after insert or update on public.%I for each row execute function private.wms_invoice_audit()',t);
end loop; end $$;

-- Additive fiscal access. Operational item updates remain unavailable to COMPRAS.
do $$ declare t text; begin
  foreach t in array array['wms_warehouses','wms_products','wms_establishments','wms_product_packaging','wms_schema_version','wms_sync_metadata'] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop policy if exists purchases_catalog_read on public.%I',t);
      execute format('create policy purchases_catalog_read on public.%I for select to authenticated using ((select private.current_wms_role())=''COMPRAS'')',t);
    end if;
  end loop;
end $$;
drop policy if exists purchases_responsible_read on public.wms_users;
create policy purchases_responsible_read on public.wms_users for select to authenticated using(
  (select private.current_wms_role())='COMPRAS' and role in ('OPERADOR','SUPERVISOR') and active and not coalesce(archived,false)
  and coalesce(default_warehouse_code,warehouse_code)=any((select private.current_wms_allowed_warehouses())::text[]));
do $$ declare t text; begin foreach t in array array['wms_transfers','wms_transfer_items','wms_transfer_divergences','wms_transfer_events'] loop
  execute format('drop policy if exists purchases_scoped_read on public.%I',t);
  execute format('create policy purchases_scoped_read on public.%I for select to authenticated using
    (warehouse_code=any((select private.current_wms_allowed_warehouses())::text[]) and (select private.has_wms_role(array[''COMPRAS'',''ADMINISTRADOR'',''SUPERVISOR'',''OPERADOR''])))',t);
end loop;
foreach t in array array['wms_transfers','wms_replenishment_requests'] loop
  execute format('drop policy if exists purchases_fiscal_update on public.%I',t);
  execute format('create policy purchases_fiscal_update on public.%I for update to authenticated using
    (requires_invoice and request_origin=''COMPRAS'' and warehouse_code=any((select private.current_wms_allowed_warehouses())::text[]) and (select private.current_wms_role())=''COMPRAS'')
    with check(requires_invoice and request_origin=''COMPRAS'' and warehouse_code=any((select private.current_wms_allowed_warehouses())::text[]))',t);
end loop; end $$;
drop policy if exists purchases_transfer_events_insert on public.wms_transfer_events;
create policy purchases_transfer_events_insert on public.wms_transfer_events for insert to authenticated
with check(warehouse_code=any((select private.current_wms_allowed_warehouses())::text[])
  and (select private.has_wms_role(array['COMPRAS','ADMINISTRADOR','SUPERVISOR','OPERADOR'])));
grant select,insert on public.wms_transfer_events to authenticated;

drop policy if exists purchases_workflow_history_read on public.wms_history;
create policy purchases_workflow_history_read on public.wms_history for select to authenticated
using(warehouse_code=any((select private.current_wms_allowed_warehouses())::text[])
  and (select private.current_wms_role())='COMPRAS' and action in ('Workflow Compras','Logistica Reversa'));
drop policy if exists purchases_workflow_history_insert on public.wms_history;
create policy purchases_workflow_history_insert on public.wms_history for insert to authenticated
with check(warehouse_code=any((select private.current_wms_allowed_warehouses())::text[])
  and (select private.current_wms_role())='COMPRAS' and action='Workflow Compras' and id like 'fiscal:wms_replenishment_requests:%');

create or replace function private.wms_fiscal_task_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare v_invoice boolean; v_stage text; begin
  if new.referencia_tipo='TRANSFERENCIA' then
    select requires_invoice,invoice_stage into v_invoice,v_stage from public.wms_transfers where id=new.referencia_id;
  elsif new.referencia_tipo='REPOSICAO' then
    select requires_invoice,invoice_stage into v_invoice,v_stage from public.wms_replenishment_requests where id=new.referencia_id;
  end if;
  if v_invoice and v_stage not in ('','FINALIZADA') and new.status<>'CANCELADA' then
    new.status:='EM_ANDAMENTO'; new.data_conclusao:=null; new.tempo_execucao_segundos:=null;
  end if;
  return new;
end $$;
do $$ begin
  if to_regclass('public.operacao_tarefas') is not null then
    execute 'drop trigger if exists zz_wms_fiscal_task_guard on public.operacao_tarefas';
    execute 'create trigger zz_wms_fiscal_task_guard before insert or update on public.operacao_tarefas for each row execute function private.wms_fiscal_task_guard()';
  end if;
end $$;

create or replace function private.wms_fiscal_divergence_guard() returns trigger
language plpgsql security invoker set search_path='' as $$ begin
  if private.current_wms_role()='COMPRAS' then raise exception 'Compras consulta divergencias, mas nao modifica a conferencia.' using errcode='42501'; end if;
  if tg_op='DELETE' then return old; end if;
  if tg_op='UPDATE' and new.resolved is distinct from old.resolved and new.resolved then
    if nullif(btrim(new.observation),'') is null then raise exception 'Justifique a resolucao da divergencia.'; end if;
    new.resolved_by:=private.current_wms_profile_id(); new.resolved_at:=now();
    insert into public.wms_transfer_events(id,transfer_id,warehouse_code,user_id,user_name,event_type,details)
    values('divergence:'||new.id||':'||new.resolved_at::text,new.transfer_id,new.warehouse_code,new.resolved_by,
      (select name from public.wms_users where id=new.resolved_by),'DIVERGENCE_RESOLVED',new.observation);
  end if;
  return new;
end $$;
drop trigger if exists wms_fiscal_divergence_guard on public.wms_transfer_divergences;
create trigger wms_fiscal_divergence_guard before insert or update or delete on public.wms_transfer_divergences
for each row execute function private.wms_fiscal_divergence_guard();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('wms-transfer-invoices','wms-transfer-invoices',false,10485760,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists wms_invoice_storage_read on storage.objects;
create policy wms_invoice_storage_read on storage.objects for select to authenticated using(
  bucket_id='wms-transfer-invoices' and (storage.foldername(name))[1]=any((select private.current_wms_allowed_warehouses())::text[])
  and (select private.has_wms_role(array['COMPRAS','ADMINISTRADOR','SUPERVISOR','OPERADOR'])));
drop policy if exists wms_invoice_storage_write on storage.objects;
create policy wms_invoice_storage_write on storage.objects for insert to authenticated with check(
  bucket_id='wms-transfer-invoices' and name like '%.pdf'
  and (storage.foldername(name))[1]=any((select private.current_wms_allowed_warehouses())::text[])
  and (select private.has_wms_role(array['COMPRAS','ADMINISTRADOR','SUPERVISOR']))
  and ((exists(select 1 from public.wms_transfers t where t.id=(storage.foldername(name))[3] and t.warehouse_code=(storage.foldername(name))[1]
    and (storage.foldername(name))[2]='wms_transfers' and t.requires_invoice and t.invoice_stage in ('PRONTA_PARA_NOTA','NF_EM_PREPARACAO','NF_ANEXADA')))
    or exists(select 1 from public.wms_replenishment_requests r where r.id=(storage.foldername(name))[3] and r.warehouse_code=(storage.foldername(name))[1]
      and (storage.foldername(name))[2]='wms_replenishment_requests' and r.requires_invoice and r.invoice_stage in ('PRONTA_PARA_NOTA','NF_EM_PREPARACAO','NF_ANEXADA'))));
drop policy if exists wms_invoice_storage_orphan_delete on storage.objects;
create policy wms_invoice_storage_orphan_delete on storage.objects for delete to authenticated using(
  bucket_id='wms-transfer-invoices' and (storage.foldername(name))[1]=any((select private.current_wms_allowed_warehouses())::text[])
  and (select private.has_wms_role(array['COMPRAS','ADMINISTRADOR','SUPERVISOR']))
  and not exists(select 1 from public.wms_transfers t where t.invoice_file_path=name)
  and not exists(select 1 from public.wms_replenishment_requests r where r.invoice_file_path=name));

create or replace function public.wms_invoice_action(p_domain text,p_id text,p_expected_stage text,p_action text,p_data jsonb,p_action_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_table text; v_row jsonb; v_stage text; v_status text; v_patch jsonb; v_reason text; v_role text:=private.current_wms_role(); begin
  if p_domain not in ('TRANSFERENCIA','REPOSICAO') or nullif(p_action_id,'') is null then raise exception 'Acao invalida.'; end if;
  v_table:=case when p_domain='TRANSFERENCIA' then 'wms_transfers' else 'wms_replenishment_requests' end;
  execute format('select to_jsonb(t) from public.%I t where id=$1 and warehouse_code=any(private.current_wms_allowed_warehouses()) and not is_deleted for update',v_table) into v_row using p_id;
  if v_row is null or not (v_row->>'requires_invoice')::boolean then raise exception 'Processo fiscal nao encontrado.' using errcode='42501'; end if;
  if v_row->>'invoice_last_action_id'=p_action_id then return v_row; end if;
  if v_row->>'invoice_stage'<>p_expected_stage then raise exception 'O processo foi atualizado por outro usuario. Atualize a tela.' using errcode='40001'; end if;
  v_reason:=btrim(coalesce(p_data->>'reason',''));
  v_stage:=case p_action when 'READY' then 'PRONTA_PARA_NOTA' when 'PREPARE' then 'NF_EM_PREPARACAO'
    when 'UPLOAD' then 'NF_ANEXADA' when 'RELEASE' then 'LIBERADA_PARA_ENVIO' when 'DISPATCH' then 'DESPACHADA'
    when 'RECEIVE' then 'RECEBIDA' when 'COMPLETE' then 'FINALIZADA' when 'CORRECTION' then 'CORRECAO_SOLICITADA'
    when 'REOPEN' then 'CORRECAO_SOLICITADA' else null end;
  if v_stage is null then raise exception 'Acao fiscal invalida.'; end if;
  if p_action='REOPEN' and v_role not in ('ADMINISTRADOR','SUPERVISOR') then raise exception 'Reabertura restrita ao gestor.'; end if;
  v_patch:=jsonb_build_object('invoice_stage',v_stage,'fiscal_reason',v_reason,'invoice_last_action_id',p_action_id);
  if p_domain='TRANSFERENCIA' then
    v_status:=case when p_action in ('CORRECTION','REOPEN') then 'CORRECAO_SOLICITADA'
      when p_action='COMPLETE' then 'FINALIZADA' when p_action='READY' then 'PRONTA_PARA_NOTA' else v_stage end;
    v_patch:=v_patch||jsonb_build_object('status',v_status);
  elsif p_action in ('CORRECTION','REOPEN') then v_patch:=v_patch||jsonb_build_object('status','EM_SEPARACAO');
  elsif p_action='COMPLETE' then v_patch:=v_patch||jsonb_build_object('status','CONCLUIDO','finished_at',now());
  end if;
  if p_action='READY' and p_domain='REPOSICAO' then
    v_patch:=v_patch||jsonb_build_object('invoice_box_count',(p_data->>'boxes')::integer,'invoice_checked_quantity',(p_data->>'checked')::numeric);
  end if;
  if p_action='UPLOAD' then
    v_patch:=v_patch||jsonb_build_object('invoice_number',btrim(p_data->>'number'),'invoice_key',btrim(coalesce(p_data->>'key','')),
      'invoice_file_path',p_data->>'path','invoice_file_name',p_data->>'filename','invoice_uploaded_at',now(),
      'invoice_uploaded_by_id',private.current_wms_profile_id(),'invoice_uploaded_by_name',(select name from public.wms_users where id=private.current_wms_profile_id()));
  end if;
  if p_action in ('CORRECTION','REOPEN') then
    if v_reason='' then raise exception 'Informe o motivo.'; end if;
    v_patch:=v_patch||jsonb_build_object('invoice_file_path','','invoice_number','','invoice_snapshot',null);
  end if;
  if p_action='DISPATCH' then v_patch:=v_patch||jsonb_build_object('sent_at',now()); end if;
  if p_action='RELEASE' then v_patch:=v_patch||jsonb_build_object('invoice_released_at',now()); end if;
  if p_action='RECEIVE' then v_patch:=v_patch||jsonb_build_object('received_at',now()); end if;
  if p_action='COMPLETE' then v_patch:=v_patch||jsonb_build_object('finished_at',now()); end if;
  v_row:=v_row||v_patch;
  execute format('update public.%I t set invoice_stage=x.invoice_stage,invoice_number=x.invoice_number,invoice_key=x.invoice_key,
    invoice_file_path=x.invoice_file_path,invoice_file_name=x.invoice_file_name,invoice_uploaded_at=x.invoice_uploaded_at,
    invoice_uploaded_by_id=x.invoice_uploaded_by_id,invoice_uploaded_by_name=x.invoice_uploaded_by_name,
    invoice_snapshot=x.invoice_snapshot,fiscal_reason=x.fiscal_reason,status=x.status,sent_at=x.sent_at,received_at=x.received_at,finished_at=x.finished_at,invoice_last_action_id=x.invoice_last_action_id,invoice_released_at=x.invoice_released_at
    %s from jsonb_populate_record(null::public.%I,$1) x where t.id=$2 returning to_jsonb(t)',v_table,
    case when p_domain='REPOSICAO' then ',invoice_box_count=x.invoice_box_count,invoice_checked_quantity=x.invoice_checked_quantity' else '' end,v_table)
    into v_row using v_row,p_id;
  if v_row is null then raise exception 'Acao bloqueada pelas permissoes.' using errcode='42501'; end if;
  return v_row;
end $$;
revoke all on function public.wms_invoice_action(text,text,text,text,jsonb,text) from public,anon;
grant execute on function public.wms_invoice_action(text,text,text,text,jsonb,text) to authenticated;

create or replace function public.wms_fiscal_summary(p_warehouse text) returns jsonb
language sql security invoker set search_path='' as $$
select jsonb_build_object('Aguardando NF',count(*) filter(where invoice_stage in ('PRONTA_PARA_NOTA','NF_EM_PREPARACAO','NF_ANEXADA')),
  'Correcoes',count(*) filter(where invoice_stage='CORRECAO_SOLICITADA'),
  'Liberadas hoje',count(*) filter(where (invoice_released_at at time zone 'America/Cuiaba')::date=(now() at time zone 'America/Cuiaba')::date))
from (select invoice_stage,invoice_released_at from public.wms_transfers where (p_warehouse is null or warehouse_code=p_warehouse) and warehouse_code=any(private.current_wms_allowed_warehouses()) and requires_invoice and not is_deleted
  union all select invoice_stage,invoice_released_at from public.wms_replenishment_requests where (p_warehouse is null or warehouse_code=p_warehouse) and warehouse_code=any(private.current_wms_allowed_warehouses()) and requires_invoice and not is_deleted) q
where private.has_wms_role(array['COMPRAS','ADMINISTRADOR','SUPERVISOR','OPERADOR']) $$;
revoke all on function public.wms_fiscal_summary(text) from public,anon;
grant execute on function public.wms_fiscal_summary(text) to authenticated;

insert into public.wms_schema_version(id,version,description,applied_at,applied_by)
values('current','2026.10.14.001','Compras: origem, NF privada, transicoes e bloqueio de quantidades conferidas',now(),'purchases-invoice-workflow')
on conflict(id) do update set version=excluded.version,description=excluded.description,applied_at=excluded.applied_at,applied_by=excluded.applied_by;
notify pgrst,'reload schema';
commit;
