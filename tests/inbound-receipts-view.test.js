import test from "node:test";
import assert from "node:assert/strict";
import { inboundViewCounts, inboundRowsForFilter, inboundDetail, inboundItemRows, inboundActiveCard } from "../src/inbound-receipts-view.js";
import { inboundSummary } from "../src/inbound-receipts-domain.js";
const line = {id:"line-1",supplier_code:"01314",internal_sku:"01314",description:"Produto",expected_qty:4,counted_qty:4,commercial_unit:"UN",tributary_unit:"UN",tributary_qty:4,line_number:1};
const rows=[line,{...line,id:"line-2",expected_qty:2,counted_qty:null},{...line,id:"line-3",internal_sku:"00022",supplier_code:"00022",counted_qty:2},{...line,id:"extra",supplier_code:"EXTRA",internal_sku:null,expected_qty:0,counted_qty:1,is_extra:true}];
test("visual indicators count each SKU once, keep pending parts, and show divergences as a subset",()=>{
  assert.deepEqual(inboundViewCounts(rows),{expected:2,checked:1,pending:1,divergent:2,extras:1});
  assert.equal(inboundRowsForFilter(rows,"ALL").length,4);
  assert.equal(inboundRowsForFilter(rows,"PENDING")[0].id,"line-2");
  assert.equal(inboundRowsForFilter(rows,"CHECKED").length,3);
  assert.deepEqual(inboundRowsForFilter(rows,"DIVERGENT").map(i=>i.id),["line-3","extra"]);
});
test("packing-style cards preserve leading zeros, unplanned lines, original detail and escape content",()=>{
  const html=inboundItemRows([{...line,description:'<img src=x onerror=alert(1)>'},rows[3]],{editable:true,selectedId:line.id,filter:"ALL"});
  assert.match(html,/01314/);assert.match(html,/inbound-selected/);assert.match(html,/Não previsto/);assert.match(html,/Detalhes do item/);
  assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img/);
});
test("receiving workspace reuses packing classes, separates reading from lists and keeps completion below the work grid",()=>{
  const receipt={id:"r1",status:"EM_CONFERENCIA",invoice_number:"123",series:"1",source_name:"Origem",assigned_to:"op",assigned_name:"Operador"};
  const html=inboundDetail({receipt,items:rows,summary:inboundSummary(rows),isManager:false,editable:true,actorId:"op",users:[],filter:"ALL",selectedId:line.id});
  for(const name of ["transfer-execution-panel","transfer-execution-summary","transfer-work-grid","transfer-scan-panel","transfer-live-panel","transfer-product-list","transfer-completion-actions"])assert.match(html,new RegExp(name));
  assert.ok(html.indexOf('class="transfer-scan-panel"')<html.indexOf('class="transfer-live-panel"'));
  assert.ok(html.indexOf('class="transfer-live-panel"')<html.indexOf('<footer class="transfer-completion-actions"'));
  assert.match(html,/Itens pendentes/);assert.match(html,/Itens conferidos/);assert.match(html,/Itens divergentes/);
  assert.doesNotMatch(html,/id="(?:transferWorkGrid|transferCurrentItem|transferProductList|transferCompletionActions)"/);
});
test("receipt cancellation and deletion controls follow management roles and terminal states",()=>{
  const receipt={id:"r1",status:"EM_CONFERENCIA",invoice_number:"123",series:"1",source_name:"Origem"};
  const base={receipt,items:rows,summary:inboundSummary(rows),editable:false,users:[],filter:"ALL"};
  const admin=inboundDetail({...base,isManager:true,isAdministrator:true});assert.match(admin,/data-cancel-receipt/);assert.match(admin,/data-delete-receipt/);
  const supervisor=inboundDetail({...base,isManager:true});assert.match(supervisor,/data-cancel-receipt/);assert.doesNotMatch(supervisor,/data-delete-receipt/);
  const operator=inboundDetail({...base,isManager:false});assert.doesNotMatch(operator,/data-cancel-receipt|data-delete-receipt/);
  const cancelled=inboundDetail({...base,receipt:{...receipt,status:"CANCELADO"},isManager:true,isAdministrator:true});assert.doesNotMatch(cancelled,/data-cancel-receipt|data-finish|data-start/);assert.match(cancelled,/Recebimento cancelado/);assert.match(cancelled,/data-delete-receipt/);
});
test("redesign keeps operational actions only for the current permitted actor and preserves reports",()=>{
  const receipt={id:"r1",status:"EM_CONFERENCIA",invoice_number:"123",series:"1",source_name:"Origem",destination_name:"VDCG",assigned_to:"op",assigned_name:"Operador"};
  const base={receipt,items:rows,summary:inboundSummary(rows),users:[],filter:"ALL",actorId:"op"};
  const operational=inboundDetail({...base,isManager:false,editable:true});
  for(const key of ["data-scan","data-finish","data-confirm","data-report","data-xml","data-history"]) assert.match(operational,new RegExp(key));
  const readonly=inboundDetail({...base,actorId:"supervisor",isManager:true,editable:false});
  assert.doesNotMatch(readonly,/data-scan|data-finish|data-start/);
  assert.match(readonly,/Contagem em andamento com Operador/);
  const completed=inboundDetail({...base,receipt:{...receipt,status:"CONCLUIDO_CORRETO"},isManager:true,editable:false});
  assert.match(completed,/Resultado da conferência/);assert.match(completed,/data-validate/);assert.doesNotMatch(completed,/data-finish/);
});
test("continue card selects real accessible receipt and handles multiple receipts or empty state",()=>{
  const receipts=[{id:"a",invoice_number:"17",series:"2",source_name:"Origem A",assigned_name:"Conferente",status:"EM_CONFERENCIA"},{id:"b",invoice_number:"18",series:"3",source_name:"Origem B",status:"AGUARDANDO"}];
  assert.match(inboundActiveCard(receipts,{id:"b"}),/data-open="b"/);assert.match(inboundActiveCard(receipts,{id:"b"}),/data-current-select/);
  assert.match(inboundActiveCard([],null),/Nenhuma conferência/);
});
