import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
test("Pulmao import is isolated, idempotent and restricted to requested units",async()=>{
  const db=new PGlite();try{
    await db.exec(`create schema auth;create schema private;create role anon;create role authenticated;
      grant usage on schema auth,private,public to authenticated,anon;
      create function auth.uid() returns uuid language sql as $$select '00000000-0000-0000-0000-000000000001'::uuid$$;
      create function private.has_wms_role(text[]) returns boolean language sql as $$select current_setting('test.role')=any($1)$$;
      create function private.current_wms_allowed_warehouses() returns text[] language sql as $$select array['22796','23696','14177']$$;
      create table wms_stock_import_batches(id text,warehouse_code text,source_type text,status text);
      insert into wms_stock_import_batches values('p','22796','PULMAO','PROCESSING'),('p2','23696','PULMAO','PROCESSING');
      create table wms_stock_positions(id text primary key,created_at timestamptz,updated_at timestamptz,
        warehouse_code text,source_type text,batch_id text,codigo_material text,nome_material text,
        total_fisico numeric,total_alocado numeric,total_disponivel numeric,estacao text,rack text,linha text,
        coluna text,codigo_endereco text,active boolean,is_sellable boolean,record_hash text,last_seen_batch_id text);
      create unique index wms_stock_positions_active_location_uidx on wms_stock_positions
        (warehouse_code,source_type,codigo_material,coalesce(codigo_endereco,'')) where active is true;
      insert into wms_stock_positions(id,warehouse_code,source_type,codigo_material,codigo_endereco,active,total_disponivel)
        values('capture','22796','CAPTACAO','00178','A',true,10),('store','22796','LOJA','00178','A',true,5);
      alter table wms_stock_positions enable row level security;
      create policy scope on wms_stock_positions to authenticated using(warehouse_code=any(private.current_wms_allowed_warehouses())) with check(warehouse_code=any(private.current_wms_allowed_warehouses()));
      grant select,insert,update on wms_stock_positions to authenticated;grant select,insert on wms_stock_import_batches to authenticated;
      select set_config('test.role','OPERADOR',false);`);
    await db.exec(await readFile(new URL("../supabase/migrations/20261014154110_stock_pulmao_sources.sql",import.meta.url),"utf8"));
    await db.exec("set role authenticated");
    const row={id:"pulmao",warehouse_code:"22796",source_type:"PULMAO",batch_id:"p",codigo_material:"00178",codigo_endereco:"A",active:true,total_disponivel:20};
    const write=(row,warehouse="22796",batch="p")=>db.query("select wms_upsert_import_positions($1,'PULMAO',$2,$3::jsonb)",[warehouse,batch,JSON.stringify([row])]);
    await write(row);await write({...row,id:"retry",total_disponivel:25});
    const actual=(await db.query("select id,source_type,total_disponivel from wms_stock_positions where warehouse_code='22796' order by id")).rows;
    assert.equal(actual.length,3);assert.equal(Number(actual.find(r=>r.id==="capture").total_disponivel),10);
    assert.equal(Number(actual.find(r=>r.id==="store").total_disponivel),5);assert.equal(Number(actual.find(r=>r.id==="pulmao").total_disponivel),25);
    await write({...row,id:"second-unit",warehouse_code:"23696",batch_id:"p2"},"23696","p2");
    await assert.rejects(write(row,"14177"),/Pulmao indisponivel/);
    await assert.rejects(write({...row,warehouse_code:"23696"}),/fora do escopo/);
    await assert.rejects(db.exec("insert into wms_stock_import_batches values('bad','14177','PULMAO','PROCESSING')"),/check constraint/);
    await db.exec("select set_config('test.role','COMPRAS',false)");
    await assert.rejects(write(row),/nao autorizado/);
  }finally{await db.close();}
});
