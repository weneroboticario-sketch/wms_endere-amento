import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/transfer-invoice.js", import.meta.url), "utf8");
// Keep domain checks runnable in Node without the browser-only stylesheet import.
const domain = source.slice(source.indexOf("let xmlPolicy;"), source.indexOf("export function createTransferInvoiceController"));
const { parseTransferInvoice } = await import("data:text/javascript," + encodeURIComponent(domain));
test("invoice rejects unsafe and oversized XML before parsing", () => {
  assert.throws(() => parseTransferInvoice('<!DOCTYPE n [<!ENTITY e SYSTEM "file:///secret">]><NFe/>'), /entidades/);
  assert.throws(() => parseTransferInvoice(" "), /XML/);
  assert.throws(() => parseTransferInvoice("x".repeat(5 * 1024 * 1024 + 1)), /5 MB/);
});

test("invoice decoration preserves the existing permission-gated delete action", async () => {
  const controllerSource = source.slice(source.indexOf("export function createTransferInvoiceController"));
  const { createTransferInvoiceController } = await import("data:text/javascript," + encodeURIComponent(controllerSource));
  const deletion = { hidden: false }, revalidation = { hidden: false };
  const row = {
    querySelectorAll(selector) {
      return [
        ...(selector.includes("[data-transfer-revalidate]") ? [revalidation] : []),
        ...(selector.includes("[data-transfer-delete-permanent]") ? [deletion] : [])
      ];
    }
  };
  const button = { dataset: { transferInvoice: "transfer-1" }, isConnected: true, closest: () => row };
  const previous = globalThis.document;
  globalThis.document = { getElementById: () => ({ querySelectorAll: () => [button] }) };
  try {
    const controller = createTransferInvoiceController({
      client: () => ({ from: () => ({ select: () => ({ in: async () => ({
        data: [{ transfer_id: "transfer-1", invoice_number: "1241" }]
      }) }) }) })
    });
    await controller.decorate();
    assert.equal(button.textContent, "NF 1241 · XML");
    assert.equal(deletion.hidden, false);
    assert.equal(revalidation.hidden, true);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});

test("invoice completion is validated and stored atomically on the server", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261019134634_transfer_invoice_completion.sql", import.meta.url), "utf8");
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /grant select, insert/);
  assert.match(sql, /for update/);
  assert.match(sql, /new\.invoice_number :=/);
  assert.match(sql, /new\.created_by := auth\.uid\(\)/);
  assert.match(sql, /set status = 'FINALIZADA'/);
  assert.match(sql, /Sem permissao/);
  assert.match(sql, /Destinatario da NF difere/);
});
