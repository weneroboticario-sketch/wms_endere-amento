import test from 'node:test';
import assert from 'node:assert/strict';
import { excellenceFixture } from './fixture.js';
import { readEvaluation } from '../../src/excellence/evaluation-service.js';

test('derived operational tasks do not duplicate replenishment evidence', async () => {
 const f=await excellenceFixture();
 try{
  await f.db.exec(`reset role;
   insert into operacao_tarefas(id,codigo_visivel,tipo,titulo,estoque_id,atribuido_para,status,data_conclusao,referencia_tipo,referencia_id)
   select '22345678-1234-4234-8234-123456789012','TAR-DER','REPOSICAO','Tarefa derivada','VDCG','op','CONCLUIDA','2026-11-18T13:00:00Z','REPOSICAO',id
   from wms_replenishment_requests limit 1;`);
  await f.asActor('admin');
  await f.rpc('SYNC',{cycle_id:f.cycle.id});
  const dashboard=await f.rpc('DASHBOARD',{cycle_id:f.cycle.id,user_id:'op'});
  assert.equal(dashboard.evidence.filter(row=>row.source_id==='22345678-1234-4234-8234-123456789012').length,0);
 }finally{await f.db.close();}
});

test('validated absences neutralize overlapping replenishment opportunities', async () => {
 const f=await excellenceFixture();
 try{
  await f.db.exec(`reset role;
   update wms_replenishment_requests set claimed_at='2026-11-18T10:00:00Z',started_at='2026-11-18T10:00:00Z',responsavel_id='op',claimed_by_id='op',finished_at='2026-11-18T10:08:00Z',status='CONCLUIDO';`);
  await f.asActor('admin');
  const cycle=await f.rpc('CREATE_CYCLE',{name:'Ausência sobre reposição',from:'2026-11-01',to:'2026-11-30',execution_model:'REPLENISHMENT'});
  await f.rpc('SET_MEMBERS',{cycle_id:cycle.id,member_ids:['op']});
  await f.rpc('ENABLE',{cycle_id:cycle.id});
  await f.rpc('SYNC',{cycle_id:cycle.id});
  const absence=await f.rpc('ADD_ABSENCE',{cycle_id:cycle.id,user_id:'op',absence_type:'FOLGA',from:'2026-11-18',to:'2026-11-18',justification:'Folga validada para teste'});
  await f.asActor('op');
  let result=await readEvaluation(f.rpc,{cycle_id:cycle.id});
  const execution=result.calculation.criteria.find(row=>row.id==='EXECUCAO');
  assert.ok(execution.explanation.automatic.excluded.some(row=>row.reason==='AUSENCIA_OU_IMPEDIMENTO_VALIDADO'));
  assert.ok(result.calculation.warnings.includes('VALIDATED_ABSENCE_RECORDED'));
  await f.asActor('admin');
  await f.rpc('REMOVE_ABSENCE',{cycle_id:cycle.id,absence_id:absence.id});
  await f.asActor('op');
  result=await readEvaluation(f.rpc,{cycle_id:cycle.id});
  assert.equal(result.calculation.absencePeriods,0);
 }finally{await f.db.close();}
});

test('independent review creates verification facts for quality and organization', async () => {
 const f=await excellenceFixture();
 try{
  await f.asActor('admin');
  const dashboard=await f.rpc('DASHBOARD',{cycle_id:f.cycle.id,user_id:'op'});
  const event=dashboard.evidence.find(row=>row.source_table==='wms_transfer_events');
  const reviewed=await f.rpc('REVIEW_EVIDENCE',{cycle_id:f.cycle.id,user_id:'op',evidence_id:event.id,criterion_id:'QUALIDADE',result:'CONFORME',justification:'Conferência independente'});
  assert.equal(reviewed.metadata.verification_fact.criterion,'QUALIDADE');
  assert.equal(reviewed.metadata.verification_fact.auditorId,'admin');
  assert.equal(reviewed.metadata.verification_fact.userId,'op');
  assert.equal(reviewed.metadata.verification_fact.result,'CONFORME');
 }finally{await f.db.close();}
});
