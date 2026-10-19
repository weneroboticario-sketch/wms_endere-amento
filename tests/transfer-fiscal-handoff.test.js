import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { workflowDatabase } from "./purchases-workflow-db.test.js";
import { fiscalQueueStages, fiscalActions, includeStockReadyTransfers } from "../src/purchases-workflow.js";

test("administrator can access invoice actions and stock-ready handoffs without granting them to operators", () => {
  for (const role of ["ADMINISTRADOR", "SUPERVISOR"]) {
    for (const filter of ["mine", "open", "PRONTA_PARA_NOTA"]) assert.equal(includeStockReadyTransfers(filter, role), true);
    assert.ok(fiscalActions("PRONTA_PARA_NOTA", role, "TRANSFERENCIA").some(([action]) => action === "PREPARE"));
    assert.ok(fiscalActions("NF_ANEXADA", role, "TRANSFERENCIA").some(([action]) => action === "RELEASE"));
    assert.equal(includeStockReadyTransfers("NF_ANEXADA", role), false);
  }
  assert.equal(includeStockReadyTransfers("mine", "OPERADOR"), false);
  assert.equal(includeStockReadyTransfers("mine", "COMPRAS"), false);
});

test("managers see fiscal handoffs, buyers do not get physical responsibilities", () => {
  for (const role of ["ADMINISTRADOR", "SUPERVISOR", "COMPRAS"]) {
    assert.ok(fiscalQueueStages("mine", role).includes("PRONTA_PARA_NOTA"));
  }
  assert.ok(!fiscalQueueStages("mine", "COMPRAS").includes("DESPACHADA"));
  assert.deepEqual(fiscalQueueStages("NF_ANEXADA", "COMPRAS"), ["NF_ANEXADA"]);
});

test("explicit fiscal handoff preserves identity, actual checked quantities and unresolved divergences", async () => {
  const db = await workflowDatabase();
  try {
    await db.exec("reset role;alter table wms_transfers add column if not exists packing_finished_at timestamptz;alter table wms_transfers add column if not exists total_finished_at timestamptz;alter table wms_transfers add column if not exists finalizado_em timestamptz;");
    await db.exec(await readFile(new URL("../supabase/migrations/20261014235901_transfer_fiscal_handoff.sql", import.meta.url), "utf8"));
    await db.exec("set role authenticated;select set_config('test.role','OPERADOR',false);");
    await db.exec(`insert into wms_transfers(id,warehouse_code,codigo_transferencia,status) values('ready','A','TRF-000123','ATRIBUIDA');
      insert into wms_transfer_items(id,transfer_id,warehouse_code,sku,quantidade_solicitada,quantidade_separada,quantidade_lacrada,status)
      values('actual','ready','A','00099',5,10,10,'ENVIADO'),('missing','ready','A','00100',6,0,0,'NAO_ATENDIDO');
      insert into wms_transfer_divergences(id,transfer_id,warehouse_code,sku,resolved,observation) values('difference','ready','A','00099',false,'Excesso conferido');
      update wms_transfers set status='PRONTA_PARA_NOTA_COM_DIVERGENCIA',total_caixas=2,separation_finished_at=now(),packing_finished_at=now(),finalizado_em=now() where id='ready';`);
    const enable = () => db.query("select wms_transfer_enable_invoice('ready','PRONTA_PARA_NOTA_COM_DIVERGENCIA','Encaminhar conferido para NF','enable') as result");
    await assert.rejects(enable(), /gestor/);
    await db.exec("select set_config('test.role','ADMINISTRADOR',false)");
    const ready = (await enable()).rows[0].result;
    assert.equal(ready.id, "ready"); assert.equal(ready.codigo_transferencia, "TRF-000123");
    assert.equal(ready.request_origin, "ESTOQUE"); assert.equal(ready.invoice_stage, "PRONTA_PARA_NOTA");
    assert.equal(ready.finished_at, null); assert.equal(ready.finalizado_em, null);
    assert.equal(ready.invoice_snapshot.find(i => i.sku === "00099").checked, 10);
    assert.equal(ready.invoice_snapshot.find(i => i.sku === "00100").checked, 0);
    await enable();
    await assert.rejects(db.exec("update wms_transfers set codigo_transferencia='OTHER' where id='ready'"), /bloqueados/);
    await assert.rejects(db.exec("update wms_transfer_items set quantidade_lacrada=5 where id='actual'"), /bloqueados/);
    await db.exec("select set_config('test.role','COMPRAS',false)");
    const act = (stage, action, data = {}, key = action) => db.query("select wms_invoice_action('TRANSFERENCIA','ready',$1,$2,$3,$4) as result", [stage,action,JSON.stringify(data),key]);
    await act("PRONTA_PARA_NOTA", "PREPARE");
    await assert.rejects(act("PRONTA_PARA_NOTA", "PREPARE", {}, "stale"), /outro usuario/);
    await db.exec(`insert into storage.objects(id,bucket_id,name,metadata) values('real-pdf','wms-transfer-invoices','A/wms_transfers/ready/nf.pdf','{"size":500,"mimetype":"application/pdf"}')`);
    const nf = { number: "0000123", path: "A/wms_transfers/ready/nf.pdf", filename: "nf.pdf" };
    await assert.rejects(act("NF_EM_PREPARACAO", "UPLOAD", nf), /valor total/);
    await assert.rejects(act("NF_EM_PREPARACAO", "UPLOAD", {...nf,value:12.5,key:"123"}), /44 digitos/);
    await assert.rejects(act("NF_EM_PREPARACAO", "UPLOAD", {...nf,value:12.5,number:""}), /Numero/);
    await assert.rejects(act("NF_EM_PREPARACAO", "UPLOAD", {...nf,value:12.5,path:""}), /PDF/);
    const uploaded = (await act("NF_EM_PREPARACAO", "UPLOAD", {...nf,value:12.5})).rows[0].result;
    assert.equal(uploaded.invoice_number, "0000123"); assert.equal(Number(uploaded.invoice_value), 12.5);
    assert.equal(Number(uploaded.invoice_file_size), 500);
    const released = (await act("NF_ANEXADA", "RELEASE")).rows[0].result;
    assert.equal(released.invoice_stage,"LIBERADA_PARA_ENVIO"); assert.equal(released.id,"ready");
    await act("NF_ANEXADA", "RELEASE");
    assert.equal((await db.query("select resolved from wms_transfer_divergences where id='difference'")).rows[0].resolved,false);
    assert.equal((await db.query("select count(*)::int n from wms_notifications where event_type='LIBERADA_PARA_ENVIO'")).rows[0].n,1);
    await assert.rejects(db.exec("update wms_transfers set invoice_value=99 where id='ready'"), /Reabra/);
    await db.exec("select set_config('test.role','ADMINISTRADOR',false)");
    await act("LIBERADA_PARA_ENVIO","REOPEN",{reason:"Revisar documento"});
    const corrected = (await db.query("select invoice_value,invoice_file_path from wms_transfers where id='ready'")).rows[0];
    assert.equal(corrected.invoice_value,null); assert.equal(corrected.invoice_file_path,"");
    assert.equal((await db.query("select count(*)::int n from storage.objects")).rows[0].n,1);
    await db.exec("insert into wms_transfers(id,warehouse_code,status) values('legacy','A','ATRIBUIDA'),('canceled','A','CANCELADA');update wms_transfers set status='FINALIZADA' where id='legacy';");
    assert.equal((await db.query("select requires_invoice from wms_transfers where id='legacy'")).rows[0].requires_invoice,false);
    await assert.rejects(db.query("select wms_transfer_enable_invoice('canceled','CANCELADA','NF','cancel')"), /Conclua/);
  } finally { await db.close(); }
});
