import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';
const migration=await readFile(new URL('../supabase/migrations/20261111123430_wms_sku_photo_lookup.sql',import.meta.url),'utf8');
async function fixture(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;grant usage on schema auth,private to authenticated;
 create function auth.uid() returns text language sql as $$select nullif(current_setting('test.actor',true),'')$$;
 create table wms_users(id text,role text,warehouse text,active boolean);insert into wms_users values('op','OPERADOR','VDCG',true),('cash','CAIXA','VDCG',true),('att','ATENDENTE','VDCG',true),('other','OPERADOR','VDAR',true),('inactive','OPERADOR','VDCG',false),('buyer','COMPRAS','VDCG',true);
 create function private.current_wms_profile_id() returns text language sql security definer set search_path='' as $$select id from public.wms_users where id=auth.uid() and active$$;
 create function private.current_wms_role() returns text language sql security definer set search_path='' as $$select role from public.wms_users where id=private.current_wms_profile_id()$$;
 create function private.can_access_warehouse(code text) returns boolean language sql security definer set search_path='' as $$select coalesce((select warehouse=$1 from public.wms_users where id=private.current_wms_profile_id()),false)$$;
 create table wms_products(sku text primary key,product_name text);insert into wms_products values('01314','Produto 01314'),('48060','Produto 48060');
 create table wms_inbound_receipts(id int,warehouse_code text,status text);insert into wms_inbound_receipts values(1,'VDCG','CONCLUIDO_CORRETO'),(2,'VDAR','CONCLUIDO_CORRETO'),(3,'VDCG','EM_CONFERENCIA'),(4,'VDCG','CANCELADO');
 create table wms_inbound_receipt_items(receipt_id int,internal_sku text,ean text,tributary_ean text,is_extra boolean);
 insert into wms_inbound_receipt_items values(1,'01314','4006381333931',null,false),(2,'48060','4006381333931',null,false),(3,'48060','036000291452',null,false),(4,'48060','5901234123457',null,false);
 create table stock_balance(sku text,qty int);insert into stock_balance values('01314',20);`);await db.exec(migration);await db.exec('set role authenticated');return db;}
const actor=(db,id)=>db.query("select set_config('test.actor',$1,false)",[id]);
async function lookup(db,code,kind='SKU',warehouse='VDCG'){return (await db.query('select lookup_wms_sku_photo($1,$2,$3) r',[warehouse,code,kind])).rows[0].r;}
test('photo lookup respects roles and warehouse, maps only confirmed EAN links, preserves zeroes and never mutates stock',async()=>{
 const db=await fixture();try{for(const id of ['op','cash','att']){await actor(db,id);assert.equal((await lookup(db,'1314'))[0].sku,'01314');assert.equal((await lookup(db,'4006381333931','GTIN'))[0].sku,'01314');assert.deepEqual(await lookup(db,'4006381333932','GTIN'),[]);assert.deepEqual(await lookup(db,'036000291452','GTIN'),[]);assert.deepEqual(await lookup(db,'5901234123457','GTIN'),[]);assert.deepEqual(await lookup(db,'99999'),[]);await assert.rejects(lookup(db,'01314','SKU','VDAR'),/autorizada/);}
  await actor(db,'other');assert.equal((await lookup(db,'4006381333931','GTIN','VDAR'))[0].sku,'48060');await assert.rejects(lookup(db,'4006381333931','GTIN'),/autorizada/);
  for(const id of ['inactive','buyer','']){await actor(db,id);await assert.rejects(lookup(db,'01314'),/autorizada/);}
  await db.exec('reset role');assert.equal((await db.query('select qty from stock_balance')).rows[0].qty,20);assert.equal((await db.query('select count(*)::int n from wms_inbound_receipt_items')).rows[0].n,4);
  await db.exec('set role anon');await assert.rejects(lookup(db,'01314'),/permission denied/);
 }finally{await db.close();}
});
