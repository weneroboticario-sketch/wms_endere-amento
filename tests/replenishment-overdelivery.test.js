import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { buildReplenishmentExportRows } from "../src/replenishment-export.js";

const source = await readFile(new URL("../script.js", import.meta.url), "utf8");
const update = source.slice(source.indexOf("  async function updateReplenishmentQuantity("), source.indexOf("  async function markReplenishmentNoStock("));
const complete = source.slice(source.indexOf("  async function completeReplenishmentRequest("), source.indexOf("  async function cancelReplenishmentRequest("));

test("WMS quantity updates use an atomic authenticated RPC and keep the same token after a network failure", async () => {
  const calls = [], saved = [], actions = {};
  let failed = true;
  const context = vm.createContext({ IS_CP_ALAMO:false, ownerAttendActions:actions, randomId:()=>"stable-action",
    activeWarehouseCode:()=>"VDCG",authState:{currentUser:{id:'g'}},getReplenishmentById:()=>({requestedQty:15,attendedQty:0}),
    fromDbReplenishmentRequest:r=>r,replenishmentState:{requests:saved},upsertById:(list,r)=>list.push(r),
    supabaseDb:{rpc:async (name,args)=>{calls.push({name,args});if(failed){failed=false;return {error:new Error("network")};}
      return {data:{id:"request",quantidade_atendida:16}};}} });
  vm.runInContext(update,context);
  await assert.rejects(context.updateReplenishmentQuantity("request",16,""),/network/);
  await context.updateReplenishmentQuantity("request",16,"");
  assert.equal(calls[0].args.p_payload.action_id,calls[1].args.p_payload.action_id);
  assert.equal(calls[1].name,"wms_replenishment_owner_export");
  assert.equal(calls[1].args.p_payload.quantity,16);
  assert.equal(calls[1].args.p_payload.owner_id,undefined);
  assert.equal(saved[0].quantidade_atendida,16);
  assert.deepEqual(actions,{});
});

test("overdelivery preserves requested quantity, actual units and export", async () => {
  for (const initial of [0,15]) {
    const request = { id:"synthetic",requestedQty:15,attendedQty:initial,observacao:"",createdAt:"2026-10-29T12:00:00Z" };
    const context = vm.createContext({ IS_CP_ALAMO:true, getReplenishmentById:()=>request,normalizeText:value=>String(value || "").trim(),nowIso:()=>"2026-10-29T12:10:00Z",updateReplenishmentRow:async (id,patch)=>Object.assign(request,patch) });
    vm.runInContext(update+complete,context);
    await context.updateReplenishmentQuantity(request.id,16-initial,"");
    assert.equal(request.requestedQty,15);
    assert.equal(request.attendedQty,16);
    assert.equal(request.pendingQty,0);
    assert.equal(request.status,"SEPARADO");
    await context.completeReplenishmentRequest(request.id);
    assert.deepEqual(buildReplenishmentExportRows([{id:request.id,warehouse_code:"VDCG",codigo_material:"94133",quantidade_atendida:request.attendedQty,quantidade_solicitada:request.requestedQty,status:request.status}],"VDCG"),[["94133",16]]);
  }
});

test("invalid quantities are rejected and partial attendance keeps its remaining units", async () => {
  const request = {requestedQty:15,attendedQty:0,observacao:""};
  const context = vm.createContext({ IS_CP_ALAMO:true,getReplenishmentById:()=>request,normalizeText:value=>String(value || "").trim(),updateReplenishmentRow:async (id,patch)=>Object.assign(request,patch)});
  vm.runInContext(update,context);
  for (const quantity of [-1,NaN,Infinity]) await assert.rejects(context.updateReplenishmentQuantity("synthetic",quantity,""),/invalida|motivo/);
  await context.updateReplenishmentQuantity("synthetic",10,"");
  assert.equal(request.attendedQty,10);
  assert.equal(request.pendingQty,5);
  assert.equal(request.status,"ATENDIDO_PARCIAL");
});
