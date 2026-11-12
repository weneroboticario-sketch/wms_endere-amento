import {dispatchPush,inspectEvidence,trustedPushSubscription} from './push-domain.ts';
import {verifyWorkerRequest} from './worker-auth.ts';
export function createCommunicationHandler({createClient,env,sendPush}:{createClient:any;env:(key:string)=>string|undefined;sendPush:any}){
 return async (request:Request)=>{
  const allowed=(env('WMS_CHAT_ALLOWED_ORIGINS')||'https://wms-endere-amento.vercel.app').split(',').map(x=>x.trim());
  const origin=request.headers.get('origin')||'';
  const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':allowed.includes(origin)?origin:allowed[0],
   'Vary':'Origin','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info, x-wms-worker-time, x-wms-worker-nonce, x-wms-worker-signature','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store'};
  const respond=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(origin&&!allowed.includes(origin))return respond({error:'Origem não autorizada.'},403);
  if(request.method==='OPTIONS')return new Response('ok',{headers});
  if(request.method!=='POST')return respond({error:'Método não permitido.'},405);
  if(Number(request.headers.get('content-length')||0)>65536)return respond({error:'Solicitação muito grande.'},413);
  let body:any;
  try{const raw=await request.text();if(raw.length>65536)return respond({error:'Solicitação muito grande.'},413);body=JSON.parse(raw);}catch{return respond({error:'JSON inválido.'},400);}
  const url=env('SUPABASE_URL'),anon=env('SUPABASE_ANON_KEY'),secret=env('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!anon||!secret)return respond({error:'Serviço indisponível.'},503);
  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const server=async(action:string,data:any)=>{
   const r=await admin.rpc('wms_chat_server',{p_action:action,p_data:data});if(r.error)throw Error(r.error.message);return r.data;
  };
  const ready=!!(env('WMS_CHAT_VAPID_PUBLIC_KEY')&&env('WMS_CHAT_VAPID_PRIVATE_KEY')&&env('WMS_CHAT_VAPID_SUBJECT'));
  try{
   if(body.action==='drain'){
    if(!await verifyWorkerRequest(request,env('WMS_CHAT_WORKER_SECRET')||''))return respond({error:'Acesso negado.'},401);
    if(!ready)return respond({configured:false},503);
    return respond(await dispatchPush({server,send:sendPush}));
   }
   const authorization=request.headers.get('authorization')||'';
   const token=authorization.match(/^Bearer (\S+)$/i)?.[1];if(!token)return respond({error:'Sessão necessária.'},401);
   const caller=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
   const user=await caller.auth.getUser(token);if(user.error||!user.data.user)return respond({error:'Sessão inválida.'},401);
   const rpc=async(action:string,data:any)=>{
    const r=await caller.rpc('wms_chat_api',{p_warehouse:body.warehouse,p_action:action,p_data:data});if(r.error)throw Error(r.error.message);return r.data;
   };
   // Every action verifies the active profile/unit, not just the JWT.
   await rpc('UNREAD',{});
   if(body.action==='config')return respond({configured:ready,publicKey:ready?env('WMS_CHAT_VAPID_PUBLIC_KEY'):null});
   if(body.action==='subscribe'){
    if(!ready)return respond({error:'Push ainda não configurado no servidor.'},503);
    return respond(await rpc('PUSH_SUBSCRIBE',trustedPushSubscription(body.subscription)));
   }
   if(body.action==='unsubscribe')return respond(await rpc('PUSH_UNSUBSCRIBE',{endpoint:body.endpoint}));
   if(body.action==='notify'){
    const message=await rpc('NOTIFY_AUTH',{conversation_id:body.conversation_id,message_id:body.message_id});
    if(!ready)return respond({configured:false,queued:true});
    return respond({configured:true,...await dispatchPush({server,send:sendPush,messageId:message.id})});
   }
   if(body.action==='finalize'||body.action==='signed-url'){
    const asset=await rpc('ATTACHMENT',{conversation_id:body.conversation_id,id:body.attachment_id});
    if(body.action==='finalize'){
     if(asset.state==='ATTACHED')throw Error('Anexo já enviado.');
     if(asset.state==='UPLOADING'){
      const downloaded=await admin.storage.from('wms-communication').download(asset.storage_path);
      if(downloaded.error)throw Error('Upload incompleto.');
      const bytes=new Uint8Array(await downloaded.data.arrayBuffer());inspectEvidence(bytes,asset.mime_type);
      if(bytes.length!==asset.size_bytes)throw Error('Tamanho do anexo divergente.');
      // Authenticated ATTACHMENT already guarantees ownership while unassigned.
      await server('FINALIZE_ATTACHMENT',{id:asset.id,actor:asset.uploaded_by});
     }
     return respond({id:asset.id,ready:true});
    }
    if(!['READY','ATTACHED'].includes(asset.state))throw Error('Imagem ainda não validada.');
    const signed=await caller.storage.from('wms-communication').createSignedUrl(asset.storage_path,60);
    if(signed.error)throw Error('Imagem não autorizada.');
    return respond({url:signed.data.signedUrl,expiresIn:60});
   }
   return respond({error:'Ação inválida.'},400);
  }catch(error:any){return respond({error:error.message||'Não foi possível concluir a ação.'},400);}
 };
}
