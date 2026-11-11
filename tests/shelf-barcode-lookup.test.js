import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSkuLiveBarcodeScanner} from '../src/sku-live-barcode.js';
import {uniqueShelfProducts,shelfAvailableBySku,formatShelfQuantity} from '../src/shelf-location-lookup.js';

const frame={width:2,height:2,getContext:()=>({getImageData:()=>({data:new Uint8ClampedArray(16)})})};

test('CODE128 alphanumeric shelf label survives decoding without becoming a product SKU',async()=>{
  let scans=0;
  const scanner=createSkuLiveBarcodeScanner({NativeDetector:null,makeWorker:()=>({
    postMessage(){scans++;this.onmessage({data:{results:[{code:'R03-RK04-L01-D',format:'CODE_128'}]}});},
    terminate(){}
  })});
  try{
    const result=await scanner.scan(frame);
    assert.deepEqual(result.barcodes,['R03-RK04-L01-D']);
    assert.deepEqual(result.candidates,[]);
    assert.equal(scans,1);
  }finally{scanner.close();}
});

test('native CODE128 scans return shelf address without disrupting SKU classification',async()=>{
  class Detector{
    static async getSupportedFormats(){return ['code_128'];}
    async detect(){return [{rawValue:'R01-RK01-L01-A',format:'code_128'}];}
  }
  const scanner=createSkuLiveBarcodeScanner({NativeDetector:Detector});
  try{
    const result=await scanner.scan(frame);
    assert.deepEqual(result.barcodes,['R01-RK01-L01-A']);
    assert.equal(result.candidates.length,0);
  }finally{scanner.close();}
});

test('multiple SKUs in one shelf appear once, keeping zero-padded SKUs',()=>{
  const list=uniqueShelfProducts([
    {sku:'01314',productName:'A'},
    {sku:'59701',productName:'B'},
    {sku:'01314',productName:'A duplicado'},
    {sku:'57641',productName:'C'}
  ]);
  assert.deepEqual(list.map(item=>item.sku),['01314','59701','57641']);
});

test('shelf stock display distinguishes missing availability from an actual zero',()=>{
  const totals=shelfAvailableBySku([
    {codigo_material:'01314',total_disponivel:'3'},
    {codigo_material:'01314',total_disponivel:'2'},
    {codigo_material:'59701',total_disponivel:'0'},
    {codigo_material:'57641',total_disponivel:null},
    {codigo_material:'99999',total_disponivel:'NaN'}
  ]);
  assert.equal(formatShelfQuantity(totals,'01314'),'5');
  assert.equal(formatShelfQuantity(totals,'59701'),'0');
  assert.equal(formatShelfQuantity(totals,'57641'),'Não informado');
  assert.equal(formatShelfQuantity(totals,'99999'),'Não informado');
});

test('WMS shelf scanner is one tap, read-only, scoped to selected warehouse and allows manual entry',async()=>{
  const [script,html,reader]=await Promise.all([
    readFile(new URL('../script.js',import.meta.url),'utf8'),
    readFile(new URL('../index.html',import.meta.url),'utf8'),
    readFile(new URL('../src/shelf-barcode-scanner.js',import.meta.url),'utf8')
  ]);
  assert.match(html,/id="shelfCameraButton"/);
  assert.match(html,/data-screen="consultaPrateleira" type="button">Ler Prateleira/);
  assert.match(html,/id="shelfSearchInput"/);
  assert.match(script,/if \(screenId === "consultaPrateleira"\) return !IS_CP_ALAMO/);
  assert.match(script,/skuPhotoController = openSkuPhotoLookup/);
  assert.match(script,/shelfBarcodeController = openShelfBarcodeScanner/);
  assert.match(script,/\.eq\("warehouse_code", currentWarehouse\)/);
  assert.match(script,/\.eq\("location_code", parsed\.code\)/);
  assert.match(script,/\.eq\("codigo_endereco", parsed\.code\)/);
  assert.match(script,/uniqueShelfProducts\(list\)/);
  assert.match(reader,/result\.barcodes/);
  assert.match(reader,/context\.normalizeLocation\(code\)/);
  assert.match(reader,/dialog\.showModal\(\);[\s\S]*void startCamera\(\);\s*return \{close\};/);
  assert.match(reader,/getUserMedia\(/);
  assert.match(reader,/track\.stop\(\)/);
  assert.doesNotMatch(reader,/photo|upload|toBlob\(/i);
});
