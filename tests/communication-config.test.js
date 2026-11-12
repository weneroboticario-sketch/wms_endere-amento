import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createPushConfigurationLoader} from '../supabase/functions/wms-communication/server-config.ts';
import {createCommunicationHandler} from '../supabase/functions/wms-communication/handler.ts';
import {communicationFixture,asActor} from './communication-fixture.js';

test('Vault config is cached, allowlisted, coherent and never exposed by the browser config endpoint',async()=>{
 let now=0,calls=0,fail=false;
 const values={SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-key',SUPABASE_ANON_KEY:'anon',WMS_CHAT_VAPID_PUBLIC_KEY:'partial-env'};
 const secret={WMS_CHAT_VAPID_PUBLIC_KEY:'public-key',WMS_CHAT_VAPID_PRIVATE_KEY:'private-key',WMS_CHAT_VAPID_SUBJECT:'https://wms.test',WMS_CHAT_WORKER_SECRET:'a'.repeat(64),UNRELATED_SECRET:'do-not-export'};
 const createClient=(_url,key)=>({auth:{getUser:async()=>({data:{user:{id:'auth'}}})},rpc:async name=>{
  if(name==='wms_chat_push_config'){assert.equal(key,'server-key');calls++;await Promise.resolve();return fail?{error:Error('offline')}:{data:secret};}
  return {data:{count:0}};
 }});
 const load=createPushConfigurationLoader({createClient,env:key=>values[key],now:()=>now});
 const [env,parallel]=await Promise.all([load(),load()]);assert.equal(calls,1);assert.equal(env('WMS_CHAT_VAPID_PUBLIC_KEY'),'public-key');assert.equal(parallel('WMS_CHAT_VAPID_PRIVATE_KEY'),'private-key');assert.equal(env('UNRELATED_SECRET'),undefined);
 await load();assert.equal(calls,1);
 const handler=createCommunicationHandler({createClient,env,sendPush:async()=>{}});
 const response=await handler(new globalThis.Request('https://edge.test',{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},body:JSON.stringify({action:'config',warehouse:'VDCG'})}));
 assert.deepEqual(await response.json(),{configured:true,publicKey:'public-key'});
 now=60001;fail=true;const unavailable=await load();assert.equal(unavailable('WMS_CHAT_VAPID_PRIVATE_KEY'),undefined);assert.equal(calls,2);
 values.WMS_CHAT_VAPID_PUBLIC_KEY='complete-public';values.WMS_CHAT_VAPID_PRIVATE_KEY='complete-private';values.WMS_CHAT_VAPID_SUBJECT='https://env.test';values.WMS_CHAT_WORKER_SECRET='b'.repeat(64);
 const configured=await load();assert.equal(configured('WMS_CHAT_VAPID_PUBLIC_KEY'),'complete-public');assert.equal(calls,2);
});

test('Vault configuration RPC is service-only and exports exactly the Communication keys',async()=>{
 const db=await communicationFixture();
 try{
  await db.exec(`create schema vault;create table vault.decrypted_secrets(name text primary key,decrypted_secret text);
   insert into vault.decrypted_secrets values('wms_chat_vapid_public_key','public'),('wms_chat_vapid_private_key','secret'),('unrelated','not-exported');`);
  const sql=await readFile(new URL('../supabase/migrations/20261112140839_wms_communication_push_worker.sql',import.meta.url),'utf8');
  await db.exec(sql.split('-- Server-side scheduling.')[0]);
  await asActor(db,'admin');await assert.rejects(db.query('select public.wms_chat_push_config()'),/permission denied/);
  await db.exec('reset role;set role anon');await assert.rejects(db.query('select public.wms_chat_push_config()'),/permission denied/);
  await db.exec('reset role;set role service_role');
  const result=(await db.query('select public.wms_chat_push_config() result')).rows[0].result;
  assert.deepEqual(result,{WMS_CHAT_VAPID_PUBLIC_KEY:'public',WMS_CHAT_VAPID_PRIVATE_KEY:'secret'});
 }finally{await db.close();}
});
