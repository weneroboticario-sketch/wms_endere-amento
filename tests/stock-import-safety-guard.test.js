import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('importar estoque seleciona snapshot completo por padrao',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const start=html.indexOf('id="stockImportModeInput"');
  const section=html.slice(start,html.indexOf('</select>',start));
  assert.ok(section.indexOf('value="CARGA_COMPLETA"')<section.indexOf('value="CARGA_PARCIAL"'));
  assert.match(section,/Snapshot atual/);
});

test('fallback da importacao usa CARGA_COMPLETA',async()=>{
  const source=await readFile(new URL('../script.js',import.meta.url),'utf8');
  assert.match(source,/\$\("stockImportModeInput"\)\.value : "CARGA_COMPLETA"/);
});

test('snapshot completo inativa posicoes ausentes da nova carga',async()=>{
  const source=await readFile(new URL('../script.js',import.meta.url),'utf8');
  const start=source.indexOf('async function saveStockImportBatch(');
  const imp=source.slice(start,start+22000);
  assert.match(imp,/importMode === "CARGA_COMPLETA" && !incomingKeys\[stockPositionOperationalKey\(sourceType, position, warehouseCode\)\]/);
  assert.doesNotMatch(imp,/IMPORTACAO BLOQUEADA PARA PROTEGER SALDOS/);
  assert.doesNotMatch(imp,/Math\.floor\(currentRows\.length \* 0\.20\)/);
});

test('carga parcial manual preserva posicoes simplesmente ausentes',async()=>{
  const source=await readFile(new URL('../script.js',import.meta.url),'utf8');
  assert.match(source,/importMode = importMode === "CARGA_PARCIAL" \? "CARGA_PARCIAL" : "CARGA_COMPLETA"/);
  assert.match(source,/duplicateActiveIds\[position\.id\] \|\| becameUnlocated \|\| \(importMode === "CARGA_COMPLETA"/);
});
