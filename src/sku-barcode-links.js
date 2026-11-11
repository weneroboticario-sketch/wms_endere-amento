import {validGtin} from './sku-photo-domain.js';

const normalize=value=>String(value??'').replace(/^\uFEFF/,'').trim();

function splitDelimited(row,separator){
  const result=[];let value='',quoted=false;
  for(let i=0;i<row.length;i++){
    const character=row[i];
    if(character==='"'){
      if(quoted&&row[i+1]==='"'){value+='"';i++;}
      else quoted=!quoted;
    }else if(character===separator&&!quoted){result.push(normalize(value));value='';}
    else value+=character;
  }
  result.push(normalize(value));
  return result;
}

/** Prepare, but never persist, user supplied EAN;SKU rows. */
export function parseBarcodeLinksCsv(text,{maxRows=500}={}){
  const input=String(text??'');
  if(input.length>500000)throw Error('CSV muito grande. Divida o arquivo em lotes de até 500 vínculos.');
  const lines=input.split(/\r?\n/).map((text,index)=>({text,index:index+1})).filter(row=>row.text.trim());
  if(!lines.length)return {rows:[],errors:[]};
  const delimiter=lines[0].text.includes(';')?';':',';
  const first=splitDelimited(lines[0].text,delimiter).map(part=>part.toLowerCase());
  const isHeader=first[0]==='ean'||first[0]==='gtin'||first[0]==='codigo_barras';
  const content=isHeader?lines.slice(1):lines;
  if(content.length>maxRows)throw Error('Limite de '+maxRows+' linhas por importação. Divida o arquivo.');
  const unique=new Set(),rows=[],errors=[];
  for(const entry of content){
    const parts=splitDelimited(entry.text,delimiter);
    const [ean,sku]=parts;
    if(parts.length!==2||!validGtin(ean)||!/^\d{4,8}$/.test(sku||'')){
      errors.push({line:entry.index,message:'EAN/GTIN ou SKU inválido.'});
      continue;
    }
    const normalizedEan=ean.padStart(14,'0');
    if(unique.has(normalizedEan)){
      errors.push({line:entry.index,message:'EAN repetido no arquivo.'});
      continue;
    }
    unique.add(normalizedEan);
    rows.push({ean,sku,line:entry.index});
  }
  return {rows,errors};
}
