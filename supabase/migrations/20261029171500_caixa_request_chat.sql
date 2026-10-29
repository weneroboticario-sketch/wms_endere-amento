-- WMS Endereçamento: conversa interna por solicitação do Caixa.
-- ALTERAÇÃO PROPOSTA: executar somente depois de validar em homologação.
create table if not exists public.wms_caixa_request_messages (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.wms_caixa_requests(id) on delete restrict,
  warehouse_code text not null,
  sender_id text not null,
  client_action_id uuid not null,
  body text not null check (length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  unique (request_id, sender_id, client_action_id)
);
create index if not exists wms_caixa_message_by_request on public.wms_caixa_request_messages (request_id,id);
alter table public.wms_caixa_request_messages enable row level security;
revoke all on public.wms_caixa_request_messages from public,anon,authenticated;
grant select on public.wms_caixa_request_messages to authenticated;
-- Acesso somente ao caixa solicitante, estoquista responsável ou supervisão do estoque.
create policy wms_caixa_chat_read on public.wms_caixa_request_messages for select to authenticated using (
  auth.uid() is not null and exists (
    select 1 from public.wms_caixa_requests r
    where r.id=wms_caixa_request_messages.request_id and r.warehouse_code=wms_caixa_request_messages.warehouse_code
      and private.can_access_warehouse(r.warehouse_code)
      and (
        (private.current_wms_role()='CAIXA' and r.requested_by=private.current_wms_profile_id())
        or (private.current_wms_role()='OPERADOR' and r.claimed_by=private.current_wms_profile_id())
        or private.current_wms_role() in ('SUPERVISOR','ADMINISTRADOR')
      )
  )
);
create or replace function private.send_wms_caixa_message(request_key uuid, action_key uuid, body text)
returns bigint language plpgsql security definer set search_path='' as $$
declare req public.wms_caixa_requests; actor text; role_name text; existing record; message_id bigint;
begin
  if auth.uid() is null or request_key is null or action_key is null then
    raise exception using errcode='42501',message='Sessão inválida.';
  end if;
  actor:=private.current_wms_profile_id();
  role_name:=private.current_wms_role();
  if actor is null then raise exception using errcode='42501',message='Usuário não identificado.'; end if;
  if body is null or length(btrim(body))<1 or length(body)>1000 then raise exception 'Mensagem deve ter de 1 a 1000 caracteres.'; end if;
  select * into req from public.wms_caixa_requests where id=request_key for share;
  if not found or not private.can_access_warehouse(req.warehouse_code) then
    raise exception using errcode='42501',message='Solicitação não autorizada.';
  end if;
  if not (
    (role_name='CAIXA' and req.requested_by=actor and private.caixa_has_warehouse(req.warehouse_code))
    or (role_name='OPERADOR' and req.claimed_by=actor)
    or role_name in ('SUPERVISOR','ADMINISTRADOR')
  ) then raise exception using errcode='42501',message='Conversa restrita aos envolvidos.'; end if;
  if req.confirmed_at is not null or req.status in ('CANCELADO','CONCLUIDO','ENTREGUE_NA_LOJA','SEM_ESTOQUE') then
    raise exception 'Solicitação encerrada. Converse em uma solicitação ativa.';
  end if;
  select m.id, m.body into existing from public.wms_caixa_request_messages m
    where m.request_id=request_key and m.sender_id=actor and m.client_action_id=action_key;
  if found then
    if existing.body<>btrim(body) then raise exception 'Identificador da mensagem já utilizado com outro conteúdo.'; end if;
    return existing.id;
  end if;
  insert into public.wms_caixa_request_messages(request_id,warehouse_code,sender_id,client_action_id,body)
    values(request_key,req.warehouse_code,actor,action_key,btrim(body))
    on conflict(request_id,sender_id,client_action_id) do nothing returning id into message_id;
  if message_id is null then
    select m.id,m.body into existing from public.wms_caixa_request_messages m
      where m.request_id=request_key and m.sender_id=actor and m.client_action_id=action_key;
    if existing.body<>btrim(body) then raise exception 'Mensagem duplicada com conteúdo divergente.'; end if;
    message_id:=existing.id;
  end if;
  return message_id;
end $$;
revoke all on function private.send_wms_caixa_message(uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.send_wms_caixa_message(uuid,uuid,text) to authenticated;
create or replace function public.send_wms_caixa_message(request_key uuid, action_key uuid, body text)
returns bigint language sql security invoker set search_path='' as $$
  select private.send_wms_caixa_message(request_key,action_key,body);
$$;
revoke all on function public.send_wms_caixa_message(uuid,uuid,text) from public,anon;
grant execute on function public.send_wms_caixa_message(uuid,uuid,text) to authenticated;
