begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$begin
  if not exists(select 1 from vault.secrets where name='wms_transfer_retention_worker') then
    perform vault.create_secret(gen_random_uuid()::text||gen_random_uuid()::text,'wms_transfer_retention_worker');
  end if;
end $$;
create or replace function public.wms_transfer_retention_authorize(p_token text) returns boolean
language sql security definer set search_path='' as $$
  select length(coalesce(p_token,''))>=64 and exists(select 1 from vault.decrypted_secrets
    where name='wms_transfer_retention_worker' and decrypted_secret=p_token)
$$;
revoke all on function public.wms_transfer_retention_authorize(text) from public,anon,authenticated;
grant execute on function public.wms_transfer_retention_authorize(text) to service_role;

-- The secret stays encrypted in Vault, not in source, cron text or browser configuration.
select cron.schedule('wms-transfer-retention-60-days','17 * * * *',$job$
  select net.http_post(
    url:='https://ztxdqvxvkfgfqowaiaep.supabase.co/functions/v1/purge-transfer-retention',
    headers:=jsonb_build_object('Content-Type','application/json','x-retention-token',
      (select decrypted_secret from vault.decrypted_secrets where name='wms_transfer_retention_worker')),
    body:='{}'::jsonb,timeout_milliseconds:=60000);
$job$);
notify pgrst,'reload schema';
commit;
