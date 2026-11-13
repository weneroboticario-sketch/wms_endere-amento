import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const directory=new URL('../supabase/migrations/',import.meta.url);
const migration=await readFile(new URL('20261109140435_wms_packing_traceability.sql',directory),'utf8');
async function fixture(){
 const db=new PGlite();
 await db.exec(`create role authenticated;create role anon;create schema private;create schema auth;grant usage on schema private,auth to authenticated;
 create function auth.uid() returns text language sql as $$select nullif(current_setting('test.actor',true),'')$$;`);
 const baseline=await readFile(new URL('20260923000000_legacy_baseline.sql',directory),'utf8');
 for(const table of ['wms_users','wms_transfers','wms_transfer_items','wms_transfer_events','wms_transfer_divergences']){
  const create=baseline.match(new RegExp(`create table if not exists public\\.${table} \\([\\s\\S]*?\\n\\);`,'i'));
  assert.ok(create,table);await db.exec(create[0]);
 }
 for(const name of (await readdir(directory)).sort()){
  if(name>='20261109140435')continue;
  const source=await readFile(new URL(name,directory),'utf8');
  const adds=source.match(/alter table (?:public\.)?wms_(?:users|transfers|transfer_items|transfer_events|transfer_divergences) add column if not exists [^;]+;/gi)||[];
  for(const sql of adds)await db.exec(sql);
 }
 await db.exec(`alter table wms_transfers add column flow_type text;alter table wms_transfers add column tipo_fluxo text;alter table wms_transfers add column tipo_transferencia text;
 create function private.current_wms_profile_id() returns text language sql stable security definer as $$select id from public.wms_users where id=auth.uid() and active$$;
 create function private.current_wms_role() returns text language sql stable security definer as $$select role from public.wms_users where id=private.current_wms_profile_id()$$;
 create function private.can_access_warehouse(code text) returns boolean language sql stable security definer as $$select coalesce((select warehouse_code=code from public.wms_users where id=private.current_wms_profile_id()),false)$$;
 insert into wms_users(id,username,name,role,active,warehouse_code) select id,id,name,role,true,warehouse from (values('op','Operador','OPERADOR','VDCG'),('adm','Administrador','ADMINISTRADOR','VDCG'),('foreign','Outro','OPERADOR','VDAR'),('cash','Caixa','CAIXA','VDCG')) v(id,name,role,warehouse);
 insert into wms_transfers(id,status,responsavel_id,warehouse_code,flow_type) values('t','EM_LACRE','op','VDCG','TRANSFERENCIA_EXCEL');
 insert into wms_transfer_items(id,transfer_id,sku,quantidade_solicitada,quantidade_separada,quantidade_lacrada,warehouse_code) values('i','t','01314',4,4,0,'VDCG');
 grant select on wms_users,wms_transfers,wms_transfer_items to authenticated;`);
 await db.exec(migration);return db;
}
async function login(db,actor){await db.exec('reset role');await db.query("select set_config('test.actor',$1,false)",[actor]);await db.exec('set role authenticated');}
async function act(db,operation,quantity,revision,id=crypto.randomUUID(),extra={}){
 return (await db.query('select apply_wms_packing_action($1,$2,$3,$4,$5,$6) result',['t','i','VDCG',id,revision,{operation,quantity,code_method:'MODO_SCANNER',raw_code:'01314',...extra}])).rows[0].result;
}
test('packing RPC atomically records manual quantities, replays lost acknowledgement and rejects stale revisions',async()=>{
 const db=await fixture();try{
  await login(db,'op');const id=crypto.randomUUID();const first=await act(db,'QUANTIDADE_MANUAL',4,0,id);
  assert.equal(Number(first.item.quantidade_lacrada),4);assert.equal(Number(first.item.quantidade_enviada),4);assert.equal(Number(first.item.diferenca),0);
  const retry=await act(db,'QUANTIDADE_MANUAL',4,0,id);assert.equal(retry.replayed,true);assert.equal(Number(retry.item.quantidade_lacrada),4);
  await assert.rejects(act(db,'QUANTIDADE_MANUAL',1,0),/alterado/);
  assert.equal((await db.query('select count(*)::int n from wms_transfer_events')).rows[0].n,1);
  await assert.rejects(act(db,'QUANTIDADE_MANUAL',5,0,id),/reutilizado/);
 }finally{await db.close();}
});
test('packing permissions exclude CAIXA and other warehouses; history is immutable',async()=>{
 const db=await fixture();try{
  await login(db,'op');await act(db,'LEITURA_UNITARIA',1,0);
  await assert.rejects(db.exec("insert into wms_transfer_events(id) values('forged')"),/permission denied/);
  for(const actor of ['cash','foreign']){await login(db,actor);assert.equal((await db.query('select * from wms_transfer_events')).rows.length,0);await assert.rejects(act(db,'QUANTIDADE_MANUAL',1,1),/autorizad/);}
  await db.exec('reset role');await assert.rejects(db.exec('delete from wms_transfer_events'),/imutável/);
  await assert.rejects(db.exec('update wms_transfer_items set quantidade_lacrada=99'),/sem auditoria/);
 }finally{await db.close();}
});
test('audit insertion failure rolls back item and summary; four sequential scanner reads and correction remain consistent',async()=>{
 const db=await fixture();try{
  await db.exec(`create function public.fail_audit() returns trigger language plpgsql as $$begin raise exception 'simulated audit failure';end$$;create trigger fail_audit before insert on wms_transfer_events for each row execute function public.fail_audit();`);
  await login(db,'op');await assert.rejects(act(db,'QUANTIDADE_MANUAL',4,0),/simulated audit failure/);
  assert.equal(Number((await db.query("select quantidade_lacrada from wms_transfer_items where id='i'")).rows[0].quantidade_lacrada),0);
  await db.exec('reset role;drop trigger fail_audit on wms_transfer_events');await login(db,'op');
  for(let revision=0;revision<4;revision++)await act(db,'LEITURA_UNITARIA',1,revision);
  const corrected=await act(db,'AJUSTE_QUANTIDADE',3,4,crypto.randomUUID(),{reason:'Contagem revisada'});
  assert.equal(Number(corrected.item.quantidade_lacrada),3);assert.equal(Number(corrected.transfer.total_packed_quantity),3);assert.equal(Number(corrected.item.diferenca),-1);
  assert.equal((await db.query('select count(*)::int n from wms_transfer_events')).rows[0].n,5);
 }finally{await db.close();}
});
test('finalization refuses missing quantities and requires reason for divergence; normal completion is explicit',async()=>{
 const db=await fixture();try{
  await login(db,'op');const packed=await act(db,'QUANTIDADE_MANUAL',4,0);
  const final=await act(db,'FINALIZACAO',0,0,crypto.randomUUID(),{final_boxes:1,expected_updated_at:packed.transfer.updated_at});
  assert.equal(final.transfer.status,'PRONTA_PARA_NOTA');
  assert.equal(Number(final.transfer.total_enviado),4);
  await assert.rejects(act(db,'QUANTIDADE_MANUAL',1,1),/fora da etapa/);
  await db.exec("reset role;update wms_transfers set status='EM_LACRE'");
  await assert.rejects(db.exec("update wms_transfers set status='PRONTA_PARA_NOTA'"),/auditoria transacional/);
 }finally{await db.close();}
});
test('code capture is independent from manual amount and mismatched raw codes are rejected',async()=>{
 const db=await fixture();try{
  await login(db,'op');await assert.rejects(act(db,'LEITURA_SKU',0,0,crypto.randomUUID(),{raw_code:'99999'}),/não corresponde/);
  const read=await act(db,'LEITURA_SKU',0,0,crypto.randomUUID(),{raw_code:'1314'});
  assert.equal(Number(read.item.quantidade_lacrada),0);assert.equal(read.event.payload.raw_code,'1314');
  const manual=await act(db,'QUANTIDADE_MANUAL',4,1);
  assert.equal(manual.event.quantity_method,'MANUAL');assert.equal(manual.event.payload.code_reads,0);
  assert.equal((await db.query("select sum((payload->>'code_reads')::int)::int n from wms_transfer_events")).rows[0].n,1);
 }finally{await db.close();}
});
test('CX first conversion is 3 x 24 = 72; explicit mixed quantities remain actual units',async()=>{
 const db=await fixture();try{
  await db.exec("update wms_transfer_items set quantidade_solicitada=3,quantidade_separada=3,unidade_medida='CX',tipo_quantidade='CAIXA'");
  await login(db,'op');const packed=await act(db,'QUANTIDADE_MANUAL',3,0,crypto.randomUUID(),{units_per_box:24});
  assert.equal(Number(packed.item.quantidade_lacrada),3);assert.equal(Number(packed.item.quantidade_enviada),72);assert.equal(Number(packed.transfer.total_previsto),72);assert.equal(Number(packed.item.diferenca),0);
  const mixed=await act(db,'CORRECAO',3,1,crypto.randomUUID(),{mixed:true,units:70,units_per_box:24,reason:'Caixa mista conferida'});
  assert.equal(Number(mixed.item.quantidade_lacrada_unidades),70);assert.equal(Number(mixed.item.diferenca),-2);
 }finally{await db.close();}
});
test('incomplete, extra and excess require explicit divergence while direct summary and identity edits fail',async()=>{
 const db=await fixture();try{
  await login(db,'op');const partial=await act(db,'QUANTIDADE_MANUAL',3,0);
  await assert.rejects(act(db,'FINALIZACAO',0,0,crypto.randomUUID(),{final_boxes:1,expected_updated_at:partial.transfer.updated_at}),/divergência/);
  const final=await act(db,'FINALIZACAO',0,0,crypto.randomUUID(),{final_boxes:1,expected_updated_at:partial.transfer.updated_at,allow_divergence:true,reason:'Falta uma unidade'});
  assert.equal(final.transfer.status,'PRONTA_PARA_NOTA_COM_DIVERGENCIA');
  await db.exec('reset role');await assert.rejects(db.exec('update wms_transfers set total_enviado=99'),/Resumo incompatível/);
  await assert.rejects(db.exec('update wms_transfers set packing_audit_version=0'),/protegidos/);
  await assert.rejects(db.exec("update wms_transfer_items set sku='999'"),/protegidas/);
 }finally{await db.close();}
});
test('excess and extras are explicit; removal keeps both the extra row and its audit',async()=>{
 const db=await fixture();try{
  await login(db,'op');const excess=await act(db,'QUANTIDADE_MANUAL',5,0);assert.equal(Number(excess.item.diferenca),1);
  const extra=await act(db,'ITEM_EXTRA',2,0,crypto.randomUUID(),{sku:'99999',raw_code:'99999',reason:'Produto adicional autorizado',code_read:true});
  assert.equal(extra.item.is_extra,true);assert.equal(extra.item.divergence_type,'ITEM_EXTRA');assert.equal(Number(extra.transfer.total_packed_quantity),7);
  const removed=(await db.query('select apply_wms_packing_action($1,$2,$3,$4,$5,$6) r',['t',extra.item.id,'VDCG',crypto.randomUUID(),1,{operation:'REMOCAO_DA_CAIXA',quantity:0,reason:'Extra devolvido',code_method:'NAO_IDENTIFICADO'}])).rows[0].r;
  assert.equal(removed.item.status,'REMOVIDO');assert.equal(Number(removed.transfer.total_packed_quantity),5);
  assert.equal((await db.query('select count(*)::int n from wms_transfer_events where item_id=$1',[extra.item.id])).rows[0].n,2);
 }finally{await db.close();}
});
test('legacy boxes require explicit conversion correction and never gain fabricated scanner provenance',async()=>{
 const db=await fixture();try{
  await db.exec("alter table wms_transfer_items disable trigger check_packing_item_audit;update wms_transfer_items set quantidade_solicitada=3,quantidade_separada=3,quantidade_lacrada=3,unidade_medida='CX',tipo_quantidade='CAIXA';alter table wms_transfer_items enable trigger check_packing_item_audit;");
  await login(db,'op');await assert.rejects(act(db,'QUANTIDADE_MANUAL',1,0,crypto.randomUUID(),{units_per_box:24}),/correção explícita/);
  const corrected=await act(db,'CORRECAO',3,0,crypto.randomUUID(),{units_per_box:24,reason:'Conversão 24 conferida presencialmente'});
  assert.equal(Number(corrected.event.quantity_before),72);assert.equal(Number(corrected.event.quantity_after),72);assert.equal(Number(corrected.event.quantity),0);
  assert.equal(corrected.event.quantity_method,'AJUSTE');
  await assert.rejects(act(db,'FINALIZACAO',0,0,crypto.randomUUID(),{final_boxes:3,expected_updated_at:corrected.transfer.updated_at}),/histórico incompleto/);
 }finally{await db.close();}
});
