import test from 'node:test';
import assert from 'node:assert/strict';
import { excellenceFixture } from './fixture.js';
import { synchronizeEvidence } from '../../src/excellence/synchronization.js';
test('keyset handles more than 1001 same-timestamp events with retry and no foreign-unit data', async () => {
 const f = await excellenceFixture();
 try {
  await f.db.exec(`reset role;
  insert into wms_transfer_events(id,warehouse_code,user_id,event_type,created_at,sku,quantity)
   select 'page-'||lpad(n::text,5,'0'),'VDCG','op','CONFERENCIA','2026-11-18T12:00:00Z','01314',1 from generate_series(1,1205)n;
  insert into wms_transfer_events values('foreign-page','VDAR','other','CONFERENCIA','2026-11-18T12:00:00Z','01314',1),('outside-local','VDCG','op','CONFERENCIA','2026-11-01T02:00:00Z','01314',1);`);
  await f.asActor('sup');
  const first = await f.rpc('SYNC', { cycle_id:f.cycle.id });
  assert.equal(first.has_more,true);
  const retry = await f.rpc('SYNC', { cycle_id:f.cycle.id });
  assert.deepEqual(retry.cursors,first.cursors);assert.equal(retry.inserted,0);
  const result = await synchronizeEvidence({ rpc:f.rpc, cycleId:f.cycle.id, cursors:first.cursors });
  assert.equal(result.has_more,false);assert.equal(result.pages,2);
  await f.db.exec('reset role');
  assert.equal((await f.db.query("select count(*)::int n from wms_excellence_evidence where source_table='wms_transfer_events'")).rows[0].n,1206);
  assert.equal((await f.db.query("select count(*)::int n from wms_excellence_evidence where source_id in ('foreign-page','outside-local')")).rows[0].n,0);
  await f.asActor('sup');
  await assert.rejects(f.rpc('SYNC',{cycle_id:f.cycle.id,cursors:{wms_transfer_events:{at:'2027-01-01T00:00:00Z',id:'x'}}}),/fora do ciclo/);
 } finally {await f.db.close();}
});
test('scope change stops subsequent synchronization pages', async () => {
 let calls=0,current=true;
 await assert.rejects(synchronizeEvidence({cycleId:'cycle',isCurrent:()=>current,rpc:async()=>{calls++;current=false;return {has_more:true,cursors:{x:1}};}}),/alterada/);
 assert.equal(calls,1);
});
