import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('product catalog uses one compact RPC with paginated fallback',async()=>{
  const source=await readFile(new URL('../script.js',import.meta.url),'utf8');
  assert.match(source,/supabaseDb\.rpc\("wms_product_catalog"\)/);
  assert.match(source,/fetchAllRows\("wms_products", "sku", true, \{ select: "sku,product_name", pageSize: 1000 \}\)/);
});

test('product reference cache is global across warehouses and kept for thirty minutes',async()=>{
  const source=await readFile(new URL('../script.js',import.meta.url),'utf8');
  assert.match(source,/createReferenceCache\(\{ ttlMs: 30 \* 60 \* 1000/);
  assert.match(source,/\(authState\.currentUser \|\| \{\}\)\.role, "products"/);
  assert.match(source,/if \(!keepUsers\) productReferenceCache\.clear\(\)/);
  assert.doesNotMatch(source,/async function invalidateWarehouseModuleCaches\(warehouseCode\) \{\s*productReferenceCache\.clear\(\)/);
});

test('catalog rpc migration is authenticated-only and security invoker',async()=>{
  const sql=await readFile(new URL('../supabase/migrations/20261119174455_wms_product_catalog_rpc_20261119.sql',import.meta.url),'utf8');
  assert.match(sql,/security invoker/i);
  assert.match(sql,/revoke all on function public\.wms_product_catalog\(\) from public, anon, authenticated/i);
  assert.match(sql,/grant execute on function public\.wms_product_catalog\(\) to authenticated/i);
});
