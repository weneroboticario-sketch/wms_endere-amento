/* global Worker */
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
  let closed=false,configured=false,detector=null,worker=null,workerUnavailable=false,pending=null,busy=false,rejectScan=null;
  let nativeEmptyFrames=0,workerFrames=0;

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
    if(workerUnavailable)throw Error('Leitor de código de barras não suportado neste navegador.');
    try{if(!worker)worker=makeWorker();}
    catch{workerUnavailable=true;throw Error('O navegador não conseguiu iniciar o leitor de código de barras.');}
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
        workerFrames++;
        worker.postMessage({pixels:pixels.buffer,width:canvas.width,height:canvas.height,deepScan:workerFrames%3===0},[pixels.buffer]);
      }catch(error){finish(error);}
    });
  }

  async function decode(canvas){
    if(closed)throw stoppedError();
    await configure();
    if(closed)throw stoppedError();
    let decoded=[];
    if(detector){
      try{
        let timer;
        const matches=await Promise.race([
          detector.detect(canvas),
          new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Leitura nativa excedeu o prazo.')),Math.min(timeoutMs,800));})
        ]).finally(()=>clearTimeout(timer));
        if(closed)throw stoppedError();
        decoded=matches.map(row=>({code:row.rawValue,format:row.format}));
      }catch(error){
        if(closed)throw stoppedError();
        // On a stalled detector do not spend another full timeout on every frame.
        if(error?.message==='Leitura nativa excedeu o prazo.')detector=null;
      }
      if(detector&&!decoded.length){
        nativeEmptyFrames++;
        // Avoid running both engines for every empty frame. Retry the worker on every second miss.
        if(nativeEmptyFrames%2===1)return uniquePhotoCandidates([]);
      }else if(decoded.length)nativeEmptyFrames=0;
    }
    if(!decoded.length){
      try{decoded=await readWorker(canvas);}
      catch(error){if(closed)throw stoppedError();throw error;}
    }
    if(closed)throw stoppedError();
    return uniquePhotoCandidates(decoded.map(row=>barcodeCandidate(row.code,row.format)));
  }

  async function scan(canvas){
    if(closed)throw stoppedError();
    if(busy)throw Error('Uma leitura já está em andamento.');
    busy=true;
    try{
      return await new Promise((resolve,reject)=>{
        rejectScan=reject;
        decode(canvas).then(resolve,reject);
      });
    }finally{busy=false;rejectScan=null;}
  }

  function close(){
    if(closed)return;
    closed=true;
    rejectScan?.(stoppedError());
    pending?.cancel();
    worker?.terminate();
    worker=null;detector=null;
  }
  return {scan,close};
}
