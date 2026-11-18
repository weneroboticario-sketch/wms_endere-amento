// In-memory descriptions only. Never use this cache for quantities or authorizations.
export function createReferenceCache({ ttlMs = 60000, maxEntries = 2, now = Date.now } = {}) {
  const entries = new Map(), pending = new Map();
  let generation = 0;
  function clear() { generation++; entries.clear(); pending.clear(); }
  function read(scope, load) {
    const cached = entries.get(scope);
    if (cached && now() < cached.expires) return Promise.resolve(cached.value);
    if (pending.has(scope)) return pending.get(scope);
    const version = generation;
    const request = Promise.resolve().then(load).then(value => {
      if (version !== generation) throw Object.assign(new Error('Catálogo invalidado durante a leitura'), { name: 'AbortError' });
      if (version === generation) {
        entries.delete(scope);
        entries.set(scope, { value, expires: now() + ttlMs });
        while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
      }
      return value;
    }).finally(() => { if (pending.get(scope) === request) pending.delete(scope); });
    pending.set(scope, request);
    return request;
  }
  return { read, clear };
}
