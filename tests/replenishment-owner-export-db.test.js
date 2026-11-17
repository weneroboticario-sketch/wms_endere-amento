import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { buildReplenishmentExportRows } from '../src/replenishment-export.js';

const migration = new URL('../supabase/migrations/20261117194313_replenishment_owner_export.sql', import.meta.url);
const users = { g: '00000000-0000-0000-0000-000000000001', b: '00000000-0000-0000-0000-000000000002',
  k: '00000000-0000-0000-0000-000000000003', a: '00000000-0000-0000-0000-000000000004', c: '00000000-0000-0000-0000-000000000005' };
async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema private;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create table wms_users(id text primary key,auth_user_id uuid,name text,username text,role text,active boolean default true,archived boolean default false);
    create function private.current_wms_profile_id() returns text language sql security definer set search_path='' as $$
      select id from public.wms_users where auth_user_id=auth.uid() and active and not archived$$;
    create function private.has_wms_role(text[]) returns boolean language sql security definer set search_path='' as $$
      select coalesce((select role=any($1) from public.wms_users where id=private.current_wms_profile_id()),false)$$;
    create function private.current_wms_allowed_warehouses() returns text[] language sql as $$select array['VDCG']::text[]$$;
    create table wms_schema_version(id text primary key,version text,description text,applied_at timestamptz,applied_by text);
    create table wms_replenishment_requests(id text primary key,warehouse_code text,codigo_material text,nome_material text default 'Produto',
      localizacao_wms text,quantidade_solicitada numeric default 10,quantidade_atendida numeric default 0,quantidade_pendente numeric default 10,
      responsavel_id text,status text default 'EM_SEPARACAO',is_deleted boolean default false,cancellation_requested_at timestamptz,
      started_at timestamptz default now(),finished_at timestamptz,updated_at timestamptz default now(),observacao text);
    insert into wms_replenishment_requests(id,warehouse_code,codigo_material,quantidade_atendida,status,responsavel_id) values
      ('legacy','VDCG','99999',8,'CONCLUIDO','g');`);
  for (const [id, auth] of Object.entries(users)) await db.query('insert into wms_users(id,auth_user_id,name,username,role) values($1,$2,$3,$1,$4)',
    [id, auth, { g: 'Guilherme', b: 'Barreto', k: 'Kauã', a: 'Administrador', c: 'Caixa' }[id], id === 'a' ? 'ADMINISTRADOR' : id === 'c' ? 'CAIXA' : 'OPERADOR']);
  await db.exec(await readFile(new URL('../supabase/migrations/20261010122825_replenishment_export_batches.sql', import.meta.url), 'utf8'));
  await db.exec(`create policy legacy_all on wms_replenishment_export_batches for all to authenticated using(true) with check(true);
    grant usage on schema public,auth,private to authenticated,anon;
    grant select,update on wms_replenishment_requests to authenticated;
    insert into wms_replenishment_export_batches(id,warehouse_code,created_by,requests) values
    ('legacy-batch','VDCG','${users.g}','[{"id":"old","warehouse_code":"VDCG","codigo_material":"00178","status":"CONCLUIDO","quantidade_atendida":2}]');`);
  await db.exec(await readFile(migration, 'utf8'));
  const actor = async id => { await db.exec('reset role'); await db.query("select set_config('test.uid',$1,false)", [users[id] || '']); await db.exec('set role authenticated'); };
  const api = async (action, payload = {}, warehouse = 'VDCG') => (await db.query('select public.wms_replenishment_owner_export($1,$2,$3::jsonb) result', [warehouse, action, JSON.stringify(payload)])).rows[0].result;
  const request = async (id, sku = '00178', actorId = 'g', warehouse = 'VDCG') => {
    await db.exec('reset role'); await db.query('insert into wms_replenishment_requests(id,codigo_material,warehouse_code,responsavel_id) values($1,$2,$3,$4)', [id, sku, warehouse, actorId]); await actor(actorId);
  };
  const attend = (id, qty, key = crypto.randomUUID()) => api('ATTEND', { request_id: id, quantity: qty, action_id: key });
  const conclude = id => api('CONCLUDE_PORTION', { request_id: id });
  return { db, actor, api, request, attend, conclude };
}

test('individual export: real SQL ownership, split portions, batch lifecycle, RLS and regressions', async t => {
  const s = await setup(); const { db, actor, api, request, attend, conclude } = s;
  try {
    await t.test('legacy is never assigned from mutable request owner', async () => {
      await actor('g'); const summary = await api('SUMMARY'); assert.equal(summary.items, 0); assert.equal(summary.legacy_count, 1);
      await assert.rejects(api('RESERVE', { batch_id: 'empty' }), /não possui/);
    });
    await t.test('three authenticated users handle distinct portions of the same request', async () => {
      await request('split'); await attend('split', 6, 'g-six'); await conclude('split');
      await db.exec("update wms_replenishment_requests set responsavel_id='b' where id='split'");
      await actor('b'); await attend('split', 3, 'b-three'); await conclude('split');
      await db.exec("update wms_replenishment_requests set responsavel_id='k' where id='split'");
      await actor('k'); await attend('split', 1, 'k-one'); await conclude('split');
      for (const [who, qty] of [['g', 6], ['b', 3], ['k', 1]]) {
        await actor(who); assert.equal((await api('SUMMARY')).units, qty);
        const batch = await api('RESERVE', { batch_id: `split-${who}` });
        assert.deepEqual(buildReplenishmentExportRows(batch.requests, 'VDCG'), [['00178', qty]]);
        assert.equal(batch.requests[0].responsavel_id, who); assert.equal(batch.requests[0].fulfillment_ids.length, 1);
        await api('CONFIRM', { batch_id: batch.id });
      }
      assert.equal((await db.query("select quantidade_atendida,status from wms_replenishment_requests where id='split'")).rows[0].status, 'SEPARADO');
    });
    await t.test('only completed portions; same SKU different requests aggregates without losing sources', async () => {
      await request('p1', '89678'); await attend('p1', 3); await conclude('p1');
      await request('p2', '89678'); await attend('p2', 2); await conclude('p2');
      await request('unfinished', '00002'); await attend('unfinished', 5);
      const batch = await api('RESERVE', { batch_id: 'aggregate' });
      assert.deepEqual(buildReplenishmentExportRows(batch.requests, 'VDCG'), [['89678', 5]]);
      assert.equal(batch.requests.length, 2); assert.equal((await api('SUMMARY')).unfinished.length, 1);
      await api('CONFIRM', { batch_id: batch.id });
    });
    await t.test('canceled, deleted and cancellation-requested portions are excluded', async () => {
      for (const [id, patch] of [['cancel', "status='CANCELADO'"], ['delete', 'is_deleted=true'], ['cancel-asked', 'cancellation_requested_at=now()']]) {
        await request(id, '88888'); await attend(id, 2); await conclude(id);
        await db.exec(`update wms_replenishment_requests set ${patch} where id='${id}'`);
      }
      assert.equal((await api('SUMMARY')).items, 0);
    });
    await t.test('changing browser owner, direct writes and cross-warehouse calls cannot bypass API/RLS', async () => {
      await actor('g'); await assert.rejects(api('SUMMARY', { owner_id: 'b' }), /somente seus/);
      await assert.rejects(api('HISTORY', { mode: 'ADMIN', owner_id: 'b' }), /não autorizada/);
      await assert.rejects(api('SUMMARY', {}, 'VDCO'), /não autorizado/);
      await assert.rejects(db.exec("update wms_replenishment_fulfillments set responsavel_id='g'"), /permission denied/);
      await assert.rejects(db.exec("insert into wms_replenishment_export_batches(id,warehouse_code,requests) values('forged','VDCG','[{}]')"), /permission denied/);
      const rows = (await db.query('select owner_id from wms_replenishment_export_batches')).rows;
      assert.ok(rows.length > 0); assert.ok(rows.every(row => row.owner_id === 'g'));
      await assert.rejects(api('DOWNLOAD', { batch_id: 'split-b' }), /não autorizado/);
    });
    await t.test('idempotent attending retries do not add quantity twice', async () => {
      await request('retry', '01314'); await attend('retry', 2, 'retry-key'); await attend('retry', 2, 'retry-key');
      await assert.rejects(attend('retry', 3, 'retry-key'), /já usado/);
      assert.equal((await db.query("select quantidade_atendida from wms_replenishment_requests where id='retry'")).rows[0].quantidade_atendida, '2');
      await conclude('retry');
    });
    await t.test('two export tokens reserve a portion only once; retries and history do not move stock/status', async () => {
      const before = (await db.query('select * from wms_replenishment_requests order by id')).rows;
      const outcomes = await Promise.allSettled([api('RESERVE', { batch_id: 'race1' }), api('RESERVE', { batch_id: 'race2' })]);
      assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1);
      const batch = outcomes.find(o => o.status === 'fulfilled').value;
      const reserved = await api('RESERVE', { batch_id: batch.id }); assert.equal(reserved.id, batch.id);
      assert.equal((await db.query('select exported_at from wms_replenishment_fulfillments where export_batch_id=$1', [batch.id])).rows[0].exported_at, null);
      await api('CONFIRM', { batch_id: batch.id }); await api('CONFIRM', { batch_id: batch.id });
      const original = await api('DOWNLOAD', { batch_id: batch.id }), copy = await api('DOWNLOAD', { batch_id: batch.id });
      assert.deepEqual(original, copy); assert.deepEqual((await db.query('select * from wms_replenishment_requests order by id')).rows, before);
      assert.equal((await api('SUMMARY')).items, 0);
      assert.equal((await api('HISTORY')).filter(b => b.id === batch.id).length, 1);
    });
    await t.test('generation failure can release and retry without losing or marking quantities', async () => {
      await request('failure'); await attend('failure', 1); await conclude('failure');
      await api('RESERVE', { batch_id: 'failed' }); await api('RELEASE', { batch_id: 'failed' });
      assert.equal((await api('SUMMARY')).units, 1);
      await assert.rejects(api('CONFIRM', { batch_id: 'failed' }), /liberada/);
      const next = await api('RESERVE', { batch_id: 'retry-failure' }); assert.equal(next.requests[0].quantidade_atendida, 1);
      await api('CONFIRM', { batch_id: next.id });
    });
    await t.test('admin default is self; other person requires explicit admin mode', async () => {
      await actor('a'); assert.equal((await api('SUMMARY')).units, 0);
      await assert.rejects(api('SUMMARY', { owner_id: 'g' }), /somente seus/);
      const history = await api('HISTORY', { mode: 'ADMIN', owner_id: 'g' }); assert.ok(history.length > 0);
      assert.equal((await api('HISTORY', { mode: 'ADMIN', legacy: 'true' })).find(b => b.id === 'legacy-batch').format_version, 1);
      await request('admin-other', '00001', 'b'); await attend('admin-other', 4); await conclude('admin-other');
      await actor('a'); const other = await api('RESERVE', { mode: 'ADMIN', owner_id: 'b', batch_id: 'admin-other-batch' });
      assert.equal(other.owner_id, 'b'); assert.equal(other.created_by, users.a);
      await api('CONFIRM', { mode: 'ADMIN', owner_id: 'b', batch_id: other.id });
      assert.equal((await api('SUMMARY')).units, 0);
    });
    await t.test('parent conclusion records actual authenticated concluder, not creator/claimed name', async () => {
      await request('actual', '00009', 'g'); await attend('actual', 2);
      await actor('a'); await db.exec("update wms_replenishment_requests set status='CONCLUIDO',finished_at=now() where id='actual'");
      const ledger = (await db.query("select handled_by_id,responsavel_id,concluded_by_auth_id from wms_replenishment_fulfillments where request_id='actual'")).rows[0];
      assert.equal(ledger.handled_by_id, 'g'); assert.equal(ledger.responsavel_id, 'a'); assert.equal(ledger.concluded_by_auth_id, users.a);
      assert.equal((await api('SUMMARY')).units, 2);
    });
    await t.test('new export wrapper is safe for old clients and no future attribution to legacy', async () => {
      await actor('a'); const batch = (await db.query("select (public.create_wms_replenishment_export('VDCG','compat')).requests")).rows[0].requests;
      assert.equal(batch.length, 1); assert.equal(batch[0].id, 'actual');
      assert.ok(!batch.some(r => r.id === 'legacy'));
    });
    await t.test('cancel between reservation and confirmation is atomic, release keeps quantities unexported', async () => {
      await request('cancel-midway'); await attend('cancel-midway',2); await conclude('cancel-midway');
      await api('RESERVE',{batch_id:'cancel-midway-batch'});
      await db.exec("update wms_replenishment_requests set cancellation_requested_at=now() where id='cancel-midway'");
      await assert.rejects(api('CONFIRM',{batch_id:'cancel-midway-batch'}),/cancelada/);
      assert.equal((await db.query("select exported_at from wms_replenishment_fulfillments where request_id='cancel-midway'")).rows[0].exported_at,null);
      await api('RELEASE',{batch_id:'cancel-midway-batch'});
    });
    await t.test('legacy attended baseline remains unassigned when a new portion is handled', async () => {
      await request('old-partial');
      // Simulate a quantity which existed before the migration: disable only the new capture trigger as DB owner.
      await db.exec("reset role; alter table wms_replenishment_requests disable trigger capture_replenishment_fulfillment; update wms_replenishment_requests set quantidade_atendida=4 where id='old-partial'; alter table wms_replenishment_requests enable trigger capture_replenishment_fulfillment;");
      await actor('g'); await attend('old-partial',2); await conclude('old-partial');
      const batch=await api('RESERVE',{batch_id:'future-only'}); assert.equal(batch.requests[0].quantidade_atendida,2);
      await api('CONFIRM',{batch_id:batch.id});
      await assert.rejects(db.exec("update wms_replenishment_requests set codigo_material='other' where id='old-partial'"),/SKU e estoque/);
      await assert.rejects(db.exec("update wms_replenishment_requests set quantidade_atendida=0 where id='old-partial'"),/reduzida/);
    });
    await t.test('administrative date range, actor names and own redownload of admin-created file are preserved', async () => {
      await actor('b'); const copy=await api('DOWNLOAD',{batch_id:'admin-other-batch'});
      assert.equal(copy.owner_id,'b');assert.equal(copy.created_by_name,'Administrador');
      await actor('a'); const past=await api('HISTORY',{mode:'ADMIN',owner_id:'g',until:'2000-01-01T00:00:00Z'});
      assert.equal(past.length,0);
      await db.exec("reset role; update wms_users set name='Novo nome' where id='g'; set role authenticated");
      await actor('g'); assert.equal((await api('SUMMARY')).owner_id,'g');
      assert.equal((await api('DOWNLOAD',{batch_id:'split-g'})).owner_name,'Guilherme');
    });
    await t.test('caixa, inactive profiles and anonymous sessions cannot use exports', async () => {
      await actor('c'); await assert.rejects(api('SUMMARY'), /não autorizado/);
      await actor('g'); await db.exec("reset role; update wms_users set active=false where id='g'; set role authenticated");
      await assert.rejects(api('SUMMARY'), /não autorizado/);
      await actor('none'); await assert.rejects(api('SUMMARY'), /não autorizado/);
    });
  } finally { await db.close(); }
});
