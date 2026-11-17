begin;

-- No historical backfill: mutable request owners cannot prove who handled old quantities.
alter table public.wms_replenishment_export_batches
  add column created_by_name text,
  add column owner_id text,
  add column owner_name text,
  add column export_mode text check (export_mode in ('SELF','ADMIN')),
  add column export_state text not null default 'CONFIRMED' check (export_state in ('RESERVED','CONFIRMED','RELEASED')),
  add column confirmed_at timestamptz,
  add column file_name text,
  add column format_version integer not null default 1;

create table public.wms_replenishment_fulfillments (
  id uuid primary key default gen_random_uuid(),
  request_id text not null references public.wms_replenishment_requests(id) on delete cascade,
  warehouse_code text not null,
  codigo_material text not null check (length(trim(codigo_material)) > 0),
  nome_material text not null default '',
  localizacao_wms text,
  quantidade_solicitada numeric not null,
  quantidade_atendida numeric not null check (quantidade_atendida > 0),
  handled_by_id text not null,
  handled_by_auth_id uuid not null,
  responsavel_id text,
  responsavel_nome text,
  concluded_by_auth_id uuid,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'ATENDIDO' check (status in ('ATENDIDO','CONCLUIDO')),
  export_batch_id text references public.wms_replenishment_export_batches(id) on delete set null,
  exported_at timestamptz,
  exported_by_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'CONCLUIDO') = (finished_at is not null and responsavel_id is not null and concluded_by_auth_id is not null))
);
create index replenishment_fulfillment_request on public.wms_replenishment_fulfillments(request_id);
create index replenishment_fulfillment_pending on public.wms_replenishment_fulfillments
  (warehouse_code,responsavel_id,finished_at) where status='CONCLUIDO' and exported_at is null;
create index replenishment_fulfillment_handler on public.wms_replenishment_fulfillments
  (warehouse_code,handled_by_id) where status='ATENDIDO';
create index replenishment_export_owner on public.wms_replenishment_export_batches(warehouse_code,owner_id,created_at desc);

alter table public.wms_replenishment_fulfillments enable row level security;
revoke all on public.wms_replenishment_fulfillments from public,anon,authenticated;
grant select on public.wms_replenishment_fulfillments to authenticated;
create policy fulfillment_self on public.wms_replenishment_fulfillments for select to authenticated using (
  warehouse_code=any((select private.current_wms_allowed_warehouses())::text[])
  and (select private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','OPERADOR']))
  and (responsavel_id=(select private.current_wms_profile_id()) or handled_by_id=(select private.current_wms_profile_id()))
);
-- Restrictive policy also intersects the legacy permissive ALL policy.
create policy replenishment_export_owner_boundary on public.wms_replenishment_export_batches
as restrictive for select to authenticated using (
  warehouse_code=any((select private.current_wms_allowed_warehouses())::text[])
  and (select private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','OPERADOR']))
  and owner_id=(select private.current_wms_profile_id()) and format_version=2
);
revoke insert,update,delete on public.wms_replenishment_export_batches from public,authenticated,anon;

create function private.capture_replenishment_fulfillment() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_actor text; v_name text; v_delta numeric;
begin
  if (new.warehouse_code is distinct from old.warehouse_code or new.codigo_material is distinct from old.codigo_material)
    and exists(select 1 from public.wms_replenishment_fulfillments where request_id=new.id) then
    raise exception 'Atendimento rastreado: SKU e estoque não podem ser substituídos.' using errcode='23514';
  end if;
  v_delta := coalesce(new.quantidade_atendida,0)-coalesce(old.quantidade_atendida,0);
  if v_delta < 0 and exists(select 1 from public.wms_replenishment_fulfillments where request_id=new.id) then
    raise exception 'Atendimento rastreado: quantidade não pode ser reduzida sem correção auditada.' using errcode='23514';
  end if;
  if v_delta > 0 or (new.status in ('CONCLUIDO','ENTREGUE_NA_LOJA') and old.status not in ('CONCLUIDO','ENTREGUE_NA_LOJA')) then
    v_actor := private.current_wms_profile_id();
    if auth.uid() is null or v_actor is null
      or private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','OPERADOR']) is not true
      or (new.warehouse_code=any(private.current_wms_allowed_warehouses()::text[])) is not true then
      raise exception 'Usuário autenticado autorizado obrigatório para atender/concluir.' using errcode='42501';
    end if;
    select coalesce(nullif(name,''),username) into v_name from public.wms_users where id=v_actor;
    if v_delta > 0 then
      if old.status in ('CONCLUIDO','ENTREGUE_NA_LOJA') or new.is_deleted or new.status='CANCELADO'
         or new.cancellation_requested_at is not null then
        raise exception 'Solicitação indisponível para atendimento.' using errcode='23514';
      end if;
      insert into public.wms_replenishment_fulfillments
        (request_id,warehouse_code,codigo_material,nome_material,localizacao_wms,quantidade_solicitada,
         quantidade_atendida,handled_by_id,handled_by_auth_id,started_at)
      values(new.id,new.warehouse_code,new.codigo_material,coalesce(new.nome_material,''),new.localizacao_wms,
        new.quantidade_solicitada,v_delta,v_actor,auth.uid(),coalesce(new.started_at,now()));
    end if;
    if new.status in ('CONCLUIDO','ENTREGUE_NA_LOJA') and old.status not in ('CONCLUIDO','ENTREGUE_NA_LOJA') then
      -- Only unfinished portions follow this conclusion. Previously concluded portions keep their owner.
      update public.wms_replenishment_fulfillments set status='CONCLUIDO',responsavel_id=v_actor,
        responsavel_nome=v_name,concluded_by_auth_id=auth.uid(),finished_at=now(),updated_at=now()
      where request_id=new.id and status='ATENDIDO';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.capture_replenishment_fulfillment() from public,anon,authenticated;
create trigger capture_replenishment_fulfillment after update on public.wms_replenishment_requests
for each row execute function private.capture_replenishment_fulfillment();

create table private.wms_replenishment_attend_actions (
  actor_id uuid not null, action_id text not null, request_id text not null references public.wms_replenishment_requests(id) on delete cascade,
  quantity numeric not null, primary key(actor_id,action_id)
);
alter table private.wms_replenishment_attend_actions enable row level security;
create index replenishment_attend_action_request on private.wms_replenishment_attend_actions(request_id);
revoke all on private.wms_replenishment_attend_actions from public,anon,authenticated;

create function private.replenishment_owner_export(p_warehouse text,p_action text,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor text:=private.current_wms_profile_id(); v_owner text; v_name text; v_actor_name text;
  v_mode text:=coalesce(p_payload->>'mode','SELF'); v_batch public.wms_replenishment_export_batches;
  v_request public.wms_replenishment_requests; v_result jsonb; v_snapshot jsonb; v_ids uuid[];
  v_key text:=p_payload->>'batch_id'; v_action text:=upper(p_action); v_action_id text;
  v_quantity numeric; v_previous private.wms_replenishment_attend_actions;
  v_from timestamptz:=(p_payload->>'from')::timestamptz; v_until timestamptz:=(p_payload->>'until')::timestamptz;
begin
  if auth.uid() is null or v_actor is null or private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','OPERADOR']) is not true
     or (p_warehouse=any(private.current_wms_allowed_warehouses()::text[])) is not true then
    raise exception 'Estoque ou perfil não autorizado.' using errcode='42501';
  end if;
  select coalesce(nullif(name,''),username) into v_actor_name from public.wms_users where id=v_actor;
  if v_mode not in ('SELF','ADMIN') or (v_mode='ADMIN' and private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR']) is not true) then
    raise exception 'Exportação administrativa não autorizada.' using errcode='42501';
  end if;
  v_owner:=coalesce(nullif(p_payload->>'owner_id',''),v_actor);
  if v_mode='SELF' and v_owner<>v_actor then raise exception 'Exporte somente seus itens.' using errcode='42501'; end if;
  select coalesce(nullif(name,''),username) into v_name from public.wms_users where id=v_owner;
  if v_name is null then raise exception 'Responsável inexistente.' using errcode='22023'; end if;
  if v_action='ATTEND' then
    v_action_id:=nullif(p_payload->>'action_id',''); v_quantity:=(p_payload->>'quantity')::numeric;
    if v_mode<>'SELF' or v_action_id is null or v_quantity is null or v_quantity<0 or v_quantity::text in ('NaN','Infinity','-Infinity') then
      raise exception 'Quantidade/identificador inválido.' using errcode='22023'; end if;
    perform pg_advisory_xact_lock(hashtextextended('rep-attend:'||auth.uid()::text||':'||v_action_id,0));
    select * into v_previous from private.wms_replenishment_attend_actions where actor_id=auth.uid() and action_id=v_action_id;
    if found and (v_previous.request_id<>p_payload->>'request_id' or v_previous.quantity<>v_quantity) then
      raise exception 'Identificador já usado para outro atendimento.' using errcode='23514'; end if;
    select * into v_request from public.wms_replenishment_requests
      where id=p_payload->>'request_id' and warehouse_code=p_warehouse for update;
    if not found then raise exception 'Solicitação não encontrada.' using errcode='P0002'; end if;
    if v_previous.action_id is not null then return to_jsonb(v_request); end if;
    if v_request.is_deleted or v_request.cancellation_requested_at is not null
      or v_request.status not in ('ATRIBUIDO','EM_SEPARACAO','ATENDIDO_PARCIAL','SEPARADO','SEM_ESTOQUE')
      or (v_request.responsavel_id is distinct from v_actor and private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR']) is not true) then
      raise exception 'Solicitação indisponível para este responsável.' using errcode='42501'; end if;
    if v_quantity=0 and nullif(trim(p_payload->>'observation'),'') is null then
      raise exception 'Informe o motivo do sem estoque.' using errcode='22023'; end if;
    update public.wms_replenishment_requests set
      quantidade_atendida=coalesce(quantidade_atendida,0)+v_quantity,
      quantidade_pendente=greatest(0,quantidade_solicitada-coalesce(quantidade_atendida,0)-v_quantity),
      status=case when coalesce(quantidade_atendida,0)+v_quantity>=quantidade_solicitada then 'SEPARADO'
        when coalesce(quantidade_atendida,0)+v_quantity>0 then 'ATENDIDO_PARCIAL' else 'SEM_ESTOQUE' end,
      observacao=coalesce(nullif(trim(p_payload->>'observation'),''),observacao),updated_at=now()
      where id=v_request.id returning * into v_request;
    insert into private.wms_replenishment_attend_actions values(auth.uid(),v_action_id,v_request.id,v_quantity);
    return to_jsonb(v_request);
  end if;
  if v_action='CONCLUDE_PORTION' then
    if v_mode<>'SELF' then raise exception 'Conclua sua própria parcela.' using errcode='42501'; end if;
    select * into v_request from public.wms_replenishment_requests
      where id=p_payload->>'request_id' and warehouse_code=p_warehouse for update;
    if not found or v_request.is_deleted or v_request.status='CANCELADO' or v_request.cancellation_requested_at is not null then
      raise exception 'Solicitação indisponível.' using errcode='P0002'; end if;
    update public.wms_replenishment_fulfillments set responsavel_id=v_actor,responsavel_nome=v_name,
      concluded_by_auth_id=auth.uid(),status='CONCLUIDO',finished_at=now(),updated_at=now()
      where request_id=v_request.id and handled_by_id=v_actor and status='ATENDIDO';
    return jsonb_build_object('ok',true);
  end if;
  if v_action='DIRECTORY' then
    if v_mode<>'ADMIN' then raise exception 'Modo administrativo obrigatório.' using errcode='42501'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name),'[]') into v_result
      from (select distinct f.responsavel_id id,f.responsavel_nome name from public.wms_replenishment_fulfillments f
        where f.warehouse_code=p_warehouse and f.responsavel_id is not null) x;
    return v_result;
  end if;
  if v_action='SUMMARY' then
    select jsonb_build_object('owner_id',v_owner,'owner_name',v_name,'items',count(distinct f.codigo_material),
      'portions',count(*),'units',coalesce(sum(f.quantidade_atendida),0),
      'last_export',(select max(b.created_at) from public.wms_replenishment_export_batches b
        where b.warehouse_code=p_warehouse and b.owner_id=v_owner and b.export_state='CONFIRMED'),
      'unfinished',(select coalesce(jsonb_agg(x),'[]') from (
        select f2.request_id,f2.codigo_material,sum(f2.quantidade_atendida) quantity from public.wms_replenishment_fulfillments f2
        join public.wms_replenishment_requests r2 on r2.id=f2.request_id
        where f2.warehouse_code=p_warehouse and f2.handled_by_id=v_owner and f2.status='ATENDIDO'
          and not coalesce(r2.is_deleted,false) and r2.status<>'CANCELADO' and r2.cancellation_requested_at is null
        group by f2.request_id,f2.codigo_material) x),
      'legacy_count',(select count(*) from public.wms_replenishment_requests r3 where r3.warehouse_code=p_warehouse
        and r3.status in ('CONCLUIDO','ENTREGUE_NA_LOJA') and r3.quantidade_atendida>0 and r3.export_batch_id is null
        and not coalesce(r3.is_deleted,false) and not exists(select 1 from public.wms_replenishment_fulfillments f3 where f3.request_id=r3.id)))
      into v_result
    from public.wms_replenishment_fulfillments f join public.wms_replenishment_requests r on r.id=f.request_id
    where f.warehouse_code=p_warehouse and f.responsavel_id=v_owner and f.status='CONCLUIDO'
      and f.export_batch_id is null and f.exported_at is null and not coalesce(r.is_deleted,false)
      and r.status not in ('CANCELADO','CANCELAMENTO_SOLICITADO') and r.cancellation_requested_at is null
      and (v_from is null or f.finished_at>=v_from) and (v_until is null or f.finished_at<v_until);
    return v_result;
  end if;
  if v_action='HISTORY' then
    select coalesce(jsonb_agg(to_jsonb(b) order by b.created_at desc),'[]') into v_result from (
      select * from public.wms_replenishment_export_batches where warehouse_code=p_warehouse
        and ((owner_id=v_owner and format_version=2) or (v_mode='ADMIN' and p_payload->>'legacy'='true' and format_version=1))
        and (v_from is null or created_at>=v_from) and (v_until is null or created_at<v_until)
        order by created_at desc limit 50) b;
    return v_result;
  end if;
  if v_action not in ('RESERVE','CONFIRM','RELEASE','DOWNLOAD') or nullif(trim(v_key),'') is null or length(v_key)>150 then
    raise exception 'Ação ou lote inválido.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('rep-owner:'||p_warehouse||':'||v_owner,0));
  select * into v_batch from public.wms_replenishment_export_batches where id=v_key for update;
  if found then
    if v_batch.warehouse_code<>p_warehouse or (v_batch.owner_id is distinct from v_owner
      and not (v_mode='ADMIN' and v_action='DOWNLOAD' and v_batch.format_version=1))
      or (v_action in ('CONFIRM','RELEASE','RESERVE') and v_batch.created_by<>auth.uid()) then
      raise exception 'Lote não autorizado.' using errcode='42501'; end if;
    if v_action='DOWNLOAD' then
      if v_batch.export_state<>'CONFIRMED' then raise exception 'Confirme o lote antes de baixar.' using errcode='23514'; end if;
      return to_jsonb(v_batch);
    end if;
    if v_action='RELEASE' and v_batch.export_state='RESERVED' then
      update public.wms_replenishment_fulfillments set export_batch_id=null where export_batch_id=v_key and exported_at is null;
      update public.wms_replenishment_export_batches set export_state='RELEASED' where id=v_key returning * into v_batch;
    elsif v_action='CONFIRM' and v_batch.export_state='RESERVED' then
      -- Parent locks serialize cancellation/deletion against confirmation; no parent is modified.
      perform r.id from public.wms_replenishment_requests r where r.id in
        (select f.request_id from public.wms_replenishment_fulfillments f where f.export_batch_id=v_key) order by r.id for update;
      if exists(select 1 from public.wms_replenishment_fulfillments f join public.wms_replenishment_requests r on r.id=f.request_id
        where f.export_batch_id=v_key and (r.is_deleted or r.status in ('CANCELADO','CANCELAMENTO_SOLICITADO') or r.cancellation_requested_at is not null)) then
        raise exception 'Há solicitação cancelada/excluída neste lote. Libere a reserva e atualize.' using errcode='23514'; end if;
      update public.wms_replenishment_fulfillments set exported_at=now(),exported_by_id=auth.uid(),updated_at=now()
        where export_batch_id=v_key and exported_at is null;
      update public.wms_replenishment_export_batches set export_state='CONFIRMED',confirmed_at=now() where id=v_key returning * into v_batch;
    end if;
    if v_batch.export_state='RELEASED' and v_action<>'RELEASE' then raise exception 'Reserva liberada; gere outro lote.' using errcode='23514'; end if;
    return to_jsonb(v_batch);
  end if;
  if v_action<>'RESERVE' then raise exception 'Lote não encontrado.' using errcode='P0002'; end if;
  if exists(select 1 from public.wms_replenishment_export_batches where warehouse_code=p_warehouse and owner_id=v_owner and export_state='RESERVED') then
    raise exception 'Já existe reserva. Continue ou libere o lote no histórico.' using errcode='23514'; end if;
  perform r.id from public.wms_replenishment_requests r where r.id in
    (select f.request_id from public.wms_replenishment_fulfillments f where f.warehouse_code=p_warehouse
      and f.responsavel_id=v_owner and f.status='CONCLUIDO' and f.export_batch_id is null and f.exported_at is null)
    order by r.id for update;
  select array_agg(f.id) into v_ids from public.wms_replenishment_fulfillments f
    join public.wms_replenishment_requests r on r.id=f.request_id
    where f.warehouse_code=p_warehouse and f.responsavel_id=v_owner and f.status='CONCLUIDO'
      and f.export_batch_id is null and f.exported_at is null and not coalesce(r.is_deleted,false)
      and r.status not in ('CANCELADO','CANCELAMENTO_SOLICITADO') and r.cancellation_requested_at is null
      and (v_from is null or f.finished_at>=v_from) and (v_until is null or f.finished_at<v_until);
  if v_ids is null then raise exception 'Você não possui itens concluídos pendentes de exportação.' using errcode='P0002'; end if;
  -- Keep parent id in snapshots for the existing authorized caixa permanent-delete routine.
  select jsonb_agg(to_jsonb(x) order by x.id) into v_snapshot from (
    select request_id id,p_warehouse warehouse_code,codigo_material,sum(quantidade_atendida) quantidade_atendida,
      'CONCLUIDO'::text status,max(finished_at) finished_at,array_agg(id order by id) fulfillment_ids,
      v_owner responsavel_id,v_name responsavel_nome
      from public.wms_replenishment_fulfillments where id=any(v_ids) group by request_id,codigo_material) x;
  insert into public.wms_replenishment_export_batches
    (id,warehouse_code,created_by,created_by_name,requests,owner_id,owner_name,export_mode,export_state,format_version,file_name)
    values(v_key,p_warehouse,auth.uid(),v_actor_name,v_snapshot,v_owner,v_name,v_mode,'RESERVED',2,
      'REPOSICAO_'||p_warehouse||'_'||regexp_replace(upper(v_name),'[^A-Z0-9]+','_','g')||'_'||
      to_char(now() at time zone 'America/Campo_Grande','YYYY-MM-DD_HH24MI')||'_'||left(md5(v_key),8)||'.xlsx') returning * into v_batch;
  update public.wms_replenishment_fulfillments set export_batch_id=v_key,updated_at=now() where id=any(v_ids);
  return to_jsonb(v_batch);
end $$;
revoke all on function private.replenishment_owner_export(text,text,jsonb) from public,anon;
grant execute on function private.replenishment_owner_export(text,text,jsonb) to authenticated;

create function public.wms_replenishment_owner_export(p_warehouse text,p_action text,p_payload jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$
  select private.replenishment_owner_export(p_warehouse,p_action,p_payload)
$$;
revoke all on function public.wms_replenishment_owner_export(text,text,jsonb) from public,anon;
grant execute on function public.wms_replenishment_owner_export(text,text,jsonb) to authenticated;

-- Old clients cannot continue exporting everyone in a warehouse after this migration.
create or replace function public.create_wms_replenishment_export(p_warehouse_code text,p_batch_id text)
returns public.wms_replenishment_export_batches language plpgsql security invoker set search_path='' as $$
declare v_data jsonb; v_row public.wms_replenishment_export_batches;
begin
  v_data:=private.replenishment_owner_export(p_warehouse_code,'RESERVE',jsonb_build_object('batch_id',p_batch_id));
  v_data:=private.replenishment_owner_export(p_warehouse_code,'CONFIRM',jsonb_build_object('batch_id',p_batch_id));
  select * into v_row from jsonb_populate_record(null::public.wms_replenishment_export_batches,v_data);
  return v_row;
end $$;
commit;
