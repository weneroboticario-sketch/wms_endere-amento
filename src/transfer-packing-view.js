import {createPackingGateway,loadPackingHistory} from './transfer-packing-api.js';
import {reconcilePacking,packingAuditReport,packingAuditExport} from './transfer-packing-audit.js';
import {escapeHtml as h} from './utils.js';
import './transfer-packing.css';
const value=v=>v===null?'Conversão indefinida':String(v);
const historyQuantity=e=>e.audit_version===1?e.quantity:`${e.quantity??'—'} (legado; unidade não validada)`;
const historyReads=e=>e.audit_version===1?e.payload?.code_reads||0:'Não registrado';
export function createPackingController({client,scope,warehouse,items,events,setEvents,accept,refresh,status}){
 const gateway=createPackingGateway({client:{rpc:(...args)=>client().rpc(...args)},storage:window.sessionStorage,scope});
 let active=null,selected=null,loaded=false,loadedTransfer='',queue=Promise.resolve(),lastCode='';
 const el=id=>document.getElementById(id);
 const method=()=>el('packingCodeMode')?.value||'MANUAL';
 const pendingSafe=()=>{try{return gateway.pending();}catch{return null;}};
 async function history(t){
  const captured=scope();loaded=false;loadedTransfer='';
  try{const rows=await loadPackingHistory(client(),t.id,warehouse());if(scope()!==captured)return;const ids=new Set(rows.map(e=>e.id));setEvents(rows.concat(events().filter(e=>e.transfer_id===t.id&&!ids.has(e.id))));loaded=true;loadedTransfer=t.id;}
  catch(error){if(scope()===captured)status(`Histórico indisponível: ${error.message}. A rastreabilidade não foi confirmada.`,'error');}
 }
 async function perform(t,item,action){
  const captured=scope();
  try{
   const result=await gateway.perform({transferId:t.id,itemId:item?.id,warehouse:warehouse(),revision:item?.packingRevision||0,action:{...action,box_number:el('boxIdInput')?.value||''}});
   if(result.stale||scope()!==captured)return false;
   accept(result.data);if(action.operation!=='LEITURA_SKU')lastCode='';status('Operação confirmada no servidor.','success');refresh();return true;
  }catch(error){
   if(scope()!==captured)return false;
   if(['40001','42501','22023','P0001','23514'].includes(error.code))gateway.discardRejected(error.code);
   status(`${error.message}${pendingSafe()?' Operação sem confirmação: use Tentar novamente.':''}`,'error');render(t,item);return false;
  }
 }
 function controls(){
  if(el('packingAuditControls'))return;
  const host=document.createElement('div');host.id='packingAuditControls';host.innerHTML=`<label>Entrada do código<select id="packingCodeMode"><option value="MANUAL">Informar manualmente</option><option value="MODO_SCANNER">Ler código — modo scanner</option></select></label><label>Quantidade<select id="packingQuantityMode"><option value="MANUAL">Informar quantidade manual</option><option value="UNITARIA">Uma unidade UN por leitura</option></select></label><small>O modo scanner é declarado pelo operador. Leitores em modo teclado não comprovam a captura física.</small><button type="button" class="secondary-button" id="packingRetry" hidden>Tentar novamente a operação</button>`;
  el('transferScanInput').before(host);
  el('packingRetry').onclick=async()=>{
   try{const request=gateway.pending();const result=await gateway.retry();if(result.stale)return;accept(result.data);status('Operação confirmada sem duplicação.','success');refresh();el('transferQuantityInput').value='';el('transferScanInput').value=request.p_action.operation==='LEITURA_SKU'?result.data.event.sku:'';lastCode=request.p_action.operation==='LEITURA_SKU'?`${scope()}:${result.data.event.item_id}:${result.data.event.sku}`:'';el('transferScanInput').focus();}
   catch(error){if(['40001','42501','22023','P0001','23514'].includes(error.code))gateway.discardRejected(error.code);status(error.message,'error');render(active,selected);}
  };
 }
 function render(t,item){
  active=t;selected=item;controls();
  const outbound=t&&t.flowType!=='CONFERENCIA_XML';const montage=outbound&&['SEPARACAO_CONCLUIDA','EM_LACRE','EM_MONTAGEM_CAIXA','CORRECAO_SOLICITADA','EM_CORRECAO'].includes(t.status);
  el('packingAuditControls').hidden=!montage;el('packingRetry').hidden=!pendingSafe();
  let panel=el('packingItemAudit');if(!panel){panel=document.createElement('div');panel.id='packingItemAudit';panel.className='current-item-card packing-item-audit';el('transferCurrentItem').after(panel);}
  panel.hidden=!outbound||!item;if(panel.hidden)return;
  const r=reconcilePacking(item,events());
  panel.innerHTML=`<strong>Origem da quantidade</strong><p>Solicitado: ${h(value(r.expected))} · Separado: ${h(value(r.separated))} · Na caixa: ${h(value(r.packed))} ${h(r.unit)}</p><p>Leituras do SKU: ${r.codeReads} · Unidades por leitura unitária: ${r.unitary} · Quantidade manual líquida: ${r.manual} · Sem rastreio: ${r.untracked}</p><p>${h(loaded&&loadedTransfer===t.id?r.status:'Histórico ainda não confirmado')}</p><button type="button" class="secondary-button" id="packingItemHistory">Ver histórico</button>`;
  el('packingItemHistory').onclick=()=>showHistory(item);
 }
 function showHistory(item){
  const history=events().filter(e=>e.item_id===item.id).sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at))||String(a.id).localeCompare(String(b.id)));
  const dialog=document.createElement('dialog');dialog.style.maxWidth='95vw';dialog.innerHTML=`<h3>Histórico — SKU ${h(item.sku)}</h3><p>Somente eventos gravados. Registros legados não comprovam a origem das quantidades. Modo scanner não comprova leitor físico.</p><div style="overflow:auto"><table><thead><tr>${['Hora do servidor','Usuário','Operação','Método','Leituras SKU','Quantidade (UN)','Antes','Depois','Motivo','ID'].map(s=>`<th>${s}</th>`).join('')}</tr></thead><tbody>${history.map(e=>`<tr>${[e.created_at,e.user_name,e.event_type,`${e.code_method||"LEGADO NÃO VALIDADO"} / ${e.quantity_method||"NÃO REGISTRADO"}`,historyReads(e),historyQuantity(e),e.quantity_before,e.quantity_after,e.observation,e.id].map(s=>`<td>${h(String(s??''))}</td>`).join('')}</tr>`).join('')||'<tr><td colspan="10">Origem da conferência não rastreada. Nenhum evento auditado disponível.</td></tr>'}</tbody></table></div><button type="button">Fechar</button>`;
  document.body.append(dialog);dialog.querySelector('button').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();dialog.showModal();
 }
 function report(t){
  const r=packingAuditReport(items(t.id),events());const data=packingAuditExport(t,r);
  el('transferFinalReportSummary').innerHTML=`<p><strong>${h(loaded&&loadedTransfer===t.id?r.label:'HISTÓRICO NÃO CONFIRMADO')}</strong></p>`+[['Solicitado',r.totals.expected],['Separado',r.totals.separated],['Registrado na caixa',r.totals.packed],['Leitura unitária',r.totals.unitary],['Manual líquido',r.totals.manual],['Sem rastreio',r.totals.untracked],['Leituras SKU',r.totals.codeReads],['Ajustes (líquido)',r.totals.adjustments],['Faltante',r.totals.missing],['Excedente',r.totals.excess],['Operações de ajuste',r.totals.adjustmentCount],['Itens extras',r.rows.filter(x=>x.item.isExtra&&x.packed>0).length],['SKUs com divergência',r.rows.filter(x=>x.broken||x.difference!==0||(x.item.isExtra&&x.packed>0)).length]].map(([label,v])=>`<div><span>${h(label)}</span><strong>${h(value(v))}</strong></div>`).join('');
  const columns=[['SKU',x=>x.item.sku],['Produto',x=>x.item.description],['Localização',x=>x.item.addressCode||x.item.suggestedLocation||'—'],['Prevista',x=>x.item.requestedQty],['Unidade',x=>x.item.unit],['UN/CX',x=>x.item.unitsPerBox||'—'],['Total previsto',x=>x.expected],['Bipado unitário',x=>x.unitary],['Digitado líquido',x=>x.manual],['Ajustes',x=>x.adjustments],['Sem rastreio',x=>x.untracked],['Na caixa',x=>x.packed],['Diferença',x=>x.difference],['Status',x=>x.status]];
  const table=rows=>`<div class="table-wrap packing-audit-table"><table><thead><tr>${columns.map(([label])=>`<th>${label}</th>`).join('')}<th>Histórico</th></tr></thead><tbody>${rows.map(row=>`<tr>${columns.map(([label,get])=>`<td style="mso-number-format:&#39;\\@&#39;" data-label="${h(label)}">${h(value(get(row)))}</td>`).join('')}<td><button class="secondary-button" data-packing-history="${h(row.item.id)}">Ver histórico</button></td></tr>`).join('')}</tbody></table></div>`;
  el('transferFinalReportDetails').innerHTML=`<p>Quantidades líquidas. Ajustes são informativos e já estão descontados da composição. Não somar novamente. Captura em modo scanner é declarada.</p><div class="button-row"><button class="secondary-button" data-audit-export="json">Histórico JSON</button><button class="secondary-button" data-audit-export="csv">Relatório CSV</button><button class="secondary-button" data-audit-export="xls">Relatório Excel</button><button class="secondary-button" data-audit-export="pdf">Imprimir / PDF</button></div><h4>Resultado por SKU</h4>${table(r.rows.filter(x=>!x.item.isExtra))}<h4>Itens extras — quantidade registrada</h4>${table(r.rows.filter(x=>x.item.isExtra))}`;
  el('transferFinalReportDetails').querySelectorAll('[data-packing-history]').forEach(button=>button.onclick=()=>showHistory(items(t.id).find(x=>x.id===button.dataset.packingHistory)));
  const metadata=document.createElement('p');metadata.textContent=`Responsável: ${t.responsibleName||'Não registrado'} · Início da montagem: ${t.packingStartedAt||'Não registrado'} · Fim: ${t.packingFinishedAt||'Não registrado'}`;el('transferFinalReportSummary').prepend(metadata);
  const historyTable='<h3>Histórico de operações</h3><table><thead><tr>'+['Data do servidor','Responsável','SKU','Operação','Método código','Método quantidade','Leituras SKU','Quantidade (UN)','Antes','Depois','Motivo','ID'].map(s=>'<th>'+s+'</th>').join('')+'</tr></thead><tbody>'+data.history.map(e=>'<tr>'+[e.created_at,e.user_name,e.sku,e.event_type,e.code_method,e.quantity_method,historyReads(e),historyQuantity(e),e.quantity_before,e.quantity_after,e.observation,e.id].map(v=>'<td>'+h(String(v??''))+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
  const exportHtml=()=>'<html><meta charset="utf-8"><style>table{border-collapse:collapse;width:100%;font:9px Arial}td,th{border:1px solid #ccc;padding:4px}button{display:none}@page{size:landscape}body{font-family:Arial}</style><body><h2>'+h(t.code)+'</h2>'+el('transferFinalReportSummary').innerHTML+el('transferFinalReportDetails').querySelectorAll('.table-wrap')[0].outerHTML+el('transferFinalReportDetails').querySelectorAll('.table-wrap')[1].outerHTML+historyTable+'</body></html>';
  el('transferFinalReportDetails').querySelectorAll('[data-audit-export]').forEach(button=>button.onclick=()=>{
   if(!loaded||loadedTransfer!==t.id){status('O histórico não foi confirmado. Abra novamente a transferência antes de exportar.','error');return;}
   const format=button.dataset.auditExport;if(format==='pdf'){const frame=document.createElement('iframe');frame.style.cssText='position:fixed;width:1px;height:1px;opacity:0';frame.title='Relatório de auditoria para impressão';frame.onload=()=>{frame.contentWindow.print();setTimeout(()=>frame.remove(),60000);};frame.srcdoc=exportHtml();document.body.append(frame);return;}
   let content=JSON.stringify(data,null,2),type='application/json';
   if(format==='csv'){const records=[...data.items.map(x=>({section:'SKU',...x})),...data.history.map(x=>({section:'HISTORICO',...x,payload:JSON.stringify(x.payload)})),{section:'RESUMO',...data.summary}];const keys=[...new Set(records.flatMap(Object.keys))];const safe=x=>typeof x==='string'&&/^[=+@-]/.test(x)?String.fromCharCode(39)+x:x;const quote=x=>'"'+String(safe(x)??'').replaceAll('"','""')+'"';content='\uFEFF'+[keys,...records.map(row=>keys.map(k=>row[k]))].map(row=>row.map(quote).join(';')).join('\r\n');type='text/csv';}
   if(format==='xls'){content=exportHtml();type='application/vnd.ms-excel';}
   const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=`auditoria-${t.code||t.id}.${format}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
 }
 return {history,render,report,perform,method,codeReadRequired:(item,raw)=>lastCode!==`${scope()}:${item.id}:${raw}`,
  locate(t,item,raw){
   if(el('packingQuantityMode')?.value==='UNITARIA'){
    if(method()!=='MODO_SCANNER'){status('Leitura unitária exige selecionar o modo scanner.','error');return Promise.resolve(false);}
    const captured=scope();const action={operation:'LEITURA_UNITARIA',quantity:1,raw_code:raw,code_method:method()};
    queue=queue.then(()=>scope()===captured?perform(t,items(t.id).find(x=>x.id===item.id),action):false);return queue;
   }
   return perform(t,item,{operation:'LEITURA_SKU',raw_code:raw,code_method:method()}).then(ok=>{if(ok)lastCode=`${scope()}:${item.id}:${item.sku}`;return ok;});
  }
 };
}
