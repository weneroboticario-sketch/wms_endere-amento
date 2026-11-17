// An inclusive lower boundary avoids losing equal timestamps between reconciliations.
// The server orders by (timestamp,id); cursor paging does not shift when earlier rows change.
export async function readIncrementalPages(fetchPage, { timeColumn = 'updated_at', pageSize = 500, isCurrent = () => true } = {}) {
  const rows = [], seen = new Set();
  let cursor = null;
  while (true) {
    if (!isCurrent()) throw Object.assign(new Error('Consulta obsoleta'), { name: 'AbortError' });
    const page = await fetchPage(cursor, pageSize);
    if (!isCurrent()) throw Object.assign(new Error('Consulta obsoleta'), { name: 'AbortError' });
    for (const row of page) {
      if (seen.has(row.id)) continue;
      seen.add(row.id); rows.push(row);
    }
    if (page.length < pageSize) return rows;
    const last = page.at(-1);
    const next = { time: last[timeColumn], id: last.id };
    if (!next.time || !next.id || (cursor && next.time === cursor.time && next.id === cursor.id)) throw new Error('Cursor de sincronização inválido. Atualize novamente.');
    cursor = next;
  }
}
