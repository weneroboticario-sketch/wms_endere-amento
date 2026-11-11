import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {communicationFixture,asActor,chat} from './communication-fixture.js';
test('private evidence and durable push queue enforce ownership, validation, deduplication and revocation',async()=>{
 const db=await communicationFixture();
 try{
  await db.exec(`create schema storage;grant usage on schema storage to authenticated;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit int,allowed_mime_types text[]);
   create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text unique);
   alter table storage.objects enable row level security;grant select,insert on storage.objects to authenticated;`);
  await db.exec(await readFile(new URL('../supabase/migrations/20261111194809_wms_communication_storage_push.sql',import.meta.url),'utf8'));
  await asActor(db,'op');const cid=(await chat(db,'CREATE',{peer:'cash'})).id;
  const asset=await chat(db,'RESERVE_ATTACHMENT',{conversation_id:cid,mime_type:'image/png',size_bytes:100});
  await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['wms-communication',asset.storage_path]);
  await assert.rejects(db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['wms-communication','other/path']),/row-level security/);
  await asActor(db,'cash');await assert.rejects(chat(db,'ATTACHMENT',{conversation_id:cid,id:asset.id}),/não autorizado/);
  await asActor(db,'op');await assert.rejects(chat(db,'SEND',{conversation_id:cid,body:'Foto',client_action_id:'20000000-0000-4000-8000-000000000001',attachments:[asset.id]}),/não validado/);
  await assert.rejects(db.query("select wms_chat_server('FINALIZE_ATTACHMENT',$1::jsonb)",[JSON.stringify({id:asset.id,actor:'op'})]),/permission denied/);
  await db.exec('reset role;set role service_role');
  await db.query("select wms_chat_server('FINALIZE_ATTACHMENT',$1::jsonb)",[JSON.stringify({id:asset.id,actor:'op'})]);
  await asActor(db,'op');const message=await chat(db,'SEND',{conversation_id:cid,body:'Foto',client_action_id:'20000000-0000-4000-8000-000000000001',attachments:[asset.id]});
  await asActor(db,'cash');assert.equal((await db.query('select count(*)::int n from storage.objects')).rows[0].n,1);
  const sub={endpoint:'https://fcm.googleapis.com/fcm/send/synthetic',keys:{p256dh:'a'.repeat(87),auth:'b'.repeat(22)}};
  await chat(db,'PUSH_SUBSCRIBE',sub);
  await asActor(db,'op');await assert.rejects(chat(db,'PUSH_SUBSCRIBE',sub),/outra conta/);
  await db.exec('reset role;set role service_role');
  const server=async(action,data={})=>(await db.query('select wms_chat_server($1,$2::jsonb) r',[action,JSON.stringify(data)])).rows[0].r;
  const claimed=await server('CLAIM');assert.equal(claimed.length,1);assert.equal(claimed[0].message_id,message.id);assert.equal(claimed[0].subscriptions.length,1);
  assert.deepEqual(await server('CLAIM'),[]);
  const subId=claimed[0].subscriptions[0].id;
  await server('FINISH',{message_id:message.id,profile_id:'cash',outcome:'DONE',accepted:[subId]});
  assert.deepEqual(await server('CLAIM'),[]);
  await asActor(db,'outsider');assert.equal((await db.query('select count(*)::int n from storage.objects')).rows[0].n,0);
  await asActor(db,'cash');assert.equal((await chat(db,'MESSAGES',{conversation_id:cid}))[0].receipts[0].delivered_at,null);
 }finally{await db.close();}
});
