import { pathToFileURL } from "node:url";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const runtime=process.env.WMS_BROWSER_RUNTIME;if(!runtime)throw new Error("Configure WMS_BROWSER_RUNTIME.");
const {chromium}=await import(pathToFileURL(resolve(runtime,"index.mjs")).href);
const browser=await chromium.launch({channel:"chrome",headless:true});
const output=resolve("artifacts/demo-mode");await mkdir(output,{recursive:true});
try {
  for(const width of [1366,390]) {
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[],writes=[];
    page.on("pageerror",error=>errors.push(error.stack));page.on("request",r=>{if(["POST","PATCH","PUT","DELETE"].includes(r.method()))writes.push(r.url());});
    await page.route("**/demo-fixture",route=>route.fulfill({contentType:"text/html",body:'<meta http-equiv="Content-Security-Policy" content="require-trusted-types-for \'script\'; trusted-types default dompurify"><link rel="stylesheet" href="/style.css"><p id="normalMetrics">INDICADORES REAIS INALTERADOS</p><section id="demoMode" style="padding:16px"><div id="demoModeContent"></div></section>'}));
    await page.goto("http://127.0.0.1:5184/demo-fixture");
    await page.evaluate(async()=>{
      const security=await import("/src/utils.js");security.installHtmlSecurity();
      const module=await import("/src/demo-mode.js");window.demoUser={role:"ADMINISTRADOR"};window.demoActive=true;window.readCount=0;
      window.demoController=module.mountDemoMode({root:document.getElementById("demoModeContent"),user:()=>window.demoUser,active:()=>window.demoActive,
        warehouse:()=>"22796",warehouses:()=>[{code:"22796",name:"Unidade autorizada de teste"}],
        readSku:async sku=>{window.readCount++;return{sku,name:"Produto consultado - fixture somente leitura",available:153,location:"R01-RK01-L02-F"};},exit:()=>{window.demoActive=false;}});
      window.demoController.activate();
    });
    await page.locator('[data-demo-tab="sku"]').click();await page.locator("#demoSkuForm button").click();
    await page.getByText("Produto consultado - fixture somente leitura").waitFor();assert.equal(await page.evaluate(()=>window.readCount),1);
    await page.locator('[data-demo-tab="create"]').click();await page.getByRole("button",{name:"Criar solicitacao DEMO",exact:true}).click();
    for(const label of ["Iniciar separacao","Concluir conferencia","Finalizar montagem","Disponibilizar para NF"])await page.getByRole("button",{name:label,exact:true}).click();
    assert.equal(await page.getByRole("button",{name:"Liberar para envio",exact:true}).isDisabled(),true);
    assert.equal(await page.locator('[data-demo-action="advance"]').isDisabled(),true);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await page.screenshot({path:resolve(output,`invoice-blocked-${width}.png`),fullPage:true});
    await page.getByRole("button",{name:"Simular PDF DEMO anexado",exact:true}).click();
    assert.equal(await page.getByRole("button",{name:"Liberar para envio",exact:true}).isDisabled(),false);
    for(const label of ["Liberar para envio","Marcar como despachada","Marcar como recebida","Concluir processo"])await page.getByRole("button",{name:label,exact:true}).click();
    await page.locator('[data-demo-tab="replenishment"]').click();
    for(const label of ["Iniciar separacao DEMO","Confirmar 2 unidades DEMO","Concluir reposicao DEMO"])await page.getByRole("button",{name:label,exact:true}).click();
    await page.locator('[data-demo-tab="target"]').click();assert.equal(await page.locator("progress").getAttribute("value"),"72");
    await page.locator('[data-demo-tab="dashboard"]').click();
    assert.equal(await page.locator("#normalMetrics").textContent(),"INDICADORES REAIS INALTERADOS");
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await page.screenshot({path:resolve(output,`dashboard-final-${width}.png`),fullPage:true});
    await page.getByRole("button",{name:"Resetar DEMO",exact:true}).click();
    await page.getByText("Aguardando separacao",{exact:true}).waitFor();
    await page.getByRole("button",{name:"Carregar cenario DEMO",exact:true}).click();
    await page.locator('[data-demo-tab="needs"]').click();
    await page.getByRole("button",{name:"Criar transferencia multi-SKU DEMO",exact:true}).click();
    assert.equal(await page.locator(".demo-main tbody tr").count(),2);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await page.screenshot({path:resolve(output,`multi-sku-${width}.png`),fullPage:true});
    await page.getByRole("button",{name:"Sair da DEMO",exact:true}).click();assert.equal(await page.locator("#demoModeContent").textContent(),"");
    assert.equal(await page.evaluate(()=>window.demoController.isDemoMode()),false);
    const denied=await page.evaluate(()=>{window.demoActive=true;window.demoUser={role:"OPERADOR"};try{window.demoController.activate();return false;}catch{return true;}});assert.equal(denied,true);
    assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
    console.log(`PASS DEMO ${width}: fluxo completo, PDF bloqueado, meta 72%, reset, saida e zero escritas de rede`);
    await page.close();
  }
}finally{await browser.close();}
