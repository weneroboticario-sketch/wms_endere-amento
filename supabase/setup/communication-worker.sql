-- Opt-in server-side scheduling. Run only in the explicitly approved environment.
-- Provision Vault entries via a secure admin flow; never commit actual secrets:
-- wms_chat_worker_url = https://PROJECT_REF.supabase.co/functions/v1/wms-communication
-- wms_chat_worker_secret = same random 32+ character WMS_CHAT_WORKER_SECRET configured on the Edge Function.
create extension if not exists pg_cron;
create extension if not exists pg_net;
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
