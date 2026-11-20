import test from "node:test";
import assert from "node:assert/strict";
import { findPendingOwnDuplicate, summarizeOpenReplenishment } from "../src/replenishment-duplicates.js";
test("duplicate guard matches padded SKUs and same requester only",()=>{
 const requests=[{id:"a",warehouse_code:"VDCG",codigo_material:"51213",solicitado_por_id:"evandro",solicitado_por_nome:"Evandro",quantidade_solicitada:9,quantidade_pendente:9,status:"PENDENTE"}];
 assert.equal(findPendingOwnDuplicate(requests,{warehouse:"VDCG",actorId:"evandro",sku:"051213",quantity:9}),requests[0]);
 assert.equal(findPendingOwnDuplicate(requests,{warehouse:"VDAR",actorId:"evandro",sku:"51213",quantity:9}),null);
 assert.equal(findPendingOwnDuplicate(requests,{warehouse:"VDCG",actorId:"joao",sku:"51213",quantity:9}),null);
 assert.equal(findPendingOwnDuplicate(requests,{warehouse:"VDCG",actorId:"evandro",sku:"51213",quantity:4}),null);
 const warn=summarizeOpenReplenishment(requests,{formatQty:String,statusLabel:()=> "Na fila"});
 assert.match(warn,/Evandro.*Na fila.*9 un/);
});
