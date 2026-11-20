import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { buildReplenishmentExportRows } from "../src/replenishment-export.js";

const source = await readFile(new URL("../script.js", import.meta.url), "utf8");
const update = source.slice(source.indexOf("  async function updateReplenishmentQuantity("), source.indexOf("  async function markReplenishmentNoStock("));
const complete = source.slice(source.indexOf("  async function completeReplenishmentRequest("), source.indexOf("  async function cancelReplenishmentRequest("));

test("explicitly confirmed overdelivery accepts 70 units against 50 originally requested", async () => {
  const request={id:"synthetic",requestedQty:50,attendedQty:0,pendingQty:50,observacao:"",status:"EM_SEPARACAO"};
  const context=vm.createContext({getReplenishmentById:()=>request,formatQty:String,nowIso:()=>"2026-11-20T15:00:00Z",normalizeText:value=>String(value || "").trim(),updateReplenishmentRow:async(id,patch)=>Object.assign(request,patch),authState:{currentUser:{id:"op",name:"Operador"}}});
  vm.runInContext(update+complete,context);
  await assert.rejects(context.updateReplenishmentQuantity(request.id,70,""),/Confirme o excedente/);
  assert.equal(request.attendedQty,0);
  await context.updateReplenishmentQuantity(request.id,70,"","Conferi 20 unidades a mais fisicamente");
  assert.equal(request.requestedQty,50);
  assert.equal(request.attendedQty,70);
  assert.equal(request.pendingQty,0);
  assert.equal(request.overdeliveryConfirmedQty,70);
  assert.equal(request.status,"SEPARADO");
  await context.completeReplenishmentRequest(request.id);
  assert.deepEqual(buildReplenishmentExportRows([{id:request.id,warehouse_code:"VDCG",codigo_material:"50014",quantidade_atendida:request.attendedQty,quantidade_solicitada:request.requestedQty,status:request.status}],"VDCG"),[["50014",70]]);
});

test("invalid quantities are rejected and partial attendance keeps its remaining units", async () => {
  const request = {requestedQty:15,attendedQty:0,observacao:""};
  const context = vm.createContext({getReplenishmentById:()=>request,formatQty:String,normalizeText:value=>String(value || "").trim(),updateReplenishmentRow:async (id,patch)=>Object.assign(request,patch),authState:{currentUser:{id:"op",name:"Operador"}}});
  vm.runInContext(update,context);
  for (const quantity of [-1,NaN,Infinity]) await assert.rejects(context.updateReplenishmentQuantity("synthetic",quantity,""),/invalida|motivo/);
  await context.updateReplenishmentQuantity("synthetic",10,"");
  assert.equal(request.attendedQty,10);
  assert.equal(request.pendingQty,5);
  assert.equal(request.status,"ATENDIDO_PARCIAL");
});
