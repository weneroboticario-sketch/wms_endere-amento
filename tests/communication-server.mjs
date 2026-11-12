/* global Request */
// Isolated PostgreSQL-backed browser test server. Never deploy this server.
import http from 'node:http';import {Buffer} from 'node:buffer';import {randomUUID} from 'node:crypto';import {readFile} from 'node:fs/promises';
import {communicationFixture,asActor,chat} from './communication-fixture.js';
import {createCommunicationHandler} from '../supabase/functions/wms-communication/handler.ts';
const db=await communicationFixture(),files=new Map(),signed=new Map(),listeners=new Set();
const actors={admin:'ADMINISTRADOR',sup:'SUPERVISOR',op:'OPERADOR',cash:'CAIXA',att:'ATENDENTE',other:'OPERADOR',outsider:'ADMINISTRADOR'};
await db.exec(`create schema storage;grant usage on schema storage to authenticated;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit int,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text unique);
alter table storage.objects enable row level security;grant select,insert on storage.objects to authenticated;`);
await db.exec(await readFile(new URL('../supabase/migrations/20261112134113_wms_communication_storage_push.sql',import.meta.url),'utf8'));
await asActor(db,'admin');const group=await chat(db,'CREATE',{type:'GROUP',title:'Estoque Geral — teste isolado',members:['sup','op','cash','att']});
await chat(db,'SEND',{conversation_id:group.id,body:'Mensagem sintética do teste local. Nenhum colaborador real é notificado.',client_action_id:randomUUID()});
let queue=Promise.resolve();
function serialize(work){const task=queue.then(work);queue=task.catch(()=>{});return task;}
const broadcast=()=>{for(const listener of listeners)listener.write('data: {"changed":true}\n\n');};
const server=http.createServer(async(req,res)=>{
 const headers={'Access-Control-Allow-Origin':'http://127.0.0.1:4192','Access-Control-Allow-Headers':'content-type','Content-Type':'application/json','Cache-Control':'no-store'};
 const answer=(body,status=200)=>{res.writeHead(status,headers);res.end(JSON.stringify(body));};
 if(req.headers.origin&&req.headers.origin!=='http://127.0.0.1:4192')return answer({error:'Test origin only'},403);
 if(req.method==='OPTIONS'){res.writeHead(204,headers);return res.end();}
 const url=new URL(req.url,'http://127.0.0.1:4193');
 if(url.pathname==='/events'){
  res.writeHead(200,{...headers,'Content-Type':'text/event-stream','Connection':'keep-alive'});res.write('data: {"connected":true}\n\n');
  listeners.add(res);req.on('close',()=>listeners.delete(res));return;
 }
 if(url.pathname==='/image'){
  const entry=signed.get(url.searchParams.get('token'));
  if(!entry||entry.until<Date.now())return answer({error:'Expired'},403);
  return serialize(async()=>{
   await asActor(db,entry.actor);
   const permitted=await db.query('select id from storage.objects where name=$1',[entry.path]);
   if(!permitted.rows.length)return answer({error:'Denied'},403);
   const file=files.get(entry.path);res.writeHead(200,{...headers,'Content-Type':file.type});res.end(file.bytes);
  }).catch(error=>answer({error:error.message},400));
 }
 let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>8*1024*1024)return answer({error:'Too large'},413);}
 let body;try{body=JSON.parse(raw);}catch{return answer({error:'Invalid JSON'},400);}
 if(!actors[body.actor])return answer({error:'Synthetic actor required'},403);
 await serialize(async()=>{
  const actor=body.actor,unit=actor==='other'?'VDAR':'VDCG',started=performance.now();await asActor(db,actor);
  if(url.pathname==='/rpc'){
   const data=await chat(db,body.action,body.data||{},body.warehouse||unit);answer({data,error:null,elapsedMs:performance.now()-started});
   if(!['LIST','UNREAD','MESSAGES','DETAIL','DIRECTORY','PROCESS','DIVERGENCES','REQUESTS','PRESENCE','PREFERENCES','POLICY'].includes(body.action))broadcast();
  }else if(url.pathname==='/upload'){
   const bytes=Buffer.from(body.bytes,'base64');if(bytes.length>5242880)throw Error('Too large');
   await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['wms-communication',body.path]);
   files.set(body.path,{bytes,type:body.type});answer({data:{path:body.path},error:null});
  }else if(url.pathname==='/edge'){
   const client=(key)=>({
    auth:{getUser:async()=>({data:{user:{id:actor}},error:null})},
    rpc:async(name,args)=>{
     try{
      if(key==='server-only'){await db.exec('reset role;set role service_role');return {data:(await db.query('select wms_chat_server($1,$2::jsonb) r',[args.p_action,JSON.stringify(args.p_data)])).rows[0].r,error:null};}
      await asActor(db,actor);return {data:await chat(db,args.p_action,args.p_data,args.p_warehouse),error:null};
     }catch(error){return {error:{message:error.message}};}
    },
    storage:{from:()=>({
     download:async path=>files.has(path)?{data:new Blob([files.get(path).bytes]),error:null}:{error:Error('Not uploaded')},
     createSignedUrl:async path=>{
      await asActor(db,actor);const allowed=await db.query('select id from storage.objects where name=$1',[path]);if(!allowed.rows.length)return {error:Error('Denied')};
      const token=randomUUID();signed.set(token,{actor,path,until:Date.now()+60000});return {data:{signedUrl:'http://127.0.0.1:4193/image?token='+token},error:null};
     }
    })}
   });
   const handler=createCommunicationHandler({createClient:(_url,key)=>client(key),env:key=>({SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_ANON_KEY:'synthetic',SUPABASE_SERVICE_ROLE_KEY:'server-only',WMS_CHAT_ALLOWED_ORIGINS:'http://127.0.0.1:4192'})[key],sendPush:async()=>{throw Error('Real push disabled in test');}});
   const result=await handler(new Request('http://edge.test',{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},body:JSON.stringify(body.data)}));
   answer({data:await result.json(),error:result.ok?null:{message:'Edge request failed'}});broadcast();
  }else answer({error:'Not found'},404);
 }).catch(error=>answer({error:{message:error.message}},400));
});
server.listen(4193,'127.0.0.1',()=>console.log('Isolated communication test server: http://127.0.0.1:4193'));
process.on('SIGINT',()=>{server.close();void db.close();process.exit();});
