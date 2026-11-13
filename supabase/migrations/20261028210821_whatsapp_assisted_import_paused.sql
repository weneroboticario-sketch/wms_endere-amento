create table public.wms_assisted_settings (
  warehouse_code text primary key check (warehouse_code='VDCG'),
  intake_enabled boolean not null default false,
  changed_by text references public.wms_users(id),
  changed_at timestamptz not null default now()
);
insert into public.wms_assisted_settings(warehouse_code) values('VDCG');
alter table public.wms_assisted_settings enable row level security;
revoke all on public.wms_assisted_settings from anon,authenticated;
grant select on public.wms_assisted_settings to authenticated;
create policy wms_assisted_settings_read on public.wms_assisted_settings for select to authenticated
using ((select auth.uid()) is not null and (select private.current_wms_role()) in ('ADMINISTRADOR','SUPERVISOR') and private.can_access_warehouse(warehouse_code));

create table public.wms_assisted_requests (
  id uuid primary key,
  warehouse_code text not null check (warehouse_code = 'VDCG'),
  source_group text not null default 'VDCG | Abastecimento Loja' check (source_group = 'VDCG | Abastecimento Loja'),
  original_text text not null check (length(original_text) between 1 and 20000),
  approved_payload jsonb not null,
  approved_by text not null references public.wms_users(id),
  approved_at timestamptz not null default now(),
  redacted_at timestamptz,
  duplicate_reviewed boolean not null default false
);

create table public.wms_assisted_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.wms_assisted_requests(id),
  source_line integer not null check (source_line > 0),
  sku text not null check (sku ~ '^[0-9]{4,8}$'),
  requested integer not null check (requested > 0),
  kind text not null check (kind in ('REPLENISHMENT','ADJUSTMENT')),
  customer_service boolean not null,
  priority integer not null check (priority between 1 and 4),
  observation text not null default '',
  attended integer not null default 0 check (attended >= 0 and attended <= requested),
  revision integer not null default 0,
  started_at timestamptz,
  fulfilled_at timestamptz,
  verified_at timestamptz,
  verification_note text,
  created_at timestamptz not null default now(),
  task_id uuid unique references public.operacao_tarefas(id),
  unique (request_id, source_line)
);

create table public.wms_assisted_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.wms_assisted_requests(id),
  actor_id text not null references public.wms_users(id),
  event_type text not null,
  item_id uuid references public.wms_assisted_request_items(id),
  operation_id uuid unique,
  amount integer,
  note text,
  created_at timestamptz not null default now()
);

create index wms_assisted_requests_warehouse_time on public.wms_assisted_requests(warehouse_code, approved_at desc);
create index wms_assisted_items_request on public.wms_assisted_request_items(request_id);
create index wms_assisted_events_request_time on public.wms_assisted_request_events(request_id, created_at);

alter table public.wms_assisted_requests enable row level security;
alter table public.wms_assisted_request_items enable row level security;
alter table public.wms_assisted_request_events enable row level security;

revoke all on public.wms_assisted_requests, public.wms_assisted_request_items, public.wms_assisted_request_events from anon, authenticated;
grant select on public.wms_assisted_requests, public.wms_assisted_request_items, public.wms_assisted_request_events to authenticated;

create policy wms_assisted_requests_read on public.wms_assisted_requests
for select to authenticated using (
  (select auth.uid()) is not null
  and (select private.current_wms_role()) in ('ADMINISTRADOR','SUPERVISOR')
  and private.can_access_warehouse(warehouse_code)
);

create policy wms_assisted_items_read on public.wms_assisted_request_items
for select to authenticated using (exists (
  select 1 from public.wms_assisted_requests request where request.id = request_id
) or (
  (select auth.uid()) is not null and (select private.current_wms_role()) = 'OPERADOR'
  and exists (select 1 from public.operacao_tarefas task where task.id=task_id
    and task.atribuido_para=(select private.current_wms_profile_id())
    and private.can_access_warehouse(task.estoque_id))
));

create policy wms_assisted_events_read on public.wms_assisted_request_events
for select to authenticated using (exists (
  select 1 from public.wms_assisted_requests request where request.id = request_id
));

create function private.approve_whatsapp_assisted_request(
  request_key uuid, original_message text, reviewed_items jsonb, duplicate_reviewed boolean default false
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor text;
  prior public.wms_assisted_requests;
  item jsonb;
  new_item public.wms_assisted_request_items;
  task public.operacao_tarefas;
  quantity integer;
  priority integer;
  operation_kind text;
  customer boolean;
begin
  actor := private.current_wms_profile_id();
  if auth.uid() is null or actor is null
     or coalesce(private.current_wms_role(), '') not in ('ADMINISTRADOR','SUPERVISOR')
     or not coalesce(private.can_access_warehouse('VDCG'), false) then
    raise exception using errcode='42501', message='Sem permissão para aprovar solicitações do VDCG.';
  end if;
  if request_key is null or original_message is null or length(btrim(original_message)) = 0
     or length(original_message) > 20000 or jsonb_typeof(reviewed_items) is distinct from 'array' then
    raise exception using errcode='22023', message='Solicitação inválida.';
  end if;
  if jsonb_array_length(reviewed_items) not between 1 and 100 then
    raise exception using errcode='22023', message='Informe entre 1 e 100 itens revisados.';
  end if;
  perform pg_advisory_xact_lock(hashtext('wms-assisted-vdcg'));
  select * into prior from public.wms_assisted_requests where id=request_key;
  if found then
    if prior.approved_by is distinct from actor or prior.original_text is distinct from original_message
       or prior.approved_payload is distinct from reviewed_items then
      raise exception using errcode='22023', message='Chave já usada para outra aprovação.';
    end if;
    return prior.id;
  end if;
  if not exists (select 1 from public.wms_assisted_settings where warehouse_code='VDCG' and intake_enabled) then
    raise exception 'Novas importações estão pausadas pelo supervisor.';
  end if;
  if not coalesce(duplicate_reviewed, false) and exists (
    select 1 from public.wms_assisted_requests
    where warehouse_code='VDCG' and approved_at > now() - interval '24 hours'
      and lower(regexp_replace(btrim(original_text), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(original_message), '\s+', ' ', 'g'))
  ) then
    raise exception using errcode='22023', message='Possível duplicidade: exige revisão explícita.';
  end if;
  insert into public.wms_assisted_requests(id,warehouse_code,original_text,approved_payload,approved_by,duplicate_reviewed)
  values (request_key,'VDCG',original_message,reviewed_items,actor,coalesce(duplicate_reviewed,false));
  for item in select value from jsonb_array_elements(reviewed_items) loop
    if jsonb_typeof(item) is distinct from 'object'
       or coalesce(item->>'sku','') !~ '^[0-9]{4,8}$'
       or coalesce(item->>'quantity','') !~ '^[1-9][0-9]{0,6}$'
       or coalesce(item->>'sourceLine','') !~ '^[1-9][0-9]{0,4}$'
       or coalesce(item->>'kind','') not in ('REPLENISHMENT','ADJUSTMENT')
       or jsonb_typeof(item->'client') is distinct from 'boolean'
       or coalesce(item->>'priority','') !~ '^[1-4]$'
       or length(coalesce(item->>'observation','')) > 2000 then
      raise exception using errcode='22023', message='Item inválido: revise código, quantidade, contexto e prioridade.';
    end if;
    quantity := (item->>'quantity')::integer;
    operation_kind := item->>'kind';
    customer := (item->>'client')::boolean;
    priority := case when operation_kind='ADJUSTMENT' then 4 when customer then 1 else (item->>'priority')::integer end;
    if not customer and priority=1 then
      raise exception using errcode='22023', message='Prioridade máxima exige indicação de atendimento ao cliente.';
    end if;
    insert into public.wms_assisted_request_items(request_id,source_line,sku,requested,kind,customer_service,priority,observation)
    values (request_key,(item->>'sourceLine')::integer,item->>'sku',quantity,operation_kind,customer,priority,coalesce(item->>'observation',''))
    returning * into new_item;
    select * into task from public.criar_tarefa(
      p_tipo => case when operation_kind='ADJUSTMENT' then 'AVULSA'::public.tipo_tarefa_enum else 'REPOSICAO'::public.tipo_tarefa_enum end,
      p_titulo => (case when operation_kind='ADJUSTMENT' then 'Verificar ajuste ' when customer then 'CLIENTE - SKU ' else 'Abastecimento SKU ' end || new_item.sku)::varchar,
      p_descricao => 'Origem assistida WhatsApp. Solicitação ' || request_key::text || '. Sem movimentação automática de estoque.',
      p_estoque_id => 'VDCG'::varchar,
      p_sku_alvo => new_item.sku,
      p_quantidade_planejada => quantity,
      p_referencia_tipo => 'WHATSAPP_ITEM'::varchar,
      p_referencia_id => new_item.id::varchar,
      p_prioridade => case when priority=1 then 'URGENTE'::public.prioridade_tarefa_enum when priority=2 then 'ALTA'::public.prioridade_tarefa_enum else 'NORMAL'::public.prioridade_tarefa_enum end,
      p_resultado_execucao => jsonb_build_object('assisted_request_id',request_key,'assisted_item_id',new_item.id,'operation_kind',operation_kind)
    );
    update public.wms_assisted_request_items set task_id=task.id where id=new_item.id;
  end loop;
  insert into public.wms_assisted_request_events(request_id,actor_id,event_type)
  values (request_key,actor,case when duplicate_reviewed then 'APPROVED_DUPLICATE_REVIEWED' else 'APPROVED' end);
  return request_key;
end;
$$;

revoke all on function private.approve_whatsapp_assisted_request(uuid,text,jsonb,boolean) from public, anon, authenticated;
grant execute on function private.approve_whatsapp_assisted_request(uuid,text,jsonb,boolean) to authenticated;

create function public.approve_whatsapp_assisted_request(
  request_key uuid, original_message text, reviewed_items jsonb, duplicate_reviewed boolean default false
) returns uuid language sql security invoker set search_path = '' as $$
  select private.approve_whatsapp_assisted_request(request_key,original_message,reviewed_items,duplicate_reviewed);
$$;
revoke all on function public.approve_whatsapp_assisted_request(uuid,text,jsonb,boolean) from public, anon;
grant execute on function public.approve_whatsapp_assisted_request(uuid,text,jsonb,boolean) to authenticated;

create function private.guard_whatsapp_assisted_task() returns trigger
language plpgsql security definer set search_path='' as $$
declare item public.wms_assisted_request_items;
begin
  if old.referencia_tipo is distinct from 'WHATSAPP_ITEM' then return new; end if;
  if auth.uid() is null or private.current_wms_profile_id() is null
     or not coalesce(private.can_access_warehouse(old.estoque_id),false)
     or coalesce(private.current_wms_role(),'') not in ('ADMINISTRADOR','SUPERVISOR','OPERADOR')
     or (private.current_wms_role()='OPERADOR' and old.atribuido_para is distinct from private.current_wms_profile_id()) then
    raise exception using errcode='42501',message='Sem permissão para alterar esta tarefa vinculada.';
  end if;
  select * into item from public.wms_assisted_request_items where task_id=old.id;
  if not found then raise exception 'Vínculo de solicitação não encontrado.'; end if;
  if new.referencia_tipo is distinct from old.referencia_tipo or new.referencia_id is distinct from old.referencia_id
     or new.estoque_id is distinct from old.estoque_id or new.sku_alvo is distinct from old.sku_alvo
     or new.quantidade_planejada is distinct from old.quantidade_planejada then
    raise exception 'Não é permitido alterar a origem, SKU, estoque ou quantidade da tarefa vinculada.';
  end if;
  if new.status in ('CONCLUIDA','AGUARDANDO_VALIDACAO') and new.status is distinct from old.status then
    if (item.kind='REPLENISHMENT' and item.attended < item.requested)
       or (item.kind='ADJUSTMENT' and item.verified_at is null) then
      raise exception 'Registre o atendimento dos itens ou a verificação do ajuste antes de concluir.';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.guard_whatsapp_assisted_task() from public,anon,authenticated;
create trigger guard_whatsapp_assisted_task before update on public.operacao_tarefas
for each row execute function private.guard_whatsapp_assisted_task();

create function private.record_whatsapp_assisted_work(
  item_key uuid, operation_key uuid, expected_revision integer, quantity integer default null, verification text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  item public.wms_assisted_request_items;
  task public.operacao_tarefas;
  prior public.wms_assisted_request_events;
  actor text;
  role_name text;
begin
  actor := private.current_wms_profile_id();
  role_name := coalesce(private.current_wms_role(),'');
  if auth.uid() is null or actor is null or role_name not in ('ADMINISTRADOR','SUPERVISOR','OPERADOR')
     or not coalesce(private.can_access_warehouse('VDCG'),false) then
    raise exception using errcode='42501',message='Sem permissão para registrar atendimento.';
  end if;
  select * into task from public.operacao_tarefas where id=(select task_id from public.wms_assisted_request_items where id=item_key) for update;
  if not found or task.estoque_id<>'VDCG' or (role_name='OPERADOR' and task.atribuido_para is distinct from actor) then
    raise exception using errcode='42501',message='Item não encontrado ou não atribuído ao usuário.';
  end if;
  select * into item from public.wms_assisted_request_items where id=item_key for update;
  if operation_key is null then raise exception 'Chave da operação obrigatória.'; end if;
  select * into prior from public.wms_assisted_request_events where operation_id=operation_key;
  if found then
    if prior.item_id is distinct from item_key or prior.actor_id is distinct from actor
       or prior.amount is distinct from quantity or prior.note is distinct from verification then
      raise exception 'Chave de operação já utilizada com outro conteúdo.';
    end if;
    return item_key;
  end if;
  if expected_revision is distinct from item.revision then raise exception 'Item alterado; atualize antes de tentar novamente.'; end if;
  if task.status in ('CONCLUIDA','CANCELADA','AGUARDANDO_VALIDACAO') then raise exception 'Tarefa finalizada ou aguardando validação.'; end if;
  if item.kind='ADJUSTMENT' then
    if role_name not in ('ADMINISTRADOR','SUPERVISOR') or quantity is not null
       or length(btrim(coalesce(verification,''))) not between 3 and 2000 then
      raise exception 'Ajuste exige verificação documentada de supervisor; não movimenta estoque.';
    end if;
    update public.wms_assisted_request_items set verified_at=now(), verification_note=verification,
      started_at=coalesce(started_at,now()), revision=revision+1 where id=item_key;
  else
    if verification is not null or quantity is null or quantity<=0 or quantity>item.requested-item.attended then
      raise exception 'Quantidade inválida ou maior que a pendente.';
    end if;
    update public.wms_assisted_request_items set attended=attended+quantity, revision=revision+1,
      started_at=coalesce(started_at,now()),
      fulfilled_at=case when attended+quantity=requested then now() else null end where id=item_key;
  end if;
  insert into public.wms_assisted_request_events(request_id,actor_id,event_type,item_id,operation_id,amount,note)
  values(item.request_id,actor,case when item.kind='ADJUSTMENT' then 'ADJUSTMENT_VERIFIED' else 'QUANTITY_ATTENDED' end,item_key,operation_key,quantity,verification);
  if item.kind='ADJUSTMENT' or item.attended+quantity=item.requested then
    perform public.concluir_tarefa(item.task_id,'{}'::jsonb,'Atendimento registrado por item da solicitação WhatsApp.');
  else
    update public.operacao_tarefas set status='EM_ANDAMENTO',data_inicio=coalesce(data_inicio,now()) where id=item.task_id;
  end if;
  return item_key;
end $$;
revoke all on function private.record_whatsapp_assisted_work(uuid,uuid,integer,integer,text) from public,anon,authenticated;
grant execute on function private.record_whatsapp_assisted_work(uuid,uuid,integer,integer,text) to authenticated;
create function public.record_whatsapp_assisted_work(
  item_key uuid, operation_key uuid, expected_revision integer, quantity integer default null, verification text default null
) returns uuid language sql security invoker set search_path='' as $$
  select private.record_whatsapp_assisted_work(item_key,operation_key,expected_revision,quantity,verification);
$$;
revoke all on function public.record_whatsapp_assisted_work(uuid,uuid,integer,integer,text) from public,anon;
grant execute on function public.record_whatsapp_assisted_work(uuid,uuid,integer,integer,text) to authenticated;

create function private.redact_whatsapp_assisted_closed_requests(before_date timestamptz)
returns integer language plpgsql security definer set search_path='' as $$
declare retained_request_id uuid; total integer := 0;
begin
  if auth.uid() is null or private.current_wms_profile_id() is null
     or coalesce(private.current_wms_role(),'')<>'ADMINISTRADOR'
     or not coalesce(private.can_access_warehouse('VDCG'),false) then
    raise exception using errcode='42501',message='Retenção restrita ao administrador do VDCG.';
  end if;
  if before_date is null or before_date>now()-interval '30 days' then
    raise exception 'Informe limite de retenção de pelo menos 30 dias.';
  end if;
  for retained_request_id in select request.id from public.wms_assisted_requests request
    where request.approved_at<before_date and request.redacted_at is null
      and not exists (select 1 from public.wms_assisted_request_items item
        left join public.operacao_tarefas task on task.id=item.task_id
        where item.request_id=request.id and (task.status is null or task.status not in ('CONCLUIDA','CANCELADA')))
    for update of request
  loop
    update public.wms_assisted_requests set original_text='[Texto removido pela política de retenção]',approved_payload='[]'::jsonb,redacted_at=now() where id=retained_request_id;
    update public.wms_assisted_request_items set observation='',verification_note=null where request_id=retained_request_id;
    update public.wms_assisted_request_events set note=null where request_id=retained_request_id;
    insert into public.wms_assisted_request_events(request_id,actor_id,event_type)
    values(retained_request_id,private.current_wms_profile_id(),'RETENTION_REDACTED');
    total := total+1;
  end loop;
  return total;
end $$;
revoke all on function private.redact_whatsapp_assisted_closed_requests(timestamptz) from public,anon,authenticated;
grant execute on function private.redact_whatsapp_assisted_closed_requests(timestamptz) to authenticated;
create function public.redact_whatsapp_assisted_closed_requests(before_date timestamptz)
returns integer language sql security invoker set search_path='' as $$
  select private.redact_whatsapp_assisted_closed_requests(before_date);
$$;
revoke all on function public.redact_whatsapp_assisted_closed_requests(timestamptz) from public,anon;
grant execute on function public.redact_whatsapp_assisted_closed_requests(timestamptz) to authenticated;

create function private.set_whatsapp_assisted_intake(enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or private.current_wms_profile_id() is null
     or coalesce(private.current_wms_role(),'') not in ('ADMINISTRADOR','SUPERVISOR')
     or not coalesce(private.can_access_warehouse('VDCG'),false) or enabled is null then
    raise exception using errcode='42501',message='Sem permissão para pausar ou retomar importações.';
  end if;
  perform pg_advisory_xact_lock(hashtext('wms-assisted-vdcg'));
  update public.wms_assisted_settings set intake_enabled=enabled,changed_by=private.current_wms_profile_id(),changed_at=now() where warehouse_code='VDCG';
end $$;
revoke all on function private.set_whatsapp_assisted_intake(boolean) from public,anon,authenticated;
grant execute on function private.set_whatsapp_assisted_intake(boolean) to authenticated;
create function public.set_whatsapp_assisted_intake(enabled boolean)
returns void language sql security invoker set search_path='' as $$ select private.set_whatsapp_assisted_intake(enabled); $$;
revoke all on function public.set_whatsapp_assisted_intake(boolean) from public,anon;
grant execute on function public.set_whatsapp_assisted_intake(boolean) to authenticated;

