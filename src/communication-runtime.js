import {createCommunicationApi,createCommunicationRealtime} from './communication-api.js';
import {createTaskSound} from './task-sound.js';
import {setCommunicationPush} from './communication-media.js';
export function createCommunicationRuntime({client,getUser,getWarehouse,root,onBadge,onToast,onOpenProcess,isOpen}){
 const actor=getUser().id,warehouse=getWarehouse();let stopped=false,view=null,preferences={sound_enabled:false,volume:0.5},unread=0,initialized=false,connectionState='Sincronizando…';
 const current=()=>!stopped&&getUser()?.id===actor&&getWarehouse()===warehouse;
 const api=createCommunicationApi({client,warehouse,isCurrent:current});
 const sound=createTaskSound({getUser:()=>current()?actor:'',storage:window.localStorage,key:'wms_communication_sound_v1',createContext:()=>new (window.AudioContext||window.webkitAudioContext)()});
 async function refresh(){
  if(!current())return;
  const count=await api.rpc('UNREAD');if(!current())return;
  onBadge(count.count);
  if(initialized&&count.count>unread&&(!isOpen()||document.visibilityState==='hidden')){
   const recent=await api.rpc('LIST'),conversation=recent.find(c=>c.unread>0);
   const muted=conversation?.muted_until&&new Date(conversation.muted_until)>new Date();
   if(!muted&&current())onToast('Nova mensagem na Comunicação'+(conversation?' — '+(conversation.display_name||conversation.title):''),conversation?.id);
   const settings=preferences,parts=new Intl.DateTimeFormat('en-GB',{timeZone:settings.timezone||'America/Cuiaba',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
   const minutes=Number(parts.find(p=>p.type==='hour')?.value)*60+Number(parts.find(p=>p.type==='minute')?.value);
   const quiet=settings.quiet_start!=null&&(settings.quiet_start<=settings.quiet_end?minutes>=settings.quiet_start&&minutes<settings.quiet_end:minutes>=settings.quiet_start||minutes<settings.quiet_end);
   if(settings.sound_enabled&&!quiet&&!muted){sound.set({enabled:true,volume:settings.volume});void sound.play(conversation?.urgent_unread?'replenishment':'task');}
  }
  unread=count.count;initialized=true;
  if(view)await view.refresh();
 }
 const realtime=createCommunicationRealtime({client,warehouse,actor,onSync:refresh,onState:state=>{connectionState=state;view?.connection(state);}});
 const online=()=>{void refresh().catch(()=>view?.connection('Offline — texto preservado nesta sessão'));};
 window.addEventListener('online',online);
 window.addEventListener('offline',online);
 void api.rpc('PREFERENCES').then(value=>{if(current())preferences=value;}).catch(()=>{});
 void refresh().catch(()=>onBadge(0));
 let heartbeat=null;
 async function show(options={}){
  if(!current())return;
  if(!view){
   const module=await import('./communication-view.js');if(!current())return;
   view=module.mountCommunication({root,api,actor,warehouse,getUser,current,onOpenProcess,onPreferences:p=>{preferences=p;sound.set({enabled:p.sound_enabled,volume:p.volume});}});
   view.connection(connectionState);
  }
  await view.open(options);
 }
 function setActive(active){
  if(!view)return;
  view.setActive(active&&document.visibilityState==='visible');
  if(heartbeat)window.clearInterval(heartbeat);
  heartbeat=active?window.setInterval(()=>{void view?.setActive(document.visibilityState==='visible').catch(()=>{});},60000):null;
 }
 const visibility=()=>setActive(isOpen());document.addEventListener('visibilitychange',visibility);
 return {show,setActive,refresh,share:async process=>{await show({share:process});},async dispose({unsubscribe=false}={}){
  if(stopped)return;
  // Release this account's active-conversation hint before invalidating the context.
  await view?.setActive(false).catch(()=>{});
  if(unsubscribe)await setCommunicationPush(api,false).catch(()=>{});
  stopped=true;realtime.close();sound.stop();if(heartbeat)window.clearInterval(heartbeat);
  window.removeEventListener('online',online);window.removeEventListener('offline',online);document.removeEventListener('visibilitychange',visibility);
  view?.dispose();root.replaceChildren();onBadge(0);
 }};
}
