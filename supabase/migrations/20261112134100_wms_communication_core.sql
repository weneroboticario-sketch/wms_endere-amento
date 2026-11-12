-- Corporate communication is separate from Caixa chat. All mutations use guarded RPCs.
create table public.wms_chat_conversations(
 id uuid primary key default gen_random_uuid(),warehouse_code text not null references public.wms_warehouses(code),
 type text not null check(type in ('DIRECT','GROUP','ANNOUNCEMENT')),title text not null check(length(title) between 1 and 120),
 description text not null default '' check(length(description)<=1000),direct_key text,
 created_by text not null references public.wms_users(id),created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),archived_at timestamptz,
 unique(warehouse_code,direct_key),check((type='DIRECT')=(direct_key is not null))
);
create table public.wms_chat_participants(
 conversation_id uuid not null references public.wms_chat_conversations(id),profile_id text not null references public.wms_users(id),
 membership_role text not null default 'MEMBER' check(membership_role in ('MEMBER','MANAGER')),
 joined_at timestamptz not null default now(),left_at timestamptz,muted_until timestamptz,
 active_until timestamptz,primary key(conversation_id,profile_id)
);
create table public.wms_chat_messages(
 id bigint generated always as identity primary key,conversation_id uuid not null references public.wms_chat_conversations(id),
 sender_profile_id text not null references public.wms_users(id),client_action_id uuid not null,
 body text not null check(length(body) between 1 and 4000),client_payload jsonb not null default '{}',message_type text not null default 'TEXT' check(message_type in ('TEXT','ANNOUNCEMENT','PROCESS','EVIDENCE')),
 priority text not null default 'NORMAL' check(priority in ('NORMAL','URGENT')),reply_to_message_id bigint references public.wms_chat_messages(id),
 title text check(length(title)<=120),due_at timestamptz,requires_ack boolean not null default false,created_at timestamptz not null default now(),
 unique(conversation_id,sender_profile_id,client_action_id)
);
create index wms_chat_history on public.wms_chat_messages(conversation_id,id desc);
create table public.wms_chat_message_receipts(
 message_id bigint not null references public.wms_chat_messages(id),participant_profile_id text not null references public.wms_users(id),
 delivered_at timestamptz,read_at timestamptz,acknowledged_at timestamptz,primary key(message_id,participant_profile_id)
);
create index wms_chat_unread on public.wms_chat_message_receipts(participant_profile_id,message_id) where read_at is null;
create index wms_chat_membership on public.wms_chat_participants(profile_id,conversation_id) where left_at is null;
create table public.wms_chat_attachments(
 id uuid primary key default gen_random_uuid(),conversation_id uuid not null references public.wms_chat_conversations(id),
 message_id bigint references public.wms_chat_messages(id),uploaded_by text not null references public.wms_users(id),
 storage_path text not null unique,mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')),
 size_bytes integer not null check(size_bytes between 1 and 5242880),state text not null default 'UPLOADING' check(state in ('UPLOADING','READY','ATTACHED')),
 created_at timestamptz not null default now()
);
create table public.wms_chat_process_links(
 message_id bigint primary key references public.wms_chat_messages(id),process_type text not null check(process_type in ('SKU','LOCATION','TRANSFER','REPLENISHMENT','DIVERGENCE','TASK','RECEIPT')),
 process_id text not null check(length(process_id) between 1 and 100),warehouse_code text not null references public.wms_warehouses(code)
);
create table public.wms_chat_requests(
 id uuid primary key default gen_random_uuid(),conversation_id uuid not null references public.wms_chat_conversations(id),
 source_message_id bigint not null unique references public.wms_chat_messages(id),linked_task_id uuid not null unique references public.operacao_tarefas(id),
 received_at timestamptz,received_by text references public.wms_users(id),created_at timestamptz not null default now()
);
create table public.wms_chat_request_events(
 id bigint generated always as identity primary key,request_id uuid not null references public.wms_chat_requests(id),
 actor_profile_id text not null references public.wms_users(id),previous_status text,new_status text not null,created_at timestamptz not null default now(),note text check(length(note)<=500)
);
create table public.wms_chat_preferences(
 profile_id text primary key references public.wms_users(id),sound_enabled boolean not null default false,volume numeric not null default 0.5 check(volume between 0 and 1),
 quiet_start integer check(quiet_start between 0 and 1439),quiet_end integer check(quiet_end between 0 and 1439),timezone text not null default 'America/Cuiaba',
 check((quiet_start is null)=(quiet_end is null))
);
create table public.wms_chat_push_subscriptions(
 id uuid primary key default gen_random_uuid(),profile_id text not null references public.wms_users(id),auth_user_id uuid not null references auth.users(id),
 endpoint text not null unique check(length(endpoint)<=2048),subscription_data jsonb not null,created_at timestamptz not null default now(),revoked_at timestamptz
);
create table public.wms_chat_push_outbox(
 message_id bigint not null references public.wms_chat_messages(id),profile_id text not null references public.wms_users(id),
 created_at timestamptz not null default now(),completed_at timestamptz,attempts integer not null default 0,next_attempt_at timestamptz not null default now(),lease_until timestamptz,
 primary key(message_id,profile_id)
);
create table public.wms_chat_policy(
 warehouse_code text primary key references public.wms_warehouses(code),retention_days integer not null default 365 check(retention_days between 90 and 3650),
 urgent_per_hour integer not null default 3 check(urgent_per_hour between 1 and 10)
);

create or replace function private.wms_chat_user_access(p_profile text,p_warehouse text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.wms_users u where u.id=p_profile and u.active and not coalesce(u.archived,false)
 and u.role in ('ADMINISTRADOR','SUPERVISOR','OPERADOR','ATENDENTE','CAIXA') and (
 (u.role='ADMINISTRADOR' and u.is_global_admin is true) or p_warehouse=any(string_to_array(replace(upper(coalesce(nullif(u.allowed_warehouse_codes,''),u.default_warehouse_code,u.warehouse_code,'')),' ',''),','))))
$$;
create or replace function private.wms_chat_member(p_conversation uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.wms_chat_participants p join public.wms_chat_conversations c on c.id=p.conversation_id
 where p.conversation_id=p_conversation and p.profile_id=private.current_wms_profile_id() and p.left_at is null
 and private.can_access_warehouse(c.warehouse_code) and private.wms_chat_user_access(p.profile_id,c.warehouse_code))
$$;
create or replace function private.wms_chat_visible(p_message bigint)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.wms_chat_messages m join public.wms_chat_participants p on p.conversation_id=m.conversation_id
 where m.id=p_message and p.profile_id=private.current_wms_profile_id() and p.left_at is null and m.created_at>=p.joined_at and private.wms_chat_member(m.conversation_id))
$$;
create or replace function private.wms_chat_unit(p_conversation uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.wms_chat_conversations where id=p_conversation and private.can_access_warehouse(warehouse_code))
$$;
revoke all on function private.wms_chat_user_access(text,text),private.wms_chat_member(uuid),private.wms_chat_visible(bigint) from public,anon;
grant execute on function private.wms_chat_member(uuid),private.wms_chat_visible(bigint) to authenticated;
revoke all on function private.wms_chat_unit(uuid) from public,anon;
grant execute on function private.wms_chat_unit(uuid) to authenticated;

alter table public.wms_chat_conversations enable row level security;
alter table public.wms_chat_participants enable row level security;
alter table public.wms_chat_messages enable row level security;
alter table public.wms_chat_message_receipts enable row level security;
alter table public.wms_chat_attachments enable row level security;
alter table public.wms_chat_process_links enable row level security;
alter table public.wms_chat_requests enable row level security;
alter table public.wms_chat_request_events enable row level security;
alter table public.wms_chat_preferences enable row level security;
alter table public.wms_chat_push_subscriptions enable row level security;
alter table public.wms_chat_push_outbox enable row level security;
alter table public.wms_chat_policy enable row level security;
revoke all on public.wms_chat_conversations,public.wms_chat_participants,public.wms_chat_messages,public.wms_chat_message_receipts,
 public.wms_chat_attachments,public.wms_chat_process_links,public.wms_chat_requests,public.wms_chat_request_events,
 public.wms_chat_preferences,public.wms_chat_push_subscriptions,public.wms_chat_push_outbox,public.wms_chat_policy from public,anon,authenticated;
grant select on public.wms_chat_conversations,public.wms_chat_participants,public.wms_chat_messages,public.wms_chat_message_receipts,
 public.wms_chat_attachments,public.wms_chat_process_links,public.wms_chat_requests,public.wms_chat_request_events,public.wms_chat_preferences to authenticated;
create policy chat_conversation_read on public.wms_chat_conversations for select to authenticated using(private.wms_chat_member(id));
create policy chat_participant_read on public.wms_chat_participants for select to authenticated using(private.wms_chat_member(conversation_id) or (
 profile_id=private.current_wms_profile_id() and private.wms_chat_unit(conversation_id)));
create policy chat_message_read on public.wms_chat_messages for select to authenticated using(private.wms_chat_visible(id));
create policy chat_receipt_read on public.wms_chat_message_receipts for select to authenticated using(private.wms_chat_visible(message_id));
create policy chat_attachment_read on public.wms_chat_attachments for select to authenticated using(
 private.wms_chat_member(conversation_id) and ((uploaded_by=private.current_wms_profile_id() and message_id is null) or private.wms_chat_visible(message_id)));
create policy chat_link_read on public.wms_chat_process_links for select to authenticated using(private.wms_chat_visible(message_id));
create policy chat_request_read on public.wms_chat_requests for select to authenticated using(private.wms_chat_visible(source_message_id));
create policy chat_event_read on public.wms_chat_request_events for select to authenticated using(exists(
 select 1 from public.wms_chat_requests r where r.id=request_id and private.wms_chat_visible(r.source_message_id)));
create policy chat_preference_read on public.wms_chat_preferences for select to authenticated using(profile_id=private.current_wms_profile_id());

create or replace function private.wms_chat_process(p_warehouse text,p_type text,p_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; actor text:=private.current_wms_profile_id(); role text:=private.current_wms_role();
begin
 if auth.uid() is null or not private.wms_chat_user_access(actor,p_warehouse) or not private.can_access_warehouse(p_warehouse) then raise exception 'Processo não autorizado.' using errcode='42501';end if;
 case p_type
 when 'SKU' then select jsonb_build_object('id',sku,'title',sku||' — '||product_name,'type',p_type,'warehouse',p_warehouse) into result from public.wms_products where sku=p_id;
 when 'LOCATION' then
  if role not in ('ADMINISTRADOR','SUPERVISOR','OPERADOR') then raise exception 'Localização não autorizada.' using errcode='42501';end if;
  select jsonb_build_object('id',id,'title',coalesce(location_code,codigo_endereco,id),'sku',sku,'type',p_type,'warehouse',p_warehouse) into result from public.wms_bindings where id=p_id and warehouse_code=p_warehouse;
 when 'TRANSFER' then
  if role not in ('ADMINISTRADOR','SUPERVISOR','OPERADOR') then raise exception 'Transferência não autorizada.' using errcode='42501';end if;
  select jsonb_build_object('id',id,'title',codigo_transferencia,'origin',origem_nome,'destination',destino_nome,'status',status,'responsible',responsavel_nome,'type',p_type,'warehouse',p_warehouse) into result
  from public.wms_transfers where id=p_id and warehouse_code=p_warehouse and not coalesce(is_deleted,false) and (role<>'OPERADOR' or responsavel_id=actor);
 when 'REPLENISHMENT' then
  select jsonb_build_object('id',id,'title','Reposição '||codigo_material,'priority',prioridade,'status',status,'type',p_type,'warehouse',p_warehouse) into result
  from public.wms_replenishment_requests where id=p_id and warehouse_code=p_warehouse and not coalesce(is_deleted,false) and (role not in ('CAIXA','ATENDENTE') or solicitado_por_id=actor);
 when 'DIVERGENCE' then
  if role not in ('ADMINISTRADOR','SUPERVISOR','OPERADOR') then raise exception 'Divergência não autorizada.' using errcode='42501';end if;
  select jsonb_build_object('id',d.id,'title','Divergência '||d.sku,'transfer_id',d.transfer_id,'type',p_type,'warehouse',p_warehouse) into result from public.wms_transfer_divergences d
  join public.wms_transfers t on t.id=d.transfer_id where d.id=p_id and d.warehouse_code=p_warehouse and (role<>'OPERADOR' or t.responsavel_id=actor);
 when 'TASK' then
  select jsonb_build_object('id',id,'title',titulo,'status',status,'responsible',atribuido_para,'type',p_type,'warehouse',p_warehouse) into result
  from public.operacao_tarefas where id::text=p_id and estoque_id=p_warehouse and (role in ('ADMINISTRADOR','SUPERVISOR') or atribuido_para=actor or criado_por=actor);
 when 'RECEIPT' then
  if role not in ('ADMINISTRADOR','SUPERVISOR','OPERADOR') then raise exception 'Conferência não autorizada.' using errcode='42501';end if;
  select jsonb_build_object('id',id,'title','NF '||invoice_number,'status',status,'type',p_type,'warehouse',p_warehouse) into result from public.wms_inbound_receipts where id::text=p_id and warehouse_code=p_warehouse and (role<>'OPERADOR' or assigned_to=actor);
 else raise exception 'Tipo de processo inválido.';
 end case;
 if result is null then raise exception 'Registro não encontrado ou acesso negado.' using errcode='42501';end if;
 return result;
end $$;
revoke all on function private.wms_chat_process(text,text,text) from public,anon,authenticated;
create or replace function private.wms_chat_process_safe(p_warehouse text,p_type text,p_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 return private.wms_chat_process(p_warehouse,p_type,p_id);
exception when insufficient_privilege then return null;
end $$;
revoke all on function private.wms_chat_process_safe(text,text,text) from public,anon,authenticated;

create or replace function private.wms_chat_api(p_warehouse text,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor text:=private.current_wms_profile_id();role text:=private.current_wms_role();leader boolean;
 cid uuid;conv public.wms_chat_conversations;msg public.wms_chat_messages;oldmsg public.wms_chat_messages;
 participant text;member_ids text[];pair text;kind text;result jsonb;mid bigint;item jsonb;asset public.wms_chat_attachments;
 req public.wms_chat_requests;task public.operacao_tarefas;previous text;next_status text;new_task public.operacao_tarefas;
 action_id uuid;urgent boolean;count_limit integer;quiet_a integer;quiet_b integer;zone text;members_count integer;
begin
 if auth.uid() is null or actor is null or not private.can_access_warehouse(p_warehouse)
 or not private.wms_chat_user_access(actor,p_warehouse) then raise exception 'Comunicação não autorizada neste estoque.' using errcode='42501';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>65536 then raise exception 'Dados inválidos ou muito grandes.';end if;
 leader:=role in ('ADMINISTRADOR','SUPERVISOR');
 if p_action='DIRECTORY' then
  select coalesce(jsonb_agg(to_jsonb(u)),'[]') into result from (
   select person.id,person.name,person.role from public.wms_users person where private.wms_chat_user_access(person.id,p_warehouse)
   and (person.name ilike '%'||left(coalesce(p_data->>'search',''),80)||'%' or person.username ilike '%'||left(coalesce(p_data->>'search',''),80)||'%')
   order by person.name,person.id limit 100
  ) u;return result;
 elsif p_action='PROCESS' then return private.wms_chat_process(p_warehouse,p_data->>'type',p_data->>'id');
 elsif p_action='DIVERGENCES' then
  perform private.wms_chat_process(p_warehouse,'TRANSFER',p_data->>'id');
  select coalesce(jsonb_agg(to_jsonb(d)),'[]') into result from (
   select id,sku,divergence_type from public.wms_transfer_divergences where warehouse_code=p_warehouse and transfer_id=p_data->>'id' order by created_at desc,id limit 100
  ) d;return result;
 elsif p_action='POLICY' then
  if not leader then raise exception 'Configuração da unidade restrita à liderança.' using errcode='42501';end if;
  if p_data ? 'retention_days' then
   insert into public.wms_chat_policy(warehouse_code,retention_days,urgent_per_hour) values(p_warehouse,(p_data->>'retention_days')::integer,(p_data->>'urgent_per_hour')::integer)
   on conflict(warehouse_code) do update set retention_days=excluded.retention_days,urgent_per_hour=excluded.urgent_per_hour;
  end if;
  return coalesce((select to_jsonb(policy) from public.wms_chat_policy policy where warehouse_code=p_warehouse),jsonb_build_object('retention_days',365,'urgent_per_hour',3));
 elsif p_action='PREFERENCES' then
  if p_data ? 'sound_enabled' then
   quiet_a:=(p_data->>'quiet_start')::integer;quiet_b:=(p_data->>'quiet_end')::integer;zone:=coalesce(p_data->>'timezone','America/Cuiaba');
   if not exists(select 1 from pg_catalog.pg_timezone_names where name=zone) then raise exception 'Fuso horário inválido.';end if;
   insert into public.wms_chat_preferences(profile_id,sound_enabled,volume,quiet_start,quiet_end,timezone)
   values(actor,(p_data->>'sound_enabled')::boolean,(p_data->>'volume')::numeric,quiet_a,quiet_b,zone)
   on conflict(profile_id) do update set sound_enabled=excluded.sound_enabled,volume=excluded.volume,quiet_start=excluded.quiet_start,quiet_end=excluded.quiet_end,timezone=excluded.timezone;
  end if;
  return coalesce((select to_jsonb(p) from public.wms_chat_preferences p where p.profile_id=actor),jsonb_build_object('sound_enabled',false,'volume',0.5,'timezone','America/Cuiaba'));
 elsif p_action='LIST' then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (
   select c.id,c.type,c.title,c.description,c.updated_at,c.archived_at,p.membership_role,p.muted_until,
   case when c.type='DIRECT' then (select u.name from public.wms_chat_participants peer join public.wms_users u on u.id=peer.profile_id where peer.conversation_id=c.id and peer.profile_id<>actor limit 1) else c.title end display_name,
   (select left(m.body,120) from public.wms_chat_messages m where m.conversation_id=c.id and m.created_at>=p.joined_at order by m.id desc limit 1) preview,
   (select count(*)::int from public.wms_chat_message_receipts r join public.wms_chat_messages m on m.id=r.message_id where r.participant_profile_id=actor and r.read_at is null and m.conversation_id=c.id and m.created_at>=p.joined_at) unread,
   exists(select 1 from public.wms_chat_message_receipts r join public.wms_chat_messages m on m.id=r.message_id where r.participant_profile_id=actor and r.read_at is null and m.conversation_id=c.id and m.created_at>=p.joined_at and m.priority='URGENT') urgent_unread,
   exists(select 1 from public.wms_chat_messages m join public.wms_chat_message_receipts r on r.message_id=m.id where m.conversation_id=c.id and r.participant_profile_id=actor and r.acknowledged_at is null and m.requires_ack and m.created_at>=p.joined_at) pending_ack
   from public.wms_chat_conversations c join public.wms_chat_participants p on p.conversation_id=c.id
   where c.warehouse_code=p_warehouse and p.profile_id=actor and p.left_at is null and private.wms_chat_member(c.id)
   and (coalesce(p_data->>'search','')='' or c.title ilike '%'||left(p_data->>'search',80)||'%' or exists(
    select 1 from public.wms_chat_participants peer join public.wms_users u on u.id=peer.profile_id
    where peer.conversation_id=c.id and u.name ilike '%'||left(p_data->>'search',80)||'%'))
   and (not (p_data ? 'before_at') or (c.updated_at,c.id)<((p_data->>'before_at')::timestamptz,(p_data->>'before_id')::uuid))
   order by c.updated_at desc,c.id desc limit 50
  ) x;return result;
 elsif p_action='UNREAD' then
  return (select jsonb_build_object('count',count(*)::int) from public.wms_chat_message_receipts r join public.wms_chat_messages m on m.id=r.message_id
   where r.participant_profile_id=actor and r.read_at is null and private.wms_chat_visible(m.id) and exists(select 1 from public.wms_chat_conversations c where c.id=m.conversation_id and c.warehouse_code=p_warehouse));
 elsif p_action='CREATE' then
  kind:=coalesce(p_data->>'type','DIRECT');
  if kind not in ('DIRECT','GROUP','ANNOUNCEMENT') or (kind<>'DIRECT' and not leader) then raise exception 'Criação de grupo/comunicado não autorizada.' using errcode='42501';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('chat-create:'||actor,0));
  if (select count(*) from public.wms_chat_conversations where created_by=actor and created_at>now()-interval '1 hour')>=20 then raise exception 'Limite de novas conversas por hora atingido.';end if;
  if kind='DIRECT' then
   participant:=p_data->>'peer';
   if participant=actor or not private.wms_chat_user_access(participant,p_warehouse) then raise exception 'Destinatário inválido.';end if;
   select array_agg(x order by x) into member_ids from unnest(array[actor,participant]) x;pair:=to_jsonb(member_ids)::text;
   select id into cid from public.wms_chat_conversations where warehouse_code=p_warehouse and direct_key=pair;
   if cid is not null then return jsonb_build_object('id',cid);end if;
  elsif p_data->>'audience'='UNIT' and kind='ANNOUNCEMENT' then
   select array_agg(id) into member_ids from public.wms_users where private.wms_chat_user_access(id,p_warehouse);
  else
   if jsonb_typeof(p_data->'members') is distinct from 'array' then raise exception 'Selecione os participantes.';end if;
   select array_agg(distinct x) into member_ids from (
    select jsonb_array_elements_text(p_data->'members') x union select actor
   ) ids;
  end if;
  if coalesce(cardinality(member_ids),0) not between 2 and 200 then raise exception 'Selecione de 2 a 200 participantes.';end if;
  foreach participant in array member_ids loop
   if not private.wms_chat_user_access(participant,p_warehouse) then raise exception 'Participante sem acesso à unidade.' using errcode='42501';end if;
  end loop;
  insert into public.wms_chat_conversations(warehouse_code,type,title,description,direct_key,created_by)
  values(p_warehouse,kind,case when kind='DIRECT' then 'Conversa individual' else btrim(coalesce(p_data->>'title','')) end,coalesce(p_data->>'description',''),pair,actor) returning id into cid;
  insert into public.wms_chat_participants(conversation_id,profile_id,membership_role)
  select cid,x,case when x=actor and kind<>'DIRECT' then 'MANAGER' else 'MEMBER' end from unnest(member_ids) x;
  return jsonb_build_object('id',cid);
 elsif p_action='PUSH_SUBSCRIBE' then
  if coalesce(p_data->>'endpoint','') !~ '^https://(fcm.googleapis.com|web.push.apple.com|[a-zA-Z0-9.-]+\.push.services.mozilla.com|[a-zA-Z0-9.-]+\.notify.windows.com)/' or length(p_data->>'endpoint')>2048 or jsonb_typeof(p_data->'keys') is distinct from 'object' then raise exception 'Inscrição inválida.';end if;
  if exists(select 1 from public.wms_chat_push_subscriptions where endpoint=p_data->>'endpoint' and profile_id<>actor and revoked_at is null) then raise exception 'Dispositivo já vinculado a outra conta. Desative as notificações nessa conta primeiro.';end if;
  if (select count(*) from public.wms_chat_push_subscriptions where profile_id=actor and revoked_at is null)>=10 and not exists(select 1 from public.wms_chat_push_subscriptions where endpoint=p_data->>'endpoint' and profile_id=actor) then raise exception 'Limite de dispositivos atingido.';end if;
  insert into public.wms_chat_push_subscriptions(profile_id,auth_user_id,endpoint,subscription_data) values(actor,auth.uid(),p_data->>'endpoint',p_data)
  on conflict(endpoint) do update set profile_id=excluded.profile_id,auth_user_id=excluded.auth_user_id,subscription_data=excluded.subscription_data,revoked_at=null,created_at=now();
  return jsonb_build_object('subscribed',true);
 elsif p_action='PUSH_UNSUBSCRIBE' then
  update public.wms_chat_push_subscriptions set revoked_at=now() where profile_id=actor and endpoint=p_data->>'endpoint';
  return jsonb_build_object('subscribed',false);
 elsif p_action='REQUESTS' then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (
   select r.id,r.conversation_id,r.source_message_id::text source_message_id,r.linked_task_id,t.codigo_visivel,t.titulo,t.prioridade,t.prazo_sla,t.atribuido_para,u.name assignee_name,
   case when t.status='CONCLUIDA' then 'FINALIZADO' when t.status='CANCELADA' then 'CANCELADO' when t.status='EM_ANDAMENTO' then 'EM ANDAMENTO'
    when t.status='AGUARDANDO_VALIDACAO' then 'AGUARDANDO CONFIRMAÇÃO' when t.status='BLOQUEADA' then 'PRECISO DE AJUDA' when r.received_at is not null then 'RECEBIDO' else 'PENDENTE' end status,
   t.status task_status,r.received_at,t.data_criacao,t.data_conclusao,t.prazo_sla<now() and t.status not in ('CONCLUIDA','CANCELADA') overdue,
   (select jsonb_agg(to_jsonb(ev) order by ev.id) from public.wms_chat_request_events ev where ev.request_id=r.id) events
   from public.wms_chat_requests r join public.operacao_tarefas t on t.id=r.linked_task_id left join public.wms_users u on u.id=t.atribuido_para
   where t.estoque_id=p_warehouse and private.wms_chat_visible(r.source_message_id) and (leader or t.atribuido_para=actor or t.criado_por=actor)
   order by t.data_criacao desc,r.id limit 100
  ) x;return result;
 end if;
 cid:=(p_data->>'conversation_id')::uuid;
 select * into conv from public.wms_chat_conversations where id=cid and warehouse_code=p_warehouse;
 if not found or not private.wms_chat_member(cid) then raise exception 'Conversa não autorizada.' using errcode='42501';end if;
 if p_action='NOTIFY_AUTH' then
  select id into mid from public.wms_chat_messages where id=(p_data->>'message_id')::bigint and conversation_id=cid and sender_profile_id=actor and private.wms_chat_visible(id);
  if mid is null then raise exception 'Notificação não autorizada.' using errcode='42501';end if;
  return jsonb_build_object('id',mid::text);
 elsif p_action='DETAIL' then
  return to_jsonb(conv)||jsonb_build_object('members',(select jsonb_agg(jsonb_build_object('id',p.profile_id,'name',u.name,'role',p.membership_role,'left_at',p.left_at,'joined_at',p.joined_at))
   from public.wms_chat_participants p join public.wms_users u on u.id=p.profile_id where p.conversation_id=cid));
 elsif p_action='MESSAGES' then
  select coalesce(jsonb_agg(x.payload order by x.id),'[]') into result from (
   select m.id,(to_jsonb(m)-'client_payload')||jsonb_build_object('id',m.id::text,'sender_name',u.name,
    'reply',case when private.wms_chat_visible(m.reply_to_message_id) then (select jsonb_build_object('id',parent.id::text,'body',left(parent.body,160),'sender',sender.name) from public.wms_chat_messages parent join public.wms_users sender on sender.id=parent.sender_profile_id where parent.id=m.reply_to_message_id) end,
    'receipts',(select coalesce(jsonb_agg(jsonb_build_object('profile_id',r.participant_profile_id,'name',person.name,'delivered_at',r.delivered_at,'read_at',r.read_at,'acknowledged_at',r.acknowledged_at)),'[]') from public.wms_chat_message_receipts r join public.wms_users person on person.id=r.participant_profile_id where r.message_id=m.id),
    'attachments',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'storage_path',a.storage_path,'mime_type',a.mime_type,'size_bytes',a.size_bytes)),'[]') from public.wms_chat_attachments a where a.message_id=m.id and a.state='ATTACHED'),
    'process',(select to_jsonb(l)||jsonb_build_object('context',private.wms_chat_process_safe(l.warehouse_code,l.process_type,l.process_id)) from public.wms_chat_process_links l where l.message_id=m.id)
   ) payload from public.wms_chat_messages m join public.wms_users u on u.id=m.sender_profile_id
   where m.conversation_id=cid and private.wms_chat_visible(m.id) and (not(p_data ? 'before_id') or m.id<(p_data->>'before_id')::bigint)
   order by m.id desc limit 40
  ) x;return result;
 elsif p_action='GROUP' then
  if not leader or conv.type='DIRECT' or not exists(select 1 from public.wms_chat_participants where conversation_id=cid and profile_id=actor and left_at is null and membership_role='MANAGER') then raise exception 'Gestão do grupo não autorizada.' using errcode='42501';end if;
  perform 1 from public.wms_chat_conversations where id=cid for update;
  case p_data->>'operation'
   when 'ADD' then
    participant:=p_data->>'profile_id';
    if not private.wms_chat_user_access(participant,p_warehouse) then raise exception 'Participante não autorizado.';end if;
    select count(*) into members_count from public.wms_chat_participants where conversation_id=cid and left_at is null;
    if members_count>=200 then raise exception 'Grupo limitado a 200 participantes.';end if;
    insert into public.wms_chat_participants(conversation_id,profile_id) values(cid,participant)
    on conflict(conversation_id,profile_id) do update set left_at=null,joined_at=case when wms_chat_participants.left_at is not null then now() else wms_chat_participants.joined_at end;
   when 'REMOVE' then
    participant:=p_data->>'profile_id';
    if participant=actor then raise exception 'Transfira a gestão antes de sair.';end if;
    update public.wms_chat_participants set left_at=now(),active_until=null where conversation_id=cid and profile_id=participant;
   when 'MANAGER' then
    participant:=p_data->>'profile_id';
    if not exists(select 1 from public.wms_users where id=participant and role in ('ADMINISTRADOR','SUPERVISOR')) then raise exception 'Gestor deve ser administrador ou supervisor.';end if;
    update public.wms_chat_participants set membership_role='MANAGER' where conversation_id=cid and profile_id=participant and left_at is null;
   when 'ARCHIVE' then update public.wms_chat_conversations set archived_at=now() where id=cid;
   when 'RESTORE' then update public.wms_chat_conversations set archived_at=null where id=cid;
   when 'EDIT' then update public.wms_chat_conversations set title=btrim(p_data->>'title'),description=coalesce(p_data->>'description','') where id=cid;
   else raise exception 'Ação de grupo inválida.';
  end case;
  update public.wms_chat_conversations set updated_at=now() where id=cid;
  return jsonb_build_object('updated',true);
 elsif p_action='MUTE' then
  update public.wms_chat_participants set muted_until=(p_data->>'until')::timestamptz where conversation_id=cid and profile_id=actor;
  return jsonb_build_object('updated',true);
 elsif p_action='PRESENCE' then
  update public.wms_chat_participants set active_until=case when coalesce((p_data->>'active')::boolean,false) then now()+interval '100 seconds' end where conversation_id=cid and profile_id=actor;
  return jsonb_build_object('updated',true);
 elsif p_action='RECEIPT' then
  if jsonb_typeof(p_data->'ids') is distinct from 'array' or jsonb_array_length(p_data->'ids')>40 or p_data->>'state' not in ('DELIVERED','READ','ACK') then raise exception 'Confirmação inválida.';end if;
  foreach mid in array array(select jsonb_array_elements_text(p_data->'ids')::bigint) loop
   if exists(select 1 from public.wms_chat_messages where id=mid and conversation_id=cid and private.wms_chat_visible(id)) then
    update public.wms_chat_message_receipts set delivered_at=coalesce(delivered_at,now()),
     read_at=case when p_data->>'state' in ('READ','ACK') then coalesce(read_at,now()) else read_at end,
     acknowledged_at=case when p_data->>'state'='ACK' then coalesce(acknowledged_at,now()) else acknowledged_at end
    where message_id=mid and participant_profile_id=actor;
   end if;
  end loop;
  return jsonb_build_object('updated',true);
 elsif p_action='RESERVE_ATTACHMENT' then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('chat-upload:'||actor,0));
  if (select count(*) from public.wms_chat_attachments where uploaded_by=actor and created_at>now()-interval '1 hour')>=20 then raise exception 'Limite de 20 anexos por hora.';end if;
  asset.id:=gen_random_uuid();
  insert into public.wms_chat_attachments(id,conversation_id,uploaded_by,storage_path,mime_type,size_bytes)
  values(asset.id,cid,actor,actor||'/'||cid::text||'/'||asset.id::text,p_data->>'mime_type',(p_data->>'size_bytes')::integer) returning * into asset;
  return to_jsonb(asset);
 elsif p_action='ATTACHMENT' then
  select * into asset from public.wms_chat_attachments where id=(p_data->>'id')::uuid and conversation_id=cid
   and ((uploaded_by=actor and message_id is null) or private.wms_chat_visible(message_id));
  if not found then raise exception 'Anexo não autorizado.' using errcode='42501';end if;
  return to_jsonb(asset);
 elsif p_action='SEND' then
  action_id:=(p_data->>'client_action_id')::uuid;
  if action_id is null then raise exception 'Identificador de envio obrigatório.';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('chat-send:'||actor,0));
  select * into oldmsg from public.wms_chat_messages where conversation_id=cid and sender_profile_id=actor and client_action_id=action_id;
  if found then
   if oldmsg.client_payload is distinct from p_data then raise exception 'Identificador já usado com outro conteúdo.';end if;
   return jsonb_build_object('id',oldmsg.id::text,'conversation_id',cid,'duplicate',true);
  end if;
  if conv.archived_at is not null then raise exception 'Conversa arquivada.';end if;
  if (conv.type='ANNOUNCEMENT' or p_data->>'message_type'='ANNOUNCEMENT') and not leader then raise exception 'Apenas liderança publica comunicados.' using errcode='42501';end if;
  if (select count(*) from public.wms_chat_messages where sender_profile_id=actor and created_at>now()-interval '1 minute')>=20 then raise exception 'Limite de 20 mensagens por minuto.';end if;
  urgent:=coalesce(p_data->>'priority'='URGENT',false);
  if urgent then
   if conv.type<>'DIRECT' and not leader then raise exception 'Urgência coletiva restrita à liderança.' using errcode='42501';end if;
   select coalesce((select urgent_per_hour from public.wms_chat_policy where warehouse_code=p_warehouse),3) into count_limit;
   if (select count(*) from public.wms_chat_messages where sender_profile_id=actor and priority='URGENT' and created_at>now()-interval '1 hour')>=count_limit then raise exception 'Limite de urgências por hora.';end if;
  end if;
  if p_data ? 'reply_to' and not exists(select 1 from public.wms_chat_messages where id=(p_data->>'reply_to')::bigint and conversation_id=cid and private.wms_chat_visible(id)) then raise exception 'Mensagem respondida não autorizada.' using errcode='42501';end if;
  if p_data ? 'process' then perform private.wms_chat_process(p_warehouse,p_data->'process'->>'type',p_data->'process'->>'id');end if;
  if jsonb_typeof(coalesce(p_data->'attachments','[]'))<>'array' or jsonb_array_length(coalesce(p_data->'attachments','[]'))>3 then raise exception 'Até 3 anexos por mensagem.';end if;
  for item in select value from jsonb_array_elements(coalesce(p_data->'attachments','[]')) loop
   perform 1 from public.wms_chat_attachments where id=(item#>>'{}')::uuid and uploaded_by=actor and conversation_id=cid and state='READY' and message_id is null for update;
   if not found then raise exception 'Anexo não validado ou já utilizado.' using errcode='42501';end if;
  end loop;
  insert into public.wms_chat_messages(conversation_id,sender_profile_id,client_action_id,body,client_payload,priority,reply_to_message_id,title,due_at,requires_ack,message_type)
  values(cid,actor,action_id,btrim(p_data->>'body'),p_data,coalesce(p_data->>'priority','NORMAL'),(p_data->>'reply_to')::bigint,
   p_data->>'title',(p_data->>'due_at')::timestamptz,urgent or coalesce((p_data->>'requires_ack')::boolean,false),
   case when conv.type='ANNOUNCEMENT' or p_data->>'message_type'='ANNOUNCEMENT' then 'ANNOUNCEMENT' when p_data ? 'process' then 'PROCESS' when jsonb_array_length(coalesce(p_data->'attachments','[]'))>0 then 'EVIDENCE' else 'TEXT' end) returning * into msg;
  if p_data ? 'process' then insert into public.wms_chat_process_links values(msg.id,p_data->'process'->>'type',p_data->'process'->>'id',p_warehouse);end if;
  update public.wms_chat_attachments set message_id=msg.id,state='ATTACHED' where id in (select (value#>>'{}')::uuid from jsonb_array_elements(coalesce(p_data->'attachments','[]')));
  insert into public.wms_chat_message_receipts(message_id,participant_profile_id)
  select msg.id,p.profile_id from public.wms_chat_participants p where p.conversation_id=cid and p.left_at is null and p.profile_id<>actor and private.wms_chat_user_access(p.profile_id,p_warehouse);
  insert into public.wms_chat_push_outbox(message_id,profile_id) select msg.id,r.participant_profile_id from public.wms_chat_message_receipts r where r.message_id=msg.id;
  update public.wms_chat_conversations set updated_at=now() where id=cid;
  return jsonb_build_object('id',msg.id::text,'conversation_id',cid,'created_at',msg.created_at,'duplicate',false);
 elsif p_action='CREATE_REQUEST' then
  if not leader then raise exception 'Criação de tarefa restrita à liderança.' using errcode='42501';end if;
  select * into msg from public.wms_chat_messages where id=(p_data->>'message_id')::bigint and conversation_id=cid and private.wms_chat_visible(id) for update;
  if not found then raise exception 'Mensagem não autorizada.' using errcode='42501';end if;
  select * into req from public.wms_chat_requests where source_message_id=msg.id;
  if found then return to_jsonb(req);end if;
  participant:=nullif(p_data->>'assignee','');
  if participant is not null and not exists(select 1 from public.wms_chat_participants where conversation_id=cid and profile_id=participant and left_at is null and private.wms_chat_user_access(profile_id,p_warehouse)) then raise exception 'Responsável deve participar da conversa e da unidade.';end if;
  new_task:=public.criar_tarefa('AVULSA',left(coalesce(nullif(p_data->>'title',''),msg.body),120),msg.body,p_warehouse,null,null,null,'WMS_CHAT',msg.id::text,participant,
   coalesce(nullif(p_data->>'priority',''),'NORMAL')::public.prioridade_tarefa_enum,(p_data->>'due_at')::timestamptz,jsonb_build_object('conversation_id',cid,'source_message_id',msg.id::text));
  insert into public.wms_chat_requests(conversation_id,source_message_id,linked_task_id) values(cid,msg.id,new_task.id) returning * into req;
  insert into public.wms_chat_request_events(request_id,actor_profile_id,new_status) values(req.id,actor,'PENDENTE');
  update public.wms_chat_conversations set updated_at=now() where id=cid;return to_jsonb(req);
 elsif p_action='REQUEST_ACTION' then
  select * into req from public.wms_chat_requests where id=(p_data->>'request_id')::uuid and conversation_id=cid and private.wms_chat_visible(source_message_id) for update;
  if not found then raise exception 'Solicitação não autorizada.' using errcode='42501';end if;
  select * into task from public.operacao_tarefas where id=req.linked_task_id and estoque_id=p_warehouse for update;
  if not found then raise exception 'Tarefa não autorizada.' using errcode='42501';end if;
  previous:=task.status::text;
  if not leader and task.atribuido_para is distinct from actor then raise exception 'Ação permitida somente ao responsável.' using errcode='42501';end if;
  if task.status in ('CONCLUIDA','CANCELADA') then raise exception 'Solicitação encerrada.';end if;
  case p_data->>'operation'
   when 'RECEBIDO' then
    if task.atribuido_para is distinct from actor then raise exception 'Somente o responsável confirma recebimento.';end if;
    if req.received_at is not null then return to_jsonb(req);end if;
    update public.wms_chat_requests set received_at=now(),received_by=actor where id=req.id;next_status:='RECEBIDO';
   when 'EM_ANDAMENTO' then task:=public.iniciar_tarefa(task.id,p_data->>'note');next_status:=task.status::text;
   when 'FINALIZADO' then task:=public.concluir_tarefa(task.id,'{}',p_data->>'note');next_status:=task.status::text;
   when 'AJUDA' then task:=public.bloquear_tarefa(task.id,p_data->>'note');next_status:=task.status::text;
   when 'VALIDAR' then task:=public.validar_tarefa(task.id,p_data->>'note');next_status:=task.status::text;
   when 'CANCELAR' then task:=public.cancelar_tarefa(task.id,p_data->>'note');next_status:=task.status::text;
   when 'ATRIBUIR' then
    participant:=p_data->>'assignee';
    if not leader or not exists(select 1 from public.wms_chat_participants where conversation_id=cid and profile_id=participant and left_at is null and private.wms_chat_user_access(profile_id,p_warehouse)) then raise exception 'Atribuição não autorizada.';end if;
    task:=public.atribuir_tarefa(task.id,participant,p_data->>'note');next_status:=task.status::text;
   else raise exception 'Ação de solicitação inválida.';
  end case;
  insert into public.wms_chat_request_events(request_id,actor_profile_id,previous_status,new_status,note) values(req.id,actor,previous,next_status,left(p_data->>'note',500));
  update public.wms_chat_conversations set updated_at=now() where id=cid;
  return jsonb_build_object('request_id',req.id,'status',next_status);
 end if;
 raise exception 'Ação de comunicação inválida.';
end $$;
revoke all on function private.wms_chat_api(text,text,jsonb) from public,anon;
grant execute on function private.wms_chat_api(text,text,jsonb) to authenticated;
create or replace function public.wms_chat_api(p_warehouse text,p_action text,p_data jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$select private.wms_chat_api(p_warehouse,p_action,p_data)$$;
revoke all on function public.wms_chat_api(text,text,jsonb) from public,anon;
grant execute on function public.wms_chat_api(text,text,jsonb) to authenticated;

alter table public.wms_chat_participants replica identity full;
do $$
declare tab text;
begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach tab in array array['wms_chat_conversations','wms_chat_participants','wms_chat_message_receipts'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=tab) then
    execute format('alter publication supabase_realtime add table public.%I',tab);
   end if;
  end loop;
 end if;
end $$;
