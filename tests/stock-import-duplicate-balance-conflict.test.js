import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../script.js',import.meta.url),'utf8');

function loadDedupe(){
  const ctx=vm.createContext({
    normalizeSku:v=>String(v||'').trim(),
    activeWarehouseCode:()=> 'VDCG',
    stockPositionOperationalKey:(_source,row)=>JSON.stringify(['VDCG','CAPTACAO',String(row.codigoMaterial||''),String(row.codigoEndereco||'')]),
    Number
  });
  const body=source.match(new RegExp('  function dedupeStockRows\\([^]*?\\n  }'))?.[0];
  assert.ok(body,'dedupeStockRows');
  vm.runInContext(body,ctx);
  return ctx;
}

test('duplicata exata do mesmo SKU/endereco permanece uma unica linha',()=>{
  const ctx=loadDedupe(),errors=[];
  const rows=[
    {codigoMaterial:'87020',codigoEndereco:'R03-RK06-L03-E',totalFisico:1,totalAlocado:0,totalDisponivel:1},
    {codigoMaterial:'87020',codigoEndereco:'R03-RK06-L03-E',totalFisico:1,totalAlocado:0,totalDisponivel:1}
  ];
  const out=ctx.dedupeStockRows('CAPTACAO',rows,errors);
  assert.equal(out.length,1);
  assert.equal(errors.length,0);
  assert.equal(out[0].totalDisponivel,1);
});

test('duplicata conflitante nunca deixa a ultima linha zerar silenciosamente o saldo',()=>{
  const ctx=loadDedupe(),errors=[];
  const rows=[
    {codigoMaterial:'87020',codigoEndereco:'R03-RK06-L03-E',totalFisico:1,totalAlocado:0,totalDisponivel:1},
    {codigoMaterial:'87020',codigoEndereco:'R03-RK06-L03-E',totalFisico:0,totalAlocado:0,totalDisponivel:0}
  ];
  const out=ctx.dedupeStockRows('CAPTACAO',rows,errors);
  assert.equal(out.length,1);
  assert.equal(out[0].totalDisponivel,1);
  assert.equal(errors.length,1);
  assert.match(errors[0],/SKU 87020/);
  assert.match(errors[0],/R03-RK06-L03-E/);
});

test('importacao e interrompida antes de gravar quando parser encontra conflito',()=>{
  const parse=source.indexOf('var parsed = parseStockWorkbook(entry.workbook, sourceType);');
  const errorGuard=source.indexOf('if (parsed.errors.length)',parse);
  const save=source.indexOf('saveStockImportBatch(sourceType, file.name, parsed, importMode)',parse);
  assert.ok(parse>=0 && errorGuard>parse && save>errorGuard);
  assert.match(source,/Importacao bloqueada: a planilha possui/);
});
