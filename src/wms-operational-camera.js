import { createSkuLiveBarcodeScanner } from './sku-live-barcode.js';

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const MAX_FRAME=800;

/**
 * Physical barcode -> typed field, with the original screen retaining ownership
 * of every business action. No stock, movement, task or quantity writes occur here.
 */
export function pickOperationalBarcode(output,mode,normalizeLocation=()=>({valid:false})){
  const values=[...new Set((output?.barcodes||[]).map(code=>String(code||'').trim()).filter(Boolean))];
  if(mode==='address'){
    const addresses=[...new Set(values.map(value=>normalizeLocation(value)).filter(row=>row?.valid).map(row=>row.code))];
    return addresses.length===1?{code:addresses[0],kind:'ADDRESS'}:null;
  }
  if(mode==='raw'){
    const safe=values.filter(code=>code.length>=4&&code.length<=100&&/^[\x20-\x7e]+$/.test(code));
    return safe.length===1?{code:safe[0],kind:'RAW'}:null;
  }
  if(mode==='sku'){
    const codes=(output?.candidates||[]).filter(row=>['SKU','GTIN'].includes(row.kind)&&/^\d{4,14}$/.test(row.code));
    const unique=[...new Map(codes.map(row=>[row.code,row])).values()];
    return unique.length===1?{code:unique[0].code,kind:unique[0].kind}:null;
  }
  return null;
}

export async function resolveOperationalSku(candidate,lookup){
  if(candidate?.kind==='SKU')return candidate.code;
  if(candidate?.kind!=='GTIN')throw new Error('Código não identificado como SKU ou EAN válido.');
  const rows=await lookup(candidate.code);
  if(rows.length!==1||!/^\d{4,8}$/.test(String(rows[0]?.sku||''))){
    throw new Error(rows.length===0
      ?'EAN sem SKU correspondente nesta unidade. Consulte ou vincule o produto na Consulta de SKU.'
      :'EAN associado a mais de um SKU. Confirme o produto na Consulta de SKU.');
  }
  return String(rows[0].sku);
}

/**
 * mode: sku = verified SKU / EAN converted by authenticated WMS RPC;
 *       address = existing CODE128 location label;
 *       raw = exact printed barcode for XML receipt matching.
 * onRead must never silently submit a stock mutation.
 */
export function openOperationalBarcodeCamera(context,{scannerFactory=createSkuLiveBarcodeScanner}={}){
  const actor=context.user()?.id,warehouse=context.warehouse(),mode=context.mode||'sku';
  let closed=false,stream=null,scanner=null,face='environment',generation=0,watchdog=null;
  const current=()=>!closed&&actor===context.user()?.id&&warehouse===context.warehouse()&&context.canUse();
  const dialog=document.createElement('dialog');
  dialog.className='sku-photo-dialog';
  dialog.setAttribute('aria-label','Leitura por câmera - operação WMS');
  dialog.innerHTML=[
    '<header><h3>Leitura por câmera</h3><button type="button" class="secondary-button" data-close>Fechar</button></header>',
    '<p>Aponte a câmera para o código. A leitura não altera o estoque nem confirma quantidades.</p>',
    '<p data-status role="status" aria-live="polite">Abrindo câmera…</p>',
    '<div class="button-row sku-scanner-buttons">',
    '<button type="button" class="primary-button" data-start>Reiniciar leitura</button>',
    '<button type="button" class="secondary-button" data-switch hidden>Alternar câmera</button>',
    '<button type="button" class="secondary-button" data-stop hidden>Parar câmera</button>',
    '</div>',
    '<div class="sku-scanner-view" data-view hidden><video data-video autoplay playsinline muted aria-label="Câmera de bipagem"></video>',
    '<span class="sku-scanner-guide" aria-hidden="true"></span>',
    '<span class="sku-scanner-hint">Centralize o código e mantenha o celular firme</span></div>'
  ].join('');
  document.body.append(dialog);
  const $=selector=>dialog.querySelector(selector);
  const video=$('[data-video]'),canvas=document.createElement('canvas');
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const notice=message=>{$('[data-status]').textContent=message;};
  function stopCamera(){
    generation++;
    scanner?.close();scanner=null;
    stream?.getTracks().forEach(track=>track.stop());stream=null;
    video.pause();video.srcObject=null;
    $('[data-view]').hidden=true;
    $('[data-start]').hidden=false;
    $('[data-stop]').hidden=true;
    $('[data-switch]').hidden=true;
    canvas.width=canvas.height=1;
  }
  function close(){
    if(closed)return;
    closed=true;stopCamera();
    if(watchdog!==null)window.clearInterval(watchdog);
    if(dialog.open)dialog.close();
    dialog.remove();
    context.closed?.();
  }
  async function lookupGtin(code){
    const response=await context.client().rpc('lookup_wms_sku_photo',{
      p_warehouse:warehouse,p_code:code,p_kind:'GTIN'
    });
    if(!current())throw new Error('Sessão ou unidade alterada durante a consulta.');
    if(response.error)throw response.error;
    return response.data||[];
  }
  async function scanLoop(id){
    let errorCount=0,previousInvalid='';
    while(current()&&id===generation&&stream&&scanner){
      try{
        if(video.readyState<2||!video.videoWidth||!video.videoHeight){await wait(130);continue;}
        const ratio=Math.min(1,MAX_FRAME/Math.max(video.videoWidth,video.videoHeight));
        canvas.width=Math.max(1,Math.round(video.videoWidth*ratio));
        canvas.height=Math.max(1,Math.round(video.videoHeight*ratio));
        ctx.drawImage(video,0,0,canvas.width,canvas.height);
        const output=await scanner.scan(canvas);
        if(!current()||id!==generation)return;
        errorCount=0;
        const candidate=pickOperationalBarcode(output,mode,context.normalizeLocation);
        if(candidate){
          let code=candidate.code;
          if(mode==='sku'){
            try{
              notice('Código identificado. Conferindo o SKU…');
              code=await resolveOperationalSku(candidate,lookupGtin);
            }catch(error){
              if(!current()||id!==generation)return;
              notice(error.message);await wait(400);continue;
            }
          }
          if(!current()||id!==generation)return;
          // One physical scan only; user must explicitly confirm any existing action.
          close();
          try{await context.onRead(code,candidate);}catch(error){context.error?.(error);}
          return;
        }
        const first=output?.barcodes?.[0]||'';
        if(first&&first!==previousInvalid){
          previousInvalid=first;
          notice('Código não corresponde a este campo. Centralize um código válido.');
        }else if(!first&&previousInvalid){
          previousInvalid='';
          notice('Procurando código de barras…');
        }
      }catch(error){
        if(!current()||id!==generation)return;
        if(++errorCount>=3){stopCamera();notice('Câmera indisponível. Utilize o leitor físico ou digite o código.');return;}
        notice('Ajuste a distância e a iluminação. Tentando novamente…');
      }
      await wait(100);
    }
  }
  async function startCamera(){
    if(!current())return;
    stopCamera();
    const id=generation;
    $('[data-start]').disabled=true;
    notice('Solicitando câmera…');
    try{
      const media=context.mediaDevices??navigator.mediaDevices;
      if(!media?.getUserMedia)throw new Error('Câmera não disponível neste navegador.');
      const next=await media.getUserMedia({audio:false,video:{
        facingMode:{ideal:face},width:{ideal:1280},height:{ideal:720}
      }});
      if(!current()||id!==generation){next.getTracks().forEach(track=>track.stop());return;}
      stream=next;
      try{
        const track=stream.getVideoTracks()[0],caps=track?.getCapabilities?.();
        if(caps?.focusMode?.includes('continuous')){
          void track.applyConstraints({advanced:[{focusMode:'continuous'}]}).catch(()=>{});
        }
      }catch{/* Optional browser capability. */}
      video.srcObject=stream;$('[data-view]').hidden=false;
      await video.play();
      if(!current()||id!==generation)return;
      scanner=scannerFactory();
      $('[data-start]').hidden=true;$('[data-stop]').hidden=false;$('[data-switch]').hidden=false;
      notice('Câmera ativa. Aponte para o código.');
      void scanLoop(id);
    }catch(error){
      if(!current()||id!==generation)return;
      stopCamera();
      notice(['NotAllowedError','PermissionDeniedError'].includes(error.name)
        ?'Permissão negada. Autorize a câmera no navegador ou digite o código.'
        :error.name==='NotFoundError'
          ?'Câmera não encontrada. Digite o código.'
          :'Não foi possível abrir a câmera: '+error.message);
    }finally{if(!closed)$('[data-start]').disabled=false;}
  }
  $('[data-close]').addEventListener('click',close);
  $('[data-start]').addEventListener('click',startCamera);
  $('[data-stop]').addEventListener('click',()=>{
    stopCamera();notice('Leitura interrompida. Use Reiniciar leitura.');
  });
  $('[data-switch]').addEventListener('click',()=>{
    face=face==='environment'?'user':'environment';void startCamera();
  });
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('close',close);
  watchdog=window.setInterval(()=>{if(!current())close();},400);
  dialog.showModal();
  // Camera permission is requested within the original user click.
  void startCamera();
  return {close};
}
