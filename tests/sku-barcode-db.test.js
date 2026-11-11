import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';

const oldSql=await readFile(new URL('../supabase/migrations/20261111123430_wms_sku_photo_lookup.sql',import.meta.url),'utf8');
const newSql=await readFile(new URL('../supabase/migrations/20261111154000_wms_persistent_barcode_registry.sql',import.meta.url),'utf8');

async function setup(){
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;
    create schema auth;create schema private;
    grant usage on schema auth,private to authenticated;
    create function auth.uid() returns text language sql as $$select nullif(current_setting('test.actor',true),'')$$;
    create table wms_users(id text,role text,warehouse text,active boolean);
    insert into wms_users values
      ('admin','ADMINISTRADOR','VDCG',true),
      ('super','SUPERVISOR','VDCG',true),
      ('op','OPERADOR','VDCG',true),
      ('cash','CAIXA','VDCG',true),
      ('other','ADMINISTRADOR','VDAR',true),
      ('disabled','ADMINISTRADOR','VDCG',false);
    create function private.current_wms_profile_id() returns text language sql security definer set search_path='' as
      $$select id from public.wms_users where id=auth.uid() and active$$;
    create function private.current_wms_role() returns text language sql security definer set search_path='' as
      $$select role from public.wms_users where id=private.current_wms_profile_id()$$;
    create function private.can_access_warehouse(code text) returns boolean language sql security definer set search_path='' as
      $$select coalesce((select warehouse=$1 from public.wms_users where id=private.current_wms_profile_id()),false)$$;
    create table wms_products(sku text primary key,product_name text);
    insert into wms_products values('01314','Produto com SKU inicial zero'),('48060','Outro produto');
    create table wms_inbound_receipts(id integer primary key,warehouse_code text,status text);
    create table wms_inbound_receipt_items(receipt_id int,internal_sku text,ean text,tributary_ean text,is_extra boolean);
    insert into wms_inbound_receipts values(1,'VDCG','CONCLUIDO_CORRETO');
    insert into wms_inbound_receipt_items values(1,'01314','036000291452',null,false);
    create table stock_balance(sku text primary key,qty int);
    insert into stock_balance values('01314',20);
  `);
  await db.exec(oldSql);
  await db.exec(newSql);
  await db.exec('set role authenticated');
  return db;
}
const actor=(db,id)=>db.query('select set_config($1,$2,false)',['test.actor',id]);
async function lookup(db,ean,warehouse='VDCG'){
  return (await db.query('select public.lookup_wms_sku_photo($1,$2,$3) as r',[warehouse,ean,'GTIN'])).rows[0].r;
}
async function register(db,ean,sku='01314',warehouse='VDCG',source='MANUAL'){
  return (await db.query('select public.register_wms_sku_barcode($1,$2,$3,$4) as r',[warehouse,ean,sku,source])).rows[0].r;
}
test('registered GTIN resolves to existing SKU while preserving zeros, without changing stock',async()=>{
  const db=await setup();
  try{
    await actor(db,'admin');
    assert.deepEqual(await lookup(db,'4006381333931'),[]);
    assert.equal((await register(db,'4006381333931')).sku,'01314');
    assert.equal((await register(db,'4006381333931')).sku,'01314');
    assert.equal((await lookup(db,'4006381333931'))[0].sku,'01314');
    assert.equal((await lookup(db,'036000291452'))[0].sku,'01314');
    await assert.rejects(register(db,'4006381333931','48060'),/Conflito/);
    await assert.rejects(register(db,'4006381333932'),/inválido/);
    await assert.rejects(register(db,'5901234123457','99999'),/inexistente/);
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::integer as n from public.wms_sku_barcodes')).rows[0].n,1);
    assert.equal((await db.query('select qty from public.stock_balance')).rows[0].qty,20);
  }finally{await db.close();}
});

test('operator can consult but cannot create, and warehouse boundaries are enforced',async()=>{
  const db=await setup();
  try{
    await actor(db,'admin');
    await register(db,'4006381333931');
    await actor(db,'op');
    assert.equal((await lookup(db,'4006381333931'))[0].sku,'01314');
    await assert.rejects(register(db,'5901234123457'),/não autorizado/);
    await assert.rejects(lookup(db,'4006381333931','VDAR'),/autorizada/);
    await actor(db,'other');
    assert.deepEqual(await lookup(db,'4006381333931','VDAR'),[]);
    await register(db,'4006381333931','48060','VDAR');
    assert.equal((await lookup(db,'4006381333931','VDAR'))[0].sku,'48060');
    await actor(db,'disabled');
    await assert.rejects(register(db,'5901234123457'),/não autorizado/);
    await db.exec('reset role');
    await db.exec('set role anon');
    await assert.rejects(register(db,'5901234123457'),/permission denied/);
  }finally{await db.close();}
});
