import test from 'node:test';
import assert from 'node:assert/strict';
import { excellenceFixture } from './fixture.js';
import { readEvaluation, prepareCycleClosure } from '../../src/excellence/evaluation-service.js';
test('closure denies browser writes and incomplete inputs; trusted snapshots are immutable and isolated', async () => {
 const f = await excellenceFixture();
 try {
  await f.asActor('admin');
  await assert.rejects(prepareCycleClosure(f.rpc,f.cycle.id),/insuficientes/);
  await assert.rejects(f.db.query('select wms_excellence_close_cycle($1,$2,$3,$4)',[f.cycle.id,'00000000-0000-4000-8000-000000000001','x','[]']),/permission denied/);
  await f.db.exec("reset role;update wms_excellence_cycles set status='CALIBRATION'");
  // Test-only trusted worker output. This verifies the storage boundary, not the scoring engine.
  const people = (await f.db.query("select id from wms_users where private.excellence_user('VDCG',id)")).rows;
  const revision = (await f.db.query('select private.excellence_revision($1) r',[f.cycle.id])).rows[0].r;
  const configured = (await f.db.query('select config from wms_excellence_criteria_versions')).rows[0].config.criteria;
  const snapshots = people.map(person=>({user_id:person.id,calculation:{version:f.cycle.criteria_version_id,complete:true,preliminary:false,definitiveScore:90,pendingPoints:0,assessedPoints:90,criteria:configured.map(row=>({id:row.id,points:row.weight*0.9,coverageSufficient:true}))},evidence:[],scores:[]}));
  const close = (r, rows) => f.db.query('select wms_excellence_close_cycle($1,$2,$3,$4::jsonb) result',[f.cycle.id,'00000000-0000-4000-8000-000000000001',r,JSON.stringify(rows)]);
  await f.db.exec('set role service_role');
  await assert.rejects(close('stale',snapshots),/Dados alterados/);
  await assert.rejects(close(revision,snapshots.slice(1)),/Todos os colaboradores/);
  await assert.rejects(close(revision,snapshots.map((row,i)=>i?row:{...row,calculation:{...row.calculation,complete:false}})),/incompleta/);
  assert.equal((await close(revision,snapshots)).rows[0].result.closed,true);
  await f.asActor('op');
  const frozen = await readEvaluation(f.rpc,{cycle_id:f.cycle.id});
  assert.equal(frozen.frozen,true);assert.equal(frozen.calculation.assessedPoints,90);
  assert.equal((await f.db.query('select count(*)::int n from wms_excellence_assessments')).rows[0].n,1);
  await assert.rejects(f.rpc('INITIATIVE',{cycle_id:f.cycle.id,title:'late',description:'late'}),/fechado/);
  await f.db.exec('reset role');
  await assert.rejects(f.db.exec("update wms_excellence_assessments set result='{}'"),/imutável/);
  await assert.rejects(f.db.exec("update wms_excellence_cycles set status='ACTIVE'"),/imutável/);
  assert.equal((await f.db.query("select actor_id from wms_excellence_audit_log where action='CLOSE'")).rows[0].actor_id,'admin');
 } finally {await f.db.close();}
});
test('complete evidence reader paginates the same revision and refuses concurrent changes', async () => {
 const f=await excellenceFixture();
 try {
  await f.db.exec("reset role;insert into wms_transfer_events select 'read-'||n,'VDCG','op','CONFERENCIA','2026-11-18T12:00:00Z','01314',1 from generate_series(1,205)n");
  await f.asActor('admin');await f.rpc('SYNC',{cycle_id:f.cycle.id});
  const result = await readEvaluation(f.rpc,{cycle_id:f.cycle.id,user_id:'op'});
  assert.equal(result.evidence.length,208);assert.equal(new Set(result.evidence.map(row=>row.id)).size,208);
  let count=0;
  await assert.rejects(readEvaluation(async(action,data)=>{const value=await f.rpc(action,data);if(action==='EVIDENCE_PAGE')value.revision='changed';count++;return value;},{cycle_id:f.cycle.id,user_id:'op'}),/alteradas/);
  assert.equal(count,2);
 } finally {await f.db.close();}
});

test('complete synthetic cycle is calculated by shared engine then frozen with criteria and evidence', async () => {
 const f=await excellenceFixture();
 try {
  await f.db.exec("reset role;update wms_excellence_cycles set status='CALIBRATION'");
  const people=(await f.db.query("select id from wms_users where private.excellence_user('VDCG',id)")).rows;
  const insert=async(person,criterion,source,sourceId,day,metadata={})=>(await f.db.query(`insert into wms_excellence_evidence(cycle_id,warehouse_code,user_id,criterion_id,source_table,source_id,event_type,evidence_date,description,metadata) values($1,'VDCG',$2,$3,$4,$5,'SYNTHETIC_VALIDATED',$6,'Fato sintético para teste',$7::jsonb) returning id`,[f.cycle.id,person,criterion,source,sourceId,day+'T12:00:00Z',JSON.stringify(metadata)])).rows[0].id;
  for(const {id:person} of people){
   const auditor=person==='admin'?'sup':'admin';
   for(const day of ['2026-11-10','2026-11-11','2026-11-12']){
    await insert(person,'EXECUCAO','operacao_tarefas',person+day,day,{task_fact:{dueAt:day+'T16:00:00Z',completedAt:day+'T15:00:00Z',complexity:'SIMPLES',complexityDefinedBeforeStart:true,executorVerified:true,responsibilityVerified:true,deliveryValidated:true,status:'CONCLUIDA'}});
    for(const criterion of ['QUALIDADE','ORGANIZACAO'])for(let j=0;j<2;j++)await insert(person,criterion,'synthetic_audits',person+criterion+day+j,day,{verification_fact:{criterion,independentlyValidated:true,auditorId:auditor,userId:person,responsibilityVerified:true,result:'CONFORME',at:day+'T12:00:00Z'}});
   }
   for(const criterion of ['QUALIDADE','INICIATIVA','TRABALHO_EM_EQUIPE','POSTURA']){
    const ids=[];for(const day of ['2026-11-10','2026-11-11','2026-11-12'])ids.push(await insert(person,criterion,'synthetic_complementary',person+criterion+day,day));
    await f.db.query(`insert into wms_excellence_manual_scores(cycle_id,warehouse_code,user_id,evaluator_id,criterion_id,score,justification,evidence_ids) values($1,'VDCG',$2,$3,$4,100,'Evidências sintéticas complementares independentes',$5)`,[f.cycle.id,person,auditor,criterion,ids]);
   }
  }
  await f.asActor('admin');
  const prepared=await prepareCycleClosure(f.rpc,f.cycle.id);
  assert.equal(prepared.snapshots.length,people.length);
  assert.ok(prepared.snapshots.every(row=>row.calculation.assessedPoints===100&&row.calculation.pendingPoints===0));
  await f.db.exec('set role service_role');
  await f.db.query('select wms_excellence_close_cycle($1,$2,$3,$4::jsonb)',[f.cycle.id,'00000000-0000-4000-8000-000000000001',prepared.revision,JSON.stringify(prepared.snapshots)]);
  await f.asActor('op');const closed=await readEvaluation(f.rpc,{cycle_id:f.cycle.id});
  assert.equal(closed.calculation.score,100);assert.equal(closed.calculation.definitiveScore,100);assert.equal(closed.calculation.preliminary,false);assert.ok(closed.criteria.criteria);assert.ok(closed.evidence.length>=27);
  await f.db.exec("reset role;delete from wms_transfer_events");
  await f.asActor('op');assert.equal((await readEvaluation(f.rpc,{cycle_id:f.cycle.id})).calculation.score,100);
 }finally{await f.db.close();}
});
