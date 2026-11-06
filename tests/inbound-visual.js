import { installHtmlSecurity } from "../src/utils.js";
import { mountInboundReceipts } from "../src/inbound-receipts.js";
import { previewInboundXml } from "../src/inbound-receipts-domain.js";
installHtmlSecurity();
const xml = '<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe35261108575189000152550010000001231000001234"><ide><mod>55</mod><nNF>123</nNF></ide><emit><xNome>Unidade remetente</xNome></emit><dest><CNPJ>08575189000152</CNPJ></dest><det nItem="1"/></infNFe></NFe></nfeProc>';
const preview = previewInboundXml(xml); document.getElementById("xmlCheck").textContent = `Parser XML real: NF ${preview.number}, ${preview.items} item, CNPJ ${preview.destination} — OK`;
let user = { id:"op",name:"Operador de teste",role:"OPERADOR",active:true };
const r = { id:"00000000-0000-4000-8000-000000000001",warehouse_code:"VDCG",invoice_number:"123",series:"1",invoice_key:"35261108575189000152550010000001231000001234",source_name:"Unidade remetente",source_cnpj:"18325344000489",destination_name:"VDCG",destination_cnpj:"08575189000152",status:"EM_CONFERENCIA",assigned_to:"op",assigned_name:"Operador de teste",version:2,created_at:"2026-11-05T12:00:00Z",issued_at:"2026-11-05T10:00:00Z",xml_content:xml };
const items = [{id:"item-1",line_number:1,supplier_code:"FORN-01314",internal_sku:"01314",internal_description:"Produto WMS",description:"Produto recebido",expected_qty:4,counted_qty:null,commercial_unit:"UN",tributary_unit:"UN",tributary_qty:4,ean:"7891234567890",tributary_ean:"7891234567890",observation:""},{id:"item-2",line_number:2,supplier_code:"FORN-CX",internal_sku:null,description:"Produto em caixas",expected_qty:3,counted_qty:null,commercial_unit:"CX",tributary_unit:"UN",tributary_qty:72,ean:"7891234567892",tributary_ean:"7891234567893",observation:""}];
function query(table) {
  const filters=[];let single=false;const q={};
  for(const name of ["select","order","limit","gte","lt","or"]) q[name]=()=>q;
  q.eq=(key,value)=>{filters.push([key,value]);return q;};q.in=(key,values)=>{if(key==="status")filters.push([key,values]);return q;};q.single=q.maybeSingle=()=>{single=true;return q;};
  q.then=resolve=>{let rows=table==="wms_inbound_receipts"?[r]:table==="wms_inbound_receipt_items"?items:table==="wms_products"?[{sku:"01314",product_name:"Produto WMS"}]:[]; rows=rows.filter(row=>filters.every(([key,value])=>key==="receipt_id"||(Array.isArray(value)?value.includes(row[key]):row[key]===value)));return Promise.resolve({data:globalThis.structuredClone(single?rows[0]:rows),error:null}).then(resolve);};return q;
}
const requests=new Set();
const client={from:query,async rpc(_name,args){if(_name==="import_wms_inbound")return {data:r.id,error:null};if(requests.has(args.p_action_id))return {data:r.version};if(args.p_version!==r.version)return {error:{message:"Outro colaborador alterou a contagem. Atualize."}};requests.add(args.p_action_id);const data=args.p_data;
  if(args.p_action==="COUNT"){const item=items.find(i=>i.id===data.item_id);const quantity=Number(data.quantity)*(data.unit===item.commercial_unit?1:item.expected_qty/item.tributary_qty);item.counted_qty=data.mode==="ADD"?Number(item.counted_qty||0)+quantity:quantity;item.counted_name=user.name;item.counted_at=new Date().toISOString();}
  if(args.p_action==="MAP"){items.find(i=>i.id===data.item_id).internal_sku=data.sku;}
  if(args.p_action==="FINISH"){r.status="CONCLUIDO_DIVERGENTE";r.finished_name=user.name;r.finished_at=new Date().toISOString();}
  r.version++;return {data:r.version,error:null};}};
const ui=mountInboundReceipts({client:()=>client,user:()=>user,warehouse:()=>"VDCG",users:()=>[{id:"op",name:"Operador de teste",role:"OPERADOR",active:true}],userWarehouse:()=>true});
await ui.render();document.getElementById("roleSwitch").onclick=()=>{user=user.role==="OPERADOR"?{id:"sup",name:"Supervisor",role:"SUPERVISOR",active:true}:{id:"op",name:"Operador de teste",role:"OPERADOR",active:true};document.getElementById("roleSwitch").textContent=user.role==="OPERADOR"?"Usar perfil supervisor":"Usar perfil operador";ui.render();};
document.getElementById("historySwitch").onclick=()=>ui.render(true);
document.getElementById("receiptsSwitch").onclick=()=>ui.render(false);
