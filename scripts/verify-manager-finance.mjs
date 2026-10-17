import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {createServer} from "vite";
const {chromium}=await import(pathToFileURL(process.env.WMS_PLAYWRIGHT_MODULE).href);
const output=resolve("../../outputs/manager-finance");await mkdir(output,{recursive:true});
const server=await createServer({server:{host:"127.0.0.1",port:0},plugins:[{name:"role-fixtures",configureServer(s){s.middlewares.use("/__roles",(_req,res)=>{
 res.setHeader("Content-Type","text/html");res.end('<!doctype html><html class="cp-alamo"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/src/cpalamo-theme.css"></head><body style="padding:20px"><section class="screen active" id="managerCentral"><h2>Central Gerencial</h2><p>Controle operacional, resultados e pendências das unidades.</p><div id="managerCentralContent"></div></section><section class="screen" id="lossesDre" hidden><h2>Perdas e DRE</h2><div id="lossesDreContent"></div></section></body></html>');
 });}}]});await server.listen();
const browser=await chromium.launch({headless:true,executablePath:process.env.WMS_CHROME_PATH});
const page=await browser.newPage();const errors=[];page.on("pageerror",e=>errors.push(e.message));
try{
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__roles`);
 await page.evaluate(async()=>{
  const fixture={id:"loss-one",loss_code:"PER-2026-000001",competent_warehouse_code:"22796",competence:"2026-09",status:"APROVADA",invoice_number:"00015",invoice_value:1000,invoice_issue_date:"2026-09-28",loss_type_id:"damage",loss_type_name_snapshot:"Quebras e avarias",dre_label_snapshot:"PERDAS DE ESTOQUE",dre_code_snapshot:"STOCK",created_by_id:"operator",requester_name:"Operador",responsible_name:"Responsável",approved_by_id:"manager",approved_by_name:"Gerente",version:3,created_at:"2026-10-16T12:00:00Z"};
  const data={wms_loss_types:[{id:"damage",name:"Quebras e avarias",dre_code:"STOCK",dre_label:"PERDAS DE ESTOQUE",is_active:true}],wms_loss_rates:[{id:"rate",competence_from:"2026-01",competence_to:"2026-12",rate_percent:.48}],wms_loss_cost_centers:[{code:"22796",name:"VDDRD",is_active:true}],wms_losses:[fixture],wms_loss_events:[],wms_loss_items:[],wms_loss_allocations:[],wms_loss_files:[],wms_loss_periods:[],wms_loss_export_batches:[]};
  class Query {constructor(table){this.table=table;this.filters=[];}select(){return this;}order(){return this;}range(){return this;}limit(){return this;}single(){this.one=true;return this;}eq(k,v){this.filters.push(r=>r[k]===v);return this;}in(k,v){this.filters.push(r=>v.includes(r[k]));return this;}then(resolve){let rows=(data[this.table]||[]).filter(r=>this.filters.every(f=>f(r)));return Promise.resolve({data:this.one?rows[0]:rows,error:null}).then(resolve);}}
  const client={from:t=>new Query(t),rpc:async(name,args)=>{
   if(name==="wms_manager_overview")return {data:{authorized:true,kpis:{transfers:4,late:1,replenishment:7,sla:1,invoices:2,divergences:1,losses:1,dispatch:2},total:1,queue:[{id:"loss-one",code:"PER-2026-000001",module:"losses",warehouse:"22796",owner:"Responsável",status:"PENDENTE",since:"2026-10-16T12:00:00Z",priority:1}]}};
   if(name==="wms_profile_records")return {data:{total:1,rows:[{id:"transfer-one",codigo_transferencia:"TRF-2026-00125",destino_nome:"VDDRD",warehouse_code:"22796",status:"PRONTA_PARA_NOTA",responsavel_nome:"Responsável"}]}};
   if(name==="wms_loss_summary")return {data:{gross:1000,credits:0,records:1,approved:1,pending:0,financial_pending:1,rate_value:4.8,corrections:0,cancelled:0,groups:[{dimension:"type",label:"Quebras e avarias",value:1000,records:1},{dimension:"warehouse",label:"22796",value:1000,records:1},{dimension:"dre",label:"PERDAS DE ESTOQUE",value:1000,records:1}],trend:[{competence:"2026-09",net:1000}]}};
   if(name==="wms_financial_pending")return {data:{total:1,rows:[{...fixture,issues:["Documento obrigatorio ausente"],retroactive:true}]}};
   if(name==="wms_loss_export_preview")return {data:{records:1,warehouses:1,invoices:1,invoice_value:1000,rate_value:4.8,pending:0,corrections:0,signature:"fixture"}};
   if(name==="wms_loss_action")return {data:{...fixture,...args.p_payload}};
   throw new Error("Unexpected RPC: "+name);
  }};
  const {createManagementWorkspace}=await import("/src/management-workspace.js"),{createLossesDre}=await import("/src/losses-dre.js");
  window.role="GERENTE";window.capabilities=["manager.dashboard.read","manager.approvals.read","manager.loss.approve","manager.loss.request_correction","transfer.read","invoice.read","dispatch.read","reverse.read","report.export"];
  const context={client:()=>client,user:()=>({id:window.role==="GERENTE"?"manager":"finance",role:window.role}),capabilities:()=>window.capabilities,warehouses:()=>[{code:"22796",name:"VDDRD"}],openLoss:async()=>{}};
  window.manager=createManagementWorkspace(context,"managerCentral");await window.manager.refresh();window.finance=createLossesDre(context);
 });
 for(const [width,height] of [[1366,768],[1440,900],[1920,1080],[390,844]]){
  await page.setViewportSize({width,height});await page.screenshot({path:resolve(output,`manager-${width}.png`),fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),"manager overflow "+width);
 }
 await page.evaluate(async()=>{window.role="FINANCEIRO";window.capabilities=["finance.dashboard.read","finance.loss.read","finance.loss.validate","finance.loss.request_correction","finance.export","finance.dre.read"];document.querySelector('#managerCentral').hidden=true;document.querySelector('#lossesDre').hidden=false;document.querySelector('#lossesDre').classList.add('active');await window.finance.refresh();});
 assert.equal(await page.locator('[data-tab="new"]').isVisible(),false);assert.equal(await page.locator('[data-tab="config"]').isVisible(),false);
 for(const [width,height] of [[1366,768],[1440,900],[1920,1080],[390,844]]){
  await page.setViewportSize({width,height});await page.screenshot({path:resolve(output,`finance-${width}.png`),fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),"finance overflow "+width);
 }
 await page.locator('[data-tab="financial"]').click();await page.waitForFunction(()=>!document.querySelector('#lossesDreContent').hasAttribute('aria-busy'));
 assert.match(await page.locator('[data-panel]').textContent(),/Documento obrigatorio ausente/);
 await page.locator('[data-tab="exports"]').click();await page.waitForFunction(()=>!document.querySelector('#lossesDreContent').hasAttribute('aria-busy'));
 assert.equal(await page.locator('[data-period="CLOSE_PERIOD"]').isVisible(),false);assert.equal(await page.locator('[data-period="REOPEN_PERIOD"]').isVisible(),false);
 assert.equal(await page.locator('[data-error]').last().textContent(),"");assert.deepEqual(errors,[]);
 console.log("Manager/Finance: 8 responsive screenshots; granular controls and pending queue verified. "+output);
}finally{await browser.close();await server.close();}
