import {skuKey} from './magazines-domain.js';
export function createMagazineApi({client,user,warehouse,storage=window.sessionStorage}){
 const scope=()=>[user()?.id,user()?.role,warehouse()].join(':'),pendingKey=()=>`wms:magazines:pending:${scope()}`;
 const current=captured=>{if(scope()!==captured||!user())throw new Error('Usuário ou estoque mudou. Reabra a Central de Revistas.');};
 async function all(table,filters={}){
  const captured=scope(),rows=[];for(let offset=0;;offset+=500){let query=client().from(table).select('*').eq('warehouse_code',warehouse()).order('id');for(const [key,value] of Object.entries(filters))query=Array.isArray(value)?query.in(key,value):query.eq(key,value);const result=await query.range(offset,offset+499);current(captured);if(result.error)throw result.error;rows.push(...result.data);if(result.data.length<500)return rows;}
 }
 async function send(request){
  const captured=scope(),key=pendingKey();const result=await client().rpc('act_wms_magazine',request);current(captured);
  if(result.error){if(/^(?:22|23|40|42|P0|PGRST)/.test(result.error.code||''))storage.removeItem(key);throw result.error;}
  if(!result.data)throw new Error('Sem confirmação. Tente novamente a mesma operação.');storage.removeItem(key);return result.data;
 }
 return {scope,all,
  pending:()=>JSON.parse(storage.getItem(pendingKey())||'null'),
  async act(id,action,data={},revision=null){
   if(storage.getItem(pendingKey()))throw new Error('Existe uma operação sem confirmação. Use Tentar novamente.');
   const request={p_id:id,p_warehouse:warehouse(),p_action:action,p_data:data,p_revision:revision,p_action_id:crypto.randomUUID()};storage.setItem(pendingKey(),JSON.stringify(request));return send(request);
  },
  retry(){const pending=JSON.parse(storage.getItem(pendingKey())||'null');if(!pending)throw new Error('Nenhuma operação pendente.');return send(pending);},
  async catalogue(){const [magazines,cycles,versions]=await Promise.all([all('wms_magazines'),all('wms_magazine_cycles'),all('wms_magazine_versions')]);return {magazines:magazines.map(m=>({...m,page_count:versions.find(v=>v.id===m.active_version)?.page_count||0})),cycles};},
  async items(pages){const rows=[];for(let start=0;start<pages.length;start+=60)rows.push(...await all('wms_magazine_items',{page_id:pages.slice(start,start+60).map(p=>p.id)}));const byId=new Map(pages.map(p=>[p.id,p]));return rows.map(row=>({...row,printed_number:byId.get(row.page_id)?.printed_number,physical_number:byId.get(row.page_id)?.physical_number}));},
  async download(version){const captured=scope();const result=await client().storage.from('wms-magazines').download(version.file_path);current(captured);if(result.error)throw result.error;return new window.File([result.data],version.original_name,{type:'application/pdf'});},
  async upload(version,file){const captured=scope();const result=await client().storage.from('wms-magazines').upload(version.file_path,file,{contentType:'application/pdf',upsert:false});current(captured);if(result.error&&!/already exists|duplicate/i.test(result.error.message))throw result.error;},
  async catalogueCodes(codes){
   const captured=scope(),map=new Map();for(let start=0;start<codes.length;start+=30){const values=[...new Set(codes.slice(start,start+30).flatMap(code=>{const key=skuKey(code);return [code,key,...Array.from({length:Math.max(0,8-key.length)},(_,i)=>key.padStart(key.length+i+1,'0'))];}))];
    const result=await client().from('wms_products').select('sku,product_name').in('sku',values);current(captured);if(result.error)throw result.error;for(const row of result.data)if(!map.has(skuKey(row.sku)))map.set(skuKey(row.sku),{sku:row.sku,name:row.product_name});
   }return map;
  }
 };
}
export async function submitMagazineReplenishments({rows,scope,currentScope,create,findByKey,storage=window.sessionStorage,onProgress=()=>{}}){
 const key=`wms:magazine-replenishment:${scope}`;let batch=JSON.parse(storage.getItem(key)||'null');
 if(!batch){batch=rows.map(row=>({sku:row.sku,qty:row.qty,store:row.store,observation:row.observation,id:crypto.randomUUID(),done:false}));storage.setItem(key,JSON.stringify(batch));}
 for(const row of batch){if(currentScope()!==scope)throw new Error('Estoque ou usuário mudou.');if(row.done)continue;
  const existing=await findByKey(row.id);const result=existing||await create({codigoMaterial:row.sku,requestedQty:row.qty,storeQty:row.store,observation:row.observation,idempotencyKey:row.id,clientActionId:row.id});
  if(currentScope()!==scope)throw new Error('Estoque ou usuário mudou.');row.done=true;row.requestId=result?.id||null;row.cancelled=!result;storage.setItem(key,JSON.stringify(batch));onProgress(batch);
 }
 storage.removeItem(key);return batch;
}
