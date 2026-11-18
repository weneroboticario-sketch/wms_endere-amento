import test from 'node:test';
import assert from 'node:assert/strict';
import { executionScore, verificationScore, assistedScore, composeAssessment } from '../../src/excellence/evaluation-engine.js';
const period = { from: '2026-11-01T00:00:00Z', to: '2026-12-01T00:00:00Z' };
const task = { factId: 'a', dueAt: '2026-11-18T12:00:00Z', completedAt: '2026-11-18T11:00:00Z', complexity: 'complex', complexityDefinedBeforeStart: true, executorVerified: true, responsibilityVerified: true, deliveryValidated: true, status: 'CONCLUIDA' };
const config = { ...period, complexityWeights: { simple: 1, medium: 2, complex: 3 }, maximum: 25 };
test('execution uses eligible deadlines and complexity, not activity volume', () => {
 const late = { ...task, factId: 'late', complexity: 'simple', completedAt: '2026-11-18T13:00:00Z' };
 const r = executionScore([task, task, late], config);
 assert.equal(r.numerator, 3); assert.equal(r.denominator, 4); assert.equal(r.points, 18.75); assert.equal(r.included[1].late, true);
});
test('absence, third-party blocks, unverified responsibility and dates do not become failures', () => {
 const r = executionScore([{ ...task, exemptionValidated: true }, { ...task, factId: 'unverified', executorVerified: false }, { ...task, factId: 'outside', dueAt: period.to }], config);
 assert.equal(r.points, null); assert.equal(r.excluded.length, 3);
});
test('quality and organization use disjoint audited facts and sufficient samples', () => {
 const quality = { factId: 'q', criterion: 'quality', independentlyValidated: true, auditorId: 'auditor', userId: 'worker', responsibilityVerified: true, result: 'CONFORME', at: '2026-11-18T12:00:00Z' };
 const c = { ...period, criterion: 'quality', maximum: 20, minimumSample: 1 };
 assert.equal(verificationScore([quality, quality], c).points, 20);
 assert.equal(verificationScore([{ ...quality, responsibilityVerified: false }], c).points, null);
 assert.equal(verificationScore([quality], { ...c, criterion: 'organization' }).points, null);
 assert.equal(verificationScore([{ ...quality, result: 'NAO_CONFORME' }], c).points, 0);
});
test('assisted zero needs documented opportunity, evidence and independent validation', () => {
 const dimensions = [{ id: 'team', maximum: 5, scaleMaximum: 5 }];
 const rating = { dimension: 'team', score: 0, validated: true, validatorId: 'leader', userId: 'worker', evidenceIds: ['f'], opportunityVerified: true, justification: 'Fato verificável' };
 assert.equal(assistedScore([rating], { dimensions }).points, 0);
 assert.equal(assistedScore([{ ...rating, validatorId: 'worker' }], { dimensions }).points, null);
 assert.equal(assistedScore([rating, rating], { dimensions }).points, null);
});
test('composition distinguishes assessed, pending and not obtained, never declares partial final', () => {
 const r = composeAssessment([{ id: 'auto', points: 50, maximum: 55, coverageSufficient: true }, { id: 'assisted', points: null, maximum: 45, coverageSufficient: false }], { version: 'v2', bands: [] });
 assert.equal(r.assessedPoints, 50); assert.equal(r.pendingPoints, 45); assert.equal(r.notObtainedPoints, 5); assert.equal(r.definitiveScore, null); assert.equal(r.complete, false);
});
