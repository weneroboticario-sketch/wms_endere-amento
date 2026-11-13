const n=value=>Number.isFinite(Number(value))?Number(value):0;
export function packingAmounts(item){
  const box=item.quantityType==='CAIXA'||/^(CX|CAIXA|CAIXAS)$/i.test(item.unit||'');
  const factor=n(item.unitsPerBox),requested=n(item.requestedQty),packed=n(item.packedQty);
  const conversionKnown=!box||factor>0;
  const packedKnown=conversionKnown||n(item.packedUnits)>0||packed===0;
  return {box,conversionKnown,packedKnown,expected:conversionKnown?(box?requested*factor:requested):null,packed:box?(n(item.packedUnits)>0?n(item.packedUnits):factor>0?packed*factor:packed):packed,separated:conversionKnown?(box?n(item.separatedQty)*factor:n(item.separatedQty)):null,unit:packedKnown?'UN':'CX'};
}
export function reconcilePacking(item,events=[]){
  const amount=packingAmounts(item),history=events.filter(e=>e.item_id===item.id&&e.audit_version===1).sort((a,b)=>n(a.payload?.revision_after)-n(b.payload?.revision_after)||String(a.created_at).localeCompare(String(b.created_at))||String(a.id).localeCompare(String(b.id)));
  const first=history[0],stack=[];let cursor=first?n(first.quantity_before):amount.packed,broken=false,adjustments=0,adjustmentCount=0,codeReads=0,scannerModeReads=0;
  if(cursor>0)stack.push({source:'untracked',quantity:cursor});
  for(const [index,event] of history.entries()){
    const before=n(event.quantity_before),after=n(event.quantity_after),delta=after-before;
    if(Math.abs(cursor-before)>0.000001||after<0||Math.abs(n(event.quantity)-delta)>0.000001)broken=true;
    if(n(event.payload?.revision_before)!==index||n(event.payload?.revision_after)!==index+1)broken=true;
    if(event.event_type==='LEITURA_UNITARIA'&&(event.quantity_method!=='UNITARIA'||delta!==1||event.code_method!=='MODO_SCANNER'))broken=true;
    codeReads+=n(event.payload?.code_reads);if(event.code_method==='MODO_SCANNER')scannerModeReads+=n(event.payload?.code_reads);
    if(['AJUSTE_QUANTIDADE','REMOCAO_DA_CAIXA','CORRECAO','REVALIDACAO'].includes(event.event_type)){adjustments+=delta;adjustmentCount++;}
    if(delta>0)stack.push({source:event.quantity_method==='UNITARIA'?'unitary':event.quantity_method==='MANUAL'||event.quantity_method==='AJUSTE'?'manual':'untracked',quantity:delta});
    if(delta<0){let remove=-delta;while(remove>0&&stack.length){const segment=stack.at(-1),take=Math.min(segment.quantity,remove);segment.quantity-=take;remove-=take;if(!segment.quantity)stack.pop();}if(remove>0.000001)broken=true;}
    cursor=after;
  }
  const totals=stack.reduce((a,s)=>{a[s.source]+=s.quantity;return a;},{unitary:0,manual:0,untracked:0});
  if(Math.abs(cursor-amount.packed)>0.000001)broken=true;
  if(n(item.packingRevision)>0&&history.length!==n(item.packingRevision))broken=true;
  const difference=amount.conversionKnown?amount.packed-amount.expected:null;
  let status=broken?'REGISTRO INCOMPLETO':item.isExtra?'ITEM EXTRA':!amount.conversionKnown?'DIVERGÊNCIA — CONVERSÃO INDEFINIDA':difference<0?'PENDENTE':difference>0?'EXCEDENTE':!history.length||totals.untracked>0?'OK — QUANTIDADE CONFERIDA':totals.unitary>0&&totals.manual>0?'OK — MISTO':totals.unitary>0?'OK — BIPAGEM UNITÁRIA':'OK — MANUAL';
  return {...amount,...totals,history,codeReads,scannerModeReads,adjustments,adjustmentCount,difference,missing:difference===null?null:Math.max(0,-difference),excess:difference===null?null:Math.max(0,difference),broken,status,traceable:!broken&&history.length>0&&totals.untracked===0&&amount.conversionKnown};
}
export function packingAuditReport(items,events){
  const rows=items.map(item=>({item,...reconcilePacking(item,events)}));
  const totals=rows.reduce((t,r)=>{for(const key of ['expected','separated','packed','unitary','manual','untracked','codeReads','adjustments','adjustmentCount','missing','excess'])t[key]+=r[key];return t;},Object.fromEntries(['expected','separated','packed','unitary','manual','untracked','codeReads','adjustments','adjustmentCount','missing','excess'].map(k=>[k,0])));
  if(rows.some(r=>!r.conversionKnown))for(const key of ['expected','separated','missing','excess'])totals[key]=null;
  if(rows.some(r=>!r.packedKnown))for(const key of ['packed','unitary','manual','untracked','adjustments'])totals[key]=null;
  return {rows,totals,allEvents:events,traceable:rows.length>0&&rows.every(r=>r.traceable),comparableUnits:rows.every(r=>r.conversionKnown),label:rows.some(r=>r.broken)?'REGISTRO INCOMPLETO':rows.length&&rows.every(r=>r.traceable)?'CONFERÊNCIA RASTREÁVEL (MÉTODO DECLARADO)':rows.every(r=>r.difference===0&&!r.item.isExtra)?'QUANTIDADES CONFEREM — HISTÓRICO DE ENTRADA INDISPONÍVEL':'ORIGEM DA CONFERÊNCIA NÃO RASTREADA'};
}
export function packingAuditExport(transfer,report){
  return {transfer:{code:transfer.code,warehouse:transfer.warehouseCode,status:transfer.status,responsible:transfer.responsibleName,packingStartedAt:transfer.packingStartedAt,packingFinishedAt:transfer.packingFinishedAt},summary:{...report.totals,label:report.label,comparableUnits:report.comparableUnits},items:report.rows.map(r=>({sku:String(r.item.sku),description:r.item.description,requested:r.item.requestedQty,unit:r.item.unit,unitsPerBox:r.item.unitsPerBox,...Object.fromEntries(['expected','separated','packed','unitary','manual','adjustments','untracked','difference','status','codeReads'].map(k=>[k,r[k]]))})),history:report.allEvents};
}
