import test from 'node:test';
import assert from 'node:assert/strict';
import { excellenceFixture } from './fixture.js';

test('leader sees existing WMS work without creating an evaluation task', async () => {
 const f=await excellenceFixture();
 try {
  await f.db.exec('reset role');
  await f.db.query(`
   insert into wms_replenishment_participation_events(
    warehouse_code,request_id,event_type,actor_id,actor_name_snapshot,quantity_delta,event_at,metadata
   ) values
    ('VDCG','rep-monitor','ATTENDED','op','Operador',4,'2026-11-18T13:00:00Z','{"sku":"01314"}'::jsonb),
    ('VDCG','rep-monitor','COMPLETED','op','Operador',null,'2026-11-18T13:05:00Z','{"sku":"01314"}'::jsonb)
  `);
  await f.asActor('sup');
  const result=(await f.db.query(
   "select wms_excellence_operational_overview('VDCG','2026-11-01','2026-11-30') result"
  )).rows[0].result;
  const operator=result.people.find(row=>row.user_id==='op');
  assert.ok(operator);
  assert.equal(operator.replenishments_handled,1);
  assert.equal(Number(operator.replenishment_units),4);
  assert.equal(operator.transfer_items,1);
  assert.equal(operator.tasks_completed,1);
  assert.equal(operator.standard_tasks_completed,0);
  assert.equal(operator.activity_records,3);
  assert.equal(result.totals.activity_records>=3,true);
 } finally { await f.db.close(); }
});

test('operational overview is leader-only and independent from cycle existence', async () => {
 const f=await excellenceFixture();
 try {
  await f.asActor('op');
  await assert.rejects(
   f.db.query("select wms_excellence_operational_overview('VDCG','2026-11-01','2026-11-30')"),
   /Liderança necessária/
  );
  await f.asActor('sup');
  const result=(await f.db.query(
   "select wms_excellence_operational_overview('VDCG','2026-11-01','2026-11-30') result"
  )).rows[0].result;
  assert.equal(result.period.from,'2026-11-01');
  assert.equal(result.period.to,'2026-11-30');
 } finally { await f.db.close(); }
});
