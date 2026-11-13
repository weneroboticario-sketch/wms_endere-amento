export const PHOTO_SKU_LIMITS=Object.freeze({bytes:15*1024*1024,pixels:40000000,workPixels:3000000,candidates:24});
export const photoSkuKey=value=>String(value??'').trim().replace(/^0+(?=\d)/,'');
export function validGtin(value){const s=String(value??'');if(!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(s))return false;let sum=0;for(let i=s.length-2,weight=3;i>=0;i--,weight=4-weight)sum+=Number(s[i])*weight;return (10-sum%10)%10===Number(s.at(-1));}
export function barcodeCandidate(value,format=''){
 const code=String(value??'').trim(),type=String(format).toUpperCase().replace(/[^A-Z0-9]/g,'');
 if(!/^\d{4,14}$/.test(code))return null;
 const gtin=['EAN13','EAN8','UPCA','ITF','ITF14'].includes(type)||code.length>8;
 if(type==='UPCE')return {code,kind:'UNSUPPORTED',source:'BARCODE',reason:'UPC-E requer um vínculo explícito; não foi convertido em SKU.'};
 if(gtin)return {code,kind:validGtin(code)?'GTIN':'INVALID',source:'BARCODE'};
 return {code,kind:'SKU',source:'BARCODE'};
}
export function textSkuCandidates(lines){
 const found=[];
 for(const [index,line] of lines.entries()){const text=String(line.text||'').trim(),confidence=Number(line.confidence||0);if(confidence<75)continue;
  const labelled=[...text.matchAll(/(?:\bSKU|\bC[ÓO]D(?:IGO)?\.?|\bREF(?:ER[ÊE]NCIA)?\.?)\s*[:#-]?\s*(\d{4,8})(?![\d.,])/gi)];
  if(labelled.length){for(const match of labelled)found.push({code:match[1],kind:'SKU',source:'OCR',confidence});continue;}
  // A number next to a lot, expiry, size or price is never promoted to SKU.
  if(/LOTE|\bLOT\b|VAL(?:IDADE)?|VENC|FABR?|R\$|PRE[ÇC]O|\d\s*(?:ML|KG|MG|GR?|L|UN)\b|\d[.,/]\d/i.test(text))continue;
  if(/^(?:LOTE|LOT|VAL(?:IDADE)?|VENC(?:IMENTO)?|FAB(?:RICA[ÇC][ÃA]O)?|PRE[ÇC]O)\s*[:.-]?$/i.test(String(lines[index-1]?.text||'').trim()))continue;
  if(confidence>=90&&/^\d{4,8}$/.test(text))found.push({code:text,kind:'SKU',source:'OCR',confidence});
 }
 return found;
}
export function uniquePhotoCandidates(candidates){
 const seen=new Set(),rows=[];for(const candidate of candidates){if(!candidate)continue;const key=candidate.kind+':'+candidate.code;if(seen.has(key))continue;seen.add(key);rows.push(candidate);}
 return {candidates:rows.slice(0,PHOTO_SKU_LIMITS.candidates),truncated:rows.length>PHOTO_SKU_LIMITS.candidates};
}
export async function resolvePhotoCandidates(candidates,lookup,isCurrent=()=>true,{truncated=false}={}){
 const found=new Map(),unknown=[],errors=[];
 for(const candidate of candidates){
  if(!isCurrent())throw Error('Usuário ou estoque mudou. Fotografe novamente.');
  if(!['SKU','GTIN'].includes(candidate.kind)){unknown.push(candidate);continue;}
  try{const rows=await lookup(candidate);if(!isCurrent())throw Error('Usuário ou estoque mudou.');
   if(!rows.length)unknown.push(candidate);
   for(const row of rows){if(!/^\d{4,8}$/.test(row.sku)||!row.product_name)continue;const key=String(row.sku),existing=found.get(key);found.set(key,{...row,sources:[...(existing?.sources||[]),candidate.source],readCodes:[...(existing?.readCodes||[]),candidate.code]});}
  }catch(error){if(!isCurrent())throw error;errors.push({code:candidate.code,message:error.message});}
 }
 const products=[...found.values()];return {products,unknown,errors,auto:products.length===1&&!errors.length&&!truncated?products[0]:null,truncated};
}
export function validatePhotoFile(file){if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size<=0||file.size>PHOTO_SKU_LIMITS.bytes)throw Error('Escolha uma foto JPG, PNG ou WEBP de até 15 MB.');}
