import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migration = fs.readFileSync(new URL("../supabase/migrations/20261008184900_fix_task_reference_upsert.sql", import.meta.url), "utf8");

test("task sync no longer blocks transfers, preserves references and allows standalone tasks", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table public.wms_schema_version (
        id text primary key, version text, description text,
        applied_at timestamptz, applied_by text
      );
      create table public.operacao_tarefas (
        id bigint generated always as identity primary key,
        referencia_tipo text, referencia_id text, status text,
        check ((referencia_tipo is null) = (referencia_id is null))
      );
      create unique index uq_operacao_tarefas_referencia
        on public.operacao_tarefas (referencia_tipo, referencia_id)
        where referencia_tipo is not null and referencia_id is not null;
      create table public.test_operations (id text, tipo text, status text);
      create function public.test_sync_task() returns trigger
      language plpgsql security invoker set search_path = '' as $$
      begin
        insert into public.operacao_tarefas (referencia_tipo, referencia_id, status)
        values (new.tipo, new.id, new.status)
        on conflict (referencia_tipo, referencia_id)
        do update set status = excluded.status;
        return new;
      end;
      $$;
      create trigger test_sync_task after insert or update on public.test_operations
        for each row execute function public.test_sync_task();
    `);
    await assert.rejects(db.exec("insert into public.test_operations values ('trf-1','TRANSFERENCIA','ATRIBUIDA')"), /no unique or exclusion constraint/);
    await db.exec(migration);
    await db.exec(migration);
    await db.exec(`
      insert into public.test_operations values ('trf-1','TRANSFERENCIA','ATRIBUIDA');
      update public.test_operations set status='EM_SEPARACAO' where id='trf-1';
      update public.test_operations set status='EM_SEPARACAO' where id='trf-1';
      insert into public.test_operations values ('rep-1','REPOSICAO','PENDENTE');
      update public.test_operations set status='EM_SEPARACAO' where id='rep-1';
      insert into public.operacao_tarefas (status) values ('PENDENTE'), ('PENDENTE');
    `);
    const tasks = (await db.query("select referencia_tipo, referencia_id, status from public.operacao_tarefas where referencia_id is not null order by referencia_tipo")).rows;
    assert.deepEqual(tasks, [
      { referencia_tipo: "REPOSICAO", referencia_id: "rep-1", status: "EM_SEPARACAO" },
      { referencia_tipo: "TRANSFERENCIA", referencia_id: "trf-1", status: "EM_SEPARACAO" }
    ]);
    assert.equal((await db.query("select count(*)::int as total from public.operacao_tarefas")).rows[0].total, 4);
    await assert.rejects(db.exec("insert into public.operacao_tarefas (referencia_tipo, referencia_id) values ('TRANSFERENCIA','trf-1')"), /duplicate key/);
    await db.exec("update public.wms_schema_version set version='2026.10.09.001'");
    await db.exec(migration);
    assert.equal((await db.query("select version from public.wms_schema_version")).rows[0].version, "2026.10.09.001");
  } finally {
    await db.close();
  }
});

test("migration is compatible with installations without the optional task module", async () => {
  const db = new PGlite();
  try {
    await db.exec("create table public.wms_schema_version (id text primary key, version text, description text, applied_at timestamptz, applied_by text)");
    await db.exec(migration);
    assert.equal((await db.query("select to_regclass('public.operacao_tarefas') as tasks")).rows[0].tasks, null);
  } finally {
    await db.close();
  }
});
