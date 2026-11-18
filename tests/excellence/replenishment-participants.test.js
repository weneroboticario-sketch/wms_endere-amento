import test from 'node:test';
import assert from 'node:assert/strict';
import { excellenceFixture } from './fixture.js';
import { readEvaluation } from '../../src/excellence/evaluation-service.js';

test('one replenishment credits requester executor and distinct completer without volume points', async () => {
 const f=await excellenceFixture();
 try {
  await f.db.exec(`reset role;
   insert into wms_replenishment_requests(
    id,warehouse_code,codigo_material,status,solicitado_por_id,responsavel_id,claimed_by_id,claimed_at,
    last_attended_by_id,completed_by_id,finished_at,started_at,quantidade_solicitada,quantidade_atendida,quantidade_pendente,duration_seconds,is_deleted
   ) values(
    'shared-role','VDCG','88082','CONCLUIDO','cash','op','op','2026-11-18T12:00:00Z',
    'op','sup','2026-11-18T12:08:00Z','2026-11-18T12:00:00Z',6,6,0,480,false
   );`);
  await f.asActor('admin');
  const cycle=await f.rpc('CREATE_CYCLE',{name:'Papéis compartilhados',from:'2026-11-01',to:'2026-11-30',execution_model:'REPLENISHMENT'});
  await f.rpc('SET_MEMBERS',{cycle_id:cycle.id,member_ids:['cash','op','sup']});
  await f.rpc('ENABLE',{cycle_id:cycle.id});
  await f.rpc('SYNC',{cycle_id:cycle.id});

  const cash=await f.rpc('DASHBOARD',{cycle_id:cycle.id,user_id:'cash'});
  const op=await f.rpc('DASHBOARD',{cycle_id:cycle.id,user_id:'op'});
  const sup=await f.rpc('DASHBOARD',{cycle_id:cycle.id,user_id:'sup'});
  const requester=cash.evidence.find(row=>row.source_id==='shared-role'&&row.metadata.replenishment_role==='SOLICITANTE');
  const executor=op.evidence.find(row=>row.source_id==='shared-role'&&row.metadata.replenishment_role==='EXECUTOR');
  const completer=sup.evidence.find(row=>row.source_id==='shared-role'&&row.metadata.replenishment_role==='CONCLUIDOR');

  assert.equal(requester.event_type,'REPLENISHMENT_REQUEST_PROCESSED');
  assert.equal(requester.direction,'POSITIVE');
  assert.equal(requester.metadata.opportunity_verified,true);
  assert.equal(executor.event_type,'REPLENISHMENT_COMPLETED_FULL');
  assert.equal(executor.metadata.opportunity_verified,true);
  assert.equal(completer.event_type,'REPLENISHMENT_COMPLETION_RECORDED');
  assert.equal(completer.direction,'POSITIVE');

  await f.asActor('cash');
  const requesterEvaluation=await readEvaluation(f.rpc,{cycle_id:cycle.id});
  const execution=requesterEvaluation.calculation.criteria.find(row=>row.id==='EXECUCAO');
  assert.equal(execution.automatic,25);
  assert.ok(execution.explanation.automatic.included.some(row=>row.role==='SOLICITANTE'));
 } finally { await f.db.close(); }
});

test('database stamps real actor even when client attempts to spoof replenishment attribution', async () => {
 const f=await excellenceFixture();
 try {
  await f.db.exec(`reset role;
   insert into wms_replenishment_requests(id,warehouse_code,codigo_material,status,solicitado_por_id,quantidade_solicitada,quantidade_atendida,quantidade_pendente,is_deleted)
   values('actor-stamp','VDCG','88082','PENDENTE','cash',6,0,6,false);`);
  await f.asActor('op');
  await f.db.exec(`update wms_replenishment_requests
   set quantidade_atendida=6,quantidade_pendente=0,status='SEPARADO',last_attended_by_id='sup'
   where id='actor-stamp';`);
  let row=(await f.db.query(`select last_attended_by_id from wms_replenishment_requests where id='actor-stamp'`)).rows[0];
  assert.equal(row.last_attended_by_id,'op');

  await f.asActor('sup');
  await f.db.exec(`update wms_replenishment_requests
   set status='CONCLUIDO',finished_at='2026-11-18T12:10:00Z',completed_by_id='op'
   where id='actor-stamp';`);
  row=(await f.db.query(`select completed_by_id from wms_replenishment_requests where id='actor-stamp'`)).rows[0];
  assert.equal(row.completed_by_id,'sup');
 } finally { await f.db.close(); }
});
