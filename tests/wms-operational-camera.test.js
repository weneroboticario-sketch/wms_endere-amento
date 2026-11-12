import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pickOperationalBarcode,resolveOperationalSku} from '../src/wms-operational-camera.js';

const normalizeLocation=value=>/^R\d{2}-RK\d{2}-L\d{2}-[A-Z]$/.test(value)
  ?{valid:true,code:value}:{valid:false};

test('address camera requires exact shelf labels, never product EAN',()=>{
  assert.deepEqual(pickOperationalBarcode({barcodes:['R03-RK04-L01-D']},'address',normalizeLocation),
    {code:'R03-RK04-L01-D',kind:'ADDRESS'});
  assert.equal(pickOperationalBarcode({barcodes:['7891033896783']},'address',normalizeLocation),null);
  assert.equal(pickOperationalBarcode({barcodes:['R03-RK04-L01-D','R03-RK04-L01-C']},'address',normalizeLocation),null);
});

test('SKU camera accepts validated EAN or internal SKU preserving zero',()=>{
  assert.deepEqual(pickOperationalBarcode({candidates:[{kind:'GTIN',code:'7891033896783'}],barcodes:['7891033896783']},'sku'),
    {code:'7891033896783',kind:'GTIN'});
  assert.deepEqual(pickOperationalBarcode({candidates:[{kind:'SKU',code:'01314'}],barcodes:['01314']},'sku'),
    {code:'01314',kind:'SKU'});
  assert.equal(pickOperationalBarcode({barcodes:['R03-RK04-L01-D'],candidates:[]},'sku'),null);
  assert.equal(pickOperationalBarcode({barcodes:['123'],candidates:[]},'sku'),null);
  assert.equal(pickOperationalBarcode({barcodes:['7891033896782'],candidates:[{kind:'INVALID',code:'7891033896782'}]},'sku'),null);
  assert.equal(pickOperationalBarcode({candidates:[{kind:'GTIN',code:'7891033896783'},{kind:'GTIN',code:'5901234123457'}]},'sku'),null);
});

test('raw XML scanner preserves supplier EAN without converting or incrementing',()=>{
  assert.deepEqual(pickOperationalBarcode({barcodes:['7891033896783']},'raw'),
    {code:'7891033896783',kind:'RAW'});
  assert.deepEqual(pickOperationalBarcode({barcodes:['AB-09876']},'raw'),
    {code:'AB-09876',kind:'RAW'});
  assert.equal(pickOperationalBarcode({barcodes:['ABC\nDEF']},'raw'),null);
});

test('an authenticated single-SKU lookup is required before putting EAN in SKU-only fields',async()=>{
  assert.equal(await resolveOperationalSku({kind:'SKU',code:'01314'},async()=>{throw Error('unneeded')}),'01314');
  assert.equal(await resolveOperationalSku({kind:'GTIN',code:'7891033896783'},async()=>[{sku:'89678'}]),'89678');
  assert.equal(await resolveOperationalSku({kind:'GTIN',code:'5901234123457'},async()=>[{sku:'01314'}]),'01314');
  await assert.rejects(resolveOperationalSku({kind:'GTIN',code:'7891033896783'},async()=>[]),/sem SKU correspondente/);
  await assert.rejects(resolveOperationalSku({kind:'GTIN',code:'7891033896783'},async()=>[{sku:'89678'},{sku:'01314'}]),/mais de um SKU/);
  await assert.rejects(resolveOperationalSku({kind:'GTIN',code:'7891033896783'},async()=>[{sku:'7891033896783'}]),/mais de um SKU/);
});

test('all operational scan fields have camera triggers without automatic stock writes',async()=>{
  const [html,script,inboundView,inbound,caixa,scanner]=await Promise.all([
    readFile(new URL('../index.html',import.meta.url),'utf8'),
    readFile(new URL('../script.js',import.meta.url),'utf8'),
    readFile(new URL('../src/inbound-receipts-view.js',import.meta.url),'utf8'),
    readFile(new URL('../src/inbound-receipts.js',import.meta.url),'utf8'),
    readFile(new URL('../src/caixa-request-composer.js',import.meta.url),'utf8'),
    readFile(new URL('../src/wms-operational-camera.js',import.meta.url),'utf8')
  ]);
  for(const id of ['addressingSkuCameraButton','addressingLocationCameraButton','dashboardSkuCameraButton',
    'replenishmentSkuCameraButton','transferSkuCameraButton']){
    assert.match(html,new RegExp('id="'+id+'"'));
    assert.match(script,new RegExp('bindOperationalCameraButton\\("'+id+'"'));
  }
  for(const action of ['mode: "sku"','mode: "address"'])assert.match(script,new RegExp(action));
  assert.match(script,/if \(\$\("addressingLocationCameraButton"\)\) \$\("addressingLocationCameraButton"\).disabled = !enabled/);
  assert.match(script,/confirme o endereçamento/);
  assert.match(script,/Confirme a leitura no fluxo da transferência/);
  assert.match(inboundView,/data-camera="scan"/);
  assert.match(inboundView,/data-camera="map"/);
  assert.match(inbound,/data-camera="extra"/);
  assert.match(inbound,/scanMode === "ADD"/);
  assert.match(inbound,/Use Registrar \+1 para confirmar/);
  assert.match(caixa,/cameraButton.addEventListener\("click"/);
  assert.match(caixa,/await lookupNow\(\); \/\/ Does not send a Caixa request/);
  assert.doesNotMatch(scanner,/submit_wms_caixa_request|allocateSkuToLocation|act_wms_inbound|LEITURA_UNITARIA|createReplenishmentRequest/);
  assert.match(scanner,/dialog.showModal\(\)/);
  assert.match(scanner,/getUserMedia/);
});

test('scanner base preserves original single-click SKU and shelf recognition',async()=>{
  const [sku,shelf]=await Promise.all([
    readFile(new URL('../src/sku-photo-lookup.js',import.meta.url),'utf8'),
    readFile(new URL('../src/shelf-barcode-scanner.js',import.meta.url),'utf8')
  ]);
  assert.match(sku,/void startCamera\(\)/);
  assert.match(shelf,/result\.barcodes/);
  assert.match(shelf,/void startCamera\(\)/);
});
