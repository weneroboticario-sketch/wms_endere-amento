import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {mkdir} from "node:fs/promises";
import assert from "node:assert/strict";
const {chromium}=await import(pathToFileURL(resolve(process.env.WMS_BROWSER_RUNTIME,"index.mjs")).href);
const browser=await chromium.launch({channel:"chrome",headless:true});
await mkdir("artifacts/purchase-builder",{recursive:true});
try{
  for(const width of [1366,390]){
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    await page.route("**/builder-fixture",r=>r.fulfill({contentType:"text/html",body:'<link rel="stylesheet" href="/style.css"><main style="padding:16px"><section id="purchaseTransferContent"></section></main>'}));
    await page.goto("http://127.0.0.1:5184/builder-fixture");
    await page.evaluate(async()=>{
      const {installHtmlSecurity}=await import("/src/utils.js");installHtmlSecurity();
      const {createPurchaseTransferBuilder}=await import("/src/purchase-transfer-builder.js");
      window.calls=[];window.balance=30;window.currentUser={id:"buyer",role:"COMPRAS"};
      const query={select(){return this;},eq(){return this;},in(){return this;},order(){return Promise.resolve({data:[{id:"stock",name:"Operador",role:"OPERADOR"}]});}};
      const client={supabaseUrl:"https://fixture.supabase.co",from:()=>query,rpc:async(name,p)=>{
        window.calls.push({name,p});
        if(name==="wms_purchase_attention")return{data:[]};
        if(name==="wms_purchase_store_needs")return{data:{total:3,summary:{zero:1,low:2,needs:3},rows:[
          {sku:"01302",description:"Produto com saldo",store_available:0,need:4,available:10,location:"R01",open_transfers:[]},
          {sku:"84390",description:"Produto parcial",store_available:1,need:50,available:window.balance,location:"R02",open_transfers:[]},
          {sku:"94137",description:"Produto sem saldo",store_available:2,need:2,available:0,location:"R03",open_transfers:[]}]}};
        if(name==="wms_purchase_capture")return{data:p.p_skus.map(sku=>({sku,available:sku==="01302"?10:sku==="84390"?window.balance:0,description:"Produto",location:"R01"}))};
        if(name==="wms_purchase_open_duplicates")return{data:[]};
        if(name==="wms_create_purchase_transfer")return{data:{id:"created",code:"CMP-FIXTURE"}};
        throw new Error(name);
      }};
      window.builder=createPurchaseTransferBuilder({client:()=>client,user:()=>window.currentUser,warehouse:()=>"A",warehouses:()=>[{id:"a",code:"A",name:"Origem"},{id:"b",code:"B",name:"Destino"}],diagnostic:()=>{},changed:()=>{},openTransfer:()=>{}});
      await window.builder.refresh();
    });
    await page.getByRole("button",{name:"Nova transferencia",exact:true}).click();
    await page.getByRole("button",{name:"Selecionar pagina",exact:true}).click();
    await page.getByRole("button",{name:"Adicionar selecionados",exact:true}).click();
    await page.locator("#pbResponsible").selectOption("stock");
    assert.equal(await page.locator('[data-pb-quantity="01302"]').inputValue(),"4");
    assert.equal(await page.locator('[data-pb-quantity="84390"]').inputValue(),"30");
    assert.equal(await page.locator('[data-pb-quantity="94137"]').inputValue(),"0");
    await page.evaluate(()=>window.balance=20);
    await page.getByRole("button",{name:"Revalidar e revisar",exact:true}).click();
    await page.getByText(/Saldo insuficiente ou desconhecido/).waitFor();
    await page.locator('[data-pb-quantity="84390"]').fill("20");
    await page.locator('[data-pb-quantity="84390"]').dispatchEvent("change");
    await page.getByRole("button",{name:"Revalidar e revisar",exact:true}).click();
    await page.getByRole("button",{name:"Criar transferencia",exact:true}).waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    if(width===390)assert.ok(await page.evaluate(()=>[...document.querySelectorAll('.pb-grid td')].every(c=>c.getBoundingClientRect().right<=window.innerWidth)));
    await page.screenshot({path:`artifacts/purchase-builder/review-${width}.png`,fullPage:true});
    await page.getByRole("button",{name:"Criar transferencia",exact:true}).click();
    await page.getByText("Transferencia criada com sucesso",{exact:true}).waitFor();
    const calls=await page.evaluate(()=>window.calls.filter(c=>c.name==="wms_create_purchase_transfer"));
    assert.equal(calls.length,1);assert.equal(calls[0].p.p_items.length,2);assert.equal(calls[0].p.p_items[0].sku,"01302");
    assert.equal(calls[0].p.p_items[1].requested_quantity,20);assert.deepEqual(errors,[]);
    await page.close();
    process.stdout.write(`Builder ${width}px: revalidacao, multi-SKU, zero e criacao unica OK\n`);
  }
}finally{await browser.close();}
