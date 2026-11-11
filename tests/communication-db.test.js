import test from 'node:test';import assert from 'node:assert/strict';
import {communicationFixture,asActor,chat} from './communication-fixture.js';
test('corporate communication enforces membership, replay protection, receipts, scope and task identity',async t=>{
 const db=await communicationFixture();let cid,mid,group,req;
 const key='10000000-0000-4000-8000-000000000001';
 try{
  await t.test('roles use existing login; direct pair is unique and outsiders including admins cannot read',async()=>{
   await asActor(db,'op');cid=(await chat(db,'CREATE',{peer:'cash'})).id;
   assert.ok((await chat(db,'DIRECTORY')).some(person=>person.id==='cash'));
   assert.ok(!(await chat(db,'DIRECTORY')).some(person=>person.id==='other'));
   assert.equal((await chat(db,'CREATE',{peer:'cash'})).id,cid);
   await assert.rejects(chat(db,'CREATE',{type:'GROUP',members:['cash'],title:'Grupo'}),/não autorizada/);
   await assert.rejects(chat(db,'CREATE',{peer:'other'}),/Destinatário/);
   await asActor(db,'outsider');assert.deepEqual(await chat(db,'LIST'),[]);await assert.rejects(chat(db,'MESSAGES',{conversation_id:cid}),/não autorizada/);
   assert.equal((await db.query('select count(*)::int n from wms_chat_messages')).rows[0].n,0);
  });
  await t.test('messages persist once, sender cannot be spoofed and retries with another body are rejected',async()=>{
   await asActor(db,'op');const payload={conversation_id:cid,body:'Olá caixa',client_action_id:key,sender_profile_id:'admin'};
   mid=(await chat(db,'SEND',payload)).id;
   assert.equal((await chat(db,'SEND',payload)).id,mid);
   await assert.rejects(chat(db,'SEND',{...payload,body:'Outro texto'}),/outro conteúdo/);
   const messages=await chat(db,'MESSAGES',{conversation_id:cid});assert.equal(messages.length,1);assert.equal(messages[0].sender_profile_id,'op');assert.equal(messages[0].receipts[0].delivered_at,null);
  });
  await t.test('only own receipts can change; read differs from acknowledgment; disconnected messages remain unread',async()=>{
   await asActor(db,'cash');assert.equal((await chat(db,'UNREAD')).count,1);
   await chat(db,'RECEIPT',{conversation_id:cid,ids:[mid],state:'DELIVERED',profile_id:'op'});
   let messages=await chat(db,'MESSAGES',{conversation_id:cid});assert.ok(messages[0].receipts[0].delivered_at);assert.equal(messages[0].receipts[0].read_at,null);
   await chat(db,'RECEIPT',{conversation_id:cid,ids:[mid],state:'READ'});assert.equal((await chat(db,'UNREAD')).count,0);
   messages=await chat(db,'MESSAGES',{conversation_id:cid});assert.equal(messages[0].receipts[0].acknowledged_at,null);
   await chat(db,'RECEIPT',{conversation_id:cid,ids:[mid],state:'ACK'});assert.ok((await chat(db,'MESSAGES',{conversation_id:cid}))[0].receipts[0].acknowledged_at);
  });
  await t.test('foreign unit, inactive account, anonymous and direct table mutation are denied',async()=>{
   await asActor(db,'other');await assert.rejects(chat(db,'MESSAGES',{conversation_id:cid},'VDAR'),/não autorizada/);
   await asActor(db,'op');await assert.rejects(db.query("update wms_chat_messages set body='hack'"),/permission denied/);
   await db.exec("reset role;update wms_users set active=false where id='op';set role authenticated");
   await assert.rejects(chat(db,'LIST'),/não autorizada/);
   await db.exec("reset role;update wms_users set active=true where id='op';set role anon");
   await assert.rejects(chat(db,'LIST'),/permission denied/);
  });
  await t.test('group management requires membership and leadership; removed users lose messages and rejoin cannot read old history',async()=>{
   await asActor(db,'admin');group=(await chat(db,'CREATE',{type:'GROUP',title:'Estoque Geral',members:['op','cash']})).id;
   await chat(db,'SEND',{conversation_id:group,body:'Contexto restrito',client_action_id:'10000000-0000-4000-8000-000000000002'});
   await asActor(db,'outsider');await assert.rejects(chat(db,'GROUP',{conversation_id:group,operation:'ADD',profile_id:'outsider'}),/não autorizada/);
   await asActor(db,'admin');await chat(db,'GROUP',{conversation_id:group,operation:'REMOVE',profile_id:'cash'});
   await asActor(db,'cash');await assert.rejects(chat(db,'MESSAGES',{conversation_id:group}),/não autorizada/);
   await asActor(db,'admin');await chat(db,'GROUP',{conversation_id:group,operation:'ADD',profile_id:'cash'});
   await asActor(db,'cash');assert.deepEqual(await chat(db,'MESSAGES',{conversation_id:group}),[]);
  });
  await t.test('operational links validate original process and warehouse; private Caixa request is not exposed',async()=>{
   await asActor(db,'cash');await assert.rejects(chat(db,'PROCESS',{type:'TRANSFER',id:'transfer-1'}),/não autorizada/);
   await asActor(db,'op');assert.equal((await chat(db,'PROCESS',{type:'TRANSFER',id:'transfer-1'})).id,'transfer-1');
   assert.equal((await chat(db,'PROCESS',{type:'SKU',id:'01314'})).id,'01314');
   await assert.rejects(chat(db,'PROCESS',{type:'TRANSFER',id:'transfer-1'},'VDAR'),/não autorizada/);
   await asActor(db,'admin');const message=await chat(db,'SEND',{conversation_id:group,body:'Conferir item',client_action_id:'10000000-0000-4000-8000-000000000003',process:{type:'SKU',id:'01314'}});
   req=await chat(db,'CREATE_REQUEST',{conversation_id:group,message_id:message.id,title:'Conferir produto',assignee:'op'});
   assert.equal((await chat(db,'CREATE_REQUEST',{conversation_id:group,message_id:message.id,assignee:'op'})).linked_task_id,req.linked_task_id);
  });
  await t.test('quick actions use existing task lifecycle; operator completion awaits leader validation',async()=>{
   await asActor(db,'cash');await assert.rejects(chat(db,'REQUEST_ACTION',{conversation_id:group,request_id:req.id,operation:'FINALIZADO'}),/responsável/);
   await asActor(db,'op');await chat(db,'REQUEST_ACTION',{conversation_id:group,request_id:req.id,operation:'RECEBIDO'});
   await chat(db,'REQUEST_ACTION',{conversation_id:group,request_id:req.id,operation:'EM_ANDAMENTO'});
   await chat(db,'REQUEST_ACTION',{conversation_id:group,request_id:req.id,operation:'FINALIZADO'});
   assert.equal((await chat(db,'REQUESTS'))[0].status,'AGUARDANDO CONFIRMAÇÃO');
   await asActor(db,'admin');await chat(db,'REQUEST_ACTION',{conversation_id:group,request_id:req.id,operation:'VALIDAR'});
   const requests=await chat(db,'REQUESTS');assert.equal(requests[0].status,'FINALIZADO');assert.equal(requests[0].events.length,5);
   await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from operacao_tarefas')).rows[0].n,1);
   assert.equal(Number((await db.query('select qty from stock_balance')).rows[0].qty),20);
  });
  await t.test('attendant and supervisor access, original replenishment privacy and collective urgency are enforced',async()=>{
   await asActor(db,'att');assert.ok((await chat(db,'DIRECTORY')).length);
   await assert.rejects(chat(db,'PROCESS',{type:'REPLENISHMENT',id:'rep-1'}),/não encontrado|negado/);
   const direct=await chat(db,'CREATE',{peer:'cash'});assert.ok(direct.id);
   await asActor(db,'cash');assert.equal((await chat(db,'PROCESS',{type:'REPLENISHMENT',id:'rep-1'})).priority,'NORMAL');
   await assert.rejects(chat(db,'SEND',{conversation_id:group,body:'Urgente',priority:'URGENT',client_action_id:'10000000-0000-4000-8000-000000000004'}),/liderança/);
   await asActor(db,'sup');assert.ok((await chat(db,'CREATE',{type:'GROUP',title:'Liderança',members:['op']})).id);
   await assert.rejects(chat(db,'POLICY',{retention_days:0,urgent_per_hour:999}),/check constraint/);
  });
  await t.test('history pages are stable, foreign replies denied, and urgent limits apply before persistence',async()=>{
   await asActor(db,'admin');await chat(db,'POLICY',{retention_days:365,urgent_per_hour:1});
   const urgent=await chat(db,'SEND',{conversation_id:group,body:'Urgente de teste',priority:'URGENT',client_action_id:'10000000-0000-4000-8000-000000000005'});
   await assert.rejects(chat(db,'SEND',{conversation_id:group,body:'Segunda urgência',priority:'URGENT',client_action_id:'10000000-0000-4000-8000-000000000006'}),/urgências por hora/);
   await assert.rejects(chat(db,'SEND',{conversation_id:group,body:'Resposta indevida',reply_to:mid,client_action_id:'10000000-0000-4000-8000-000000000007'}),/respondida não autorizada/);
   await db.exec('reset role');
   await db.query(`insert into wms_chat_messages(conversation_id,sender_profile_id,client_action_id,body,client_payload)
    select $1,'admin',('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Histórico '||n,'{}' from generate_series(1,45) n`,[group]);
   await asActor(db,'admin');const newest=await chat(db,'MESSAGES',{conversation_id:group});assert.equal(newest.length,40);
   const earlier=await chat(db,'MESSAGES',{conversation_id:group,before_id:newest[0].id});
   assert.ok(earlier.length>0);assert.equal(new Set([...newest,...earlier].map(m=>m.id)).size,newest.length+earlier.length);
   assert.ok([...newest,...earlier].some(m=>m.id===urgent.id));
  });
 }finally{await db.close();}
});
