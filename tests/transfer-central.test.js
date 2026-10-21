import test from "node:test";
import assert from "node:assert/strict";
import { resolveTransferUnit, transferSearchText, transferTimeline, transferPublicCode, transferPrimaryAction, transferUnitLabel, transferMatchesQuickFilter, transferStatusTone, transferCentralRowHtml } from "../src/transfer-central.js";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { canOpenTransferCentral } from "../src/transfer-central.js";

test("expanded CP transfer title uses compact route without changing canonical identity or independent WMS", async () => {
  const source = await readFile(new URL("../script.js", import.meta.url), "utf8");
  const start = source.indexOf("  function transferPanelRowHtml(");
  const stop = source.indexOf("\n  function ", start + 1);
  const panel = source.slice(start, stop);
  assert.ok(panel.includes('escapeHtml(IS_CP_ALAMO ? origin + " → " + destination : transferDisplayName(transfer))'));
  assert.ok(panel.includes('escapeHtml(transfer.code || "-")'));
  assert.ok(!panel.includes("transfer.name ="));
});

test("supervisor and purchases can open more actions only within the authorized warehouse", () => {
  const transfer = { responsibleId: "another-operator", status: "ATRIBUIDA" };
  for (const role of ["SUPERVISOR", "COMPRAS"]) {
    const user = { id: "viewer", role };
    assert.equal(canOpenTransferCentral(transfer, user, true), true);
    assert.equal(canOpenTransferCentral(transfer, user, false), false);
    assert.equal(transferPrimaryAction(transfer, user, true), null);
  }
  for (const role of ["ATENDENTE", "FINANCEIRO", "GERENTE"]) assert.equal(canOpenTransferCentral(transfer, { id: "viewer", role }, true), false);
  assert.equal(canOpenTransferCentral(transfer, { id: "another-operator", role: "OPERADOR" }, true), true);
  assert.equal(canOpenTransferCentral(transfer, { id: "other", role: "OPERADOR" }, true), false);
});

const units = [
  { code: "12423", loja: "TLS1", name: "Loja Tres Lagoas", active: true },
  { code: "22749", loja: "DRD1", name: "Loja Dourados", active: true },
  { code: "22796", loja: "VDDRD", name: "Centro Dourados", active: true }
];
test("route labels use canonical unit nickname without choosing an ambiguous unit", () => {
  assert.equal(transferUnitLabel(units, "12423", "Long legal name"), "12423 - TLS1");
  assert.equal(transferUnitLabel([...units, { code: "12423", loja: "OTHER" }], "12423", "Original"), "Original");
  assert.equal(transferUnitLabel(units, "unknown", "Original"), "Original");
});

test("quick filters use actual workflow statuses and respect fiscal handoff", () => {
  assert.ok(transferMatchesQuickFilter({ status: "EM_SEPARACAO" }, "separating"));
  assert.ok(!transferMatchesQuickFilter({ status: "ATRIBUIDA" }, "separating"));
  assert.ok(transferMatchesQuickFilter({ status: "EM_MONTAGEM_CAIXA" }, "packing"));
  assert.ok(transferMatchesQuickFilter({ status: "PRONTA_PARA_NOTA", invoiceStage: "NF_EM_PREPARACAO" }, "invoice"));
  assert.ok(!transferMatchesQuickFilter({ status: "PRONTA_PARA_NOTA", invoiceStage: "LIBERADA_PARA_ENVIO" }, "invoice"));
  assert.ok(transferMatchesQuickFilter({ hasDivergence: true }, "divergent"));
  assert.ok(!transferMatchesQuickFilter({ responsibleId: "assigned" }, "unassigned"));
  assert.equal(transferStatusTone({ status: "EM_SEPARACAO" }), "attention");
  assert.equal(transferStatusTone({ status: "CANCELADA" }), "neutral");
});

test("compact row exposes short code, next action and real amounts while escaping data", () => {
  const html = transferCentralRowHtml({ transfer: { id: "a", publicNumber: 9, code: "full-code", totalBoxes: 2, status: "EM_SEPARACAO", responsibleName: "<script>bad</script>", invoiceNumber: "123" }, stats: { totalItems: 3, requested: 12 }, origin: "TLS1", destination: "VDDRD", status: "Em separacao", primaryAction: "Continuar separacao" });
  for (const text of ["TRF-0009", "full-code", "2 cx", "3 SKUs", "12 un.", "NF 123", "data-transfer-central", "data-transfer-execute"]) assert.ok(html.includes(text));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("Prazo: nao informado"));
});

test("retaguarda export is only presented when existing workflow eligibility allows it", () => {
  const options = { transfer: { id: "t", code: "full" }, stats: {}, origin: "A", destination: "B", status: "Pronta" };
  assert.ok(!transferCentralRowHtml(options).includes("data-transfer-export-packed"));
  assert.ok(transferCentralRowHtml({ ...options, canExport: true }).includes('data-transfer-export-packed="t"'));
});

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
