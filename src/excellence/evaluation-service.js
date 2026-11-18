import { calculatePreliminary } from './scoring.js';
/** Read complete evidence pages at one logical revision; never score a truncated page. */
export async function readEvaluation(rpc, data) {
 const dashboard = await rpc('DASHBOARD', data);
 if (dashboard.cycle.status === 'CLOSED') {
  const closed = await rpc('ASSESSMENT', data);
  return { ...dashboard, ...closed.result, calculation: closed.result.calculation, frozen: true };
 }
 if (dashboard.evidenceTruncated) {
  let rows = [...dashboard.evidence];
  while (rows.length && rows.length % 100 === 0) {
   if (rows.length >= 10000) throw Error('Avaliação excede limite seguro; reduzir ciclo ou agregar antes de calcular.');
   const last = rows.at(-1);
   const page = await rpc('EVIDENCE_PAGE', { ...data, before_at: last.evidence_date, before_id: last.id });
   if (page.revision !== dashboard.revision) throw Error('Evidências alteradas; atualize antes de avaliar.');
   rows.push(...page.rows); if (page.rows.length < 100) break;
  }
  dashboard.evidence = rows; dashboard.evidenceTruncated = false;
 }
 return { ...dashboard, calculation: calculatePreliminary(dashboard) };
}
export async function prepareCycleClosure(rpc, cycleId) {
 const people = await rpc('DIRECTORY', { cycle_id: cycleId });
 if (!people.length) throw Error('Equipe não encontrada.');
 const snapshots = []; let revision;
 for (const person of people) {
  const evaluation = await readEvaluation(rpc, { cycle_id: cycleId, user_id: person.id });
  if (revision && revision !== evaluation.revision) throw Error('Dados alterados; revisar o ciclo novamente.');
  revision = evaluation.revision;
  if (!evaluation.calculation.complete) throw Error('Avaliação com dados insuficientes: ' + person.id);
  snapshots.push({ user_id: person.id, calculation: { ...evaluation.calculation, definitiveScore: evaluation.calculation.score, preliminary: false }, evidence: evaluation.evidence, scores: evaluation.scores, period: evaluation.period });
 }
 return { revision, snapshots };
}
