import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTaskEvidence, summarizeTaskEvidence, validatePerformanceReview } from '../src/operational-performance-domain.js';
const row = { id: 'task-1', estoque_id: 'VDCG', titulo: 'Conferir', criado_por: 'requester', atribuido_para: 'worker', status: 'CONCLUIDA', data_conclusao: '2026-11-18T12:00:00Z' };
const scope = { warehouse: 'VDCG', actorId: 'worker', from: '2026-11-18T00:00:00Z', to: '2026-11-19T00:00:00Z' };
test('legacy attribution is never converted into verified execution or score', () => {
  const evidence = normalizeTaskEvidence(row);
  assert.deepEqual(evidence.executorIds, []);
  const result = summarizeTaskEvidence([evidence], scope);
  assert.equal(result.completedAssigned, 1);
  assert.equal(result.verifiedExecution, null);
  assert.equal(result.score, null);
});
test('source deduplication and warehouse/person isolation', () => {
  const evidence = normalizeTaskEvidence(row);
  const result = summarizeTaskEvidence([evidence, evidence, normalizeTaskEvidence({ ...row, estoque_id: 'VDAR' }), normalizeTaskEvidence({ ...row, id: 'other', atribuido_para: 'another' })], scope);
  assert.equal(result.assignedWithActivity, 1);
});
test('period uses exclusive upper bound and insufficient coverage is not failure', () => {
  const result = summarizeTaskEvidence([normalizeTaskEvidence({ ...row, data_conclusao: scope.to })], scope);
  assert.equal(result.coverage, 'DADOS_INSUFICIENTES');
  assert.equal(result.quality, null);
});
test('shared executors cannot validate themselves', () => {
  assert.throws(() => validatePerformanceReview({ executorIds: ['a', 'b'], validatorId: 'b', justification: 'ok' }), /Autovalidação/);
  assert.throws(() => validatePerformanceReview({ executorIds: ['a'], validatorId: 'c', justification: '' }), /Justificativa/);
  assert.equal(validatePerformanceReview({ executorIds: ['a', 'b'], validatorId: 'c', justification: 'Verificação física' }), true);
});
