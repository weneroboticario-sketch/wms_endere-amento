/** Defaults are drafts for calibration, not an evaluation formula. */
export const PROGRAM_NAME = 'Logística de Excelência';
export const DEFAULT_SECTORS = Object.freeze(['Loja', 'Estoque', 'Rua 1', 'Rua 2', 'Rua 3', 'Grupo', 'Retirada', 'Recebimento', 'Conferência', 'Apoio operacional']);

export function createCalibrationConfig({ warehouse, startsAt, days = 30 }) {
  const start = Date.parse(startsAt);
  if (!warehouse || !Number.isFinite(start) || !Number.isInteger(days) || days < 1 || days > 366) throw Error('Configuração de calibração inválida.');
  return {
    warehouse, enabled: false, mode: 'CALIBRACAO', days,
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(start + days * 86400000).toISOString(),
    competitiveAwardsEnabled: false, automaticAwardsEnabled: false,
    publicRankingsEnabled: false
  };
}

export function snapshotCriteria({ version, criteria }) {
  if (!version || !Array.isArray(criteria) || !criteria.length) throw Error('Versão e critérios obrigatórios.');
  const keys = new Set();
  const snapshot = criteria.map(item => {
    if (!item.id || keys.has(item.id) || !Number.isFinite(item.weight) || item.weight < 0 || !Number.isFinite(item.minimumEvidence) || item.minimumEvidence < 1 || !Number.isInteger(item.minimumEvidence)) throw Error('Critério inválido ou duplicado.');
    keys.add(item.id);
    return Object.freeze({ id: item.id, weight: item.weight, minimumEvidence: item.minimumEvidence, required: item.required === true });
  });
  if (Math.abs(snapshot.reduce((total, item) => total + item.weight, 0) - 100) > 0.000001) throw Error('A soma dos pesos deve ser 100.');
  return Object.freeze({ version, criteria: Object.freeze(snapshot), experimental: true });
}

export function assessCoverage(snapshot, verifiedCounts) {
  const details = snapshot.criteria.map(item => {
    const count = verifiedCounts[item.id];
    const known = Number.isInteger(count) && count >= 0;
    return { criterion: item.id, verified: known ? count : null, minimum: item.minimumEvidence, sufficient: known && count >= item.minimumEvidence, required: item.required };
  });
  const required = details.filter(item => item.required);
  const sufficient = required.length > 0 && required.every(item => item.sufficient);
  return {
    status: sufficient ? 'COBERTURA_SUFICIENTE' : details.some(item => item.verified > 0) ? 'COBERTURA_PARCIAL' : 'DADOS_INSUFICIENTES',
    canFinalize: sufficient, score: null, criteriaVersion: snapshot.version, details
  };
}
