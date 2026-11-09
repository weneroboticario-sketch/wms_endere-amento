import {MAGAZINE_LIMITS,extractMagazineCodes,validatePdfFile} from './magazines-domain.js';
let pdfLibrary,workerUrl;
async function library(){
 if(!pdfLibrary){pdfLibrary=await import('pdfjs-dist/build/pdf.mjs');const worker=await import('pdfjs-dist/build/pdf.worker.min.mjs?url');workerUrl=worker.default;}
 return pdfLibrary;
}
export async function openMagazinePdf(file){
 await validatePdfFile(file);const lib=await library();const data=new Uint8Array(await file.arrayBuffer());
 const port=new window.Worker(workerUrl,{type:'module'}),worker=new lib.PDFWorker({port});
 const task=lib.getDocument({data,worker,isEvalSupported:false,enableXfa:false,standardFontDataUrl:'/magazine-assets/pdf/standard_fonts/',cMapUrl:'/magazine-assets/pdf/cmaps/',cMapPacked:true,wasmUrl:'/magazine-assets/pdf/wasm/'});
 const destroy=async()=>{await task.destroy();worker.destroy();port.terminate();};
 let pdf;try{pdf=await task.promise;}catch{await destroy();throw new Error('PDF corrompido, protegido por senha ou não suportado. Envie uma versão PDF legível.');}
 if(pdf.numPages>MAGAZINE_LIMITS.pages){await destroy();throw new Error('O PDF deve ter até 500 páginas.');}
 return {numPages:pdf.numPages,getPage:number=>pdf.getPage(number),destroy};
}
export async function pdfDigest(file){const hash=await window.crypto.subtle.digest('SHA-256',await file.arrayBuffer());return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('');}
export async function renderMagazinePage(pdf,number,canvas,{maxPixels=4000000,scale=1.6}={}){
 const page=await pdf.getPage(number),base=page.getViewport({scale});const factor=Math.min(1,Math.sqrt(maxPixels/(base.width*base.height))),viewport=page.getViewport({scale:scale*factor});
 canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;return {page,viewport};
}
export function pdfTextSpans(content,viewport,lib){
 return content.items.filter(i=>typeof i.str==='string').map(i=>{const tx=lib.Util.transform(viewport.transform,i.transform),height=Math.max(1,Math.hypot(tx[2],tx[3]));return {text:i.str,box:[Math.max(0,tx[4]/viewport.width),Math.max(0,(tx[5]-height)/viewport.height),Math.min(1,Math.abs(i.width*viewport.scale)/viewport.width),Math.min(1,height/viewport.height)],confidence:100};});
}
function ocrSpans(data,width,height){
 return (data.blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>(p.lines||[]).flatMap(l=>(l.words||[]).map(w=>({text:w.text,confidence:w.confidence,box:[w.bbox.x0/width,w.bbox.y0/height,(w.bbox.x1-w.bbox.x0)/width,(w.bbox.y1-w.bbox.y0)/height]})))));
}
export function createMagazineProcessor({onProgress=()=>{}}={}){
 let stopped=false,ocr=null,rejectCancellation;
 const cancelled=new Promise((resolve,reject)=>{rejectCancellation=reject;});cancelled.catch(()=>{});
 async function read(pdf,number,{forceOcr=false}={}){
  if(stopped)throw new Error('Processamento cancelado.');const lib=await library(),page=await pdf.getPage(number),viewport=page.getViewport({scale:1}),content=await page.getTextContent();
  const spans=pdfTextSpans(content,viewport,lib),legible=spans.map(s=>s.text).join(' ').replace(/[^\p{L}\p{N}]/gu,'').length>=25;
  const textItems=extractMagazineCodes(spans);
  if(legible&&textItems.length&&!forceOcr)return {items:textItems,source:'TEXT',text:spans.map(s=>s.text).join(' '),warning:'Extração de texto concluída; a página ainda precisa de revisão humana.'};
  const canvas=document.createElement('canvas');await renderMagazinePage(pdf,number,canvas,{scale:2.5,maxPixels:5000000});
  if(stopped)throw new Error('Processamento cancelado.');
  if(!ocr){const {createWorker}=await import('tesseract.js');ocr=await createWorker('por',1,{workerPath:'/magazine-ocr-bootstrap.js',workerBlobURL:false,corePath:'/magazine-assets/core',langPath:'/magazine-assets/lang',logger:message=>onProgress({page:number,...message})});}
  if(stopped){await ocr.terminate();ocr=null;throw new Error('Processamento cancelado.');}
  const result=await ocr.recognize(canvas,{}, {text:true,blocks:true});const words=ocrSpans(result.data,canvas.width,canvas.height);canvas.width=canvas.height=1;
  if(stopped)throw new Error('Processamento cancelado.');return {items:extractMagazineCodes(words,{source:'OCR'}),source:'OCR',text:result.data.text,warning:'OCR não garante a identificação de todos os códigos. Revise o original.'};
 }
 return {read:(...args)=>Promise.race([read(...args),cancelled]),async cancel(){stopped=true;rejectCancellation(new Error('Processamento cancelado.'));if(ocr){await ocr.terminate();ocr=null;}},async close(){if(ocr){await ocr.terminate();ocr=null;}}};
}
