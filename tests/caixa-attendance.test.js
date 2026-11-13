
import test from "node:test";
import assert from "node:assert/strict";
import { caixaAttendanceBucket, caixaAttendanceView } from "../src/caixa-attendance.js";

const row=(id,kind,status,extras={})=>({id,kind,status,sku:"48060",quantity:2,created_at:"2026-10-29T15:00:00Z",...extras});
test("every Caixa adjustment is priority even if customer_service is false",()=>{
  const adjustment=row("a","ADJUSTMENT","EM_VERIFICACAO",{customer_service:false});
  assert.equal(caixaAttendanceBucket(adjustment,"worker","OPERADOR"),"available");
  assert.equal(caixaAttendanceView([adjustment],"worker","OPERADOR").counts.available,1);
});
test("claims appear in my queue, waiting-for-cashier remains distinct",()=>{
  const rows=[
    row("a","ADJUSTMENT","EM_VERIFICACAO",{claimed_by:"worker"}),
    row("b","ADJUSTMENT","AGUARDANDO_CONFIRMACAO_CAIXA",{claimed_by:"worker"}),
    row("c","PRODUCT","PENDENTE",{claimed_by:null,customer_service:true}),
    row("d","ADJUSTMENT","EM_VERIFICACAO",{claimed_by:"someone-else"}),
    row("e","ADJUSTMENT","CONCLUIDO",{confirmed_at:"2026-10-29T15:30:00Z"})
  ];
  const view=caixaAttendanceView(rows,"worker","OPERADOR","mine");
  assert.deepEqual(view.visible.map(r=>r.id),["a"]);
  assert.deepEqual(view.counts,{available:1,mine:1,waiting:1,others:1,closed:1});
  assert.deepEqual(caixaAttendanceView(rows,"worker","OPERADOR","waiting").visible.map(r=>r.id),["b"]);
  assert.deepEqual(caixaAttendanceView(rows,"cashier","CAIXA","available").visible.map(r=>r.id),["a","c","d"]);
});
test("duplicate SKUs remain distinct and queue prioritizes arrival",()=>{
  const rows=[row("late","PRODUCT","PENDENTE",{created_at:"2026-10-29T17:00:00Z"}),row("early","PRODUCT","PENDENTE",{created_at:"2026-10-29T14:00:00Z"})];
  assert.deepEqual(caixaAttendanceView(rows,"worker","OPERADOR").visible.map(r=>r.id),["early","late"]);
});
