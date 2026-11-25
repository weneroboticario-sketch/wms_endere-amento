import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('finish packing checks pending acknowledgement and explains fiscal stage',async()=>{
 const src=await readFile(new URL('../script.js',import.meta.url),'utf8');
 const start=src.indexOf('async function finishPacking()');
 assert.ok(start>=0);
 const body=src.slice(start,src.indexOf('async function rebuildConferenceAfterAdminChange(',start));
 assert.match(body,/packingController\(\)\.pending\(\)/);
 assert.match(body,/Tentar novamente a operação/);
 assert.match(body,/etapa de nota fiscal/);
 assert.ok(body.indexOf('packingController().pending()')<body.indexOf('readFinalBoxCountInput()'));
});
test('packing API retains request id and shows 504 recovery guidance',async()=>{
 const view=await readFile(new URL('../src/transfer-packing-view.js',import.meta.url),'utf8');
 const api=await readFile(new URL('../src/transfer-packing-api.js',import.meta.url),'utf8');
 assert.match(view,/pending:pendingSafe/);
 assert.match(view,/NÃO digite a quantidade novamente/);
 assert.match(api,/return send\(request\)/);
 assert.match(api,/storage\.setItem\(key\(\),JSON\.stringify\(request\)\)/);
});
