import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../script.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('  async function refreshLeaderIncrementalData()'),source.indexOf('  function renderTransfers('));
test('incremental response from a previous warehouse cannot update current rows, status or a new synchronization lock',async()=>{
  let finish,warehouse='VDCG',applied=0,status=0;
  const state={active:true,syncGeneration:1,refreshRunning:false,lastLiveUpdateAt:'2026-10-29T00:00:00Z'};
  const env={realtimeState:state,transferState:{savingActionKey:'',activeTransferId:'t1'},authState:{currentUser:{id:'operator'}},moduleLoadState:{transfers:true,replenishment:false},isSupabaseReady:()=>true,canUseNetwork:()=>true,activeWarehouseCode:()=>warehouse,checkLatestAddressCacheInvalidation:async()=>{},getActiveScreenId:()=>'transferencias',invalidateTransferStatsCache(){},fetchWarehouseUpdatedRows:()=>new Promise(resolve=>{finish=resolve;}),applyLocalTransferUpdate(){applied++;},applyLocalTransferItemUpdate(){applied++;},fromDbTransfer:row=>row,fromDbTransferItem:row=>row,recordPerformanceMetric(){},setSyncStatus(){status++;},scheduleTransferRealtimeRefresh(){},performance:globalThis.performance};
  const refresh=new Function('env','with(env){'+code+';return refreshLeaderIncrementalData;}')(env);
  const pending=refresh();await Promise.resolve();warehouse='VDAR';state.syncGeneration=2;state.refreshRunning=true;
  finish([{id:'old',warehouse_code:'VDCG'}]);await pending;
  assert.equal(applied,0);assert.equal(status,0);assert.equal(state.refreshRunning,true);
});
