import {barcodeCandidate,uniquePhotoCandidates} from './sku-photo-domain.js';

const FORMATS=['ean_13','ean_8','upc_a','code_128','code_39','itf'];
const stoppedError=()=>new Error('Leitor de câmera encerrado.');

/**
 * Decodes live video frames without taking, uploading or saving photographs.
 * BarcodeDetector is preferred; the existing local ZXing worker is the fallback.
 */
export function createSkuLiveBarcodeScanner({
  NativeDetector=globalThis.BarcodeDetector,
  makeWorker=()=>new Worker(new URL('./sku-photo-barcode.worker.js',import.meta.url),{type:'module'}),
  timeoutMs=2500
}={}){
  let closed=false,configured=false,detector=null,worker=null,workerUnavailable=false,pending=null;

  async function configure(){
    if(configured)return;
    configured=true;
    if(!NativeDetector)return;
    try{
      const supported=await NativeDetector.getSupportedFormats();
      if(closed)throw stoppedError();
      const formats=FORMATS.filter(format=>supported.includes(format));
      if(formats.length)detector=new NativeDetector({formats});
    }catch(error){
      if(closed)throw stoppedError();
      detector=null;
    }
  }

  async function readWorker(canvas){
    if(workerUnavailable)return [];
    try{if(!worker)worker=makeWorker();}
    catch{workerUnavailable=true;return [];}
    return new Promise((resolve,reject)=>{
      let settled=false;
      const finish=(error,rows=[])=>{
        if(settled)return;
        settled=true;
        clearTimeout(timer);
        if(pending?.cancel===cancel)pending=null;
        if(error)reject(error);
        else resolve(rows);
      };
      const cancel=()=>finish(stoppedError());
      const timer=setTimeout(()=>{
        finish(new Error('A leitura demorou demais.'));
        worker?.terminate();worker=null;
      },timeoutMs);
      pending={cancel};
      worker.onmessage=event=>finish(null,event.data?.results||[]);
      worker.onerror=()=>{
        finish(new Error('Leitor de código de barras indisponível.'));
        worker?.terminate();worker=null;workerUnavailable=true;
      };
      try{
        const pixels=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height).data;
        worker.postMessage({pixels:pixels.buffer,width:canvas.width,height:canvas.height},[pixels.buffer]);
      }catch(error){finish(error);}
    });
  }

  async function scan(canvas){
    if(closed)throw stoppedError();
    await configure();
    if(closed)throw stoppedError();
    let decoded=[];
    if(detector){
      try{
        const matches=await detector.detect(canvas);
        if(closed)throw stoppedError();
        decoded=matches.map(row=>({code:row.rawValue,format:row.format}));
      }catch(error){
        if(closed)throw stoppedError();
      }
    }
    if(!decoded.length){
      try{decoded=await readWorker(canvas);}
      catch(error){if(closed)throw stoppedError();throw error;}
    }
    if(closed)throw stoppedError();
    return uniquePhotoCandidates(decoded.map(row=>barcodeCandidate(row.code,row.format)));
  }

  function close(){
    if(closed)return;
    closed=true;
    pending?.cancel();
    worker?.terminate();
    worker=null;detector=null;
  }
  return {scan,close};
}
