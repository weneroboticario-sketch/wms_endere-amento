// Persist the exact request before sending. An uncertain acknowledgement must
// be retried with the same action UUID, never reconstructed from form values.
export function createPackingGateway({client,storage,scope,uuid=()=>crypto.randomUUID()}){
 const key=()=>`wms:packing:${scope()}`;let busy=false;
 const pending=()=>{const raw=storage.getItem(key());return raw?JSON.parse(raw):null;};
 const transient=(error)=>{
  const message=String(error?.message||error?.details||error||'').toLowerCase();
  const status=Number(error?.status||0);
  return [408,429,500,502,503,504].includes(status) ||
   /timeout|timed out|failed to fetch|networkerror|load failed|fetch failed|gateway|temporar(?:y|i)|connection/.test(message);
 };
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
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
     result=await client.rpc('apply_wms_packing_action',request);
     if(result?.error){
      const failure=Object.assign(new Error(result.error.message||'Erro ao confirmar a bipagem.'),{
       code:result.error.code,status:result.status||result.error.status
      });
      throw failure;
     }
     if(!result?.data)throw new Error('Sem confirmação do servidor. Tente novamente a mesma operação.');
     storage.removeItem(keyAtSend);
     return {data:result.data,stale:scope()!==scopeAtSend,recovered:attempt>0};
    }catch(error){
     lastError=error;
     if(attempt===1||!transient(error))break;
     await pause(900);
    }
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
  retry(){const request=pending();if(!request)throw new Error('Nenhuma operação pendente.');return send(request);},
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
