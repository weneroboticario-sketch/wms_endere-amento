import {createServer} from "vite";
import {createRequire} from "node:module";
import {readFile, mkdir, writeFile} from "node:fs/promises";
import {join} from "node:path";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const {chromium} = require(process.argv[2] || "playwright");
const output = process.argv[4] || "test-results/visual";
const phase = process.argv[5] || "after";
const before = phase === "before";
const html = (await readFile("index.html", "utf8"))
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "")
  .replace("</head>", '<link rel="stylesheet" href="/src/global-dashboard.css"><link rel="stylesheet" href="/src/purchase-transfer-builder.css">'+(before?'':'<link rel="stylesheet" href="/src/cpalamo-theme.css"><link rel="stylesheet" href="/src/purchases-workflow.css">')+'</head>');
let server, browser;
try {
  server = await createServer({server: {host: "127.0.0.1", port: 4193, strictPort: true}, resolve: {preserveSymlinks: false}});
  await server.listen();
  browser = await chromium.launch({headless: true, executablePath: process.argv[3] || undefined});
  const page = await browser.newPage();
  await page.route("**/visual-verification", route => route.fulfill({contentType: "text/html", body: html}));
  await page.goto("http://127.0.0.1:4193/visual-verification");
  if(!before)await page.evaluate(async()=>{const {initializeCpAppearance}=await import('/src/cpalamo-appearance.js');initializeCpAppearance();});
  await page.evaluate(() => {
    document.body.className = "auth-unlocked role-administrador";
    document.querySelectorAll('.cpalamo-only').forEach(e => {e.hidden = false;});
    document.querySelectorAll('.brand h1, .mobile-topbar strong, .app-header-title strong').forEach(e => {e.textContent = "WMS Álamo";});
    for (const [id, value] of Object.entries({topUserName: "Responsável com nome completo para teste de legibilidade", topUserRole: "ADMINISTRADOR", topWarehouseCode: "22796", topTaskCount: "12", topSyncLabel: "Ao vivo", topConnectionLabel: "Online", sidebarUserName: "Supervisor de operação", sidebarUserRole: "SUPERVISOR", metricSkus: "20.893", metricLocations: "32.459", metricBindings: "12", metricUpdated: "14/10/2026, 11:08", metricTransfersOpen: "28", metricUsersActive: "10", metricTasksActive: "16", metricReplenishmentPending: "9"})) document.getElementById(id).textContent = value;
    const select = document.getElementById("activeWarehouseSelect");
    select.hidden = false; select.innerHTML = '<option>22796 - VDDRD</option><option>23696 - VDTLS_HUB</option>';
    const product = "Produto com descrição extensa para verificar leitura, quebra de linha e apresentação do saldo disponível";
    const card = `<article class="sku-location-card"><div class="sku-card-head"><div><strong class="operational-code">00123456789</strong><span class="operational-description">${product}</span></div><span class="latest-pill">Atualizado</span></div><div class="sku-location-code location-code">R04-RK24-L05-D-ENDERECO-LONGO</div><div class="sku-card-meta"><span>Saldo<strong class="operational-value numeric-value">1.234</strong></span><span>Disponível<strong>1.220</strong></span><span>Responsável<strong>Equipe de estoque</strong></span><span>Atualização<strong>14/10/2026 11:08</strong></span></div></article>`;
    document.getElementById("skuResultCards").innerHTML = card;
    document.getElementById("skuSearchInput").value = "00123456789";
    const transfer = `<article class="transfer-card transfer-card--transfer"><div class="transfer-card-head"><h3 class="transfer-code">TR-2026-0000123456</h3><span class="transfer-card-status status-badge">Aguardando disponibilização para NF</span></div><p class="transfer-route">22796 - VDDRD → 23696 - VDTLS_HUB</p><div class="transfer-card-meta"><span><b>Responsável atual</b>Supervisor com nome completo para teste</span><span><b>Tempo na etapa</b>2 horas e 30 minutos</span></div><div class="transfer-card-kpis"><span><b>SKUs</b>24</span><span><b>Unidades</b>1.234</span></div><div class="transfer-card-actions"><button class="primary-button">Abrir transferência</button><button class="secondary-button">Acompanhar</button></div></article>`;
    document.getElementById("transferPanelRows").innerHTML = '<div class="transfer-card-grid">'+transfer+transfer+'</div>';
    const cells = `<tr><td data-label="SKU"><strong class="operational-code">00123456789</strong><small>${product}</small></td><td data-label="Localização">R04-RK24-L05-D</td><td data-label="Quantidade"><strong>1.234</strong></td><td data-label="Status"><span class="status-badge">Aguardando separação</span></td><td data-label="Responsável">Supervisor com nome completo</td><td data-label="Ação"><button class="primary-button">Abrir</button></td></tr>`;
    const table = `<div class="table-wrapper"><table><thead><tr><th>SKU / Produto</th><th>Localização</th><th>Quantidade</th><th>Status</th><th>Responsável</th><th>Ação</th></tr></thead><tbody>${cells}${cells}</tbody></table></div>`;
    document.getElementById("fiscalWorkflowContent").innerHTML = '<section class="cp-workflow-band"><h3>Transferência TR-2026-0000123456</h3><p>NFe <strong class="operational-code">000123456789012345</strong></p><p class="status-badge">Aguardando NF</p>'+table+'</section>';
    document.getElementById("reverseLogisticsContent").innerHTML = table;
    document.getElementById("expeditionContent").innerHTML = table;
    document.getElementById("purchaseTransferContent").innerHTML = `<section class="purchase-builder"><h2>Necessidade das Lojas</h2><div class="pb-steps"><span class="current">1. Unidade</span><span>2. Produtos</span><span>3. Revisão</span></div><div class="pb-units"><label>Estoque de origem<select><option>22796 - VDDRD</option></select></label><label>Loja destino<select><option>23696 - VDTLS_HUB</option></select></label></div><div class="pb-layout"><div class="pb-grid">${table}</div><aside class="pb-cart"><h3>Transferência em montagem</h3><dl><dt>SKUs</dt><dd>24</dd><dt>A enviar</dt><dd>1.234</dd></dl><button class="primary-button">Revalidar e revisar</button></aside></div></section>`;
    document.getElementById("replenishmentLeaderSummary").innerHTML = '<div class="stock-summary-card"><span>Reposições pendentes</span><strong>9</strong></div>';
    document.getElementById("replenishmentList").innerHTML = transfer;
    document.getElementById("stockBatchRows").innerHTML = cells;
  });
  await page.evaluate(async () => {
    const {mountGlobalDashboard} = await import("/src/global-dashboard-view.js");
    const client = {
      from() {const q={select(){return this;},eq(){return this;},neq(){return this;},order(){return Promise.resolve({data:[{code:"22796",name:"22796 - VDDRD",active:true},{code:"23696",name:"23696 - VDTLS_HUB",active:true}],error:null});}};return q;},
      async rpc(_name,args){
        const data={rows:[],summary:[],trends:[],attention:[],totals:{}};
        if(args.p_section==='replenishment_summary')data.summary=[{warehouse_code:'22796',status:'PENDENTE',open:56},{warehouse_code:'22796',status:'SEM_ESTOQUE',open:2},{warehouse_code:'22796',status:'CONCLUIDO',open:0,finished_today:2}];
        if(args.p_section==='team')data.rows=[{warehouse_code:'22796',active:3,available:2,busy:1},{warehouse_code:'23696',active:2,available:1,busy:1}];
        if(args.p_section==='executive'){data.queue=[{warehouse_code:'22796',minutes_60_plus:58}];data.trends=Array.from({length:7},(_,i)=>({domain:'replenishment',day:'2026-10-'+String(8+i).padStart(2,'0'),created:10+i*3,finished:5+i}));}
        return {data,error:null};
      }
    };
    const view=mountGlobalDashboard({root:document.getElementById("globalDashboard"),client,getUser:()=>({id:"visual",username:"admin",role:"ADMINISTRADOR",active:true,defaultWarehouseCode:"DOURADOS"}),getWarehouse:()=>"DOURADOS",openWarehouse(){},onSync(){}});
    await view.refresh();
  });
  if(!before)await page.evaluate(async()=>{
    const {createPurchasesWorkflow}=await import('/src/purchases-workflow.js');
    const date=new Date().toISOString();
    const rows=[0,1,2].map(i=>({id:'fixture-'+i,warehouse_code:'22796',requires_invoice:true,request_origin:'COMPRAS',invoice_stage:'PRONTA_PARA_NOTA',status:'PRONTA_PARA_NOTA',updated_at:date,status_changed_at:date,packing_finished_at:date,codigo_transferencia:'TRF-2026-0012'+i,destino_nome:'23696 - VDTLS_HUB',total_caixas:i+2,invoice_snapshot:[{sku:'000123',requested:12,separated:10,checked:10,difference:-2}]}));
    const client={from(table){const data=table==='wms_transfers'?rows:[];let single=false;let id='';const query=new Proxy({}, {get(_target,key){if(key==='then')return resolve=>resolve({data:single?data.find(row=>row.id===id):data,error:null});return(...args)=>{if(key==='single')single=true;if(key==='eq'&&args[0]==='id')id=args[1];return query;};}});return query;},async rpc(){return{data:{'Aguardando NF':3,'Em preparacao':0,'NF anexadas hoje':0,'Liberadas hoje':0,'Valor faturado hoje':0},error:null};}};
    const context={client:()=>client,user:()=>({id:'buyer',role:'COMPRAS'}),warehouse:()=> '22796',global:()=>false,warehouses:()=>[{code:'22796',name:'VDDRD'}],diagnostic:()=>{},changed:()=>{}};
    await createPurchasesWorkflow(context).refresh();
  });
  await mkdir(output, {recursive: true});
  const results = [];
  const screens = ["dashboard", "globalDashboard", "consultaSku", "transferencias", "reposicao", "baseEstoque", "usuarios", "purchaseTransfer", "fiscalWorkflow", "reverseLogistics", "expedition", "bipagem", "consultaPrateleira", "etiquetas", "exportar", "estoques", "saudeSistema", "manutencao", "configuracoes"];
  const sizes = before ? [[1366,768],[390,844]] : [[1366,768],[1440,900],[1920,1080],[768,1024],[1024,768],[360,800],[390,844]];
  for (const [width,height] of sizes) {
    await page.setViewportSize({width,height});
    for (const screen of screens) {
      await page.evaluate(id => {
        document.querySelectorAll(".screen").forEach(e => {e.hidden = e.id !== id; e.classList.toggle("active", e.id === id);});
        document.querySelectorAll(".menu-item").forEach(e => e.classList.toggle("active", e.dataset.screen === id));
        if (id === "transferencias") document.querySelectorAll("#transferPanelSection").forEach(e => {e.hidden=false;});
      }, screen);
      const result = await page.evaluate(() => {
        const visible = e => e.getClientRects().length && window.getComputedStyle(e).visibility !== "hidden";
        const fonts = [...document.querySelectorAll('.screen.active .status-badge, .screen.active .transfer-card-status, .screen.active td, .screen.active th, .screen.active label, .screen.active button, .screen.active .sku-card-meta span')].filter(visible).map(e => parseFloat(window.getComputedStyle(e).fontSize));
        return {overflow: document.documentElement.scrollWidth > window.innerWidth + 1, minFont: fonts.length ? Math.min(...fonts) : null};
      });
      results.push({width, screen, ...result});
      if (!before) {
        assert.equal(result.overflow, false, `${screen}: page overflow at ${width}`);
        if (result.minFont !== null) assert.ok(result.minFont >= 13, `${screen}: font ${result.minFont} at ${width}`);
      }
      if ([1366,390].includes(width)) await page.screenshot({path: join(output, `refresh-${phase}-${screen}-${width}.png`), fullPage: screen !== "globalDashboard"});
    }
  }
  if (!before) {
    for(const width of [1366,390]) {
      await page.setViewportSize({width,height:844});
      for(const [section,title] of [["newTransferSection","Nova transferencia"],["myTransfersSection","Minhas tarefas"],["taskCenterSection","Gestao de tarefas"],["finalizedTransfersSection","Finalizadas"],["establishmentsSection","Estabelecimentos"],["transferWorkSection","Separacao"],["transferWorkSection","Conferencia"],["transferWorkSection","Montagem de caixas"]]) {
        await page.evaluate(({section,title})=>{
          document.querySelectorAll('.screen').forEach(e=>{e.hidden=e.id!=='transferencias';e.classList.toggle('active',e.id==='transferencias');});
          document.querySelectorAll('.transfer-section').forEach(e=>e.hidden=e.id!==section);
          if(section==='transferWorkSection') {
            document.getElementById('transferWorkTitle').textContent=title;
            document.getElementById('transferCurrentItem').innerHTML='<h3>000123</h3><p>Produto de teste de leitura operacional</p><div class="current-location-line"><span>Endereco</span><strong>R01-RK01-L02-F</strong></div><div class="current-qty-highlight"><span>Conferida</span><strong>24</strong></div>';
          }
        },{section,title});
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`${title}: page overflow at ${width}`);
        if(section==='transferWorkSection')assert.ok(await page.locator('.current-qty-highlight strong').evaluate(e=>parseFloat(window.getComputedStyle(e).fontSize)>=28));
        await page.screenshot({path:join(output,`subview-${title.replaceAll(' ','-')}-${width}.png`),fullPage:true});
      }
    }
    await page.setViewportSize({width:1366,height:768});
    for (const zoom of [1,1.1,1.25]) {
      await page.evaluate(z => {document.documentElement.style.zoom = String(z);},zoom);
      for (const screen of ["dashboard","consultaSku","transferencias","purchaseTransfer","fiscalWorkflow"]) {
        await page.evaluate(id => {document.querySelectorAll(".screen").forEach(e=>{e.hidden=e.id!==id;e.classList.toggle("active",e.id===id);});},screen);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${screen}: zoom ${zoom}`);
      }
    }
    await page.evaluate(()=>{document.documentElement.style.zoom="";document.body.className="auth-locked";});
    for(const width of [1366,360]) {await page.setViewportSize({width,height:800});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));}
  }
  await writeFile(join(output, `refresh-${phase}-layout.json`), JSON.stringify(results,null,2));
  console.log(`${phase}: ${results.length} screen/viewport checks; visual fixtures only, no production data or writes.`);
} finally {await browser?.close(); await server?.close();}
