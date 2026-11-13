import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseBarcodeLinksCsv} from '../src/sku-barcode-links.js';

test('EAN;SKU CSV preserves leading zeroes, rejects invalid rows and duplicate canonical GTIN',()=>{
  const csv='\uFEFFEAN;SKU\r\n4006381333931;01314\r\n4006381333931;48060\r\n4006381333932;48060\r\n5901234123457;48060\r\n';
  const {rows,errors}=parseBarcodeLinksCsv(csv);
  assert.deepEqual(rows.map(row=>[row.ean,row.sku]),[['4006381333931','01314'],['5901234123457','48060']]);
  assert.equal(errors.length,2);
  assert.deepEqual(errors.map(item=>item.line),[3,4]);
});

test('CSV accepts comma delimiter and quoted SKU; rejects too many rows',()=>{
  const result=parseBarcodeLinksCsv('EAN,SKU\n"4006381333931","01314"');
  assert.equal(result.rows[0].sku,'01314');
  assert.throws(()=>parseBarcodeLinksCsv('EAN;SKU\n'+Array(201).fill('4006381333931;01314').join('\n'),{maxRows:200}),/Limite/);
});

test('SKU scanning remains live; only admin registration and CSV file controls are new',async()=>{
  const [ui,importer,migration]=await Promise.all([
    readFile(new URL('../src/sku-photo-lookup.js',import.meta.url),'utf8'),
    readFile(new URL('../src/sku-barcode-import-ui.js',import.meta.url),'utf8'),
    readFile(new URL('../supabase/migrations/20261111154000_wms_persistent_barcode_registry.sql',import.meta.url),'utf8')
  ]);
  assert.match(ui,/getUserMedia/);
  assert.match(ui,/register_wms_sku_barcode/);
  assert.match(ui,/const canLink=.*ADMINISTRADOR.*SUPERVISOR.*OPERADOR.*ATENDENTE.*CAIXA/);
  assert.match(ui,/const canBulkImport=.*ADMINISTRADOR.*SUPERVISOR/);
  assert.match(ui,/data-link-ean/);
  assert.doesNotMatch(ui,/data-gallery|data-capture|Fotografar etiqueta/);
  assert.match(importer,/parseBarcodeLinksCsv/);
  assert.match(migration,/enable row level security/i);
  assert.match(migration,/private\.can_access_warehouse/);
  assert.match(migration,/on conflict \(warehouse_code,ean_key\) do nothing/);
});
