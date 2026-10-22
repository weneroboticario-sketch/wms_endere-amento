import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";
import {workflowDatabase} from "./purchases-workflow-db.test.js";

const migration=new URL("../supabase/migrations/20261014185927_purchases_all_active_warehouses.sql",import.meta.url);

test("COMPRAS navigation and workflow contexts use only explicitly assigned stores",async()=>{
  const source=await readFile(new URL("../script.js",import.meta.url),"utf8");
  const fn=source.match(/  function allowedWarehouseCodesForUser\(user\) \{[\s\S]*?\n  }/)[0];
  const context={IS_CP_ALAMO:true,activeWarehouseCodes:()=>["A","B","DOURADOS"],DEFAULT_WAREHOUSE_CODE:"A",warehouseState:{tableAvailable:true},parseWarehouseCodes:v=>String(v||"").split(",").filter(Boolean),normalizeWarehouseCodeOrBlank:v=>v||"",removeAccidentalDefaultWarehouse:(defaultCode,allowed)=>({defaultCode,allowed})};
  vm.createContext(context);vm.runInContext(fn,context);
  const buyer={role:"COMPRAS",defaultWarehouseCode:"A",allowedWarehouseCodes:"A"};
  assert.deepEqual(Array.from(context.allowedWarehouseCodesForUser(buyer)),["A"]);
  assert.deepEqual(Array.from(context.allowedWarehouseCodesForUser({...buyer,allowedWarehouseCodes:"A,B"})),["A","B"]);
  for(const role of ["OPERADOR","SUPERVISOR","ATENDENTE"])assert.deepEqual(Array.from(context.allowedWarehouseCodesForUser({...buyer,role})),["A"]);
  context.IS_CP_ALAMO=false;
  assert.deepEqual(Array.from(context.allowedWarehouseCodesForUser(buyer)),["A"]);
  assert.match(source,/isGlobalAdmin\(\) \|\| isPurchasesUser\(\) \? allowedWarehouseCodesForUser\(authState.currentUser\)/);
});

test("explicit buyer scope excludes unassigned new stores and preserves other roles",async()=>{
  const db=await workflowDatabase();
  try {
    await db.exec(`reset role;
      create or replace function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      alter table wms_users add column if not exists allowed_warehouse_codes text;
      alter table wms_users add column if not exists is_global_admin boolean default false;
      update wms_users set auth_user_id='11111111-1111-1111-1111-111111111111',role='COMPRAS',default_warehouse_code='A',allowed_warehouse_codes='A' where id='actor';
      insert into wms_warehouses(id,code,name,active) values('control','DOURADOS','Control',true),('inactive','C','Inactive',false);
      select set_config('test.uid','11111111-1111-1111-1111-111111111111',false);`);
    const sql=await readFile(migration,"utf8");await db.exec(sql);await db.exec(sql);
    await db.exec("alter function private.current_wms_allowed_warehouses() rename to legacy_wms_allowed_warehouses;select set_config('test.role','COMPRAS',false);");
    await db.exec(await readFile(new URL("../supabase/migrations/20261022120000_purchases_explicit_warehouse_scope.sql",import.meta.url),"utf8"));
    const scope=async()=> (await db.query("select private.current_wms_allowed_warehouses() allowed")).rows[0].allowed;
    assert.deepEqual(await scope(),["A"]);
    await db.exec("insert into wms_warehouses(id,code,name,active) values('future','D','Future',true)");
    assert.deepEqual(await scope(),["A"]);
    await db.exec("update wms_users set allowed_warehouse_codes='A,B,D' where id='actor'");
    assert.deepEqual(await scope(),["A","B","D"]);
    await db.exec("update wms_users set allowed_warehouse_codes='A' where id='actor'");
    for(const role of ["OPERADOR","SUPERVISOR","ATENDENTE","ADMINISTRADOR"]){
      await db.query("update wms_users set role=$1 where id='actor'",[role]);
      await db.query("select set_config('test.role',$1,false)",[role]);
      assert.deepEqual(await scope(),["A"]);
    }
    await db.exec("update wms_users set is_global_admin=true where id='actor'");
    assert.deepEqual(await scope(),["A","B","D","DOURADOS"]);
    await db.exec("select set_config('test.role','COMPRAS',false);update wms_users set role='COMPRAS',is_global_admin=false,active=false where id='actor'");
    assert.deepEqual(await scope(),[]);
    await db.exec("update wms_users set active=true,archived=true where id='actor'");assert.deepEqual(await scope(),[]);
    await db.exec("update wms_users set archived=false where id='actor';select set_config('test.uid','',false)");assert.deepEqual(await scope(),[]);
  }finally{await db.close();}
});
