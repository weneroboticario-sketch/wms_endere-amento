import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";

test("hard deletion is authorized, scoped, complete and rolls back on failure", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema auth; create schema private;
      create role anon; create role authenticated;
      create function auth.uid() returns uuid language sql as
        $$ select nullif(current_setting('test.actor',true),'')::uuid $$;
      create function private.has_wms_role(text[]) returns boolean language sql as
        $$ select current_setting('test.allowed',true) = 'yes' $$;
      create function private.can_access_warehouse(text) returns boolean language sql as
        $$ select $1 = 'VDCG' $$;
      create table public.wms_transfers(id text primary key,warehouse_code text,status text);
      create table public.operacao_tarefas(id text primary key,referencia_tipo text,referencia_id text);
      create table public.operacao_tarefas_historico(id text,tarefa_id text references public.operacao_tarefas(id));
      create table public.wms_transfer_invoices(transfer_id text references public.wms_transfers(id),xml_content text);
    `);
    const tables = ["wms_task_notifications","wms_notifications","wms_transfer_events","wms_transfer_divergences","wms_transfer_items","wms_transfer_boxes"];
    for (const table of tables) await db.exec(`create table public.${table}(transfer_id text);`);
    await db.exec("create table public.wms_transfer_merge_items(merged_transfer_id text,original_transfer_id text);");
    await db.exec(await readFile(new URL("../supabase/migrations/20261020160000_transfer_hard_delete.sql",import.meta.url),"utf8"));
    await db.exec(`
      set test.actor='00000000-0000-0000-0000-000000000001';
      set test.allowed='yes';
      insert into public.wms_transfers values('target','VDCG','FINALIZADA'),('other','VDCG','PENDENTE'),('foreign','VDAR','PENDENTE');
      insert into public.wms_transfer_invoices values('target','xml'),('other','xml');
      insert into public.operacao_tarefas values('t1','TRANSFERENCIA','target'),('t2','REPOSICAO','target'),('t3','TRANSFERENCIA','other');
      insert into public.operacao_tarefas_historico values('h1','t1'),('h2','t2');
      insert into public.wms_transfer_merge_items values('target','other'),('other','other');
    `);
    for (const table of tables) await db.exec(`insert into public.${table} values('target'),('other');`);
    await db.exec("set test.allowed='no';");
    await assert.rejects(db.query("select public.wms_delete_transfer_permanently('target')"),/permissao/);
    await db.exec("set test.allowed='yes';");
    await assert.rejects(db.query("select public.wms_delete_transfer_permanently('foreign')"),/estoque/);
    await db.exec("set test.actor='';");
    await assert.rejects(db.query("select public.wms_delete_transfer_permanently('target')"),/permissao/);
    await db.exec(`
      set test.actor='00000000-0000-0000-0000-000000000001';
      create function public.fail_delete() returns trigger language plpgsql as $$ begin raise exception 'test failure'; end $$;
      create trigger fail_delete before delete on public.wms_transfer_items for each row execute function public.fail_delete();
    `);
    await assert.rejects(db.query("select public.wms_delete_transfer_permanently('target')"),/test failure/);
    assert.equal((await db.query("select count(*)::int n from public.wms_transfer_invoices")).rows[0].n,2);
    assert.equal((await db.query("select count(*)::int n from public.operacao_tarefas_historico")).rows[0].n,2);
    await db.exec("drop trigger fail_delete on public.wms_transfer_items;");
    assert.equal((await db.query("select public.wms_delete_transfer_permanently('target') ok")).rows[0].ok,true);
    for (const table of [...tables,"wms_transfer_invoices"]) {
      assert.deepEqual((await db.query(`select transfer_id from public.${table}`)).rows,[{transfer_id:"other"}]);
    }
    assert.equal((await db.query("select count(*)::int n from public.operacao_tarefas where id='t1'")).rows[0].n,0);
    assert.equal((await db.query("select count(*)::int n from public.operacao_tarefas where id='t2'")).rows[0].n,1);
    assert.equal((await db.query("select count(*)::int n from public.wms_transfers where id='target'")).rows[0].n,0);
    assert.equal((await db.query("select count(*)::int n from public.wms_transfers")).rows[0].n,2);
  } finally { await db.close(); }
});
