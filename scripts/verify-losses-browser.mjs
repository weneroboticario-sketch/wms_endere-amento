// Local browser verification against the real SQL commands in an isolated PGlite database.
import assert from "node:assert/strict";
import {Buffer} from "node:buffer";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {createServer} from "vite";
import {lossDatabase} from "../tests/losses-dre-db.test.js";

const {chromium}=await import(pathToFileURL(process.env.WMS_PLAYWRIGHT_MODULE).href);
const output=resolve("../../outputs/losses-browser");
await mkdir(output,{recursive:true});
const policy=JSON.parse(await readFile("vercel.json","utf8")).headers.flatMap(rule=>rule.headers).find(header=>header.key==="Content-Security-Policy").value;
const excelLibrary=await readFile(resolve("../../outputs/xlsx-0.18.5-validation.js"),"utf8");
const db=await lossDatabase();
await db.exec(`reset role;
 create or replace function private.current_wms_profile_id() returns text language sql as $$select coalesce(nullif(current_setting('test.actor',true),''),'actor')$$;
 insert into wms_users(id,name,role) values('approver','Approver','ADMINISTRADOR');
 set role authenticated;select set_config('test.scope','A,B,C',false)`);
const server=await createServer({resolve:{preserveSymlinks:false},server:{host:"127.0.0.1",port:0},plugins:[{
 name:"local-loss-verification",configureServer(s){
 s.middlewares.use("/__losses-xlsx.js",(_req,res)=>{res.setHeader("Content-Type","text/javascript");res.end(excelLibrary);});
 s.middlewares.use("/__losses-test",(_req,res)=>{
  res.setHeader("Content-Security-Policy",policy);
  res.setHeader("Content-Type","text/html");res.end('<!doctype html><html class="cp-alamo"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/src/cpalamo-theme.css"><link rel="stylesheet" href="/src/purchases-workflow.css"><script src="/__losses-xlsx.js"></script></head><body style="padding:20px"><section id="lossesDre" class="screen active"><h2>Perdas e DRE</h2><div id="lossesDreContent"></div></section></body></html>');
 });}
}]});
await server.listen();
const browser=await chromium.launch({headless:true,executablePath:process.env.WMS_CHROME_PATH});
const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
const errors=[];page.on("pageerror",error=>errors.push(error.message));page.on("dialog",dialog=>dialog.accept());
const ident=value=>{assert.match(value,/^[a-z_][a-z_0-9]*$/i);return '"'+value+'"';};
await page.exposeFunction("validationRequest",async request=>{
 try {
  if(request.kind==="rpc"){
   const params={wms_loss_action:["p_action","p_id","p_payload","p_action_id","p_version"],wms_loss_summary:["p_filters"],wms_loss_export_preview:["p_filters"]}[request.name];
   assert.ok(params,"RPC is in the validation allowlist");
   const result=await db.query(`select ${ident(request.name)}(${params.map((_,i)=>"$"+(i+1)).join(",")}) result`,params.map(key=>typeof request.args[key]==="object"&&request.args[key]!==null?JSON.stringify(request.args[key]):request.args[key]));
   return {data:result.rows[0].result,error:null};
  }
  if(request.kind==="upload"){
   await db.query("insert into storage.objects(bucket_id,name,metadata) values('wms-loss-files',$1,$2)",[request.path,JSON.stringify({size:request.size,mimetype:request.mime})]);
   return {data:{path:request.path},error:null};
  }
  assert.match(request.table,/^wms_(loss(?:es|_[a-z_]+)|users)$/);
  const values=[],conditions=[],orders=[];
  const param=value=>{values.push(value);return "$"+values.length;};
  let start=0,limit=200,single=false;
  for(const [op,...args] of request.ops){
   if(op==="eq"||op==="neq")conditions.push(`${ident(args[0])}${op==="eq"?"=":"<>"}${param(args[1])}`);
   else if(op==="in")conditions.push(`${ident(args[0])}=any(${param(args[1])})`);
   else if(op==="ilike")conditions.push(`${ident(args[0])} ilike ${param(args[1])}`);
   else if(op==="or")conditions.push("("+args[0].split(",").map(term=>{const [column,operation,...parts]=term.split(".");assert.equal(operation,"ilike");return `${ident(column)} ilike ${param(parts.join("."))}`;}).join(" or ")+")");
   else if(op==="order")orders.push(ident(args[0])+(args[1]?.ascending===false?" desc":" asc"));
   else if(op==="range"){start=args[0];limit=args[1]-args[0]+1;}
   else if(op==="limit")limit=args[0];
   else if(op==="single")single=true;
  }
  const columns=request.columns==="*"?"*":request.columns.split(",").map(ident).join(",");
  const result=await db.query(`select ${columns} from ${ident(request.table)} ${conditions.length?"where "+conditions.join(" and "):""} ${orders.length?"order by "+orders.join(","):""} limit ${param(limit)} offset ${param(start)}`,values);
  const rows=result.rows.map(row=>({...row,...(row.invoice_issue_date instanceof Date?{invoice_issue_date:row.invoice_issue_date.toISOString().slice(0,10)}:{})}));
  return {data:single?rows[0]:rows,error:null};
 } catch(error){return {data:null,error:{message:error.message}};}
});
try {
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__losses-test`);
 const invalidXml=await page.evaluate(async()=>{const {parseInvoiceXml}=await import("/src/losses-domain.js");try{parseInvoiceXml("<NFe><broken></NFe>");return false;}catch{return true;}});
 assert.equal(invalidXml,true,"malformed XML is rejected by the browser parser");
 await page.evaluate(async()=>{
  const {installHtmlSecurity}=await import("/src/utils.js");installHtmlSecurity();
  class Query {
   constructor(table){this.table=table;this.columns="*";this.ops=[];}
   select(columns){this.columns=columns;return this;}
   then(resolve,reject){return window.validationRequest({kind:"query",table:this.table,columns:this.columns,ops:this.ops}).then(resolve,reject);}
  }
  for(const op of ["eq","neq","in","ilike","or","order","range","limit","single"])Query.prototype[op]=function(...args){this.ops.push([op,...args]);return this;};
  const client={from:table=>new Query(table),rpc:(name,args)=>window.validationRequest({kind:"rpc",name,args}),storage:{from:()=>({upload:(path,file,options)=>window.validationRequest({kind:"upload",path,size:file.size,mime:options.contentType})})}};
  window.validationUser={id:"actor",name:"Actor",role:"ADMINISTRADOR"};
  const {createLossesDre}=await import("/src/losses-dre.js");
  window.lossView=createLossesDre({client:()=>client,user:()=>window.validationUser,warehouse:()=>"A",warehouses:()=>[{code:"A",name:"Alpha"},{code:"B",name:"Beta"},{code:"C",name:"Other"}]});
  await window.lossView.refresh();
 });
 const idle=()=>page.waitForFunction(()=>!document.querySelector('#lossesDreContent').hasAttribute('aria-busy'));
 const click=async selector=>{await page.locator(selector).click();await idle();assert.equal(await page.locator("[data-error]").textContent(),"");};
 await click('[data-tab="new"]');
 const xml='<?xml version="1.0"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe'+"1".repeat(44)+'"><ide><nNF>000123</nNF><dhEmi>2026-09-28T10:00:00-04:00</dhEmi></ide><emit><CNPJ>12345678000199</CNPJ><xNome>Fornecedor teste</xNome></emit><total><ICMSTot><vNF>15000.00</vNF></ICMSTot></total></infNFe></NFe></nfeProc>';
 await page.locator("[data-xml]").setInputFiles({name:"nota.xml",mimeType:"application/xml",buffer:Buffer.from(xml)});await idle();
 assert.equal(await page.locator("[data-error]").textContent(),"");
 assert.equal(await page.locator('[name="invoice_number"]').inputValue(),"000123");
 assert.equal(await page.locator('[name="invoice_key"]').inputValue(),"1".repeat(44));
 assert.equal(await page.locator('[name="invoice_issue_date"]').inputValue(),"2026-09-28");
 assert.equal(await page.locator('[name="invoice_value"]').inputValue(),"15000,00");
 assert.equal(await page.locator('[name="issuer_cnpj"]').inputValue(),"12345678000199");
 assert.equal(await page.locator('[name="issuer_name"]').inputValue(),"Fornecedor teste");
 assert.equal(await page.locator('[name="competence"]').inputValue(),"2026-09");
 await page.locator('[name="loss_type_id"]').selectOption("damage");
 assert.equal(await page.locator('[name="dre"]').inputValue(),"PERDAS DE ESTOQUE");
 await page.locator('[name="loss_type_id"]').selectOption("donations");
 assert.equal(await page.locator('[name="dre"]').inputValue(),"OUTRAS ENTIDADES");
 await page.locator('[name="loss_type_id"]').selectOption("damage");
 await page.locator('[name="reason"]').fill("Mercadorias avariadas durante movimentacao");
 await click("[data-add-allocation]");await click("[data-add-allocation]");
 for(const [index,center,percent] of [[0,"A","60"],[1,"B","40"]]){
  const row=page.locator("[data-allocation-row]").nth(index);await row.locator("select").selectOption(center);await row.locator("input").fill(percent);
 }
 await click("[data-review-button]");assert.equal(await page.locator("[data-submit]").isVisible(),true);
 await page.locator('[name="reason"]').fill("Mercadorias avariadas durante movimentacao revisada");
 assert.equal(await page.locator("[data-submit]").isVisible(),false);
 await click("[data-review-button]");
 await page.screenshot({path:resolve(output,"desktop-form.png"),fullPage:true});
 await click("[data-submit]");
 let loss=(await db.query("select * from wms_losses")).rows[0];assert.equal(loss.status,"PENDENTE");
 assert.equal((await db.query("select count(*)::int n from wms_loss_files")).rows[0].n,1);
 await db.exec("select set_config('test.actor','approver',false)");
 await page.evaluate(()=>{window.validationUser={id:"approver",name:"Approver",role:"ADMINISTRADOR"};});
 await page.locator("[data-month]").fill("2026-09");await click("[data-refresh]");
 await click("[data-open]");await click('[data-action="APPROVE"]');
 loss=(await db.query("select * from wms_losses")).rows[0];assert.equal(loss.status,"APROVADA");assert.equal(Number(loss.rate_value_snapshot),72);
 await click('[data-tab="exports"]');await click("[data-preview]");
 const downloaded=page.waitForEvent("download");await click("[data-confirm-export]");
 const download=await downloaded;const exported=resolve(output,download.suggestedFilename());await download.saveAs(exported);
 const sheets=await page.evaluate(async buffer=>{const workbook=window.XLSX.read(new Uint8Array(buffer),{type:"array"});return {names:workbook.SheetNames,summary:window.XLSX.utils.sheet_to_json(workbook.Sheets.RESUMO_DRE),detail:window.XLSX.utils.sheet_to_json(workbook.Sheets.DETALHAMENTO)};},[...await readFile(exported)]);
 assert.deepEqual(sheets.names,["RESUMO_DRE","DETALHAMENTO"]);assert.equal(sheets.detail.length,2);assert.equal(sheets.summary[0]["Valor Calculado"],72);
 await click('[data-tab="panel"]');
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:950});await page.screenshot({path:resolve(output,`panel-${width}.png`),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true,`panel overflow at ${width}`);
 }
 await click('[data-tab="new"]');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true,"mobile form overflow");
 await page.screenshot({path:resolve(output,"mobile-form.png"),fullPage:true});
 await db.exec("select set_config('test.role','COMPRAS',false)");await page.evaluate(async()=>{window.validationUser={id:"buyer",name:"Buyer",role:"COMPRAS"};await window.lossView.refresh();});
 assert.equal(await page.locator('[data-tab="config"]').isVisible(),false);assert.equal(await page.locator('[data-tab="exports"]').isVisible(),true);
 assert.deepEqual(errors,[]);
 await writeFile(resolve(output,"result.json"),JSON.stringify({passed:true,story:"XML > retroactive competence > allocation > submit > approve > Excel",screenshots:4,exported},null,2));
 console.log("Browser workflow passed; screenshots and Excel: "+output);
} finally {await browser.close();await server.close();await db.close();}
