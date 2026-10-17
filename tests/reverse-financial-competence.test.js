import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {workflowDatabase} from "./purchases-workflow-db.test.js";

const migration=name=>readFile(new URL("../supabase/migrations/"+name,import.meta.url),"utf8");
async function insertReverse(db,id,competence=null) {
 return (await db.query(`insert into wms_reverse_logistics(id,warehouse_code,unit_origin_code,unit_origin_name,
 box_quantity,gdv_number,gdv_normalized,nfe_number,nfe_normalized,responsible_id,responsible_name,
 created_by_id,created_by_name,competence_month,idempotency_key${competence?",financial_competence,invoice_issue_date":""})
 values($1,'A','A','Store A',12,$1,'',$1,'','actor','Actor','actor','Actor',current_date,$1${competence?",$2,'2026-09-28'":""}) returning *`,competence?[id,competence]:[id])).rows[0];
}

test("reverse financial competence keeps retroactive month, reviews legacy and audits authorized corrections",async()=>{
 const db=await workflowDatabase();
 try {
  await insertReverse(db,"legacy-before-financial");
  await db.exec(`reset role;
   create function auth.uid() returns uuid language sql as $$select '00000000-0000-0000-0000-000000000001'::uuid$$;
   grant usage on schema auth to authenticated;`);
  await db.exec(await migration("20261016191905_losses_dre_core.sql"));
  await db.exec(await migration("20261016191914_reverse_financial_competence.sql"));
  await db.exec("set role authenticated;select set_config('test.role','COMPRAS',false)");
  const legacy=(await db.query("select * from wms_reverse_logistics where id='legacy-before-financial'")).rows[0];
  assert.equal(legacy.financial_competence,null);assert.equal(legacy.competence_review_required,true);
  let row=await insertReverse(db,"retroactive","2026-09");
  assert.equal(row.financial_competence,"2026-09");assert.equal(row.competence_review_required,false);
  assert.equal(new Date(row.competence_month).toISOString().slice(0,10),"2026-09-01");
  await db.query("select wms_reverse_action('retroactive','REGISTRADA','ENVIADA','','retroactive-send')");
  const summary=async month=>(await db.query("select wms_reverse_summary($1,'A') result",[month+"-01"])).rows[0].result[0];
  assert.equal((await summary("2026-09")).completed_boxes,12);
  assert.equal((await summary("2026-10")).completed_boxes,0);
  assert.equal((await summary("2026-09")).competence_pending,1);
  row=(await db.query("select * from wms_reverse_logistics where id='retroactive'")).rows[0];
  const change=(expected=row.updated_at,reason="Competencia conferida com a nota")=>db.query("select wms_reverse_set_competence('retroactive','2026-08','2026-08-28',$1,$2) result",[reason,expected]);
  await assert.rejects(change(row.updated_at,""),/justificativa/);
  await db.exec("select set_config('test.role','OPERADOR',false)");
  await assert.rejects(change(),/autorizado/);
  await db.exec("select set_config('test.role','COMPRAS',false)");
  const corrected=(await change()).rows[0].result;
  assert.equal(corrected.financial_competence,"2026-08");assert.equal(corrected.status,"ENVIADA");
  await assert.rejects(change(),/outro usuario/);
  assert.equal((await summary("2026-08")).completed_boxes,12);
  assert.equal((await summary("2026-09")).completed_boxes,0);
  const event=(await db.query("select details from wms_history where id=$1",["reverse:retroactive:"+corrected.client_action_id])).rows[0];
  assert.equal(JSON.parse(event.details).previous_competence,"2026-09");
  await db.exec("reset role;insert into wms_loss_periods values('2026-08','FECHADA',now(),'actor');set role authenticated");
  await assert.rejects(db.query("select wms_reverse_set_competence('retroactive','2026-07','2026-07-28','Revisao fiscal',$1)",[corrected.updated_at]),/anterior fechada/);
  await assert.rejects(insertReverse(db,"closed-month","2026-08"),/fechada/);
 } finally {await db.close();}
});
