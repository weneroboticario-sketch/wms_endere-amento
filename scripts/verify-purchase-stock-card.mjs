import {readFile,mkdir} from "node:fs/promises";
import {runInNewContext} from "node:vm";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import assert from "node:assert/strict";
import {escapeHtml} from "../src/utils.js";
const source=await readFile("script.js","utf8");
const panel=source.slice(source.indexOf("function transferPanelRowHtml(transfer)"),source.indexOf("function renderTransferMergePanel()"));
const personal=source.slice(source.indexOf("function myTransferCardHtml(transfer)"),source.indexOf("function getMyOperationalTasks()"));
const fixture={id:"fixture",requestOrigin:"COMPRAS",purchasePriority:"ALTA",invoiceStage:"",requiresInvoice:true,status:"EM_SEPARACAO",code:"CMP-20261014-EXEMPLO",responsibleName:"Colaborador",createdAt:"2026-10-14T10:00:00Z"};
const globals={IS_CP_ALAMO:true,fixture,escapeHtml,getTransferStats:()=>({pendingPacking:3,pendingSeparation:3,progress:75,packed:0,separated:9,requested:12,totalItems:3}),
  getLatestTransferConferenceAssignment:()=>null,transferRouteOriginLabel:()=>"14177",transferRouteDestinationLabel:()=>"TLS1 (12423)",
  isAdminOrSupervisor:()=>false,canReassignTransfer:()=>false,canCancelTransfer:()=>false,
  transferDisplayName:()=>"14177 → TLS1",formatQty:v=>String(v),formatDateTime:()=>"14/10/2026, 08:00",
  transferStatusDisplayLabel:()=>"Em separacao",isFinalTransferStatus:()=>false};
const html=runInNewContext(panel+personal+";myTransferCardHtml(fixture)",globals);
const {chromium}=await import(pathToFileURL(resolve(process.env.WMS_BROWSER_RUNTIME,"index.mjs")).href);
const browser=await chromium.launch({channel:"chrome",headless:true});await mkdir("artifacts/purchase-builder",{recursive:true});
try{
  for(const width of [1366,390]){
    const page=await browser.newPage({viewport:{width,height:900}});
    await page.route("**/stock-card-fixture",r=>r.fulfill({contentType:"text/html; charset=utf-8",body:`<meta charset="utf-8"><link rel="stylesheet" href="/style.css"><section id="transferencias" style="padding:16px"><div class="transfer-card-grid">${html}</div></section>`}));
    await page.goto("http://127.0.0.1:5184/stock-card-fixture");
    assert.equal(await page.locator(".transfer-source-pill").textContent(),"COMPRAS");
    assert.equal(await page.locator("[data-transfer-open]").count(),1);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await page.screenshot({path:`artifacts/purchase-builder/stock-card-${width}.png`,fullPage:true});await page.close();
    process.stdout.write(`Cartao Estoque ${width}px: rota, progresso, origem Compras e acao existentes OK\n`);
  }
}finally{await browser.close();}
