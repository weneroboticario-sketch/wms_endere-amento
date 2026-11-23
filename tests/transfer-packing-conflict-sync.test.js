import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('conflito de revisao busca item no estoque atual sem criar uma nova acao',async()=>{
 const code=await readFile(new URL('../src/transfer-packing-view.js',import.meta.url),'utf8');
 assert.match(code,/syncItemAfterConflict\(t,item\)/);
 assert.match(code,/from\('wms_transfer_items'\)\.select\('\*'\)/);
 assert.match(code,/\.eq\('transfer_id',t\.id\)\.eq\('warehouse_code',warehouse\(\)\)/);
 assert.match(code,/accept\(\{item:result\.data\}\)/);
 assert.match(code,/error\.code==='40001'\|\|error\.cause\?\.code==='40001'/);
 assert.match(code,/if\(!synchronized\)render\(t,item\)/);
});
