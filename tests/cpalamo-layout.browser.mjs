import assert from "node:assert/strict";
import {createRequire} from "node:module";
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||"C:/Users/vdcg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||"C:/Program Files/Google/Chrome/Application/chrome.exe"});
try{
  for(const width of [360,390,430,768,1366,1920]){
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    await page.goto("http://127.0.0.1:4214/tests/cpalamo-layout.html");
    await page.waitForFunction(()=>window.layoutFixture?.ready);
    for(const [screen,section] of [["transferencias","newTransferSection"],["consultaSku"],["reposicao"],["baseEstoque"],["usuarios"],["estoques"],["configuracoes"]]){
      await page.evaluate(([id,section])=>window.layoutFixture.show(id,section),[screen,section]);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,`${screen} ${width}`);
      if(section){
        const preview=page.locator("#newTransferSection .table-wrap");
        await preview.evaluate(n=>n.scrollLeft=9999);
        assert.ok(await preview.evaluate(n=>n.scrollLeft)>0 || await preview.evaluate(n=>n.scrollWidth<=n.clientWidth));
        await preview.evaluate(n=>n.scrollLeft=0);
        await page.screenshot({path:`outputs/cpalamo-layout-${width}.png`,fullPage:true});
      }
    }
    assert.deepEqual(errors,[]);
    console.log(`PASS CP layout ${width}px`);
    await page.close();
  }
}finally{await browser.close();}
