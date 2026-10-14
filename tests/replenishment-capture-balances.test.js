import test from "node:test";
import assert from "node:assert/strict";
import { fetchReplenishmentCaptureBalances } from "../src/replenishment-capture-balances.js";

test("saldo CAPTACAO consulta apenas estoque e SKUs pedidos, preserva zero e soma posicoes", async () => {
  const calls = [];
  const query = {select(v){calls.push(["select",v]);return this;},eq(k,v){calls.push([k,v]);return this;},or(){return this;},in(k,v){calls.push([k,v]);return this;},order(){return this;},range(){return {data:[{codigo_material:"01302",total_disponivel:5},{codigo_material:"01302",total_disponivel:3},{codigo_material:"83768",total_disponivel:0}]};}};
  const result = await fetchReplenishmentCaptureBalances({from:()=>query},"22796",["01302","83768","01302"]);
  assert.deepEqual(result,{"01302":8,"83768":0});
  assert.ok(calls.some(([k,v])=>k==="warehouse_code"&&v==="22796"));
  assert.ok(calls.some(([k,v])=>k==="source_type"&&v==="CAPTACAO"));
  assert.deepEqual(calls.find(([k])=>k==="codigo_material")[1],["01302","83768"]);
  assert.equal(result.missing,undefined);
});
test("erro de consulta nao se transforma em saldo zero", async () => {
  const query={select(){return this;},eq(){return this;},or(){return this;},in(){return this;},order(){return this;},range(){return {error:new Error("Sem acesso")};}};
  await assert.rejects(fetchReplenishmentCaptureBalances({from:()=>query},"22796",["83768"]),/Sem acesso/);
});
