import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||"C:/Users/vdcg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true});
try {
  for(const width of [360,390,768,853,1366]){
    const page=await browser.newPage({viewport:{width,height:900}});
    const errors=[];page.on("pageerror",error=>errors.push(error.message));
    await page.goto("http://127.0.0.1:4207/tests/compact-control.html");
    await page.waitForSelector(".ref-kpi");
    assert.equal(await page.locator(".ref-kpi").count(),5);
    await page.waitForFunction(()=>[...document.querySelectorAll('.ref-grid canvas')].every(canvas=>{
      if(!canvas.width||!canvas.height)return false;
      const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      let filled=0;for(let index=3;index<data.length;index+=16)if(data[index])filled++;
      return filled>50;
    }));
    assert.equal(await page.locator('.ref-timeline li').count(),4);
    assert.equal(await page.locator('.ref-kpi-heading').allTextContents().then(rows=>rows.join(',')),"Estoques,Tarefas,Reposições,Transferências,OTD");
    assert.equal(await page.locator(".compact-secondary").getAttribute("open"),null);
    assert.equal(await page.locator("[data-global-domains]").innerHTML(),"");
    assert.ok(await page.locator(".compact-timeline details").count()<=10);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    if(width<=700){
      assert.equal(await page.locator(".global-primary-metrics").evaluate(node=>window.getComputedStyle(node).gridTemplateColumns.split(" ").length),3);
      await page.getByRole("button",{name:"Filtrar operação",exact:true}).click();
      await page.locator('.compact-filter-drawer [data-filter="responsible"]').selectOption("worker");
      await page.getByRole("button",{name:"Fechar filtros",exact:true}).click();
      assert.equal(await page.locator(".compact-control>.global-filters").isVisible(),false);
      await page.getByRole("button",{name:"Mais",exact:true}).click();
      assert.equal(await page.locator(".compact-more").getByRole("button",{name:"Usuários",exact:true}).count(),0);
      await page.getByRole("button",{name:"Fechar menu",exact:true}).click();
    }
    await page.getByRole("button",{name:"Pesquisar estoque",exact:true}).click();
    await page.locator("[data-board-search]").fill("VDDRD");
    assert.equal(await page.locator("[data-board-table] [data-board-record]").count(),1);
    await page.locator("[data-board-table] [data-board-record]").click();
    assert.equal(await page.locator(".global-dialog").evaluate(node=>node.open),true);
    await page.keyboard.press("Escape");
    await page.locator('.ref-tasks').click();
    await page.waitForSelector("[data-global-record='0']");
    await page.getByRole("button",{name:"Atrasados",exact:true}).click();
    assert.equal(await page.locator('[data-filter="mode"]').inputValue(),"overdue");
    await page.getByRole("button",{name:"Início",exact:true}).click();
    assert.equal(await page.locator("[data-board-search]").inputValue(),"VDDRD");
    await page.waitForSelector("[data-global-domains] .global-band");
    await page.locator(".compact-secondary>summary").click();
    if(width>700&&width>1100){
      await page.getByRole("button",{name:"Mais",exact:true}).click();
      await page.locator('.compact-more').getByRole("button",{name:"Recolher ou expandir menu",exact:true}).click();
      assert.equal(await page.locator("html").evaluate(node=>node.classList.contains("compact-sidebar-collapsed")),true);
      await page.keyboard.press("Escape");
    }
    await page.waitForFunction(()=>[...document.querySelectorAll('.ref-grid canvas')].every(canvas=>{
      const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      let filled=0;for(let index=3;index<data.length;index+=4)if(data[index])filled++;
      return filled>500;
    }));
    await page.screenshot({path:`outputs/control-${width}.png`,fullPage:true});
    await page.getByRole("button",{name:"Mais",exact:true}).click();
    await page.locator('.compact-more').getByRole("button",{name:"Alternar tema claro ou escuro",exact:true}).click();
    assert.equal(await page.locator("html").evaluate(node=>node.classList.contains("compact-dark")),true);
    await page.keyboard.press("Escape");
    await page.screenshot({path:`outputs/control-dark-${width}.png`,fullPage:true});
    if(width===853){
      await page.locator('[data-ref-trend-period]').selectOption("15");
      await page.waitForFunction(()=>window.globalFixture.calls.some(call=>call.rpc==='wms_global_dashboard'&&call.args.p_section==='executive'&&new Date(call.args.p_filters.until)-new Date(call.args.p_filters.since)>14*86400000));
      await page.evaluate(()=>{window.globalFixture.failSection="tasks_summary";});
      await page.getByRole("button",{name:"Filtrar operação",exact:true}).click();
      await page.getByRole("button",{name:"Atualizar dados",exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('.ref-tasks strong').textContent==='—');
      await page.evaluate(()=>{window.globalFixture.failSection=null;window.globalFixture.zero=true;});
      await page.getByRole("button",{name:"Atualizar dados",exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('.ref-replenishment strong').textContent==='0');
      await page.getByRole("button",{name:"Fechar filtros",exact:true}).click();
      await page.waitForFunction(()=>{
        const canvas=document.querySelector('[data-ref-body="replenishment"] canvas'),data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
        for(let i=0;i<data.length;i+=4)if(data[i+3]&&data[i+1]>100&&data[i+1]>data[i]*1.3&&data[i+1]>data[i+2]*1.2)return false;
        return true;
      });
    }
    assert.deepEqual(errors,[]);
    console.log(`PASS ${width}px: layout, filters, permissions, drawer, tabs, theme`);
    await page.close();
  }
} finally {await browser.close();}
