import {createSkuLiveBarcodeScanner} from './sku-live-barcode.js';
import {validGtin} from './sku-photo-domain.js';
import './sku-photo-lookup.css';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
/** Scan video frames only. No photographs are stored or uploaded. */
export function openTransferBarcodeScanner(context,{scannerFactory=createSkuLiveBarcodeScanner}={}){
 let closed=false,stream=null,scanner=null,frameId=0,interval=null,face='environment';
 const current=()=>!closed&&context.canUse();
 const dialog=document.createElement('dialog');
 dialog.className='sku-photo-dialog';
 dialog.setAttribute('aria-label','Bipar produto da transferência');
 dialog.innerHTML=[
 '<header><h3>Bipar produto da transferência</h3><button class="secondary-button" type="button" data-close>Fechar</button></header>',
 '<p>Aponte para o EAN do produto ou etiqueta SKU. A leitura será validada antes de registrar.</p>',
 '<p data-status role="status" aria-live="polite">Abrindo câmera…</p>',
 '<div class="button-row sku-scanner-buttons"><button class="primary-button" type="button" data-start>Reiniciar leitura</button>',
 '<button class="secondary-button" type="button" data-switch hidden>Alternar câmera</button>',
 '<button class="secondary-button" type="button" data-stop hidden>Parar câmera</button></div>',
 '<div class="sku-scanner-view" data-view hidden><video data-video muted playsinline autoplay></video>',
 '<span class="sku-scanner-guide" aria-hidden="true"></span></div>'
 ].join('');
 document.body.append(dialog);
 const $=selector=>dialog.querySelector(selector),video=$('[data-video]'),canvas=document.createElement('canvas');
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 const notice=value=>{$('[data-status]').textContent=value;};
 function stop(){
  frameId++;
  scanner?.close();scanner=null;
  stream?.getTracks().forEach(t=>t.stop());stream=null;
  video.pause();video.srcObject=null;
  $('[data-view]').hidden=true;$('[data-stop]').hidden=true;$('[data-switch]').hidden=true;$('[data-start]').hidden=false;
  canvas.width=canvas.height=1;
 }
 function close(){
  if(closed)return;closed=true;stop();
  if(interval!==null)window.clearInterval(interval);
  if(dialog.open)dialog.close();dialog.remove();
 }
 async function read(id){
  let last='',consecutive=0,errors=0;
  while(current()&&id===frameId&&stream&&scanner){
   try{
    if(video.readyState<2||!video.videoWidth){await pause(160);continue;}
    const scale=Math.min(1,800/Math.max(video.videoWidth,video.videoHeight));
    canvas.width=Math.max(1,Math.round(video.videoWidth*scale));
    canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
    ctx.drawImage(video,0,0,canvas.width,canvas.height);
    const scan=await scanner.scan(canvas);
    if(!current()||id!==frameId)return;
    errors=0;
    const rows=[...new Set((scan.barcodes||[]).map(value=>String(value).trim()).filter(value=>/^\d{4,14}$/.test(value)))];
    if(rows.length===1){
      const code=rows[0],isGtin=validGtin(code);
      consecutive=code===last?consecutive+1:1;last=code;
      if(consecutive>=(isGtin?1:2)){close();await context.onRead(code);return;}
    }else{last='';consecutive=0;}
   }catch(error){
    if(!current()||id!==frameId)return;
    errors++;if(errors>=3){stop();notice('Leitura indisponível. Use o leitor físico ou digite o SKU.');return;}
    notice('Ajuste o enquadramento e tente novamente.');
   }
   await pause(120);
  }
 }
 async function start(){
  if(!current())return;stop();
  const id=frameId;$('[data-start]').disabled=true;notice('Solicitando acesso à câmera…');
  try{
   if(!navigator.mediaDevices?.getUserMedia)throw new Error('Câmera indisponível neste navegador.');
   const next=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:face},width:{ideal:1280},height:{ideal:720}}});
   if(!current()||id!==frameId){next.getTracks().forEach(t=>t.stop());return;}
   stream=next;video.srcObject=stream;$('[data-view]').hidden=false;
   await video.play();
   if(!current()||id!==frameId)return;
   scanner=scannerFactory();$('[data-start]').hidden=true;
   $('[data-switch]').hidden=false;$('[data-stop]').hidden=false;
   notice('Leitor ativo. Centralize o código do produto.');
   void read(id);
  }catch(error){
   if(!current()||id!==frameId)return;stop();
   notice(['NotAllowedError','PermissionDeniedError'].includes(error.name)
     ?'Permissão negada. Autorize a câmera no navegador ou digite o SKU.'
     :'Não foi possível abrir a câmera. Utilize o leitor físico ou digite o SKU.');
  }finally{if(!closed)$('[data-start]').disabled=false;}
 }
 $('[data-close]').addEventListener('click',close);
 $('[data-start]').addEventListener('click',()=>{void start();});
 $('[data-stop]').addEventListener('click',()=>{stop();notice('Câmera parada.');});
 $('[data-switch]').addEventListener('click',()=>{face=face==='environment'?'user':'environment';void start();});
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 dialog.addEventListener('close',close);
 interval=window.setInterval(()=>{if(!current())close();},400);
 dialog.showModal();
 void start();
 return {close};
}
