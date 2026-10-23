import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("private presence policies restrict both reading and publishing to permitted warehouses", async () => {
  const database = new PGlite();
  try {
    await database.exec(`
      create schema realtime;
      create schema private;
      create role authenticated;
      create role anon;
      create table realtime.messages (extension text);
      alter table realtime.messages enable row level security;
      create function realtime.topic() returns text language sql stable as $$ select current_setting('test.topic',true) $$;
      create function private.current_wms_allowed_warehouses() returns text[] language sql stable as $$ select string_to_array(current_setting('test.warehouses',true),',') $$;
      grant usage on schema realtime,private to authenticated,anon;
      grant select,insert on realtime.messages to authenticated,anon;
      insert into realtime.messages values ('presence'),('broadcast');
    `);
    await database.exec(await readFile(new URL("../supabase/migrations/20261023150000_addressing_presence.sql", import.meta.url), "utf8"));
    await database.exec("set role authenticated; select set_config('test.warehouses','VDCG',false); select set_config('test.topic','wms-addressing:VDCG',false);");
    assert.equal((await database.query("select * from realtime.messages")).rows.length, 1);
    await database.query("insert into realtime.messages values ('presence')");
    await assert.rejects(database.query("insert into realtime.messages values ('broadcast')"), /row-level security/);
    for (const topic of ["wms-addressing:VDAR", "wms-addressing:VDCG:other", "other:VDCG"]) {
      await database.query("select set_config('test.topic',$1,false)", [topic]);
      assert.equal((await database.query("select * from realtime.messages")).rows.length, 0);
      await assert.rejects(database.query("insert into realtime.messages values ('presence')"), /row-level security/);
    }
    await database.exec("reset role; set role anon; select set_config('test.topic','wms-addressing:VDCG',false);");
    assert.equal((await database.query("select * from realtime.messages")).rows.length, 0);
    await assert.rejects(database.query("insert into realtime.messages values ('presence')"), /row-level security/);
  } finally {
    await database.close();
  }
});
