import {escapeHtml as e} from './utils.js';
import {createSkuPhotoEngine,resizedPhotoCanvas} from './sku-photo-engine.js';
import {validatePhotoFile,resolvePhotoCandidates} from './sku-photo-domain.js';
import './sku-photo-lookup.css';

export function openSkuPhotoLookup(context,{engineFactory=createSkuPhotoEngine}={}){
 const actor=context.user()?.id,warehouse=context.warehouse();let closed=false,stream=null,image=null,engine=null,busy=false,generation=0,crop=null,start=null;
 const current=()=>!closed&&actor===context.user()?.id&&warehouse===context.warehouse()&&context.canUse();
 const dialog=document.createElement('dialog');dialog.className='sku-photo-dialog';dialog.setAttribute('aria-label','Ler código para Consulta de SKU');
 dialog.innerHTML=`<header><h3>Ler código da etiqueta</h3><button type="button" class="secondary-button" data-close>Fechar</button></header>
 <p>A foto fica somente nesta sessão e será descartada após a consulta. Fotografe o código, não apenas a embalagem.</p>
 <p role="status" aria-live="polite" data-status>Escolha a câmera ou uma imagem da galeria.</p>
 <div class="button-row"><button type="button" class="primary-button" data-camera>Abrir câmera</button>
 <label class="secondary-button">Fotografar no celular<input data-capture type="file" accept="image/jpeg,image/png,image/webp" capture="environment"></label>
 <label class="secondary-button">Escolher da galeria<input data-gallery type="file" accept="image/jpeg,image/png,image/webp"></label></div>
 <video data-video autoplay playsinline muted hidden></video><button type="button" class="primary-button" data-shot hidden>Fotografar etiqueta</button>
 <section data-preview hidden><p>Arraste sobre a foto para selecionar a área do código. Use o zoom para ampliar.</p>
 <label>Zoom da prévia <input data-zoom type="range" min="100" max="250" value="100" step="25"></label>
 <div class="sku-photo-preview"><canvas data-canvas aria-label="Prévia da foto; arraste para recortar"></canvas></div>
 <div class="button-row"><button type="button" class="secondary-button" data-reset-crop>Usar foto inteira</button><button type="button" class="primary-button" data-read>Reconhecer código</button><button type="button" class="secondary-button" data-cancel hidden>Cancelar leitura</button></div></section>
 <div data-results></div><fieldset><legend>Correção manual</legend><label>SKU impresso<input data-manual inputmode="numeric" maxlength="8" autocomplete="off"></label><button type="button" class="secondary-button" data-manual-query>Validar e consultar SKU</button></fieldset>`;
 document.body.append(dialog);const $=selector=>dialog.querySelector(selector),canvas=$('[data-canvas]');
 function notice(text){$('[data-status]').textContent=text;}
 function stopCamera(){if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;$('[data-video]').srcObject=null;$('[data-video]').hidden=true;$('[data-shot]').hidden=true;}
 function draw(){if(!image)return;canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);if(crop){ctx.strokeStyle='#0664f9';ctx.lineWidth=Math.max(3,image.width/250);ctx.strokeRect(crop.x,crop.y,crop.w,crop.h);}}
 async function cancelRead(){generation++;const old=engine;engine=null;busy=false;$('[data-cancel]').hidden=true;$('[data-read]').disabled=false;if(old)await old.close();}
 function discardImage(){if(image)image.width=image.height=1;image=null;crop=null;canvas.width=canvas.height=1;$('[data-gallery]').value='';$('[data-capture]').value='';$('[data-preview]').hidden=true;}
 function close(){if(closed)return;closed=true;generation++;stopCamera();const old=engine;engine=null;if(old)old.close().catch(()=>{});discardImage();window.clearInterval(timer);if(dialog.open)dialog.close();dialog.remove();context.closed?.();}
 async function useImage(source){await cancelRead();if(!current())return;discardImage();image=resizedPhotoCanvas(source);draw();$('[data-preview]').hidden=false;$('[data-results]').replaceChildren();$('[data-zoom]').value='100';canvas.style.width='100%';notice('Foto pronta. Confira ou recorte a área do código e inicie a leitura.');}
 async function fromFile(file){if(!file)return;const token=++generation;try{validatePhotoFile(file);stopCamera();const url=URL.createObjectURL(file);const preview=new window.Image();try{preview.src=url;await preview.decode();if(!current()||token!==generation)return;await useImage(preview);}finally{URL.revokeObjectURL(url);preview.src='';}}catch(error){if(current())notice(error.message);}}
 async function camera(){if(busy)await cancelRead();const token=++generation;stopCamera();notice('Aguardando sua permissão para usar a câmera…');
  try{const media=context.mediaDevices??navigator.mediaDevices;if(!media?.getUserMedia)throw Error('Câmera não disponível neste navegador. Use Fotografar no celular ou a galeria.');
   const next=await media.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
   if(!current()||token!==generation){next.getTracks().forEach(t=>t.stop());return;}
   stream=next;$('[data-video]').srcObject=stream;$('[data-video]').hidden=false;$('[data-shot]').hidden=false;await $('[data-video]').play();notice('Enquadre a etiqueta e clique em Fotografar etiqueta.');
  }catch(error){if(token!==generation)return;stopCamera();if(current())notice(error.name==='NotAllowedError'?'Permissão da câmera não concedida. Você pode escolher uma foto da galeria ou digitar o SKU.':error.message);}
 }
 async function lookup(candidate){const result=await context.client().rpc('lookup_wms_sku_photo',{p_warehouse:warehouse,p_code:candidate.code,p_kind:candidate.kind});if(result.error)throw result.error;return result.data||[];}
 async function choose(product){if(!current())return close();const sku=product.sku;close();await context.onSku(sku);}
 function showResult(result){
  const products=result.products;
  $('[data-results]').innerHTML=`${products.length?`<h4>${products.length>1?'Mais de um SKU válido. Escolha o produto:':'SKU identificado'}</h4>${products.map((p,i)=>`<article><strong>${e(p.sku)}</strong><span>${e(p.product_name)}</span><button type="button" class="primary-button" data-product="${i}">Consultar SKU ${e(p.sku)}</button></article>`).join('')}`:'<p>Nenhum SKU confiável identificado. Fotografe novamente, recorte a etiqueta ou digite o código.</p>'}
   ${result.unknown.length?`<p>Códigos sem correspondência confirmada: ${result.unknown.map(c=>e(c.code)+(c.kind==='GTIN'?' (EAN/GTIN sem vínculo confirmado no estoque ativo)':' (não encontrado ou inválido)')).join('; ')}.</p>`:''}
   ${result.errors.length?'<p>Não foi possível validar todos os códigos. Tente novamente; a consulta automática foi bloqueada.</p>':''}
   ${result.truncated?'<p>Muitos números na foto. Recorte a área do SKU antes de continuar.</p>':''}`;
  $('[data-results]').querySelectorAll('[data-product]').forEach(button=>button.onclick=()=>choose(products[Number(button.dataset.product)]).catch(error=>context.error?.(error)));
 }
 async function recognize(){if(!image||busy||!current())return;stopCamera();busy=true;const token=++generation;$('[data-read]').disabled=true;$('[data-cancel]').hidden=false;$('[data-results]').replaceChildren();
  const input=document.createElement('canvas');const area=crop||{x:0,y:0,w:image.width,h:image.height};input.width=area.w;input.height=area.h;input.getContext('2d').drawImage(image,area.x,area.y,area.w,area.h,0,0,area.w,area.h);
  const valid=()=>current()&&token===generation;
  try{engine=engineFactory({progress:text=>{if(valid())notice(text);}});const extracted=await engine.read(input);if(!valid())return;
   notice('Conferindo os códigos no catálogo do WMS…');const result=await resolvePhotoCandidates(extracted.candidates,lookup,valid,{truncated:extracted.truncated});if(!valid())return;
   showResult(result);if(result.auto){notice(`SKU ${result.auto.sku} identificado. Consultando…`);await choose(result.auto);}else notice(result.products.length>1?'Escolha qual SKU deseja consultar.':'Confira a foto ou corrija o SKU manualmente.');
  }catch(error){if(valid())notice(error.message);}finally{input.width=input.height=1;if(token===generation){const old=engine;engine=null;if(old)await old.close();busy=false;if(!closed){$('[data-read]').disabled=false;$('[data-cancel]').hidden=true;}}}
 }
 const point=event=>{const box=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(canvas.width,(event.clientX-box.left)*canvas.width/box.width)),y:Math.max(0,Math.min(canvas.height,(event.clientY-box.top)*canvas.height/box.height))};};
 canvas.addEventListener('pointerdown',event=>{if(busy||!image)return;start=point(event);canvas.setPointerCapture(event.pointerId);});
 canvas.addEventListener('pointermove',event=>{if(!start||busy)return;const p=point(event);crop={x:Math.round(Math.min(start.x,p.x)),y:Math.round(Math.min(start.y,p.y)),w:Math.round(Math.abs(p.x-start.x)),h:Math.round(Math.abs(p.y-start.y))};draw();});
 canvas.addEventListener('pointerup',()=>{start=null;if(crop&&(crop.w<25||crop.h<25))crop=null;draw();});
 $('[data-reset-crop]').onclick=()=>{if(!busy){crop=null;draw();}};$('[data-zoom]').oninput=event=>{canvas.style.width=event.target.value+'%';};
 $('[data-close]').onclick=close;dialog.addEventListener('cancel',close);dialog.addEventListener('close',close);
 $('[data-camera]').onclick=camera;$('[data-shot]').onclick=async()=>{try{const video=$('[data-video]');if(!video.videoWidth)throw Error('Aguarde a imagem da câmera.');const shot=document.createElement('canvas');shot.width=video.videoWidth;shot.height=video.videoHeight;shot.getContext('2d').drawImage(video,0,0);stopCamera();await useImage(shot);shot.width=shot.height=1;}catch(error){notice(error.message);}};
 $('[data-gallery]').onchange=event=>fromFile(event.target.files[0]);$('[data-capture]').onchange=event=>fromFile(event.target.files[0]);$('[data-read]').onclick=recognize;
 $('[data-cancel]').onclick=()=>cancelRead().then(()=>notice('Leitura cancelada. A foto pode ser refeita ou descartada ao fechar.'));
 $('[data-manual-query]').onclick=async()=>{try{if(busy||!current())return;const code=$('[data-manual]').value.trim();if(!/^\d{4,8}$/.test(code))throw Error('Informe o SKU impresso, com 4 a 8 dígitos.');const rows=await lookup({code,kind:'SKU'});if(!current())return;if(rows.length===1)await choose(rows[0]);else{showResult({products:rows,unknown:rows.length?[]:[{code,kind:'SKU'}],errors:[]});notice(rows.length?'Escolha o produto.':'SKU não encontrado no catálogo.');}}catch(error){notice(error.message);}};
 const timer=window.setInterval(()=>{if(!current())close();},350);dialog.showModal();return {close};
}
