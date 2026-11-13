alter table public.wms_caixa_requests add column claimed_by text references public.wms_users(id),
  add column claimed_by_name text, add column claimed_at timestamptz,
  add column resolution_notes text, add column resolved_at timestamptz, add column confirmed_at timestamptz;
alter table public.wms_caixa_request_events add column observation text not null default '';

create policy wms_caixa_operator_read on public.wms_caixa_requests for select to authenticated using (
  (select private.current_wms_role())='OPERADOR' and private.can_access_warehouse(warehouse_code)
);

create function private.act_wms_caixa_adjustment(request_key uuid,operation text,observation text)
returns uuid language plpgsql security definer set search_path='' as $$
declare request public.wms_caixa_requests; actor text; actor_role text; actor_name text; next_status text;
begin
  actor:=private.current_wms_profile_id(); actor_role:=private.current_wms_role();
  if length(coalesce(observation,''))>2000 then raise exception 'Observação limitada a 2.000 caracteres.'; end if;
  if auth.uid() is null or actor is null then raise exception using errcode='42501',message='Entre novamente para continuar.'; end if;
  select * into request from public.wms_caixa_requests where id=request_key for update;
  if not found or request.kind<>'ADJUSTMENT' or not private.can_access_warehouse(request.warehouse_code) then
    raise exception using errcode='42501',message='Ajuste não encontrado no estoque autorizado.';
  end if;
  if request.status='CANCELADO' then raise exception 'Ajuste cancelado.'; end if;
  if operation in ('CONFIRM','REOPEN') then
    if actor_role<>'CAIXA' or request.requested_by<>actor or not private.caixa_has_warehouse(request.warehouse_code) then
      raise exception using errcode='42501',message='Somente o caixa solicitante pode confirmar o resultado.';
    end if;
    if operation='CONFIRM' and request.confirmed_at is not null then return request_key; end if;
    if request.status<>'AGUARDANDO_CONFIRMACAO_CAIXA' then raise exception 'Aguarde a resposta do estoquista.'; end if;
    if operation='REOPEN' and length(btrim(coalesce(observation,'')))<3 then raise exception 'Informe por que o ajuste não deu certo.'; end if;
    next_status:=case operation when 'CONFIRM' then 'CONCLUIDO' else 'EM_VERIFICACAO' end;
    update public.wms_caixa_requests set status=next_status,confirmed_at=case when operation='CONFIRM' then now() else null end,
      resolved_at=case when operation='CONFIRM' then resolved_at else null end,updated_at=now() where id=request_key;
  elsif operation in ('CLAIM','RESOLVE') then
    if actor_role not in ('OPERADOR','SUPERVISOR','ADMINISTRADOR') then raise exception using errcode='42501',message='Somente a equipe de estoque pode atender ajustes.'; end if;
    if request.confirmed_at is not null then raise exception 'Ajuste já confirmado pelo caixa.'; end if;
    if operation='CLAIM' then
      if request.claimed_by=actor then return request_key; end if;
      if request.claimed_by is not null then raise exception 'Outro estoquista já puxou este ajuste. Atualize a fila.'; end if;
      select name into actor_name from public.wms_users where id=actor;
      next_status:='EM_VERIFICACAO';
      update public.wms_caixa_requests set claimed_by=actor,claimed_by_name=actor_name,claimed_at=now(),status=next_status,updated_at=now() where id=request_key;
    else
      if request.claimed_by is distinct from actor then raise exception using errcode='42501',message='Somente o estoquista que puxou pode informar a resolução.'; end if;
      if length(btrim(coalesce(observation,'')))<3 or length(observation)>2000 then raise exception 'Descreva a resolução em até 2.000 caracteres.'; end if;
      next_status:='AGUARDANDO_CONFIRMACAO_CAIXA';
      update public.wms_caixa_requests set status=next_status,resolution_notes=btrim(observation),resolved_at=now(),updated_at=now() where id=request_key;
    end if;
  else raise exception 'Ação inválida.';
  end if;
  insert into public.wms_caixa_request_events(request_id,actor_id,event_type,status,observation) values(request_key,actor,operation,next_status,coalesce(observation,''));
  return request_key;
end $$;

create or replace function private.submit_wms_caixa_request(request_key uuid,code text,request_kind text,product_code text,units integer,customer boolean,observation text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor text; prior public.wms_caixa_requests; profile_name text; replenishment text;
begin
  actor:=private.current_wms_profile_id();
  if auth.uid() is null or actor is null or coalesce(private.current_wms_role(),'')<>'CAIXA' or not private.caixa_has_warehouse(code) then
    raise exception using errcode='42501',message='Solicitação permitida somente ao Caixa ativo do estoque autorizado.';
  end if;
  if request_key is null or request_kind is null or request_kind not in ('PRODUCT','ADJUSTMENT')
    or coalesce(product_code,'') !~ '^[0-9]{4,8}$' or units is null or units<=0 or units>9999999
    or length(coalesce(observation,''))>2000
    or (request_kind='ADJUSTMENT' and length(btrim(coalesce(observation,'')))<3) then
    raise exception 'Revise SKU, quantidade e motivo do ajuste.';
  end if;
  perform pg_advisory_xact_lock(hashtext(request_key::text));
  select * into prior from public.wms_caixa_requests where id=request_key;
  if found then
    if prior.requested_by is distinct from actor or prior.warehouse_code is distinct from upper(code)
      or prior.kind is distinct from request_kind or prior.sku is distinct from product_code or prior.quantity is distinct from units
      or prior.notes is distinct from coalesce(observation,'') or prior.customer_service is distinct from (request_kind='PRODUCT') then
      raise exception 'Chave de solicitação já utilizada com outro conteúdo.';
    end if;
    return request_key;
  end if;
  select name into profile_name from public.wms_users where id=actor;
  if request_kind='PRODUCT' then
    replenishment:='caixa-'||request_key::text;
    insert into public.wms_replenishment_requests(id,warehouse_code,codigo_material,nome_material,quantidade_disponivel_loja_informada,
      quantidade_solicitada,quantidade_atendida,quantidade_pendente,solicitado_por_id,solicitado_por_nome,status,prioridade,observacao,created_at,updated_at)
    values(replenishment,upper(code),product_code,'',null,units,0,units,actor,coalesce(profile_name,''),'PENDENTE',
      'CLIENTE','Solicitação do Caixa. Saldo loja não informado. '||coalesce(observation,''),now(),now());
  end if;
  insert into public.wms_caixa_requests(id,warehouse_code,requested_by,kind,sku,quantity,customer_service,notes,replenishment_id)
  values(request_key,upper(code),actor,request_kind,product_code,units,request_kind='PRODUCT',coalesce(observation,''),replenishment);
  insert into public.wms_caixa_request_events(request_id,actor_id,event_type,status) values(request_key,actor,'SUBMITTED','PENDENTE');
  return request_key;
end $$;

create or replace function private.sync_wms_caixa_request() returns trigger language plpgsql security definer set search_path='' as $$
declare request public.wms_caixa_requests; next_status text; actual_attended numeric;
begin
  if tg_table_name='wms_replenishment_requests' then
    select * into request from public.wms_caixa_requests where replenishment_id=new.id;
    next_status:=new.status; actual_attended:=new.quantidade_atendida;
    if coalesce(new.is_deleted,false) then next_status:='CANCELADO'; end if;
  else
    select * into request from public.wms_caixa_requests where task_id=new.id;
    if request.claimed_by is not null then return new; end if;
    next_status:=case new.status when 'CONCLUIDA' then 'AGUARDANDO_CONFIRMACAO_CAIXA' when 'CANCELADA' then 'CANCELADO' when 'AGUARDANDO_VALIDACAO' then 'AGUARDANDO_VALIDACAO' else 'EM_VERIFICACAO' end;
    actual_attended:=0;
  end if;
  if request.id is null or request.confirmed_at is not null then return new; end if;
  if request.status is distinct from next_status or request.attended is distinct from actual_attended then
    update public.wms_caixa_requests set status=next_status,attended=actual_attended,updated_at=now() where id=request.id;
    insert into public.wms_caixa_request_events(request_id,actor_id,event_type,status) values(request.id,private.current_wms_profile_id(),'STATUS_UPDATED',next_status);
  end if;
  return new;
end $$;

update public.wms_replenishment_requests replenishment set prioridade='CLIENTE' from public.wms_caixa_requests request where request.replenishment_id=replenishment.id and replenishment.status not in ('CONCLUIDO','CANCELADO','ENTREGUE_NA_LOJA');
update public.wms_caixa_requests request set claimed_by=task.atribuido_para,claimed_by_name=profile.name,claimed_at=coalesce(task.data_inicio,now()),status=case when task.status='CONCLUIDA' then 'AGUARDANDO_CONFIRMACAO_CAIXA' else request.status end from public.operacao_tarefas task left join public.wms_users profile on profile.id=task.atribuido_para where request.kind='ADJUSTMENT' and request.task_id=task.id;
revoke all on function private.act_wms_caixa_adjustment(uuid,text,text) from public,anon,authenticated;
grant execute on function private.act_wms_caixa_adjustment(uuid,text,text) to authenticated;
create function public.act_wms_caixa_adjustment(request_key uuid,operation text,observation text default '')
returns uuid language sql security invoker set search_path='' as $$ select private.act_wms_caixa_adjustment(request_key,operation,observation); $$;
revoke all on function public.act_wms_caixa_adjustment(uuid,text,text) from public,anon;
grant execute on function public.act_wms_caixa_adjustment(uuid,text,text) to authenticated;

create or replace function private.review_wms_caixa_adjustment(request_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$ begin
  raise exception 'Use Puxar ajuste urgente em Pedidos de Reposição.';
end $$;
