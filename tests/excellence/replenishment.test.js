import test from 'node:test';
import assert from 'node:assert/strict';
import { excellenceFixture } from './fixture.js';
import { readEvaluation } from '../../src/excellence/evaluation-service.js';
test('replenishment responsibility, full/partial/no-stock/return events, origin and replay protection',async()=>{
 const f=await excellenceFixture();
 try{
  await f.db.exec(`reset role;
   insert into wms_replenishment_requests(id,warehouse_code,codigo_material,status,solicitado_por_id,responsavel_id,claimed_by_id,claimed_at,started_at,finished_at,quantidade_solicitada,quantidade_atendida,quantidade_pendente,duration_seconds)
   values('flow-op','VDCG','88082','PENDENTE','cash',null,null,null,null,null,5,0,5,null);
   update wms_replenishment_requests set status='EM_SEPARACAO',responsavel_id='op',claimed_by_id='op',claimed_at='2026-11-18T12:00:00Z',started_at='2026-11-18T12:00:00Z' where id='flow-op';
   update wms_replenishment_requests set quantidade_atendida=5,quantidade_pendente=0 where id='flow-op';
   update wms_replenishment_requests set status='CONCLUIDO',finished_at='2026-11-18T12:08:32Z',duration_seconds=512 where id='flow-op';
   insert into wms_replenishment_requests(id,warehouse_code,codigo_material,status,solicitado_por_id,responsavel_id,finished_at,quantidade_solicitada,quantidade_atendida,quantidade_pendente)
   values('partial','VDCG','01314','CONCLUIDO','cash','sup','2026-11-18T13:00:00Z',10,4,6),('none','VDCG','01314','SEM_ESTOQUE','cash','op','2026-11-18T13:00:00Z',10,0,10);
   insert into wms_replenishment_requests(id,warehouse_code,codigo_material,status,solicitado_por_id,returned_to_queue_at,returned_to_queue_by_id)
   values('returned','VDCG','01314','PENDENTE','cash','2026-11-18T14:00:00Z','op');`);
  await f.asActor('admin');await f.rpc('SYNC',{cycle_id:f.cycle.id});await f.rpc('SYNC',{cycle_id:f.cycle.id});
  await f.asActor('op');const own=await readEvaluation(f.rpc,{cycle_id:f.cycle.id});
  const full=own.evidence.find(row=>row.source_id==='flow-op');assert.ok(full);assert.equal(full.event_type,'REPLENISHMENT_COMPLETED_FULL');assert.equal(full.criterion_id,'EXECUCAO');assert.equal(full.direction,'POSITIVE');
  assert.equal(full.metadata.attended,5);assert.equal(full.metadata.duration_seconds,512);assert.equal(full.metadata.sku,'88082');assert.equal(own.evidence.filter(row=>row.source_id==='flow-op').length,1);
  assert.equal(own.evidence.find(row=>row.source_id==='none').direction,'NEUTRAL');assert.equal(own.evidence.find(row=>row.source_id==='returned').event_type,'REPLENISHMENT_RETURNED_TO_QUEUE');
  assert.ok(!own.evidence.some(row=>row.source_id==='partial'));
  const origin=await f.rpc('ORIGIN',{cycle_id:f.cycle.id,evidence_id:full.id});assert.equal(origin.id,'flow-op');assert.equal(origin.duration_seconds,512);assert.equal(origin.responsible_id,'op');
  await f.asActor('sup');const team=await f.rpc('DASHBOARD',{cycle_id:f.cycle.id,user_id:'op'});assert.ok(team.evidence.some(row=>row.id===full.id));
  const partial=(await f.rpc('DASHBOARD',{cycle_id:f.cycle.id})).evidence.find(row=>row.source_id==='partial');assert.equal(partial.direction,'NEUTRAL');assert.equal(partial.event_type,'REPLENISHMENT_COMPLETED_PARTIAL');
  await f.asActor('cash');assert.ok(!(await f.rpc('DASHBOARD',{cycle_id:f.cycle.id})).evidence.some(row=>row.source_id==='flow-op'));
  await assert.rejects(f.rpc('ORIGIN',{cycle_id:f.cycle.id,evidence_id:full.id}),/não disponível/);
 }finally{await f.db.close();}
});
