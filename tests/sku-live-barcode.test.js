import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSkuLiveBarcodeScanner} from '../src/sku-live-barcode.js';

const canvas={width:2,height:2,getContext:()=>({getImageData:()=>({data:new Uint8ClampedArray(16)})})};

test('live scanner uses native detector and preserves GTIN classification',async()=>{
  let calls=0;
  class Detector{
    static async getSupportedFormats(){return ['ean_13','code_128'];}
    async detect(){calls++;return [{rawValue:'4006381333931',format:'ean_13'}];}
  }
  const scanner=createSkuLiveBarcodeScanner({NativeDetector:Detector,makeWorker:()=>{throw Error('No fallback expected');}});
  const result=await scanner.scan(canvas);
  assert.equal(calls,1);
  assert.deepEqual(result.candidates.map(item=>[item.code,item.kind]),[['4006381333931','GTIN']]);
  scanner.close();
});

test('ZXing worker fallback reads a Code 128 internal SKU without camera capture',async()=>{
  let posted=0,terminated=false;
  const scanner=createSkuLiveBarcodeScanner({NativeDetector:null,makeWorker:()=>({
    postMessage(message){
      posted++;
      assert.equal(message.width,2);
      queueMicrotask(()=>this.onmessage({data:{results:[{code:'01314',format:'CODE_128'}]}}));
    },
    terminate(){terminated=true;}
  })});
  const result=await scanner.scan(canvas);
  assert.deepEqual(result.candidates.map(item=>[item.code,item.kind]),[['01314','SKU']]);
  assert.equal(posted,1);
  scanner.close();
  assert.equal(terminated,true);
});

test('closing the reader rejects an outstanding fallback decode and stops the worker',async()=>{
  let resolveStarted,terminated=false;
  const started=new Promise(resolve=>{resolveStarted=resolve;});
  const scanner=createSkuLiveBarcodeScanner({NativeDetector:null,makeWorker:()=>({
    postMessage(){resolveStarted();},
    terminate(){terminated=true;}
  })});
  const pending=scanner.scan(canvas);
  await started;
  scanner.close();
  await assert.rejects(pending,/encerrado/);
  assert.equal(terminated,true);
  await assert.rejects(scanner.scan(canvas),/encerrado/);
});

test('Consulta de SKU has live barcode reader without gallery, image upload or still photo',async()=>{
  const [code,html]=await Promise.all([
    readFile(new URL('../src/sku-photo-lookup.js',import.meta.url),'utf8'),
    readFile(new URL('../index.html',import.meta.url),'utf8')
  ]);
  assert.match(code,/getUserMedia/);
  assert.match(code,/scanLoop/);
  assert.match(code,/lookup_wms_sku_photo/);
  assert.match(code,/context\.onSku/);
  assert.doesNotMatch(code,/type=.file.|data-gallery|data-capture|Fotografar etiqueta|createObjectURL|\.toBlob\(/);
  assert.match(html,/aria-label="Ler código de barras com a câmera"/);
  assert.match(html,/id="skuPhotoButton"/);
  assert.doesNotMatch(html,/id="leituraFoto"/);
});
