import { escapeHtml as e } from './utils.js';
import { PHOTO_LIMITS, PHOTO_TYPES, CODE_TYPES, normalizeVisionResult, validationState, selectedExportRows, photoCsv, removePhotoDuplicates, editPhotoField } from './photo-codes-domain.js';
import './photo-codes.css';

export function mountPhotoCodes({root,client,user,warehouse,request=fetch}) {
  let photos=[],rows=[],busy=false,scope='',epoch=0,notice='',configured=null;
  const key=()=>`${user()?.id||''}:${warehouse()}`;
  const current=saved=>saved===epoch && scope===key() && Boolean(user());
  function reset(){epoch++;photos.forEach(p=>URL.revokeObjectURL(p.url));photos=[];rows=[];busy=false;notice='';configured=null;root.replaceChildren();}
  function render(){
    if(scope!==key()){reset();scope=key();}
    root.innerHTML=`<div class="panel photo-codes"><h2>Leitura por Foto</h2><p>Fotografe páginas de revistas ou catálogos. Confira cada código antes de usar. Nenhuma operação de estoque será criada.</p>
      ${configured!==true?`<p class="photo-service-warning">${configured===false?'Leitura automática indisponível: falta configurar o serviço de IA no servidor. Fotos, revisão e códigos manuais continuam disponíveis.':'Verificando disponibilidade da leitura automática…'}</p>`:''}
      <p role="status">${e(notice || 'As fotos serão enviadas ao serviço de visão somente ao iniciar o reconhecimento.')}</p>
      <fieldset ${busy?'disabled':''}><legend>Fotos da sessão</legend><div class="button-row"><label>Galeria · até 5 fotos<input data-gallery type="file" multiple accept="image/jpeg,image/png,image/webp"></label><label>Tirar foto<input data-camera type="file" accept="image/jpeg,image/png,image/webp" capture="environment"></label></div><small>JPG, PNG ou WEBP · até 12 MB por original. Fotos ficam apenas nesta sessão.</small>
      <div class="photo-previews">${photos.map(p=>`<article><button type="button" data-photo="${e(p.id)}" class="secondary-button"><img data-preview="${e(p.id)}" alt="Ampliar ${e(p.name)}"></button><small>${e(p.name)} · ${e(p.state)}</small><button type="button" data-remove-photo="${e(p.id)}" class="danger-button">Remover foto</button></article>`).join('')}</div>
      <div class="button-row"><button type="button" data-recognize ${configured!==true||!photos.some(p=>p.state==='Pendente')?'disabled':''}>${busy?'Lendo…':'Iniciar reconhecimento'}</button><button type="button" data-manual class="secondary-button">Adicionar código manualmente</button><button type="button" data-clear class="secondary-button">Limpar sessão</button></div>
      <h3>Códigos identificados</h3><p>${rows.length} ocorrência(s). Quantidade em branco até ser informada. Produto, refil e kit/combo são identificados separadamente.</p>
      <div class="button-row"><label><input data-all type="checkbox" ${rows.length&&rows.every(r=>r.selected)?'checked':''}> Selecionar todos</label><button type="button" data-dedupe class="secondary-button">Remover duplicados</button><button type="button" data-validate class="secondary-button">Conferir no cadastro atual</button></div>
      <div class="photo-results">${rows.map(r=>`<article class="photo-result"><div class="photo-result-head"><label><input data-select="${e(r.id)}" type="checkbox" ${r.selected?'checked':''}> ${e(r.sourceName)}${r.page?' · página '+e(r.page):''}</label><strong>${e({VALIDADO:'Validado',NAO_ENCONTRADO:'Não encontrado',REVISAR:'Revisar'}[r.status])}</strong></div>
      <div class="photo-fields"><label>Código<input data-field="code" data-row="${e(r.id)}" inputmode="numeric" value="${e(r.code)}"></label><label>Descrição na imagem<input data-field="description" data-row="${e(r.id)}" value="${e(r.description)}"></label><label>Quantidade<input data-field="quantity" data-row="${e(r.id)}" type="number" min="1" step="1" value="${e(r.quantity)}"></label><label>Tipo<select data-field="kind" data-row="${e(r.id)}">${CODE_TYPES.map(k=>`<option ${r.kind===k?'selected':''}>${k}</option>`).join('')}</select></label></div>
      <p>${e(r.variant)}${r.reason?' · '+e(r.reason):''}</p><p>Cadastro WMS: ${e(r.catalogDescription||'Ainda não validado / não localizado')}</p><div class="button-row">${r.photoId?`<button type="button" data-region="${e(r.id)}" class="secondary-button">Ampliar região / original</button>`:''}<button type="button" data-reviewed="${e(r.id)}" class="secondary-button">Confirmei a leitura</button><button type="button" data-delete="${e(r.id)}" class="danger-button">Excluir item</button></div></article>`).join('')||'<p>Nenhum código nesta sessão.</p>'}</div>
      <label><input data-codes-only type="checkbox"> Exportar somente códigos</label><div class="button-row"><button type="button" data-copy class="secondary-button">Copiar códigos</button><button type="button" data-csv class="secondary-button">Exportar CSV</button><button type="button" data-excel class="secondary-button">Exportar Excel</button></div></fieldset></div>`;
    // Assign only session-owned object URLs as DOM properties after sanitization.
    // Never broaden the global sanitizer's allowed protocols for image previews.
    root.querySelectorAll('[data-preview]').forEach(image=>{const photo=photos.find(p=>p.id===image.dataset.preview);if(photo)image.src=photo.url;});
  }
  async function credentials(){const s=await client().auth.getSession();if(s.error||!s.data?.session)throw new Error('Entre novamente no WMS.');return {Authorization:`Bearer ${s.data.session.access_token}`};}
  async function checkConfiguration(){const saved=epoch;try{const res=await request('/api/photo-codes',{headers:await credentials()});const data=await res.json();if(!current(saved))return;configured=res.ok&&data.configured===true;if(!res.ok)notice=data.error||'Leitura indisponível.';render();}catch{if(current(saved)){notice='Não foi possível consultar o serviço de leitura. Códigos manuais continuam disponíveis.';render();}}}
  async function addFiles(files){
    const saved=epoch;busy=true;render();
    try{for(const file of files){
      if(photos.length>=PHOTO_LIMITS.files)throw new Error('Máximo de 5 fotos por sessão.');
      if(!PHOTO_TYPES.includes(file.type)||!file.size||file.size>PHOTO_LIMITS.sourceBytes)throw new Error('Formato inválido ou foto maior que 12 MB.');
      const buffer=await file.arrayBuffer(); const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),n=>n.toString(16).padStart(2,'0')).join('');
      if(!current(saved))return;
      if(photos.some(p=>p.hash===hash)){notice='Foto repetida: mantida somente a primeira cópia.';continue;}
      const url=URL.createObjectURL(file);photos.push({id:crypto.randomUUID(),name:file.name,hash,url,file,state:'Pendente'});
    }}catch(error){notice=error.message;}finally{if(current(saved)){busy=false;render();}}
  }
  async function optimize(photo){
    const image=new window.Image();image.src=photo.url;await image.decode();
    if(image.naturalWidth*image.naturalHeight>50000000)throw new Error('Foto muito grande. Envie uma página por imagem.');
    const scale=Math.min(1,2800/Math.max(image.naturalWidth,image.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    const result=canvas.toDataURL('image/jpeg',0.94);if(result.length>PHOTO_LIMITS.encodedBytes)throw new Error('Foto detalhada demais para uma leitura. Fotografe uma região menor, preservando os códigos.');return result;
  }
  async function validate(target=rows){
    const saved=epoch;const codes=[...new Set(target.map(r=>r.code))];const cache=new Map();
    for(const code of codes){
      if(!/^\d{1,14}$/.test(code)){cache.set(code,{found:false});continue;}
      try{let result;if(user()?.role==='CAIXA'){
        if(!/^\d{4,8}$/.test(code)){cache.set(code,{failed:true});continue;}
        const response=await client().rpc('lookup_wms_caixa_item',{code:warehouse(),product_code:code});if(response.error)throw response.error;result={found:response.data?.found,name:response.data?.name};
      }else{const response=await client().from('wms_products').select('sku,product_name').eq('sku',code).maybeSingle();if(response.error)throw response.error;result={found:!!response.data,name:response.data?.product_name};}
      if(!current(saved))return;cache.set(code,result);}catch{cache.set(code,{failed:true});}
    }
    if(!current(saved))return;
    target.forEach(r=>{const found=cache.get(r.code);r.catalogDescription=found?.name||'';r.status=found?.failed?'REVISAR':validationState(r,found?.found);if(found?.failed)r.reason='Não foi possível conferir este código no cadastro. Tente novamente.';});
  }
  async function recognize(){
    if(busy)return;
    if(configured!==true){notice='Leitura automática indisponível. Aguarde a configuração do serviço de IA.';render();return;}
    const saved=epoch;busy=true;notice='Reconhecimento em andamento…';render();
    try{for(const photo of photos.filter(p=>p.state==='Pendente')){
      photo.state='Lendo';const image=await optimize(photo);if(!current(saved))return;
      const response=await request('/api/photo-codes',{method:'POST',headers:{...await credentials(),'Content-Type':'application/json'},body:JSON.stringify({image})});const data=await response.json();if(!current(saved))return;if(!response.ok){photo.state='Pendente';throw new Error(data.error||'Falha na leitura.');}
      const result=normalizeVisionResult(data);const added=result.items.map(r=>({...r,id:crypto.randomUUID(),photoId:photo.id,sourceName:photo.name,page:result.page}));rows.push(...added);photo.state='Processada';await validate(added);if(!current(saved))return;notice=result.warning||(!added.length?'Nenhum código legível encontrado nesta foto.':'Leitura concluída. Revise os resultados e informe as quantidades.');
    }}catch(error){if(current(saved)){photos.filter(p=>p.state==='Lendo').forEach(p=>p.state='Pendente');notice=error.message;}}finally{if(current(saved)){busy=false;render();}}
  }
  function zoom(photo,bbox){
    const dialog=document.createElement('dialog');dialog.className='photo-zoom';const close=document.createElement('button');close.textContent='Fechar';close.type='button';close.onclick=()=>dialog.close();const title=document.createElement('p');title.textContent=photo.name+' · use a rolagem e o zoom do navegador para ampliar';const original=document.createElement('img');original.src=photo.url;original.alt=photo.name;dialog.append(close,title);
    if(bbox){const crop=document.createElement('canvas');const image=new window.Image();image.onload=()=>{const [x,y,w,h]=bbox;crop.width=Math.round(image.width*w);crop.height=Math.round(image.height*h);crop.getContext('2d').drawImage(image,image.width*x,image.height*y,image.width*w,image.height*h,0,0,crop.width,crop.height);};image.src=photo.url;dialog.append(crop);}
    dialog.append(original);dialog.addEventListener('close',()=>dialog.remove(),{once:true});root.append(dialog);dialog.showModal();
  }
  const download=(blob,name)=>{const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  function syncField(el){const row=rows.find(r=>r.id===el.dataset.row);if(row)editPhotoField(row,el.dataset.field,el.value);}
  root.addEventListener('input',event=>{if(!busy&&event.target.dataset.field)syncField(event.target);});
  root.addEventListener('change',async event=>{
    if(busy)return;const el=event.target;
    if(el.matches('[data-gallery],[data-camera]'))return addFiles([...el.files]);
    if(el.matches('[data-all]')){rows.forEach(r=>r.selected=el.checked);render();}
    if(el.dataset.select){const r=rows.find(r=>r.id===el.dataset.select);if(r)r.selected=el.checked;}
    if(el.dataset.field)syncField(el);
  });
  root.addEventListener('click',async event=>{
    const el=event.target.closest('button');if(!el||busy)return;
    root.querySelectorAll('[data-field]').forEach(syncField);
    try{
      if(el.hasAttribute('data-recognize'))return recognize();
      if(el.hasAttribute('data-manual')){if(rows.length>=750)throw new Error('Limite de itens atingido.');rows.push({id:crypto.randomUUID(),code:'',description:'',quantity:'',kind:'INDEFINIDO',review:true,status:'REVISAR',sourceName:'Manual',selected:true});}
      if(el.hasAttribute('data-clear')){if(window.confirm('Limpar fotos e resultados desta sessão?'))reset();else return;}
      if(el.dataset.removePhoto){const p=photos.find(p=>p.id===el.dataset.removePhoto);URL.revokeObjectURL(p.url);photos=photos.filter(x=>x!==p);rows=rows.filter(r=>r.photoId!==p.id);}
      if(el.dataset.delete)rows=rows.filter(r=>r.id!==el.dataset.delete);
      if(el.hasAttribute('data-dedupe')){if(window.confirm('Remover repetições do mesmo código e tipo, mantendo a primeira ocorrência e sua quantidade? As quantidades não serão somadas.'))rows=removePhotoDuplicates(rows);}
      if(el.dataset.photo){zoom(photos.find(p=>p.id===el.dataset.photo));return;}
      if(el.dataset.region){const r=rows.find(r=>r.id===el.dataset.region);zoom(photos.find(p=>p.id===r.photoId),r.bbox);return;}
      if(el.dataset.reviewed){const r=rows.find(r=>r.id===el.dataset.reviewed);r.review=r.kind==='INDEFINIDO';await validate([r]);}
      if(el.hasAttribute('data-validate')){busy=true;render();await validate();busy=false;}
      const only=root.querySelector('[data-codes-only]')?.checked;
      if(el.hasAttribute('data-copy')){await navigator.clipboard.writeText(selectedExportRows(rows).map(r=>r.code).join('\n'));notice='Códigos copiados.';render();return;}
      if(el.hasAttribute('data-csv'))download(new Blob([photoCsv(rows,only)],{type:'text/csv;charset=utf-8'}),'codigos-foto.csv');
      if(el.hasAttribute('data-excel')){if(!window.XLSX)throw new Error('Exportador Excel indisponível. Use CSV.');const selected=selectedExportRows(rows);const sheet=window.XLSX.utils.aoa_to_sheet([only?['CODIGO']:['CODIGO','QUANTIDADE'],...selected.map(r=>only?[r.code]:[r.code,r.quantity])]);selected.forEach((r,i)=>{sheet['A'+(i+2)]={t:'s',v:r.code,z:'@'};});const book=window.XLSX.utils.book_new();window.XLSX.utils.book_append_sheet(book,sheet,'Códigos');window.XLSX.writeFile(book,'codigos-foto.xlsx');}
      render();
    }catch(error){notice=error.message;busy=false;render();}
  });
  return {render(){render();if(configured===null)checkConfiguration();},reset};
}
