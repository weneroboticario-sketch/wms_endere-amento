import test from 'node:test';
import assert from 'node:assert/strict';
import { excellenceFixture } from './fixture.js';
import { readEvaluation } from '../../src/excellence/evaluation-service.js';

test('standard evaluated tasks are seeded and generated once per active day', async () => {
 const f=await excellenceFixture();
 try {
  await f.asActor('admin');
  const templates=(await f.db.query("select wms_excellence_task_templates('VDCG') result")).rows[0].result;
  assert.equal(templates.length,5);
  assert.ok(templates.some(row=>row.code==='CONFERENCIA_7_ENDERECOS'));
  const first=(await f.db.query("select wms_excellence_ensure_standard_tasks('VDCG','2026-11-18') n")).rows[0].n;
  const second=(await f.db.query("select wms_excellence_ensure_standard_tasks('VDCG','2026-11-18') n")).rows[0].n;
  assert.equal(first,5);
  assert.equal(second,0);
  await f.db.exec('reset role');
  const rows=(await f.db.query("select count(*)::int n from operacao_tarefas where referencia_tipo='EXCELLENCE_STANDARD' and resultado_execucao->>'excellence_task_day'='2026-11-18'")).rows[0].n;
  assert.equal(rows,5);
 } finally { await f.db.close(); }
});

test('first operator claims standard task and validation creates auditable evidence', async () => {
 const f=await excellenceFixture();
 try {
  await f.asActor('admin');
  await f.db.query("select wms_excellence_ensure_standard_tasks('VDCG','2026-11-18')");
  await f.db.exec('reset role');
  const task=(await f.db.query("select id from operacao_tarefas where referencia_tipo='EXCELLENCE_STANDARD' and resultado_execucao->>'excellence_template_code'='RETIRAR_RECICLAGEM' limit 1")).rows[0];
  await f.asActor('op');
  const claimed=(await f.db.query('select (wms_excellence_claim_standard_task($1)).*',[task.id])).rows[0];
  assert.equal(claimed.atribuido_para,'op');
  assert.equal(claimed.status,'EM_ANDAMENTO');
  await assert.rejects(f.db.query('select wms_excellence_claim_standard_task($1)',[task.id]),/já foi assumida/);
  const done=(await f.db.query("select concluir_tarefa($1,'{}'::jsonb,null) t",[task.id])).rows[0].t;
  assert.equal(done.status,'AGUARDANDO_VALIDACAO');
  await f.asActor('sup');
  const validated=(await f.db.query('select validar_tarefa($1,null) t',[task.id])).rows[0].t;
  assert.equal(validated.status,'CONCLUIDA');
  await f.db.exec('reset role');
  const evidence=(await f.db.query("select * from wms_excellence_evidence where source_id=$1 and event_type='STANDARD_TASK_VALIDATED'",[task.id])).rows[0];
  assert.equal(evidence.user_id,'op');
  assert.equal(evidence.metadata.task_fact.complexityDefinedBeforeStart,true);
  assert.equal(evidence.metadata.verification_fact.criterion,'ORGANIZACAO');
  assert.equal(evidence.metadata.verification_fact.auditorId,'sup');
 } finally { await f.db.close(); }
});

test('seven-address audit requires seven unique addresses and blocks weekly reuse', async () => {
 const f=await excellenceFixture();
 try {
  await f.db.exec(`reset role;
   insert into wms_bindings(id,warehouse_code,sku,location_code,codigo_endereco) values
   ('a1','VDCG','01314','A1',null),('a2','VDCG','01314','A2',null),('a3','VDCG','01314','A3',null),
   ('a4','VDCG','01314','A4',null),('a5','VDCG','01314','A5',null),('a6','VDCG','01314','A6',null),
   ('a7','VDCG','01314','A7',null),('b2','VDCG','01314','B2',null),('b3','VDCG','01314','B3',null),
   ('b4','VDCG','01314','B4',null),('b5','VDCG','01314','B5',null),('b6','VDCG','01314','B6',null),('b7','VDCG','01314','B7',null);`);
  await f.asActor('admin');
  await f.db.query("select wms_excellence_ensure_standard_tasks('VDCG','2026-11-18')");
  await f.db.exec('reset role');
  let task=(await f.db.query("select id from operacao_tarefas where referencia_tipo='EXCELLENCE_STANDARD' and resultado_execucao->>'excellence_template_code'='CONFERENCIA_7_ENDERECOS' and resultado_execucao->>'excellence_task_day'='2026-11-18'")).rows[0];
  await f.asActor('op');
  await f.db.query('select wms_excellence_claim_standard_task($1)',[task.id]);
  await assert.rejects(
   f.db.query("select concluir_tarefa($1,$2::jsonb,null)",[task.id,JSON.stringify({enderecos_conferidos:['A1','A2','A3','A4','A5','A6']})]),
   /7 endereços/
  );
  const addresses=['A1','A2','A3','A4','A5','A6','A7'];
  const done=(await f.db.query("select concluir_tarefa($1,$2::jsonb,null) t",[task.id,JSON.stringify({enderecos_conferidos:addresses})])).rows[0].t;
  assert.equal(done.status,'AGUARDANDO_VALIDACAO');

  await f.asActor('admin');
  await f.db.query("select wms_excellence_ensure_standard_tasks('VDCG','2026-11-19')");
  await f.db.exec('reset role');
  task=(await f.db.query("select id from operacao_tarefas where referencia_tipo='EXCELLENCE_STANDARD' and resultado_execucao->>'excellence_template_code'='CONFERENCIA_7_ENDERECOS' and resultado_execucao->>'excellence_task_day'='2026-11-19'")).rows[0];
  await f.asActor('op');
  await f.db.query('select wms_excellence_claim_standard_task($1)',[task.id]);
  await assert.rejects(
   f.db.query("select concluir_tarefa($1,$2::jsonb,null)",[task.id,JSON.stringify({enderecos_conferidos:['A1','B2','B3','B4','B5','B6','B7']})]),
   /já foram conferidos nesta semana/
  );
 } finally { await f.db.close(); }
});

test('monthly cycle is full-month and uses hybrid execution', async () => {
 const f=await excellenceFixture();
 try {
  await f.asActor('admin');
  const cycle=(await f.db.query("select wms_excellence_create_monthly_cycle('VDCG','2026-12-01','Avaliação Mensal - 12/2026') result")).rows[0].result;
  await f.db.exec('reset role');
  const row=(await f.db.query(`
    select c.start_date,c.end_date,v.config->>'executionModel' model
    from wms_excellence_cycles c join wms_excellence_criteria_versions v on v.id=c.criteria_version_id
    where c.id=$1
  `,[cycle.id])).rows[0];
  assert.equal(new Date(row.start_date).toISOString().slice(0,10),'2026-12-01');
  assert.equal(new Date(row.end_date).toISOString().slice(0,10),'2026-12-31');
  assert.equal(row.model,'HYBRID');
 } finally { await f.db.close(); }
});


test('validated standard task contributes to execution and organization scoring', async () => {
 const f=await excellenceFixture();
 try {
  await f.asActor('admin');
  await f.db.query("select wms_excellence_ensure_standard_tasks('VDCG','2026-11-18')");
  await f.db.exec('reset role');
  const task=(await f.db.query("select id from operacao_tarefas where referencia_tipo='EXCELLENCE_STANDARD' and resultado_execucao->>'excellence_template_code'='ORGANIZAR_PAPELAO' and resultado_execucao->>'excellence_task_day'='2026-11-18'")).rows[0];
  await f.asActor('op');
  await f.db.query('select wms_excellence_claim_standard_task($1)',[task.id]);
  await f.db.query("select concluir_tarefa($1,'{}'::jsonb,'Organização concluída')",[task.id]);
  await f.asActor('sup');
  await f.db.query("select validar_tarefa($1,'Conferido pela liderança')",[task.id]);
  await f.asActor('op');
  const result=await readEvaluation(f.rpc,{cycle_id:f.cycle.id});
  const execution=result.calculation.criteria.find(row=>row.id==='EXECUCAO');
  const organization=result.calculation.criteria.find(row=>row.id==='ORGANIZACAO');
  assert.equal(execution.automatic,25);
  assert.ok(execution.explanation.automatic.included.some(row=>row.id==='operacao_tarefas:'+task.id));
  assert.equal(organization.explanation.automatic.denominator,1);
  assert.equal(organization.explanation.automatic.numerator,1);
 } finally { await f.db.close(); }
});
