export function createCaixaLoader(load = () => import('./caixa-entry.js')) {
let loading;
const versions=new WeakMap();
return function mountCaixaRequests(host,context){
  const version=(versions.get(host)||0)+1;versions.set(host,version);
  const scope=context.actor+':'+context.warehouse+':'+context.role;
  if(host.dataset.scope!==scope){host.caixaStop?.();host.replaceChildren();const status=document.createElement('p');status.textContent='Carregando atendimento do caixa…';status.setAttribute('role','status');host.append(status);}
  loading ||= load().catch(error=>{loading=null;throw error;});
  loading.then(module=>{if(host.isConnected&&versions.get(host)===version&&context.isCurrent())module.mountCaixaRequests(host,context);}).catch(()=>{
    if(!host.isConnected||versions.get(host)!==version||!context.isCurrent())return;
    host.replaceChildren();const status=document.createElement('p');status.textContent='Não foi possível carregar o atendimento. Abra novamente Pedidos de Reposição para tentar outra vez.';status.setAttribute('role','status');host.append(status);
  });
};
}
export const mountCaixaRequests=createCaixaLoader();
