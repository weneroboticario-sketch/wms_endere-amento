create table public.wms_caixa_request_messages (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.wms_caixa_requests(id) on delete restrict,
  warehouse_code text not null,
  sender_id text not null references public.wms_users(id),
  sender_name text not null,
  client_action_id uuid not null,
  body text not null check (length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  unique (request_id,sender_id,client_action_id)
);
create index wms_caixa_message_by_request on public.wms_caixa_request_messages(request_id,id);
create index wms_caixa_message_by_warehouse on public.wms_caixa_request_messages(warehouse_code,id desc);
alter table public.wms_caixa_request_messages enable row level security;
revoke all on public.wms_caixa_request_messages from public,anon,authenticated;
grant select on public.wms_caixa_request_messages to authenticated;

create function private.can_access_wms_caixa_chat(request_key uuid,code text) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(auth.uid() is not null and private.current_wms_profile_id() is not null and exists (
    select 1 from public.wms_caixa_requests request
    left join public.wms_replenishment_requests product on request.kind='PRODUCT' and product.id=request.replenishment_id and product.warehouse_code=request.warehouse_code
    where request.id=request_key and request.warehouse_code=code and private.can_access_warehouse(request.warehouse_code)
      and (
        (private.current_wms_role()='CAIXA' and request.requested_by=private.current_wms_profile_id() and private.caixa_has_warehouse(request.warehouse_code))
        or (private.current_wms_role()='OPERADOR' and private.current_wms_profile_id()=case when request.kind='PRODUCT' then coalesce(nullif(product.responsavel_id,''),nullif(product.claimed_by_id,'')) else request.claimed_by end)
        or private.current_wms_role() in ('SUPERVISOR','ADMINISTRADOR')
      )
  ),false);
$$;
revoke all on function private.can_access_wms_caixa_chat(uuid,text) from public,anon,authenticated;
grant execute on function private.can_access_wms_caixa_chat(uuid,text) to authenticated;
create policy wms_caixa_chat_read on public.wms_caixa_request_messages for select to authenticated
using (private.can_access_wms_caixa_chat(request_id,warehouse_code));

create function private.list_wms_caixa_attendance(code text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor text; actor_role text; result jsonb;
begin
  actor:=private.current_wms_profile_id(); actor_role:=private.current_wms_role();
  if auth.uid() is null or actor is null or coalesce(actor_role,'') not in ('CAIXA','OPERADOR','SUPERVISOR','ADMINISTRADOR')
    or private.can_access_warehouse(code) is distinct from true
    or (actor_role='CAIXA' and private.caixa_has_warehouse(code) is distinct from true) then
    raise exception using errcode='42501',message='Sem acesso ao estoque solicitado.';
  end if;
  select coalesce(jsonb_agg(item.payload order by item.created_at desc,item.id desc),'[]'::jsonb) into result from (
    select request.id,request.created_at,to_jsonb(request)||jsonb_build_object(
      'requested_by_name',coalesce(nullif(cashier.name,''),'Solicitante não identificado'),
      'product_name',coalesce(nullif(product.nome_material,''),''),
      'claimed_by',case when request.kind='PRODUCT' then coalesce(nullif(product.responsavel_id,''),nullif(product.claimed_by_id,'')) else request.claimed_by end,
      'claimed_by_name',case when request.kind='PRODUCT' then coalesce(nullif(product.responsavel_nome,''),nullif(product.claimed_by_name,''),'Estoquista') else request.claimed_by_name end,
      'claimed_at',case when request.kind='PRODUCT' then product.claimed_at else request.claimed_at end,
      'status',case when request.kind='PRODUCT' then coalesce(case when product.is_deleted then 'CANCELADO' else product.status end,request.status) else request.status end,
      'attended',case when request.kind='PRODUCT' then coalesce(product.quantidade_atendida,request.attended) else request.attended end
    ) as payload
    from public.wms_caixa_requests request
    left join public.wms_users cashier on cashier.id=request.requested_by
    left join public.wms_replenishment_requests product on request.kind='PRODUCT' and product.id=request.replenishment_id and product.warehouse_code=request.warehouse_code
    where request.warehouse_code=upper(code) and (actor_role<>'CAIXA' or request.requested_by=actor)
    order by request.created_at desc,request.id desc limit 100
  ) item;
  return result;
end $$;
revoke all on function private.list_wms_caixa_attendance(text) from public,anon,authenticated;
grant execute on function private.list_wms_caixa_attendance(text) to authenticated;
create function public.list_wms_caixa_attendance(code text) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.list_wms_caixa_attendance(code); $$;
revoke all on function public.list_wms_caixa_attendance(text) from public,anon;
grant execute on function public.list_wms_caixa_attendance(text) to authenticated;

create function private.send_wms_caixa_message(request_key uuid,action_key uuid,body text) returns bigint
language plpgsql security definer set search_path='' as $$
declare request public.wms_caixa_requests; actor text; existing record; message_id bigint; author_name text;
begin
  if auth.uid() is null or request_key is null or action_key is null then raise exception using errcode='42501',message='Sessão inválida.'; end if;
  actor:=private.current_wms_profile_id();
  if actor is null then raise exception using errcode='42501',message='Usuário não identificado.'; end if;
  if body is null or length(btrim(body))<1 or length(body)>1000 then raise exception 'Mensagem deve ter de 1 a 1000 caracteres.'; end if;
  select * into request from public.wms_caixa_requests where id=request_key for share;
  if not found or private.can_access_wms_caixa_chat(request_key,request.warehouse_code) is distinct from true then
    raise exception using errcode='42501',message='Conversa restrita aos envolvidos do estoque autorizado.';
  end if;
  select message.id,message.body into existing from public.wms_caixa_request_messages message
    where message.request_id=request_key and message.sender_id=actor and message.client_action_id=action_key;
  if found then
    if existing.body<>btrim(body) then raise exception 'Identificador da mensagem já utilizado com outro conteúdo.'; end if;
    return existing.id;
  end if;
  if request.confirmed_at is not null or request.status in ('CANCELADO','CONCLUIDO','ENTREGUE_NA_LOJA','SEM_ESTOQUE') then
    raise exception 'Solicitação encerrada. Converse em uma solicitação ativa.';
  end if;
  select coalesce(nullif(name,''),'Participante') into author_name from public.wms_users where id=actor;
  insert into public.wms_caixa_request_messages(request_id,warehouse_code,sender_id,sender_name,client_action_id,body)
    values(request_key,request.warehouse_code,actor,author_name,action_key,btrim(body))
    on conflict(request_id,sender_id,client_action_id) do nothing returning id into message_id;
  if message_id is null then
    select message.id,message.body into existing from public.wms_caixa_request_messages message
      where message.request_id=request_key and message.sender_id=actor and message.client_action_id=action_key;
    if existing.body<>btrim(body) then raise exception 'Mensagem duplicada com conteúdo divergente.'; end if;
    message_id:=existing.id;
  end if;
  return message_id;
end $$;
revoke all on function private.send_wms_caixa_message(uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.send_wms_caixa_message(uuid,uuid,text) to authenticated;
create function public.send_wms_caixa_message(request_key uuid,action_key uuid,body text) returns bigint
language sql security invoker set search_path='' as $$ select private.send_wms_caixa_message(request_key,action_key,body); $$;
revoke all on function public.send_wms_caixa_message(uuid,uuid,text) from public,anon;
grant execute on function public.send_wms_caixa_message(uuid,uuid,text) to authenticated;

create or replace function private.act_wms_caixa_adjustment(request_key uuid,operation text,observation text)
returns uuid language plpgsql security definer set search_path='' as $$
declare request public.wms_caixa_requests; actor text; actor_role text; actor_name text; next_status text;
begin
  actor:=private.current_wms_profile_id(); actor_role:=private.current_wms_role();
  if length(coalesce(observation,''))>2000 then raise exception 'Observação limitada a 2.000 caracteres.'; end if;
  if auth.uid() is null or actor is null or coalesce(actor_role,'') not in ('CAIXA','OPERADOR','SUPERVISOR','ADMINISTRADOR') then raise exception using errcode='42501',message='Entre novamente para continuar.'; end if;
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
