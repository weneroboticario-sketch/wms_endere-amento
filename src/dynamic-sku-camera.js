import {createSkuLiveBarcodeScanner} from './sku-live-barcode.js';
import './universal-barcode-camera.css';

// Scanner limitado aos formulários dinâmicos operacionais; o leitor universal permanece desativado.
const targets=[
  '.inbound-workspace form[data-scan] input[data-code]',
  '.inbound-workspace form[data-map] input[data-map-sku]',
  '.inbound-workspace form[data-extra-form] input[name="code"]',
  '.ca-quick-form input[data-camera-sku]'
].join(',');
const attached=new WeakSet();
let activeScanner=null;
function attach(){
  if(!document.body)return;
  for(const field of document.querySelectorAll(targets)){
    if(attached.has(field)){
      const button=field.nextElementSibling;
      if(button?.classList.contains('dynamic-sku-camera-button'))button.disabled=field.disabled||field.readOnly;
      continue;
    }
    attached.add(field);
    const button=document.createElement('button');
    button.type='button';
    button.className='secondary-button dynamic-sku-camera-button';
    button.textContent='Câmera';
    button.setAttribute('aria-label','Ler código com a câmera');
    button.disabled=field.disabled||field.readOnly;
    field.insertAdjacentElement('afterend',button);
    button.addEventListener('click',()=>{
      if(!field.isConnected||field.disabled||field.readOnly)return;
      activeScanner?.close();
      activeScanner=openGenericScanner({
        canUse:()=>field.isConnected&&!field.disabled&&!field.readOnly,
        accept:code=>{
          if(!field.isConnected||field.disabled||field.readOnly)return;
          // O vínculo interno exige SKU. Nunca associar EAN de 13 dígitos como SKU sem validação.
          if(field.matches('[data-map-sku]')&&!/^\d{4,8}$/.test(code)){
            field.setCustomValidity('Para vincular, informe o SKU interno de 4 a 8 dígitos. O EAN não pode ser vinculado diretamente.');
            field.reportValidity();
            field.addEventListener('input',()=>field.setCustomValidity(''),{once:true});
            return;
          }
          const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
          if(setter)setter.call(field,code);else field.value=code;
          field.dispatchEvent(new Event('input',{bubbles:true}));
          field.dispatchEvent(new Event('change',{bubbles:true}));
          field.focus();
        }
      });
    });
  }
}
export function activateDynamicSkuCameras(){
  let scheduled=false;
  const observer=new MutationObserver(mutations=>{
    if(!mutations.some(m=>m.type==='childList'||m.type==='attributes'&&m.target.matches?.(targets)))return;
    if(scheduled)return;
    scheduled=true;
    queueMicrotask(()=>{scheduled=false;attach();});
  });
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','readonly']});
  attach();
  return ()=>observer.disconnect();
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
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',activateDynamicSkuCameras,{once:true});
  else activateDynamicSkuCameras();
}
