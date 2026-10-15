import { pathToFileURL } from "node:url";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const runtime = process.env.WMS_BROWSER_RUNTIME;
if (!runtime) throw new Error("Configure WMS_BROWSER_RUNTIME com a pasta do pacote playwright.");
const { chromium } = await import(pathToFileURL(resolve(runtime,"index.mjs")).href);
const browser = await chromium.launch({channel:"chrome",headless:true});
const output = resolve("artifacts/cp-workflow-views");
await mkdir(output,{recursive:true});
try {
  for (const width of [1366,390]) {
    const page = await browser.newPage({viewport:{width,height:900}});
    const errors=[];page.on("pageerror",error=>errors.push(error.stack));
    await page.route("**/workflow-view-fixture",route=>route.fulfill({contentType:"text/html",body:'<meta http-equiv="Content-Security-Policy" content="require-trusted-types-for \'script\'; trusted-types default dompurify"><link rel="stylesheet" href="/style.css"><main style="padding:16px;min-width:0"><div id="fiscalWorkflowContent"></div><p id="fiscalWorkflowStatus"></p><div id="reverseLogisticsContent"></div><p id="reverseLogisticsStatus"></p></main>'}));
    await page.goto("http://127.0.0.1:5184/workflow-view-fixture");
    await page.evaluate(async()=>{
      const security=await import("/src/utils.js");security.installHtmlSecurity();
      const fiscal=await import("/src/purchases-workflow.js");
      const reverse=await import("/src/reverse-logistics.js");
      const date=new Date().toISOString();
      const process={id:"example",warehouse_code:"22796",status:"PRONTA_PARA_NOTA",invoice_stage:"PRONTA_PARA_NOTA",updated_at:date,status_changed_at:date,codigo_transferencia:"TRF-001",destino_nome:"Loja destino",total_caixas:2,invoice_snapshot:[{sku:"00178",requested:3,separated:2,checked:2,difference:-1,observation:"Conferido"}]};
      const client={from(table){const rows=table==="wms_transfers"?[process]:table==="wms_reverse_logistics"?[{id:"reverse",warehouse_code:"22796",unit_origin_code:"22796",gdv_number:"000123",nfe_number:"000789",box_quantity:12,status:"ENVIADA",responsible_name:"Colaborador",created_at:date}]:[];
        let single=false;const query=new Proxy({}, {get(_target,key){if(key==="then")return (resolve)=>resolve({data:single?rows[0]:rows,error:null});return()=>{if(key==="single")single=true;return query;};}});return query;},
        async rpc(name){return{data:name==="wms_fiscal_summary"?{"Aguardando NF":1,"Correcoes":0,"Liberadas hoje":0}:[{unit_code:"22796",unit_name:"Loja exemplo",target_boxes:100,completed_boxes:12,pending:1,divergences:0}],error:null};}};
      const context={client:()=>client,user:()=>({id:"buyer",role:"COMPRAS",name:"Compras"}),warehouse:()=>"22796",global:()=>false,warehouses:()=>[{code:"22796",name:"Loja exemplo"}],changed:()=>{},diagnostic:()=>{},openTransfer:()=>{}};
      const view=fiscal.createPurchasesWorkflow(context);await view.refresh();await view.open({...process,domain:"TRANSFERENCIA",table:"wms_transfers"});
      await reverse.createReverseLogistics(context).refresh();
    });
    const columns=await page.locator("#fiscalRows tr:first-child td").evaluateAll(cells=>cells.map(c=>c.getBoundingClientRect().x));
    assert.equal(columns.length,7);assert.ok(columns.every((x,i)=>i===0 || x>columns[i-1]));
    assert.equal(await page.locator("#reverseCreateForm").count(),1);
    assert.equal(await page.locator("[data-fiscal-action=DISPATCH]").count(),0);
    assert.equal(await page.locator("#fiscalUploadForm").count(),1);
    assert.deepEqual(errors,[]);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),"A pagina nao pode expandir horizontalmente");
    await page.screenshot({path:resolve(output,`workflow-${width}.png`),fullPage:true});
    console.log(`PASS: tabelas alinhadas, Compras sem acoes fisicas, viewport ${width}`);
    await page.close();
  }
} finally {await browser.close();}
