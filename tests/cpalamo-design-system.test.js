import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { escapeHtml } from "../src/utils.js";

const read = path => readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("CP theme is scoped and consumes shared tokens without CSS framework or forced zoom",()=>{
  const css=read("src/cpalamo-theme.css")+read("src/purchases-workflow.css");
  assert.match(css,/:root\.cp-alamo/);
  assert.doesNotMatch(css,/!important|\bzoom\s*:|font-size:\s*[\d.]+vw/);
  for(const token of ["--app-bg","--surface","--border","--primary","--radius","--sidebar-width"])assert.ok(css.includes(token));
  assert.match(css,/font-variant-numeric: tabular-nums/);
  assert.match(css,/max-width:760px/);
});
test("CP user table retains selection IDs and isolates the independent WMS card renderer",()=>{
  const source=read("script.js");
  const start=source.indexOf("function cpUserTableHtml(users)");
  const fn=source.slice(start,source.indexOf("  function userCardHtml(user)",start));
  const user={id:"u1",name:"Colaborador <teste>",username:"000123",role:"OPERADOR",defaultWarehouseCode:"22796",active:true,availableForTasks:true};
  const html=runInNewContext(fn+";cpUserTableHtml([user])",{user,escapeHtml,userManagementState:{selectedIds:{u1:true}},isProtectedUserForDestructiveAction:()=>false});
  assert.match(html,/data-user-select="u1" checked/);
  assert.match(html,/data-user-open-detail="u1"/);
  assert.match(html,/000123/);
  assert.match(html,/Colaborador &lt;teste&gt;/);
  assert.match(source,/if \(IS_CP_ALAMO\) return cpUserTableHtml\(users\);/);
  for(const attribute of ["data-user-edit","data-user-reset","data-user-toggle","data-user-archive","data-user-delete"])assert.ok(source.includes(attribute));
});
test("fiscal drawer keeps upload fields and RPC contract while using accessible native dialog",()=>{
  const source=read("src/purchases-workflow.js");
  assert.match(source,/<dialog id="fiscalDetail"/);
  assert.match(source,/detail\.showModal\(\)/);
  assert.match(source,/role="tablist"/);
  for(const field of ["number","value","key","pdf"])assert.ok(source.includes('name="'+field+'"'));
  for(const rpc of ["wms_invoice_action","wms_transfer_enable_invoice"])assert.ok(source.includes(rpc));
  assert.match(source,/if \(busy\) event\.preventDefault\(\)/);
  assert.match(source,/detailTabValue = value/);
});
