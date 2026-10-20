import { createElement, Package, ClipboardList, PackageOpen, ArrowLeftRight, ChartNoAxesColumnIncreasing, Search, SlidersHorizontal, TriangleAlert, FileText, History, RefreshCw } from "lucide";
import { escapeHtml as e } from "./utils.js";
import "./reference-control.css";

const number=value=>Number(value||0).toLocaleString("pt-BR");
const sum=(rows,field,statuses)=>rows.filter(row=>!statuses||statuses.includes(row.status)).reduce((total,row)=>total+Number(row[field]||0),0);
const colors={blue:"#2D91EE",green:"#27B45B",red:"#F45258",yellow:"#FFC83D",orange:"#F59E0B",gray:"#AEB8C5"};
const icons={stocks:Package,tasks:ClipboardList,replenishment:PackageOpen,transfers:ArrowLeftRight,otd:ChartNoAxesColumnIncreasing,attention:TriangleAlert,running:FileText,activity:History};
function decorate(node){node.querySelectorAll("[data-ref-icon]").forEach(target=>{if(!target.firstChild)target.append(createElement(icons[target.dataset.refIcon]||Package,{width:24,height:24,"aria-hidden":"true"}));});}
function panel(id,title,icon,action=""){
  return `<section class="ref-panel" data-ref-panel="${id}"><header><h3>${icon?`<span data-ref-icon="${icon}"></span>`:""}${title}</h3>${action}</header><div data-ref-body="${id}"></div></section>`;
}
const link=(label,action)=>`<button type="button" class="ref-text-action" data-ref-action="${action}">${label}<span aria-hidden="true">›</span></button>`;

export function mountReferenceControl(root,{showStocks,showActivity,openTask,loadTrend}){
  root.classList.add("reference-control");
  const title=root.querySelector(".page-title");
  title.classList.add("ref-header");
  title.querySelector("h2").textContent="Gestão Operacional";
  const subtitle=document.createElement("p");subtitle.className="ref-subtitle";subtitle.textContent="Central de Controle - CP Álamo";title.querySelector("h2").after(subtitle);
  const mark=document.createElement("span");mark.className="ref-brand-icon";mark.append(createElement(Package,{width:44,height:44,"aria-hidden":"true"}));title.prepend(mark);
  const period=root.querySelector('[data-filter="period"]');
  const periodLabel=period.closest("label");
  period.setAttribute("aria-label","Período do dashboard");period.value="today";title.append(period);
  periodLabel.remove();
  const search=document.createElement("button");search.type="button";search.className="ref-search";search.title="Pesquisar estoque";search.setAttribute("aria-label","Pesquisar estoque");search.append(createElement(Search,{width:26,height:26,"aria-hidden":"true"}));search.addEventListener("click",()=>{showStocks();root.querySelector("[data-board-search]").focus({preventScroll:true});});title.append(search);
  const filter=title.querySelector(".compact-filter-open");filter.replaceChildren(createElement(SlidersHorizontal,{width:26,height:26,"aria-hidden":"true"}));title.append(filter);
  const refresh=title.querySelector("[data-global-refresh]");refresh.textContent="";refresh.title="Atualizar dados";refresh.setAttribute("aria-label","Atualizar dados");refresh.append(createElement(RefreshCw,{width:20,height:20,"aria-hidden":"true"}));
  root.querySelector(".compact-filter-drawer").append(refresh);
  const overview=root.querySelector("[data-global-overview]");
  const primary=root.querySelector("[data-global-metrics]");
  const grid=document.createElement("div");grid.className="ref-grid";
  grid.innerHTML=panel("stockDonut","Situação dos Estoques")+panel("taskDonut","Status das Tarefas")+panel("replenishment","Reposições")+panel("transfers","Transferências")+panel("attention","Estoques em atenção","attention",link("Ver todos","stocks"))+panel("running","Tarefas em andamento","running",link("Ver todas","tasks"))+panel("activity","Últimas atividades","activity",link("Ver todas","activity"))+panel("trend","Evolução operacional","",'<select data-ref-trend-period aria-label="Período da evolução"><option value="7">Últimos 7 dias</option><option value="1">Hoje</option><option value="15">Últimos 15 dias</option><option value="30">Últimos 30 dias</option><option value="custom">Personalizado</option></select>');
  primary.after(grid);
  const secondary=root.querySelector(".compact-secondary");
  secondary.prepend(root.querySelector("[data-global-board]"));
  secondary.append(root.querySelector("[data-global-activity]").closest("section"));
  decorate(grid);
  for(const id of ["stockDonut","taskDonut","replenishment","transfers","trend"]){
    const node=grid.querySelector(`[data-ref-body="${id}"]`);
    node.innerHTML=`<div class="ref-chart-layout ${id.endsWith("Donut")?'ref-donut-layout':''}"><div class="ref-canvas"><canvas role="img" aria-label="${e(grid.querySelector(`[data-ref-panel="${id}"] h3`).textContent)}"></canvas></div><div class="ref-legend"></div></div><p class="ref-chart-message" role="status">Carregando dados…</p>`;
  }
  const custom=document.createElement("div");custom.className="ref-custom-period";custom.hidden=true;custom.innerHTML='<label>De<input type="date" data-ref-since></label><label>Até<input type="date" data-ref-until></label><button type="button" data-ref-custom-apply>Aplicar</button>';
  grid.querySelector('[data-ref-panel="trend"] header').after(custom);
  let state=null,taskRows=null,taskError=false,events=null,trend=null,trendError=false,frame=0,revision=0;
  const charts=new Map();let chartModule;
  const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const centerPlugin={id:"referenceCenter",afterDraw(chart){
    const area=chart.chartArea;if(!area)return;const {ctx}=chart;ctx.save();ctx.fillStyle=document.documentElement.classList.contains("compact-dark")?"#ECF3FC":"#0B1E3B";ctx.textAlign="center";
    if(chart.config.type==="doughnut"){
      const x=(area.left+area.right)/2,y=(area.top+area.bottom)/2;ctx.font="700 28px Arial";ctx.fillText(chart.options.plugins.referenceCenter.value,x,y+1);ctx.font="12px Arial";ctx.fillStyle=document.documentElement.classList.contains("compact-dark")?"#C2CDDC":"#667085";ctx.fillText(chart.options.plugins.referenceCenter.label,x,y+23);
    }else if(chart.config.type==="bar"){
      ctx.font="600 12px Arial";chart.getDatasetMeta(0).data.forEach((bar,index)=>{ctx.fillText(number(chart.data.datasets[0].data[index]),bar.x,Math.max(area.top+12,bar.y-6));});
    }
    ctx.restore();
  }};
  async function chart(id,type,labels,sets,center,loaded=true){
    const panel=grid.querySelector(`[data-ref-body="${id}"]`),message=panel.querySelector(".ref-chart-message");
    if(!panel.getClientRects().length)return;
    const valid=loaded&&sets.some(set=>set.data.some(value=>value!=null));
    message.textContent=!loaded?"Dados indisponíveis ou carregando…":!valid?"Sem movimentação no período.":"";
    const ticket=revision;
    chartModule ||= import("chart.js/auto");
    let Chart;
    try{({default:Chart}=await chartModule);}catch{message.textContent="Não foi possível carregar os gráficos. Atualize para tentar novamente.";return;}
    if(ticket!==revision)return;
    const dark=document.documentElement.classList.contains("compact-dark");
    const config={type,data:{labels,datasets:sets},plugins:[centerPlugin],options:{
      responsive:true,maintainAspectRatio:false,animation:reduced?false:{duration:250},color:dark?"#D5E0EE":"#667085",
      plugins:{legend:{display:false},tooltip:{enabled:true},referenceCenter:{value:center?.value??"",label:center?.label??""}}
    }};
    if(type==="doughnut"){config.options.cutout="68%";config.options.borderWidth=0;}
    else config.options.scales={y:{beginAtZero:true,ticks:{precision:0,color:dark?"#BDCADB":"#667085"},grid:{color:dark?"#354353":"#EDF0F5"},border:{display:false}},x:{ticks:{color:dark?"#BDCADB":"#667085"},grid:{display:false},border:{color:dark?"#354353":"#E6EBF2"}}};
    const existing=charts.get(id);if(existing){existing.data=config.data;existing.options=config.options;existing.resize();existing.update("none");}else charts.set(id,new Chart(panel.querySelector("canvas"),config));
  }
  function legend(id,entries,total){grid.querySelector(`[data-ref-body="${id}"] .ref-legend`).innerHTML=entries.map(([label,value,color])=>`<div><i style="background:${color}"></i><span>${e(label)}</span><strong>${number(value)}${total==null?"":` <small>(${total?Math.round(value/total*100):0}%)</small>`}</strong></div>`).join("");}
  function donut(id,entries,label,loaded){const total=entries.reduce((n,row)=>n+row[1],0);legend(id,entries,total);chart(id,"doughnut",entries.map(row=>row[0]),[{data:loaded?entries.map(row=>row[1]):[],backgroundColor:entries.map(row=>row[2]),hoverOffset:4}],{value:loaded?number(total):"—",label},loaded);}
  function bars(id,rows,loaded){chart(id,"bar",["Pendentes","Em separação","Concluídas"],[{label:id==="transfers"?"Transferências":"Reposições",data:loaded?[sum(rows,"open",id==="transfers"?["PENDENTE","ATRIBUIDA","ATRIBUIDO"]:["PENDENTE","ATRIBUIDO"]),sum(rows,"open",["EM_SEPARACAO"]),sum(rows,"finished_today",id==="transfers"?["FINALIZADA"]:["CONCLUIDO"])]:[],backgroundColor:id==="transfers"?"#6049A5":colors.green,borderRadius:4,maxBarThickness:36}],null,loaded);}
  function render(){
    if(!state)return;revision++;
    const {snapshot:s,board}=state,t=s.tasks?.summary||[],r=s.replenishment?.summary||[],tr=s.transfers?.summary||[];
    const critical=board.filter(w=>!w.unknown&&w.attention==="CRITICO").length,normal=board.filter(w=>!w.unknown&&w.attention==="NORMAL").length,attention=board.filter(w=>!w.unknown&&w.attention==="ATENCAO").length;
    const cards=[
      ["stocks","Estoques",s.warehouses.length,`${critical} críticos`,`${normal} normais`,"overview",true],
      ["tasks","Tarefas",sum(t,"open"),`${number(sum(t,"overdue"))} atrasadas`,`${number(sum(t,"open",["EM_ANDAMENTO"]))} em andamento`,"tasks",!!s.tasks],
      ["replenishment","Reposições",sum(r,"open"),`${number(sum(r,"open",["PENDENTE","ATRIBUIDO"]))} pendentes`,`${number(sum(r,"finished_today",["CONCLUIDO"]))} concluídas`,"replenishment",!!s.replenishment],
      ["transfers","Transferências",sum(tr,"open"),`${number(sum(tr,"open",["PENDENTE","ATRIBUIDO","ATRIBUIDA"]))} pendentes`,`${number(sum(tr,"finished_today",["FINALIZADA"]))} concluídas`,"transfers",!!s.transfers],
      ["otd","OTD",null,"Sem medição","","tasks",false]
    ];
    primary.innerHTML=cards.map(([id,label,value,line1,line2,domain,loaded])=>`<button type="button" class="ref-kpi ref-${id}" ${id==="stocks"?'data-ref-action="stocks"':`data-jump="${domain}"`} ${id==="otd"?'title="A consulta atual não fornece o indicador de entregas no prazo"':""}><span class="ref-kpi-heading"><span data-ref-icon="${id}"></span>${label}</span><strong>${loaded?number(value):"—"}</strong><span class="ref-kpi-line">${loaded||id==="otd"?e(line1):s.errors[domain]?"Indisponível":"Carregando…"}</span><span class="ref-kpi-line ref-positive">${loaded?e(line2):""}</span></button>`).join("");decorate(primary);
    const stockEntries=[["Críticos",critical,colors.red],["Atenção",attention,colors.yellow],["Normais",normal,colors.green]];
    const unknown=board.filter(w=>w.unknown).length;if(unknown)stockEntries.push(["Sem dados",unknown,colors.gray]);
    donut("stockDonut",stockEntries,"estoques",board.length>0);
    const running=sum(t,"open",["EM_ANDAMENTO"]),late=sum(t,"overdue"),done=sum(t,"finished_today",["CONCLUIDA"]);
    const runningLate=sum(t,"overdue",["EM_ANDAMENTO"]);
    donut("taskDonut",[["Em andamento",Math.max(0,running-runningLate),colors.blue],["Pendentes",Math.max(0,sum(t,"open")-running-late+runningLate),colors.gray],["Concluídas",done,colors.green],["Atrasadas",late,colors.red]],"tarefas",!!s.tasks);
    bars("replenishment",r,!!s.replenishment);bars("transfers",tr,!!s.transfers);
    const important=board.filter(w=>["CRITICO","ATENCAO"].includes(w.attention)).slice(0,2);
    grid.querySelector('[data-ref-body="attention"]').innerHTML=important.map(w=>`<button class="ref-record" type="button" data-board-record="${e(w.code)}"><span class="ref-record-icon" data-ref-icon="stocks"></span><span><strong>${e(w.name)}</strong><small>${number(w.pending)} reposições • ${number(w.transfers)} transferências</small></span><span class="ref-badge ${w.attention=== "CRITICO"?'ref-critical':'ref-warning'}">${w.attention==="CRITICO"?"Crítico":"Atenção"}</span><span aria-hidden="true">›</span></button>`).join("")||'<p class="ref-empty">Nenhum estoque em atenção nos dados disponíveis.</p>';
    grid.querySelector('[data-ref-body="running"]').innerHTML=taskRows?.length?taskRows.slice(0,2).map((task,index)=>`<button type="button" class="ref-record" data-ref-task="${index}"><span class="ref-record-icon" data-ref-icon="running"></span><span><strong>${e(task.code||task.id)}</strong><small>${e(task.title||task.kind||"")}</small></span><span class="ref-badge ref-running">Em andamento</span><span aria-hidden="true">›</span></button>`).join(""):`<p class="ref-empty">${taskError?"Não foi possível carregar as tarefas.":taskRows?"Nenhuma tarefa em andamento.":"Carregando tarefas…"}</p>`;
    renderActivity();renderTrend();decorate(grid);
  }
  function renderActivity(){grid.querySelector('[data-ref-body="activity"]').innerHTML=events?.length?'<ol class="ref-timeline">'+events.slice(0,4).map((row,index)=>`<li style="--event-color:${[colors.blue,"#6049A5",colors.green,colors.orange][index]}"><time>${e(new Date(row.updated_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}))}</time><span data-ref-icon="${row.kind==="TRANSFERENCIA"?'transfers':row.kind==="IMPORTACAO"?'stocks':'tasks'}"></span><div><strong>${e(row.title||row.kind||"Atividade")}</strong><small>${e([row.code,row.responsible_name,row.warehouse_code].filter(Boolean).join(" • "))}</small></div></li>`).join("")+'</ol>':`<p class="ref-empty">${events?"Nenhuma atividade no período.":"Carregando atividades…"}</p>`;decorate(grid);}
  function renderTrend(){const rows=trend?.trends||[];const days=[...new Set(rows.map(row=>row.day))].sort();const sets=[["Tarefas concluídas","tasks",colors.green,"finished"],["Reposições","replenishment",colors.blue,"created"],["Transferências","transfers",colors.orange,"created"]].map(([label,domain,color,metric])=>({label,data:days.map(day=>rows.filter(row=>row.day===day&&row.domain===domain).reduce((n,row)=>n+Number(row[metric]||0),0)),borderColor:color,backgroundColor:color,pointRadius:3,borderWidth:2,tension:.2}));legend("trend",sets.map(set=>[set.label,0,set.borderColor]),null);grid.querySelectorAll('[data-ref-body="trend"] .ref-legend strong').forEach(node=>node.remove());chart("trend","line",days.map(day=>new Date(day+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})),sets,null,!!trend&&!trendError);}
  root.addEventListener("click",event=>{const button=event.target.closest("button");if(!button)return;if(button.dataset.refAction==="stocks")showStocks();if(button.dataset.refAction==="activity")showActivity();if(button.dataset.refAction==="tasks")root.querySelector('[data-global-tab="tasks"]').click();if(button.hasAttribute("data-ref-task"))openTask(taskRows[Number(button.dataset.refTask)]);});
  let trendRequest=0;
  async function refreshTrend(){
    const request=++trendRequest,period=grid.querySelector("[data-ref-trend-period]").value;custom.hidden=period!=="custom";
    const until=new Date();let since=new Date(until);since.setDate(since.getDate()-Number(period||7)+1);since.setHours(0,0,0,0);
    if(period==="custom"){const from=custom.querySelector("[data-ref-since]").value,to=custom.querySelector("[data-ref-until]").value;if(!from||!to)return;since=new Date(from+"T00:00:00");until.setTime(new Date(to+"T23:59:59").getTime());}
    if(since>until||until-since>31*86400000){grid.querySelector('[data-ref-body="trend"] .ref-chart-message').textContent="Selecione um intervalo válido de até 30 dias.";return;}
    try{const result=await loadTrend({since:since.toISOString(),until:until.toISOString()});if(request!==trendRequest)return;trend=result;trendError=false;}
    catch{if(request!==trendRequest)return;trend=null;trendError=true;}
    schedule();
  }
  grid.querySelector("[data-ref-trend-period]").addEventListener("change",refreshTrend);custom.querySelector("[data-ref-custom-apply]").addEventListener("click",refreshTrend);
  new window.MutationObserver(()=>{if(state)schedule();}).observe(document.documentElement,{attributes:true,attributeFilter:["class"]});
  function schedule(){window.cancelAnimationFrame(frame);frame=window.requestAnimationFrame(render);}
  return {render(snapshot,board){state={snapshot,board};schedule();},tasks(rows,error=false){taskRows=rows;taskError=error;schedule();},activity(rows,error=false){events=rows;renderActivity();if(error)grid.querySelector('[data-ref-body="activity"]').textContent="Atividades indisponíveis. Atualize para tentar novamente.";},refreshTrend,stop(){revision++;trendRequest++;state=null;taskRows=null;events=null;trend=null;window.cancelAnimationFrame(frame);charts.forEach(chart=>chart.destroy());charts.clear();}};
}
