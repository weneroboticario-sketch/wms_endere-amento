import {createSkuLiveBarcodeScanner} from './sku-live-barcode.js';
import './universal-barcode-camera.css';

// Do not interfere with existing specialized scanners, validation or form submission.
const supportedIds=new Set([
 'dashboardSkuQuickInput','skuInput','locationInput','replenishmentSkuInput',
 'transferScanInput'
]);
const specialExisting=new Set(['skuSearchInput','shelfSearchInput','transferScanInput']);
const patterns=/\b(sku|ean|gtin|c[oó]digo de barras|bip(?:e|ar|agem)|scanner|prateleira|endere[cç]o wms)\b/i;
const forbidden=/senha|password|token|autentica|acesso|login|usu[aá]rio|cupom|pedido|nota fiscal|nfe|nf-e|cnpj|cpf|telefone|email|transfercodefilter|search|filter/i;
export function isBarcodeEntry(input){
 if(!input||input.tagName!=='INPUT')return false;
 const type=String(input.type||'text').toLowerCase();
 if(!['text','search','tel'].includes(type))return false;
 if(input.readOnly||input.dataset.noBarcodeCamera!==undefined)return false;
 const id=String(input.id||'');
 if(specialExisting.has(id))return false;
 if(supportedIds.has(id))return true;
 const attributes=[input.name,input.getAttribute('aria-label'),input.placeholder,input.getAttribute('data-code'),input.getAttribute('data-sku'),id].filter(Boolean).join(' ');
 if(forbidden.test(attributes))return false;
 if(input.hasAttribute('data-code')&&/sku|ean|bipe|scan/i.test(attributes))return true;
 return patterns.test(attributes);
}
export function activateBarcodeCamera(){
 const attached=new WeakSet();
 let active=null;
 const look=()=>{
  if(!document.body)return;
  for(const field of document.querySelectorAll('input')){
   if(attached.has(field)||!isBarcodeEntry(field))continue;
   attached.add(field);
   const button=document.createElement('button');
   button.type='button';button.className='secondary-button universal-barcode-trigger';
   button.title='Ler código de barras pela câmera';button.setAttribute('aria-label','Ler código de barras pela câmera');
   button.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9V5h5M15 5h5v4M20 15v4h-5M9 20H4v-5M7 10v4M10 9v6M13 9v6M16 10v4"/></svg><span>Câmera</span>';
   field.insertAdjacentElement('afterend',button);
   button.addEventListener('click',()=>{
    if(!field.isConnected||field.disabled||field.readOnly)return;
    active?.close();
    active=openGenericScanner({
     accept:code=>{
      if(!field.isConnected||field.disabled||field.readOnly)return;
      const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
      if(setter)setter.call(field,code);else field.value=code;
      field.dispatchEvent(new Event('input',{bubbles:true}));
      field.dispatchEvent(new Event('change',{bubbles:true}));
      field.focus();
     },
     canUse:()=>field.isConnected&&!field.disabled&&!field.readOnly
    });
   });
  }
 };
 let scheduled=false;
 const observer=new MutationObserver(()=>{
  if(scheduled)return;scheduled=true;
  queueMicrotask(()=>{scheduled=false;look();});
 });
 observer.observe(document.documentElement,{subtree:true,childList:true});
 look();
}
export function openGenericScanner({accept,canUse=()=>true,scannerFactory=createSkuLiveBarcodeScanner}){
 const dialog=document.createElement('dialog');
 dialog.className='universal-barcode-dialog';
 dialog.innerHTML='<header><strong>Leitura de código de barras</strong><button type="button" data-close>Fechar</button></header><p data-status role="status">Abrindo câmera…</p><video autoplay muted playsinline></video><footer><button type="button" data-restart>Reiniciar câmera</button><button type="button" data-switch>Alternar câmera</button></footer>';
 document.body.append(dialog);
 const video=dialog.querySelector('video'),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
 const notice=text=>{if(dialog.isConnected)dialog.querySelector('[data-status]').textContent=text;};
 let closed=false,stream=null,scanner=null,version=0,face='environment',timer=null;
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 function stop(){version++;scanner?.close();scanner=null;stream?.getTracks().forEach(t=>t.stop());stream=null;video.pause();video.srcObject=null;}
 function close(){if(closed)return;closed=true;stop();if(timer)clearInterval(timer);if(dialog.open)dialog.close();dialog.remove();}
 async function start(){
  stop();if(closed||!canUse())return;
  const current=version;notice('Solicitando acesso à câmera…');
  try{
   if(!navigator.mediaDevices?.getUserMedia)throw Error('Câmera indisponível neste navegador.');
   const acquired=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:face},width:{ideal:1280},height:{ideal:720}}});
   if(closed||current!==version||!canUse()){acquired.getTracks().forEach(t=>t.stop());return;}
   stream=acquired;video.srcObject=stream;await video.play();
   if(closed||current!==version)return;
   scanner=scannerFactory();notice('Centralize o código na câmera.');
   let previous='',consecutive=0,failures=0;
   while(!closed&&current===version&&canUse()){
    if(video.readyState<2||!video.videoWidth){await pause(150);continue;}
    const scale=Math.min(1,800/Math.max(video.videoWidth,video.videoHeight));
    canvas.width=Math.max(1,Math.round(video.videoWidth*scale));
    canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
    ctx.drawImage(video,0,0,canvas.width,canvas.height);
    let rows;
    try{rows=(await scanner.scan(canvas)).barcodes||[];failures=0;}
    catch(error){if(closed||current!==version)return;if(++failures>=3)throw error;await pause(150);continue;}
    if(closed||current!==version||!canUse())return;
    const codes=[...new Set(rows.map(x=>String(x).trim()).filter(x=>/^[A-Za-z0-9._-]{4,64}$/.test(x)))];
    if(codes.length===1){
     const code=codes[0];
     consecutive=code===previous?consecutive+1:1;previous=code;
     if(consecutive>=2){close();accept(code);return;}
    }else{previous='';consecutive=0;}
    await pause(120);
   }
  }catch(error){if(!closed&&current===version){stop();notice(error?.name==='NotAllowedError'?'Autorize a câmera no navegador.':'Não foi possível ler. Digite ou use o leitor físico.');}}
 }
 dialog.querySelector('[data-close]').onclick=close;
 dialog.querySelector('[data-restart]').onclick=()=>{void start();};
 dialog.querySelector('[data-switch]').onclick=()=>{face=face==='environment'?'user':'environment';void start();};
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 timer=setInterval(()=>{if(!canUse())close();},350);
 dialog.showModal();void start();
 return {close};
}
if(typeof document!=='undefined'){
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',activateBarcodeCamera,{once:true});
 else activateBarcodeCamera();
}
