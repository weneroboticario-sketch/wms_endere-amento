import {createSkuLiveBarcodeScanner} from './sku-live-barcode.js';
import './sku-photo-lookup.css';

const wait=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
const FRAME_MAX=800;

/**
 * Read the existing CODE128 shelf label without writing inventory data.
 * Parsing and warehouse authorization are delegated to the authenticated WMS screen.
 */
export function openShelfBarcodeScanner(context,{scannerFactory=createSkuLiveBarcodeScanner}={}){
  const actor=context.user()?.id,warehouse=context.warehouse();
  let closed=false,stream=null,scanner=null,face='environment',generation=0,watchdog=null;
  const current=()=>!closed&&actor===context.user()?.id&&warehouse===context.warehouse()&&context.canUse();
  const dialog=document.createElement('dialog');
  dialog.className='sku-photo-dialog';
  dialog.setAttribute('aria-label','Ler código de barras da prateleira');
  dialog.innerHTML=[
    '<header><h3>Ler prateleira</h3><button type="button" class="secondary-button" data-close>Fechar</button></header>',
    '<p>Centralize o código de barras CODE128 da etiqueta do endereço.</p>',
    '<p data-status role="status" aria-live="polite">Abrindo câmera…</p>',
    '<div class="button-row sku-scanner-buttons">',
    '<button type="button" class="primary-button" data-start>Reiniciar leitura</button>',
    '<button type="button" class="secondary-button" data-switch hidden>Alternar câmera</button>',
    '<button type="button" class="secondary-button" data-stop hidden>Parar câmera</button>',
    '</div>',
    '<div class="sku-scanner-view" data-view hidden><video data-video autoplay playsinline muted aria-label="Câmera para leitura da etiqueta de prateleira"></video>',
    '<span class="sku-scanner-guide" aria-hidden="true"></span>',
    '<span class="sku-scanner-hint">Aponte para a etiqueta da prateleira</span></div>'
  ].join('');
  document.body.append(dialog);
  const $=selector=>dialog.querySelector(selector);
  const video=$('[data-video]'),frame=document.createElement('canvas');
  const ctx=frame.getContext('2d',{willReadFrequently:true});
  const notice=text=>{$('[data-status]').textContent=text;};

  function stopCamera(){
    generation++;
    scanner?.close();scanner=null;
    stream?.getTracks().forEach(track=>track.stop());stream=null;
    video.pause();video.srcObject=null;
    $('[data-view]').hidden=true;
    $('[data-start]').hidden=false;
    $('[data-stop]').hidden=true;
    $('[data-switch]').hidden=true;
    frame.width=frame.height=1;
  }

  function close(){
    if(closed)return;
    closed=true;
    stopCamera();
    if(watchdog!==null)clearInterval(watchdog);
    if(dialog.open)dialog.close();
    dialog.remove();
    context.closed?.();
  }

  async function scanLoop(id){
    let lastInvalid='',errorCount=0;
    while(current()&&id===generation&&stream&&scanner){
      try{
        if(video.readyState<2||!video.videoWidth||!video.videoHeight){
          await wait(130);continue;
        }
        const scale=Math.min(1,FRAME_MAX/Math.max(video.videoWidth,video.videoHeight));
        frame.width=Math.max(1,Math.round(video.videoWidth*scale));
        frame.height=Math.max(1,Math.round(video.videoHeight*scale));
        ctx.drawImage(video,0,0,frame.width,frame.height);
        const result=await scanner.scan(frame);
        if(!current()||id!==generation)return;
        errorCount=0;
        const barcodes=result.barcodes||[];
        const match=barcodes.map(code=>context.normalizeLocation(code)).find(parsed=>parsed?.valid);
        if(match){
          const location=match.code;
          close();
          try{await context.onRead(location);}
          catch(error){context.error?.(error);}
          return;
        }
        if(barcodes.length&&barcodes[0]!==lastInvalid){
          lastInvalid=barcodes[0];
          notice('Código detectado, mas não corresponde a um endereço WMS. Centralize a etiqueta da prateleira.');
        }else if(!barcodes.length&&lastInvalid){
          lastInvalid='';
          notice('Procurando código de endereço…');
        }
      }catch(error){
        if(!current()||id!==generation)return;
        errorCount++;
        if(errorCount>=3){stopCamera();notice('Leitura indisponível. Digite o endereço no campo de consulta.');return;}
        notice('Ajuste o enquadramento. Tentando novamente…');
      }
      await wait(100);
    }
  }

  async function startCamera(){
    if(!current())return;
    stopCamera();
    const id=generation;
    $('[data-start]').disabled=true;
    notice('Solicitando permissão para a câmera…');
    try{
      const media=context.mediaDevices??navigator.mediaDevices;
      if(!media?.getUserMedia)throw new Error('Este navegador não oferece câmera. Digite o endereço manualmente.');
      const next=await media.getUserMedia({
        audio:false,video:{facingMode:{ideal:face},width:{ideal:1280},height:{ideal:720}}
      });
      if(!current()||id!==generation){next.getTracks().forEach(track=>track.stop());return;}
      stream=next;
      try{
        const track=stream.getVideoTracks()[0],capabilities=track?.getCapabilities?.();
        if(capabilities?.focusMode?.includes('continuous')){
          void track.applyConstraints({advanced:[{focusMode:'continuous'}]}).catch(()=>{});
        }
      }catch{/* Autofocus is optional on mobile devices. */}
      video.srcObject=stream;$('[data-view]').hidden=false;
      await video.play();
      if(!current()||id!==generation)return;
      scanner=scannerFactory();
      $('[data-start]').hidden=true;
      $('[data-stop]').hidden=false;
      $('[data-switch]').hidden=false;
      notice('Leitor ativo. Aponte para o código da prateleira.');
      void scanLoop(id);
    }catch(error){
      if(!current()||id!==generation)return;
      stopCamera();
      notice(['NotAllowedError','PermissionDeniedError'].includes(error.name)
        ?'Permissão da câmera negada. Autorize no navegador ou digite o endereço.'
        :error.name==='NotFoundError'
          ?'Nenhuma câmera disponível. Digite o endereço.'
          :'Não foi possível abrir a câmera: '+error.message);
    }finally{if(!closed)$('[data-start]').disabled=false;}
  }

  $('[data-close]').addEventListener('click',close);
  $('[data-start]').addEventListener('click',startCamera);
  $('[data-stop]').addEventListener('click',()=>{
    stopCamera();notice('Leitura interrompida. Reinicie a câmera para continuar.');
  });
  $('[data-switch]').addEventListener('click',()=>{
    face=face==='environment'?'user':'environment';void startCamera();
  });
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('close',close);
  watchdog=setInterval(()=>{if(!current())close();},400);
  dialog.showModal();
  // The camera request starts within the initial tap, not after an extra button.
  void startCamera();
  return {close};
}
