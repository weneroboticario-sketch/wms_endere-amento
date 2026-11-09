import {skuKey} from './magazines-domain.js';
import {classifyImportFreshness} from './stock-freshness.js';
export function createMagazineStockReader({client,warehouse,user,positionColumns,mapPosition,aliases,splitSku,buildSuggestion,openStatuses}){
 async function read(factory){const rows=[];for(let offset=0;;offset+=500){const result=await factory().range(offset,offset+499);if(result.error)throw result.error;rows.push(...result.data);if(result.data.length<500)return rows;}}
 return async function loadMagazineStock(codes){
  const capturedWarehouse=warehouse(),actor=user()?.id,keys=[...new Set(codes.map(skuKey))],stocks=new Map();if(!keys.length)return stocks;
  const valid=()=>{if(capturedWarehouse!==warehouse()||actor!==user()?.id)throw new Error('Usuário ou estoque mudou durante a consulta.');};
  let bindings,batches;
  try{[bindings,batches]=await Promise.all([
   read(()=>client().from('wms_bindings').select('id,sku,location_code,updated_at').eq('warehouse_code',capturedWarehouse).order('id')),
   Promise.all(['LOJA','CAPTACAO'].map(async source=>{const [completed,latest]=await Promise.all([client().from('wms_stock_import_batches').select('source_type,status,finished_at,updated_at,created_at').eq('warehouse_code',capturedWarehouse).eq('source_type',source).eq('status','COMPLETED').order('finished_at',{ascending:false}).limit(1),client().from('wms_stock_import_batches').select('source_type,status,created_at').eq('warehouse_code',capturedWarehouse).eq('source_type',source).order('created_at',{ascending:false}).limit(1)]);if(completed.error||latest.error)throw completed.error||latest.error;return {source,completed:completed.data[0],latest:latest.data[0]};}))
  ]);}catch(error){valid();for(const key of keys)stocks.set(key,{error:error.message});return stocks;}
  valid();const locations=new Map();for(const binding of bindings)for(const raw of splitSku(binding.sku)){const key=skuKey(raw),list=locations.get(key)||[];if(binding.location_code&&!list.includes(binding.location_code))list.push(binding.location_code);locations.set(key,list);}
  for(let start=0;start<keys.length;start+=40){
   const part=keys.slice(start,start+40),values=aliases(part);
   try{const [rawPositions,requests]=await Promise.all([
    read(()=>client().from('wms_stock_positions').select(positionColumns()).eq('warehouse_code',capturedWarehouse).eq('active',true).in('codigo_material',values).in('source_type',['LOJA','CAPTACAO']).order('id')),
    read(()=>client().from('wms_replenishment_requests').select('id,codigo_material,status,quantidade_solicitada,responsavel_nome,created_at').eq('warehouse_code',capturedWarehouse).in('codigo_material',values).in('status',openStatuses).or('is_deleted.is.null,is_deleted.eq.false').order('id'))
   ]);valid();const seen=new Set(),positions=rawPositions.map(mapPosition).filter(p=>{const key=[p.sourceType,skuKey(p.codigoMaterial),p.recordHash||p.id].join(':');if(seen.has(key))return false;seen.add(key);return true;});
   for(const key of part){const related=positions.filter(p=>skuKey(p.codigoMaterial)===key),suggestion=buildSuggestion(key,0,related,capturedWarehouse),freshness=batches.map(batch=>({...batch,...classifyImportFreshness(batch.completed)}));
    const updatedLabel=freshness.map(f=>`${f.source}: ${f.updatedAt?new Date(f.updatedAt).toLocaleString('pt-BR',{timeZone:'America/Cuiaba'}):'sem atualização informada'}${f.latest&&f.latest.status!=='COMPLETED'?` · última carga ${f.latest.status}`:''}`).join(' | ');
    const unavailable=new Set(rawPositions.filter(p=>skuKey(p.codigo_material)===key&&(p.total_disponivel===null||p.total_disponivel===undefined)).map(p=>p.source_type));
    stocks.set(key,{...suggestion,...(unavailable.has('LOJA')?{storeFound:false,storeAvailable:null}:{}),...(unavailable.has('CAPTACAO')?{captureFound:false,captureAvailable:null}:{}),location:(locations.get(key)||[]).join(' / ')||suggestion.captureLocation||'',pending:requests.filter(r=>skuKey(r.codigo_material)===key),stale:freshness.some(f=>f.state==='STALE'),baseState:freshness.map(f=>({source:f.source,state:f.state,latest:f.latest?.status})),updatedLabel});
   }}catch(error){valid();for(const key of part)stocks.set(key,{error:error.message});}
  }return stocks;
 };
}
