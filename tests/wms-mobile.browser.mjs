import assert from "node:assert/strict";
import {createRequire} from "node:module";
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||"C:/Users/vdcg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true});
try{
  for(const width of [360,390,430,768,1366,1920]){
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on("pageerror",error=>errors.push(error.message));
    await page.goto("http://127.0.0.1:4213/tests/wms-mobile.html");await page.waitForFunction(()=>window.mobileFixture?.ready);
    const mobile=width<=760;
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    if(mobile){
      await page.getByRole("tab",{name:"Endereços",exact:true}).click();
      await page.getByRole("button",{name:"Editar",exact:true}).click();
      assert.ok(await page.evaluate(()=>window.mobileFixture.calls.some(call=>call.action?.edit==='binding-1')));
      await page.getByRole("tab",{name:"Estoque",exact:true}).click();
      assert.equal(await page.locator("#skuOperationalHub").isVisible(),true);
      if(width===390){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:"outputs/mobile-sku-390.png",fullPage:true});}
      await page.locator('[data-mobile-nav="replenishment"]').click();
      assert.equal(await page.locator("#replenishmentMetricPending").textContent(),"2");
      await page.locator('.mobile-compose>summary').click();
      await page.locator("#replenishmentSkuInput").fill("84210");await page.locator("#replenishmentRequestQtyInput").fill("12");await page.locator("#createReplenishmentButton").click();
      assert.ok(await page.evaluate(()=>window.mobileFixture.calls.some(call=>call.submit)));
      await page.locator('.mobile-compose>summary').click();
      await page.getByRole("searchbox",{name:"Pesquisar pedidos carregados"}).fill("Lily");
      assert.equal(await page.locator("#replenishmentList>.replenishment-card:visible").count(),1);
      await page.getByRole("searchbox",{name:"Pesquisar pedidos carregados"}).fill("");
      if(width===390){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:"outputs/mobile-replenishment-390.png",fullPage:true});}
      await page.locator('[data-mobile-nav="more"]').click();
      await page.locator('.mobile-more-menu>nav').getByRole("button",{name:"Transferencias",exact:true}).click();
      await page.locator("#transferPanelRows .mobile-list-card>summary").first().click();
      await page.getByRole("button",{name:"Visualizar",exact:true}).first().click();
      assert.ok(await page.evaluate(()=>window.mobileFixture.calls.some(call=>call.action?.transferView)));
      await page.locator("#transferPanelRows .mobile-list-card>summary").first().click();
      if(width===390){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:"outputs/mobile-transfers-390.png",fullPage:true});}
      await page.locator('.mobile-primary-action').click();
      assert.ok(await page.evaluate(()=>window.mobileFixture.calls.some(call=>call.tab==='newTransferSection')));
      await page.setViewportSize({width:1366,height:900});
      await page.waitForFunction(()=>!document.querySelector('#reposicao .mobile-compose'));
    }
    assert.equal(await page.locator("#replenishmentForm").count(),1);
    assert.equal(await page.locator("#skuSearchInput").count(),1);
    assert.equal(await page.locator(".mobile-bottom-nav").isVisible(),false);
    assert.equal(await page.locator(".content>.app-header").count(),1);
    assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('[id]')].map(node=>node.id).sort()),await page.evaluate(()=>window.mobileFixture.originalIds));
    assert.deepEqual(errors,[]);console.log(`PASS ${width}px: layout, original IDs, navigation, actions and desktop restoration`);await page.close();
  }
  for(const role of ["ATENDENTE","OPERADOR"]){
    const page=await browser.newPage({viewport:{width:390,height:900}});await page.goto('http://127.0.0.1:4213/tests/wms-mobile.html?role='+role);await page.waitForFunction(()=>window.mobileFixture?.ready);
    await page.locator('[data-mobile-nav="more"]').click();assert.equal(await page.locator('.mobile-more-menu>nav').getByRole('button',{name:'Usuarios',exact:true}).count(),0);await page.getByRole('button',{name:'Fechar menu',exact:true}).click();
    if(role==="ATENDENTE"){assert.equal(await page.getByRole('tab',{name:'Endereços',exact:true}).count(),0);await page.locator('[data-mobile-nav="replenishment"]').click();assert.equal(await page.locator('#replenishmentLeaderPanel').isVisible(),false);}
    await page.close();console.log('PASS permissions '+role);
  }
}finally{await browser.close();}
