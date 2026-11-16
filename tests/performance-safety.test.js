import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createReferenceCache } from '../src/reference-cache.js';
import { readIncrementalPages } from '../src/incremental-pages.js';
import { isServiceRestricted, isCancelledRequest, serviceFailureMessage, recordRequestHealth, requestHealthSnapshot } from '../src/request-health.js';

const script = await readFile(new URL('../script.js', import.meta.url), 'utf8');
function extract(start, end, env) {
  const source = script.slice(script.indexOf(start), script.indexOf(end, script.indexOf(start)));
  return new Function('env', 'with(env){' + source + ';return ' + start.match(/function (\w+)/)[1] + ';}')(env);
}

test('reference cache reuses descriptions for 60s, isolates users/roles/warehouses and never caches failures', async () => {
  let time = 0, calls = 0;
  const cache = createReferenceCache({ now: () => time });
  const read = () => { calls++; return [{ sku: '01314', product_name: 'Produto' }]; };
  const a = await cache.read('one:OPERADOR:VDCG', read);
  assert.equal(await cache.read('one:OPERADOR:VDCG', read), a);
  assert.equal(calls, 1);
  await cache.read('two:CAIXA:VDCG', read);
  await cache.read('one:OPERADOR:VDAR', read);
  assert.equal(calls, 3);
  time = 60000;
  await cache.read('one:OPERADOR:VDAR', read);
  assert.equal(calls, 4);
  await assert.rejects(cache.read('failed', () => { throw Error('offline'); }), /offline/);
  assert.equal((await cache.read('failed', read))[0].sku, '01314');
});

test('concurrent reference reads share one fetch and invalidation discards an obsolete response', async () => {
  let finish, calls = 0;
  const cache = createReferenceCache();
  const load = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  const one = cache.read('scope', load), two = cache.read('scope', load);
  assert.equal(one, two); await Promise.resolve(); assert.equal(calls, 1);
  cache.clear();
  assert.deepEqual(await cache.read('scope', async () => ['new']), ['new']);
  finish(['old']);
  await assert.rejects(one, { name: 'AbortError' });
  assert.deepEqual(await cache.read('scope', () => { throw Error('must retain new'); }), ['new']);
});

test('reference cache bounds memory and reloads evicted references', async () => {
  const cache = createReferenceCache({ maxEntries: 2 }); let calls = 0;
  for (const key of ['a', 'b', 'c', 'a']) await cache.read(key, async () => ++calls);
  assert.equal(calls, 4);
});

test('incremental cursor reads 1501 rows sharing one timestamp without loss or double quantities', async () => {
  const source = Array.from({ length: 1501 }, (_, i) => ({ id: String(i).padStart(5, '0'), updated_at: '2026-11-16T10:00:00Z', qty: 1 }));
  let calls = 0;
  const rows = await readIncrementalPages(async (cursor, size) => {
    calls++;
    return source.filter(row => !cursor || row.updated_at > cursor.time || row.updated_at === cursor.time && row.id > cursor.id).slice(0, size);
  });
  assert.equal(calls, 4); assert.deepEqual(rows, source);
  assert.equal(rows.reduce((sum, row) => sum + row.qty, 0), 1501);
});

test('incremental cursor rejects obsolete scope and partial failures without publishing partial results', async () => {
  let current = true;
  await assert.rejects(readIncrementalPages(async () => { current = false; return [{ id: 'foreign' }]; }, { isCurrent: () => current }), { name: 'AbortError' });
  await assert.rejects(readIncrementalPages(async cursor => {
    if (cursor) throw Error('connection lost');
    return [{ id: '1', updated_at: 'now' }];
  }, { pageSize: 1 }), /connection lost/);
  await assert.rejects(readIncrementalPages(async () => [{ id: '1', updated_at: 'now' }], { pageSize: 1 }), /Cursor/);
});

test('actual warehouse reader scopes every page and uses inclusive server watermark and stable keyset cursor', async () => {
  const calls = [];
  const rows = Array.from({ length: 501 }, (_, i) => ({ id: String(i).padStart(5, '0'), updated_at: '2026-11-16T10:00:00Z' }));
  const env = {
    activeWarehouseCode: () => 'VDCG', authState: { currentUser: { id: 'operator' } }, realtimeState: { syncGeneration: 1 },
    transferSummarySelectColumns: () => 'id,updated_at', readIncrementalPages,
    selectRowsWithMissingColumnFallback: async (table, columns, configure) => {
      const steps = []; const query = {};
      for (const method of ['eq', 'lt', 'gte', 'or', 'order', 'limit']) query[method] = (...args) => { steps.push([method, ...args]); return query; };
      configure(query); calls.push({ table, columns, steps });
      return { data: calls.length === 1 ? rows.slice(0, 500) : rows.slice(500) };
    }, isOptionalRealtimeTable: () => false
  };
  const read = extract('  async function fetchStableWarehouseUpdates(', '  function isOptionalRealtimeTable(', env);
  assert.deepEqual(await read('wms_transfers', 'updated_at', '2026-11-16T09:00:00Z', '2026-11-16T11:00:00Z'), rows);
  for (const call of calls) {
    assert.ok(call.steps.some(s => s[0] === 'eq' && s[1] === 'warehouse_code' && s[2] === 'VDCG'));
    assert.ok(call.steps.some(s => s[0] === 'gte' && s[2] === '2026-11-16T09:00:00Z'));
    assert.ok(!call.steps.some(s => s[0] === 'lt'));
    assert.deepEqual(call.steps.filter(s => s[0] === 'order').map(s => s[1]), ['updated_at', 'id']);
  }
  assert.ok(calls[1].steps.some(s => s[0] === 'or' && s[1].includes('id.gt."00499"')));
});

test('402 and cancellation do not retry, while transient reads keep bounded retries', async () => {
  let calls = 0;
  const env = { IS_CP_ALAMO: false, performance, recordRequestHealth, delay: async () => {}, isSupabaseTransientNetworkError: error => !isServiceRestricted(error) && !isCancelledRequest(error) && /network/.test(error.message) };
  const run = extract('  async function runSupabaseRequestWithRetry(', '  function smallerSupabaseChunkSize(', env);
  const blocked = { status: 402, message: 'exceed_egress_quota' };
  assert.equal((await run('login', async () => { calls++; return { error: blocked, status: 402 }; })).error, blocked);
  assert.equal(calls, 1);
  const abort = Object.assign(Error('aborted'), { name: 'AbortError' });
  await assert.rejects(run('address', async () => { throw abort; }), { name: 'AbortError' });
  calls = 0;
  await run('read', async () => { calls++; return { error: { message: 'network error' } }; });
  assert.equal(calls, 6);
});

test('health diagnostics are bounded and cannot retain secrets or request bodies', () => {
  for (let i = 0; i < 110; i++) recordRequestHealth('stock-read', performance.now(), { status: 200, rows: 1, token: 'secret', body: 'private' });
  const entries = requestHealthSnapshot();
  assert.equal(entries.length, 100); assert.ok(!JSON.stringify(entries).includes('secret'));
  entries[0].endpoint = 'edited'; assert.notEqual(requestHealthSnapshot()[0].endpoint, 'edited');
  assert.match(serviceFailureMessage({ status: 402 }), /cota/);
  assert.match(serviceFailureMessage({ status: 503 }), /conectar/);
  assert.equal(serviceFailureMessage({ status: 400, message: 'Invalid login credentials' }), '');
});

test('transfer and item synchronization advance independently using server values, never the client clock', async () => {
  const calls = [];
  const state = { active: true, syncGeneration: 1, lastLiveUpdateAt: '2026-11-16T09:00:00Z' };
  const env = {
    IS_CP_ALAMO: false, realtimeState: state, transferState: { savingActionKey: '', activeTransferId: 't', loadedItemTransferIds: {t:true} },
    authState: { currentUser: { id: 'operator' } }, moduleLoadState: { transfers: true, replenishment: false },
    isSupabaseReady: () => true, canUseNetwork: () => true, activeWarehouseCode: () => 'VDCG',
    checkLatestAddressCacheInvalidation: async () => {}, getActiveScreenId: () => 'transferencias', invalidateTransferStatsCache() {},
    fetchWarehouseUpdatedRows: async (table, column, since) => {
      calls.push({ table, since });
      return [{ id: table, updated_at: table === 'wms_transfers' ? '2026-11-16T11:00:00Z' : '2026-11-16T10:00:00Z' }];
    }, fromDbTransfer: row => row, fromDbTransferItem: row => row, applyLocalTransferUpdate() {}, applyLocalTransferItemUpdate() {},
    writeTransferCacheSoon() {}, renderTransferRealtimeViews() {}, recordPerformanceMetric() {}, setSyncStatus() {}, performance,
    nowIso: () => '2027-01-01T00:00:00Z'
  };
  const sync = extract('  async function refreshLeaderIncrementalData()', '  function renderTransfers(', env);
  await sync(); await sync();
  assert.equal(calls[2].since, '2026-11-16T11:00:00Z');
  assert.equal(calls[3].since, '2026-11-16T10:00:00Z');
});
