import {escapeHtml as e} from './utils.js';
import {createSkuLiveBarcodeScanner} from './sku-live-barcode.js';
import {resolvePhotoCandidates} from './sku-photo-domain.js';
import './sku-photo-lookup.css';

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const CAMERA_FRAME_MAX_WIDTH=960;

/**
 * Live barcode lookup within Consulta de SKU.
 * No file picker, photograph, gallery upload, OCR or persistent image storage.
 */
export function openSkuPhotoLookup(context,{scannerFactory=createSkuLiveBarcodeScanner}={}){
  const actor=context.user()?.id,warehouse=context.warehouse();
  let closed=false,stream=null,scanner=null,token=0,paused=false,face='environment',timer=null;
  const current=()=>!closed&&actor===context.user()?.id&&warehouse===context.warehouse()&&context.canUse();
  const dialog=document.createElement('dialog');
  dialog.className='sku-photo-dialog';
  dialog.setAttribute('aria-label','Ler código de barras na Consulta de SKU');
  dialog.innerHTML=[
    '<header><h3>Leitor de código de barras</h3><button type="button" class="secondary-button" data-close>Fechar</button></header>',
    '<p>Aponte a câmera do celular diretamente para o código de barras da etiqueta. A leitura é ao vivo, sem tirar ou salvar fotos.</p>',
    '<p role="status" aria-live="polite" data-status>Toque em Iniciar leitura para ativar a câmera.</p>',
    '<div class="button-row sku-scanner-buttons">',
    '<button type="button" class="primary-button" data-start>Iniciar leitura</button>',
    '<button type="button" class="secondary-button" data-switch hidden>Alternar câmera</button>',
    '<button type="button" class="secondary-button" data-stop hidden>Parar câmera</button>',
    '</div>',
    '<div class="sku-scanner-view" data-view hidden><video data-video autoplay playsinline muted aria-label="Visualização da câmera para ler código de barras"></video>',
    '<span class="sku-scanner-guide" aria-hidden="true"></span><span class="sku-scanner-hint">Centralize o código de barras e mantenha o celular firme</span></div>',
    '<div data-results aria-live="polite"></div>',
    '<fieldset><legend>Consulta manual (alternativa)</legend>',
    '<label>SKU impresso<input data-manual inputmode="numeric" maxlength="8" autocomplete="off"></label>',
    '<button type="button" class="secondary-button" data-manual-query>Validar e consultar SKU</button>',
    '</fieldset>'
  ].join('');
  document.body.append(dialog);
  const $=selector=>dialog.querySelector(selector);
  const video=$('[data-video]'),frame=document.createElement('canvas');
  const frameCtx=frame.getContext('2d',{willReadFrequently:true});
  const notice=message=>{$('[data-status]').textContent=message;};

  function stopCamera(){
    token++;
    paused=false;
    const previous=scanner;
    scanner=null;
    previous?.close();
    if(stream)stream.getTracks().forEach(track=>track.stop());
    stream=null;
    video.pause();
    video.srcObject=null;
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
    if(timer!==null)window.clearInterval(timer);
    if(dialog.open)dialog.close();
    dialog.remove();
    context.closed?.();
  }

  async function lookup(candidate){
    if(!current())throw Error('A consulta foi encerrada ou o estoque mudou.');
    const response=await context.client().rpc('lookup_wms_sku_photo',{
      p_warehouse:warehouse,p_code:candidate.code,p_kind:candidate.kind
    });
    if(!current())throw Error('A consulta foi encerrada ou o estoque mudou.');
    if(response.error)throw response.error;
    return response.data||[];
  }

  async function choose(product){
    if(!current())return close();
    const sku=String(product.sku||'');
    close();
    await context.onSku(sku);
  }

  function showResults(result){
    const products=result.products||[];
    const rows=products.map((product,index)=>
      '<article><strong>'+e(product.sku)+'</strong><span>'+e(product.product_name)+'</span>'+
      '<button class="primary-button" type="button" data-product="'+index+'">Consultar SKU</button></article>'
    ).join('');
    const errors=result.errors?.length?'<p>Não foi possível validar todos os códigos. Faça uma nova leitura ou consulte manualmente.</p>':'';
    const unknown=result.unknown?.length?'<p>Código lido sem vínculo confirmado com o SKU deste estoque. Confira a etiqueta ou consulte pelo SKU impresso.</p>':'';
    $('[data-results]').innerHTML=(products.length?'<h4>Produto identificado</h4>'+rows:'')+errors+unknown;
    $('[data-results]').querySelectorAll('[data-product]').forEach(button=>{
      button.addEventListener('click',()=>choose(products[Number(button.dataset.product)]).catch(error=>context.error?.(error)));
    });
    if(stream){
      const retry=document.createElement('button');
      retry.type='button';
      retry.className='secondary-button sku-scanner-retry';
      retry.textContent='Escanear outro código';
      retry.onclick=()=>{
        if(!current())return;
        $('[data-results]').replaceChildren();
        paused=false;
        notice('Procurando código de barras…');
        void scanLoop(token);
      };
      $('[data-results]').append(retry);
    }
  }

  async function scanLoop(id){
    let lastKey='',confirmations=0,errorCount=0,ignoredKey='',ignoredUntil=0;
    while(current()&&stream&&scanner&&!paused&&id===token){
      try{
        if(video.readyState<2||!video.videoWidth||!video.videoHeight){
          await wait(280);
          continue;
        }
        const scale=Math.min(1,CAMERA_FRAME_MAX_WIDTH/video.videoWidth);
        frame.width=Math.max(1,Math.round(video.videoWidth*scale));
        frame.height=Math.max(1,Math.round(video.videoHeight*scale));
        frameCtx.drawImage(video,0,0,frame.width,frame.height);
        const output=await scanner.scan(frame);
        if(!current()||paused||id!==token)return;
        errorCount=0;
        const candidates=output.candidates.filter(item=>item.kind==='SKU'||item.kind==='GTIN');
        const key=candidates.map(item=>item.kind+':'+item.code).sort().join('|');
        if(key&&key===lastKey)confirmations++;
        else{lastKey=key;confirmations=key?1:0;}
        if(confirmations>=2&&!(key===ignoredKey&&Date.now()<ignoredUntil)){
          paused=true;
          notice('Código detectado. Validando no cadastro do WMS…');
          const result=await resolvePhotoCandidates(candidates,lookup,current,{truncated:output.truncated});
          if(!current()||id!==token)return;
          if(result.auto){
            notice('SKU '+result.auto.sku+' identificado. Abrindo consulta…');
            await choose(result.auto);
            return;
          }
          if(result.products.length||result.errors.length){
            showResults(result);
            notice(result.products.length?'Selecione o produto encontrado ou escaneie novamente.':'Falha na validação. Tente novamente.');
            return;
          }
          ignoredKey=key;
          ignoredUntil=Date.now()+4500;
          paused=false;
          lastKey='';
          confirmations=0;
          notice('Código lido, mas não vinculado a um SKU nesta unidade. Aponte outro código ou digite o SKU.');
        }
      }catch(error){
        if(!current()||id!==token)return;
        errorCount++;
        if(errorCount>=3){
          stopCamera();
          notice('Não foi possível iniciar o leitor neste navegador. Verifique a câmera ou consulte o SKU manualmente.');
          return;
        }
        notice('Ajuste a posição da câmera. Tentando ler novamente…');
      }
      await wait(350);
    }
  }

  async function startCamera(){
    if(!current())return;
    stopCamera();
    const id=token;
    $('[data-start]').disabled=true;
    $('[data-results]').replaceChildren();
    notice('Solicitando permissão para usar a câmera…');
    try{
      const media=context.mediaDevices??navigator.mediaDevices;
      if(!media?.getUserMedia)throw Error('Este navegador não oferece acesso à câmera. Use HTTPS e um navegador atualizado.');
      const next=await media.getUserMedia({
        audio:false,
        video:{facingMode:{ideal:face},width:{ideal:1280},height:{ideal:720}}
      });
      if(!current()||id!==token){
        next.getTracks().forEach(track=>track.stop());
        return;
      }
      stream=next;
      video.srcObject=stream;
      $('[data-view]').hidden=false;
      await video.play();
      if(!current()||id!==token)return;
      scanner=scannerFactory();
      $('[data-start]').hidden=true;
      $('[data-stop]').hidden=false;
      $('[data-switch]').hidden=false;
      notice('Leitor ativo. Aponte a câmera traseira para o código de barras.');
      void scanLoop(id);
    }catch(error){
      if(!current()||id!==token)return;
      stopCamera();
      const name=error.name||'';
      notice(name==='NotAllowedError'||name==='PermissionDeniedError'
        ?'Permissão da câmera negada. Autorize nas configurações do navegador ou digite o SKU.'
        :name==='NotFoundError'
          ?'Nenhuma câmera disponível. Digite o SKU para consultar.'
          :'Não foi possível iniciar a câmera: '+error.message);
    }finally{
      if(!closed)$('[data-start]').disabled=false;
    }
  }

  $('[data-start]').addEventListener('click',startCamera);
  $('[data-stop]').addEventListener('click',()=>{stopCamera();notice('Leitor interrompido. Toque em Iniciar leitura para continuar.');});
  $('[data-switch]').addEventListener('click',()=>{face=face==='environment'?'user':'environment';void startCamera();});
  $('[data-close]').addEventListener('click',close);
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('close',close);
  $('[data-manual-query]').addEventListener('click',async()=>{
    try{
      if(!current())return;
      const code=$('[data-manual]').value.trim();
      if(!/^\d{4,8}$/.test(code))throw Error('Informe um SKU de 4 a 8 dígitos, preservando zeros à esquerda.');
      notice('Validando SKU no estoque atual…');
      const rows=await lookup({code,kind:'SKU'});
      if(!current())return;
      if(rows.length===1){await choose(rows[0]);return;}
      paused=true;
      showResults({products:rows,unknown:rows.length?[]:[{code,kind:'SKU'}],errors:[]});
      notice(rows.length?'Selecione o SKU desejado.':'SKU não encontrado no catálogo desta unidade.');
    }catch(error){if(current())notice(error.message);}
  });
  $('[data-manual]').addEventListener('keydown',event=>{
    if(event.key==='Enter'){event.preventDefault();$('[data-manual-query]').click();}
  });
  timer=window.setInterval(()=>{if(!current())close();},350);
  dialog.showModal();
  return {close};
}
