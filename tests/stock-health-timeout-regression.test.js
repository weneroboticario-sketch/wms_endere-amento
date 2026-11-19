import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isCancelledRequest } from '../src/request-health.js';

test('Supabase statement timeout is not retried as a transient network failure',()=>{
 assert.equal(isCancelledRequest({code:'57014',message:'canceling statement due to statement timeout'}),true);
 assert.equal(isCancelledRequest({message:'statement timeout'}),true);
});

test('system health scopes stock reads before ordering the large stock table',async()=>{
 const source=await readFile(new URL('../script.js',import.meta.url),'utf8');
 assert.match(source,/readHealthRows\("wms_stock_positions"[\s\S]*?\{ warehouseCodes: selectedCodes, active: true, archived: false \}\)/);
 assert.match(source,/activeStockRowsResult[\s\S]*?active: true, archived: false/);
 assert.match(source,/inactiveStockRowsResult[\s\S]*?active: false, archived: false/);
});

test('missing remote product packaging table is not queried by the client',async()=>{
 const source=await readFile(new URL('../script.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/fetchAllRows\("wms_product_packaging"/);
 assert.doesNotMatch(source,/\.from\("wms_product_packaging"\)\.upsert/);
 assert.match(source,/Patterns stay in the scoped local transfer cache|Keep learned patterns in the scoped local transfer cache/);
});
