export const MAGAZINE_LIMITS = Object.freeze({bytes:25*1024*1024,pages:500,itemsPerPage:300,range:30,storageBytes:200*1024*1024});
export const MAGAZINE_KINDS = ['PRODUTO','REFIL','KIT','COMBO','INDEFINIDO'];
export const skuKey = value => String(value||'').trim().replace(/^0+(?=\d)/,'');
export function localDate(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Cuiaba',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const get=type=>parts.find(p=>p.type===type).value;return `${get('year')}-${get('month')}-${get('day')}`;
}
export function cycleState(cycle,now=new Date()){
 if(!cycle?.starts_on||!cycle?.ends_on)return {status:'RASCUNHO',days:null};
 const today=localDate(now);return {status:today<cycle.starts_on?'PROGRAMADO':today>cycle.ends_on?'ENCERRADO':'ATIVO',days:today>cycle.ends_on?0:Math.ceil((Date.parse(cycle.ends_on)-Date.parse(today))/86400000)+1};
}
export function validateDates(start,end){
 const valid=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 if(!valid(start)||!valid(end)||end<start)throw new Error('Informe datas válidas; o término deve ser igual ou posterior ao início.');
}
export async function validatePdfFile(file){
 if(!file||!file.name?.toLowerCase().endsWith('.pdf')||(file.type&&file.type!=='application/pdf'))throw new Error('Aceitamos somente arquivos PDF.');
 if(file.size<8||file.size>MAGAZINE_LIMITS.bytes)throw new Error('O PDF deve ter até 25 MB.');
 const bytes=new Uint8Array(await file.slice(0,1024).arrayBuffer());
 const header=String.fromCharCode(...bytes);if(!header.includes('%PDF-'))throw new Error('Arquivo inválido: não foi encontrada uma assinatura PDF.');
}
export function pageRange(from,to=from){
 const a=Number(from),b=Number(to||from);
 if(!Number.isInteger(a)||!Number.isInteger(b)||a<1||b<a||b-a>=MAGAZINE_LIMITS.range)throw new Error('Informe um intervalo válido de até 30 páginas impressas.');
 return {from:a,to:b};
}
export function mapPrintedPage(physical,firstPhysical,firstPrinted){
 if(!Number.isInteger(firstPhysical)||firstPhysical<1||!Number.isInteger(firstPrinted)||firstPrinted<1)throw new Error('Informe o início físico e o número impresso.');
 return physical<firstPhysical?null:physical-firstPhysical+firstPrinted;
}
const center=b=>[b[0]+b[2]/2,b[1]+b[3]/2];
function distance(a,b){const x=center(a),y=center(b);return Math.hypot(x[0]-y[0],(x[1]-y[1])*1.5);}
export function extractMagazineCodes(spans,{source='TEXT'}={}){
 const clean=spans.filter(s=>typeof s.text==='string'&&s.box?.length===4).map(s=>({...s,text:s.text.replace(/\s+/g,' ').trim()}));
 const candidates=[];
 for(const span of clean){
  for(const match of span.text.matchAll(/(?<![\d.,])\d{1,14}(?![\d.,])/g)){
   const before=span.text.slice(Math.max(0,match.index-14),match.index),after=span.text.slice(match.index+match[0].length,match.index+match[0].length+12);
   if(/R\$\s*$/i.test(before)||/^\s*(?:ml|m[lL]|gr?|kg|%|un\b)/i.test(after))continue;
   const fraction=match.index/Math.max(1,span.text.length),box=[span.box[0]+fraction*span.box[2],span.box[1],Math.max(.005,span.box[2]*match[0].length/Math.max(1,span.text.length)),span.box[3]];
   const nearby=clean.filter(s=>s===span||distance(s.box,box)<Math.max(.075,span.box[3]*10)).sort((a,b)=>distance(a.box,box)-distance(b.box,box)).slice(0,5);
   const context=[before+match[0]+after,...nearby.filter(s=>s!==span).map(s=>s.text)].join(' ').slice(0,500);
   const explicit=/(?:c[oó]d(?:igo)?\.?|sku|ref\.?)\s*[:#-]?\s*$/i.test(before)||nearby.some(s=>{const gap=box[0]-s.box[0]-s.box[2],height=Math.max(s.box[3],box[3]);return /^(?:c[oó]d(?:igo)?\.?|sku)\s*:?$/i.test(s.text)&&gap>=-.005&&gap<=height*2&&Math.abs(center(s.box)[1]-center(box)[1])<=height;});
   if(!explicit&&(match[0].length<4||match[0].length>8))continue;
   const patterns=[[/\brefil\b/i,'REFIL'],[/\bcombo\b/i,'COMBO'],[/\bkit\b/i,'KIT']],localKinds=patterns.filter(([pattern])=>pattern.test(before+' '+after)),nearbyKinds=patterns.filter(([pattern])=>pattern.test(context));
   const kind=localKinds.length===1?localKinds[0][1]:localKinds.length>1||nearbyKinds.length?'INDEFINIDO':explicit?'PRODUTO':'INDEFINIDO';
   const descriptions=nearby.filter(s=>/[a-zÀ-ú]{3}/i.test(s.text)&&!/^\s*(?:c[oó]d|sku|R\$)/i.test(s.text));
   candidates.push({sku:match[0],extracted_description:(descriptions[0]?.text||'').slice(0,400),kind,box,source,confidence:Number(span.confidence??(source==='TEXT'?100:0)),status:'REVISAR',reason:!explicit?'Código numérico sem rótulo inequívoco; confirme no original.':kind==='INDEFINIDO'?'Associação de produto/refil/kit ambígua.':'Aguardando validação do cadastro e revisão da página.',explicit});
  }
 }
 // Layout is inferred from actual coordinates, never from fixed page regions.
 if(candidates.length>MAGAZINE_LIMITS.itemsPerPage)throw new Error('Mais de 300 candidatos nesta página. Revise o arquivo; o índice não foi considerado completo.');
 return candidates.sort((a,b)=>a.box[1]-b.box[1]||a.box[0]-b.box[0]).map((r,order)=>({...r,visual_order:order}));
}
export function validateExtracted(rows,catalog){
 return rows.map(row=>{const found=catalog.get(skuKey(row.sku));return {...row,official_description:found?.name||'',catalog_sku:found?.sku||null,status:!found?'NAO_ENCONTRADO':row.explicit&&row.kind!=='INDEFINIDO'&&row.confidence>=85?'VALIDADO':'REVISAR',reason:!found?'Código lido não encontrado no cadastro atual.':row.reason};});
}
export function groupPageItems(rows){
 const groups=new Map();for(const row of rows){const key=skuKey(row.sku);if(!key)continue;const current=groups.get(key)||{...row,occurrences:[],pages:[],eligible:true};current.occurrences.push(row);current.pages=[...new Set([...current.pages,row.printed_number])];current.eligible&&=row.status==='VALIDADO';groups.set(key,current);}return [...groups.values()];
}
export function supplySituation(stock,minimum=null){
 if(stock.error)return {labels:['ERRO DE CONSULTA'],suggested:null,eligible:false};
 const labels=[];const store=stock.storeFound?Number(stock.storeAvailable):null,capture=stock.captureFound?Number(stock.captureAvailable):null;
 if(stock.stale)labels.push('SALDO DESATUALIZADO');
 if(store===null)labels.push('LOJA SEM INFORMAÇÃO');else if(store<0)labels.push('LOJA COM SALDO NEGATIVO');else if(store===0)labels.push('LOJA ZERADA');else if(Number.isFinite(minimum)&&minimum>0&&store<minimum)labels.push('LOJA ABAIXO DO MÍNIMO');else labels.push('LOJA ABASTECIDA');
 if(capture===null)labels.push('CAPTAÇÃO SEM INFORMAÇÃO');else labels.push(capture>0?'CAPTAÇÃO DISPONÍVEL':'CAPTAÇÃO ZERADA');
 if(!stock.location)labels.push('SEM LOCALIZAÇÃO');if(stock.pending?.length)labels.push('REPOSIÇÃO PENDENTE');
 const suggested=Number.isFinite(minimum)&&minimum>0&&store!==null&&capture!==null?Math.min(Math.max(0,minimum-store),Math.max(0,capture)):null;
 return {labels,suggested,eligible:capture!==null&&capture>0,highlight:store===0&&capture>0};
}
export function cycleMetrics(rows,pages=[]){
 const unique=new Map(rows.map(r=>[skuKey(r.sku),r]));const result={products:unique.size,storeZero:0,captureAvailable:0,totalZero:0,unlocated:0,pending:0,unreviewed:pages.filter(p=>p.review_status!=='REVISADA').length};
 for(const r of unique.values()){const s=r.stock;if(!s||s.error){result.unavailable=(result.unavailable||0)+1;continue;}if(s.storeFound&&s.storeAvailable===0)result.storeZero++;if(s.captureFound&&s.captureAvailable>0)result.captureAvailable++;if(s.storeFound&&s.captureFound&&s.storeAvailable<=0&&s.captureAvailable<=0)result.totalZero++;if(!s.location)result.unlocated++;if(s.pending?.length)result.pending++;}return result;
}
