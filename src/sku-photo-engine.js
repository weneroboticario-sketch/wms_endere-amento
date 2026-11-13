/* global Worker */
import {PHOTO_SKU_LIMITS,barcodeCandidate,textSkuCandidates,uniquePhotoCandidates} from './sku-photo-domain.js';
const defaultOcr=async logger=>{const {createWorker}=await import('tesseract.js');return createWorker('por',1,{workerPath:'/magazine-ocr-bootstrap.js',workerBlobURL:false,corePath:'/magazine-assets/core',langPath:'/magazine-assets/lang',logger});};
export function createSkuPhotoEngine({progress=()=>{},NativeDetector=window.BarcodeDetector,makeWorker=()=>new Worker(new URL('./sku-photo-barcode.worker.js',import.meta.url),{type:'module'}),makeOcr=defaultOcr}={}){
 let stopped=false,barcodeWorker=null,ocr=null,rejectCancel;
 const cancelled=new Promise((resolve,reject)=>{rejectCancel=reject;});cancelled.catch(()=>{});
 const current=()=>{if(stopped)throw Error('Leitura cancelada.');};
 async function read(canvas){
  current();progress('Procurando códigos de barras…');const candidates=[];
  if(NativeDetector){try{const supported=await NativeDetector.getSupportedFormats();const formats=['ean_13','ean_8','upc_a','code_128','code_39','itf'].filter(f=>supported.includes(f));if(formats.length){const detector=new NativeDetector({formats});for(const row of await detector.detect(canvas))candidates.push(barcodeCandidate(row.rawValue,row.format));}}catch{}}
  current();
  try{barcodeWorker=makeWorker();const image=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);const result=await Promise.race([new Promise((resolve,reject)=>{barcodeWorker.onmessage=e=>resolve(e.data);barcodeWorker.onerror=()=>reject(Error('Leitor de barras indisponível.'));barcodeWorker.postMessage({pixels:image.data.buffer,width:canvas.width,height:canvas.height},[image.data.buffer]);}),cancelled]);for(const row of result.results||[])candidates.push(barcodeCandidate(row.code,row.format));}catch{current();}finally{barcodeWorker?.terminate();barcodeWorker=null;}
  current();progress('Lendo códigos impressos na foto…');
  try{
   ocr=await makeOcr(m=>{if(!stopped&&m.status==='recognizing text')progress(`Lendo texto: ${Math.round(m.progress*100)}%`);});
   if(stopped){await ocr.terminate();ocr=null;current();}
   const result=await ocr.recognize(canvas,{}, {text:true,blocks:true});current();
   const lines=(result.data.blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>(p.lines||[]).map(l=>({text:l.text||l.words?.map(w=>w.text).join(' '),confidence:l.confidence??Math.min(...(l.words||[]).map(w=>w.confidence))}))));
   candidates.push(...textSkuCandidates(lines));
  }catch(error){current();if(!candidates.filter(Boolean).length)throw error;}
  finally{if(ocr){await ocr.terminate();ocr=null;}}
  return uniquePhotoCandidates(candidates);
 }
 return {read:canvas=>Promise.race([read(canvas),cancelled]),async close(){stopped=true;rejectCancel(Error('Leitura cancelada.'));barcodeWorker?.terminate();barcodeWorker=null;if(ocr){await ocr.terminate();ocr=null;}}};
}
export function resizedPhotoCanvas(image){const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;if(!width||!height||width*height>PHOTO_SKU_LIMITS.pixels)throw Error('Foto muito grande ou inválida. Fotografe apenas a região do código.');const scale=Math.min(1,Math.sqrt(PHOTO_SKU_LIMITS.workPixels/(width*height)));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas;}
