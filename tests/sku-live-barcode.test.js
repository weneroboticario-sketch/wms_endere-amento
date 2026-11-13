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
      Promise.resolve().then(()=>this.onmessage({data:{results:[{code:'01314',format:'CODE_128'}]}}));
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

test('only one native frame runs at a time and closing cancels a stalled native scan',async()=>{
  let detected,started;
  const ready=new Promise(resolve=>{started=resolve;});
  class Detector{
    static async getSupportedFormats(){return ['code_128'];}
    detect(){started();return new Promise(resolve=>{detected=resolve;});}
  }
  const scanner=createSkuLiveBarcodeScanner({NativeDetector:Detector});
  const pending=scanner.scan(canvas);
  await ready;
  await assert.rejects(scanner.scan(canvas),/em andamento/);
  scanner.close();
  await assert.rejects(pending,/encerrado/);
  detected([]);
});

test('a stalled native detector times out and uses the free fallback',async()=>{
  class Detector{
    static async getSupportedFormats(){return ['code_128'];}
    detect(){return new Promise(()=>{});}
  }
  const scanner=createSkuLiveBarcodeScanner({NativeDetector:Detector,timeoutMs:10,makeWorker:()=>({
    postMessage(){this.onmessage({data:{results:[{code:'01314',format:'CODE_128'}]}});},
    terminate(){}
  })});
  assert.equal((await scanner.scan(canvas)).candidates[0].code,'01314');
  scanner.close();
});

test('an unreadable frame yields no candidate and a later frame can still be scanned',async()=>{
  let frames=0;
  const scanner=createSkuLiveBarcodeScanner({NativeDetector:null,makeWorker:()=>({
    postMessage(){this.onmessage({data:{results:++frames===1?[]:[{code:'48060',format:'CODE_39'}]}});},
    terminate(){}
  })});
  assert.deepEqual((await scanner.scan(canvas)).candidates,[]);
  assert.equal((await scanner.scan(canvas)).candidates[0].code,'48060');
  scanner.close();
});

test('native misses avoid expensive fallback on every video frame',async()=>{
  let nativeCalls=0,workerCalls=0;
  class Detector{
    static async getSupportedFormats(){return ['ean_13'];}
    async detect(){nativeCalls++;return [];}
  }
  const scanner=createSkuLiveBarcodeScanner({NativeDetector:Detector,makeWorker:()=>({
    postMessage(){workerCalls++;this.onmessage({data:{results:[{code:'7891033896783',format:'EAN_13'}]}});},
    terminate(){}
  })});
  const first=await scanner.scan(canvas);
  assert.equal(first.candidates.length,0);
  assert.equal(workerCalls,0);
  const second=await scanner.scan(canvas);
  assert.equal(second.candidates[0].code,'7891033896783');
  assert.equal(nativeCalls,2);
  assert.equal(workerCalls,1);
  scanner.close();
});

test('local fallback deep search runs periodically, not on every frame',async()=>{
  const modes=[];
  const scanner=createSkuLiveBarcodeScanner({NativeDetector:null,makeWorker:()=>({
    postMessage(message){
      modes.push(message.deepScan);
      this.onmessage({data:{results:[]}});
    },
    terminate(){}
  })});
  await scanner.scan(canvas);
  await scanner.scan(canvas);
  await scanner.scan(canvas);
  await scanner.scan(canvas);
  assert.deepEqual(modes,[false,false,true,false]);
  scanner.close();
});

test('camera tuning keeps GTIN checksum single-read and SKU two-read safeguard',async()=>{
  const [ui,worker]=await Promise.all([
    readFile(new URL('../src/sku-photo-lookup.js',import.meta.url),'utf8'),
    readFile(new URL('../src/sku-photo-barcode.worker.js',import.meta.url),'utf8')
  ]);
  assert.match(ui,/const CAMERA_FRAME_MAX_WIDTH=800/);
  assert.match(ui,/await wait\(100\)/);
  assert.match(ui,/candidates\.length===1&&candidates\[0\]\.kind==='GTIN'\?1:2/);
  assert.match(ui,/focusMode\?\.includes\('continuous'\)/);
  assert.match(worker,/if\(deepScan\)/);
  assert.match(worker,/if\(center\)\{globalThis\.postMessage\(\{results:\[center\]\}\);return;/);
  assert.doesNotMatch(ui,/data-gallery|data-capture/);
});
