import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('importar estoque seleciona CARGA_PARCIAL por padrao',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const section=html.slice(html.indexOf('id="stockImportModeInput"'),html.indexOf('</select>',html.indexOf('id="stockImportModeInput"')));
 assert.ok(section.indexOf('value="CARGA_PARCIAL"')<section.indexOf('value="CARGA_COMPLETA"'));
});
test('importacao completa bloqueia perdas anormais antes de qualquer upsert',async()=>{
 const source=await readFile(new URL('../script.js',import.meta.url),'utf8');
 const start=source.indexOf('async function saveStockImportBatch(');
 const imp=source.slice(start,start+18000);
 const guard=imp.indexOf('IMPORTACAO BLOQUEADA PARA PROTEGER SALDOS');
 const write=imp.indexOf('await upsertStockImportPositions(');
 const deleteRows=imp.indexOf('await updateStockRowsByIds(');
 assert.ok(guard>0 && write>guard && deleteRows>guard);
 assert.match(imp,/importMode === "CARGA_COMPLETA" && currentRows.length >= 1000/);
 assert.match(imp,/previewRemovals\.length > removalLimit/);
 assert.match(imp,/Math\.floor\(currentRows\.length \* 0\.20\)/);
 assert.match(imp,/!incomingKeys\[operationalKey\]/);
 assert.match(imp,/Selecione Carga parcial/);
});
test('modo parcial nao desativa posicoes simplesmente ausentes da nova carga',async()=>{
 const source=await readFile(new URL('../script.js',import.meta.url),'utf8');
 assert.match(source,/importMode === "CARGA_COMPLETA" && !incomingKeys\[stockPositionOperationalKey\(sourceType, position, warehouseCode\)\]/);
 assert.match(source,/\$\("stockImportModeInput"\)\.value : "CARGA_PARCIAL"/);
});
