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

test('snapshot completo zera ausentes mantendo o registro ativo',async()=>{
  const source=await readFile(new URL('../script.js',import.meta.url),'utf8');
  const start=source.indexOf('async function saveStockImportBatch(');
  const imp=source.slice(start,start+26000);
  assert.match(imp,/var snapshotZeroPositions = currentRows\.filter/);
  assert.match(imp,/if \(importMode !== "CARGA_COMPLETA"\) return false/);
  assert.match(imp,/totalFisico: 0/);
  assert.match(imp,/totalAlocado: 0/);
  assert.match(imp,/totalDisponivel: 0/);
  assert.match(imp,/active: true/);
  assert.match(imp,/sem inativar/);
  assert.doesNotMatch(imp,/IMPORTACAO BLOQUEADA PARA PROTEGER SALDOS/);
});

test('carga parcial manual preserva posicoes simplesmente ausentes',async()=>{
  const source=await readFile(new URL('../script.js',import.meta.url),'utf8');
  assert.match(source,/importMode = importMode === "CARGA_PARCIAL" \? "CARGA_PARCIAL" : "CARGA_COMPLETA"/);
  assert.match(source,/if \(importMode !== "CARGA_COMPLETA"\) return false/);
});

test('active false fica restrito a limpeza estrutural, nao a ausencia de snapshot',async()=>{
  const source=await readFile(new URL('../script.js',import.meta.url),'utf8');
  const start=source.indexOf('var deactivatedPositions = currentRows.filter');
  const block=source.slice(start,start+1800);
  assert.match(block,/return duplicateActiveIds\[position\.id\] \|\| becameUnlocated/);
  assert.doesNotMatch(block,/!incomingKeys/);
});
