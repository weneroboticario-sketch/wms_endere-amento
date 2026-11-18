/** Deterministic experimental formulas; all parameters supplied by a cycle version. */
const instant = value => Date.parse(value);
const unique = rows => [...new Map(rows.map(row => [row.factId, row])).values()];
const unavailable = reason => ({ points: null, numerator: null, denominator: null, reason, included: [], excluded: [] });
export function executionScore(tasks, { from, to, complexityWeights, maximum }) {
 const start = instant(from), end = instant(to);
 if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || !Number.isFinite(maximum) || maximum < 0) throw Error('Configuração inválida.');
 let numerator = 0, denominator = 0; const included = [], excluded = [];
 for (const task of unique(tasks)) {
  let reason = null; const due = instant(task.dueAt), weight = complexityWeights[task.complexity];
  if (!task.factId || !task.executorVerified || !task.responsibilityVerified) reason = 'AUTORIA_OU_RESPONSABILIDADE_NAO_COMPROVADA';
  else if (!Number.isFinite(due) || due < start || due >= end) reason = 'PRAZO_FORA_DO_PERIODO';
  else if (task.exemptionValidated) reason = 'IMPEDIMENTO_OU_AUSENCIA_VALIDADA';
  else if (['CANCELADA', 'REPROGRAMADA', 'BLOQUEADA'].includes(task.status)) reason = 'SITUACAO_AGUARDANDO_REVISAO';
  else if (!Number.isFinite(weight) || weight <= 0 || !task.complexityDefinedBeforeStart) reason = 'COMPLEXIDADE_NAO_COMPROVADA';
  if (reason) { excluded.push({ id: task.factId, reason }); continue; }
  const completed = task.status === 'CONCLUIDA' && task.deliveryValidated === true;
  const onTime = completed && Number.isFinite(instant(task.completedAt)) && instant(task.completedAt) <= due;
  denominator += weight; if (onTime) numerator += weight;
  included.push({ id: task.factId, weight, onTime, late: completed && !onTime });
 }
 return { points: denominator ? numerator / denominator * maximum : null, numerator, denominator, maximum, included, excluded, formula: 'peso concluído validado no prazo / peso elegível com prazo no período × máximo' };
}
export function verificationScore(verifications, { criterion, maximum, minimumSample, from, to }) {
 if (!Number.isInteger(minimumSample) || minimumSample < 1 || !Number.isFinite(maximum) || maximum < 0 || !(instant(from) < instant(to))) throw Error('Configuração inválida.');
 const included = [], excluded = [];
 for (const row of unique(verifications)) {
  if (!row.factId || row.criterion !== criterion || !row.independentlyValidated || row.auditorId === row.userId || !row.responsibilityVerified || !['CONFORME', 'NAO_CONFORME'].includes(row.result) || instant(row.at) < instant(from) || instant(row.at) >= instant(to) || !Number.isFinite(instant(row.at))) {
   excluded.push({ id: row.factId, reason: 'VERIFICACAO_NAO_ELEGIVEL' }); continue;
  }
  included.push({ id: row.factId, conforming: row.result === 'CONFORME' });
 }
 const numerator = included.filter(row => row.conforming).length, denominator = included.length;
 return { points: denominator >= minimumSample ? numerator / denominator * maximum : null, numerator, denominator, maximum, included, excluded, formula: 'verificações conformes / verificações elegíveis × máximo', reason: denominator < minimumSample ? 'AMOSTRA_INSUFICIENTE' : null };
}
export function assistedScore(ratings, { dimensions }) {
 let points = 0; const pending = [], included = [];
 for (const dimension of dimensions) {
  const rows = ratings.filter(row => row.dimension === dimension.id && row.validated && row.validatorId && row.validatorId !== row.userId && row.evidenceIds?.length && row.opportunityVerified && String(row.justification || '').trim());
  // Multiple official ratings require review; never choose silently.
  const rating = rows.length === 1 ? rows[0] : null;
  if (!rating || !Number.isFinite(rating.score) || rating.score < 0 || rating.score > dimension.scaleMaximum) { pending.push(dimension.id); continue; }
  const value = rating.score / dimension.scaleMaximum * dimension.maximum;
  points += value; included.push({ dimension: dimension.id, points: value, evidenceIds: rating.evidenceIds });
 }
 return { points: pending.length ? null : points, assessedPoints: points, pending, included };
}
export function composeAssessment(criteria, { version, bands }) {
 if (!version || !criteria.length || criteria.reduce((sum, row) => sum + row.maximum, 0) !== 100) throw Error('Versão e composição de 100 pontos obrigatórias.');
 const pending = criteria.filter(row => row.points === null);
 if (criteria.some(row => row.points !== null && (!Number.isFinite(row.points) || row.points < 0 || row.points > row.maximum))) throw Error('Pontuação inválida.');
 const assessedPoints = criteria.reduce((sum, row) => sum + (row.points ?? 0), 0);
 const pendingPoints = pending.reduce((sum, row) => sum + row.maximum, 0);
 const complete = !pending.length && criteria.every(row => row.coverageSufficient === true);
 const band = complete ? [...bands].sort((a,b) => b.minimum - a.minimum).find(row => assessedPoints >= row.minimum)?.label : null;
 return { version, assessedPoints, pendingPoints, notObtainedPoints: 100 - pendingPoints - assessedPoints, preliminary: true, complete, definitiveScore: null, classification: band || 'EM_CALIBRACAO', pendingCriteria: pending.map(row => row.id) };
}
export { unavailable };
