create table public.wms_caixa_requests (
  id uuid primary key,
  warehouse_code text not null,
  requested_by text not null references public.wms_users(id),
  kind text not null check (kind in ('PRODUCT','ADJUSTMENT')),
  sku text not null check (sku ~ '^[0-9]{4,8}$'),
  quantity integer not null check (quantity>0),
  customer_service boolean not null default false,
  notes text not null default '' check (length(notes)<=2000),
  status text not null default 'PENDENTE',
  attended numeric not null default 0 check (attended>=0),
  replenishment_id text unique references public.wms_replenishment_requests(id),
  task_id uuid unique references public.operacao_tarefas(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.wms_caixa_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.wms_caixa_requests(id),
  actor_id text references public.wms_users(id),
  event_type text not null,
  status text not null,
  created_at timestamptz not null default now()
);
create index wms_caixa_requests_owner_time on public.wms_caixa_requests(requested_by,created_at desc);
create index wms_caixa_requests_warehouse_time on public.wms_caixa_requests(warehouse_code,created_at desc);
create index wms_caixa_events_request on public.wms_caixa_request_events(request_id,created_at);

create function private.caixa_has_warehouse(code text) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists (
    select 1 from public.wms_users profile join public.wms_warehouses warehouse on upper(warehouse.code)=upper($1) and warehouse.active
    where profile.id=private.current_wms_profile_id() and profile.role='CAIXA' and profile.active and not coalesce(profile.archived,false)
    and upper($1)=any(regexp_split_to_array(upper(coalesce(nullif(profile.allowed_warehouse_codes,''),profile.default_warehouse_code,profile.warehouse_code,'')),'\s*,\s*'))
  );
$$;
revoke all on function private.caixa_has_warehouse(text) from public,anon,authenticated;
grant execute on function private.caixa_has_warehouse(text) to authenticated;

alter table public.wms_caixa_requests enable row level security;
alter table public.wms_caixa_request_events enable row level security;
revoke all on public.wms_caixa_requests,public.wms_caixa_request_events from anon,authenticated;
grant select on public.wms_caixa_requests,public.wms_caixa_request_events to authenticated;
create policy wms_caixa_requests_read on public.wms_caixa_requests for select to authenticated using (
  (select auth.uid()) is not null and (
    ((select private.current_wms_role())='CAIXA' and requested_by=(select private.current_wms_profile_id()) and private.caixa_has_warehouse(warehouse_code))
    or ((select private.current_wms_role()) in ('ADMINISTRADOR','SUPERVISOR') and private.can_access_warehouse(warehouse_code))
  )
);
create policy wms_caixa_events_read on public.wms_caixa_request_events for select to authenticated
using (exists(select 1 from public.wms_caixa_requests request where request.id=request_id));

do $$
declare target record;
begin
  for target in select tablename from pg_tables where schemaname='public' and tablename like 'wms\_%' escape '\'
    and tablename not in ('wms_users','wms_warehouses','wms_caixa_requests','wms_caixa_request_events')
  loop
    if not (select rowsecurity from pg_tables where schemaname='public' and tablename=target.tablename) then
      raise exception 'Revisar RLS antes de habilitar Caixa: %',target.tablename;
    end if;
    execute format('create policy wms_caixa_operational_isolation on public.%I as restrictive for all to authenticated using ((select private.current_wms_role()) is distinct from ''CAIXA'') with check ((select private.current_wms_role()) is distinct from ''CAIXA'')',target.tablename);
  end loop;
end $$;
create policy wms_caixa_self_only on public.wms_users as restrictive for all to authenticated
using ((select private.current_wms_role()) is distinct from 'CAIXA' or auth_user_id=(select auth.uid()))
with check ((select private.current_wms_role()) is distinct from 'CAIXA');
create policy wms_caixa_warehouse_read on public.wms_warehouses for select to authenticated using (private.caixa_has_warehouse(code));
create policy wms_caixa_management_read on public.wms_users for select to authenticated using (
  (select private.current_wms_role())='SUPERVISOR' and role='CAIXA' and private.can_access_warehouse(default_warehouse_code)
);
create policy wms_caixa_access_request on public.wms_access_requests for insert to anon with check (
  status='PENDENTE' and role_requested='CAIXA' and coalesce(password_hash,'')=''
  and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' and email !~* '\.local$'
);

create function private.submit_wms_caixa_request(request_key uuid,code text,request_kind text,product_code text,units integer,customer boolean,observation text)
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
      or prior.notes is distinct from coalesce(observation,'') or prior.customer_service is distinct from (request_kind='PRODUCT' and coalesce(customer,false)) then
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
      case when coalesce(customer,false) then 'CLIENTE' else 'NORMAL' end,'Solicitação do Caixa. Saldo loja não informado. '||coalesce(observation,''),now(),now());
  end if;
  insert into public.wms_caixa_requests(id,warehouse_code,requested_by,kind,sku,quantity,customer_service,notes,replenishment_id)
  values(request_key,upper(code),actor,request_kind,product_code,units,request_kind='PRODUCT' and coalesce(customer,false),coalesce(observation,''),replenishment);
  insert into public.wms_caixa_request_events(request_id,actor_id,event_type,status) values(request_key,actor,'SUBMITTED','PENDENTE');
  return request_key;
end $$;
revoke all on function private.submit_wms_caixa_request(uuid,text,text,text,integer,boolean,text) from public,anon,authenticated;
grant execute on function private.submit_wms_caixa_request(uuid,text,text,text,integer,boolean,text) to authenticated;
create function public.submit_wms_caixa_request(request_key uuid,code text,request_kind text,product_code text,units integer,customer boolean default false,observation text default '')
returns uuid language sql security invoker set search_path='' as $$ select private.submit_wms_caixa_request(request_key,code,request_kind,product_code,units,customer,observation); $$;
revoke all on function public.submit_wms_caixa_request(uuid,text,text,text,integer,boolean,text) from public,anon;
grant execute on function public.submit_wms_caixa_request(uuid,text,text,text,integer,boolean,text) to authenticated;

create function private.review_wms_caixa_adjustment(request_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare request public.wms_caixa_requests; task public.operacao_tarefas;
begin
  if auth.uid() is null or private.current_wms_profile_id() is null or coalesce(private.current_wms_role(),'') not in ('ADMINISTRADOR','SUPERVISOR') then
    raise exception using errcode='42501',message='Verificação restrita à supervisão.';
  end if;
  select * into request from public.wms_caixa_requests where id=request_key for update;
  if not found or request.kind<>'ADJUSTMENT' or not private.can_access_warehouse(request.warehouse_code) then raise exception 'Ajuste não encontrado no estoque autorizado.'; end if;
  if request.task_id is not null then return request.task_id; end if;
  select * into task from public.criar_tarefa(p_tipo=>'AVULSA'::public.tipo_tarefa_enum,p_titulo=>('Verificar ajuste Caixa - SKU '||request.sku)::varchar,
    p_descricao=>request.notes||' Quantidade informada não define entrada/saída. Não alterar saldos automaticamente.',p_estoque_id=>request.warehouse_code::varchar,
    p_sku_alvo=>request.sku,p_quantidade_planejada=>request.quantity,p_referencia_tipo=>'CAIXA_AJUSTE'::varchar,p_referencia_id=>request.id::varchar);
  update public.wms_caixa_requests set task_id=task.id,status='EM_VERIFICACAO',updated_at=now() where id=request_key;
  insert into public.wms_caixa_request_events(request_id,actor_id,event_type,status) values(request_key,private.current_wms_profile_id(),'REVIEW_REQUESTED','EM_VERIFICACAO');
  return task.id;
end $$;
revoke all on function private.review_wms_caixa_adjustment(uuid) from public,anon,authenticated;
grant execute on function private.review_wms_caixa_adjustment(uuid) to authenticated;
create function public.review_wms_caixa_adjustment(request_key uuid) returns uuid language sql security invoker set search_path='' as $$ select private.review_wms_caixa_adjustment(request_key); $$;
revoke all on function public.review_wms_caixa_adjustment(uuid) from public,anon;
grant execute on function public.review_wms_caixa_adjustment(uuid) to authenticated;

create function private.sync_wms_caixa_request() returns trigger language plpgsql security definer set search_path='' as $$
declare request public.wms_caixa_requests; next_status text; actual_attended numeric;
begin
  if tg_table_name='wms_replenishment_requests' then
    select * into request from public.wms_caixa_requests where replenishment_id=new.id;
    next_status:=new.status; actual_attended:=new.quantidade_atendida;
    if coalesce(new.is_deleted,false) then next_status:='CANCELADO'; end if;
  else
    select * into request from public.wms_caixa_requests where task_id=new.id;
    next_status:=case new.status when 'CONCLUIDA' then 'CONCLUIDO' when 'CANCELADA' then 'CANCELADO' when 'AGUARDANDO_VALIDACAO' then 'AGUARDANDO_VALIDACAO' else 'EM_VERIFICACAO' end;
    actual_attended:=0;
  end if;
  if request.id is null then return new; end if;
  if request.status is distinct from next_status or request.attended is distinct from actual_attended then
    update public.wms_caixa_requests set status=next_status,attended=actual_attended,updated_at=now() where id=request.id;
    insert into public.wms_caixa_request_events(request_id,actor_id,event_type,status) values(request.id,private.current_wms_profile_id(),'STATUS_UPDATED',next_status);
  end if;
  return new;
end $$;
revoke all on function private.sync_wms_caixa_request() from public,anon,authenticated;
create trigger sync_wms_caixa_replenishment after update on public.wms_replenishment_requests for each row execute function private.sync_wms_caixa_request();
create trigger sync_wms_caixa_adjustment after update of status on public.operacao_tarefas for each row execute function private.sync_wms_caixa_request();
