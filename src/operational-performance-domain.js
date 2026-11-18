/** Evidence-based indicators. Assignment and completion never imply exclusive execution. */
export const PERFORMANCE_SECTORS = Object.freeze(['LOJA', 'ESTOQUE', 'GRUPO', 'RETIRADA', 'RECEBIMENTO', 'APOIO']);
export const PERFORMANCE_STATUSES = Object.freeze(['PENDENTE', 'EM_ANDAMENTO', 'AGUARDANDO_VALIDACAO', 'CONCLUIDA', 'BLOQUEADA', 'NECESSITA_CORRECAO', 'REPROGRAMADA', 'CANCELADA']);
export const PERFORMANCE_COMPLEXITIES = Object.freeze(['SIMPLES', 'INTERMEDIARIA', 'COMPLEXA']);
export const EXPERIMENTAL_WEIGHTS = Object.freeze({ execution: 25, quality: 25, initiative: 20, prevention: 10, teamwork: 10, commitment: 10 });
const timestamp = value => value ? Date.parse(value) : NaN;

export function canonicalEvidenceKey({ warehouse, source, sourceId }) {
  if (![warehouse, source, sourceId].every(value => typeof value === 'string' && value.trim())) throw Error('Referência original e estoque obrigatórios.');
  return JSON.stringify([warehouse, source, sourceId]);
}

export function normalizeTaskEvidence(row) {
  return {
    key: canonicalEvidenceKey({ warehouse: row.estoque_id, source: 'operacao_tarefas', sourceId: row.id }),
    warehouse: row.estoque_id, source: 'operacao_tarefas', sourceId: row.id,
    title: row.titulo, requesterId: row.criado_por || null, assignedId: row.atribuido_para || null,
    // Existing task records do not prove participants or physical execution.
    executorIds: [], validatorId: null, attribution: 'DADOS_INSUFICIENTES',
    status: row.status, priority: row.prioridade, dueAt: row.prazo_sla || null,
    startedAt: row.data_inicio || null, completedAt: row.data_conclusao || null,
    blockingReason: row.motivo_bloqueio || null, sector: null, complexity: null
  };
}

export function summarizeTaskEvidence(records, { warehouse, actorId, from, to }) {
  const start = timestamp(from), end = timestamp(to);
  if (!warehouse || !actorId || !Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw Error('Informe estoque, colaborador e período válido.');
  const unique = new Map();
  for (const item of records) {
    // This filter is defense in depth; server authorization is still mandatory.
    if (item.warehouse !== warehouse || item.assignedId !== actorId) continue;
    const at = timestamp(item.completedAt || item.startedAt);
    if (!Number.isFinite(at) || at < start || at >= end) continue;
    unique.set(item.key, item);
  }
  const rows = [...unique.values()];
  return {
    assignedWithActivity: rows.length,
    completedAssigned: rows.filter(row => row.status === 'CONCLUIDA').length,
    blockedAssigned: rows.filter(row => row.status === 'BLOQUEADA').length,
    verifiedExecution: null, quality: null, score: null,
    coverage: rows.length ? 'ATRIBUICAO_APENAS' : 'DADOS_INSUFICIENTES',
    explanation: 'Atribuição não comprova execução individual. Sem pontuação ou classificação automática.',
    sources: rows.map(row => ({ source: row.source, id: row.sourceId, key: row.key }))
  };
}

export function validatePerformanceReview({ executorIds, validatorId, justification }) {
  if (!Array.isArray(executorIds) || !executorIds.length || !validatorId) throw Error('Informe executores e validador.');
  if (executorIds.includes(validatorId)) throw Error('Autovalidação não permitida.');
  if (!String(justification || '').trim()) throw Error('Justificativa obrigatória.');
  return true;
}
