import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { responseRequestMetrics, summarizeRequestHealth, recordRequestHealth, requestHealthSnapshot } from "../src/request-health.js";

test("catalog RPC object reports SKU total rather than false zero", () => {
  const metrics = responseRequestMetrics("fetch-product-catalog", {status: 200, data: {"89678": "Produto A","52044": "Produto B"}});
  assert.deepEqual(metrics,{rows: 2, count: null});
  assert.deepEqual(responseRequestMetrics("fetch-product-catalog",{data: {}}),{rows: 0,count:null});
});

test("HEAD count status 206 is a successful count, without pretending zero rows", () => {
  const metrics=responseRequestMetrics("count-stock-CAPTACAO", {status:206, data:null, count:1414});
  assert.deepEqual(metrics,{rows:null,count:1414});
  assert.deepEqual(summarizeRequestHealth([{status:200},{status:206},{status:429},{status:0}]),{success:2,failed:2,partial:1});
});

test("request history retains only aggregate metadata", () => {
  recordRequestHealth("fetch-product-catalog", performance.now(), {status:200,rows:32878});
  const last=requestHealthSnapshot().at(-1);
  assert.equal(last.rows,32878);
  assert.equal(last.status,200);
  assert.ok(!JSON.stringify(last).includes("Produto"));
});

test("system diagnostics summarize results and keep raw requests behind technical details", async () => {
  const source=await readFile(new URL("../script.js",import.meta.url),"utf8");
  assert.match(source,/Saúde das consultas:/);
  assert.match(source,/Ver detalhes técnicos das últimas consultas/);
  assert.match(source,/responseRequestMetrics\(label, response\)/);
  assert.match(source,/HTTP 206 \(resposta esperada\)/);
});
