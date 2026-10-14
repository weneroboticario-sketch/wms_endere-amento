import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const script=readFileSync(new URL("../script.js",import.meta.url),"utf8");
test("Estoque recebe Compras no cartao existente de transferencia, nao na reposicao",()=>{
  const panel=script.slice(script.indexOf("function transferPanelRowHtml(transfer)"),script.indexOf("function renderTransferMergePanel()"));
  for(const field of ["transfer-route-flow","Sai de","Vai para","transferStageTrackHtml","transfer-progress","transfer-board-meta","Responsável"])assert.ok(panel.includes(field));
  assert.ok(panel.includes('purchaseRequest ? "COMPRAS"'));
  assert.ok(panel.includes("NF obrigatoria"));
  const personal=script.slice(script.indexOf("function myTransferCardHtml(transfer)"),script.indexOf("function getMyOperationalTasks()"));
  assert.ok(personal.includes('IS_CP_ALAMO && transfer.requestOrigin === "COMPRAS"'));
  assert.ok(personal.includes("return transferPanelRowHtml(transfer).replace"));
});
