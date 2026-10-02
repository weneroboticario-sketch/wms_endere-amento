import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const AUTH_USERS = {
  atendente: "00000000-0000-4000-8000-000000000101",
  operador: "00000000-0000-4000-8000-000000000102",
  supervisor: "00000000-0000-4000-8000-000000000103",
  administrador: "00000000-0000-4000-8000-000000000104"
};

async function createMigratedDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create or replace function auth.uid()
    returns uuid
    language sql
    stable
    set search_path = ''
    as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    create publication supabase_realtime;
  `);

  const migrationsDirectory = resolve("supabase/migrations");
  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();
  for (const migrationFile of migrationFiles) {
    const sql = await readFile(resolve(migrationsDirectory, migrationFile), "utf8");
    if (migrationFile.endsWith("_atendente_profile_and_priority.sql")) {
      await db.exec(`
        insert into public.wms_replenishment_requests (
          id, warehouse_code, codigo_material, quantidade_solicitada,
          quantidade_pendente, status, prioridade
        ) values ('legacy-invalid-priority', 'VDCG', 'SKU-LEGACY', 1, 1, 'PENDENTE', 'URGENTE')
      `);
    }
    await db.exec(sql);
    if (migrationFile.endsWith("_atendente_profile_and_priority.sql")) await db.exec(sql);
  }
  return db;
}

async function setAuthenticatedUser(db, authUserId) {
  await db.exec(`
    reset role;
    set request.jwt.claim.sub = '${authUserId}';
    set role authenticated;
  `);
}

async function seedFixtures(db) {
  await db.exec(`
    insert into auth.users (id) values
      ('${AUTH_USERS.atendente}'),
      ('${AUTH_USERS.operador}'),
      ('${AUTH_USERS.supervisor}'),
      ('${AUTH_USERS.administrador}');

    insert into public.wms_users (
      id, name, username, role, profile, active, archived,
      default_warehouse_id, default_warehouse_code, warehouse_id, warehouse_code,
      allowed_warehouse_codes, is_global_admin, auth_user_id
    ) values
      ('user-attendant', 'Atendente VDCG', 'attendant', 'ATENDENTE', 'ATENDENTE', true, false,
       'warehouse-vdcg', 'VDCG', 'warehouse-vdcg', 'VDCG', 'VDCG', true, '${AUTH_USERS.atendente}'),
      ('user-attendant-vdco', 'Atendente VDCO', 'attendant-vdco', 'ATENDENTE', 'ATENDENTE', true, false,
       'warehouse-vdco', 'VDCO', 'warehouse-vdco', 'VDCO', 'VDCO', false, null),
      ('user-operator', 'Operador VDCG', 'operator', 'OPERADOR', 'OPERADOR', true, false,
       'warehouse-vdcg', 'VDCG', 'warehouse-vdcg', 'VDCG', 'VDCG', false, '${AUTH_USERS.operador}'),
      ('user-supervisor', 'Supervisor VDCG', 'supervisor', 'SUPERVISOR', 'SUPERVISOR', true, false,
       'warehouse-vdcg', 'VDCG', 'warehouse-vdcg', 'VDCG', 'VDCG', false, '${AUTH_USERS.supervisor}'),
      ('user-admin', 'Administrador', 'administrator', 'ADMINISTRADOR', 'ADMINISTRADOR', true, false,
       'warehouse-vdcg', 'VDCG', 'warehouse-vdcg', 'VDCG', 'VDCG,VDCO', true, '${AUTH_USERS.administrador}');

    insert into public.wms_products (sku, product_name) values
      ('SKU-VDCG', 'Produto VDCG'),
      ('SKU-VDCO', 'Produto VDCO');

    insert into public.wms_bindings (
      id, sku, rua, rack, linha, letra, location_code, product_name,
      warehouse_id, warehouse_code
    ) values
      ('binding-vdcg', 'SKU-VDCG', 1, 1, 1, 'A', 'R01-RK01-L01-A', 'Produto VDCG', 'warehouse-vdcg', 'VDCG'),
      ('binding-vdco', 'SKU-VDCO', 1, 1, 1, 'A', 'R01-RK01-L01-A', 'Produto VDCO', 'warehouse-vdco', 'VDCO');

    insert into public.wms_stock_positions (
      id, warehouse_code, source_type, codigo_material, nome_material, total_fisico
    ) values
      ('stock-vdcg', 'VDCG', 'CAPTACAO', 'SKU-VDCG', 'Produto VDCG', 4),
      ('stock-vdco', 'VDCO', 'CAPTACAO', 'SKU-VDCO', 'Produto VDCO', 8);

    insert into public.wms_replenishment_requests (
      id, warehouse_code, codigo_material, quantidade_solicitada,
      quantidade_pendente, status, prioridade, solicitado_por_id, solicitado_por_nome
    ) values
      ('request-vdcg', 'VDCG', 'SKU-VDCG', 2, 2, 'PENDENTE', 'NORMAL', 'user-attendant', 'Atendente VDCG'),
      ('request-vdco', 'VDCO', 'SKU-VDCO', 2, 2, 'PENDENTE', 'NORMAL', 'other-user', 'Atendente VDCO');
  `);
}

test("ATENDENTE RLS is warehouse-scoped and blocks operational mutations", async (context) => {
  const db = await createMigratedDatabase();
  context.after(() => db.close());
  await seedFixtures(db);
  await setAuthenticatedUser(db, AUTH_USERS.atendente);

  const allowedWarehouses = await db.query("select private.current_wms_allowed_warehouses() as codes");
  assert.deepEqual(allowedWarehouses.rows[0].codes, ["VDCG"], "ATENDENTE must not gain global access from a stale flag");
  assert.equal((await db.query("select prioridade from public.wms_replenishment_requests where id = 'legacy-invalid-priority'")).rows[0].prioridade, "NORMAL");
  assert.deepEqual(
    (await db.query("select policyname from pg_policies where tablename = 'wms_replenishment_requests' and cmd = 'UPDATE' order by policyname")).rows,
    [
      { policyname: "wms_replenishment_requests_attendant_cancellation_update" },
      { policyname: "wms_replenishment_requests_warehouse_update" }
    ]
  );

  assert.equal((await db.query("select count(*)::integer as count from public.wms_products")).rows[0].count, 2);
  assert.ok((await db.query("select count(*)::integer as count from public.wms_warehouses")).rows[0].count >= 1);
  assert.deepEqual((await db.query("select warehouse_code from public.wms_bindings order by warehouse_code")).rows, [{ warehouse_code: "VDCG" }]);
  assert.deepEqual((await db.query("select warehouse_code from public.wms_stock_positions order by warehouse_code")).rows, [{ warehouse_code: "VDCG" }]);
  assert.deepEqual((await db.query("select distinct warehouse_code from public.wms_replenishment_requests order by warehouse_code")).rows, [{ warehouse_code: "VDCG" }]);

  await db.query(`
    insert into public.wms_replenishment_requests (
      id, warehouse_code, codigo_material, quantidade_solicitada,
      quantidade_pendente, status, prioridade, solicitado_por_id
    ) values ('request-attendant-client', 'VDCG', 'SKU-VDCG', 1, 1, 'PENDENTE', 'CLIENTE', 'user-attendant')
  `);
  assert.equal((await db.query("select count(*)::integer as count from public.wms_replenishment_requests where id = 'request-attendant-client'")).rows[0].count, 1);

  await assert.rejects(
    db.query(`
      insert into public.wms_replenishment_requests (
        id, warehouse_code, codigo_material, quantidade_solicitada,
        quantidade_pendente, status, prioridade, solicitado_por_id
      ) values ('request-attendant-vdco', 'VDCO', 'SKU-VDCO', 1, 1, 'PENDENTE', 'NORMAL', 'user-attendant')
    `),
    /row-level security policy/
  );

  await assert.rejects(
    db.query("update public.wms_replenishment_requests set status = 'ATRIBUIDO' where id = 'request-vdcg'"),
    /cannot change the operational replenishment workflow/,
    "ATENDENTE must not claim a replenishment request"
  );

  const cancellationResult = await db.query(`
    select id, cancellation_requested_by_id, cancellation_requested_by_name, cancellation_request_reason
    from public.request_wms_replenishment_cancellation('request-vdcg', 'Cliente desistiu')
  `);
  assert.deepEqual(cancellationResult.rows, [{
    id: "request-vdcg",
    cancellation_requested_by_id: "user-attendant",
    cancellation_requested_by_name: "Atendente VDCG",
    cancellation_request_reason: "Cliente desistiu"
  }]);
  assert.equal(
    (await db.query("select status from public.wms_replenishment_requests where id = 'request-vdcg'")).rows[0].status,
    "PENDENTE",
    "cancellation request must not change the operational status"
  );
  await assert.rejects(
    db.query("select public.request_wms_replenishment_cancellation('request-vdco', '')"),
    /Replenishment request not found/,
    "RLS must not reveal a replenishment request from another warehouse"
  );

  await assert.rejects(
    db.query(`
      insert into public.wms_bindings (
        id, sku, rua, rack, linha, letra, location_code, warehouse_id, warehouse_code
      ) values ('binding-attendant', 'SKU-NEW', 2, 2, 2, 'B', 'R02-RK02-L02-B', 'warehouse-vdcg', 'VDCG')
    `),
    /row-level security policy/
  );
  assert.equal((await db.query("update public.wms_bindings set product_name = 'Alterado' where id = 'binding-vdcg'")).affectedRows, 0);
  assert.equal((await db.query("delete from public.wms_bindings where id = 'binding-vdcg'")).affectedRows, 0);

  await assert.rejects(
    db.query(`
      insert into public.wms_replenishment_requests (
        id, warehouse_code, codigo_material, quantidade_solicitada,
        quantidade_pendente, status, prioridade
      ) values ('request-invalid-priority', 'VDCG', 'SKU-VDCG', 1, 1, 'PENDENTE', 'URGENTE')
    `),
    /wms_replenishment_requests_prioridade_check/
  );
});

test("existing operational profiles keep their warehouse write access", async (context) => {
  const db = await createMigratedDatabase();
  context.after(() => db.close());
  await seedFixtures(db);

  for (const role of ["operador", "supervisor", "administrador"]) {
    await setAuthenticatedUser(db, AUTH_USERS[role]);
    const requestId = `request-${role}`;
    await db.query(`
      insert into public.wms_replenishment_requests (
        id, warehouse_code, codigo_material, quantidade_solicitada,
        quantidade_pendente, status, prioridade
      ) values ('${requestId}', 'VDCG', 'SKU-VDCG', 1, 1, 'PENDENTE', 'NORMAL')
    `);
    assert.equal((await db.query(`update public.wms_replenishment_requests set status = 'ATRIBUIDO' where id = '${requestId}'`)).affectedRows, 1);
    await assert.rejects(
      db.query(`select public.request_wms_replenishment_cancellation('${requestId}', '')`),
      /Only an active attendant/
    );

    const bindingId = `binding-${role}`;
    await db.query(`
      insert into public.wms_bindings (
        id, sku, rua, rack, linha, letra, location_code, warehouse_id, warehouse_code
      ) values ('${bindingId}', 'SKU-${role}', 3, 3, 3, 'C', 'R03-RK03-L03-C', 'warehouse-vdcg', 'VDCG')
    `);
    assert.equal((await db.query(`update public.wms_bindings set product_name = 'Updated' where id = '${bindingId}'`)).affectedRows, 1);
    assert.equal((await db.query(`delete from public.wms_bindings where id = '${bindingId}'`)).affectedRows, 1);
  }

  await setAuthenticatedUser(db, AUTH_USERS.supervisor);
  assert.deepEqual(
    (await db.query("select id from public.wms_users where role = 'ATENDENTE' order by id")).rows,
    [{ id: "user-attendant" }]
  );
  assert.equal((await db.query("update public.wms_users set name = 'Atendente Atualizado' where id = 'user-attendant'")).affectedRows, 1);
  assert.equal((await db.query("update public.wms_users set name = 'Nao Permitido' where id = 'user-attendant-vdco'")).affectedRows, 0);
});

test("access request policy accepts only store roles", async (context) => {
  const db = await createMigratedDatabase();
  context.after(() => db.close());
  await db.exec("set role anon");

  await db.query(`
    insert into public.wms_access_requests (id, name, username, role_requested, status, warehouse_code)
    values ('access-attendant', 'Atendente', 'access-attendant', 'ATENDENTE', 'PENDENTE', 'VDCG')
  `);
  await assert.rejects(
    db.query(`
      insert into public.wms_access_requests (id, name, username, role_requested, status, warehouse_code)
      values ('access-admin', 'Admin', 'access-admin', 'ADMINISTRADOR', 'PENDENTE', 'VDCG')
    `),
    /row-level security policy/
  );
});
