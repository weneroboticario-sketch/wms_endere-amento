import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
const sql=await readFile(new URL('../supabase/migrations/20261109184545_wms_magazine_center.sql',import.meta.url),'utf8');
const uuid=()=>crypto.randomUUID();
async function fixture(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;create schema storage;grant usage on schema auth,private,storage to authenticated;
create function auth.uid() returns text language sql as $$select nullif(current_setting('test.actor',true),'')$$;
create table wms_users(id text primary key,role text,warehouse_code text,active boolean default true);
insert into wms_users values('adm','ADMINISTRADOR','VDCG',true),('sup','SUPERVISOR','VDCG',true),('op','OPERADOR','VDCG',true),('cash','CAIXA','VDCG',true),('other','ADMINISTRADOR','VDAR',true),('inactive','ADMINISTRADOR','VDCG',false);
create function private.current_wms_profile_id() returns text language sql stable security definer set search_path='' as $$select id from public.wms_users where id=auth.uid() and active$$;
create function private.current_wms_role() returns text language sql stable security definer set search_path='' as $$select role from public.wms_users where id=private.current_wms_profile_id()$$;
create function private.can_access_warehouse(code text) returns boolean language sql stable security definer set search_path='' as $$select coalesce((select warehouse_code=$1 from public.wms_users where id=private.current_wms_profile_id()),false)$$;
create table wms_products(sku text primary key,product_name text);insert into wms_products values('01314','Produto oficial'),('48060','Produto 48060');
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to authenticated;
create table physical_stock(sku text,quantity integer);insert into physical_stock values('01314',50);`);await db.exec(sql);return db;}
async function login(db,actor){await db.exec('reset role');await db.query("select set_config('test.actor',$1,false)",[actor]);await db.exec('set role authenticated');}
async function act(db,id,action,data={},rev=null,key=uuid(),warehouse='VDCG'){return (await db.query('select act_wms_magazine($1,$2,$3,$4,$5,$6) r',[warehouse,id,action,data,rev,key])).rows[0].r;}
async function draft(db,{pages=2,hash='a'.repeat(64)}={}){await login(db,'adm');const id=uuid(),version=uuid();let r=await act(db,id,'CREATE',{version_id:version,name:'Revista enviada',file_name:'revista.pdf',sha256:hash,byte_size:100,page_count:pages});await db.query("insert into storage.objects(bucket_id,name,metadata) values('wms-magazines',$1,'{\"size\":100,\"mimetype\":\"application/pdf\"}')",[r.version.file_path]);r=await act(db,id,'CONFIRM_UPLOAD',{},r.magazine.revision);return r;}
async function page(db,r,physical=1,items=[{sku:'01314',kind:'PRODUTO',status:'VALIDADO',extracted_description:'Texto da revista',visual_order:0}]){const lease=uuid();let claim=await act(db,r.magazine.id,'CLAIM',{version_id:r.version.id,physical_number:physical,lease_id:lease});return act(db,r.magazine.id,'SAVE_PAGE',{version_id:r.version.id,physical_number:physical,lease_id:lease,page_revision:claim.page.revision,source:'TEXT',items});}
async function metadata(db,r){const cycle=await act(db,uuid(),'CYCLE',{code:'2027-01',starts_on:'2027-01-01',ends_on:'2027-01-31'});return act(db,r.magazine.id,'METADATA',{cycle_id:cycle.cycle.id,name:'Revista configurada',brand:'Marca informada'},r.magazine.revision);}
test('PDF-only drafts accept missing cycle, upload is private, duplicates and unauthorized management are rejected',async()=>{const db=await fixture();try{
 const r=await draft(db);assert.equal(r.magazine.cycle_id,null);assert.equal(r.version.upload_state,'READY');assert.equal((await db.query('select * from wms_magazine_pages')).rows.length,2);
 for(const actor of ['sup','op','cash','other','inactive','']){await login(db,actor);await assert.rejects(act(db,r.magazine.id,'REPLACE',{},r.magazine.revision),/autorizado|encontrada/);assert.equal((await db.query('select * from wms_magazines')).rows.length,0);assert.equal((await db.query('select * from storage.objects')).rows.length,0);}
 await login(db,'adm');await assert.rejects(act(db,uuid(),'CREATE',{name:'duplicada',version_id:uuid(),file_name:'a.pdf',sha256:'a'.repeat(64),byte_size:100,page_count:2}),/unique|duplicate/);
 await assert.rejects(db.exec("update wms_magazines set status='PUBLISHED'"),/permission denied/);
 await db.exec('reset role');assert.equal((await db.query('select public from storage.buckets')).rows[0].public,false);
 }finally{await db.close();}});
test('page save is idempotent and revision/lease protected; catalogue lookup does not invent unknown codes',async()=>{const db=await fixture();try{
 let r=await draft(db);const lease=uuid(),claim=await act(db,r.magazine.id,'CLAIM',{version_id:r.version.id,physical_number:1,lease_id:lease});
 await assert.rejects(act(db,r.magazine.id,'CLAIM',{version_id:r.version.id,physical_number:1,lease_id:uuid()}),/outra sessão/);
 const data={version_id:r.version.id,physical_number:1,lease_id:lease,page_revision:claim.page.revision,source:'OCR',items:[{sku:'1314',kind:'PRODUTO',status:'VALIDADO'},{sku:'99999',kind:'KIT',status:'VALIDADO'}]},key=uuid();r=await act(db,r.magazine.id,'SAVE_PAGE',data,null,key);await act(db,r.magazine.id,'SAVE_PAGE',data,null,key);
 const rows=(await db.query('select * from wms_magazine_items order by sku')).rows;assert.equal(rows.length,2);assert.equal(rows[0].sku,'1314');assert.equal(rows[0].catalog_sku,'01314');assert.equal(rows[1].sku,'99999');assert.equal(rows[1].status,'NAO_ENCONTRADO');
 await assert.rejects(act(db,r.magazine.id,'EDIT_ITEMS',{...data,page_revision:0}),/Página alterada/);
 await assert.rejects(db.exec('delete from wms_magazine_events'),/permission denied/);
 }finally{await db.close();}});
test('printed mapping, partial publication and human review keep incomplete pages explicit',async()=>{const db=await fixture();try{
 let r=await draft(db,{pages:3});r=await metadata(db,r);r=await page(db,r,3);
 await assert.rejects(act(db,r.magazine.id,'PUBLISH',{},r.magazine.revision),/numeração|revisadas/);
 r=await act(db,r.magazine.id,'MAP_OFFSET',{first_physical:3,first_printed:1,verified:true},r.magazine.revision);
 const p=(await db.query('select * from wms_magazine_pages where physical_number=3')).rows[0];assert.equal(p.printed_number,1);
 r=await act(db,r.magazine.id,'PARTIAL',{},r.magazine.revision);await login(db,'op');assert.equal((await db.query('select * from wms_magazines')).rows[0].status,'PARTIAL');assert.equal((await db.query('select * from storage.objects')).rows.length,1);
 await login(db,'other');assert.equal((await db.query('select * from storage.objects')).rows.length,0);
 await login(db,'adm');r=await act(db,r.magazine.id,'UNPUBLISH',{},r.magazine.revision);r=await act(db,r.magazine.id,'REVIEW_PAGE',{version_id:r.version.id,physical_number:3,page_revision:p.revision,confirm_complete:true});
 assert.equal(r.page.review_status,'REVISADA');await db.exec('reset role');assert.equal((await db.query('select quantity from physical_stock')).rows[0].quantity,50);
 }finally{await db.close();}});
test('replacement preserves original PDF/index and publication requires cycle; invalid dates fail atomically',async()=>{const db=await fixture();try{
 let r=await draft(db);r=await page(db,r);await assert.rejects(act(db,r.magazine.id,'PUBLISH',{},r.magazine.revision),/ciclo/);
 const old=r.version.id;r=await act(db,r.magazine.id,'REPLACE',{version_id:uuid(),file_name:'nova.pdf',sha256:'b'.repeat(64),byte_size:110,page_count:1},r.magazine.revision);
 assert.notEqual(r.version.id,old);assert.equal((await db.query('select count(*)::int n from wms_magazine_versions')).rows[0].n,2);assert.equal((await db.query('select count(*)::int n from wms_magazine_items')).rows[0].n,1);
 await assert.rejects(act(db,uuid(),'CYCLE',{code:'inválido',starts_on:'2027-02-01',ends_on:'2027-01-01'}),/check constraint/);
 }finally{await db.close();}});
