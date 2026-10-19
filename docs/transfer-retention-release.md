# CP Alamo: transfer archive and 60-day trash

Scope: CP Alamo only (`ztxdqvxvkfgfqowaiaep`, `feature/cpalamo-compras-nf-reversa`).
Do not apply to the separate WMS Enderecamento project.

## Release Order

1. Apply `transfer-retention.sql` to the CP database. Existing rows default to ACTIVE;
   no existing deletion is backdated or automatically made eligible for cleanup.
2. Deploy `supabase/functions/purge-transfer-retention/index.ts` and `worker.js` as
   `purge-transfer-retention`. JWT verification is replaced with the function's
   Vault-backed custom worker-token authentication. Never expose the service key.
3. Apply `transfer-retention-schedule.sql`. It creates the encrypted worker secret,
   service-only authorization RPC and an hourly Cron call. Do not print Vault values.
4. Publish the tested frontend to the CP project, then update the CP alias.
5. Verify anonymous RPC denial, removed queues and the scheduled job's responses.
   Do not retire or delete a real user's transfer just to test the release.

## Guarantees

- One server transaction retires the parent, archives linked tasks and retires notifications.
- All active transfers queries already exclude `is_deleted`; both archive and trash set it.
- Archive has no purge deadline. Trash gets exactly 60 days from server time.
- Original fiscal/physical stages, invoices and items remain unchanged during retention.
- Hard deletion and purge RPCs are unavailable to browser users.
- The worker removes only files inside the scoped transfer folder using Storage API;
  it never deletes `storage.objects` metadata directly.
- Database cleanup occurs only after Storage is empty and the lease/deadline match.
- Storage failure keeps the process for retry after the 15-minute worker lease.
- Cleanup removes transfer items, divergences, events, merge references, notifications,
  linked operational tasks (task history cascades), scoped fiscal history and the parent.
- App deletion does not cancel an NF at SEFAZ or erase provider backups/log retention.

## Pause Cleanup

Use `select cron.unschedule('wms-transfer-retention-60-days');` to stop future runs.
This does not restore already purged data. Archive/trash continue retaining records.

## Verification

- `tests/transfer-retention.test.js`: roles, reason, concurrency, idempotency, archived
  tasks, fiscal/expedition stages, blocked early purge, Storage ordering, full related cleanup.
- `scripts/verify-expedition.mjs`: native confirmation, rejected blank reason, removed
  active entry, closed drawer, trash entry with countdown, desktop/mobile screenshots.
