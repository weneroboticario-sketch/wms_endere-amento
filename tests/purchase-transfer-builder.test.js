import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import { parseStoreNeedText, compareNeedWithCapture, validatePurchaseCart, getStoreNeedStatus } from "../src/purchase-transfer-model.js";

test("necessidade preserva zeros e consolida SKUs repetidos", () => {
  const {rows,errors}=parseStoreNeedText("01302;20\n94137;8\n01302;2");
  assert.deepEqual(errors,[]);assert.equal(rows.length,2);assert.equal(rows[0].sku,"01302");assert.equal(rows[0].need,22);
  assert.equal(parseStoreNeedText("123;-1\n123;1.5").errors.length,2);
  assert.equal(getStoreNeedStatus(null),"DESCONHECIDO");assert.equal(getStoreNeedStatus(2,3),"BAIXO");
});
test("parcial, zero e saldo desconhecido nao se confundem", () => {
  const partial=compareNeedWithCapture({sku:"01302",need:50},{available:30});
  assert.equal(partial.suggested,30);assert.equal(partial.missing,20);
  assert.equal(compareNeedWithCapture({need:10},{available:0}).situation,"SEM SALDO");
  assert.equal(compareNeedWithCapture({need:10},null).available,null);
  assert.equal(validatePurchaseCart([{...partial,quantity:40}]),"Saldo insuficiente ou desconhecido: 01302.");
  assert.equal(validatePurchaseCart([{...partial,quantity:20}]),"");
});
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
