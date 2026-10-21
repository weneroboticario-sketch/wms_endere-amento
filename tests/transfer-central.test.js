import test from "node:test";
import assert from "node:assert/strict";
import { resolveTransferUnit, transferSearchText, transferTimeline, transferPublicCode, transferPrimaryAction } from "../src/transfer-central.js";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const units = [
  { code: "12423", loja: "TLS1", name: "Loja Tres Lagoas", active: true },
  { code: "22749", loja: "DRD1", name: "Loja Dourados", active: true },
  { code: "22796", loja: "VDDRD", name: "Centro Dourados", active: true }
];
test("unit lookup uses exact code, nickname and normalized name", () => {
  for (const token of ["12423", "tls1", "Loja Tres Lagoas"]) assert.equal(resolveTransferUnit(units, token), units[0]);
  assert.equal(resolveTransferUnit(units, "DRD1"), units[1]);
});
test("ambiguous, inactive and reverse substring matches are rejected", () => {
  assert.equal(resolveTransferUnit(units, "Dourados"), null);
  assert.equal(resolveTransferUnit([...units, { code: "12423" }], "12423"), null);
  assert.equal(resolveTransferUnit([{ ...units[0], active: false }], "TLS1"), null);
  assert.equal(resolveTransferUnit(units, "12423garbage"), null);
  assert.equal(resolveTransferUnit(units, ""), null);
});
test("search includes full transfer identity, invoice, responsible and registered alias", () => {
  const text = transferSearchText({ code: "TRF-20261020-133914-23696-12423", destinationStoreCode: "12423", responsibleName: "Joao", invoiceNumber: "502" }, units);
  for (const token of ["trf-20261020-133914-23696-12423", "tls1", "502", "joao"]) assert.ok(text.includes(token));
});
test("timeline only contains persisted valid timestamps in chronological order", () => {
  const timeline = transferTimeline({ createdAt: "2026-10-20T12:00:00Z", separationStartedAt: "invalid", packingStartedAt: "2026-10-20T13:00:00Z" });
  assert.equal(timeline.length, 2);
  assert.equal(timeline[0][0], "Solicitacao criada");
  assert.equal(transferTimeline({}).length, 0);
});

test("public codes preserve full identity and are searchable", () => {
  const transfer = { code: "TRF-original", publicNumber: "18" };
  assert.equal(transferPublicCode(transfer), "TRF-0018");
  assert.equal(transferPublicCode({ code: "TRF-original" }), "TRF-original");
  assert.ok(transferSearchText(transfer).includes("trf-0018"));
  assert.equal(transfer.code, "TRF-original");
});

test("primary action only executes assigned physical tasks within authorized warehouse", () => {
  const user = { id: "operator", role: "OPERADOR" };
  const transfer = { responsibleId: user.id, status: "EM_SEPARACAO" };
  assert.equal(transferPrimaryAction(transfer, user, true), "Continuar separacao");
  assert.equal(transferPrimaryAction({ ...transfer, status: "ATRIBUIDA" }, user, true), "Iniciar separacao");
  assert.equal(transferPrimaryAction({ ...transfer, status: "EM_MONTAGEM_CAIXA" }, user, true), "Abrir montagem");
  assert.equal(transferPrimaryAction(transfer, user, false), null);
  assert.equal(transferPrimaryAction({ ...transfer, responsibleId: "other" }, user, true), null);
  for (const role of ["COMPRAS", "FINANCEIRO", "GERENTE", "ATENDENTE"]) assert.equal(transferPrimaryAction(transfer, { ...user, role }, true), null);
  assert.equal(transferPrimaryAction({ ...transfer, invoiceStage: "NF_ANEXADA" }, user, true), null);
  assert.equal(transferPrimaryAction({ ...transfer, status: "CANCELADA" }, user, true), null);
});

test("database assigns unique permanent public identities without changing existing codes", async () => {
  const db = new PGlite();
  try {
    await db.exec("create table public.wms_transfers(id text primary key, codigo_transferencia text); insert into public.wms_transfers values ('a','original-a'),('b','original-b');");
    await db.exec(await readFile(new URL("../supabase/migrations/20261021185000_transfer_public_number.sql", import.meta.url), "utf8"));
    const before = (await db.query("select * from public.wms_transfers order by id")).rows;
    assert.equal(new Set(before.map(row => row.public_number)).size, 2);
    assert.equal(before[0].codigo_transferencia, "original-a");
    await Promise.all([db.exec("insert into public.wms_transfers(id) values ('c')"), db.exec("insert into public.wms_transfers(id) values ('d')")]);
    assert.equal((await db.query("select count(distinct public_number)::int as n from public.wms_transfers")).rows[0].n, 4);
    await assert.rejects(db.exec("update public.wms_transfers set public_number=99 where id='a'"), /can only be updated|permanente/);
    await assert.rejects(db.exec("update public.wms_transfers set public_number=default where id='a'"), /permanente/);
    assert.deepEqual((await db.query("select * from public.wms_transfers where id in ('a','b') order by id")).rows, before);
  } finally { await db.close(); }
});
