import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";

test("expedition candidates include all active purchases without exposing profiles",async()=>{
  const db=new PGlite();
  try{
    await db.exec(`
      create schema auth;create schema private;create role anon;create role authenticated;
      create function auth.uid() returns uuid language sql as $$select '00000000-0000-0000-0000-000000000001'::uuid$$;
      create function private.current_wms_role() returns text language sql as $$select current_setting('test.role',true)$$;
      create function private.current_wms_profile_id() returns text language sql as $$select 'self'::text$$;
      create function private.can_access_warehouse(text) returns boolean language sql as $$select $1='22796'$$;
      create table public.wms_transfers(id text,warehouse_code text,is_deleted boolean,requires_invoice boolean);
      create table public.wms_users(id text,name text,role text,active boolean,archived boolean);
      insert into public.wms_transfers values('allowed','22796',false,true),('foreign','other',false,true);
      insert into public.wms_users values('self','Operator','OPERADOR',true,false),
        ('buy1','Buyer1','COMPRAS',true,false),('buy2','Buyer2','COMPRAS',true,null),
        ('inactive','Inactive','COMPRAS',false,false),('archived','Archived','COMPRAS',true,true);
      set test.role='COMPRAS';
    `);
    await db.exec(await readFile(new URL("../supabase/migrations/20261020173000_expedition_responsible_candidates.sql",import.meta.url),"utf8"));
    const rows=(await db.query("select * from public.wms_expedition_responsible_candidates('allowed')")).rows;
    assert.equal(rows.filter(r=>r.role==="COMPRAS").length,2);
    assert.equal(rows.length,2);
    assert.deepEqual(Object.keys(rows[0]).sort(),["id","name","role"]);
    await assert.rejects(db.query("select * from public.wms_expedition_responsible_candidates('foreign')"),/autorizada/);
    await db.exec("set test.role='OPERADOR'");
    await assert.rejects(db.query("select id from public.wms_expedition_responsible_candidates('allowed')"),/permissao/);
    await db.exec("set test.role='ATENDENTE'");
    await assert.rejects(db.query("select * from public.wms_expedition_responsible_candidates('allowed')"),/permissao/);
  }finally{await db.close();}
});
