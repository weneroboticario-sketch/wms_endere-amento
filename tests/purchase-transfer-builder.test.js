import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const source=await readFile(new URL("../src/purchase-transfer-builder.js",import.meta.url),"utf8");
test("responsible is visible in cart and is read before rendering the action",()=>{
  const aside=source.slice(source.indexOf('<aside class="pb-cart">'),source.indexOf("</aside>"));
  assert.match(aside,/id="pbResponsible"/);
  assert.ok(aside.indexOf('id="pbResponsible"')<aside.indexOf('data-pb="${step===3?"create":"review"}"'));
  assert.ok(source.indexOf("if(input)responsible=input.value")<source.indexOf("busy=true;draw()"));
  assert.match(source,/input\?\.scrollIntoView/);
  assert.match(source,/input\?\.focus/);
});
test("saving a draft is a success notice and still does not create a transfer",()=>{
  const save=source.slice(source.indexOf('if(action==="save")'),source.indexOf('if(action==="restore")'));
  assert.match(save,/messageKind="success"/);
  assert.match(save,/Nenhuma tarefa foi criada/);
  assert.doesNotMatch(save,/wms_create_purchase_transfer|await create/);
});
