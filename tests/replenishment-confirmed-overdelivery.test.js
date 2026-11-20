import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

const migration=await readFile(new URL('../supabase/migrations/20261120180000_wms_replenishment_confirmed_overdelivery.sql',import.meta.url),'utf8');

test('approval is mandatory, attributed to operator, and automatically invalidated on return to queue',async()=>{
 const db=new PGlite();
 try{
  await db.exec("create schema private; create table public.wms_replenishment_requests(id text primary key,status text,quantidade_solicitada numeric,quantidade_atendida numeric,quantidade_pendente numeric,last_attended_by_id text,last_attended_by_name text,no_stock_by_id text,no_stock_by_name text);");
  await db.exec("create function private.current_wms_profile_id() returns text language sql as $$select 'op'::text$$; create function private.has_wms_role(text[]) returns boolean language sql as $$select true$$;");
  const guard=migration.slice(0,migration.indexOf('-- The original trigger'));
  await db.exec(guard);
  await db.exec("create trigger trg_wms_replenishment_progress_guard before insert or update on public.wms_replenishment_requests for each row execute function private.guard_wms_replenishment_progress();");
  await db.exec("insert into wms_replenishment_requests(id,status,quantidade_solicitada,quantidade_atendida,quantidade_pendente) values('r','EM_SEPARACAO',50,0,50);");
  await assert.rejects(db.exec("update wms_replenishment_requests set quantidade_atendida=70,quantidade_pendente=0,status='SEPARADO' where id='r';"),/Excedente sem confirmação/);
  await db.exec("update wms_replenishment_requests set quantidade_atendida=70,quantidade_pendente=0,status='SEPARADO',overdelivery_confirmed_qty=70,overdelivery_reason='Conferido no fisico' where id='r';");
  let a=(await db.query("select quantidade_solicitada,quantidade_atendida,overdelivery_confirmed_qty,overdelivery_confirmed_by_id,overdelivery_confirmed_at from wms_replenishment_requests where id='r'")).rows[0];
  assert.equal(Number(a.quantidade_solicitada),50);
  assert.equal(Number(a.quantidade_atendida),70);
  assert.equal(a.overdelivery_confirmed_by_id,'op');
  assert.ok(a.overdelivery_confirmed_at);
  await db.exec("update wms_replenishment_requests set status='PENDENTE' where id='r';");
  a=(await db.query("select quantidade_atendida,quantidade_pendente,overdelivery_confirmed_qty,overdelivery_confirmed_by_id from wms_replenishment_requests where id='r'")).rows[0];
  assert.deepEqual([Number(a.quantidade_atendida),Number(a.quantidade_pendente),Number(a.overdelivery_confirmed_qty),a.overdelivery_confirmed_by_id],[0,50,0,'']);
  await assert.rejects(db.exec("update wms_replenishment_requests set quantidade_atendida=70,status='SEPARADO' where id='r';"),/Excedente sem confirmação/);
 }finally{await db.close();}
});

test('stock transfer still requires authorized excess and enough available stock, without altering requested quantity',()=>{
 assert.match(migration,/v_qty > coalesce\(new.overdelivery_confirmed_qty,0\)/);
 assert.match(migration,/v_remaining > 0/);
 assert.match(migration,/CAPTAÇÃO sem saldo suficiente/);
 assert.match(migration,/new.loja_credito_quantidade := v_qty/);
 assert.match(migration,/new.captacao_debito_quantidade := v_qty/);
});
