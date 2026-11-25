/* global AbortController */
// Persist the exact request before sending. An uncertain acknowledgement must
// be retried with the same action UUID, never reconstructed from form values.
export function createPackingGateway({client,storage,scope,uuid=()=>crypto.randomUUID()}){
 const key=()=>`wms:packing:${scope()}`;let busy=false;
 const pending=()=>{const raw=storage.getItem(key());return raw?JSON.parse(raw):null;};
 const transient=(error)=>{
  const message=String(error?.message||error?.details||error||'').toLowerCase();
  const status=Number(error?.status||0);
  return [408,429,500,502,503,504].includes(status) ||
   /timeout|timed out|failed to fetch|networkerror|load failed|fetch failed|gateway|temporar(?:y|i)|connection|abort/.test(message);
 };
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const sameJson=(left,right)=>{
  const canonical=value=>{
   if(Array.isArray(value))return value.map(canonical);
   if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
   return value;
  };
  return JSON.stringify(canonical(left))===JSON.stringify(canonical(right));
 };
 async function recoverConfirmed(request){
  // An HTTP 504 can lose the reply even after the database COMMIT.
  // Check the immutable audited event before attempting a new RPC.
  if(typeof client.from!=='function')return null;
  try{
   const response=await client.from('wms_transfer_events').select('*')
    .eq('warehouse_code',request.p_warehouse).eq('transfer_id',request.p_transfer_id)
    .eq('action_id',request.p_action_id).maybeSingle();
   if(response.error||!response.data)return null;
   const event=response.data;
   const payload=typeof event.payload==='string'?JSON.parse(event.payload):event.payload||{};
   if(!sameJson(payload.request,request.p_action)||
      String(payload.requested_item_id||'')!==String(request.p_item_id||''))
    throw Object.assign(new Error('A operação auditada não corresponde à solicitação pendente. Solicite suporte antes de prosseguir.'),{code:'PENDING_MISMATCH'});
   if(event.event_type==='OPERACAO_DESCARTADA'){
    if(pending()?.p_action_id===request.p_action_id)storage.removeItem(key());
    return {cancelled:true,data:{event},recoveredFromHistory:true,stale:false};
   }
   const [transferResult,itemResult]=await Promise.all([
    client.from('wms_transfers').select('*').eq('id',request.p_transfer_id).eq('warehouse_code',request.p_warehouse).maybeSingle(),
    request.p_item_id?client.from('wms_transfer_items').select('*').eq('id',request.p_item_id).eq('transfer_id',request.p_transfer_id).eq('warehouse_code',request.p_warehouse).maybeSingle():Promise.resolve({data:null})
   ]);
   if(transferResult.error||!transferResult.data||itemResult.error||(request.p_item_id&&!itemResult.data))return null;
   const outstanding=pending();
   if(!outstanding||outstanding.p_action_id!==request.p_action_id)return null;
   storage.removeItem(key());
   return {data:{event,transfer:transferResult.data,item:itemResult.data,replayed:true},recovered:true,recoveredFromHistory:true,stale:false};
  }catch(error){
   if(error?.code==='PENDING_MISMATCH')throw error;
   return null; // Network/read failure: preserve pending UUID, never guess success.
  }
 }
 async function send(request){
  if(busy)throw new Error('Aguarde a confirmação da operação anterior.');
  const scopeAtSend=scope(),keyAtSend=key();busy=true;
  try{
   // A 504 may occur after COMMIT. Never issue a fresh action id on retry.
   // Retry the exact original payload once; the server returns the existing
   // action by UUID if the first attempt committed.
   let result,lastError;
   for(let attempt=0;attempt<2;attempt++){
    try{
     // Bound the wait in the browser; the server may still complete after
     // abort, so the UUID remains pending until audited reconciliation.
     const aborter=typeof AbortController==='function'?new AbortController():null;
     let deadline=null;
     try{
      const call=client.rpc('apply_wms_packing_action',request);
      if(aborter&&typeof call?.abortSignal==='function'){
       deadline=setTimeout(()=>aborter.abort(),12000);
       result=await call.abortSignal(aborter.signal);
      }else result=await call;
     }finally{if(deadline!==null)clearTimeout(deadline);}
     if(result?.error){
      const failure=Object.assign(new Error(result.error.message||'Erro ao confirmar a bipagem.'),{
       code:result.error.code,status:result.status||result.error.status
      });
      throw failure;
     }
     if(!result?.data)throw new Error('Sem confirmação do servidor. Tente novamente a mesma operação.');
     if(result.data.event?.event_type==='OPERACAO_DESCARTADA'){
      storage.removeItem(keyAtSend);
      return {cancelled:true,data:result.data,stale:scope()!==scopeAtSend};
     }
     storage.removeItem(keyAtSend);
     return {data:result.data,stale:scope()!==scopeAtSend,recovered:attempt>0};
    }catch(error){
     lastError=error;
     // A 504 can arrive after ~125 seconds. Do not immediately start another
     // long-running write; check the audited event and keep the UUID pending.
     if(attempt===1||!transient(error)||Number(error?.status)===504||/abort/i.test(String(error?.name||'')+' '+String(error?.message||'')))break;
     await pause(900);
    }
   }
   if(transient(lastError)){
    const confirmed=await recoverConfirmed(request);
    if(confirmed)return {...confirmed,stale:scope()!==scopeAtSend};
   }
   throw lastError;
  }finally{busy=false;}
 }
 return {pending,
  async perform({transferId,itemId,warehouse,revision,action}){
   const previous=pending();
   if(previous){
    // Never send the newly typed quantity while the preceding action is unresolved.
    // Retry the original UUID and refresh the current item before accepting another action.
    try{
     const recovered=await send(previous);
     return {...recovered,recoveredPending:true};
    }catch(error){
     if(['40001','42501','22023','P0001','23514'].includes(error.code)){
      storage.removeItem(key());
      throw new Error('A operação anterior foi recusada pelo servidor e não foi repetida. Atualize o item e confirme novamente a quantidade atual.',{cause:error});
     }
     throw new Error('A operação anterior ainda está sem confirmação. Utilize Tentar novamente a operação antes de lançar outra quantidade.',{cause:error});
    }
   }
   const request={p_transfer_id:transferId,p_item_id:itemId||'',p_warehouse:warehouse,p_action_id:uuid(),p_expected_revision:revision??0,p_action:action};
   storage.setItem(key(),JSON.stringify(request));return send(request);
  },
  async retry(){const request=pending();if(!request)throw new Error('Nenhuma operação pendente.');
   const confirmed=await recoverConfirmed(request);
   return confirmed||send(request);
  },
  async cancelPending(){
   const request=pending();
   if(!request)throw new Error('Nenhuma operação pendente para verificar.');
   if(busy)throw new Error('Aguarde a operação em andamento antes de verificar o registro.');
   if(typeof client.rpc!=='function')throw new Error('Servidor indisponível para validar a operação.');
   const response=await client.rpc('cancel_wms_pending_packing_action',{
    p_transfer_id:request.p_transfer_id,p_warehouse:request.p_warehouse,
    p_action_id:request.p_action_id,p_item_id:request.p_item_id||'',
    p_action:request.p_action
   });
   if(response?.error)throw Object.assign(new Error(response.error.message||'Falha ao verificar lançamento pendente.'),{code:response.error.code,status:response.status});
   const result=response?.data;
   if(!result||!['confirmed','cancelled'].includes(result.status))
    throw new Error('O servidor não confirmou o resultado. Operação preservada; não registre a quantidade novamente.');
   if(pending()?.p_action_id!==request.p_action_id)throw new Error('A operação pendente mudou. Atualize a tela.');
   if(result.status==='confirmed'&&typeof client.from==='function'&&request.p_item_id){
    const itemResponse=await client.from('wms_transfer_items').select('*')
      .eq('id',request.p_item_id).eq('transfer_id',request.p_transfer_id)
      .eq('warehouse_code',request.p_warehouse).maybeSingle();
    if(itemResponse.error||!itemResponse.data)
     throw new Error('Lançamento confirmado, mas não foi possível atualizar o item. Atualize a página.');
    result.item=itemResponse.data;
   }
   storage.removeItem(key());
   return result;
  },
  discardRejected(code){
   // Only a server rejection known to roll back permits dropping the action.
   if(!['40001','42501','22023','P0001','23514'].includes(code))throw new Error('Resultado incerto. Repita a operação com o mesmo identificador.');
   storage.removeItem(key());
  }
 };
}

export async function loadPackingHistory(client,transferId,warehouse){
 const events=[];const size=500;
 for(let offset=0;;offset+=size){
  const {data,error}=await client.from('wms_transfer_events').select('*').eq('transfer_id',transferId).eq('warehouse_code',warehouse).order('created_at').order('id').range(offset,offset+size-1);
  if(error)throw error;events.push(...data);if(data.length<size)return events;
 }
}
