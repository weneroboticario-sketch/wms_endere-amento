/** Config comes from the immutable database version, not frontend weights. */
export function calculatePreliminary({ config, evidence, scores }) {
 const opShare = Number(config.operationalShare), manualShare = Number(config.manualShare);
 if (!Number.isFinite(opShare) || !Number.isFinite(manualShare) || opShare < 0 || manualShare < 0 || opShare + manualShare !== 100) throw Error('Composição inválida.');
 const reviewed = evidence.filter(row => row.metadata?.reviewed_by && row.metadata.reviewed_by !== row.user_id && Number.isFinite(row.metadata.operational_rating));
 const days = new Set(reviewed.map(row => row.evidence_date.slice(0, 10))).size;
 const sources = new Set(reviewed.map(row => row.source_table)).size;
 const sufficient = days >= config.minimumDays && sources >= config.minimumSources;
 const criteria = config.criteria.map(criterion => {
  const observations = reviewed.filter(row => row.criterion_id === criterion.id);
  const manual = scores.find(row => row.criterion_id === criterion.id);
  const operational = observations.length ? observations.reduce((sum, row) => sum + row.metadata.operational_rating, 0) / observations.length : null;
  const leadership = manual ? Number(manual.score) : null;
  const available = (opShare === 0 || operational !== null) && (manualShare === 0 || leadership !== null);
  return { ...criterion, operational, leadership, sample: observations.length, points: available ? (opShare * (operational ?? 0) + manualShare * (leadership ?? 0)) / 10000 * criterion.weight : null };
 });
 return { criteria, days, sources, confidence: sufficient ? 'ALTA' : reviewed.length ? 'BAIXA' : 'INSUFICIENTE',
  score: sufficient && criteria.every(row => row.points !== null) ? criteria.reduce((sum, row) => sum + row.points, 0) : null,
  warnings: [...(!sufficient ? ['EVIDENCE_INSUFFICIENT'] : []), ...(!days ? ['LOW_ACTIVITY_WINDOW'] : [])],
  limitation: 'Notas preliminares baseadas em observações revisadas. Volume de registros não gera pontos. Revisão operacional ainda exige liderança.' };
}
