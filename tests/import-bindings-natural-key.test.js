import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import vm from "node:vm";
test("import binding reuses natural key across warehouses, retries and moves without losing IDs",async()=>{
  const db=new PGlite();try{
    await db.exec("create schema private;create role anon;create role authenticated;grant usage on schema private,public to authenticated;create function private.has_wms_role(text[]) returns boolean language sql as $$select true$$;create function private.current_wms_allowed_warehouses() returns text[] language sql as $$select array['VDCG','VDAR']$$;");
    const baseline=await readFile(new URL("../supabase/migrations/20260923000000_legacy_baseline.sql",import.meta.url),"utf8");
    await db.exec(baseline.match(/create table if not exists public.wms_bindings \([\s\S]+?\);/)[0]);
    await db.exec("alter table wms_bindings add column warehouse_code text;alter table wms_bindings add column warehouse_id text;create unique index wms_bindings_warehouse_sku_location_idx on wms_bindings(warehouse_code,sku,location_code);alter table wms_bindings enable row level security;create policy scope on wms_bindings to authenticated using(warehouse_code in('VDCG','VDAR')) with check(warehouse_code in('VDCG','VDAR'));grant select,insert,update on wms_bindings to authenticated;");
    await db.exec(await readFile(new URL("../supabase/migrations/20261015155644_main_import_binding_natural_key.sql",import.meta.url),"utf8"));
    await db.exec("set role authenticated");
    const row={id:"first",sku:"00178",rua:1,rack:2,linha:3,letra:"A",location_code:"R01-RK02-L03-A",area_code:1,area_name:"Area",warehouse_code:"VDAR",warehouse_id:"unit",product_name:"First"};
    const write=(rows,code="VDAR")=>db.query("select wms_upsert_import_bindings($1,$2::jsonb) data",[code,JSON.stringify(rows)]);
    await write([row]);
    const again=(await write([{...row,id:"other",product_name:"Updated"},{...row,id:"third",product_name:"Final"}])).rows[0].data;
    assert.ok(again.every(r=>r.id==="first"));
    assert.equal((await db.query("select count(*)::int n from wms_bindings")).rows[0].n,1);
    assert.equal((await db.query("select product_name from wms_bindings")).rows[0].product_name,"Final");
    await write([{...row,id:"same-address-other-sku",sku:"48062"}]);
    await write([{...row,id:"another-unit",warehouse_code:"VDCG"}],"VDCG");
    await write([{...row,location_code:"R02-RK02-L03-A",rua:2}]);
    assert.equal((await db.query("select location_code from wms_bindings where id='first'")).rows[0].location_code,"R02-RK02-L03-A");
    assert.equal((await db.query("select count(*)::int n from wms_bindings")).rows[0].n,3);
    await assert.rejects(write([row],"OTHER"),/nao autorizado/);
    await assert.rejects(write([{...row,warehouse_code:"VDCG"}]),/fora do escopo/);
    await db.exec("set role anon");await assert.rejects(write([row]),/permission denied/);
  }finally{await db.close();}
});
test("stock import uses the binding RPC and reconciles returned IDs",async()=>{
  const script=await readFile(new URL("../script.js",import.meta.url),"utf8");
  const body=script.slice(script.indexOf("async function syncBindingsFromLocatedStockImport"),script.indexOf("async function deleteBindingsByIds"));
  assert.match(body,/rpc\("wms_upsert_import_bindings"/);
  assert.doesNotMatch(body,/upsertInChunks\("wms_bindings", upserts, "id"\)/);
  assert.match(body,/workingBindings.push\(saved\)/);
});

test("stock screen clears completed loading without hiding import messages",async()=>{
  const script=await readFile(new URL("../script.js",import.meta.url),"utf8");
  const fn=script.match(/  async function loadStockOperationalData\(\) \{[\s\S]*?\n  }/)[0];
  for(const [message,importing,expected] of [["Carregando Base de Estoque...",false,""],["Falha na importacao",false,"Falha na importacao"],["Gravando 200 itens",true,"Gravando 200 itens"]]){
    const status={textContent:message};
    const context={performance,stockState:{importing},isSupabaseReady:()=>true,
      closeInterruptedStockImportBatches:async()=>{},loadStockImportBatchRows:async()=>({data:[]}),
      countActiveStockPositions:async()=>12,getActiveScreenId:()=>"baseEstoque",$:()=>status,
      setStatus:(_,text)=>{status.textContent=text;},recordPerformanceMetric:()=>{}};
    vm.createContext(context);vm.runInContext(fn,context);
    assert.equal(await context.loadStockOperationalData(),true);
    assert.equal(status.textContent,expected);
  }
});

test("actual import sync adopts database IDs and keeps both locations in all four stocks",async()=>{
  const script=await readFile(new URL("../script.js",import.meta.url),"utf8");
  const fn=script.match(/  async function syncBindingsFromLocatedStockImport\([^]*?\n  }/)[0];
  for(const warehouseCode of ["VDCG","VDAR","VDSI","VDCO"]){
    const locations=["R01-RK01-L01-A","R02-RK01-L01-A"];
    const calls=[];
    let nextId=0;
    const context={state:{bindings:[]},stockImportOfficialLocationPlans:()=>locations.map(locationCode=>({sku:"00178",skuKey:"00178",locationCode,row:{nomeMaterial:"Produto"},parsed:{rua:1,rack:1,linha:1,letra:"A"}})),
      fetchWarehouseRows:async()=>[],fromDbBinding:x=>x,toDbBinding:x=>x,
      bindingMatchesWarehouseCode:b=>b.warehouseCode===warehouseCode,
      locationKeyFromBinding:b=>b.locationCode,splitSkuValues:v=>[v],normalizeSkuKey:v=>v,
      importedLocationAreaCode:()=>1,buildLinhaSeparacaoTemplateRows:()=>[],locationKeyFromCode:v=>v,
      getAreaByCode:()=>({name:"Area"}),findProductName:()=>"Produto",
      createBinding:sku=>({id:"client-"+(nextId++),sku,warehouseCode}),
      warehouseIdForCode:c=>"warehouse-"+c,normalizeWarehouseCode:v=>v,normalizeText:v=>String(v||""),
      sortByDateDesc:()=>0,deleteBindingsByIds:async()=>{throw Error("No deletion expected");},
      runSupabaseRequestWithRetry:async(_,run)=>run(),
      supabaseDb:{rpc:async(name,p)=>{calls.push({name,p});return {data:p.p_rows.map((r,i)=>({...r,id:"database-"+i})),error:null};}},
      expandBindingsWithMultipleSkus:b=>b,writeModuleCacheForWarehouse:async()=>{},unique:v=>[...new Set(v)]};
    vm.createContext(context);vm.runInContext(fn,context);
    await context.syncBindingsFromLocatedStockImport("CAPTACAO",[],warehouseCode,"2026-10-15T16:00:00Z");
    assert.equal(calls.length,1);
    assert.equal(calls[0].name,"wms_upsert_import_bindings");
    assert.equal(calls[0].p.p_warehouse_code,warehouseCode);
    assert.deepEqual(Array.from(context.state.bindings,b=>b.id),["database-0","database-1"]);
    assert.deepEqual(Array.from(context.state.bindings,b=>b.locationCode),locations);
    await context.syncBindingsFromLocatedStockImport("LOJA",[],warehouseCode,"2026-10-15T16:00:00Z");
    assert.equal(calls.length,1);
  }
});
