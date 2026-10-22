import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { PGlite } from "@electric-sql/pglite";
import { normalizedWarehouseSelection, verifySavedWarehouseSelection, purchasesQueryWarehouse } from "../src/user-warehouse-access.js";

const source = readFileSync(new URL("../script.js", import.meta.url), "utf8");
function getFunction(name, context) {
  const start = source.search(new RegExp("  (?:async )?function " + name + "\\("));
  const after = source.slice(start + 2).search(/\n  (?:async )?function /);
  return vm.runInNewContext("(" + source.slice(start, start + 2 + after) + ")", context);
}
const codes = ["14177", "22796", "23696"];

test("read-back must confirm all three units; partial, missing or extra scopes reject success", () => {
  assert.deepEqual(verifySavedWarehouseSelection(codes, "23696,14177,22796"), codes);
  for (const stored of ["14177", "14177,22796", "14177,22796,23696,99999", null]) assert.throws(() => verifySavedWarehouseSelection(codes, stored), /nao foram confirmadas/);
});

test("purchases gets only explicitly stored active units, not all warehouses", () => {
  const allowed = getFunction("allowedWarehouseCodesForUser", {
    IS_CP_ALAMO:true, activeWarehouseCodes:()=>[...codes,"99999"],
    parseWarehouseCodes:normalizedWarehouseSelection, warehouseState:{tableAvailable:true}
  });
  assert.deepEqual(Array.from(allowed({ role:"COMPRAS", defaultWarehouseCode:"14177", allowedWarehouseCodes:codes })), codes);
  assert.deepEqual(Array.from(allowed({ role:"COMPRAS", defaultWarehouseCode:"14177", allowedWarehouseCodes:["14177"] })), ["14177"]);
});

test("query scope permits all or individual authorized units without changing operational warehouse", () => {
  const user = {role:"COMPRAS", defaultWarehouseCode:"14177"};
  assert.equal(purchasesQueryWarehouse(user,codes,""),null);
  for (const code of codes) assert.equal(purchasesQueryWarehouse(user,codes,code),code);
  assert.throws(()=>purchasesQueryWarehouse(user,codes,"99999"),/nao autorizada/);
  assert.throws(()=>purchasesQueryWarehouse({role:"OPERADOR"},codes,""),/nao autorizada/);
  assert.equal(user.defaultWarehouseCode,"14177");
});

test("reopening and rerendering the warehouse inputs preserves all three explicit selections", () => {
  const elements={userDefaultWarehouseInput:{},userAllowedWarehousesInput:{}};
  const render = getFunction("renderUserWarehouseInputs", {
    $:id=>elements[id],warehouseState:{warehouses:codes.map(code=>({code,name:code,active:true}))},
    isGlobalAdmin:()=>true,isSupervisor:()=>false,activeWarehouseCode:()=>"14177",
    normalizeWarehouseCode:value=>String(value||"").toUpperCase(),parseWarehouseCodes:normalizedWarehouseSelection,
    escapeHtml:String,renderUserSupervisorOptions:()=>{}
  });
  for(let attempt=0;attempt<3;attempt++) {
    render({role:"COMPRAS",defaultWarehouseCode:"14177",allowedWarehouseCodes:codes});
    for(const code of codes) assert.ok(elements.userAllowedWarehousesInput.innerHTML.includes('value="'+code+'" checked'));
    assert.equal(elements.userDefaultWarehouseInput.value,"14177");
  }
});

test("saving waits for complete database confirmation before success and preserves draft on mismatch", async () => {
  const fields = {
    userEditId:{value:"u"},userNameInput:{value:"Compras Teste"},userUsernameInput:{value:"buyer"},userAuthEmailInput:{value:"buyer@example.com"},
    userPasswordInput:{value:""},userRoleInput:{value:"COMPRAS"},userActiveInput:{checked:true},userAvailableInput:{checked:false},
    userDefaultWarehouseInput:{value:"14177"},userSupervisorInput:{value:""},userGlobalAdminInput:{checked:false},saveUserButton:{}
  };
  const saved=new Map(); const statuses=[]; let incomplete=false, resets=0;
  const context={
    $:id=>fields[id],isAdminOrSupervisor:()=>true,isAdmin:()=>true,isSupervisor:()=>false,
    selectedUserWarehouseCodes:()=>[...codes],ensureWarehousesLoaded:async()=>true,
    normalizeText:String,normalizeRecoveryEmail:value=>String(value).toLowerCase(),normalizeWarehouseCode:String,
    activeWarehouseCode:()=>"14177",activeWarehouseCodes:()=>codes,
    authState:{currentUser:{id:"admin",username:"admin"},users:[{id:"u",username:"buyer",name:"Compras Teste",authEmail:"buyer@example.com",defaultWarehouseCode:"14177"}]},
    canManageUserRecord:()=>true,isStoreStaffRole:()=>false,isDeliverableRecoveryEmail:()=>true,ROLES:["COMPRAS"],
    warehouseExistsAndActive:code=>codes.includes(code),beginTransferAction:()=>true,endTransferAction:()=>{},warehouseIdForCode:code=>code,
    unique:values=>[...new Set(values)],supabaseDb:{},
    invokeUserAdministration:async(_client,body)=>{saved.set(body.profile.id,{...body.profile});return{userId:body.profile.id};},
    fetchUsersWithColumns:async()=>({data:{...saved.get("u"),allowed_warehouse_codes:incomplete?"14177":saved.get("u").allowed_warehouse_codes}}),
    userSelectColumnList:()=>[],userOptionalColumnMap:()=>({}),
    fromDbUser:row=>({...row,authEmail:row.auth_email,defaultWarehouseCode:row.default_warehouse_code,warehouseAccessConfirmed:true,supervisorId:""}),
    verifySavedWarehouseSelection,loadUsers:async()=>true,renderActiveWarehouseUi:()=>{},recordAuthHistory:async()=>{},
    resetUserForm:()=>{resets++;},renderUsers:()=>{},setStatus:(_id,message,tone)=>statuses.push({message,tone}),formatSupabaseError:error=>error.message
  };
  const save=getFunction("saveUserFromForm",context);
  await save();
  assert.deepEqual(normalizedWarehouseSelection(saved.get("u").allowed_warehouse_codes),codes);
  assert.equal(statuses.at(-1).tone,"success");
  incomplete=true; const previousResets=resets;
  await save();
  assert.equal(statuses.at(-1).tone,"error");
  assert.equal(resets,previousResets);
  assert.equal(fields.userEditId.value,"u");
});

test("background user-list rendering does not rebuild an already valid warehouse draft", () => {
  const render=source.slice(source.indexOf("  function renderUsers()"),source.indexOf("  function renderUsers()")+1000);
  assert.ok(render.includes('!$("userAllowedWarehousesInput").querySelector("input[type=checkbox]")'));
  const repair=source.slice(source.indexOf("  async function repairUserWarehouseAssignments()"),source.indexOf("  async function loadAccessRequests()"));
  assert.ok(repair.includes('if (IS_CP_ALAMO && user.role === "COMPRAS") continue;'));
});

test("local database persists three units and RLS excludes a fourth for consolidated reads", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated; create schema private;
      create table public.wms_users(username text primary key,allowed_warehouse_codes text,default_warehouse_code text);
      create table public.wms_warehouses(code text primary key, active boolean);
      create table public.scoped_records(warehouse_code text);
      insert into public.wms_users values('buyer','14177','14177');
      insert into public.wms_warehouses values('14177',true),('22796',true),('23696',true),('99999',true);
      insert into public.scoped_records values('14177'),('22796'),('23696'),('99999');
      create function private.allowed() returns text[] language sql stable security definer set search_path='' as $$
        select array(select distinct upper(btrim(c.code)) from public.wms_users u,
          unnest(string_to_array(coalesce(nullif(u.allowed_warehouse_codes,''),u.default_warehouse_code,''),',')) c(code)
          join public.wms_warehouses w on w.code=upper(btrim(c.code)) and w.active
          where u.username=current_setting('test.username',true))
      $$;
      grant usage on schema private to authenticated;
      grant execute on function private.allowed() to authenticated;
      grant select on public.scoped_records to authenticated;
      alter table public.scoped_records enable row level security;
      create policy scope_only on public.scoped_records for select to authenticated using(warehouse_code=any(private.allowed()));
      update public.wms_users set allowed_warehouse_codes='14177,22796,23696' where username='buyer';`);
    const saved = (await db.query("select * from public.wms_users where username='buyer'")).rows[0];
    assert.deepEqual(verifySavedWarehouseSelection(codes,saved.allowed_warehouse_codes), codes);
    assert.equal(saved.default_warehouse_code,"14177");
    await db.exec("select set_config('test.username','buyer',false);set role authenticated;");
    assert.deepEqual((await db.query("select warehouse_code from public.scoped_records order by 1")).rows.map(row=>row.warehouse_code),codes);
    assert.equal((await db.query("select * from public.scoped_records where warehouse_code='99999'")).rows.length,0);
  } finally { await db.close(); }
});
