import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { inboundItemStatus, inboundSummary, findInboundItems, previewInboundXml, inboundReportRows } from "../src/inbound-receipts-domain.js";
const item = { id:"a", supplier_code:"FORN-01314",internal_sku:"01314",description:"Produto",expected_qty:4,counted_qty:null,commercial_unit:"UN",tributary_qty:4,tributary_unit:"UN",ean:"7891234567890",tributary_ean:"7891234567891" };
test("inbound status distinguishes pending, correct, shortage, surplus and unexpected",()=>{
  assert.equal(inboundItemStatus(item),"PENDENTE");
  assert.equal(inboundItemStatus({...item,counted_qty:4}),"CORRETO");
  assert.equal(inboundItemStatus({...item,counted_qty:0}),"FALTANTE");
  assert.equal(inboundItemStatus({...item,counted_qty:5}),"EXCEDENTE");
  assert.equal(inboundItemStatus({...item,counted_qty:1,is_extra:true,expected_qty:0}),"NÃO PREVISTO");
});
test("summary keeps incompatible units separate and pending is not an assumed missing count",()=>{
  const summary=inboundSummary([item,{...item,id:"b",commercial_unit:"CX",expected_qty:3,counted_qty:4},{...item,id:"c",counted_qty:2}]);
  assert.equal(summary.pending,1);assert.equal(summary.checked,2);assert.equal(summary.divergent,2);
  assert.deepEqual(summary.units,{UN:{expected:8,counted:2,missing:2,excess:0},CX:{expected:3,counted:4,missing:0,excess:1}});
});
test("SKU/EAN lookup preserves leading zero codes, never assumes supplier code is internal and retains ambiguous lines",()=>{
  assert.equal(findInboundItems([item],"1314")[0].internal_sku,"01314");
  assert.equal(findInboundItems([item],item.ean).length,1);assert.equal(findInboundItems([item],item.tributary_ean).length,1);
  assert.equal(findInboundItems([{...item,internal_sku:null}],"FORN-01314").length,0);
  assert.equal(findInboundItems([item,{...item,id:"b"}],item.ean).length,2);
});
test("XML preview rejects unsafe input before parsing and report preserves original invoice data",()=>{
  assert.throws(()=>previewInboundXml('<!DOCTYPE a [<!ENTITY x SYSTEM "file:///secret">]><a/>'),/XML inválido/);
  assert.throws(()=>previewInboundXml("x".repeat(5242881)),/XML inválido/);
  const rows=inboundReportRows({invoice_number:"123",series:"1",invoice_key:"key",source_name:"VDAR",destination_name:"VDCG",warehouse_code:"VDCG"},[{...item,counted_qty:2,counted_name:"Operador",counted_at:"2026-11-05",observation:"Falta"}]);
  assert.equal(rows[1][7],"FORN-01314");assert.equal(rows[1][8],"01314");assert.equal(rows[1][14],"FALTANTE");assert.equal(rows[1][13],-2);
});
test("inbound integration has separate sections and no writes to outbound, inventory or addressing",async()=>{
  const source=await readFile(new URL("../src/inbound-receipts.js",import.meta.url),"utf8");
  assert.doesNotMatch(source,/\.from\("wms_(?:transfers|transfer_items|stock|bindings)"\)/);
  const html=await readFile(new URL("../index.html",import.meta.url),"utf8");
  for(const id of ["inboundReceiptsSection","inboundHistorySection","finalizedTransfersSection","transferWorkSection"]) assert.match(html,new RegExp('id="'+id+'"'));
});
