import { createServer } from "vite";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
const require=createRequire(import.meta.url);
const {chromium}=require(process.argv[2]||"playwright");
let browser,server;
try {
  server=await createServer({server:{host:"127.0.0.1",port:4189,strictPort:true},resolve:{preserveSymlinks:false}});
  await server.listen();
  browser=await chromium.launch({headless:true,executablePath:process.argv[3]||undefined});
  const page=await browser.newPage();
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/expedition-verification",route=>route.fulfill({contentType:"text/html",body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body style="padding:16px;margin:0"><main id="expedition"><div id="expeditionContent"></div></main></body></html>'}));
  await page.goto("http://127.0.0.1:4189/expedition-verification");
  await page.evaluate(async()=>{
    const {createExpeditionWorkflow}=await import("/src/expedition-workflow.js");
    const row={id:"transfer-a",codigo_transferencia:"TR-0001",warehouse_code:"A",origem_codigo_loja:"A",destino_codigo_loja:"B",invoice_stage:"LIBERADA_PARA_ENVIO",invoice_number:"000123",invoice_released_at:new Date().toISOString(),expedition_stage:"",expedition_revision:0,total_caixas:6,dispatched_boxes:null,received_boxes:null,invoice_snapshot:[]};
    const actor={id:"actor",name:"Supervisor",role:"SUPERVISOR"};
    window.verify={row,actor,calls:[]};
    const client={from(table){
      const q={filters:[],singleRow:false,select(){return this;},eq(k,v){this.filters.push([k,v]);return this;},in(){return this;},order(){return this;},range(){return this;},single(){this.singleRow=true;return this;},maybeSingle(){this.singleRow=true;return this;},then(resolve){
        let data=table==="wms_transfers"?[row]:table==="wms_users"?[{...actor,default_warehouse_code:"A"}]:[];
        if(table==="wms_transfers")data=data.filter(r=>this.filters.every(([k,v])=>!(k in r)||r[k]===v));
        return Promise.resolve({data:this.singleRow?data[0]||null:data,error:null}).then(resolve);
      }};return q;
    },async rpc(name,p){
      window.verify.calls.push({name,p});
      if(name==="wms_transfer_executive_summary")return {data:{created:1,open:1,otd_percent:null,daily:[{day:"2026-10-14",transfers:1,skus:3,units:6,boxes:6}],statuses:[],top_origins:[],top_destinations:[]}};
      const stages={ASSIGN:"ATRIBUIDA",COLLECT:"COLETADA",TRANSIT:"EM_TRANSITO",DELIVER:"ENTREGA_COM_DIVERGENCIA",RESOLVE:"ENTREGUE"};
      row.expedition_stage=stages[p.p_action];row.expedition_revision++;
      if(p.p_action==="ASSIGN"){row.expedition_responsible_id="actor";row.expedition_responsible_name="Supervisor";row.delivery_deadline=new Date(Date.now()+86400000).toISOString();}
      if(p.p_action==="COLLECT"){row.dispatched_boxes=p.p_data.boxes;row.invoice_stage="DESPACHADA";}
      if(p.p_action==="DELIVER"){row.received_boxes=p.p_data.boxes;row.delivery_reason=p.p_data.reason;row.invoice_stage="RECEBIDA";row.delivered_at=new Date().toISOString();}
      if(p.p_action==="RESOLVE")row.invoice_stage="FINALIZADA";
      return {data:{...row},error:null};
    }};
    window.view=createExpeditionWorkflow({client:()=>client,user:()=>actor,warehouse:()=>"A",global:()=>false,warehouses:()=>[{code:"A",name:"Origem"},{code:"B",name:"Destino"}],changed(){},diagnostic(){},openTransfer(){}});
    await window.view.refresh();
  });
  await page.locator("[data-open]").click();
  await page.getByRole("button",{name:"Atribuir expedicao",exact:true}).click();
  await page.getByRole("button",{name:"Confirmar",exact:true}).click();
  await page.waitForFunction(()=>window.verify.row.expedition_stage==="ATRIBUIDA");
  await page.getByRole("button",{name:"Confirmar coleta",exact:true}).click();
  await page.getByRole("button",{name:"Confirmar",exact:true}).click();
  await page.waitForFunction(()=>window.verify.row.expedition_stage==="COLETADA");
  await page.getByRole("button",{name:"Registrar transito",exact:true}).click();
  await page.getByRole("button",{name:"Confirmar",exact:true}).click();
  await page.waitForFunction(()=>window.verify.row.expedition_stage==="EM_TRANSITO");
  await page.getByRole("button",{name:"Registrar entrega",exact:true}).click();
  await page.locator('[data-action-form] input[name="boxes"]').fill("5");
  await page.locator('[data-action-form] textarea').fill("Uma caixa nao recebida");
  await page.getByRole("button",{name:"Confirmar",exact:true}).click();
  await page.waitForFunction(()=>window.verify.row.expedition_stage==="ENTREGA_COM_DIVERGENCIA");
  await page.waitForFunction(()=>document.querySelector('[data-detail]').textContent.includes('Entrega com divergencia'));
  await page.locator("[data-detail]").getByText("Enviadas: 6 | Recebidas: 5 | Diferenca: -1").waitFor();
  assert.equal(await page.locator("[data-detail]").getByText("Enviadas: 6 | Recebidas: 5 | Diferenca: -1").count(),1);
  await page.getByRole("button",{name:"Resolver divergencia",exact:true}).click();
  await page.locator('[data-action-form] textarea').fill("Caixa localizada e recebimento confirmado");
  await page.getByRole("button",{name:"Confirmar",exact:true}).click();
  await page.waitForFunction(()=>window.verify.row.invoice_stage==="FINALIZADA");
  await page.waitForFunction(()=>!document.getElementById('expeditionContent').inert);
  const outputDir=process.argv[4]||"test-results/expedition";
  await mkdir(outputDir,{recursive:true});
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});
    await page.screenshot({path:join(outputDir,`expedition-${width}.png`),fullPage:true});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`Overflow at ${width}`);
  }
  assert.deepEqual(errors,[]);
  assert.equal((await page.evaluate(()=>window.verify.calls.filter(c=>c.name==="wms_expedition_action"))).length,5);
  console.log("Desktop/mobile expedition UI: assignment, collection, transit, 6/5 divergence and resolution verified; backend separately covered by database tests.");
} finally {await browser?.close();await server?.close();}
