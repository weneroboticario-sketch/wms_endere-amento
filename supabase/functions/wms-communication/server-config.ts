// Server-only configuration. The RPC is denied to anon/authenticated and returns
// only this module's five Vault entries, never arbitrary project secrets.
const names=['WMS_CHAT_VAPID_PUBLIC_KEY','WMS_CHAT_VAPID_PRIVATE_KEY','WMS_CHAT_VAPID_SUBJECT','WMS_CHAT_WORKER_SECRET','WMS_CHAT_ALLOWED_ORIGINS'];
export function createPushConfigurationLoader({createClient,env,now=Date.now}:{createClient:any;env:(key:string)=>string|undefined;now?:()=>number}){
 let cached:Record<string,string>={},expires=0,pending:Promise<void>|null=null;
 return async()=>{
  if(!names.slice(0,4).every(name=>env(name))&&now()>=expires){
   if(!pending)pending=(async()=>{
    try{
     const url=env('SUPABASE_URL'),key=env('SUPABASE_SERVICE_ROLE_KEY');
     if(!url||!key)return;
     const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
     const result=await client.rpc('wms_chat_push_config');
     if(result.error)throw Error('Configuração de push indisponível.');
     cached={};for(const name of names)if(typeof result.data?.[name]==='string'&&result.data[name].length<=2048)cached[name]=result.data[name];
     expires=now()+60000;
    }catch{cached={};expires=now()+5000;} // Internal chat/evidence still work without push.
   })().finally(()=>{pending=null;});
   await pending;
  }
  const snapshot={...cached};
  const envVapid=names.slice(0,3).every(name=>env(name));
  return (name:string)=>names.slice(0,3).includes(name)?(envVapid?env(name):snapshot[name]):env(name)||snapshot[name];
 };
}
