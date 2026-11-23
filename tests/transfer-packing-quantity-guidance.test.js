import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('manual packing explains additional quantity and previews resulting total',async()=>{
 const source=await readFile(new URL('../src/transfer-packing-view.js',import.meta.url),'utf8');
 assert.match(source,/Quantidade ADICIONAL \(não total\)/);
 assert.match(source,/const remaining=Math\.max\(0,target-current\)/);
 assert.match(source,/current\+requested/);
 assert.match(source,/el\('transferQuantityInput'\)\.addEventListener\('input',\(\)=>updateQuantityGuidance\(\)\)/);
});
test('packing requires explicit confirmation when added units exceed separated units',async()=>{
 const source=await readFile(new URL('../src/transfer-packing-view.js',import.meta.url),'utf8');
 assert.match(source,/action\.operation==='QUANTIDADE_MANUAL'&&item&&!pendingSafe\(\)/);
 assert.match(source,/current\+additional>separated/);
 assert.match(source,/Confirma excedente físico/);
 assert.match(source,/if\(!accepted\)\{status\('Quantidade não registrada/);
 assert.match(source,/gateway\.perform\(/);
});
