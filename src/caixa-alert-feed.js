import { caixaAttendanceBucket } from './caixa-attendance.js';
import { createOperationalSync } from './operational-sync.js';

export function isCaixaUrgentCandidate(row, actor, role) {
  return ['available','mine'].includes(caixaAttendanceBucket(row, actor, role));
}

export function createCaixaAlertFeed({ client, actor, role, warehouse, isCurrent, onAlert = () => {}, onCount = () => {}, onError = () => {}, storage, locks, allowRealtime = true, timers = globalThis }) {
  let stopped = false, initialized = false, pending = null, rows = [], synchronization, connectionState = 'SINCRONIZANDO';
  const listeners = new Set(), known = new Set();
  const scope = actor + ':' + role + ':' + warehouse;
  const key = 'wms_caixa_alert_seen_v1:' + scope;
  const current = () => !stopped && isCurrent();
  const readSeen = () => { try { return JSON.parse(storage?.getItem(key) || '[]'); } catch { return []; } };
  function remember(ids) {
    const stored = readSeen();
    const seen = new Set(Array.isArray(stored) ? stored : []);
    const fresh = ids.filter(id => !seen.has(id));
    ids.forEach(id => seen.add(id));
    try { storage?.setItem(key, JSON.stringify([...seen].slice(-2000))); } catch { /* session dedup still works */ }
    return new Set(fresh);
  }
  async function announce(candidates) {
    const work = () => {
      if (!current()) return;
      const fresh = remember(candidates.map(row => row.id));
      const accepted = candidates.filter(row => fresh.has(row.id));
      if (accepted.length) onAlert(accepted);
    };
    if (locks?.request) await locks.request('wms-caixa-alert:' + scope, work);
    else work();
  }
  function read() {
    if (!current()) return Promise.reject(new Error('Atendimento fora da sessão atual.'));
    if (pending) return pending;
    const request = (async () => {
      const result = await client.rpc('list_wms_caixa_attendance', { code: warehouse });
      if (!current()) throw new Error('Usuário ou estoque mudou durante a consulta.');
      if (result.error) throw result.error;
      if (!Array.isArray(result.data)) throw new Error('Resposta de atendimento inválida.');
      const next = result.data.filter(row => row.warehouse_code === warehouse && (role !== 'CAIXA' || row.requested_by === actor));
      const added = next.filter(row => !known.has(row.id));
      next.forEach(row => known.add(row.id));
      if (known.size > 2000) { const keep = [...known].slice(-2000); known.clear(); keep.forEach(id => known.add(id)); }
      rows = next;
      onCount(rows.filter(row => caixaAttendanceBucket(row, actor, role) !== 'closed').length);
      for (const fn of listeners) fn({ rows, tables: ['wms_caixa_requests'] });
      if (!initialized) initialized = true;
      else if (role !== 'CAIXA') await announce(added.filter(row => isCaixaUrgentCandidate(row, actor, role)));
      return rows;
    })().finally(() => { if (pending === request) pending = null; });
    pending = request;
    return request;
  }
  function start() {
    if (synchronization || !current()) return;
    void read().catch(error => { if (current()) onError(error); });
    synchronization = createOperationalSync({ client, actor, role, warehouse, isCurrent: current, allowRealtime, timers,
      onState: state => { connectionState = state; if (current()) for (const fn of listeners) fn({ rows, tables: [], state }); },
      tables: [['wms_caixa_requests','warehouse_code'],['wms_caixa_request_messages','warehouse_code'],['wms_replenishment_requests','warehouse_code']],
      onRefresh: async ({ tables }) => {
        if (tables.includes('all') || tables.includes('wms_caixa_requests') || tables.includes('wms_replenishment_requests')) await read();
        if (current() && (tables.includes('all') || tables.includes('wms_caixa_request_messages'))) for (const fn of listeners) fn({ rows, tables: ['wms_caixa_request_messages'] });
        return true;
      }
    });
  }
  return { read, start, state: () => connectionState, snapshot: () => rows.slice(), subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    close() { if (stopped) return; stopped = true; synchronization?.stop(); listeners.clear(); known.clear(); rows = []; onCount(0); }
  };
}
