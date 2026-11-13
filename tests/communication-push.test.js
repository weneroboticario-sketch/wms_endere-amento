import test from 'node:test';import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {dispatchPush,quietNow,trustedPushSubscription,inspectEvidence} from '../supabase/functions/wms-communication/push-domain.ts';
import {createCommunicationHandler} from '../supabase/functions/wms-communication/handler.ts';
import {verifyWorkerRequest} from '../supabase/functions/wms-communication/worker-auth.ts';
const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/synthetic',keys:{p256dh:'a'.repeat(87),auth:'b'.repeat(22)}};
test('push blocks arbitrary endpoints and evidence validates actual signatures, type and size',()=>{
 assert.equal(trustedPushSubscription(subscription).endpoint,subscription.endpoint);
 for(const endpoint of ['http://fcm.googleapis.com/x','https://127.0.0.1/x','https://fcm.googleapis.com.evil.test/x','https://fcm.googleapis.com@evil.test/x','https://fcm.googleapis.com:444/x']){
  assert.throws(()=>trustedPushSubscription({...subscription,endpoint}),/autorizado/);
 }
 assert.throws(()=>inspectEvidence(new TextEncoder().encode('<svg>unsafe</svg>'),'image/png'),/Conteúdo/);
 assert.throws(()=>inspectEvidence(new Uint8Array(5242881),'image/png'),/5 MB/);
 assert.equal(inspectEvidence(new Uint8Array([255,216,255,0,255,217]),'image/jpeg'),'image/jpeg');
 assert.throws(()=>inspectEvidence(new Uint8Array([255,216,255,0,255,217]),'image/png'),/Conteúdo/);
});
test('push silence respects recipient timezone, mute and active conversation; invalid devices are revoked and retries remain queued',async()=>{
 const now=()=>new Date('2026-11-11T14:00:00Z'),finished=[],sent=[];
 const base={message_id:'1',profile_id:'op',conversation_id:'id',warehouse:'VDCG',eligible:true,subscriptions:[{id:'valid',data:subscription}],timezone:'America/Cuiaba'};
 const rows=[
  {...base,eligible:false},{...base,muted_until:'2026-11-12T14:00:00Z'},{...base,active_until:'2026-11-11T14:01:00Z'},
  {...base,quiet_start:540,quiet_end:660},{...base,subscriptions:[{id:'gone',data:subscription},{id:'retry',data:subscription},{id:'ok',data:subscription}]}
 ];
 let calls=0;
 const result=await dispatchPush({now,server:async(action,data)=>action==='CLAIM'?rows:finished.push(data),send:async(s,payload)=>{
  sent.push(JSON.parse(payload));calls++;if(calls===1)throw Object.assign(Error('Gone'),{statusCode:410});if(calls===2)throw Error('Offline');
 }});
 assert.equal(sent.length,3);assert.deepEqual(finished[4].invalid,['gone']);assert.deepEqual(finished[4].accepted,['ok']);assert.equal(finished[4].outcome,'RETRY');
 assert.equal(finished[3].outcome,'QUIET');assert.equal(result.accepted,1);assert.equal(result.failed,1);
 assert.equal(sent[2].body,'Você recebeu uma nova mensagem.');assert.equal(sent[2].tag,'wms-chat-1');
 assert.ok(quietNow({quiet_start:1320,quiet_end:420,timezone:'America/Cuiaba'},new Date('2026-11-12T03:00:00Z')));
});
test('Edge handler rejects missing auth, wrong origin and unconfigured worker; unsupported push is reported honestly',async()=>{
 const envValues={SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_ANON_KEY:'synthetic-anon',SUPABASE_SERVICE_ROLE_KEY:'server-only',WMS_CHAT_WORKER_SECRET:'secret'.repeat(8)};
 const calls=[];
 const createClient=()=>({auth:{getUser:async()=>({data:{user:{id:'auth-user'}}})},rpc:async(name,args)=>{calls.push({name,args});return {data:{count:0},error:null};}});
 const handler=createCommunicationHandler({createClient,env:key=>envValues[key],sendPush:async()=>{}});
 const request=(body,headers={})=>new globalThis.Request('https://edge.test',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 assert.equal((await handler(request({action:'config',warehouse:'VDCG'}))).status,401);
 assert.equal((await handler(request({action:'config'},{Origin:'https://evil.test'}))).status,403);
 const configured=await handler(request({action:'config',warehouse:'VDCG'},{Authorization:'Bearer synthetic'}));assert.deepEqual(await configured.json(),{configured:false,publicKey:null});
 assert.equal((await handler(request({action:'drain'},{'x-wms-worker-secret':'wrong'}))).status,401);
 const stamp=String(Math.floor(Date.now()/1000)),nonce='10000000-0000-4000-8000-000000000001';
 const signature=createHmac('sha256',envValues.WMS_CHAT_WORKER_SECRET).update('wms-chat-drain:'+stamp+':'+nonce).digest('hex');
 assert.equal((await handler(request({action:'drain'},{'x-wms-worker-time':stamp,'x-wms-worker-nonce':nonce,'x-wms-worker-signature':signature}))).status,503);
 assert.ok(calls.some(c=>c.args.p_action==='UNREAD'));
});

test('worker uses expiring HMAC, rejects tampering/expiry and denies permanent credentials by default',async()=>{
 const secret='a'.repeat(64),stamp='1794490000',nonce='10000000-0000-4000-8000-000000000001',signature=createHmac('sha256',secret).update('wms-chat-drain:'+stamp+':'+nonce).digest('hex');
 const request=headers=>new globalThis.Request('https://edge.test',{headers});
 const headers={'x-wms-worker-time':stamp,'x-wms-worker-nonce':nonce,'x-wms-worker-signature':signature};
 assert.equal(await verifyWorkerRequest(request(headers),secret,{now:Number(stamp)*1000}),true);
 assert.equal(await verifyWorkerRequest(request(headers),secret,{now:(Number(stamp)+91)*1000}),false);
 assert.equal(await verifyWorkerRequest(request({...headers,'x-wms-worker-nonce':'20000000-0000-4000-8000-000000000001'}),secret,{now:Number(stamp)*1000}),false);
 assert.equal(await verifyWorkerRequest(request({'x-wms-worker-secret':secret}),secret),false);
 assert.equal(await verifyWorkerRequest(request(headers),'b'.repeat(64),{now:Number(stamp)*1000}),false);
});
