export function createCommunicationApi({client,warehouse,isCurrent}){
 const check=()=>{if(!isCurrent())throw Error('Sessão ou unidade alterada.');};
 async function rpc(action,data={}){
  check();const response=await client.rpc('wms_chat_api',{p_warehouse:warehouse,p_action:action,p_data:data});check();
  if(response.error)throw Error(response.error.message||'Comunicação indisponível.');
  return response.data;
 }
 async function edge(action,data={}){
  check();const response=await client.functions.invoke('wms-communication',{body:{action,warehouse,...data}});check();
  if(response.error||response.data?.error)throw Error(response.data?.error||response.error?.message||'Serviço de evidências/push indisponível.');
  return response.data;
 }
 async function upload(image,conversation,pending={}){
  check();
  if(!pending.asset)pending.asset=await rpc('RESERVE_ATTACHMENT',{conversation_id:conversation,mime_type:image.blob.type,size_bytes:image.blob.size});
  const details={conversation_id:conversation,attachment_id:pending.asset.id};
  if(pending.started){
   try{await edge('finalize',details);return pending.asset.id;}catch{/* Retry upload only when finalization has not succeeded. */}
  }
  pending.started=true;
  const result=await client.storage.from('wms-communication').upload(pending.asset.storage_path,image.blob,{contentType:image.blob.type,cacheControl:'0',upsert:false});
  check();
  if(result.error&&!/already exists|duplicate/i.test(result.error.message||''))throw Error(result.error.message);
  await edge('finalize',details);return pending.asset.id;
 }
 async function send(data){
  const sent=await rpc('SEND',data);
  // Persistence does not depend on push being configured or this tab remaining open.
  void edge('notify',{conversation_id:data.conversation_id,message_id:sent.id}).catch(()=>{});
  return sent;
 }
 return {rpc,edge,upload,send};
}
export function mergeCommunicationMessages(previous,incoming){
 const result=new Map(previous.map(row=>[String(row.id),row]));for(const row of incoming)result.set(String(row.id),row);
 return [...result.values()].sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:BigInt(a.id)>BigInt(b.id)?1:0);
}
export function createCommunicationRealtime({client,warehouse,actor,onSync,onState}){
 let closed=false,scheduled=null,running=false,again=false;
 async function synchronize(){
  if(closed)return;
  if(running){again=true;return;}
  running=true;
  try{await onSync();}finally{running=false;if(again&&!closed){again=false;schedule();}}
 }
 const schedule=()=>{if(closed||scheduled)return;scheduled=setTimeout(()=>{scheduled=null;void synchronize().catch(()=>onState('Falha de sincronização. Tente Atualizar.'));},250);};
 const channel=client.channel('wms-comm-'+warehouse+'-'+actor)
  .on('postgres_changes',{event:'*',schema:'public',table:'wms_chat_conversations',filter:'warehouse_code=eq.'+warehouse},schedule)
  .on('postgres_changes',{event:'*',schema:'public',table:'wms_chat_participants',filter:'profile_id=eq.'+actor},schedule)
  .on('postgres_changes',{event:'UPDATE',schema:'public',table:'wms_chat_message_receipts'},schedule)
  .subscribe(status=>{if(closed)return;onState(status==='SUBSCRIBED'?'Ao vivo':'Reconectando…');if(status==='SUBSCRIBED')schedule();});
 return {refresh:synchronize,close(){closed=true;if(scheduled)clearTimeout(scheduled);void client.removeChannel(channel);}};
}
