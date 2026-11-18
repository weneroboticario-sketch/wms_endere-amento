import test from 'node:test';
import assert from 'node:assert/strict';
import { excellenceFixture } from './fixture.js';
import { calculatePreliminary } from '../../src/excellence/scoring.js';
test('operational source -> evidence -> own dashboard -> manual score -> calibration -> audit', async () => {
 const f = await excellenceFixture();
 try {
  await f.asActor('admin');
  const first = await f.rpc('DASHBOARD', { cycle_id: f.cycle.id, user_id: 'op' });
  assert.equal(first.evidence.length, 3);
  assert.deepEqual(new Set(first.evidence.map(row => row.source_table)), new Set(['operacao_tarefas', 'wms_replenishment_requests', 'wms_transfer_events']));
  await f.rpc('SYNC', { cycle_id: f.cycle.id });
  const replay = await f.rpc('DASHBOARD', { cycle_id: f.cycle.id, user_id: 'op' });
  assert.equal(replay.evidence.length, 3);
  assert.equal(calculatePreliminary(replay).score, null);
  const event = replay.evidence.find(row => row.source_table === 'wms_transfer_events');
  await f.rpc('REVIEW_EVIDENCE', { cycle_id: f.cycle.id, user_id: 'op', evidence_id: event.id, criterion_id: 'QUALIDADE', result: 'CONFORME', justification: 'Conferência sintética revisada' });
  await f.rpc('MANUAL_SCORE', { cycle_id: f.cycle.id, user_id: 'op', criterion_id: 'QUALIDADE', evidence_ids: [event.id], score: 80, justification: 'Verificado' });
  await f.rpc('CALIBRATION', { cycle_id: f.cycle.id, user_id: 'op', score: 82, justification: 'Proposta, sem fechamento' });
  await f.asActor('op');
  const own = await f.rpc('DASHBOARD', { cycle_id: f.cycle.id });
  assert.equal(own.calibrations.length, 1);
  assert.equal(own.scores[0].score, 80);
  assert.equal(calculatePreliminary(own).score, null);
  await f.asActor('admin');
  await f.db.exec('reset role');
  assert.ok((await f.db.query("select count(*)::int n from wms_excellence_audit_log where table_name='wms_excellence_evidence' and action='UPDATE'")).rows[0].n > 0);
  assert.equal(Number((await f.db.query('select qty from stock_balance')).rows[0].qty), 20);
 } finally { await f.db.close(); }
});
