export function trustedPushSubscription(value: any){
 if(!value||typeof value.endpoint!=='string')throw Error('Inscrição inválida.');
 const url=new URL(value.endpoint);
 const host=url.hostname;
 if(url.protocol!=='https:'||url.port||url.username||url.password||url.hash||![
  host==='fcm.googleapis.com',host==='web.push.apple.com',
  host.endsWith('.push.services.mozilla.com'),host.endsWith('.notify.windows.com')
 ].some(Boolean))throw Error('Servidor de push não autorizado.');
 if(value.endpoint.length>2048||!/^[A-Za-z0-9_-]{80,100}$/.test(value.keys?.p256dh||'')||!/^[A-Za-z0-9_-]{20,30}$/.test(value.keys?.auth||''))throw Error('Chaves de inscrição inválidas.');
 return {endpoint:value.endpoint,keys:{p256dh:value.keys.p256dh,auth:value.keys.auth}};
}
export function inspectEvidence(bytes: Uint8Array,claimed: string){
 if(!bytes.length||bytes.length>5242880)throw Error('Imagem deve ter até 5 MB.');
 const match=(offset: number,values: number[])=>values.every((value,index)=>bytes[offset+index]===value);
 let mime='';
 if(match(0,[0xff,0xd8,0xff])&&match(bytes.length-2,[0xff,0xd9]))mime='image/jpeg';
 else if(match(0,[137,80,78,71,13,10,26,10])&&match(12,[73,72,68,82])&&bytes.length>=45)mime='image/png';
 else if(match(0,[82,73,70,70])&&match(8,[87,69,66,80])&&bytes.length>=20)mime='image/webp';
 if(!mime||mime!==claimed)throw Error('Conteúdo não corresponde a uma imagem JPG, PNG ou WEBP permitida.');
 return mime;
}
export function quietNow(row: any,now=new Date()){
 if(row.quiet_start==null||row.quiet_end==null)return false;
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:row.timezone||'America/Cuiaba',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
 const minutes=Number(parts.find(p=>p.type==='hour')?.value)*60+Number(parts.find(p=>p.type==='minute')?.value);
 return row.quiet_start<=row.quiet_end?minutes>=row.quiet_start&&minutes<row.quiet_end:minutes>=row.quiet_start||minutes<row.quiet_end;
}
export async function dispatchPush({server,send,now=()=>new Date(),messageId}:{server:any;send:any;now?:()=>Date;messageId?:string}){
 const claimed=await server('CLAIM',{limit:20,...(messageId?{message_id:messageId}:{})});
 let accepted=0,failed=0;
 async function limited(rows:any[],limit:number,work:any){
  let index=0;
  await Promise.all(Array.from({length:Math.min(limit,rows.length)},async()=>{while(index<rows.length){const item=rows[index++];await work(item);}}));
 }
 await limited(claimed,4,async(row:any)=>{
  const current=now(),done={message_id:row.message_id,profile_id:row.profile_id,accepted:[] as string[],invalid:[] as string[],outcome:'DONE'};
  if(!row.eligible||new Date(row.muted_until||0)>current){await server('FINISH',done);return;}
  if(new Date(row.active_until||0)>current){done.outcome='ACTIVE';await server('FINISH',done);return;}
  if(quietNow(row,current)){done.outcome='QUIET';await server('FINISH',done);return;}
  await limited(row.subscriptions,3,async(subscription:any)=>{
   try{
    const checked=trustedPushSubscription(subscription.data);
    await send(checked,JSON.stringify({title:'WMS — Comunicação',body:'Você recebeu uma nova mensagem.',tag:'wms-chat-'+row.message_id,
     conversation_id:row.conversation_id,warehouse:row.warehouse,message_id:row.message_id}));
    done.accepted.push(subscription.id);accepted++;
   }catch(error:any){
    if([404,410].includes(error.statusCode)||/Inscrição|Servidor de push|Chaves/.test(error.message||''))done.invalid.push(subscription.id);
    else{done.outcome='RETRY';failed++;}
   }
  });
  await server('FINISH',done);
 });
 return {claimed:claimed.length,accepted,failed};
}
