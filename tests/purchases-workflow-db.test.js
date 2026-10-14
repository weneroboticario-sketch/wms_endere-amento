import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

export async function workflowDatabase() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated;
    create schema private; create schema auth; create schema storage;
    create function private.current_wms_role() returns text language sql as $$select current_setting('test.role')$$;
    create function private.current_wms_profile_id() returns text language sql as $$select 'actor'::text$$;
    create function private.current_wms_allowed_warehouses() returns text[] language sql as $$select array['A']::text[]$$;
    create function private.has_wms_role(text[]) returns boolean language sql as $$select private.current_wms_role()=any($1)$$;
    create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id text primary key,bucket_id text,name text,metadata jsonb);
    alter table storage.objects enable row level security;
    create table public.wms_schema_version(id text primary key,version text,description text,applied_at timestamptz,applied_by text);
    select set_config('test.role','OPERADOR',false);`);
  const baseline = await readFile(new URL("../supabase/migrations/20260923000000_legacy_baseline.sql", import.meta.url), "utf8");
  for (const table of ["wms_warehouses", "wms_users", "wms_transfers", "wms_transfer_items", "wms_transfer_events", "wms_transfer_divergences", "wms_notifications", "wms_history", "wms_replenishment_requests"]) {
    const sql = baseline.match(new RegExp("create table if not exists public\\." + table + " \\([\\s\\S]+?\\);", "i"));
    assert.ok(sql, table);
    await db.exec(sql[0]);
    if (!["wms_warehouses", "wms_users"].includes(table)) {
      await db.exec(`alter table public.${table} add column if not exists warehouse_code text;
        alter table public.${table} add column if not exists updated_at timestamptz default now();`);
    }
  }
  await db.exec(`alter table wms_users add column if not exists auth_user_id uuid;
    alter table wms_users add column if not exists archived boolean default false;
    alter table wms_users add column if not exists default_warehouse_code text;
    alter table wms_users add column if not exists warehouse_code text;
    alter table wms_transfers add column if not exists final_box_count numeric default 0;
    alter table wms_transfers add column if not exists total_boxes numeric default 0;
    alter table wms_transfers add column if not exists total_caixas numeric default 0;
    alter table wms_transfers add column if not exists separation_finished_at timestamptz;
    alter table wms_transfers add column if not exists is_deleted boolean default false;
    alter table wms_transfers add column if not exists finished_at timestamptz;
    alter table wms_transfer_items add column if not exists quantidade_lacrada_unidades numeric default 0;
    alter table wms_transfer_items add column if not exists tipo_quantidade text default 'UNIDADE';
    alter table wms_transfer_items add column if not exists unidades_por_caixa numeric default 1;
    alter table wms_transfer_items add column if not exists observation text;
    alter table wms_transfer_divergences add column if not exists resolved boolean default false;
    alter table wms_transfer_divergences add column if not exists observation text;
    alter table wms_transfer_divergences add column if not exists resolved_by text;
    alter table wms_transfer_divergences add column if not exists resolved_at timestamptz;
    insert into wms_warehouses(id,code,name) values('a','A','Store A'),('b','B','Store B');
    insert into wms_users(id,name,username,role) values('actor','Actor','actor','OPERADOR');`);
  for (const migration of ["20261014003034_purchases_invoice_workflow.sql", "20261014003039_reverse_logistics_monthly_targets.sql", "20261014020000_admin_purchases_request_mode.sql"]) {
    await db.exec(await readFile(new URL("../supabase/migrations/" + migration, import.meta.url), "utf8"));
  }
  await db.exec(`grant usage on schema public,private,storage to authenticated;
    grant select,insert,update,delete on all tables in schema public,storage to authenticated;
    alter table wms_transfers enable row level security;
    alter table wms_replenishment_requests enable row level security;
    create policy transfer_scope on wms_transfers to authenticated using(warehouse_code=any(private.current_wms_allowed_warehouses())) with check(warehouse_code=any(private.current_wms_allowed_warehouses()));
    create policy replenishment_scope on wms_replenishment_requests to authenticated using(warehouse_code=any(private.current_wms_allowed_warehouses())) with check(warehouse_code=any(private.current_wms_allowed_warehouses()));
    set role authenticated;`);
  return db;
}

test("Compras workflow preserves legacy, protects quantities and requires a private PDF", async () => {
  const db = await workflowDatabase();
  try {
    await db.exec("insert into wms_replenishment_requests(id,warehouse_code,codigo_material,quantidade_solicitada,status) values('legacy','A','00178',3,'PENDENTE')");
    await db.exec("update wms_replenishment_requests set status='CONCLUIDO' where id='legacy'");
    await db.exec("select set_config('test.role','COMPRAS',false); insert into wms_replenishment_requests(id,warehouse_code,codigo_material,quantidade_solicitada,status) values('buyer','A','00178',3,'PENDENTE')");
    assert.equal((await db.query("select request_origin,requires_invoice from wms_replenishment_requests where id='buyer'")).rows[0].request_origin, "COMPRAS");
    await assert.rejects(db.exec("update wms_replenishment_requests set quantidade_atendida=3 where id='buyer'"), /Compras nao pode/);
    await db.exec("select set_config('test.role','OPERADOR',false); update wms_replenishment_requests set quantidade_atendida=3,status='SEPARADO' where id='buyer'");
    const act = (stage,action,data={},id=action) => db.query("select public.wms_invoice_action('REPOSICAO','buyer',$1,$2,$3,$4) as result", [stage,action,JSON.stringify(data),id]);
    await assert.rejects(db.exec("update wms_replenishment_requests set status='CONCLUIDO' where id='buyer'"), /fluxo fiscal/);
    await act("", "READY", { boxes: 1, checked: 3 });
    await db.exec("select set_config('test.role','COMPRAS',false)");
    await assert.rejects(act("PRONTA_PARA_NOTA", "RELEASE"), /invalida/);
    await assert.rejects(act("PRONTA_PARA_NOTA", "UPLOAD", { number: "0001", path: "A/wms_replenishment_requests/buyer/missing.pdf", filename: "missing.pdf" }), /ausente/);
    await db.exec(`insert into storage.objects(id,bucket_id,name,metadata) values('pdf','wms-transfer-invoices','A/wms_replenishment_requests/buyer/nf.pdf','{"size":500,"mimetype":"application/pdf"}')`);
    await act("PRONTA_PARA_NOTA", "UPLOAD", { number: "0001", path: "A/wms_replenishment_requests/buyer/nf.pdf", filename: "nf.pdf" });
    await act("NF_ANEXADA", "RELEASE");
    await act("NF_ANEXADA", "RELEASE"); // Same idempotency key returns the committed result.
    await assert.rejects(act("LIBERADA_PARA_ENVIO", "DISPATCH"), /Estoque|Compras nao pode/);
    await db.exec("select set_config('test.role','OPERADOR',false)");
    await act("LIBERADA_PARA_ENVIO", "DISPATCH"); await act("DESPACHADA", "RECEIVE"); await act("RECEBIDA", "COMPLETE");
    assert.equal((await db.query("select status from wms_replenishment_requests where id='buyer'")).rows[0].status, "CONCLUIDO");
    assert.equal((await db.query("select count(*)::int n from wms_notifications where event_type='LIBERADA_PARA_ENVIO'")).rows[0].n, 1);
    await assert.rejects(db.exec("insert into wms_replenishment_requests(id,warehouse_code) values('wrong','B')"), /row-level security/);
  } finally { await db.close(); }
});

test("administrator selects purchases for either domain while normal requests stay operational", async () => {
  const db = await workflowDatabase();
  try {
    await db.exec("select set_config('test.role','ADMINISTRADOR',false)");
    for(const table of ["wms_transfers","wms_replenishment_requests"]) {
      const extraColumn = table === "wms_replenishment_requests" ? ",codigo_material" : "";
      const extraValue = table === "wms_replenishment_requests" ? ",'00178'" : "";
      await db.query(`insert into ${table}(id,warehouse_code,request_origin${extraColumn}) values($1,'A','COMPRAS'${extraValue}),($2,'A','ESTOQUE'${extraValue})`,[table+"-buyer",table+"-normal"]);
      const rows = (await db.query(`select id,request_origin,requires_invoice from ${table} order by id`)).rows;
      assert.equal(rows[0].request_origin,"COMPRAS");assert.equal(rows[0].requires_invoice,true);
      assert.equal(rows[1].request_origin,"ESTOQUE");assert.equal(rows[1].requires_invoice,false);
    }
    await db.exec("select set_config('test.role','OPERADOR',false);insert into wms_replenishment_requests(id,warehouse_code,request_origin,codigo_material) values('operator-origin','A','COMPRAS','00178')");
    assert.equal((await db.query("select requires_invoice from wms_replenishment_requests where id='operator-origin'")).rows[0].requires_invoice,false);
  } finally { await db.close(); }
});

test("transfer conference freezes items and prevents cross-unit invoice access", async () => {
  const db = await workflowDatabase();
  try {
    await db.exec("select set_config('test.role','COMPRAS',false); insert into wms_transfers(id,warehouse_code,status,criado_por_id) values('t1','A','ATRIBUIDA','actor')");
    await db.exec("select set_config('test.role','OPERADOR',false); insert into wms_transfer_items(id,transfer_id,warehouse_code,sku,quantidade_solicitada,quantidade_separada,quantidade_lacrada,status) values('i1','t1','A','00099',3,2,2,'LACRADO'); update wms_transfers set status='PRONTA_PARA_NOTA',total_caixas=1,separation_finished_at=now() where id='t1'");
    const row = (await db.query("select invoice_snapshot,invoice_stage from wms_transfers where id='t1'")).rows[0];
    assert.equal(row.invoice_stage, "PRONTA_PARA_NOTA");
    assert.equal(row.invoice_snapshot[0].sku,"00099");
    assert.equal(row.invoice_snapshot[0].difference,-1);
    await assert.rejects(db.exec("update wms_transfer_items set quantidade_lacrada=3 where id='i1'"), /bloqueados/);
    await assert.rejects(db.exec("update wms_transfers set total_caixas=2 where id='t1'"), /bloqueados/);
    await db.exec("select set_config('test.role','COMPRAS',false)");
    await assert.rejects(db.exec("insert into storage.objects(id,bucket_id,name,metadata) values('other','wms-transfer-invoices','B/wms_transfers/t1/nf.pdf','{\"size\":100,\"mimetype\":\"application/pdf\"}')"), /row-level security/);
    await db.query("select wms_invoice_action('TRANSFERENCIA','t1','PRONTA_PARA_NOTA','CORRECTION',$1,'fix')",[JSON.stringify({reason:"Recontar item"})]);
    await db.exec("select set_config('test.role','OPERADOR',false); update wms_transfer_items set quantidade_lacrada=2 where id='i1'");
  } finally { await db.close(); }
});

test("reverse logistics preserves text, isolates units and excludes canceled boxes from targets", async () => {
  const db = await workflowDatabase();
  try {
    const insert = (id,gdv="000123",boxes=12) => db.query(`insert into wms_reverse_logistics(id,warehouse_code,unit_origin_code,unit_origin_name,box_quantity,gdv_number,gdv_normalized,nfe_number,nfe_normalized,responsible_id,responsible_name,created_by_id,created_by_name,competence_month,idempotency_key)
      values($1,'A','A','Store A',$2,$3,'','000789','','actor','Actor','actor','Actor',date_trunc('month',now())::date,$1) returning *`, [id,boxes,gdv]);
    const row=(await insert("r1")).rows[0]; assert.equal(row.gdv_number,"000123"); assert.equal(row.nfe_number,"000789");
    await assert.rejects(insert("r2"), /unique constraint/); await assert.rejects(insert("r3","different",0), /check constraint/);
    const act=(expected,status,key,reason="")=>db.query("select public.wms_reverse_action('r1',$1,$2,$3,$4) as result",[expected,status,reason,key]);
    await act("REGISTRADA","ENVIADA","send"); await act("REGISTRADA","ENVIADA","send");
    const summary=()=>db.query("select public.wms_reverse_summary($1,'A') as result",[row.competence_month]);
    assert.equal((await summary()).rows[0].result[0].completed_boxes,12);
    await act("ENVIADA","CANCELADA","cancel","Canceled by warehouse");
    assert.equal((await summary()).rows[0].result[0].completed_boxes,0);
    await db.exec("select set_config('test.role','COMPRAS',false)");
    await assert.rejects(insert("buyer"), /row-level security|sem permissao/);
    await assert.rejects(db.exec("insert into wms_reverse_logistics_monthly_targets(id,unit_code,unit_name,competence_month,target_boxes,updated_by_id,updated_by_name) values('target','A','A',date_trunc('month',now())::date,100,'actor','Actor')"), /row-level security|sem permissao/);
  } finally { await db.close(); }
});
