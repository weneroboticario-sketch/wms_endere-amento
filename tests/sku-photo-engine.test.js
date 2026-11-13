import test from 'node:test';import assert from 'node:assert/strict';import {createSkuPhotoEngine} from '../src/sku-photo-engine.js';import {readFile} from 'node:fs/promises';
const canvas={width:2,height:2,getContext:()=>({getImageData:()=>({data:new Uint8ClampedArray(16)})})};
test('native detector is attempted first, free fallback runs in a worker, and OCR adds printed candidates',async()=>{
 const calls=[];class Detector{static async getSupportedFormats(){return ['ean_13'];}async detect(){calls.push('native');return [{rawValue:'4006381333931',format:'ean_13'}];}}
 const engine=createSkuPhotoEngine({NativeDetector:Detector,makeWorker:()=>({postMessage(){calls.push('fallback');this.onmessage({data:{results:[{code:'01314',format:'CODE_128'}]}});},terminate(){calls.push('stopBarcode');}}),makeOcr:async()=>({recognize:async()=>{calls.push('ocr');return {data:{blocks:[{paragraphs:[{lines:[{text:'SKU 48060',confidence:98}]}]}]}};},terminate:async()=>calls.push('stopOcr')})});
 const result=await engine.read(canvas);assert.deepEqual(calls.slice(0,2),['native','fallback']);assert.equal(result.candidates.length,3);assert.ok(calls.includes('stopOcr'));await engine.close();
});
test('cancelling during OCR startup terminates the late worker and returns no result',async()=>{
 let started,finish,stopped=false;const ready=new Promise(r=>{started=r;});
 const engine=createSkuPhotoEngine({NativeDetector:null,makeWorker:()=>({postMessage(){this.onmessage({data:{results:[]}});},terminate(){}}),makeOcr:()=>{started();return new Promise(r=>{finish=r;});}});
 const work=engine.read(canvas);await ready;await engine.close();await assert.rejects(work,/cancelada/);finish({terminate:async()=>{stopped=true;}});await new Promise(r=>setTimeout(r,0));assert.equal(stopped,true);
});
test('integration is limited to Consulta de SKU and uses the existing query; old photo module stays absent',async()=>{
 const js=await readFile(new URL('../script.js',import.meta.url),'utf8'),html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 assert.match(js,/value = sku; await renderSkuSearch\(\)/);assert.match(js,/if \(IS_CP_ALAMO \|\| !canAccessScreen\("consultaSku"\)\) return/);assert.match(html,/id="skuPhotoButton"/);assert.doesNotMatch(html,/Leitura por Foto|id="leituraFoto"/);
});
