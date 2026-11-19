import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePreliminary, standardTaskPointsSummary } from '../../src/excellence/scoring.js';

const period={from:'2026-11-01T04:00:00Z',to:'2026-12-01T04:00:00Z'};
const weights={SIMPLES:1,INTERMEDIARIA:2,COMPLEXA:3};
const taskEvidence=(id,complexity='INTERMEDIARIA',day='2026-11-19T14:00:00Z')=>({
 id:'evidence-'+id,
 source_table:'operacao_tarefas',
 source_id:id,
 event_type:'STANDARD_TASK_VALIDATED',
 evidence_date:day,
 description:'Tarefa padrão concluída e validada.',
 metadata:{
  template_code:'ROTINA_'+id,
  template_title:'Rotina '+id,
  criterion:'ORGANIZACAO',
  task_fact:{
   executorVerified:true,
   responsibilityVerified:true,
   status:'CONCLUIDA',
   dueAt:'2026-11-20T03:59:00Z',
   completedAt:day,
   complexity,
   complexityDefinedBeforeStart:true,
   deliveryValidated:true,
   exemptionValidated:false
  },
  verification_fact:{
   criterion:'ORGANIZACAO',
   userId:'op',
   auditorId:'sup',
   independentlyValidated:true,
   responsibilityVerified:true,
   result:'CONFORME',
   at:day
  }
 }
});

test('validated standard tasks earn 1/2/3 operational points without duplicate source',()=>{
 const first=taskEvidence('a','SIMPLES');
 const duplicate={...first,id:'another-evidence'};
 const summary=standardTaskPointsSummary([first,duplicate,taskEvidence('b','INTERMEDIARIA'),taskEvidence('c','COMPLEXA')],{...period,complexityWeights:weights});
 assert.equal(summary.completed,3);
 assert.equal(summary.points,6);
 assert.deepEqual(summary.byComplexity.map(row=>[row.id,row.points]).sort(),[
  ['COMPLEXA',3],['INTERMEDIARIA',2],['SIMPLES',1]
 ]);
});

function evaluation(executionModel,evidence){
 return calculatePreliminary({
  cycle:{criteria_version_id:'criteria-v2'},
  config:{
   engineVersion:2,
   minimumDays:1,
   minimumSample:1,
   complexityWeights:weights,
   executionModel,
   criteria:[{id:'EXECUCAO',weight:100,automaticMaximum:100,assistedMaximum:0,formula:'EXECUTION'}],
   bands:[{minimum:0,label:'Teste'}]
  },
  evidence,
  scores:[],
  absences:[],
  period,
  evidenceTruncated:false
 });
}

test('hybrid evaluation keeps shared standard tasks out of 0-100 execution rate',()=>{
 const result=evaluation('HYBRID',[taskEvidence('a','INTERMEDIARIA')]);
 assert.equal(result.operationalPoints.points,2);
 assert.equal(result.operationalPoints.completed,1);
 assert.equal(result.criteria[0].automatic,null);
 assert.equal(result.score,null);
});

test('task-only legacy model can still use validated standard task execution facts',()=>{
 const result=evaluation('TASKS',[taskEvidence('a','INTERMEDIARIA')]);
 assert.equal(result.operationalPoints.points,2);
 assert.equal(result.criteria[0].automatic,100);
 assert.equal(result.score,100);
});
