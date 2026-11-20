import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const migration=await readFile(new URL('../supabase/migrations/20261120193000_wms_transfer_barcode_validation.sql',import.meta.url),'utf8');
test('packing RPC uses mapped EAN while preserving its atomic revision and idempotency checks',()=>{
 assert.match(migration,/private\.wms_transfer_scan_matches\(p_warehouse,raw_code,i\.sku\)/);
 assert.match(migration,/p_action_id/);
 assert.match(migration,/p_expected_revision/);
 assert.match(migration,/LEITURA_UNITARIA/);
 assert.match(migration,/LEITURA_SKU/);
 assert.match(migration,/SECURITY DEFINER/);
});
test('database handles SKU and unique EAN, rejects foreign, invalid and ambiguous codes',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role authenticated;create role anon;create schema private;
  create function private.wms_valid_gtin(code text) returns boolean language sql stable as $$select code='7891033896783'$$;
  create function private.lookup_wms_sku_photo(w text,code text,kind text) returns jsonb language sql stable as
   $$select case when w='VDCG' and code='7891033896783' then '[{"sku":"89678"}]'::jsonb
     when w='AMBIGUOUS' then '[{"sku":"89678"},{"sku":"12345"}]'::jsonb else '[]'::jsonb end$$;`);
  const helper=migration.slice(0,migration.indexOf('-- Preserve the existing idempotent'));
  await db.exec(helper);
  const query='select private.wms_transfer_scan_matches($1,$2,$3) as accepted';
  const check=async(w,code,sku)=>(await db.query(query,[w,code,sku])).rows[0].accepted;
  assert.equal(await check('VDCG','89678','89678'),true);
  assert.equal(await check('VDCG','01314','1314'),true);
  assert.equal(await check('VDCG','7891033896783','89678'),true);
  assert.equal(await check('VDAR','7891033896783','89678'),false);
  assert.equal(await check('AMBIGUOUS','7891033896783','89678'),false);
  assert.equal(await check('VDCG','7891033896783','11111'),false);
  assert.equal(await check('VDCG','7891033896784','89678'),false);
 }finally{await db.close();}
});
