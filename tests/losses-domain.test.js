import test from "node:test";
import assert from "node:assert/strict";
import {cents,allocatePercent,financialSheets,parseInvoiceXml} from "../src/losses-domain.js";

test("financial allocation reconciles decimal cents without negative residuals",()=>{
 assert.equal(cents("15.000,01"),1500001);
 assert.deepEqual(allocatePercent("10000",[{percent:60},{percent:40}]).map(r=>r.amount),[6000,4000]);
 assert.deepEqual(allocatePercent("0.05",[{percent:30},{percent:30},{percent:30},{percent:10}]).map(r=>r.amount),[0.02,0.01,0.01,0.01]);
 assert.throws(()=>allocatePercent(100,[{percent:60},{percent:30}]),/100%/);
 assert.throws(()=>cents("NaN"),/monetário/);
 assert.throws(()=>parseInvoiceXml('<!DOCTYPE foo [<!ENTITY x SYSTEM "file:///secret">]><foo/>'),/entidades/);
});
test("export summarizes each NF once and reconciles allocated detail values",()=>{
 const common={loss_id:"one",loss_code:"PER-1",competence:"2026-09",dre_code:"STOCK",dre_label:"PERDAS DE ESTOQUE",competent_warehouse_code:"A",rate_percent:0.48,direction:"LOSS",invoice_number:"001"};
 const batch={total_invoice_value:15000,total_rate_value:72,detail_snapshot:[{...common,cost_center:"A",allocation_warehouse:"A",invoice_value:9000,rate_value:43.2},{...common,cost_center:"B",allocation_warehouse:"B",invoice_value:6000,rate_value:28.8}]};
 const sheets=financialSheets(batch);
 assert.equal(sheets.summary[0]["Quantidade NFs"],1);
 assert.equal(sheets.summary[0]["Valor Total NFs"],15000);
 assert.equal(sheets.detail[1]["Loja do Rateio"],"B");
 assert.throws(()=>financialSheets({...batch,total_rate_value:73}),/conciliado/);
});
