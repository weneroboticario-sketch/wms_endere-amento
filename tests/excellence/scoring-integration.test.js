import test from 'node:test';
import assert from 'node:assert/strict';
import { excellenceFixture } from './fixture.js';
import { calculatePreliminary } from '../../src/excellence/scoring.js';
test('database version supplies split; manual rating cannot become automatic execution', async () => {
 const f = await excellenceFixture();
 try {
  await f.asActor('sup');
  const data = await f.rpc('DASHBOARD', { cycle_id: f.cycle.id, user_id: 'op' });
  assert.equal(data.period.from, '2026-11-01T04:00:00+00:00');
  assert.equal(data.config.criteria.reduce((sum,row) => sum+row.automaticMaximum,0),55);
  assert.equal(data.config.criteria.reduce((sum,row) => sum+row.assistedMaximum,0),45);
  const proof = data.evidence[0].id;
  await assert.rejects(f.rpc('MANUAL_SCORE', { cycle_id:f.cycle.id,user_id:'op',criterion_id:'EXECUCAO',score:100,justification:'Texto',evidence_ids:[proof] }), /Critério inválido/);
  await assert.rejects(f.rpc('MANUAL_SCORE', { cycle_id:f.cycle.id,user_id:'op',criterion_id:'QUALIDADE',score:100,justification:'Texto',evidence_ids:[] }), /Evidências complementares/);
  await assert.rejects(f.rpc('MANUAL_SCORE', { cycle_id:f.cycle.id,user_id:'op',criterion_id:'QUALIDADE',score:100,justification:'Texto',evidence_ids:['00000000-0000-4000-8000-000000000099'] }), /fora da avaliação/);
  await f.rpc('MANUAL_SCORE', { cycle_id:f.cycle.id,user_id:'op',criterion_id:'QUALIDADE',score:80,justification:'Qualidade complementar comprovada',evidence_ids:[proof] });
  const result = calculatePreliminary(await f.rpc('DASHBOARD', { cycle_id:f.cycle.id,user_id:'op' }));
  assert.equal(result.criteria.find(row=>row.id==='EXECUCAO').automatic,null);
  assert.equal(result.criteria.find(row=>row.id==='QUALIDADE').assisted,4);
  assert.equal(result.assessedPoints,4);assert.equal(result.pendingPoints,95);assert.equal(result.notObtainedPoints,1);
  assert.equal(result.score,null);assert.equal(result.definitiveScore,null);
  assert.ok(result.criteria[0].explanation.automatic.formula);
 } finally {await f.db.close();}
});
