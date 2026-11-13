export async function prepareCommunicationImage(file){
 if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw Error('Escolha JPG, PNG ou WEBP de até 10 MB.');
 const url=URL.createObjectURL(file),image=new window.Image();
 try{
  image.src=url;await image.decode();
  if(!image.naturalWidth||image.naturalWidth*image.naturalHeight>40000000)throw Error('Imagem muito grande para este aparelho.');
  let blob=file;
  if(file.size>5242880||Math.max(image.naturalWidth,image.naturalHeight)>2048){
   const scale=Math.min(1,2048/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');
   canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);
   const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
   blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.9));canvas.width=canvas.height=1;
  }
  if(!blob||blob.size>5242880)throw Error('A imagem ainda supera 5 MB. Reduza seu tamanho antes de enviar.');
  return {blob,preview:URL.createObjectURL(blob),name:file.name||'Evidência'};
 }finally{URL.revokeObjectURL(url);image.src='';}
}
export async function setCommunicationPush(api,enabled,knownConfig=null){
 if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))throw Error('Push indisponível neste navegador. No iPhone, instale o WMS na tela inicial. Os avisos internos continuam disponíveis.');
 const config=enabled?(knownConfig||await api.edge('config')):null;
 if(enabled&&!config.configured)throw Error('Push ainda não configurado no servidor. Use os avisos internos.');
 const permission=enabled?(window.Notification.permission==='granted'?'granted':window.Notification.requestPermission()):null;
 const registration=await navigator.serviceWorker.getRegistration();
 if(!registration)throw Error('PWA ainda não está pronta para notificações. Atualize o WMS e tente novamente.');
 const existing=await registration.pushManager.getSubscription();
 if(!enabled){
  if(existing){try{await api.edge('unsubscribe',{endpoint:existing.endpoint});}finally{await existing.unsubscribe();}}
  return false;
 }
 if(await permission!=='granted')throw Error('Permissão de notificações não concedida. Os avisos internos continuam funcionando.');
 const raw=window.atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')),key=Uint8Array.from(raw,c=>c.charCodeAt(0));
 const subscription=existing||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
 await api.edge('subscribe',{subscription:subscription.toJSON()});return true;
}
