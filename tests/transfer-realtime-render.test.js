import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source = await readFile(new URL("../script.js",import.meta.url),"utf8");
test("realtime bursts render once and wait until deletion finishes", () => {
  const code = source.slice(source.indexOf("  var transferRealtimeRenderTimer = null;"),source.indexOf("  function scheduleStockRealtimeRefresh("));
  const timers = [];
  const state = {actionLocks: {}};
  let renders = 0;
  const schedule = new Function("window","realtimeState","transferState","getActiveScreenId","renderTransfers","renderDashboard","renderOperatorTasksAlert",
    code + "; return renderTransferRealtimeViews;")(
    {setTimeout: callback => {timers.push(callback);return timers.length;}},
    {active:true},state,()=>"transferencias",()=>renders++,()=>{},()=>{}
  );
  schedule();schedule();schedule();
  assert.equal(timers.length,1);
  state.actionLocks["delete-test:1"] = true;
  timers.shift()();
  assert.equal(renders,0);
  assert.equal(timers.length,1);
  delete state.actionLocks["delete-test:1"];
  timers.shift()();
  assert.equal(renders,1);
});

test("unchanged finalized rows keep their DOM and invoice decoration", () => {
  const code = source.slice(source.indexOf("  var finalizedTransferMarkup = null;"),source.indexOf("  function renderTableLimitNotice("));
  let writes = 0, decorations = 0, rows = [{id:"1"}];
  const root = {set innerHTML(_value){writes++;}};
  const render = new Function("$","isAdminOrSupervisor","getVisibleTransfers","isFinalTransferStatus","TRANSFER_FINALIZED_RENDER_LIMIT","finalizedTransferRowHtml","renderTableLimitNotice","transferInvoices",
    code + ";return renderFinalizedTransfers;")(
    ()=>root,()=>true,()=>rows,()=>true,100,t=>t.id,()=>"",()=>({decorate:()=>decorations++})
  );
  render();render();render();
  assert.equal(writes,1);
  assert.equal(decorations,1);
  rows = [];
  render();
  assert.equal(writes,2);
});
