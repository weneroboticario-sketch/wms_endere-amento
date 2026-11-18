import test from 'node:test';
import assert from 'node:assert/strict';
import { readFoundationSql } from './schema.js';
import { communicationFixture, asActor } from '../communication-fixture.js';
test('foundation uses real Postgres RLS, immutable criteria and authenticated audit', async () => {
 const db = await communicationFixture();
 const rpc = async (action, data = {}, warehouse = 'VDCG') => (await db.query('select wms_excellence_api($1,$2,$3::jsonb) result', [warehouse, action, JSON.stringify(data)])).rows[0].result;
 try {
  await db.exec(await readFoundationSql());
  await asActor(db, 'admin');
  const cycle = await rpc('CREATE_CYCLE', { name: 'Calibração sintética', from: '2026-11-01', to: '2026-11-30' });
  await assert.rejects(rpc('ENABLE', { cycle_id: cycle.id }), /Defina a equipe/);
  await rpc('SET_MEMBERS', { cycle_id: cycle.id, member_ids: ['op','sup'] });
  await rpc('SET_MEMBERS', { cycle_id: cycle.id, member_ids: ['op'] });
  await rpc('ENABLE', { cycle_id: cycle.id });
  await asActor(db, 'op');
  await rpc('INITIATIVE', { cycle_id: cycle.id, title: 'Melhoria', description: 'Exemplo sintético' });
  await assert.rejects(rpc('MANUAL_SCORE', { cycle_id: cycle.id, user_id: 'op' }), /Liderança/);
  await assert.rejects(rpc('DASHBOARD', { cycle_id: cycle.id, user_id: 'sup' }), /fora do acesso/);
  await assert.rejects(db.query("update wms_excellence_cycles set enabled=true"), /permission denied/);
  await asActor(db, 'other');
  assert.deepEqual((await db.query('select * from wms_excellence_initiatives')).rows, []);
  await assert.rejects(rpc('DASHBOARD', { cycle_id: cycle.id }), /Acesso não autorizado/);
  await db.exec('reset role');
  const proof = (await db.query("insert into wms_excellence_evidence(cycle_id,warehouse_code,user_id,criterion_id,source_table,source_id,event_type,evidence_date,description) values($1,'VDCG','op','QUALIDADE','fixture','verified-1','TEST',now(),'Evidência sintética') returning id", [cycle.id])).rows[0].id;
  await asActor(db, 'sup');
  await rpc('MANUAL_SCORE', { cycle_id: cycle.id, user_id: 'op', criterion_id: 'QUALIDADE', evidence_ids: [proof], score: 80, justification: 'Observação comprovada' });
  await assert.rejects(rpc('MANUAL_SCORE', { cycle_id: cycle.id, user_id: 'sup', criterion_id: 'QUALIDADE', score: 90, justification: 'ok' }), /Autovalidação/);
  const dashboard = await rpc('DASHBOARD', { cycle_id: cycle.id, user_id: 'op' });
  assert.equal(dashboard.scores[0].score, 80);
  assert.equal(dashboard.initiatives.length, 1);
  await db.exec('reset role');
  await assert.rejects(db.exec("update wms_excellence_criteria_versions set version=2"), /imutável/);
  await assert.rejects(db.exec("delete from wms_excellence_audit_log"), /imutável/);
  assert.ok((await db.query('select count(*)::int n from wms_excellence_audit_log')).rows[0].n >= 4);
  assert.ok((await db.query("select count(*)::int n from wms_excellence_audit_log where table_name='wms_excellence_cycle_members' and action='DELETE'")).rows[0].n >= 1);
 } finally { await db.close(); }
});
