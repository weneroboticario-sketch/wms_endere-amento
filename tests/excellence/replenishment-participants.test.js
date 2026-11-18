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
   grant select,update on wms_replenishment_requests to authenticated;
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


test('two executors on the same replenishment keep separate verified contributions', async () => {
 const f=await excellenceFixture();
 try {
  await f.db.exec(`reset role;
   grant select,update on wms_replenishment_requests to authenticated;
   insert into wms_replenishment_requests(
    id,warehouse_code,codigo_material,status,solicitado_por_id,quantidade_solicitada,quantidade_atendida,quantidade_pendente,is_deleted,created_at
   ) values('shared-executors','VDCG','88082','PENDENTE','cash',5,0,5,false,'2026-11-18T12:00:00Z');`);

  await f.asActor('op');
  await f.db.exec(`update wms_replenishment_requests
   set responsavel_id='op',claimed_by_id='op',claimed_at='2026-11-18T12:01:00Z',started_at='2026-11-18T12:01:00Z',
       quantidade_atendida=2,quantidade_pendente=3,status='ATENDIDO_PARCIAL'
   where id='shared-executors';`);

  await f.asActor('sup');
  await f.db.exec(`update wms_replenishment_requests
   set responsavel_id='sup',claimed_by_id='sup',claimed_at='2026-11-18T12:03:00Z',
       quantidade_atendida=5,quantidade_pendente=0,status='SEPARADO'
   where id='shared-executors';
   update wms_replenishment_requests
   set status='CONCLUIDO',finished_at='2026-11-18T12:05:00Z',duration_seconds=240
   where id='shared-executors';`);

  await f.db.exec('reset role');
  const events=(await f.db.query(`
   select event_type,actor_id,quantity_delta
   from wms_replenishment_participation_events
   where request_id='shared-executors'
   order by id
  `)).rows;
  assert.deepEqual(events.filter(row=>row.event_type==='ATTENDED').map(row=>[row.actor_id,Number(row.quantity_delta)]),[['op',2],['sup',3]]);

  await f.asActor('admin');
  const cycle=await f.rpc('CREATE_CYCLE',{name:'Execução compartilhada',from:'2026-11-01',to:'2026-11-30',execution_model:'REPLENISHMENT'});
  await f.rpc('SET_MEMBERS',{cycle_id:cycle.id,member_ids:['cash','op','sup']});
  await f.rpc('ENABLE',{cycle_id:cycle.id});
  await f.rpc('SYNC',{cycle_id:cycle.id});

  await f.asActor('op');
  const op=await readEvaluation(f.rpc,{cycle_id:cycle.id});
  const opExecution=op.calculation.criteria.find(row=>row.id==='EXECUCAO');
  assert.equal(opExecution.automatic,25);
  assert.ok(op.evidence.some(row=>row.metadata?.request_id==='shared-executors'&&row.metadata?.replenishment_role==='EXECUTOR'));

  await f.asActor('sup');
  const sup=await readEvaluation(f.rpc,{cycle_id:cycle.id});
  const supExecution=sup.calculation.criteria.find(row=>row.id==='EXECUCAO');
  assert.equal(supExecution.automatic,25);
  assert.ok(sup.evidence.some(row=>row.metadata?.request_id==='shared-executors'&&row.metadata?.replenishment_role==='EXECUTOR'));

  await f.asActor('cash');
  const cash=await readEvaluation(f.rpc,{cycle_id:cycle.id});
  assert.ok(cash.evidence.some(row=>row.source_id==='shared-executors'&&row.metadata?.replenishment_role==='SOLICITANTE'));
 } finally { await f.db.close(); }
});
