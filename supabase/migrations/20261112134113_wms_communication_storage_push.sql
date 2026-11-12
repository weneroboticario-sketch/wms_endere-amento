insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('wms-communication','wms-communication',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy wms_chat_evidence_upload on storage.objects for insert to authenticated with check(
 bucket_id='wms-communication' and exists(select 1 from public.wms_chat_attachments a where a.storage_path=name
 and a.uploaded_by=private.current_wms_profile_id() and a.state='UPLOADING' and a.created_at>now()-interval '30 minutes' and private.wms_chat_member(a.conversation_id)));
create policy wms_chat_evidence_read on storage.objects for select to authenticated using(
 bucket_id='wms-communication' and exists(select 1 from public.wms_chat_attachments a where a.storage_path=name and private.wms_chat_member(a.conversation_id)
 and ((a.uploaded_by=private.current_wms_profile_id() and a.state='READY') or (a.state='ATTACHED' and private.wms_chat_visible(a.message_id)))));

create table public.wms_chat_push_deliveries(
 message_id bigint not null references public.wms_chat_messages(id),subscription_id uuid not null references public.wms_chat_push_subscriptions(id),
 accepted_at timestamptz not null default now(),primary key(message_id,subscription_id)
);
alter table public.wms_chat_push_deliveries enable row level security;
revoke all on public.wms_chat_push_deliveries from public,anon,authenticated;
create index wms_chat_push_pending on public.wms_chat_push_outbox(next_attempt_at) where completed_at is null;

create or replace function private.wms_chat_server(p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; row_data public.wms_chat_push_outbox;sub jsonb;count_limit integer;message_key bigint;recipient text;
begin
 if p_action='FINALIZE_ATTACHMENT' then
  update public.wms_chat_attachments set state='READY' where id=(p_data->>'id')::uuid and uploaded_by=p_data->>'actor' and state='UPLOADING' and message_id is null
   and private.wms_chat_user_access(uploaded_by,(select warehouse_code from public.wms_chat_conversations where id=conversation_id)) returning to_jsonb(wms_chat_attachments) into result;
  if result is null then raise exception 'Anexo não pode ser confirmado.';end if;return result;
 elsif p_action='CLAIM' then
  count_limit:=least(30,greatest(1,coalesce((p_data->>'limit')::integer,20)));
  with candidates as (
   select message_id,profile_id from public.wms_chat_push_outbox where completed_at is null and next_attempt_at<=now() and (lease_until is null or lease_until<now())
    and (not(p_data ? 'message_id') or message_id=(p_data->>'message_id')::bigint)
   order by created_at,message_id limit count_limit for update skip locked
  ),claimed as (
   update public.wms_chat_push_outbox o set lease_until=now()+interval '5 minutes',attempts=attempts+1 from candidates q
   where o.message_id=q.message_id and o.profile_id=q.profile_id returning o.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
   'message_id',o.message_id::text,'profile_id',o.profile_id,'attempts',o.attempts,'warehouse',c.warehouse_code,'conversation_id',c.id,
   'eligible',private.wms_chat_user_access(o.profile_id,c.warehouse_code) and p.left_at is null and m.created_at>=p.joined_at and r.read_at is null and o.profile_id<>m.sender_profile_id,
   'muted_until',p.muted_until,'active_until',p.active_until,'quiet_start',prefs.quiet_start,'quiet_end',prefs.quiet_end,'timezone',coalesce(prefs.timezone,'America/Cuiaba'),
   'subscriptions',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'data',s.subscription_data)),'[]')
    from public.wms_chat_push_subscriptions s where s.profile_id=o.profile_id and s.revoked_at is null
    and exists(select 1 from public.wms_users u where u.id=o.profile_id and u.auth_user_id=s.auth_user_id)
    and not exists(select 1 from public.wms_chat_push_deliveries d where d.subscription_id=s.id and d.message_id=o.message_id))
  )),'[]') into result from claimed o join public.wms_chat_messages m on m.id=o.message_id join public.wms_chat_conversations c on c.id=m.conversation_id
  join public.wms_chat_participants p on p.conversation_id=c.id and p.profile_id=o.profile_id
  join public.wms_chat_message_receipts r on r.message_id=m.id and r.participant_profile_id=o.profile_id left join public.wms_chat_preferences prefs on prefs.profile_id=o.profile_id;
  return result;
 elsif p_action='FINISH' then
  message_key:=(p_data->>'message_id')::bigint;recipient:=p_data->>'profile_id';
  select * into row_data from public.wms_chat_push_outbox where message_id=message_key and profile_id=recipient for update;
  if not found then raise exception 'Notificação não encontrada.';end if;
  for sub in select value from jsonb_array_elements(coalesce(p_data->'accepted','[]')) loop
   if exists(select 1 from public.wms_chat_push_subscriptions where id=(sub#>>'{}')::uuid and profile_id=recipient) then
    insert into public.wms_chat_push_deliveries(message_id,subscription_id) values(message_key,(sub#>>'{}')::uuid) on conflict do nothing;
   end if;
  end loop;
  update public.wms_chat_push_subscriptions set revoked_at=now() where profile_id=recipient and id in (select (value#>>'{}')::uuid from jsonb_array_elements(coalesce(p_data->'invalid','[]')));
  update public.wms_chat_push_outbox set lease_until=null,
   completed_at=case when p_data->>'outcome'='DONE' or (p_data->>'outcome'='RETRY' and attempts>=5) then now() else null end,
   attempts=case when p_data->>'outcome' in ('QUIET','ACTIVE') then greatest(0,attempts-1) else attempts end,
   next_attempt_at=now()+case when p_data->>'outcome'='QUIET' then interval '15 minutes' when p_data->>'outcome'='ACTIVE' then interval '1 minute' else least(3600,power(2,least(attempts,8))*15)*interval '1 second' end
  where message_id=message_key and profile_id=recipient;
  return jsonb_build_object('updated',true);
 end if;
 raise exception 'Ação de serviço inválida.';
end $$;
revoke all on function private.wms_chat_server(text,jsonb) from public,anon,authenticated;
grant execute on function private.wms_chat_server(text,jsonb) to service_role;
create or replace function public.wms_chat_server(p_action text,p_data jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$select private.wms_chat_server(p_action,p_data)$$;
revoke all on function public.wms_chat_server(text,jsonb) from public,anon,authenticated;
grant execute on function public.wms_chat_server(text,jsonb) to service_role;
