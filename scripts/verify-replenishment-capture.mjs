import {readFile,mkdir} from "node:fs/promises";
import {runInNewContext} from "node:vm";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import assert from "node:assert/strict";
import {escapeHtml} from "../src/utils.js";
const source=await readFile("script.js","utf8"),css=await readFile("style.css","utf8");
const card=source.slice(source.indexOf("function replenishmentCardHtml(item)"),source.indexOf("function attendantReplenishmentCardHtml(item)"));
const label=source.slice(source.indexOf("function replenishmentCaptureBalanceLabel(item)"),source.indexOf("async function performReplenishmentLoad"));
const item={id:"fixture",codigoMaterial:"83768",nomeMaterial:"Produto de teste",createdAt:new Date().toISOString(),status:"SEM_ESTOQUE",storeQty:0,requestedQty:1,attendedQty:0,pendingQty:1};
const globals={item,IS_CP_ALAMO:true,authState:{currentUser:{id:"actor"}},replenishmentCaptureBalances:{warehouse:"22796",actor:"actor",values:{"83768":2},error:false},activeWarehouseCode:()=>"22796",escapeHtml,formatQty:String,
  isAdminOrSupervisor:()=>true,isPurchasesUser:()=>false,displayReplenishmentStatus:()=>"Sem estoque",replenishmentCaptureLocationLabel:()=>"R02-RK11-L01-C",humanizeDuration:()=>"1h",
  statusBadgeClass:()=>"warning",replenishmentPriorityBadgeHtml:()=>"",replenishmentCancellationRequestHtml:()=>"",replenishmentActionsHtml:()=>"",
  replenishmentMetricHtml:(name,value)=>`<span><small>${escapeHtml(name)}</small><strong>${escapeHtml(value)}</strong></span>`};
const html=runInNewContext(label+card+";replenishmentCardHtml(item)",globals);
const {chromium}=await import(pathToFileURL(resolve(process.env.WMS_BROWSER_RUNTIME,"index.mjs")).href);
const browser=await chromium.launch({channel:"chrome",headless:true});await mkdir("artifacts/purchase-builder",{recursive:true});
try{for(const width of [1366,390]){
  const page=await browser.newPage({viewport:{width,height:800}});
  await page.setContent(`<meta charset="utf-8"><style>${css}</style><section id="reposicao" style="padding:16px">${html}</section>`);
  assert.equal(await page.locator(".replenishment-card-metrics > span").count(),5);
  assert.equal(await page.locator(".replenishment-card-metrics > span").nth(1).innerText(),"CAPTACAO disponivel\n2");
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  await page.screenshot({path:`artifacts/purchase-builder/replenishment-capture-${width}.png`,fullPage:true});await page.close();
  process.stdout.write(`Saldo CAPTACAO visivel ${width}px: OK\n`);
}}finally{await browser.close();}
