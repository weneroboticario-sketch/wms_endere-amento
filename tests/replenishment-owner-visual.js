import { createOwnerExport } from '../src/replenishment-owner-export.js';
import { installHtmlSecurity } from '../src/utils.js';
installHtmlSecurity();

// Deliberately isolated UI fixture. Real SQL/RLS is exercised separately by the PGlite tests.
const actors = { g: { id:'g',name:'Guilherme',role:'OPERADOR' }, b:{id:'b',name:'Barreto',role:'OPERADOR'}, a:{id:'a',name:'Administrador',role:'ADMINISTRADOR'} };
const batches = [], portions = [
  {id:'g1',request_id:'split',codigo_material:'00178',quantity:6,owner:'g',warehouse:'VDCG',done:true},
  {id:'b1',request_id:'split',codigo_material:'00178',quantity:4,owner:'b',warehouse:'VDCG',done:true},
  {id:'g2',request_id:'partial',codigo_material:'89678',quantity:3,owner:'g',warehouse:'VDCG',done:false},
  {id:'a1',request_id:'admin',codigo_material:'00001',quantity:2,owner:'a',warehouse:'VDCG',done:true}
];
let who='g', warehouse='VDCG';
const client = { async rpc(name,args) {
  try {
    if(name!=='wms_replenishment_owner_export') throw new Error('RPC inesperada');
    const p=args.p_payload||{}, owner=p.owner_id||who, admin=p.mode==='ADMIN';
    if(admin&&who!=='a'||!admin&&owner!==who) throw new Error('Não autorizado');
    const selected=portions.filter(x=>x.owner===owner&&x.warehouse===args.p_warehouse);
    const ready=selected.filter(x=>x.done&&!x.batch);
    let data;
    switch(args.p_action) {
      case 'SUMMARY': data={owner_id:owner,owner_name:actors[owner].name,items:new Set(ready.map(x=>x.codigo_material)).size,
        units:ready.reduce((sum,x)=>sum+x.quantity,0),last_export:batches.filter(b=>b.owner_id===owner&&b.warehouse_code===args.p_warehouse&&b.export_state==='CONFIRMED').at(-1)?.created_at,
        unfinished:selected.filter(x=>!x.done).map(x=>({...x})),legacy_count:1}; break;
      case 'DIRECTORY': data=Object.values(actors).map(x=>({id:x.id,name:x.name})); break;
      case 'HISTORY': data=batches.filter(b=>b.owner_id===owner&&b.warehouse_code===args.p_warehouse);break;
      case 'CONCLUDE_PORTION': portions.filter(x=>x.owner===who&&x.request_id===p.request_id&&x.warehouse===args.p_warehouse).forEach(x=>{x.done=true;});data={ok:true};break;
      case 'RESERVE': {
        data=batches.find(b=>b.id===p.batch_id);
        if(data) break;
        if(batches.some(b=>b.owner_id===owner&&b.warehouse_code===args.p_warehouse&&b.export_state==='RESERVED')) throw new Error('Já existe reserva. Continue ou libere pelo histórico.');
        if(!ready.length) throw new Error('Você não possui itens concluídos pendentes de exportação.');
        data={id:p.batch_id,warehouse_code:args.p_warehouse,created_at:new Date().toISOString(),created_by:who,
          owner_id:owner,owner_name:actors[owner].name,export_mode:p.mode||'SELF',export_state:'RESERVED',format_version:2,
          file_name:`REPOSICAO_${args.p_warehouse}_${actors[owner].name.toUpperCase()}_DEMONSTRACAO.xlsx`,
          requests:ready.map(x=>({id:x.request_id,codigo_material:x.codigo_material,quantidade_atendida:x.quantity,status:'CONCLUIDO',warehouse_code:args.p_warehouse,fulfillment_ids:[x.id]}))};
        ready.forEach(x=>{x.batch=data.id;});batches.push(data);break;
      }
      case 'CONFIRM': data=batches.find(b=>b.id===p.batch_id);data.export_state='CONFIRMED';break;
      case 'RELEASE': data=batches.find(b=>b.id===p.batch_id);data.export_state='RELEASED';portions.filter(x=>x.batch===p.batch_id).forEach(x=>{x.batch=null;});break;
      case 'DOWNLOAD': data=batches.find(b=>b.id===p.batch_id);break;
      default: throw new Error('Ação inesperada');
    }
    return {data:window.structuredClone(data)};
  } catch(error) { return {error:{message:error.message}}; }
} };
const controller=createOwnerExport({root:document.getElementById('previewExport'),db:()=>client,
  context:()=>({user:actors[who],warehouse,authId:who})});
document.getElementById('previewActor').addEventListener('change',async event=>{who=event.target.value;await controller.refresh();});
document.getElementById('previewWarehouse').addEventListener('change',async event=>{warehouse=event.target.value;await controller.refresh();});
await controller.refresh();
