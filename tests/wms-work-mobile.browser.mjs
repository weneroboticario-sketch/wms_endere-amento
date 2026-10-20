import assert from "node:assert/strict";
import {createRequire} from "node:module";
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||"C:/Users/vdcg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||"C:/Program Files/Google/Chrome/Application/chrome.exe"});
try{
  for(const width of [360,390,430,768,1366]){
    const page=await browser.newPage({viewport:{width,height:900}});
    await page.goto("http://127.0.0.1:4213/tests/wms-mobile.html");
    await page.waitForFunction(()=>window.mobileFixture?.ready);
    await page.evaluate(()=>{
      document.querySelector('.sidebar .transfer-full-menu').click();
      document.querySelectorAll("#transferencias>.transfer-section").forEach(node=>node.hidden=node.id!=="transferWorkSection");
      const $=id=>document.getElementById(id);
      $("transferWorkTitle").textContent="Separação - VDCG para ECO2 (144639)";
      $("transferWorkSummary").innerHTML='<div><span>Rota</span><strong>VDCG → ECO2 (144639)</strong></div><div><span>Progresso</span><strong>0 de 1 itens separados</strong></div>';
      $("transferCurrentItem").innerHTML='<span class="current-item-kicker">PRÓXIMO ITEM</span><div class="current-item-compact-grid"><div class="current-item-main-info"><div class="current-item-head"><strong>SKU 85452</strong><span>Pendente</span></div><p>Produto com descrição longa para conferir a quebra de texto na separação</p><div class="current-location-line"><span>Endereço</span><strong>R03-RK05-L02-G</strong></div></div><div class="current-qty-highlight"><span>Quantidade solicitada</span><strong>5 UN</strong></div></div><div class="transfer-qty-row current-item-meta"><span>Saldo captação <b>6</b></span><span>Retirar da captação <b>5</b></span><span>Saldo loja <b>3</b></span><span>Retirar da loja <b>0</b></span></div>';
      $("separationPendingHint").textContent="Finalize todos os itens para concluir a separação.";
      $("transferWorkStatus").textContent="Visualização aberta. A transferência não foi iniciada.";
      $("adminTransferProgressPanel").hidden=false;
      $("adminTransferProgressSummary").innerHTML='<div><span>Produtos</span><strong>1</strong></div><div><span>Produtos faltando</span><strong>1</strong></div><div><span>Qtd lacrada</span><strong>0</strong></div><div><span>Diferença</span><strong>-5</strong></div>';
      $("adminTransferProgressRows").innerHTML='<tr><td>85452</td><td>Descrição longa do produto</td><td>R03-RK05-L02-G</td><td>5</td><td>0</td><td>5</td><td>-5</td><td>Pendente</td></tr>';
      window.workClicks=0;
      $("confirmCurrentCollectButton").onclick=()=>window.workClicks++;
    });
    if(width<=760){
      const bad=await page.locator("#transferWorkSection").evaluate(root=>{
        const width=document.documentElement.clientWidth;
        return [...root.querySelectorAll("button,.current-item-card,.panel-header,.transfer-work-summary,.transfer-work-grid")]
          .filter(node=>node.getClientRects().length)
          .filter(node=>{const r=node.getBoundingClientRect();return r.left<0||r.right>width+1||node.scrollWidth>node.clientWidth+1;})
          .map(node=>node.id||node.className);
      });
      assert.deepEqual(bad,[]);
      await page.locator("#confirmCurrentCollectButton").click();
      assert.equal(await page.evaluate(()=>window.workClicks),1);
      assert.equal(await page.locator("#transferCurrentItem").evaluate(n=>n.scrollWidth<=n.clientWidth),true);
      await page.locator("#adminTransferProgressPanel .table-wrap").evaluate(n=>n.scrollLeft=200);
      assert.ok(await page.locator("#adminTransferProgressPanel .table-wrap").evaluate(n=>n.scrollLeft)>0);
      await page.evaluate(()=>window.scrollTo(0,0));
      await page.screenshot({path:`outputs/work-mobile-${width}.png`,fullPage:true});
    }
    console.log(`PASS work layout ${width}px`);
    await page.close();
  }
}finally{await browser.close();}
