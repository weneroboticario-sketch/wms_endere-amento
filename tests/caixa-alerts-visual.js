import shell from '../index.html?raw';
import { initializeWmsMobile } from '../src/wms-mobile.js';
import { createCaixaAlerts } from '../src/caixa-alerts.js';
import { mountCaixaRequests } from '../src/caixa-entry.js';

const parsed = new DOMParser().parseFromString(shell,'text/html');
document.body.replaceChildren(...parsed.body.childNodes); document.body.className='auth-unlocked';
document.getElementById('loginShell').hidden=true;
let rows=[],active=true,openCount=0,sounds=0,vibrations=0;
const $=id=>document.getElementById(id);
function navigate(id) {
  document.querySelectorAll('.screen').forEach(node=>{node.hidden=node.id!==id;node.classList.toggle('active',node.id===id);});
  if(id==='atendimentosCaixa') {
    $('caixaRequestsRoot').hidden=false;
    mountCaixaRequests($('caixaRequestsRoot'),{client,actor:'fixture-stock',role:'OPERADOR',warehouse:'VDCG',isCurrent:()=>active,attendanceFeed:alerts.feed,focusRequest:()=>$('caixaRequestsRoot').dataset.targetRequest,focusedRequest:()=>delete $('caixaRequestsRoot').dataset.targetRequest});
  }
}
const client={rpc:async name=>name==='list_wms_caixa_attendance'?{data:rows}:name==='list_wms_caixa_unread'?{data:[]}:{data:[]}};
const alerts=createCaixaAlerts({client,actor:'fixture-stock',role:'OPERADOR',warehouse:'VDCG',isCurrent:()=>active,allowRealtime:false,
  onCount:n=>{$('caixaPendingCount').textContent=String(n);$('caixaPendingCount').hidden=!n;},onError:error=>console.error(error),
  onOpen:async id=>{openCount++;$('caixaRequestsRoot').dataset.targetRequest=id;navigate('atendimentosCaixa');$('caixaRequestsRoot').caixaReveal?.(id);},
  onSound:()=>{sounds++;},vibrate:()=>{vibrations++;}
});
alerts.mountSettings($('caixaAlertSettings'));
initializeWmsMobile({navigate,canAccess:id=>!['globalDashboard','stockOverview'].includes(id),isAuthenticated:()=>active});
document.querySelectorAll('[data-screen],[data-screen-target]').forEach(button=>button.onclick=()=>navigate(button.dataset.screen||button.dataset.screenTarget));
navigate('reposicao');
await alerts.feed.read();
window.caixaAlertFixture={
  async add(id,extra={}) { rows=[{id,sku:'01314',product_name:'Produto demonstrativo · etiqueta 200 ml',kind:'ADJUSTMENT',warehouse_code:'VDCG',requested_by:'fixture-cashier',quantity:2,status:'PENDENTE',customer_service:false,created_at:new Date().toISOString(),...extra},...rows];await alerts.feed.read(); },
  refresh:()=>alerts.feed.read(),navigate,
  camera(){const dialog=document.createElement('dialog');dialog.id='fixture-camera';dialog.innerHTML='<video aria-label="Prévia da câmera"></video><button type="button">Fechar câmera</button>';dialog.querySelector('button').onclick=()=>dialog.close();document.body.append(dialog);dialog.showModal();},
  close(){active=false;alerts.close();},
  stats:()=>({openCount,sounds,vibrations,rows:rows.length}),ready:true
};
