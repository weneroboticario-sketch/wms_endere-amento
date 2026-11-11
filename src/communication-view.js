import {escapeHtml as e} from './utils.js';
import {mergeCommunicationMessages} from './communication-api.js';
import {prepareCommunicationImage,setCommunicationPush} from './communication-media.js';
import './communication.css';

const time=value=>value?new Date(value).toLocaleString('pt-BR'):'';
const leader=user=>['ADMINISTRADOR','SUPERVISOR'].includes(user?.role);
const button=(text,attr='',primary=false)=>'<button type="button" class="'+(primary?'primary-button':'secondary-button')+'" '+attr+'>'+text+'</button>';
export function mountCommunication({root,api,actor,warehouse,getUser,current,onOpenProcess,onPreferences}){
 const states=new Map(),dialogs=new Set(),delivered=new Set(),read=new Set();
 let conversations=[],selected=null,detail=null,active=false,dead=false,filter='ALL',search='',hasMore=false,requests=[],requestsOpen=false,seq=0;
 root.classList.add('comm');
 root.innerHTML='<header class="comm-header"><div><p class="eyebrow">'+e(warehouse)+'</p><h2>Comunicação</h2><p data-connection>Sincronizando…</p></div><div class="button-row">'+
 button('Nova conversa','data-new="DIRECT"',true)+(leader(getUser())?button('Novo grupo','data-new="GROUP"')+button('Novo comunicado','data-new="ANNOUNCEMENT"'):'')+
 button('Solicitações','data-requests')+button('Preferências','data-preferences')+button('Atualizar','data-refresh')+'</div></header>'+
 '<p data-status role="status" aria-live="polite"></p><section data-request-panel hidden></section>'+
 '<div class="comm-layout"><aside class="comm-sidebar"><label>Pesquisar conversa<input type="search" data-search placeholder="Pesquisar colaborador ou conversa"></label>'+
 '<div class="comm-tabs">'+[['ALL','Todas'],['DIRECT','Individuais'],['GROUP','Grupos'],['PENDING','Pendentes']].map(([key,text])=>button(text,'data-filter="'+key+'"')).join('')+'</div>'+
 '<div data-conversations></div>'+button('Conversas anteriores','data-more-conversations')+'</aside>'+
 '<section class="comm-thread" data-thread><p>Escolha uma conversa ou inicie um atendimento.</p></section></div>';
 const $=selector=>root.querySelector(selector),notice=text=>{if(!dead)$('[data-status]').textContent=text;};
 const state=id=>{if(!states.has(id))states.set(id,{messages:[],draft:'',urgent:false,reply:null,images:[],metadata:{},share:null,pending:null,hasEarlier:false});return states.get(id);};
 const live=()=>!dead&&current();
 const fail=error=>{if(live())notice(/could not find.*wms_chat_api|schema cache/i.test(error.message||'')?'Comunicação ainda não habilitada neste ambiente. Aplique as migrations e configure o serviço.':error.message||String(error));};
 function modal(title,body,submit,label='Confirmar'){
  const dialog=document.createElement('dialog');dialog.className='comm-modal';
  dialog.innerHTML='<form><header><h3>'+e(title)+'</h3>'+button('Fechar','data-close')+'</header>'+body+'<p data-error role="status"></p>'+
   (submit?'<button type="submit" class="primary-button">'+e(label)+'</button>':'')+'</form>';
  let busy=false;const close=()=>{dialogs.delete(dialog);dialog.close();dialog.remove();};
  dialog.querySelector('[data-close]').onclick=close;dialog.addEventListener('cancel',close);
  dialog.querySelector('form').onsubmit=async event=>{
   event.preventDefault();if(busy||!live()||!submit)return;
   busy=true;const action=dialog.querySelector('[type=submit]');action.disabled=true;
   try{await submit(dialog,close);}catch(error){if(dialog.isConnected)dialog.querySelector('[data-error]').textContent=error.message;}
   finally{busy=false;if(action.isConnected)action.disabled=false;}
  };
  document.body.append(dialog);dialogs.add(dialog);dialog.showModal();return dialog;
 }
 async function loadConversations(append=false){
  const cursor=append&&conversations.at(-1),data=cursor?{before_at:cursor.updated_at,before_id:cursor.id,search}:{search};
  const rows=await api.rpc('LIST',data);if(!live())return;
  conversations=append?[...conversations,...rows.filter(row=>!conversations.some(old=>old.id===row.id))]:rows;hasMore=rows.length===50;
  drawConversations();
  if(selected&&!conversations.some(c=>c.id===selected)&&!append){
   try{await api.rpc('DETAIL',{conversation_id:selected});}catch{for(const image of state(selected).images)URL.revokeObjectURL(image.preview);states.delete(selected);selected=null;detail=null;$('[data-thread]').textContent='Acesso à conversa encerrado.';root.classList.remove('comm-chat-open');}
  }
 }
 function drawConversations(){
  const rows=conversations.filter(c=>filter==='ALL'||filter==='DIRECT'&&c.type==='DIRECT'||filter==='GROUP'&&c.type!=='DIRECT'||filter==='PENDING'&&c.pending_ack);
  $('[data-conversations]').innerHTML=rows.length?rows.map(c=>'<button type="button" class="comm-conversation '+(selected===c.id?'selected':'')+'" data-open="'+e(c.id)+'">'+
   '<strong>'+e(c.display_name||c.title)+(c.unread?'<span class="comm-count">'+e(c.unread)+'</span>':'')+'</strong><span>'+e(c.preview||c.description)+'</span><small>'+time(c.updated_at)+(c.pending_ack?' · Ciência pendente':'')+(c.archived_at?' · Arquivada':'')+'</small></button>').join(''):'<p>Nenhuma conversa neste filtro.</p>';
  $('[data-more-conversations]').hidden=!hasMore;
  $('[data-conversations]').querySelectorAll('[data-open]').forEach(node=>node.onclick=()=>void openConversation(node.dataset.open).catch(fail));
  root.querySelectorAll('[data-filter]').forEach(node=>node.classList.toggle('active',node.dataset.filter===filter));
 }
 function rememberDraft(){if(selected&&$('[data-body]')){state(selected).draft=$('[data-body]').value;state(selected).urgent=$('[data-urgent]').checked;}}
 async function presence(value){
  if(!selected||!live())return;
  await api.rpc('PRESENCE',{conversation_id:selected,active:value}).catch(()=>{});
 }
 async function openConversation(id){
  rememberDraft();await presence(false);selected=id;const version=++seq;
  const [info,rows]=await Promise.all([api.rpc('DETAIL',{conversation_id:id}),api.rpc('MESSAGES',{conversation_id:id})]);
  if(!live()||selected!==id||version!==seq)return;
  detail=info;const s=state(id);s.messages=mergeCommunicationMessages(s.messages,rows);s.hasEarlier=rows.length===40;
  root.classList.add('comm-chat-open');
  $('[data-thread]').innerHTML='<header class="comm-thread-header">'+button('Voltar','data-back')+'<div><h3>'+e(conversations.find(c=>c.id===id)?.display_name||info.title)+'</h3><small>'+e(info.description)+'</small></div>'+
   button('Silenciar','data-mute')+(leader(getUser())&&info.type!=='DIRECT'&&info.members.some(p=>p.id===actor&&!p.left_at&&p.role==='MANAGER')?button('Gerenciar grupo','data-manage'):'')+'</header>'+
   button('Mensagens anteriores','data-earlier')+'<div class="comm-messages" data-messages aria-label="Mensagens"></div>'+
   '<div class="comm-composer"><div data-context></div><div data-image-preview class="comm-image-preview"></div>'+
   '<label class="comm-body-label">Mensagem<textarea data-body maxlength="4000" placeholder="Escreva uma mensagem…"></textarea></label>'+
   '<div class="button-row"><label class="secondary-button">Anexar imagem<input data-images type="file" multiple accept="image/jpeg,image/png,image/webp"></label>'+
   '<label class="secondary-button">Fotografar evidência<input data-camera-image type="file" accept="image/jpeg,image/png,image/webp" capture="environment"></label>'+
   '<label><input data-urgent type="checkbox"> Urgente · pedir ciência</label><button type="button" class="primary-button" data-send>Enviar</button></div></div>';
  $('[data-body]').value=s.draft;$('[data-body]').oninput=()=>{s.draft=$('[data-body]').value;};
  $('[data-urgent]').checked=s.urgent;
  $('[data-send]').onclick=()=>void send().catch(fail);
  $('[data-back]').onclick=()=>{rememberDraft();root.classList.remove('comm-chat-open');void presence(false);};
  $('[data-mute]').onclick=()=>mute();
  if($('[data-manage]'))$('[data-manage]').onclick=()=>manageGroup();
  $('[data-earlier]').onclick=()=>void earlier().catch(fail);
  $('[data-images]').onchange=event=>void addImages(event.target.files).catch(fail);
  $('[data-camera-image]').onchange=event=>void addImages(event.target.files).catch(fail);
  $('[data-messages]').onscroll=()=>void markVisible();
  drawMessages(true);drawComposer();drawConversations();await acknowledgeDelivery(rows,id);await presence(active);
 }
 function drawComposer(){
  if(!selected||!$('[data-context]'))return;
  const s=state(selected),parts=[];
  if(s.reply)parts.push('Respondendo: '+s.reply.body);
  if(s.share)parts.push('Compartilhando: '+s.share.title);
  if(s.metadata.title)parts.push('Comunicado: '+s.metadata.title);
  $('[data-context]').textContent=parts.join(' · ');
  if(parts.length){const clear=document.createElement('button');clear.type='button';clear.className='secondary-button';clear.textContent='Remover contexto';clear.onclick=()=>{s.reply=null;s.metadata={};s.share=null;drawComposer();};$('[data-context]').append(clear);}
  $('[data-image-preview]').innerHTML=s.images.map((image,i)=>'<figure><img src="'+e(image.preview)+'" alt="Prévia da evidência"><figcaption>'+e(image.name)+'</figcaption>'+button('Remover','data-remove-image="'+i+'"')+'</figure>').join('');
  $('[data-image-preview]').querySelectorAll('[data-remove-image]').forEach(node=>node.onclick=()=>{const [image]=s.images.splice(Number(node.dataset.removeImage),1);URL.revokeObjectURL(image.preview);drawComposer();});
  if(s.pending){$('[data-send]').textContent=s.pending.sending?'Enviando…':'Tentar novamente';$('[data-send]').disabled=s.pending.sending;$('[data-body]').disabled=true;}
  else{$('[data-send]').textContent='Enviar';$('[data-send]').disabled=!!detail?.archived_at;$('[data-body]').disabled=!!detail?.archived_at;}
 }
 async function addImages(files){
  const id=selected;if(!id)return;
  const s=state(id);if(s.pending)throw Error('Conclua ou tente novamente o envio pendente antes de anexar.');
  for(const file of [...files]){if(s.images.length>=3)throw Error('Até 3 imagens por mensagem.');const image=await prepareCommunicationImage(file);if(!live()||selected!==id){URL.revokeObjectURL(image.preview);return;}s.images.push(image);}
  drawComposer();
 }
 function receiptLabel(message){
  const receipts=message.receipts||[],deliveredCount=receipts.filter(r=>r.delivered_at).length,readCount=receipts.filter(r=>r.read_at).length;
  const ackCount=receipts.filter(r=>r.acknowledged_at).length;
  const firstAck=receipts.filter(r=>r.acknowledged_at).map(r=>new Date(r.acknowledged_at).getTime()).sort((a,b)=>a-b)[0];
  const delay=firstAck?Math.max(0,Math.round((firstAck-new Date(message.created_at).getTime())/1000)):null;
  return 'Enviada'+(deliveredCount?' · Sincronizada: '+deliveredCount+'/'+receipts.length:'')+(readCount?' · Visualizada: '+readCount+'/'+receipts.length:'')+(message.requires_ack?' · Ciência: '+ackCount+'/'+receipts.length:'')+(delay!=null?' · Primeira ciência: '+delay+' s':'');
 }
 function drawMessages(bottom=false,prepend=false){
  if(!selected||!$('[data-messages]'))return;
  const s=state(selected),host=$('[data-messages]'),oldTop=host.scrollTop,oldHeight=host.scrollHeight,nearBottom=oldHeight-oldTop-host.clientHeight<80;
  host.innerHTML=s.messages.map(m=>'<article class="comm-bubble '+(m.sender_profile_id===actor?'mine':'')+' '+(m.priority==='URGENT'?'urgent':'')+'" data-message-id="'+e(m.id)+'">'+
   '<small>'+e(m.sender_name)+(m.priority==='URGENT'?' · URGENTE':'')+'</small>'+
   (m.title?'<h4>'+e(m.title)+'</h4>':'')+(m.reply?'<blockquote>'+e(m.reply.sender)+': '+e(m.reply.body)+'</blockquote>':'')+
   '<p>'+e(m.body)+'</p>'+(m.due_at?'<small>Prazo: '+time(m.due_at)+'</small>':'')+
   (m.process?'<div class="comm-process"><strong>'+e(m.process.context?.title||'Referência com acesso restrito')+'</strong><small>'+e([m.process.context?.origin,m.process.context?.destination,m.process.context?.status,m.process.context?.priority,m.process.context?.responsible,m.process.warehouse_code].filter(Boolean).join(' · '))+'</small>'+button('Abrir '+e(m.process.process_type),'data-process-message="'+e(m.id)+'"')+'</div>':'')+
   (m.attachments||[]).map(a=>button('Abrir imagem','data-attachment="'+e(a.id)+'"')).join('')+
   '<footer><time>'+time(m.created_at)+'</time>'+(m.sender_profile_id===actor?'<small>'+e(receiptLabel(m))+'</small>':'')+'</footer>'+
   '<div class="button-row">'+button('Responder','data-reply="'+e(m.id)+'"')+
   (m.requires_ack&&m.sender_profile_id!==actor?button((m.receipts||[]).find(r=>r.profile_id===actor)?.acknowledged_at?'Ciência confirmada':'Confirmar ciência','data-ack="'+e(m.id)+'"'):'')+
   (leader(getUser())?button('Criar solicitação','data-create-request="'+e(m.id)+'"'):'')+'</div>'+
   '<details><summary>Recebimento e ciência</summary>'+(m.receipts||[]).map(r=>'<p>'+e(r.name)+' · '+(r.delivered_at?'Sincronizada':'Sem confirmação de entrega')+' · '+(r.read_at?'Visualizada':'Não visualizada')+' · '+(r.acknowledged_at?'Ciência confirmada':'Ciência pendente')+'</p>').join('')+'</details></article>').join('')||'<p>Nenhuma mensagem nesta conversa.</p>';
  if(s.pending){const pending=document.createElement('article');pending.className='comm-bubble mine pending';pending.textContent=s.pending.data.body+' — '+(s.pending.sending?'Enviando…':'Envio não confirmado. Use Tentar novamente.');host.append(pending);}
  host.scrollTop=prepend?oldTop+host.scrollHeight-oldHeight:bottom||nearBottom?host.scrollHeight:oldTop;
  $('[data-earlier]').hidden=!s.hasEarlier;
  host.querySelectorAll('[data-reply]').forEach(node=>node.onclick=()=>{s.reply=s.messages.find(m=>String(m.id)===node.dataset.reply);drawComposer();$('[data-body]').focus();});
  host.querySelectorAll('[data-ack]').forEach(node=>node.onclick=()=>void api.rpc('RECEIPT',{conversation_id:selected,ids:[node.dataset.ack],state:'ACK'}).then(refresh).catch(fail));
  host.querySelectorAll('[data-create-request]').forEach(node=>node.onclick=()=>createRequest(node.dataset.createRequest));
  host.querySelectorAll('[data-process-message]').forEach(node=>node.onclick=()=>{const m=s.messages.find(m=>String(m.id)===node.dataset.processMessage);void openProcess(m.process).catch(fail);});
  host.querySelectorAll('[data-attachment]').forEach(node=>node.onclick=()=>void imageDialog(node.dataset.attachment).catch(fail));
  void markVisible();
 }
 async function acknowledgeDelivery(rows,id){
  const ids=rows.filter(m=>m.sender_profile_id!==actor&&!delivered.has(String(m.id))).map(m=>String(m.id));if(!ids.length)return;
  await api.rpc('RECEIPT',{conversation_id:id,ids,state:'DELIVERED'});if(live())ids.forEach(value=>delivered.add(value));
 }
 let marking=false;
 async function markVisible(){
  if(marking||!active||!selected||document.visibilityState!=='visible'||!document.hasFocus()||!$('[data-messages]'))return;
  const id=selected,box=$('[data-messages]').getBoundingClientRect();
  const ids=[...$('[data-messages]').querySelectorAll('[data-message-id]')].filter(node=>{
   const b=node.getBoundingClientRect();return b.bottom>Math.max(0,box.top)&&b.top<Math.min(window.innerHeight,box.bottom)&&b.right>0&&b.left<window.innerWidth&&!read.has(node.dataset.messageId)&&state(id).messages.find(m=>String(m.id)===node.dataset.messageId)?.sender_profile_id!==actor;
  }).map(node=>node.dataset.messageId);
  if(!ids.length)return;marking=true;
  try{await api.rpc('RECEIPT',{conversation_id:id,ids,state:'READ'});if(live())ids.forEach(value=>read.add(value));}catch{/* Keep unread on failure. */}finally{marking=false;}
 }
 async function earlier(){
  const id=selected,s=state(id);if(!s.messages.length)return;
  const rows=await api.rpc('MESSAGES',{conversation_id:id,before_id:String(s.messages[0].id)});if(!live()||id!==selected)return;
  s.messages=mergeCommunicationMessages(s.messages,rows);s.hasEarlier=rows.length===40;drawMessages(false,true);await acknowledgeDelivery(rows,id);
 }
 async function send(){
  const id=selected,s=state(id);if(s.pending?.sending)return;
  if(!s.pending){
   const body=$('[data-body]').value.trim();if(!body)throw Error('Escreva uma mensagem ou legenda antes de enviar.');
   const data={conversation_id:id,client_action_id:crypto.randomUUID(),body,priority:$('[data-urgent]').checked?'URGENT':'NORMAL',...s.metadata};
   if(s.reply)data.reply_to=String(s.reply.id);
   if(s.share)data.process={type:s.share.type,id:s.share.id};
   s.pending={data,sending:false,assets:[]};
  }
  s.pending.sending=true;drawComposer();drawMessages(true);
  try{
   for(let i=0;i<s.images.length;i++){const pending=s.pending;s.pending.assets[i]??={};const asset=await api.upload(s.images[i],id,pending.assets[i]);pending.data.attachments??=[];pending.data.attachments[i]=asset;}
   await api.send(s.pending.data);if(!live())return;
   for(const image of s.images)URL.revokeObjectURL(image.preview);
   s.pending=null;s.draft='';s.urgent=false;s.images=[];s.reply=null;s.metadata={};s.share=null;
   if(id===selected){$('[data-body]').value='';$('[data-urgent]').checked=false;}
   await refresh();if(id===selected){drawComposer();drawMessages(true);}
  }catch(error){if(s.pending)s.pending.sending=false;if(live()&&id===selected){drawComposer();drawMessages();}throw error;}
 }
 async function openProcess(link){
  const process=await api.rpc('PROCESS',{type:link.process_type,id:link.process_id});
  if(live())await onOpenProcess(process);
 }
 async function imageDialog(id){
  const conversation=selected,result=await api.edge('signed-url',{conversation_id:conversation,attachment_id:id});if(!live()||selected!==conversation)return;
  const dialog=modal('Evidência','<p>Link temporário, válido por 60 segundos.</p><img class="comm-full-image" src="'+e(result.url)+'" alt="Evidência compartilhada">',null);
  dialog.querySelector('img').onerror=()=>{dialog.querySelector('[data-error]').textContent='Imagem expirou ou não está disponível. Feche e abra novamente.';};
 }
 async function refresh(){
  if(!live())return;rememberDraft();await loadConversations();
  if(selected){
   const id=selected,rows=await api.rpc('MESSAGES',{conversation_id:id});if(!live()||selected!==id)return;
   state(id).messages=mergeCommunicationMessages(state(id).messages,rows);drawMessages();await acknowledgeDelivery(rows,id);
  }
  if(requestsOpen)await loadRequests();
 }
 function mute(){
  const id=selected;
  modal('Notificações da conversa','<label>Silenciar<select data-field="hours"><option value="0">Reativar</option><option value="1">1 hora</option><option value="8">8 horas</option><option value="168">7 dias</option></select></label>',async(dialog,close)=>{
   const hours=Number(dialog.querySelector('[data-field=hours]').value);await api.rpc('MUTE',{conversation_id:id,until:hours?new Date(Date.now()+hours*3600000).toISOString():null});close();await loadConversations();
  });
 }
 async function newConversation(type){
  const dialog=modal(type==='DIRECT'?'Nova conversa':type==='GROUP'?'Novo grupo':'Novo comunicado',
   (type!=='DIRECT'?'<label>Nome / título<input data-field="title" maxlength="120" required></label><label>Descrição<textarea data-field="description" maxlength="1000"></textarea></label>':'')+
   (type==='ANNOUNCEMENT'?'<label>Destinatários<select data-field="audience"><option value="SELECTED">Participantes selecionados</option><option value="UNIT">Toda a unidade</option><option value="GROUP">Grupo existente</option></select></label><label>Grupo<select data-field="group">'+conversations.filter(c=>c.type==='GROUP'&&!c.archived_at).map(c=>'<option value="'+e(c.id)+'">'+e(c.title)+'</option>').join('')+'</select></label>':'')+
   '<label>Pesquisar colaborador<input data-directory-search type="search"></label><div data-directory class="comm-directory"></div>'+
   (type==='ANNOUNCEMENT'?'<label>Comunicado<textarea data-field="body" maxlength="4000" required></textarea></label><label><input data-field="urgent" type="checkbox">Urgente</label><label>Prazo opcional<input data-field="due" type="datetime-local"></label><p>A mensagem será preparada para revisão, com opção de anexar evidências antes de enviar.</p>':''),
   async(dialog,close)=>{
    let cid;const chosen=[...picked];
    const audience=dialog.querySelector('[data-field=audience]')?.value;
    if(type==='ANNOUNCEMENT'&&audience==='GROUP'){cid=dialog.querySelector('[data-field=group]').value;if(!cid)throw Error('Selecione um grupo.');}
    else{
     if(type==='DIRECT'&&chosen.length!==1)throw Error('Selecione um colaborador.');
     cid=(await api.rpc('CREATE',{type,peer:chosen[0],members:chosen,title:dialog.querySelector('[data-field=title]')?.value||'Conversa',description:dialog.querySelector('[data-field=description]')?.value||'',audience})).id;
    }
    const announcement=type==='ANNOUNCEMENT'?{title:dialog.querySelector('[data-field=title]').value,body:dialog.querySelector('[data-field=body]').value,urgent:dialog.querySelector('[data-field=urgent]').checked,due:dialog.querySelector('[data-field=due]').value}:null;
    close();await loadConversations();await openConversation(cid);
    if(announcement){
     const s=state(cid);s.draft=announcement.body;s.metadata={title:announcement.title,message_type:'ANNOUNCEMENT',requires_ack:true};
     if(announcement.due)s.metadata.due_at=new Date(announcement.due).toISOString();
     s.urgent=announcement.urgent;$('[data-body]').value=s.draft;$('[data-urgent]').checked=s.urgent;drawComposer();
    }
   },type==='ANNOUNCEMENT'?'Preparar comunicado':'Abrir');
  const picked=new Set();let request=0;
  async function directory(){
   const version=++request,rows=await api.rpc('DIRECTORY',{search:dialog.querySelector('[data-directory-search]').value});
   if(!live()||!dialog.isConnected||version!==request)return;
   const list=dialog.querySelector('[data-directory]');list.innerHTML=rows.filter(u=>u.id!==actor).map(u=>'<label><input type="'+(type==='DIRECT'?'radio':'checkbox')+'" data-field="people" value="'+e(u.id)+'" '+(picked.has(u.id)?'checked':'')+'>'+e(u.name)+' · '+e(u.role)+'</label>').join('');
   list.querySelectorAll('input').forEach(input=>input.onchange=()=>{if(type==='DIRECT'){picked.clear();list.querySelectorAll('input').forEach(other=>{if(other!==input)other.checked=false;});}if(input.checked)picked.add(input.value);else picked.delete(input.value);});
  }
  let typing;dialog.querySelector('[data-directory-search]').oninput=()=>{clearTimeout(typing);typing=setTimeout(()=>void directory().catch(error=>{if(dialog.isConnected)dialog.querySelector('[data-error]').textContent=error.message;}),250);};
  try{await directory();}catch(error){if(dialog.isConnected)dialog.querySelector('[data-error]').textContent=error.message;}
 }
 function manageGroup(){
  const id=selected;
  const dialog=modal('Gerenciar grupo','<label>Nome<input data-field="title" maxlength="120" value="'+e(detail.title)+'"></label><label>Descrição<textarea data-field="description" maxlength="1000">'+e(detail.description)+'</textarea></label>'+
   '<div data-member-list></div><label>Participante para adicionar<select data-field="new-member"></select></label>'+button('Adicionar','data-add-member')+
   button(detail.archived_at?'Reabrir grupo':'Arquivar grupo','data-archive-group'),async(dialog,close)=>{
    await api.rpc('GROUP',{conversation_id:id,operation:'EDIT',title:dialog.querySelector('[data-field=title]').value,description:dialog.querySelector('[data-field=description]').value});close();await openConversation(id);
   },'Salvar nome e descrição');
  const action=async(operation,profile_id)=>{await api.rpc('GROUP',{conversation_id:id,operation,profile_id});dialog.close();dialog.remove();dialogs.delete(dialog);await openConversation(id);};
  dialog.querySelector('[data-member-list]').innerHTML=detail.members.filter(p=>!p.left_at).map(p=>'<p>'+e(p.name)+' · '+e(p.role)+(p.id!==actor?button('Remover','data-remove-member="'+e(p.id)+'"')+button('Tornar gestor','data-manager-member="'+e(p.id)+'"'):'')+'</p>').join('');
  dialog.querySelectorAll('[data-remove-member]').forEach(node=>node.onclick=()=>void action('REMOVE',node.dataset.removeMember).catch(fail));
  dialog.querySelectorAll('[data-manager-member]').forEach(node=>node.onclick=()=>void action('MANAGER',node.dataset.managerMember).catch(fail));
  dialog.querySelector('[data-archive-group]').onclick=()=>void action(detail.archived_at?'RESTORE':'ARCHIVE',undefined).catch(fail);
  dialog.querySelector('[data-add-member]').onclick=()=>void action('ADD',dialog.querySelector('[data-field=new-member]').value).catch(fail);
  void api.rpc('DIRECTORY').then(rows=>{if(dialog.isConnected)dialog.querySelector('[data-field=new-member]').innerHTML=rows.filter(u=>!detail.members.some(m=>m.id===u.id&&!m.left_at)).map(u=>'<option value="'+e(u.id)+'">'+e(u.name)+'</option>').join('');}).catch(fail);
 }
 function createRequest(messageId){
  const id=selected;
  modal('Criar solicitação operacional','<label>Assunto<input data-field="title" maxlength="120" required></label><label>Responsável<select data-field="assignee"><option value="">Sem responsável</option>'+
   detail.members.filter(p=>!p.left_at).map(p=>'<option value="'+e(p.id)+'">'+e(p.name)+'</option>').join('')+'</select></label><label>Prioridade<select data-field="priority"><option>NORMAL</option><option>ALTA</option><option>URGENTE</option><option>BAIXA</option></select></label><label>Prazo<input data-field="due" type="datetime-local"></label>',
   async(dialog,close)=>{
    const data={conversation_id:id,message_id:messageId,title:dialog.querySelector('[data-field=title]').value,assignee:dialog.querySelector('[data-field=assignee]').value,priority:dialog.querySelector('[data-field=priority]').value};
    const due=dialog.querySelector('[data-field=due]').value;if(due)data.due_at=new Date(due).toISOString();
    await api.rpc('CREATE_REQUEST',data);close();requestsOpen=true;await loadRequests();
   },'Criar tarefa vinculada');
 }
 async function loadRequests(){
  requests=await api.rpc('REQUESTS');if(!live())return;$('[data-request-panel]').hidden=!requestsOpen;
  if(!requestsOpen)return;
  const panel=$('[data-request-panel]'),previous={};
  for(const key of ['filter','person','priority','date','group'])previous[key]=panel.querySelector('[data-request-'+key+']')?.value;
  panel.innerHTML='<h3>Solicitações operacionais</h3><p>Até 100 registros recentes autorizados. Ler a mensagem não conclui a tarefa.</p><div class="comm-summary">'+['PENDENTE','RECEBIDO','EM ANDAMENTO','FINALIZADO','AGUARDANDO CONFIRMAÇÃO'].map(status=>'<span>'+e(status)+': '+requests.filter(r=>r.status===status).length+'</span>').join('')+'<span>Atrasadas: '+requests.filter(r=>r.overdue).length+'</span><span>Sem responsável: '+requests.filter(r=>!r.atribuido_para).length+'</span></div>'+
   '<div class="button-row"><label>Situação<select data-request-filter><option value="ALL">Todas</option>'+[...new Set(requests.map(r=>r.status))].map(s=>'<option>'+e(s)+'</option>').join('')+'</select></label>'+
   '<label>Colaborador<input data-request-person type="search"></label><label>Prioridade<select data-request-priority><option value="">Todas</option><option>URGENTE</option><option>ALTA</option><option>NORMAL</option><option>BAIXA</option></select></label><label>Data<input data-request-date type="date"></label><label>Grupo<select data-request-group><option value="">Todos</option>'+conversations.map(c=>'<option value="'+e(c.id)+'">'+e(c.display_name||c.title)+'</option>').join('')+'</select></label></div><div data-request-list></div>';
  for(const [key,value] of Object.entries(previous))if(value!=null)panel.querySelector('[data-request-'+key+']').value=value;
  function drawRequests(){
   const status=panel.querySelector('[data-request-filter]').value,person=panel.querySelector('[data-request-person]').value.toLowerCase(),priority=panel.querySelector('[data-request-priority]').value,date=panel.querySelector('[data-request-date]').value,group=panel.querySelector('[data-request-group]').value;
   panel.querySelector('[data-request-list]').innerHTML=requests.filter(r=>(status==='ALL'||r.status===status)&&(!person||(r.assignee_name||'').toLowerCase().includes(person))&&(!priority||r.prioridade===priority)&&(!date||r.data_criacao.startsWith(date))&&(!group||r.conversation_id===group)).map(r=>'<article class="comm-request"><strong>'+e(r.codigo_visivel)+' · '+e(r.titulo)+'</strong><p>'+e(r.status)+' · '+e(r.assignee_name||'Sem responsável')+' · '+e(r.prioridade)+(r.overdue?' · ATRASADA':'')+'</p><p>Prazo: '+(time(r.prazo_sla)||'Não definido')+'</p>'+
    button('Abrir conversa','data-request-conversation="'+e(r.conversation_id)+'"')+
    (r.atribuido_para===actor?button('Recebido','data-request-operation="RECEBIDO" data-request="'+e(r.id)+'"')+button('Em andamento','data-request-operation="EM_ANDAMENTO" data-request="'+e(r.id)+'"')+button('Finalizado','data-request-operation="FINALIZADO" data-request="'+e(r.id)+'"')+button('Preciso de ajuda','data-request-operation="AJUDA" data-request="'+e(r.id)+'"'):'')+
    (leader(getUser())?button('Atribuir','data-request-operation="ATRIBUIR" data-request="'+e(r.id)+'"')+button('Validar conclusão','data-request-operation="VALIDAR" data-request="'+e(r.id)+'"')+button('Cancelar','data-request-operation="CANCELAR" data-request="'+e(r.id)+'"'):'')+
    '<details><summary>Histórico</summary>'+(r.events||[]).map(ev=>'<p>'+time(ev.created_at)+' · '+e(ev.actor_profile_id)+' · '+e(ev.previous_status||'Criação')+' → '+e(ev.new_status)+' '+e(ev.note||'')+'</p>').join('')+'</details></article>').join('');
   panel.querySelectorAll('[data-request-conversation]').forEach(node=>node.onclick=()=>void openConversation(node.dataset.requestConversation).catch(fail));
   panel.querySelectorAll('[data-request-operation]').forEach(node=>node.onclick=()=>requestAction(node.dataset.request,node.dataset.requestOperation));
  }
  panel.querySelectorAll('input,select').forEach(input=>input.oninput=drawRequests);drawRequests();
 }
 function requestAction(id,operation){
  const request=requests.find(r=>r.id===id);
  const dialog=modal(operation==='ATRIBUIR'?'Atribuir responsável':'Atualizar solicitação','<p>'+e(request.titulo)+'</p>'+
   (operation==='ATRIBUIR'?'<label>Responsável<select data-field="assignee"></select></label>':'')+
   '<label>Observação'+(['AJUDA','CANCELAR'].includes(operation)?' obrigatória':'')+'<textarea data-field="note" maxlength="500" '+(['AJUDA','CANCELAR'].includes(operation)?'required':'')+'></textarea></label>',async(dialog,close)=>{
    const data={conversation_id:request.conversation_id,request_id:id,operation,note:dialog.querySelector('[data-field=note]').value};
    if(operation==='ATRIBUIR')data.assignee=dialog.querySelector('[data-field=assignee]').value;
    await api.rpc('REQUEST_ACTION',data);close();await loadRequests();
   });
  if(operation==='ATRIBUIR')void api.rpc('DETAIL',{conversation_id:request.conversation_id}).then(info=>{if(dialog.isConnected)dialog.querySelector('[data-field=assignee]').innerHTML=info.members.filter(p=>!p.left_at).map(p=>'<option value="'+e(p.id)+'">'+e(p.name)+'</option>').join('');}).catch(fail);
 }
 async function preferences(){
  const prefs=await api.rpc('PREFERENCES'),clock=minutes=>minutes==null?'':String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
  const policy=leader(getUser())?await api.rpc('POLICY'):null;
  const dialog=modal('Preferências de Comunicação','<p>Estas opções não alteram os sons de tarefas.</p><label><input data-field="sound" type="checkbox" '+(prefs.sound_enabled?'checked':'')+'>Som de mensagens</label>'+
   '<label>Volume<input data-field="volume" type="range" min="0" max="1" step="0.05" value="'+e(prefs.volume??0.5)+'"></label>'+
   '<label>Início do silêncio<input data-field="quiet_start" type="time" value="'+clock(prefs.quiet_start)+'"></label><label>Fim do silêncio<input data-field="quiet_end" type="time" value="'+clock(prefs.quiet_end)+'"></label><label>Fuso horário<input data-field="timezone" value="'+e(prefs.timezone||'America/Cuiaba')+'"></label>'+
   '<p>O silêncio também vale para urgências. No iPhone, instale o WMS na tela inicial para usar push.</p>'+button('Ativar notificações neste aparelho','data-push-enable')+button('Desativar notificações','data-push-disable')+'<p data-push-status role="status"></p>',
   async(dialog,close)=>{
    const readTime=name=>{const raw=dialog.querySelector('[data-field='+name+']').value;if(!raw)return null;const [hours,minutes]=raw.split(':').map(Number);return hours*60+minutes;};
    const result=await api.rpc('PREFERENCES',{sound_enabled:dialog.querySelector('[data-field=sound]').checked,volume:Number(dialog.querySelector('[data-field=volume]').value),quiet_start:readTime('quiet_start'),quiet_end:readTime('quiet_end'),timezone:dialog.querySelector('[data-field=timezone]').value});
    if(policy)await api.rpc('POLICY',{retention_days:Number(dialog.querySelector('[data-field=retention]').value),urgent_per_hour:Number(dialog.querySelector('[data-field=urgent_limit]').value)});
    onPreferences(result);close();
   },'Salvar preferências');
  if(policy){
   const section=document.createElement('fieldset');section.innerHTML='<legend>Política da unidade</legend><label>Limite de urgências por usuário/hora<input data-field="urgent_limit" type="number" min="1" max="10" value="'+e(policy.urgent_per_hour)+'"></label><label>Retenção mínima, em dias<input data-field="retention" type="number" min="90" max="3650" value="'+e(policy.retention_days)+'"></label><p>Sem exclusão automática de mensagens ou histórico de tarefas. Descarte exige procedimento autorizado.</p>';
   dialog.querySelector('[type=submit]').before(section);
  }
  let pushConfig=null;dialog.querySelector('[data-push-enable]').disabled=true;
  void api.edge('config').then(config=>{pushConfig=config;if(dialog.isConnected){dialog.querySelector('[data-push-enable]').disabled=!config.configured;dialog.querySelector('[data-push-status]').textContent=config.configured?'Servidor de push configurado. A permissão será solicitada ao ativar.':'Push ainda não configurado no servidor. Avisos internos disponíveis.';}}).catch(()=>{if(dialog.isConnected)dialog.querySelector('[data-push-status]').textContent='Serviço de push ainda indisponível. Avisos internos disponíveis.';});
  for(const [selector,enabled] of [['[data-push-enable]',true],['[data-push-disable]',false]])dialog.querySelector(selector).onclick=async()=>{
   dialog.querySelector(selector).disabled=true;
   try{await setCommunicationPush(api,enabled,pushConfig);dialog.querySelector('[data-push-status]').textContent=enabled?'Inscrição confirmada neste aparelho.':'Notificações desativadas neste aparelho.';}
   catch(error){dialog.querySelector('[data-push-status]').textContent=error.message;}
   finally{if(dialog.isConnected)dialog.querySelector(selector).disabled=false;}
  };
 }
 async function shareProcess(process){
  const checked=await api.rpc('PROCESS',{type:process.type,id:process.id});await loadConversations();if(!live())return;
  modal('Enviar para Comunicação','<p>'+e(checked.title)+'</p><label>Conversa<select data-field="conversation">'+conversations.filter(c=>!c.archived_at).map(c=>'<option value="'+e(c.id)+'">'+e(c.display_name||c.title)+'</option>').join('')+'</select></label><p>Se necessário, crie uma conversa pelo botão Nova conversa e repita o compartilhamento.</p>',async(dialog,close)=>{
   const cid=dialog.querySelector('[data-field=conversation]').value;if(!cid)throw Error('Crie uma conversa primeiro.');
   state(cid).share=checked;close();await openConversation(cid);drawComposer();$('[data-body]').focus();
  },'Preparar mensagem');
 }
 let typing;
 $('[data-search]').oninput=()=>{search=$('[data-search]').value;clearTimeout(typing);typing=setTimeout(()=>void loadConversations().catch(fail),250);};
 root.querySelectorAll('[data-filter]').forEach(node=>node.onclick=()=>{filter=node.dataset.filter;drawConversations();});
 root.querySelectorAll('[data-new]').forEach(node=>node.onclick=()=>void newConversation(node.dataset.new).catch(fail));
 $('[data-refresh]').onclick=()=>void refresh().catch(fail);
 $('[data-more-conversations]').onclick=()=>void loadConversations(true).catch(fail);
 $('[data-requests]').onclick=()=>{requestsOpen=!requestsOpen;void loadRequests().catch(fail);};
 $('[data-preferences]').onclick=()=>void preferences().catch(fail);
 const focus=()=>void markVisible();window.addEventListener('focus',focus);
 return {
  async open(options={}){
   active=true;await refresh();if(options.conversation_id)await openConversation(options.conversation_id);if(options.share)await shareProcess(options.share);
   if(options.divergencesTransfer){
    const rows=await api.rpc('DIVERGENCES',{id:options.divergencesTransfer});
    if(!rows.length){notice('Nenhuma divergência registrada. Você pode compartilhar a transferência.');return;}
    modal('Compartilhar divergência','<label>Registro<select data-field="divergence">'+rows.map(row=>'<option value="'+e(row.id)+'">'+e(row.sku)+' · '+e(row.divergence_type||'Divergência')+'</option>').join('')+'</select></label>',async(dialog,close)=>{
     const id=dialog.querySelector('[data-field=divergence]').value;close();await shareProcess({type:'DIVERGENCE',id});
    },'Selecionar');
   }
  },
  refresh,connection(text){if(live())$('[data-connection]').textContent=text;},
  async setActive(value){active=value;await presence(value);if(value)void markVisible();},
  dispose(){dead=true;seq++;clearTimeout(typing);window.removeEventListener('focus',focus);for(const dialog of dialogs){dialog.close();dialog.remove();}dialogs.clear();for(const s of states.values())for(const image of s.images)URL.revokeObjectURL(image.preview);states.clear();selected=null;}
 };
}
