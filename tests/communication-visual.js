import {createCommunicationRuntime} from '../src/communication-runtime.js';
import {installHtmlSecurity} from '../src/utils.js';
installHtmlSecurity();
let actor='admin',runtime;
const profiles={admin:{id:'admin',name:'Administrador',role:'ADMINISTRADOR'},op:{id:'op',name:'Operador',role:'OPERADOR'},cash:{id:'cash',name:'Caixa',role:'CAIXA'},sup:{id:'sup',name:'Supervisor',role:'SUPERVISOR'},other:{id:'other',name:'Outra unidade',role:'OPERADOR'}};
const warehouse=()=>actor==='other'?'VDAR':'VDCG';
async function post(path,data){
 try{const response=await fetch('http://127.0.0.1:4193'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({actor,...data})});return await response.json();}
 catch(error){return {error:{message:error.message}};}
}
const client={
 rpc:(_name,args)=>post('/rpc',{warehouse:args.p_warehouse,action:args.p_action,data:args.p_data}),
 functions:{invoke:(_name,args)=>post('/edge',{data:args.body})},
 storage:{from:()=>({upload:async(path,blob)=>{
  const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
  return post('/upload',{path,type:blob.type,bytes:window.btoa(binary)});
 }})},
 channel:()=>{
  let event,state,stream;const channel={on(_kind,_filter,callback){event=callback;return channel;},subscribe(callback){state=callback;stream=new window.EventSource('http://127.0.0.1:4193/events');stream.onopen=()=>state('SUBSCRIBED');stream.onmessage=()=>event?.();stream.onerror=()=>state('CHANNEL_ERROR');return channel;},close(){stream?.close();}};return channel;
 },
 removeChannel:channel=>{channel.close();return Promise.resolve();}
};
async function mount(){
 await runtime?.dispose();
 document.querySelector('#identity').textContent=profiles[actor].name+' · '+warehouse();
 runtime=createCommunicationRuntime({client,getUser:()=>profiles[actor],getWarehouse:warehouse,root:document.querySelector('#communication'),isOpen:()=>true,
  onBadge:count=>{document.querySelector('#badge').textContent='Não lidas: '+count;},
  onToast:text=>{document.querySelector('#status').textContent=text;},
  onOpenProcess:async process=>{document.querySelector('#process').textContent=JSON.stringify(process,null,2);}
 });
 await runtime.show();runtime.setActive(true);
}
document.querySelectorAll('[data-actor]').forEach(button=>button.onclick=async()=>{await runtime?.dispose();actor=button.dataset.actor;await mount();});
document.querySelector('#testImage').onclick=()=>{
 const input=document.querySelector('[data-images]');if(!input)return;
 const canvas=document.createElement('canvas');canvas.width=160;canvas.height=100;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,160,100);ctx.fillStyle='black';ctx.fillText('Evidência sintética',10,50);
 canvas.toBlob(blob=>{const transfer=new window.DataTransfer();transfer.items.add(new window.File([blob],'evidencia-teste.png',{type:'image/png'}));input.files=transfer.files;input.dispatchEvent(new window.Event('change',{bubbles:true}));canvas.width=canvas.height=1;});
};
void mount().catch(error=>{document.querySelector('#status').textContent=error.message;});
