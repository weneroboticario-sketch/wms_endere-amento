// Persist the exact request before sending. An uncertain acknowledgement must
// be retried with the same action UUID, never reconstructed from form values.
export function createPackingGateway({client,storage,scope,uuid=()=>crypto.randomUUID()}){
 const key=()=>`wms:packing:${scope()}`;let busy=false;
 const pending=()=>{const raw=storage.getItem(key());return raw?JSON.parse(raw):null;};
 async function send(request){
  if(busy)throw new Error('Aguarde a confirmação da operação anterior.');
  const scopeAtSend=scope(),keyAtSend=key();busy=true;
  try{
   const result=await client.rpc('apply_wms_packing_action',request);
   if(result.error)throw Object.assign(new Error(result.error.message),{code:result.error.code});
   if(!result.data)throw new Error('Sem confirmação do servidor. Tente novamente a mesma operação.');
   storage.removeItem(keyAtSend);
   return {data:result.data,stale:scope()!==scopeAtSend};
  }finally{busy=false;}
 }
 return {pending,
  async perform({transferId,itemId,warehouse,revision,action}){
   if(pending())throw new Error('Existe uma operação sem confirmação. Use Tentar novamente antes de continuar.');
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
