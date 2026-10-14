// DEMO_ONLY: this module has no database, Storage, notification or inventory client.
export const FEATURE_DEMO_MODE = false;
const clone=value=>JSON.parse(JSON.stringify(value));
export const DEMO_TRANSFER_STAGES = ["AGUARDANDO_SEPARACAO","EM_SEPARACAO","SEPARACAO_CONCLUIDA","MONTAGEM_CAIXA_CONCLUIDA","PRONTA_PARA_NOTA","NF_ANEXADA","LIBERADA_PARA_ENVIO","DESPACHADA","RECEBIDA","FINALIZADA"];
export const DEMO_REPLENISHMENT_STAGES = ["PENDENTE","EM_SEPARACAO","SEPARADO","CONCLUIDO"];

export function loadDemoScenario(warehouseReference = "UNIDADE DEMO") {
  return {
    is_demo:true,warehouseReference,created:false,startedAt:null,
    transfer:{id:"DEMO-COMPRAS-001",is_demo:true,origin:"COMPRAS",destination:"DESTINO DEMO",status:"AGUARDANDO_SEPARACAO",boxes:2,pdf:null,invoiceNumber:"DEMO-000001",timeline:[],
      items:[{is_demo:true,sku:"01302",name:"Produto DEMO 01",requested:4,separated:0,checked:0},
        {is_demo:true,sku:"84390",name:"Produto DEMO 02",requested:3,separated:0,checked:0},
        {is_demo:true,sku:"94137",name:"Produto DEMO 03",requested:2,separated:0,checked:0}]},
    replenishment:{id:"REP-DEMO-001",is_demo:true,sku:"01302",requested:2,attended:0,status:"PENDENTE",startedAt:null,finishedAt:null,responsible:"Colaborador DEMO",timeline:[]},
    reverse:[12,20,40].map((boxes,i)=>({id:`GDV-DEMO-2026-00${i+1}`,is_demo:true,gdv:`GDV-DEMO-2026-00${i+1}`,nfe:`NFE-DEMO-00${i+1}`,boxes,status:"ENVIADA"})),
    target:{is_demo:true,month:"2026-10",boxes:100},notifications:[]
  };
}

export function getDemoDashboardSummary(scenario) {
  if (!scenario?.is_demo) throw new Error("Somente dados DEMO.");
  const transfer=scenario.transfer;
  const requested=transfer.items.reduce((n,i)=>n+i.requested,0);
  const separated=transfer.items.reduce((n,i)=>n+i.separated,0);
  const checked=transfer.items.reduce((n,i)=>n+i.checked,0);
  const realized=scenario.reverse.filter(r=>r.is_demo && ["ENVIADA","RECEBIDA","CONCLUIDA"].includes(r.status)).reduce((n,r)=>n+r.boxes,0);
  return {open:transfer.status==="FINALIZADA"?0:1,awaitingInvoice:["PRONTA_PARA_NOTA","NF_ANEXADA"].includes(transfer.status)?1:0,
    divergence:DEMO_TRANSFER_STAGES.indexOf(transfer.status)>=1?requested-separated:0,replenishments:scenario.replenishment.status==="CONCLUIDO"?0:1,
    requested,separated,checked,realized,target:scenario.target.boxes,percent:scenario.target.boxes?realized/scenario.target.boxes*100:0,remaining:Math.max(0,scenario.target.boxes-realized)};
}

export function demoResponsibility(status) {
  if(["PRONTA_PARA_NOTA","NF_ANEXADA"].includes(status))return "COMPRAS DEMO";
  if(["LIBERADA_PARA_ENVIO","DESPACHADA","RECEBIDA"].includes(status))return "ESTOQUE / EXPEDICAO DEMO";
  if(status==="FINALIZADA")return "PROCESSO DEMO CONCLUIDO";
  return "ESTOQUE DEMO";
}

export function createDemoSession(getUser, now = ()=>new Date().toISOString()) {
  let enabled=FEATURE_DEMO_MODE,scenario=null;
  const admin=()=>getUser()?.role==="ADMINISTRADOR";
  function assertDemo(record) {
    if(!enabled || !admin() || !scenario?.is_demo || (record && !record.is_demo))throw new Error("Acao exclusiva do administrador em MODO DEMO.");
  }
  function event(target,label) {target.timeline.push({is_demo:true,label,time:now(),actor:demoResponsibility(target.status)});}
  return {
    isDemoMode:()=>enabled && admin(),
    activate(warehouseReference){if(!admin())throw new Error("Somente ADMINISTRADOR pode ativar DEMO.");enabled=true;scenario=loadDemoScenario(warehouseReference);return scenario;},
    deactivate(){enabled=false;scenario=null;},
    getScenario(){assertDemo();return clone(scenario);},
    resetDemoScenario(warehouseReference){assertDemo();scenario=loadDemoScenario(warehouseReference || scenario.warehouseReference);return clone(scenario);},
    setWarehouseReference(code,allowed){assertDemo();if(!allowed.includes(code))throw new Error("Unidade nao autorizada.");if(scenario.created)throw new Error("Resete a DEMO para trocar a unidade de referencia.");scenario.warehouseReference=code;},
    createDemoTransfer(){assertDemo(scenario.transfer);if(scenario.created)return;scenario.created=true;event(scenario.transfer,"Criada por Compras DEMO");},
    setInvoiceNumber(number){assertDemo(scenario.transfer);if(scenario.transfer.status!=="PRONTA_PARA_NOTA")throw new Error("NF DEMO fora da etapa permitida.");const value=String(number || "").trim();if(!value || value.length>120)throw new Error("Informe o numero da NF DEMO.");scenario.transfer.invoiceNumber=value;},
    attachDemoPdf(name,source="SIMULADO"){assertDemo(scenario.transfer);if(scenario.transfer.status!=="PRONTA_PARA_NOTA")throw new Error("Disponibilize para NF primeiro.");scenario.transfer.pdf={is_demo:true,name,source};scenario.transfer.status="NF_ANEXADA";event(scenario.transfer,source==="SIMULADO"?"PDF DEMO anexado - simulacao local":"PDF DEMO local - sem upload");},
    advanceDemoTransfer(){
      assertDemo(scenario.transfer);const t=scenario.transfer;
      if(!scenario.created){scenario.created=true;event(t,"Criada por Compras DEMO");return t.status;}
      if(t.status==="PRONTA_PARA_NOTA")throw new Error("Liberacao bloqueada: anexe ou simule um PDF DEMO.");
      if(t.status==="NF_ANEXADA" && !t.pdf)throw new Error("PDF DEMO obrigatorio.");
      const next=DEMO_TRANSFER_STAGES[DEMO_TRANSFER_STAGES.indexOf(t.status)+1];if(!next)return t.status;
      t.status=next;
      if(next==="EM_SEPARACAO") {scenario.startedAt=now();t.items.forEach((item,i)=>{item.separated=[4,3,1][i];});event(t,"Separacao iniciada - Colaborador DEMO");}
      else if(next==="SEPARACAO_CONCLUIDA") {t.items.forEach(i=>{i.checked=i.separated;});event(t,"Separacao concluida");event(t,"Conferencia concluida - 8 unidades, divergencia de 1");}
      else if(next==="MONTAGEM_CAIXA_CONCLUIDA")event(t,"2 caixas DEMO montadas");
      else if(next==="PRONTA_PARA_NOTA") {event(t,"Disponivel para NF");scenario.notifications.push({is_demo:true,message:"Compras DEMO foi notificado localmente."});}
      else if(next==="LIBERADA_PARA_ENVIO") {event(t,"NF concluida - liberada para envio");scenario.notifications.push({is_demo:true,message:"Estoque / Expedicao DEMO recebeu a liberacao local."});}
      else event(t,({DESPACHADA:"Despachada",RECEBIDA:"Recebida",FINALIZADA:"Concluida"})[next]);
      return t.status;
    },
    advanceDemoReplenishment(){assertDemo(scenario.replenishment);const r=scenario.replenishment;const next=DEMO_REPLENISHMENT_STAGES[DEMO_REPLENISHMENT_STAGES.indexOf(r.status)+1];if(!next)return r.status;r.status=next;
      if(next==="EM_SEPARACAO")r.startedAt=now();if(next==="SEPARADO")r.attended=2;if(next==="CONCLUIDO")r.finishedAt=now();event(r,next);return r.status;},
    createDemoReverseLogistics(){assertDemo();return clone(scenario.reverse);}
  };
}
