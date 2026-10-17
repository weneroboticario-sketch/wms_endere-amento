export const LOSS_STATUS = { RASCUNHO:"Rascunho",PENDENTE:"Pendente",CORRECAO_SOLICITADA:"Correção solicitada",APROVADA:"Aprovada",CANCELADA:"Cancelada",EXPORTADA:"Exportada" };
export function lossCapabilities(role, capabilities=[]) {
 if(["GERENTE","FINANCEIRO"].includes(role)) {
  const has=code=>capabilities.includes(code);
  return {read:has("finance.loss.read")||has("manager.approvals.read"),create:false,edit_draft:false,submit:false,
   request_correction:has("manager.loss.request_correction")||has("finance.loss.request_correction"),
   approve:has("manager.loss.approve"),cancel:false,export:has("finance.export")&&has("finance.dre.read"),
   validate:has("finance.loss.validate"),close:has("finance.close_competence"),reopen_period:has("finance.reopen_competence"),
   reopen:has("manager.operational_exception.handle"),configure:has("finance.configure_rates")||has("finance.configure_types"),
   configure_rates:has("finance.configure_rates"),configure_types:has("finance.configure_types")};
 }
 const read=["ADMINISTRADOR","SUPERVISOR","OPERADOR","COMPRAS"].includes(role);
 const manage=["ADMINISTRADOR","SUPERVISOR"].includes(role);
 return {read,create:read,edit_draft:read,submit:read,request_correction:manage,approve:manage,cancel:manage,
  export:["ADMINISTRADOR","SUPERVISOR","COMPRAS"].includes(role),configure:role==="ADMINISTRADOR",
  validate:role==="ADMINISTRADOR",close:["ADMINISTRADOR","SUPERVISOR","COMPRAS"].includes(role),
  reopen_period:["ADMINISTRADOR","SUPERVISOR","COMPRAS"].includes(role),reopen:manage,
  configure_rates:role==="ADMINISTRADOR",configure_types:role==="ADMINISTRADOR"};
}
export function cents(value) {
 const text=String(value ?? "").trim();
 const normalized=text.includes(",")?text.replace(/\./g,"").replace(",","."):text;
 if(!/^\d+(\.\d{1,2})?$/.test(normalized))throw new Error("Informe um valor monetário válido, com até duas casas decimais.");
 const [whole,decimal=""]=normalized.split(".");
 const result=BigInt(whole)*100n+BigInt(decimal.padEnd(2,"0"));
 if(result>99999999999999n)throw new Error("Valor acima do limite.");
 return Number(result);
}
export function allocatePercent(value,rows) {
 const total=BigInt(cents(value));
 const parts=rows.map(row=>{
  const value=String(row.percent).replace(",",".");
  if(!/^\d+(\.\d{1,4})?$/.test(value))throw new Error("Percentual inválido.");
  const [whole,decimal=""]=value.split(".");
  return BigInt(whole)*10000n+BigInt(decimal.padEnd(4,"0"));
 });
 if(parts.some(p=>p<=0n)||parts.reduce((a,b)=>a+b,0n)!==1000000n)throw new Error("O rateio deve somar 100%.");
 const whole=parts.map(p=>{const amount=total*p/1000000n;return amount>0n?amount:1n;});
 const residual=Number(total-whole.reduce((a,b)=>a+b,0n));
 if(residual<0)throw new Error("Valor insuficiente para os percentuais de cada centro.");
 const order=parts.map((p,i)=>({i,remainder:total*p%1000000n})).sort((a,b)=>a.remainder===b.remainder?a.i-b.i:a.remainder>b.remainder?-1:1);
 for(const {i} of order.slice(0,residual))whole[i]+=1n;
 return rows.map((row,i)=>{
  const amount=whole[i];
  if(amount<=0n)throw new Error("Cada centro precisa receber um valor positivo.");
  return {...row,percent:Number(parts[i])/10000,amount:Number(amount)/100};
 });
}
let invoiceXmlPolicy;
export function parseInvoiceXml(text,Parser=globalThis.DOMParser) {
 if(typeof text!=="string"||text.length>5*1024*1024)throw new Error("XML acima de 5 MB.");
 if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error("XML com entidades externas não é permitido.");
 let input=text;
 if(globalThis.trustedTypes?.createPolicy) {
  // XML is parsed into an inert document and only text/attributes are extracted.
  // The HTML sanitizer would remove NF-e tags, so use a private XML-only policy.
  invoiceXmlPolicy ||= globalThis.trustedTypes.createPolicy("wms-invoice-xml",{createHTML:value=>value});
  input=invoiceXmlPolicy.createHTML(text);
 }
 const xml=new Parser().parseFromString(input,"application/xml");
 if(xml.getElementsByTagName("parsererror").length)throw new Error("XML inválido.");
 const find=(node,name)=>node?.getElementsByTagNameNS("*",name)?.[0];
 const info=find(xml,"infNFe");if(!info)throw new Error("O arquivo não contém uma NF-e.");
 const get=(node,name)=>find(node,name)?.textContent?.trim() || "";
 const ide=find(info,"ide"),total=find(info,"ICMSTot"),issuer=find(info,"emit");
 const key=(info.getAttribute("Id")||"").replace(/^NFe/,"");
 const value=get(total,"vNF");
 const items=[...info.getElementsByTagNameNS("*","det")].map(det=>{
  const product=find(det,"prod"),quantity=Number(get(product,"qCom")),unit=Number(get(product,"vUnCom"));
  if(!product||!get(product,"cProd")||!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(unit)||unit<0)throw new Error("Item do XML com SKU, quantidade ou valor inválido.");
  return {sku:get(product,"cProd"),description_snapshot:get(product,"xProd"),quantity,unit_value:unit.toFixed(2),location_snapshot:""};
 });
 return { items,invoice_number:get(ide,"nNF"),invoice_key:/^\d{44}$/.test(key)?key:"",
  invoice_issue_date:(get(ide,"dhEmi")||get(ide,"dEmi")).slice(0,10),
  invoice_value:value?cents(value)/100:0,issuer_cnpj:get(issuer,"CNPJ"),issuer_name:get(issuer,"xNome") };
}
export function financialSheets(batch) {
 const details=batch.detail_snapshot || [], groups=new Map();
 for(const row of details) {
  const key=JSON.stringify([row.competence,row.dre_code,row.competent_warehouse_code,row.rate_percent,row.direction]);
  if(!groups.has(key))groups.set(key,{row,ids:new Set(),invoices:new Set(),invoice:0,rate:0});
  const group=groups.get(key);group.ids.add(row.loss_id);
  group.invoices.add(row.invoice_key||JSON.stringify([row.competent_warehouse_code,row.invoice_number||row.loss_id]));
  group.invoice+=cents(row.invoice_value);group.rate+=cents(row.rate_value);
 }
 const summary=[...groups.values()].map(({row,ids,invoices,invoice,rate})=>({
  "Competência":row.competence,"Linha DRE":row.dre_label,"Loja Competente":row.competent_warehouse_code,
  "Natureza":row.direction==="CREDIT"?"Ajuste positivo":"Perda","Quantidade registros":ids.size,"Quantidade NFs":invoices.size,"Valor Total NFs":invoice/100,
  "Alíquota (%)":Number(row.rate_percent),"Valor Calculado":rate/100
 }));
 const detail=details.map(row=>({
  "Código Perda":row.loss_code,"Competência":row.competence,"Loja":row.competent_warehouse_code,
  "Centro de Custo":row.cost_center,"Loja do Rateio":row.allocation_warehouse,"NF":row.invoice_number,"Chave NFe":row.invoice_key,"Emissão":row.invoice_issue_date,
  "Tipo de Perda":row.loss_type,"DRE":row.dre_label,"Natureza":row.direction==="CREDIT"?"Ajuste positivo":"Perda",
  "Valor NF":Number(row.invoice_value),"Alíquota (%)":Number(row.rate_percent),"Valor Calculado":Number(row.rate_value),
  "Solicitante":row.requester_name,"Responsável":row.responsible_name,"Status":"EXPORTADA","Motivo":row.reason,
  "Aprovado por":row.approved_by_name,"Data aprovação":row.approved_at
 }));
 if(details.reduce((n,r)=>n+cents(r.invoice_value),0)!==cents(batch.total_invoice_value)||
    details.reduce((n,r)=>n+cents(r.rate_value),0)!==cents(batch.total_rate_value))throw new Error("Lote não conciliado. Download bloqueado.");
 return {summary,detail};
}
