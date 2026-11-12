-- Update our existing job in place; do not pause or remove notification delivery.
-- pg_net's platform-owned queue can be readable by DB roles, so queued headers
-- carry only a nonce-bound HMAC valid for 90 seconds, never the permanent key.
do $migration$
declare target_job bigint;job_sql text:=$job$
 with params as materialized (
  select floor(extract(epoch from clock_timestamp()))::bigint::text as stamp,gen_random_uuid()::text as nonce
 )
 select net.http_post(
  url:=(select decrypted_secret from vault.decrypted_secrets where name='wms_chat_worker_url' limit 1),
  headers:=jsonb_build_object(
   'Content-Type','application/json','x-wms-worker-time',p.stamp,'x-wms-worker-nonce',p.nonce,
   'x-wms-worker-signature',encode(extensions.hmac('wms-chat-drain:'||p.stamp||':'||p.nonce,
    (select decrypted_secret from vault.decrypted_secrets where name='wms_chat_worker_secret' limit 1),'sha256'),'hex')
  ),body:='{"action":"drain"}'::jsonb,timeout_milliseconds:=50000
 ) from params p;
 $job$;
begin
 select jobid into target_job from cron.job where jobname='wms-communication-push' and username=current_user;
 if found then perform cron.alter_job(target_job,command:=job_sql);
 else perform cron.schedule('wms-communication-push','* * * * *',job_sql);
 end if;
end $migration$;
