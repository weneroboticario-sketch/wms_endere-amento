/** Bounded, resumable synchronization. Replaying a page is safe in the database. */
export async function synchronizeEvidence({ rpc, cycleId, isCurrent = () => true, onProgress = () => {}, maxPages = 100, cursors = {} }) {
 if (!cycleId || !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 1000) throw Error('Configuração de processamento inválida.');
 let current = cursors, inserted = 0;
 for (let page = 0; page < maxPages; page++) {
  if (!isCurrent()) throw Error('Sessão ou unidade alterada.');
  const response = await rpc('SYNC', { cycle_id: cycleId, cursors: current });
  if (!isCurrent()) throw Error('Sessão ou unidade alterada.');
  inserted += response.inserted || 0;
  onProgress({ page: page + 1, inserted, cursors: response.cursors });
  if (!response.has_more) return { ...response, inserted, pages: page + 1 };
  if (JSON.stringify(response.cursors) === JSON.stringify(current)) throw Error('Processamento sem avanço. Atualize e tente novamente.');
  current = response.cursors;
 }
 const error = Error('Processamento pausado no limite de páginas. Continue com o cursor retornado.');
 error.cursors = current; throw error;
}
