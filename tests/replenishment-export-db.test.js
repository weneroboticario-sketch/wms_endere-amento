import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("export batches stamp once, allow repeat downloads and new requests, and enforce warehouse access", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create schema private;
      create function auth.uid() returns uuid language sql as $$select '00000000-0000-0000-0000-000000000001'::uuid$$;
      create function private.has_wms_role(text[]) returns boolean language sql as $$select current_setting('test.profile') = any($1)$$;
      create function private.current_wms_allowed_warehouses() returns text[] language sql as $$select array['VDCG']::text[]$$;
      create table public.wms_schema_version(id text primary key,version text,description text,applied_at timestamptz,applied_by text);
      create table public.wms_replenishment_requests(id text primary key,warehouse_code text,codigo_material text,
        quantidade_atendida numeric,status text,is_deleted boolean default false,finished_at timestamptz,updated_at timestamptz default now());
      insert into public.wms_replenishment_requests(id,warehouse_code,codigo_material,quantidade_atendida,status) values
        ('1','VDCG','00178',3,'CONCLUIDO'),('2','VDCG','00178',0,'CONCLUIDO'),
        ('3','VDCO','00178',4,'CONCLUIDO'),('4','VDCG','48062',5,'PENDENTE');`);
    await db.exec(await readFile(new URL("../supabase/migrations/20261010122825_replenishment_export_batches.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../supabase/migrations/20261020190615_replenishment_export_artifacts.sql", import.meta.url), "utf8"));
    await db.exec(`grant usage on schema public, auth, private to authenticated;
      grant select, update on wms_replenishment_requests to authenticated;
      alter table wms_replenishment_requests enable row level security;
      create policy request_read on wms_replenishment_requests for select to authenticated
        using(warehouse_code=any(private.current_wms_allowed_warehouses()));
      create policy request_update on wms_replenishment_requests for update to authenticated
        using(warehouse_code=any(private.current_wms_allowed_warehouses()) and private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','OPERADOR']));
      select set_config('test.profile','OPERADOR',false); set role authenticated;`);
    const first = await db.query("select (public.create_wms_replenishment_export('VDCG','batch-1')).*");
    assert.equal(first.rows[0].requests[0].codigo_material, "00178");
    assert.equal(first.rows[0].requests.length, 1);
    assert.equal((await db.query("select export_batch_id from wms_replenishment_requests where id='1'")).rows[0].export_batch_id, "batch-1");
    assert.equal((await db.query("select (public.create_wms_replenishment_export('VDCG','batch-1')).id")).rows[0].id, "batch-1");
    await assert.rejects(db.query("select public.confirm_wms_replenishment_vd_posting('batch-1')"), /Salve o arquivo/);
    const original = "UEsDBAAAAAAA";
    const saved = await db.query("select public.save_wms_replenishment_export_file('batch-1', $1) as file", [original]);
    assert.equal(saved.rows[0].file, original);
    assert.equal((await db.query("select public.save_wms_replenishment_export_file('batch-1','UEsDBBBBBBBB') as file")).rows[0].file, original);
    assert.equal((await db.query("select vd_posted_at from wms_replenishment_export_batches where id='batch-1'")).rows[0].vd_posted_at, null);
    await db.query("select public.confirm_wms_replenishment_vd_posting('batch-1')");
    const confirmed = (await db.query("select vd_posted_at,vd_posted_by from wms_replenishment_export_batches where id='batch-1'")).rows[0];
    await db.query("select public.confirm_wms_replenishment_vd_posting('batch-1')");
    assert.deepEqual((await db.query("select vd_posted_at,vd_posted_by from wms_replenishment_export_batches where id='batch-1'")).rows[0], confirmed);
    await assert.rejects(db.query("update wms_replenishment_export_files set xlsx_base64='UEsDBBBBBBBB'"), /permission denied/);
    await assert.rejects(db.query("select public.create_wms_replenishment_export('VDCG','batch-2')"), /Nenhum pedido/);
    await assert.rejects(db.query("update wms_replenishment_requests set export_batch_id=null where id='1'"), /ja exportado/);
    await db.exec("reset role; insert into wms_replenishment_requests(id,warehouse_code,codigo_material,quantidade_atendida,status) values('5','VDCG','00178',2,'CONCLUIDO'); set role authenticated;");
    assert.equal((await db.query("select (public.create_wms_replenishment_export('VDCG','batch-2')).requests")).rows[0].requests[0].quantidade_atendida, 2);
    assert.equal((await db.query("select xlsx_base64 from wms_replenishment_export_files where batch_id='batch-1'")).rows[0].xlsx_base64, original);
    await assert.rejects(db.query("select public.save_wms_replenishment_export_file('batch-2','not-xlsx')"), /XLSX invalido/);
    await db.exec("reset role; insert into wms_replenishment_requests(id,warehouse_code,codigo_material,quantidade_atendida,status) values('6','VDCG','48060',5,'CONCLUIDO'),('7','VDCG','48060',3,'CONCLUIDO'); set role authenticated;");
    const competing = await Promise.allSettled([
      db.query("select (public.create_wms_replenishment_export('VDCG','batch-3')).requests"),
      db.query("select (public.create_wms_replenishment_export('VDCG','batch-4')).requests")
    ]);
    assert.equal(competing.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(competing.find(result => result.status === "fulfilled").value.rows[0].requests.length, 2);
    assert.equal((await db.query("select count(distinct export_batch_id)::int as total from wms_replenishment_requests where id in ('6','7')")).rows[0].total, 1);
    await assert.rejects(db.query("select public.create_wms_replenishment_export('VDCO','wrong')"), /nao autorizado/);
    assert.equal((await db.query("select * from wms_replenishment_requests where id='3'")).rows.length, 0);
    await db.exec("select set_config('test.profile','ATENDENTE',false)");
    assert.equal((await db.query("select * from wms_replenishment_export_batches")).rows.length, 0);
    await assert.rejects(db.query("select public.create_wms_replenishment_export('VDCG','attendant')"), /nao autorizado/);
    assert.equal((await db.query("select * from wms_replenishment_export_files")).rows.length, 0);
    await assert.rejects(db.query("select public.save_wms_replenishment_export_file('batch-1','UEsDBBBBBBBB')"), /nao autorizado/);
    await assert.rejects(db.query("select public.confirm_wms_replenishment_vd_posting('batch-1')"), /nao autorizado/);
  } finally { await db.close(); }
});
