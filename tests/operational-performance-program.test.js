import test from 'node:test';
import assert from 'node:assert/strict';
import { createCalibrationConfig, snapshotCriteria, assessCoverage } from '../src/operational-performance-program.js';
test('calibration starts disabled with no rankings or automatic awards', () => {
  const config = createCalibrationConfig({ warehouse: 'VDCG', startsAt: '2026-11-18T00:00:00Z' });
  assert.equal(config.endsAt, '2026-12-18T00:00:00.000Z');
  assert.equal(config.enabled, false);
  assert.equal(config.publicRankingsEnabled, false);
  assert.equal(config.automaticAwardsEnabled, false);
});
test('cycle snapshot cannot be changed through its original configuration', () => {
  const criteria = [{ id: 'quality', weight: 100, minimumEvidence: 2, required: true }];
  const snapshot = snapshotCriteria({ version: 'cycle-1-v1', criteria });
  criteria[0].weight = 1;
  assert.equal(snapshot.criteria[0].weight, 100);
  assert.throws(() => { snapshot.criteria[0].weight = 2; }, TypeError);
});
test('missing or partial evidence blocks finalization without inventing a score', () => {
  const snapshot = snapshotCriteria({ version: 'v1', criteria: [{ id: 'quality', weight: 100, minimumEvidence: 2, required: true }] });
  assert.equal(assessCoverage(snapshot, {}).status, 'DADOS_INSUFICIENTES');
  assert.equal(assessCoverage(snapshot, { quality: 1 }).canFinalize, false);
  assert.equal(assessCoverage(snapshot, { quality: 2 }).canFinalize, true);
  assert.equal(assessCoverage(snapshot, { quality: 2 }).score, null);
});
