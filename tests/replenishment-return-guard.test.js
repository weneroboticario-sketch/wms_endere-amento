import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

const source=await readFile(new URL("../script.js",import.meta.url),"utf8");
const sql=await readFile(new URL("../supabase/migrations/20261120173000_wms_replenishment_return_guard.sql",import.meta.url),"utf8");

test("return to queue resets 72 picked units to zero; later overage cannot be recorded",async()=>{
 const db=new PGlite();
 try {
  await db.exec("create schema private; create table public.wms_replenishment_requests(id text primary key,status text,quantidade_solicitada numeric,quantidade_atendida numeric,quantidade_pendente numeric,last_attended_by_id text,last_attended_by_name text,no_stock_by_id text,no_stock_by_name text);");
  // Simulate a legacy row created before the safety trigger is installed.
  await db.exec("insert into public.wms_replenishment_requests values('rep','SEPARADO',50,72,0,'op','Operador','','');");
  await db.exec(sql);
  await assert.rejects(db.exec("insert into public.wms_replenishment_requests values('invalid','SEPARADO',50,70,0,'op','Operador','','');"),/Quantidade atendida acima/);
  await db.exec("update public.wms_replenishment_requests set status='PENDENTE' where id='rep';");
  const row=(await db.query("select quantidade_atendida,quantidade_pendente,last_attended_by_id from public.wms_replenishment_requests where id='rep'")).rows[0];
  assert.equal(Number(row.quantidade_atendida),0);
  assert.equal(Number(row.quantidade_pendente),50);
  assert.equal(row.last_attended_by_id,'');
  await assert.rejects(db.exec("update public.wms_replenishment_requests set status='SEPARADO',quantidade_atendida=70,quantidade_pendente=0 where id='rep';"),/Quantidade atendida acima/);
  await db.exec("update public.wms_replenishment_requests set status='SEPARADO',quantidade_atendida=50,quantidade_pendente=0 where id='rep';");
  assert.equal(Number((await db.query("select quantidade_atendida from public.wms_replenishment_requests where id='rep'")).rows[0].quantidade_atendida),50);
 } finally {await db.close();}
});

test("return UI resets progress, confirms physical recheck and preserves the prior audit",()=>{
 const ret=source.slice(source.indexOf("  async function returnReplenishmentRequestToQueue("),source.indexOf("  async function startReplenishmentRequest("));
 assert.match(ret,/attendedQty: 0/);
 assert.match(ret,/pendingQty: Number\(request.requestedQty/);
 assert.match(ret,/__expectedStatus: request.status/);
 assert.match(ret,/__expectedAttended: Number\(request.attendedQty/);
 assert.match(source,/O histórico será preservado/);
 assert.doesNotMatch(source,/Pode superar a solicitada/);
});

test("stale quantity updates are rejected rather than overwriting another tab",()=>{
 const code=source.slice(source.indexOf("  async function updateReplenishmentRow("),source.indexOf("  async function requestReplenishmentCancellation("));
 assert.match(code,/eq\("quantidade_atendida", patch.__expectedAttended\)/);
 assert.match(code,/Pedido alterado por outra sessão/);
});
