-- Read-only verification. Install/recover through the reviewed migrations:
-- 20261112140839_wms_communication_push_worker.sql
-- 20261112141546_wms_communication_signed_worker.sql
-- Provision only this module's Vault entries through a secure admin session.
-- Never print decrypted keys or put permanent credentials in queued headers.
select jobname,schedule,active,
 position('x-wms-worker-signature' in command)>0 as signed_requests,
 position('x-wms-worker-secret' in command)=0 as no_permanent_key_header
from cron.job where jobname='wms-communication-push';
