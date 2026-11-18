import test from 'node:test';
import assert from 'node:assert/strict';
import { excellenceFixture } from './fixture.js';
import { readTeamEvaluation } from '../../src/excellence/evaluation-service.js';
test('team dashboard is grouped, warehouse-scoped and denied to ordinary profiles',async()=>{
 const f=await excellenceFixture();try{
  await f.asActor('op');await assert.rejects(readTeamEvaluation(f.rpc,{cycle_id:f.cycle.id}),/Liderança/);
  await f.asActor('sup');const team=await readTeamEvaluation(f.rpc,{cycle_id:f.cycle.id});assert.ok(team.rows.some(row=>row.user_id==='op'));assert.ok(!team.rows.some(row=>row.user_id==='other'));
  assert.equal(team.rows.find(row=>row.user_id==='op').evidenceCount,3);
  await f.asActor('other');await assert.rejects(f.rpc('TEAM',{cycle_id:f.cycle.id},'VDAR'),/não encontrado/);
 }finally{await f.db.close();}
});
