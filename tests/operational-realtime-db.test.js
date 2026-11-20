import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
test('Realtime publication is additive, idempotent and refuses a table without RLS',async()=>{
  const db=new PGlite();try{
    const sql=await readFile(new URL('../supabase/proposals/wms_operational_realtime.sql',import.meta.url),'utf8');
    await db.exec('create publication supabase_realtime;create table wms_caixa_requests(id int);create table wms_caixa_request_messages(id int);create table operacao_tarefas(id int);');
    await assert.rejects(db.exec(sql),/sem RLS/);
    await db.exec('alter table wms_caixa_requests enable row level security;alter table wms_caixa_request_messages enable row level security;alter table operacao_tarefas enable row level security;');
    await db.exec(sql);await db.exec(sql);
    assert.equal((await db.query("select count(*)::int n from pg_publication_tables where pubname='supabase_realtime'")).rows[0].n,3);
  }finally{await db.close();}
});

test('Caixa-only Realtime migration is idempotent, requires RLS and authenticated SELECT policies',async()=>{
  const db=new PGlite();
  try {
    const sql=await readFile(new URL('../supabase/migrations/20261120120000_wms_caixa_realtime_publication.sql',import.meta.url),'utf8');
    await db.exec("create role authenticated;create publication supabase_realtime;create table wms_caixa_requests(id int);create table wms_caixa_request_messages(id int);create table wms_stock_positions(id int);");
    await assert.rejects(db.exec(sql),/sem RLS/);
    await db.exec("alter table wms_caixa_requests enable row level security;alter table wms_caixa_request_messages enable row level security;");
    await assert.rejects(db.exec(sql),/sem politica SELECT/);
    await db.exec("create policy caixa_requests_select on wms_caixa_requests for select to authenticated using (true);create policy caixa_messages_select on wms_caixa_request_messages for select to authenticated using (true);");
    await db.exec(sql);await db.exec(sql);
    const publications=(await db.query("select tablename from pg_publication_tables where pubname='supabase_realtime' order by tablename")).rows.map(row=>row.tablename);
    assert.deepEqual(publications,['wms_caixa_request_messages','wms_caixa_requests']);
  } finally { await db.close(); }
});
