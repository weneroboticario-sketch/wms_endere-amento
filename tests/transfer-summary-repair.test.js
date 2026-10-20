import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source = await readFile(new URL("../script.js",import.meta.url),"utf8");
test("visible missing summaries load once with at most three concurrent requests", async () => {
  const code = source.slice(source.indexOf("  var transferSummaryRepairAttempts = {};"),source.indexOf("  function renderTransferPanel()"));
  const state = {loadedItemTransferIds:{}};
  let active=0,max=0,renders=0;
  const requested=[];
  const repair = new Function("transferState","isSupabaseReady","canUseNetwork","loadTransferItemsForTransfer","getActiveScreenId","renderTransfers",
    code+";return ensureVisibleTransferTotals;")(
    state,()=>true,()=>true,async id=>{
      requested.push(id);active++;max=Math.max(max,active);
      await new Promise(resolve=>setTimeout(resolve,1));
      state.loadedItemTransferIds[id]=true;active--;
    },()=>"transferencias",()=>renders++
  );
  const rows=Array.from({length:7},(_,i)=>({id:String(i),totalItems:0,totalPreviewQuantity:0}));
  rows.push({id:"complete",totalItems:3,totalPreviewQuantity:40});
  await repair(rows);
  assert.equal(requested.length,7);
  assert.equal(max,3);
  await repair(rows);
  assert.equal(requested.length,7);
  assert.equal(renders,1);
});

test("legacy item totals are selected and mapped for unloaded summaries",()=>{
  assert.match(source,/"itens_total",/);
  assert.match(source,/totalItems: Number\(row.total_items \|\| row.itens_total/);
  assert.match(source,/transfer.totalPreviewQuantity = transfer.totalExpectedQuantity/);
});
