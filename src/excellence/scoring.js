import { replenishmentExecutionScore } from './evidence-engine.js';
import { executionScore, verificationScore, composeAssessment } from './evaluation-engine.js';
/** The same deterministic engine is used by the server and the explanation view. */
export function calculatePreliminary({ cycle, config, evidence, scores, period: cyclePeriod, evidenceTruncated = false }) {
 if (config.engineVersion !== 2) return { criteria: config.criteria.map(row => ({ ...row, points: null, sample: 0 })), score: null, days: 0, sources: 0, confidence: 'INSUFICIENTE', warnings: ['LEGACY_RULE_VERSION'], limitation: 'Versão anterior: crie um novo ciclo com a composição por critério. Não recalcular ciclos antigos silenciosamente.' };
 const period = cyclePeriod;
 if (!period || !(Date.parse(period.from) < Date.parse(period.to))) throw Error('Período do ciclo não confirmado pelo servidor.');
 const inPeriod = row => Date.parse(row.evidence_date) >= Date.parse(period.from) && Date.parse(row.evidence_date) < Date.parse(period.to);
 const eligible = evidence.filter(inPeriod);
 const assistedIds = new Set(scores.flatMap(row => row.evidence_ids || []));
 const facts = eligible.filter(row => !assistedIds.has(row.id));
 const taskFacts = facts.filter(row => row.source_table === 'operacao_tarefas').map(row => ({ ...row.metadata.task_fact, factId: row.source_table + ':' + row.source_id }));
 const verificationFacts = facts.filter(row => row.metadata.verification_fact).map(row => ({ ...row.metadata.verification_fact, factId: row.source_table + ':' + row.source_id }));
 const criteria = config.criteria.map(criterion => {
  let automatic = { points: criterion.automaticMaximum === 0 ? 0 : null, included: [], excluded: [], numerator: null, denominator: null, formula: 'Não disponível' };
  if (criterion.formula === 'EXECUTION') automatic = config.executionModel === 'REPLENISHMENT' ? replenishmentExecutionScore(facts, criterion.automaticMaximum) : executionScore(taskFacts, { ...period, complexityWeights: config.complexityWeights, maximum: criterion.automaticMaximum });
  else if (criterion.formula === 'VERIFICATION') automatic = verificationScore(verificationFacts, { ...period, criterion: criterion.id, minimumSample: config.minimumSample, maximum: criterion.automaticMaximum });
  const candidates = scores.filter(row => row.criterion_id === criterion.id && row.evaluator_id !== row.user_id && row.evidence_ids?.length && row.evidence_ids.every(id => eligible.some(e => e.id === id)) && row.justification?.trim());
  const manual = candidates.length === 1 ? candidates[0] : null;
  const assisted = criterion.assistedMaximum === 0 ? 0 : manual && Number.isFinite(Number(manual.score)) ? Number(manual.score) / 100 * criterion.assistedMaximum : null;
  const days = new Set(eligible.filter(row => automatic.included.some(ref => ref.id === row.source_table + ':' + row.source_id) || manual?.evidence_ids.includes(row.id)).map(row => row.evidence_date.slice(0,10))).size;
  const coverageSufficient = days >= config.minimumDays && !evidenceTruncated && automatic.points !== null && assisted !== null;
  return { ...criterion, maximum: criterion.weight, automatic: automatic.points, assisted, points: automatic.points !== null && assisted !== null ? automatic.points + assisted : null,
   assessedPoints: (automatic.points ?? 0) + (assisted ?? 0), pendingPoints: (automatic.points === null ? criterion.automaticMaximum : 0) + (assisted === null ? criterion.assistedMaximum : 0),
   sample: automatic.denominator ?? manual?.evidence_ids.length ?? 0, coverageSufficient,
   explanation: { automatic, assisted: manual ? { formula: 'nota validada / 100 × máximo assistido', score: manual.score, maximum: criterion.assistedMaximum, evidenceIds: manual.evidence_ids, justification: manual.justification } : null, period, version: cycle.criteria_version_id } };
 });
 const components = criteria.flatMap(row => [
  { id: row.id + ':automatic', maximum: row.automaticMaximum, points: row.automatic, coverageSufficient: row.coverageSufficient },
  { id: row.id + ':assisted', maximum: row.assistedMaximum, points: row.assisted, coverageSufficient: row.coverageSufficient }
 ]);
 const composition = composeAssessment(components, { version: cycle.criteria_version_id, bands: config.bands });
 return { ...composition, criteria, score: composition.complete ? composition.assessedPoints : null,
  days: new Set(eligible.map(row => row.evidence_date.slice(0,10))).size, sources: new Set(eligible.map(row => row.source_table)).size,
  confidence: composition.complete ? 'ALTA' : criteria.some(row => row.assessedPoints > 0) ? 'BAIXA' : 'INSUFICIENTE',
  warnings: [...(!composition.complete ? ['EVIDENCE_INSUFFICIENT'] : []), ...(evidenceTruncated ? ['PARTIAL_EVIDENCE_PAGE'] : [])],
  limitation: 'Pontuação experimental. Atividades sem autoria, complexidade ou validação comprovada permanecem N/D. Nenhuma nota manual vira ponto automático.' };
}
