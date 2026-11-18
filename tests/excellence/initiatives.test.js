import test from 'node:test';
import assert from 'node:assert/strict';
import { excellenceFixture } from './fixture.js';
test('initiative requires independent review; validation produces one evidence and audit retains justification',async()=>{
 const f=await excellenceFixture();try{
  await f.asActor('op');const initiative=await f.rpc('INITIATIVE',{cycle_id:f.cycle.id,title:'Prevenção observada',description:'Contribuição sintética verificável'});
  await f.asActor('sup');await assert.rejects(f.rpc('VALIDATE_INITIATIVE',{cycle_id:f.cycle.id,user_id:'sup',initiative_id:initiative.id,decision:'VALIDATED',justification:'Sim'}),/Autovalidação/);
  await f.rpc('VALIDATE_INITIATIVE',{cycle_id:f.cycle.id,user_id:'op',initiative_id:initiative.id,decision:'VALIDATED',justification:'Benefício operacional comprovado'});
  await assert.rejects(f.rpc('VALIDATE_INITIATIVE',{cycle_id:f.cycle.id,user_id:'op',initiative_id:initiative.id,decision:'VALIDATED',justification:'Repetição'}),/já analisada/);
  await f.asActor('op');const own=await f.rpc('DASHBOARD',{cycle_id:f.cycle.id});assert.equal(own.initiatives[0].status,'VALIDATED');assert.equal(own.evidence.filter(row=>row.event_type==='INITIATIVE_VALIDATED').length,1);
  await f.db.exec('reset role');assert.ok((await f.db.query("select after_data->>'validation_notes' note from wms_excellence_audit_log where table_name='wms_excellence_initiatives' and action='UPDATE'")).rows.some(row=>row.note==='Benefício operacional comprovado'));
 }finally{await f.db.close();}
});
