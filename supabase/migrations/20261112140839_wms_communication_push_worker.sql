-- Push configuration is service-only; Vault stays encrypted at rest and is not
-- exposed as a PostgREST schema. No secrets are embedded in this migration.
grant usage on schema private to service_role;
create or replace function private.wms_chat_push_config()
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(upper(name),decrypted_secret),'{}'::jsonb)
 from vault.decrypted_secrets where name in (
  'wms_chat_vapid_public_key','wms_chat_vapid_private_key','wms_chat_vapid_subject',
  'wms_chat_worker_secret','wms_chat_allowed_origins'
 )
$$;
revoke all on function private.wms_chat_push_config() from public,anon,authenticated;
grant execute on function private.wms_chat_push_config() to service_role;
create or replace function public.wms_chat_push_config()
returns jsonb language sql stable security invoker set search_path='' as $$select private.wms_chat_push_config()$$;
revoke all on function public.wms_chat_push_config() from public,anon,authenticated;
grant execute on function public.wms_chat_push_config() to service_role;

-- Server-side scheduling. Run only in the explicitly approved environment.
-- Provision Vault entries via a secure admin flow; never commit actual secrets:
-- wms_chat_worker_url = https://PROJECT_REF.supabase.co/functions/v1/wms-communication
-- wms_chat_worker_secret = same random 32+ character WMS_CHAT_WORKER_SECRET configured on the Edge Function.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
-- Queued headers contain the worker credential until pg_net sends the request.
revoke all on net.http_request_queue,net._http_response from public,anon,authenticated;
do $$
begin
 if not exists(select 1 from vault.decrypted_secrets where name='wms_chat_worker_url')
 or not exists(select 1 from vault.decrypted_secrets where name='wms_chat_worker_secret' and length(decrypted_secret)>=32) then
  raise exception 'Configure os dois segredos da Comunicação no Vault antes de agendar o worker.';
 end if;
end $$;
select cron.unschedule(jobid) from cron.job where jobname='wms-communication-push';
select cron.schedule('wms-communication-push','* * * * *',$job$
 select net.http_post(
  url:=(select decrypted_secret from vault.decrypted_secrets where name='wms_chat_worker_url' limit 1),
  headers:=jsonb_build_object('Content-Type','application/json','x-wms-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name='wms_chat_worker_secret' limit 1)),
  body:='{"action":"drain"}'::jsonb,timeout_milliseconds:=50000
 );
$job$);
