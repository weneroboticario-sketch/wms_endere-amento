import test from 'node:test';
import assert from 'node:assert/strict';
import { excellenceFixture } from './fixture.js';
import { readEvaluation } from '../../src/excellence/evaluation-service.js';
test('relative replenishment execution uses opportunities, not volume, and never turns no-stock into penalty',async()=>{
 const f=await excellenceFixture();
 try{
  await f.asActor('admin');const cycle=await f.rpc('CREATE_CYCLE',{name:'Reposição relativa',from:'2026-11-01',to:'2026-11-30'});await f.rpc('ENABLE',{cycle_id:cycle.id});
  await f.db.exec(`reset role;
  insert into wms_replenishment_requests(id,warehouse_code,codigo_material,status,responsavel_id,claimed_by_id,claimed_at,started_at,finished_at,quantidade_solicitada,quantidade_atendida)
  values('relative-done','VDCG','88082','CONCLUIDO','op','op','2026-11-18T12:00:00Z','2026-11-18T12:00:00Z','2026-11-18T12:08:32Z',5,5),
  ('relative-open','VDCG','88082','EM_SEPARACAO','op','op','2026-11-18T13:00:00Z','2026-11-18T13:00:00Z',null,5,0),
  ('relative-no-stock','VDCG','88082','SEM_ESTOQUE','op','op','2026-11-18T14:00:00Z','2026-11-18T14:00:00Z','2026-11-18T14:01:00Z',5,0);`);
  await f.asActor('admin');await f.rpc('SYNC',{cycle_id:cycle.id});
  await f.asActor('op');const result=await readEvaluation(f.rpc,{cycle_id:cycle.id});const execution=result.calculation.criteria.find(row=>row.id==='EXECUCAO');
  assert.equal(execution.explanation.automatic.numerator,1);assert.equal(execution.explanation.automatic.denominator,2);assert.equal(execution.automatic,12.5);assert.equal(result.calculation.score,null);
  assert.ok(execution.explanation.automatic.excluded.some(row=>row.id.endsWith('relative-no-stock')));
 }finally{await f.db.close();}
});
