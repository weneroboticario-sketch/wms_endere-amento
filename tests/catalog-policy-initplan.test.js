import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
test('catalog policy keeps identical authorization and evaluates its row-independent helper once',async t=>{
  const db=new PGlite();try{
    await db.exec(`create role authenticated;create schema private;grant usage on schema private to authenticated;
      create function private.current_wms_is_global_admin() returns boolean language plpgsql security definer as $$begin perform set_config('test.calls',(coalesce(nullif(current_setting('test.calls',true),''),'0')::int+1)::text,false);return current_setting('test.global',true)='true';end$$;
      create table wms_products(sku text primary key);insert into wms_products select generate_series(1,2000)::text;
      alter table wms_products enable row level security;grant select,insert on wms_products to authenticated;
      create policy wms_products_admin_write on wms_products for all to authenticated using(private.current_wms_is_global_admin()) with check(private.current_wms_is_global_admin());
      set test.global='true';set test.calls='0';set role authenticated;`);
    const before=(await db.query('select count(*)::int n from wms_products')).rows[0].n;await db.exec('reset role');const beforeCalls=Number((await db.query("select current_setting('test.calls') n")).rows[0].n);
    const sql=await readFile(new URL('../supabase/proposals/wms_catalog_policy_initplan.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
    await db.exec("set test.calls='0';set role authenticated");assert.equal((await db.query('select count(*)::int n from wms_products')).rows[0].n,before);await db.exec('reset role');
    const afterCalls=Number((await db.query("select current_setting('test.calls') n")).rows[0].n);assert.ok(beforeCalls>=2000);assert.equal(afterCalls,1);t.diagnostic(`2.000 linhas sintéticas: chamadas do helper ${beforeCalls} -> ${afterCalls}`);
    await db.exec("set test.global='false';set role authenticated");assert.equal((await db.query('select count(*)::int n from wms_products')).rows[0].n,0);await assert.rejects(db.exec("insert into wms_products values('denied')"),/row-level security/);
  }finally{await db.close();}
});
