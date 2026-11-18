import { PGlite } from '@electric-sql/pglite';
import bootstrap from './demo-bootstrap.sql?raw';
import foundation from '../../supabase/migrations/20261118202204_wms_excellence_foundation.sql?raw';
import { mountExcellence } from '../../src/excellence/view.js';
import { readEvaluation, readTeamEvaluation } from '../../src/excellence/evaluation-service.js';
const db = new PGlite();
const root = document.getElementById('root'), actorInput = document.getElementById('actor'), notice = document.getElementById('notice');
let generation=0, queue=Promise.resolve();
const actors={admin:'1',sup:'2',op:'3',cash:'4',other:'5',att:'6',outsider:'7'};
async function asActor(actor){await db.exec('reset role');await db.query("select set_config('test.uid',$1,false)",['00000000-0000-4000-8000-'+actors[actor].padStart(12,'0')]);await db.exec('set role authenticated');}
const rpc=async(action,data={})=>(await db.query('select wms_excellence_api($1,$2,$3::jsonb) result',['VDCG',action,JSON.stringify(data)])).rows[0].result;
try {
 await db.exec(bootstrap);await db.exec(foundation);await asActor('admin');
 const cycle=await rpc('CREATE_CYCLE',{name:'Novembro 2026 · Demonstração',from:'2026-11-01',to:'2026-11-30'});await rpc('ENABLE',{cycle_id:cycle.id});await rpc('SYNC',{cycle_id:cycle.id});
 async function render(){
  const current=++generation,actor=actorInput.value;
  const service={rpc(action,data={}){
   const operation=queue.then(async()=>{await asActor(actor);return action==='DASHBOARD'?readEvaluation(rpc,data):action==='TEAM'?readTeamEvaluation(rpc,data):rpc(action,data);});
   queue=operation.catch(()=>{});
   return operation.then(result=>{if(current!==generation)throw Error('Perfil alterado.');return result;});
  }};
  try{await mountExcellence(root,{service,actorId:actor,leader:['admin','sup'].includes(actor),admin:actor==='admin'});}catch(error){if(current===generation)root.textContent=error.message;}
 }
 actorInput.onchange=render;
 document.getElementById('complete').onclick=async()=>{
  const button=document.getElementById('complete');button.disabled=true;
  const actor=actorInput.value;
  if(!['op','sup'].includes(actor)){notice.textContent='Selecione Guilherme ou Kauã para simular o atendimento.';button.disabled=false;return;}
  const operation=queue.then(async()=>{
   await db.exec('reset role');
   await db.query(`insert into wms_replenishment_requests(id,warehouse_code,codigo_material,status,solicitado_por_id,responsavel_id,claimed_by_id,claimed_at,started_at,finished_at,quantidade_solicitada,quantidade_atendida,quantidade_pendente,duration_seconds)
    values($1,'VDCG','88082','PENDENTE','cash',null,null,null,null,null,5,0,5,null) on conflict(id) do nothing`,['demo-'+actor]);
   await db.query("update wms_replenishment_requests set status='EM_SEPARACAO',responsavel_id=$1,claimed_by_id=$1,claimed_at='2026-11-18T12:00:00Z',started_at='2026-11-18T12:00:00Z' where id=$2",[actor,'demo-'+actor]);
   await db.query("update wms_replenishment_requests set status='CONCLUIDO',quantidade_atendida=5,quantidade_pendente=0,finished_at='2026-11-18T12:08:32Z',duration_seconds=512 where id=$1",['demo-'+actor]);
   await asActor('admin');await rpc('SYNC',{cycle_id:cycle.id});
  });queue=operation.catch(()=>{});
  try{await operation;notice.textContent='Reposição simulada concluída: SKU 88082 · 5 unidades · 8min32s. Abra Evidências e Ver origem.';await render();}catch(error){notice.textContent=error.message;}finally{button.disabled=false;}
 };
 notice.textContent='Banco de demonstração pronto. Dados locais e descartáveis. Nenhuma conexão ao Supabase de produção.';await render();
}catch(error){notice.textContent='Falha ao iniciar demonstração: '+error.message;}
