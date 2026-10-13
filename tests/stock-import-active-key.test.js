import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";

test("import reconciles a different ID against the active location key and retains RLS", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema auth;create schema private;create role anon;create role authenticated;
      grant usage on schema auth,private,public to authenticated,anon;
      create function auth.uid() returns uuid language sql as $$select '00000000-0000-0000-0000-000000000001'::uuid$$;
      create function private.has_wms_role(text[]) returns boolean language sql as $$select true$$;
      create function private.current_wms_allowed_warehouses() returns text[] language sql as $$select array['14177']$$;
      create table wms_stock_import_batches(id text,warehouse_code text,source_type text,status text);
      insert into wms_stock_import_batches values('batch','14177','CAPTACAO','PROCESSING');
      create table wms_stock_positions(id text primary key,created_at timestamptz,updated_at timestamptz,
        warehouse_code text,source_type text,batch_id text,codigo_material text,nome_material text,
        total_fisico numeric,total_alocado numeric,total_disponivel numeric,estacao text,rack text,linha text,
        coluna text,codigo_endereco text,active boolean,is_sellable boolean,record_hash text,last_seen_batch_id text);
      create unique index wms_stock_positions_active_location_uidx on wms_stock_positions
        (warehouse_code,source_type,codigo_material,coalesce(codigo_endereco,'')) where active is true;
      insert into wms_stock_positions(id,warehouse_code,source_type,codigo_material,codigo_endereco,active,total_disponivel)
        values('original','14177','CAPTACAO','00178',null,true,2),('history','14177','CAPTACAO','00178','',false,1);
      alter table wms_stock_positions enable row level security;
      create policy own_stock on wms_stock_positions to authenticated using(warehouse_code='14177') with check(warehouse_code='14177');
      grant select,insert,update on wms_stock_positions to authenticated;
      grant select on wms_stock_import_batches to authenticated;`);
    await db.exec(await readFile(new URL('../supabase/migrations/20261013210945_stock_import_active_key_upsert.sql',import.meta.url),'utf8'));
    await db.exec('set role authenticated');
    const row = {id:'new-id',warehouse_code:'14177',source_type:'CAPTACAO',batch_id:'batch',codigo_material:'00178',codigo_endereco:'',active:true,total_disponivel:5};
    await assert.rejects(db.query(`insert into wms_stock_positions(id,warehouse_code,source_type,codigo_material,codigo_endereco,active)
      values('new-id','14177','CAPTACAO','00178','',true) on conflict(id) do update set active=true`),/active_location_uidx/);
    const write = (rows,warehouse='14177') => db.query('select public.wms_upsert_import_positions($1,$2,$3,$4::jsonb) as n',[warehouse,'CAPTACAO','batch',JSON.stringify(rows)]);
    assert.equal((await write([row,{...row,id:'second-id',total_disponivel:7}])).rows[0].n,1);
    assert.equal((await write([{...row,id:'third-id',total_disponivel:9}])).rows[0].n,1);
    const actual = (await db.query('select id,total_disponivel from wms_stock_positions where active is true')).rows;
    assert.equal(actual.length,1);assert.equal(actual[0].id,'original');assert.equal(Number(actual[0].total_disponivel),9);
    assert.equal((await write([{...row,id:'another-sku',codigo_material:'48062',total_disponivel:3}])).rows[0].n,1);
    assert.equal((await db.query("select count(*)::int as n from wms_stock_positions where active=true and coalesce(codigo_endereco,'')=''")).rows[0].n,2);
    assert.equal((await db.query("select count(*)::int as n from wms_stock_positions where id='history' and active=false")).rows[0].n,1);
    await assert.rejects(write([row],'22796'),/nao autorizado/);
    await assert.rejects(write([{...row,warehouse_code:'22796'}]),/fora do escopo/);
    await assert.rejects(write(Array(501).fill(row)),/Limite/);
    await db.exec('set role anon');await assert.rejects(write([row]),/permission denied/);
  } finally {await db.close();}
});
