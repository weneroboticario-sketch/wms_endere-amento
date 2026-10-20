import { escapeHtml as esc } from "./utils.js";
import { captacaoFreshness, createGlobalDashboardService, GLOBAL_DASHBOARD_CONFIG, isGlobalView, warehouseAttention } from "./global-dashboard-service.js";
import "./global-dashboard.css";
import { decorateMetrics } from "./cpalamo-appearance.js";
import { installCompactControl } from "./compact-control.js";
import { mountReferenceControl } from "./reference-control.js";

const labels = { overview: "Visão Geral", tasks: "Tarefas", replenishment: "Reposição", transfers: "Transferências", captacao: "Importações", team: "Equipe", alerts: "Alertas" };
const states = { NORMAL: "Normal", ATENCAO: "Atenção", CRITICO: "Crítico", ATUALIZADO: "Atualizada", DESATUALIZADO: "Desatualizada", ERRO: "Falha", SEM_DADOS: "Sem dados" };
const date = value => value ? new Date(value).toLocaleString("pt-BR") : "Sem registro";
const age = value => {
  if (!value || !Number.isFinite(new Date(value).getTime())) return "Sem registro";
  const minutes=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/60000));
  return minutes<60?`${minutes} min`:minutes<1440?`${Math.floor(minutes/60)}h ${minutes%60}min`:`${Math.floor(minutes/1440)} dias`;
};
const number = value => Number(value || 0).toLocaleString("pt-BR");
const sum = (rows, field, statuses) => rows.filter(row => !statuses || statuses.includes(row.status)).reduce((total, row) => total + Number(row[field] || 0), 0);
const badge = value => `<span class="global-state ${esc(value)}">${esc(states[value] || value || "Sem dados")}</span>`;
const alertTitles = {"SLA VENCIDO":"Tarefa com prazo vencido","IMPORTACAO FALHOU":"Importação CAPTAÇÃO falhou","SEM USUARIOS ATIVOS":"Estoque sem usuários ativos","OPERACAO PARADA":"Processo sem movimentação","BASE DESATUALIZADA":"Base sem atualização recente","SEM RESPONSAVEL":"Processo sem responsável","RESPONSAVEL INATIVO":"Responsável inativo","RESPONSAVEL INDISPONIVEL":"Responsável indisponível","ATENDIMENTO PARCIAL":"Atendimento parcial","UNIFICACAO INCONSISTENTE":"Unificação precisa de revisão"};
const alertSeverity = row => ["SLA VENCIDO","IMPORTACAO FALHOU","SEM USUARIOS ATIVOS","UNIFICACAO INCONSISTENTE"].includes(row.alert_type)||(row.kind==="TRANSFERENCIA"&&row.alert_type==="OPERACAO PARADA")?"CRITICO":"ATENCAO";

export function mountGlobalDashboard({ root, client, getUser, getWarehouse, openWarehouse, onSync }) {
  const config = { ...GLOBAL_DASHBOARD_CONFIG };
  const service = createGlobalDashboardService(client, getUser, config);
  let snapshot = { warehouses: [], errors: {} };
  let allWarehouses = [];
  let tab = "overview";
  let offset = 0;
  let detailRows = [];
  let epoch = 0;
  let channel;
  let timer;
  let debounce;
  let refreshPromise;
  let live = false;
  let modalRecord = null;
  let modalSection = "";
  let modalOffset = 0;
  let boardSort = "attention";
  let boardQuery = "";
  let boardOffset = 0;
  let boardLimit = 10;
  let movementOnly = false;
  let boardState = "";
  let activityOffset = 0;
  const tabOffsets = new Map();
  const pendingDomains = new Set();
  const allowed = () => isGlobalView(getUser(), getWarehouse());
  root.innerHTML = `<div class="page-title"><div><p class="eyebrow">Central de controle</p><h2>Visão Geral Operacional</h2><p>Acompanhamento em tempo real dos estoques e solicitações</p></div><button type="button" class="secondary-button" data-global-refresh>Atualizar</button></div>
    <div class="global-filters">
      <label>Estoque<select data-filter="warehouse"><option value="">Todos os estoques</option></select></label>
      <label>Período<select data-filter="period"><option value="now">Agora</option><option value="today">Hoje</option><option value="24h" selected>Últimas 24h</option><option value="7d">7 dias</option><option value="custom">Personalizado</option></select></label>
      <label>Status<select data-filter="status"><option value="">Todos os status</option></select></label>
      <label>Responsável<select data-filter="responsible"><option value="">Todos</option></select></label>
      <label>Tipo<select data-filter="kind"><option value="">Todos</option>${["TRANSFERENCIA","REPOSICAO","ENDERECAMENTO","INVENTARIO","AUDITORIA","ORGANIZACAO","AVULSA"].map(value => `<option>${value}</option>`).join("")}</select></label>
      <label>Prioridade<select data-filter="priority"><option value="">Todas</option>${["URGENTE","ALTA","NORMAL","BAIXA"].map(value => `<option>${value}</option>`).join("")}</select></label>
      <label data-custom hidden>De<input type="datetime-local" data-filter="since"></label><label data-custom hidden>Até<input type="datetime-local" data-filter="until"></label>
    </div>
    <details class="global-settings"><summary>Indicadores de atenção</summary><div>${[["freshHours","CAPTAÇÃO recente (horas)"],["staleHours","CAPTAÇÃO desatualizada (horas)"],["stalledHours","Operação parada (horas)"],["pendingWarningCount","Fila em atenção (pedidos)"],["minimumAvailable","Mínimo de disponíveis"]].map(([key,label]) => `<label>${label}<input data-config="${key}" type="number" min="1" max="720" value="${config[key]}"></label>`).join("")}</div></details>
    <p class="global-update" data-global-updated role="status">Aguardando atualização</p><div data-global-errors role="alert"></div>
    <nav class="global-tabs" aria-label="Painéis globais">${Object.entries(labels).map(([key,label]) => `<button type="button" data-global-tab="${key}" aria-pressed="${key === tab}">${label}</button>`).join("")}</nav>
    <div data-global-overview><div class="global-metrics global-replenishment-metrics" data-global-replenishment-metrics></div><div class="global-operational-grid"><section class="global-band"><h3>Reposição aberta por estoque</h3><div data-global-replenishment-table></div></section><section class="global-band global-priority-band"><div class="global-section-heading"><h3>Alertas Operacionais</h3><button type="button" data-jump="alerts">Ver todos</button></div><div data-global-priorities></div></section></div><div class="global-charts global-operational-charts" data-global-replenishment-charts></div><div class="global-metrics global-primary-metrics" data-global-metrics></div><div data-global-board></div><div data-global-domains></div><div data-global-today></div><section class="global-band"><div class="global-section-heading"><h3>Tendência operacional</h3><div class="global-period-switch"><button type="button" data-global-period="today">Hoje</button><button type="button" data-global-period="7d">7 dias</button></div></div><div class="global-charts" data-global-trends></div></section><section class="global-band"><h3>Atividade agora</h3><div data-global-activity></div></section><section class="global-band"><h3>Alertas detalhados</h3><div data-global-alert-summary></div><button type="button" data-jump="alerts">Ver todos os alertas</button></section></div>
    <section class="global-band" data-global-details hidden><h3 data-global-detail-title></h3><div data-global-domain-metrics class="global-metrics"></div><div data-global-domain-charts class="global-charts"></div>
      <div class="global-detail-controls"><label>Busca<input type="search" data-detail-search placeholder="Código, SKU, produto ou responsável"></label>
      <label>Situação<select data-filter="mode"><option value="open">Abertas</option><option value="pending">Pendentes</option><option value="running">Em andamento</option><option value="overdue">Atrasadas</option><option value="completed">Concluídas recentes</option></select></label>
      <label><input type="checkbox" data-filter="history"> Incluir canceladas e arquivadas</label></div>
      <div data-global-detail-rows></div><div class="global-pagination"><button type="button" data-global-page="previous">Anterior</button><span data-global-page-label></span><button type="button" data-global-page="next">Próxima</button></div>
    </section>
    <dialog class="global-dialog"><form method="dialog"><button class="secondary-button" aria-label="Fechar detalhes">Fechar</button></form><div data-global-record></div></dialog>`;
  const $ = selector => root.querySelector(selector);
  const advanced=document.createElement("details");advanced.className="global-advanced-filters";
  advanced.innerHTML='<summary>Mais filtros</summary><div class="global-advanced-body"></div>';
  const advancedBody=advanced.querySelector("div");
  for(const field of ["status","responsible","kind","priority"])advancedBody.appendChild($(`[data-filter="${field}"]`).closest("label"));
  advancedBody.appendChild($(".global-settings"));$(".global-filters").appendChild(advanced);
  $(".page-title > div").appendChild($("[data-global-updated]"));
  installCompactControl(root);
  const reveal=node=>{for(let parent=node.parentElement;parent&&parent!==root;parent=parent.parentElement)if(parent.tagName==="DETAILS")parent.open=true;selectTab("overview");node.scrollIntoView({block:"start",behavior:"smooth"});};
  const reference=mountReferenceControl(root,{
    showStocks:()=>reveal($('[data-global-board]')),
    showActivity:()=>reveal($('[data-global-activity]').closest("section")),
    openTask:row=>recordDetails(row,"tasks"),
    loadTrend:range=>service.getDetails("executive",{...filters(),...range},30,0)
  });
  function filters() {
    const now = new Date(Math.floor(Date.now()/60000)*60000);
    const period = $('[data-filter="period"]').value;
    let since = new Date(now.getTime() - (period === "7d" ? 7 * 86400000 : period === "now" ? 3600000 : 86400000));
    if (period === "today") { since = new Date(now); since.setHours(0,0,0,0); }
    if (period === "custom") since = new Date($('[data-filter="since"]').value);
    const until = period === "custom" ? new Date($('[data-filter="until"]').value) : now;
    if (!Number.isFinite(since.getTime()) || !Number.isFinite(until.getTime()) || since > until) throw new Error("Informe um período válido.");
    return { warehouse: $('[data-filter="warehouse"]').value, status: $('[data-filter="status"]').value,
      responsible: $('[data-filter="responsible"]').value, kind: $('[data-filter="kind"]').value,
      priority: $('[data-filter="priority"]').value, since: since.toISOString(), until: until.toISOString(),
      mode: $('[data-filter="mode"]').value, history: $('[data-filter="history"]').checked,
      query: $('[data-detail-search]').value.trim() };
  }
  function options() {
    const warehouse = $('[data-filter="warehouse"]');
    const value = warehouse.value;
    warehouse.innerHTML = '<option value="">Todos os estoques</option>' + allWarehouses.map(w => `<option value="${esc(w.code)}">${esc(w.name)} (${esc(w.code)})</option>`).join("");
    warehouse.value = value;
    const responsible = $('[data-filter="responsible"]');
    const selected = responsible.value;
    const users = snapshot.team?.users || [];
    responsible.innerHTML = '<option value="">Todos</option>' + users.map(u => `<option value="${esc(u.id)}">${esc(u.name)}</option>`).join("");
    if (users.some(u => u.id === selected)) responsible.value = selected;
    else if (selected) responsible.insertAdjacentHTML("beforeend", `<option value="${esc(selected)}" selected>${esc(selected)}</option>`);
    const status = $('[data-filter="status"]');
    const previous = status.value;
    const statuses = new Set(["PENDENTE","EM_SEPARACAO","SEPARADO","ATENDIDO_PARCIAL","SEM_ESTOQUE","CONCLUIDO","CANCELADA","CANCELADO","EM_ANDAMENTO","BLOQUEADA","CONCLUIDA","PRONTA_PARA_NOTA","PRONTA_PARA_NOTA_COM_DIVERGENCIA","FINALIZADA","ARQUIVADA_POR_UNIFICACAO","UNIFICADA","COMPLETED","FAILED","PROCESSING"]);
    for (const key of ["tasks","replenishment","transfers"]) for (const row of snapshot[key]?.summary || []) statuses.add(row.status);
    status.innerHTML = '<option value="">Todos os status</option>' + [...statuses].sort().map(s => `<option>${esc(s)}</option>`).join("");
    status.value = previous;
  }
  function metrics(rows) {
    return rows.map(([label,value]) => `<article><span>${esc(label)}</span><strong>${value === null ? "—" : number(value)}</strong></article>`).join("");
  }
  const human = value => String(value || "Sem registro").replaceAll("_"," ").toLowerCase().replace(/^./,s=>s.toUpperCase());
  const retry = domain => `<p class="global-section-error">Não foi possível carregar ${esc(labels[domain] || "os indicadores")}. <button type="button" data-retry="${esc(domain)}">Tentar novamente</button></p>`;
  const skeleton = count => `<div class="global-skeletons" aria-label="Carregando indicadores">${Array.from({length:count},()=>'<div class="global-skeleton"></div>').join("")}</div>`;
  function filteredImports() {
    const {since,until}=filters();
    return (snapshot.imports?.rows||[]).filter(r=>!r.day||(new Date(r.day+"T23:59:59.999-04:00")>=new Date(since)&&new Date(r.day+"T00:00:00-04:00")<=new Date(until)));
  }
  function importChart() {
    if(snapshot.errors.imports)return retry("imports");
    if(!snapshot.imports)return skeleton(1);
    const rows=filteredImports();
    return chart("Importações por estoque no período",snapshot.warehouses.map(w=>({label:w.name,values:[{label:"Sucesso",value:sum(rows.filter(r=>r.warehouse_code===w.code),"total",["COMPLETED"])},{label:"Falha",value:sum(rows.filter(r=>r.warehouse_code===w.code),"total",["FAILED"])}]})).sort((a,b)=>sum(b.values,"value")-sum(a.values,"value")).slice(0,10));
  }
  function reasons(w) {
    return [w.overdue&&`${w.overdue} tarefas com prazo vencido`,w.freshness==="ERRO"&&"Importação CAPTAÇÃO falhou",w.active===0&&"Sem usuários ativos no cadastro",w.stalled&&`${w.stalled} transferências sem movimentação`,w.pending>=config.pendingWarningCount&&`${w.pending} reposições abertas`,w.available<config.minimumAvailable&&"Sem colaborador disponível para nova tarefa",["DESATUALIZADO","ATENCAO"].includes(w.freshness)&&"CAPTAÇÃO sem atualização recente",w.divergence&&`${w.divergence} transferências com divergência`].filter(Boolean);
  }
  function priorities(board) {
    const entries=[];
    for(const w of board) {
      if(w.unknown)continue;
      const queue=snapshot.executive?.queue?.find(r=>r.warehouse_code===w.code);
      const add=(rank,domain,title,count,time,severity="ATENCAO")=>entries.push({rank,domain,title,count,time,severity,warehouse:w.code});
      if(w.overdue)add(0,"tasks","Tarefas com prazo vencido",w.overdue,null,"CRITICO");
      if(w.freshness==="ERRO")add(1,"captacao","Importação CAPTAÇÃO falhou",w.batch?.error_rows,w.batch?.created_at,"CRITICO");
      if(w.active===0)add(2,"team","Estoque sem usuários ativos",0,null,"CRITICO");
      if(w.stalled)add(3,"transfers","Transferências sem movimentação",w.stalled,null,"CRITICO");
      if(Number(queue?.minutes_60_plus)>0)add(4,"replenishment","Reposições acima de uma hora",queue.minutes_60_plus,queue.oldest_at);
      if(w.available<config.minimumAvailable)add(5,"team","Sem colaborador disponível",w.available);
      if(["DESATUALIZADO","ATENCAO"].includes(w.freshness))add(6,"captacao","CAPTAÇÃO sem atualização recente",null,w.batch?.last_completed_at);
      if(w.divergence)add(7,"transfers","Transferências com divergência",w.divergence);
      if(w.pending>=config.pendingWarningCount)add(8,"replenishment","Fila de reposição em atenção",w.pending,queue?.oldest_at);
      const repRows=(snapshot.replenishment?.summary||[]).filter(r=>r.warehouse_code===w.code);
      const partial=sum(repRows,"open",["ATENDIDO_PARCIAL"]),unassigned=sum(repRows,"unassigned");
      if(partial)add(8,"replenishment","Reposições com atendimento parcial",partial);
      if(unassigned)add(9,"replenishment","Reposições sem responsável",unassigned);
    }
    return entries.sort((a,b)=>a.rank-b.rank||Number(b.count)-Number(a.count)||a.warehouse.localeCompare(b.warehouse)).slice(0,5);
  }
  function renderPriorities(board) {
    const loaded=["tasks","replenishment","transfers","team","captacao"].every(d=>snapshot[d]||snapshot.errors[d]);
    $('[data-global-priorities]').innerHTML=!loaded?skeleton(3):priorities(board).map(p=>`<article class="global-priority ${p.severity}"><div>${badge(p.severity)}<strong>${esc(warehouseLabel(p.warehouse))}</strong></div><p>${p.count==null?"":number(p.count)+" · "}${esc(p.title)}</p><small>${p.time?"Referência: há "+esc(age(p.time)):"Situação atual"}</small><button type="button" data-jump="${p.domain}" data-jump-warehouse="${esc(p.warehouse)}">Ver ${esc(labels[p.domain].toLowerCase())}</button></article>`).join("")||'<p class="empty-state">Nenhuma prioridade identificada nos dados disponíveis.</p>';
  }
  function domainMetrics(domain) {
    const rows=snapshot[domain]?.summary||[];
    if(domain==="replenishment")return [["Pendentes",sum(rows,"open",["PENDENTE","ATRIBUIDO"])],["Em separação",sum(rows,"open",["EM_SEPARACAO"])],["Separados",sum(rows,"open",["SEPARADO"])],["Atendimento parcial",sum(rows,"open",["ATENDIDO_PARCIAL"])],["Sem estoque",sum(rows,"open",["SEM_ESTOQUE"])],["Concluídos hoje",sum(rows,"finished_today",["CONCLUIDO"])]];
    if(domain==="transfers")return [["Abertas",sum(rows,"open")],["Em separação",sum(rows,"open",["EM_SEPARACAO"])],["Prontas para nota",sum(rows,"open",["PRONTA_PARA_NOTA","PRONTA_PARA_NOTA_COM_DIVERGENCIA"])],["Com divergência",sum(rows,"divergence")],["Paradas",sum(rows,"stalled")],["Concluídas hoje",sum(rows,"finished_today",["FINALIZADA"])]];
    return [["Pendentes",sum(rows,"open",["PENDENTE","ATRIBUIDA"])],["Em andamento",sum(rows,"open",["EM_ANDAMENTO"])],["Bloqueadas",sum(rows,"blocked")],["SLA vencido",sum(rows,"overdue")],["Concluídas hoje",sum(rows,"finished_today",["CONCLUIDA"])]];
  }
  function attentionList(domain) {
    const rows=(snapshot.executive?.attention?.[domain]||[]).filter(Boolean);
    return `<div class="global-attention-list">${rows.map((r,i)=>`<button type="button" data-executive-record="${domain}:${i}"><strong>${esc(r.code||r.sku||r.id)}</strong><span>${esc(warehouseLabel(r.warehouse_code))} · ${esc(r.responsible_name||"Sem responsável")}</span><small>${esc(human(r.status))} · ${domain==="transfers"?"Sem movimentação há "+esc(age(r.updated_at)):"Criada há "+esc(age(r.created_at))}${r.overdue?" · SLA vencido":""}</small>${domain==="transfers"?transferProgress(r):""}</button>`).join("")||'<p class="empty-state">Nenhum processo em atenção.</p>'}</div>`;
  }
  function transferProgress(r) {
    const total=Number(r.quantity),separated=Number(r.detail?.separated);
    if(!Number.isFinite(total)||total<=0||!Number.isFinite(separated))return '<small>Progresso: dados insuficientes</small>';
    const percent=Math.max(0,Math.min(100,Math.round(separated/total*100)));
    return `<small>${number(separated)} / ${number(total)} unidades · ${percent}% · ${number(r.divergence)} divergências</small><progress max="100" value="${percent}" aria-label="Progresso da separação"></progress>`;
  }
  function queueChart() {
    if(snapshot.errors.executive)return retry("executive");
    if(!snapshot.executive)return skeleton(1);
    const rows=snapshot.executive.queue||[];
    return chart("Idade dos pedidos abertos",[["Até 15 min","minutes_0_15"],["15–30 min","minutes_15_30"],["30–60 min","minutes_30_60"],["Acima de 1 hora","minutes_60_plus"]].map(([label,key])=>({label,values:[{label:"Pedidos",value:sum(rows,key)}]})));
  }
  function operationCharts(domain) {
    const rows=snapshot[domain]?.summary||[];
    const entries=snapshot.warehouses.map(w=>({label:w.name,values:domain==="replenishment"?["PENDENTE","EM_SEPARACAO","SEPARADO"].map(status=>({label:human(status),value:sum(rows.filter(r=>r.warehouse_code===w.code),"open",[status])})):[{label:"Abertas",value:sum(rows.filter(r=>r.warehouse_code===w.code),"open")}]}));
    const chartRows=entries.sort((a,b)=>sum(b.values,"value")-sum(a.values,"value")).slice(0,10);
    return chart(`${labels[domain]} abertas por estoque`,chartRows)+(domain==="replenishment"?queueChart():domain==="tasks"?chart("Tarefas abertas por tipo",[...new Set(rows.map(r=>r.kind))].map(kind=>({label:human(kind),values:[{label:"Abertas",value:sum(rows.filter(r=>r.kind===kind),"open")}]}))):chart("Transferências: divergência e falta de movimento",snapshot.warehouses.map(w=>({label:w.name,values:[{label:"Com divergência",value:sum(rows.filter(r=>r.warehouse_code===w.code),"divergence")},{label:"Sem movimentação",value:sum(rows.filter(r=>r.warehouse_code===w.code),"stalled")}]})).sort((a,b)=>sum(b.values,"value")-sum(a.values,"value")).slice(0,10)));
  }
  function domainPanel(domain) {
    const title=labels[domain];
    if(snapshot.errors[domain])return `<section class="global-band"><h3>${title}</h3>${retry(domain)}</section>`;
    if(!snapshot[domain])return `<section class="global-band"><h3>${title}</h3>${skeleton(3)}</section>`;
    const samples=snapshot[domain].summary||[],n=sum(samples,"duration_samples");
    const average=n?number(Math.round(samples.reduce((total,r)=>total+Number(r.average_seconds||0)*Number(r.duration_samples||0),0)/n/60))+" min":"Dados insuficientes";
    return `<section class="global-band"><div class="global-section-heading"><h3>${title}</h3><button type="button" data-jump="${domain}">Ver todas</button></div><div class="global-metrics global-domain-metrics">${metrics(domainMetrics(domain))}</div><div class="global-charts">${operationCharts(domain)}</div><p class="global-context">Tempo médio de atendimento: ${average} · ${number(n)} registros com duração válida</p><h4>${domain==="tasks"?"Tarefas que precisam de atenção":domain==="transfers"?"Transferências sem movimentação ou com divergência":"Reposições que precisam de atenção"}</h4>${snapshot.errors.executive?retry("executive"):attentionList(domain)}</section>`;
  }
  function importsPanel() {
    if(snapshot.errors.captacao)return `<section class="global-band"><h3>Atualização das bases</h3>${retry("captacao")}</section>`;
    const rows=snapshot.captacao?.rows;
    if(!rows)return `<section class="global-band"><h3>Atualização das bases</h3>${skeleton(3)}</section>`;
    return `<section class="global-band"><div class="global-section-heading"><h3>Atualização das bases</h3><button type="button" data-jump="captacao">Ver todas</button></div><div class="global-base-grid">${rows.slice().sort((a,b)=>new Date(a.last_completed_at||0)-new Date(b.last_completed_at||0)).slice(0,10).map(r=>`<button type="button" class="global-base" data-base-record="${esc(r.warehouse_code)}"><div><strong>${esc(warehouseLabel(r.warehouse_code))}</strong>${badge(captacaoFreshness(r,config))}</div><p>Última CAPTAÇÃO: ${esc(date(r.last_completed_at))}</p><strong>há ${esc(age(r.last_completed_at))}</strong><small>${number(r.total_rows)} linhas · ${number(r.inserted_rows)} novas · ${number(r.updated_rows)} alteradas · ${number(r.unchanged_rows)} sem alteração · ${number(r.error_rows)} erros</small><small>${Number(r.total_rows)>0?number(Math.round(Number(r.updated_rows||0)/r.total_rows*1000)/10)+"% alterados":"Sem registros"} · Duração: ${r.duration_seconds==null?"Sem registro":number(Math.round(r.duration_seconds))+" s"}</small>${r.status==="FAILED"?'<p class="global-section-error">Importação fora do padrão: revisar.</p>':""}</button>`).join("")}</div><p class="global-stock-warning">Os saldos são baseados na última atualização da CAPTAÇÃO e podem apresentar divergências em relação ao estoque físico atual.</p></section>`;
  }
  function teamPanel() {
    if(snapshot.errors.team)return `<section class="global-band"><h3>Equipe</h3>${retry("team")}</section>`;
    if(!snapshot.team)return `<section class="global-band"><h3>Equipe</h3>${skeleton(2)}</section>`;
    const rows=snapshot.team.rows||[];
    return `<section class="global-band"><div class="global-section-heading"><h3>Equipe</h3><button type="button" data-jump="team">Ver equipe</button></div><div class="global-metrics global-domain-metrics">${metrics([["Ativos no cadastro",sum(rows,"active")],["Disponíveis",sum(rows,"available")],["Em atividade",sum(rows,"busy")],["Indisponíveis",sum(rows,"unavailable")]])}</div><div class="global-charts">${chart("Pessoas disponíveis por estoque",rows.map(r=>({label:warehouseLabel(r.warehouse_code),values:[{label:"Disponíveis",value:r.available},{label:"Em atividade",value:r.busy}]})).sort((a,b)=>sum(a.values,"value")-sum(b.values,"value")).slice(0,10))}</div></section>`;
  }
  function table(headers, rows) {
    if (!rows.length) return '<p class="empty-state">Nenhum registro neste filtro.</p>';
    return `<div class="global-table-wrap"><table class="global-table"><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(cells => `<tr>${cells.map((cell,i) => `<td data-label="${esc(headers[i])}">${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  function chart(title, entries) {
    const max = Math.max(1,...entries.map(entry => entry.values.reduce((a,b) => a+Number(b.value || 0),0)));
    return `<section><h3>${esc(title)}</h3><ul class="global-bars">${entries.map(entry => `<li><span>${esc(entry.label)}</span><div>${entry.values.map((v,i) => `<span class="series-${i % 3}" style="width:${Math.max(0,Number(v.value || 0))/max*100}%" title="${esc(v.label)}: ${number(v.value)}"></span>`).join("")}</div><small>${entry.values.map(v => `${esc(v.label)}: ${number(v.value)}`).join(" · ")}</small></li>`).join("")}</ul></section>`;
  }
  function boardRows() {
    return snapshot.warehouses.map(w => {
      const rows = domain => (snapshot[domain]?.summary || []).filter(r => r.warehouse_code === w.code);
      const team = snapshot.team?.rows?.find(r => r.warehouse_code === w.code) || {};
      const batch = snapshot.captacao?.rows?.find(r => r.warehouse_code === w.code);
      const stats = { ...w, active: Number(team.active || 0), available: Number(team.available || 0), pending: sum(rows("replenishment"),"open"),
        overdue: sum(rows("tasks"),"overdue"), stalled: sum(rows("transfers"),"stalled"), divergence: sum(rows("transfers"),"divergence"),
        tasks: sum(rows("tasks"),"open"), running: sum(rows("tasks"),"open",["EM_ANDAMENTO"]), transfers: sum(rows("transfers"),"open"),
        freshness: snapshot.errors.captacao ? "SEM_DADOS" : captacaoFreshness(batch,config), batch,
        lastActivity: [...rows("tasks"),...rows("replenishment"),...rows("transfers")].map(r => r.last_activity).filter(Boolean).sort().at(-1),
        alerts: sum((snapshot.alerts?.summary||[]).filter(r=>r.warehouse_code===w.code),"total"),
        unknown: ["tasks","replenishment","transfers","team","captacao"].some(d=>snapshot.errors[d]||!snapshot[d]) };
      stats.attention = stats.unknown ? "SEM_DADOS" : warehouseAttention(stats,config);
      return stats;
    }).sort((a,b) => ({CRITICO:0,ATENCAO:1,SEM_DADOS:2,NORMAL:3}[a.attention]-{CRITICO:0,ATENCAO:1,SEM_DADOS:2,NORMAL:3}[b.attention] || b.overdue-a.overdue || b.pending-a.pending));
  }
  function renderReplenishmentOverview() {
    const rows = snapshot.replenishment?.summary || [];
    const target = $('[data-global-replenishment-metrics]');
    if (!snapshot.replenishment) {
      target.innerHTML = snapshot.errors.replenishment ? retry("replenishment") : skeleton(6);
      $('[data-global-replenishment-table]').innerHTML = '<p class="empty-state">Aguardando indicadores de reposição.</p>';
      $('[data-global-replenishment-charts]').innerHTML = "";
      return;
    }
    target.innerHTML = domainMetrics("replenishment").map(([label,value],index)=>`<article class="global-replenishment-kpi tone-${index}"><span>${esc(label)}</span><strong>${number(value)}</strong></article>`).join("");
    decorateMetrics(target);
    const units = snapshot.warehouses.map(w=>{
      const subset = rows.filter(row=>row.warehouse_code===w.code);
      return { ...w, pending:sum(subset,"open",["PENDENTE","ATRIBUIDO"]), running:sum(subset,"open",["EM_SEPARACAO"]), separated:sum(subset,"open",["SEPARADO"]) };
    });
    const maximum = Math.max(1,...units.map(w=>w.pending+w.running+w.separated));
    $('[data-global-replenishment-table]').innerHTML = table(["Estoque","Fila atual","Pendentes","Em separação","Separados"],
      units.map(w=>[`<button type="button" class="ghost-button" data-jump="replenishment" data-jump-warehouse="${esc(w.code)}">${esc(w.name)}</button>`,
        `<progress max="${maximum}" value="${w.pending+w.running+w.separated}" aria-label="Volume de pedidos de ${esc(w.name)}"></progress>`,
        number(w.pending),number(w.running),number(w.separated)]));
    const stages = domainMetrics("replenishment");
    const total = stages.reduce((n,[,value])=>n+value,0);
    const colors = ["#287de0","#f4a51c","#19a96f","#7558db","#e54b4b","#087b85"];
    let position=0;
    const stops = stages.map(([,value],i)=>{const start=position;position+=total?value/total*360:0;return colors[i]+" "+start+"deg "+position+"deg";}).join(",");
    const distribution = total ? `<section><h3>Distribuição por etapa</h3><div class="global-distribution"><div class="global-donut" style="background:conic-gradient(${stops})"><div><strong>${number(total)}</strong><span>Pedidos</span></div></div><ul>${stages.map(([label,value],i)=>`<li><span style="border-color:${colors[i]}">${esc(label)}</span><strong>${number(value)}</strong></li>`).join("")}</ul></div></section>` : '<section><h3>Distribuição por etapa</h3><p class="empty-state">Nenhum pedido nos indicadores atuais.</p></section>';
    const trends=(snapshot.executive?.trends||[]).filter(row=>row.domain==="replenishment");
    const daily=snapshot.errors.executive?retry("executive"):trends.length?chart("Volume diário de reposição",trends.map(row=>({label:new Date(row.day+"T12:00:00").toLocaleDateString("pt-BR"),values:[{label:"Criados",value:row.created},{label:"Concluídos",value:row.finished}]}))):'<section><h3>Volume diário de reposição</h3><p class="empty-state">Sem movimentação no período.</p></section>';
    $('[data-global-replenishment-charts]').innerHTML = distribution+daily+queueChart();
  }
  function renderOverview() {
    const tasks = snapshot.tasks?.summary || [], rep = snapshot.replenishment?.summary || [], trans = snapshot.transfers?.summary || [];
    const imports = filteredImports();
    const board = boardRows();
    renderPriorities(board);
    if($('.compact-secondary').open)renderReplenishmentOverview();
    if($('.compact-secondary').open)$('[data-global-today]').innerHTML = `<section class="global-band"><h3>Hoje na operação</h3><div class="global-metrics global-domain-metrics">${metrics([["Reposições criadas",snapshot.replenishment?sum(rep,"created_today"):null],["Reposições concluídas",snapshot.replenishment?sum(rep,"finished_today",["CONCLUIDO"]):null],["Transferências iniciadas",snapshot.transfers?sum(trans,"started_today"):null],["Transferências concluídas",snapshot.transfers?sum(trans,"finished_today",["FINALIZADA"]):null],["Tarefas concluídas",snapshot.tasks?sum(tasks,"finished_today",["CONCLUIDA"]):null],["Importações realizadas",snapshot.imports?sum(imports,"today"):null],["Importações com falha",snapshot.imports?sum(imports,"today",["FAILED"]):null]])}</div></section>`;
    $('[data-global-board]').innerHTML = `<section class="global-band"><h3>Resumo dos estoques</h3><div class="global-detail-controls"><label>Busca de estoque<input type="search" data-board-search value="${esc(boardQuery)}"></label><label>Ordenar por<select data-board-sort><option value="attention">Necessidade de atenção</option><option value="pending">Mais pendências</option><option value="overdue">Mais atrasos</option><option value="active">Menos pessoas</option><option value="captacao">CAPTAÇÃO mais antiga</option></select></label><label class="global-movement-toggle"><input type="checkbox" data-board-movement ${movementOnly ? "checked" : ""}> Somente com movimento</label></div><div data-board-table></div><div class="global-pagination"><button type="button" data-board-page="previous">Anterior</button><span data-board-page-label></span><button type="button" data-board-page="next">Próxima</button></div></section>`;
    $('[data-board-sort]').closest("label").insertAdjacentHTML("afterend",'<label>Situação<select data-board-state><option value="">Todas</option><option value="NORMAL">Normal</option><option value="ATENCAO">Atenção</option><option value="CRITICO">Crítico</option><option value="SEM_DADOS">Sem dados</option></select></label>');
    $('[data-board-state]').value=boardState;
    $('[data-board-sort]').value=boardSort;
    renderBoard(board);
    if($('.compact-secondary').open)$('[data-global-domains]').innerHTML=domainPanel("replenishment")+domainPanel("transfers")+importsPanel()+teamPanel()+domainPanel("tasks");
    $('[data-global-domains] .global-stock-warning')?.insertAdjacentHTML("beforebegin",`<div class="global-charts">${importChart()}</div>`);
    if($('.compact-secondary').open){
    const trends=snapshot.executive?.trends||[];
    $('[data-global-trends]').innerHTML=snapshot.errors.executive?retry("executive"):!snapshot.executive?skeleton(2):trends.length?["replenishment","transfers","tasks"].map(domain=>chart(`${labels[domain]} no período`,trends.filter(r=>r.domain===domain).map(r=>({label:new Date(r.day+"T12:00:00").toLocaleDateString("pt-BR"),values:[{label:domain==="transfers"?"Iniciadas":"Criadas",value:r.created},{label:"Concluídas",value:r.finished}]})))).join(""):'<p class="empty-state">Dados insuficientes para calcular tendência.</p>';
    const importDays=[...new Set(imports.map(r=>r.day).filter(Boolean))].sort();
    if(importDays.length)$('[data-global-trends]').insertAdjacentHTML("beforeend",chart("Importações: sucesso e falha",importDays.map(day=>({label:new Date(day+"T12:00:00").toLocaleDateString("pt-BR"),values:[{label:"Sucesso",value:sum(imports.filter(r=>r.day===day),"total",["COMPLETED"])},{label:"Falha",value:sum(imports.filter(r=>r.day===day),"total",["FAILED"])}]}))));
    }
    $('[data-global-alert-summary]').innerHTML=snapshot.errors.alerts?retry("alerts"):`<p>${number(sum(snapshot.alerts?.summary||[],"critical"))} alertas críticos · ${number(sum(snapshot.alerts?.summary||[],"total"))} ocorrências</p>`;
    $('[data-global-errors]').innerHTML="";
    $('[data-global-updated]').textContent = snapshot.generated_at?"Última atualização: " + date(snapshot.generated_at):"Carregando indicadores";
    root.querySelectorAll('[data-global-period]').forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.globalPeriod===$('[data-filter="period"]').value)));
    reference.render(snapshot,board);
  }
  function renderBoard(board = boardRows()) {
    const key = $('[data-board-sort]').value;
    if (key !== "attention") board.sort((a,b) => key === "captacao" ? new Date(a.batch?.last_completed_at || 0)-new Date(b.batch?.last_completed_at || 0) : key === "active" ? a.active-b.active : b[key]-a[key]);
    board=board.filter(w=>[w.name,w.code].join(" ").toLowerCase().includes(boardQuery.toLowerCase()) && (!boardState || w.attention===boardState) && (!movementOnly || w.unknown || w.pending+w.transfers+w.tasks>0));
    const total=board.length;boardOffset=Math.min(boardOffset,Math.max(0,Math.floor((total-1)/boardLimit)*boardLimit));board=board.slice(boardOffset,boardOffset+boardLimit);
    $('[data-board-table]').innerHTML = table(["Estoque","Situação","Reposições","Transferências","Tarefas atrasadas","Equipe","CAPTAÇÃO","Ação"],
      board.map(w=>[`<strong>${esc(w.name)}</strong><small>${esc(w.code)}</small>`,badge(w.attention),
        snapshot.replenishment?number(w.pending):"Sem dados",snapshot.transfers?number(w.transfers):"Sem dados",
        snapshot.tasks?number(w.overdue):"Sem dados",snapshot.team?`${w.active} ativas<small>${w.available} disponíveis</small>`:"Sem dados",
        `${badge(w.freshness)}<small>${esc(age(w.batch?.last_completed_at))}</small>`,
        `<button type="button" data-board-record="${esc(w.code)}">Ver detalhes</button>`]))
      + (!total?'<p class="empty-state">Nenhum estoque neste filtro.</p>':"");
    $('[data-board-page-label]').textContent="Página "+(Math.floor(boardOffset/boardLimit)+1);$('[data-board-page="previous"]').disabled=boardOffset===0;$('[data-board-page="next"]').disabled=total<=boardOffset+boardLimit;
  }
  function renderDomainCharts() {
    if(tab==="overview")return;
    $('[data-global-domain-metrics]').innerHTML=metrics(["tasks","replenishment","transfers"].includes(tab)?domainMetrics(tab):[]);
    if(!$('.compact-domain-charts').open)return;
    const rows = snapshot[tab]?.summary || [];
    let cards = [], charts = "";
    if (["tasks","replenishment","transfers"].includes(tab)) {
      cards = domainMetrics(tab);
      const groups = new Map();
      for (const r of rows) groups.set(tab === "tasks" ? r.kind : r.status,(groups.get(tab === "tasks" ? r.kind : r.status) || 0)+Number(r.open));
      charts = chart(`${labels[tab]} por estoque`,snapshot.warehouses.map(w => ({ label:w.name, values:(tab === "replenishment" ? ["PENDENTE","EM_SEPARACAO","SEPARADO"] : ["Total"]).map(status => ({label:status,value:sum(rows.filter(r => r.warehouse_code===w.code),"open",status==="Total" ? null : [status])})) })))+
        chart(tab === "tasks" ? "Tarefas por tipo" : `${labels[tab]} por status`,[...groups].map(([label,value]) => ({label,values:[{label:"Abertas",value}]})));
      const measured=snapshot.warehouses.map(w=>{const samples=rows.filter(r=>r.warehouse_code===w.code&&r.average_seconds!=null);const n=sum(samples,"duration_samples");return {label:w.name,values:[{label:"Minutos",value:n ? Math.round(samples.reduce((a,b)=>a+Number(b.average_seconds)*Number(b.duration_samples),0)/n/60) : 0}],measured:n>0};}).filter(entry=>entry.measured);
      if(measured.length)charts+=chart(`Tempo médio de ${labels[tab].toLowerCase()} (minutos)`,measured);
      if(tab==="replenishment")charts+=queueChart();
      charts+=`<section><h3>Processos em atenção</h3>${snapshot.errors.executive?retry("executive"):!snapshot.executive?skeleton(2):attentionList(tab)}</section>`;
    }
    if (tab === "captacao") {
      const imports=filteredImports();
      charts=chart("CAPTAÇÃO: idade da base em horas",snapshot.warehouses.map(w=>{const b=snapshot.captacao?.rows?.find(r=>r.warehouse_code===w.code);return {label:`${w.name} · ${states[captacaoFreshness(b,config)]}`,values:[{label:"Horas",value:b?.last_completed_at ? Math.floor((Date.now()-new Date(b.last_completed_at).getTime())/3600000) : 0}]};}))+chart("Importações no período selecionado",snapshot.warehouses.map(w=>({label:w.name,values:["COMPLETED","FAILED"].map(status=>({label:status,value:sum(imports.filter(r=>r.warehouse_code===w.code&&r.source_type==="CAPTACAO"),"total",[status])}))})))+
        chart("Tempo médio de importação (minutos)",snapshot.warehouses.map(w=>{const batches=imports.filter(r=>r.warehouse_code===w.code&&r.average_seconds!=null);const n=sum(batches,"duration_samples");return {label:w.name,values:[{label:"Minutos",value:n ? Math.round(batches.reduce((a,b)=>a+Number(b.average_seconds)*Number(b.duration_samples),0)/n/60) : 0}]};}));
    }
    if (tab === "team") charts=chart("Equipe ativa por estoque",(snapshot.team?.rows||[]).map(r=>({label:warehouseLabel(r.warehouse_code),values:[{label:"Ativos no cadastro",value:r.active}]})))+chart("Disponíveis x em atividade",(snapshot.team?.rows||[]).map(r=>({label:warehouseLabel(r.warehouse_code),values:[{label:"Disponíveis",value:r.available},{label:"Ocupados",value:r.busy}]})));
    $('[data-global-domain-metrics]').innerHTML=metrics(cards);
    $('[data-global-domain-charts]').innerHTML=charts;
  }
  const warehouseLabel = code => snapshot.warehouses.find(w=>w.code===code)?.name || code;
  async function loadDetails() {
    if (!allowed() || tab==="overview") return;
    const requestEpoch=epoch, section=tab;
    $('[data-global-detail-title]').textContent = labels[tab]+" — todos os estoques";
    $('[data-global-detail-rows]').innerHTML=skeleton(3);
    renderDomainCharts();
    try {
      const response=await service.getDetails(section,filters(),30,offset,true);
      if (!allowed() || requestEpoch!==epoch || section!==tab) return;
      let rows=response.rows || [];
      if (["team","captacao"].includes(section)) rows=rows.filter(r=>!filters().query||[warehouseLabel(r.warehouse_code),r.warehouse_code,r.file_name||""].join(" ").toLowerCase().includes(filters().query.toLowerCase()));
      if (["team","captacao"].includes(section)) rows=rows.slice(offset,offset+30);
      if(section==="alerts")rows.sort((a,b)=>Number(alertSeverity(b)==="CRITICO")-Number(alertSeverity(a)==="CRITICO"));
      detailRows=rows;
      const action=index=>`<button type="button" data-global-record="${index}">Detalhes</button>`;
      let headers, cells;
      if (section==="team") {
        headers=["Estoque","Ativos no cadastro","Disponíveis","Ocupados","Indisponíveis","Supervisores","Operadores","Atendentes","Ação"];
        cells=rows.map((r,i)=>[esc(warehouseLabel(r.warehouse_code)),r.active,r.available,r.busy,r.unavailable,r.supervisors,r.operators,r.attendants,action(i)]);
      } else if (section==="captacao") {
        headers=["Estoque","Arquivo","Última importação","Idade da base","Situação","Linhas","Inseridas / atualizadas / iguais","Erros","Duração","Ação"];
        cells=rows.map((r,i)=>[esc(warehouseLabel(r.warehouse_code)),esc(r.file_name||"Sem importação"),esc(date(r.created_at)),esc(age(r.last_completed_at)),badge(captacaoFreshness(r,config)),number(r.total_rows),`${number(r.inserted_rows)} / ${number(r.updated_rows)} / ${number(r.unchanged_rows)}`,number(r.error_rows),r.duration_seconds==null?"Sem registro":number(Math.round(r.duration_seconds))+" s",action(i)]);
      } else if (section==="alerts") {
        headers=["Estoque","Tipo","Descrição","Tempo","Ação recomendada","Detalhes"];
        cells=rows.map((r,i)=>[esc(warehouseLabel(r.warehouse_code)),badge(alertSeverity(r)),`${esc(alertTitles[r.alert_type]||human(r.alert_type))}<small>${esc(r.title)}</small>`,esc(age(r.updated_at)),`<button type="button" data-jump="${r.kind==="TRANSFERENCIA"?"transfers":r.kind==="REPOSICAO"?"replenishment":r.kind==="CAPTACAO"?"captacao":r.kind==="EQUIPE"?"team":"tasks"}" data-jump-warehouse="${esc(r.warehouse_code)}">Ver ocorrência</button>`,action(i)]);
      } else if (section==="transfers") {
        headers=["Estoque","Código","Origem / destino","Responsável","Status","Progresso","Divergências","Criada / atualizada","Tempo","Detalhes"];
        cells=rows.map((r,i)=>[esc(warehouseLabel(r.warehouse_code)),esc(r.code),`${esc(r.origin)} / ${esc(r.destination)}`,esc(r.responsible_name||"Sem responsável"),badge(r.status),transferProgress(r),number(r.divergence),`${esc(date(r.created_at))}<small>${esc(date(r.updated_at))}</small>`,esc(age(r.created_at)),action(i)]);
      } else {
        headers=["Estoque","Código / SKU","Tipo / produto","Quantidade","Prioridade","Status","Solicitante / responsável","Criada / tempo","SLA","Ação"];
        cells=rows.map((r,i)=>[esc(warehouseLabel(r.warehouse_code)),`${esc(r.code)}<small>${esc(r.sku)}</small>`,`${esc(r.kind)}<small>${esc(r.title)}</small>`,number(r.quantity),badge(r.priority),badge(r.status),`${esc(r.requester||"—")}<small>${esc(r.responsible_name||"Sem responsável")}</small>`,`${esc(date(r.created_at))}<small>${esc(age(r.created_at))}</small>`,r.overdue?badge("CRITICO")+esc(date(r.deadline)):esc(date(r.deadline)),action(i)]);
      }
      const stockWarning=section==="captacao"?'<p class="global-stock-warning">Os saldos são baseados na última atualização da CAPTAÇÃO e podem apresentar divergências em relação ao estoque físico atual.</p>':"";
      $('[data-global-detail-rows]').innerHTML=stockWarning+table(headers,cells);
      $('[data-global-page-label]').textContent="Página "+(offset/30+1);
      $('[data-global-page="previous"]').disabled=offset===0;
      $('[data-global-page="next"]').disabled=!(response.has_more || (response.total>offset+30) || (["team","captacao"].includes(section) && (response.rows||[]).length>offset+30));
    } catch(error) { service.diagnostics.lastError=error.message;if (requestEpoch===epoch) $('[data-global-detail-rows]').innerHTML=retry(section); }
  }
  async function activity() {
    const version=epoch;
    try { const response=await service.getWarehouseActivity(filters()); if(!allowed()||version!==epoch)return;
      const data={...response};
      const selected=filters();
      const rows=(data.rows||[]).filter(row=>(!selected.kind||row.kind===selected.kind)&&(!selected.status||row.status===selected.status));
      reference.activity(rows);
      data.total=rows.length;data.rows=rows.slice(activityOffset,activityOffset+10);
      $('[data-global-activity]').innerHTML='<div class="compact-timeline">'+(data.rows||[]).slice(0,10).map(r=>`<details><summary><time>${esc(date(r.updated_at))}</time><strong>${esc(r.responsible_name||"Não informado")}</strong><span>${esc(human(r.kind))}</span><span>${esc(warehouseLabel(r.warehouse_code))}</span>${badge(r.status)}</summary><p>${esc(r.code||"")} · ${esc(r.title||"")}</p></details>`).join("")+'</div>'+(!(data.rows||[]).length?'<p class="empty-state">Nenhuma atividade neste período.</p>':"")+`<div class="global-pagination"><button type="button" data-activity-page="previous" ${activityOffset===0?'disabled':''}>Anterior</button><span>Página ${activityOffset/10+1}</span><button type="button" data-activity-page="next" ${!(data.has_more||data.total>activityOffset+10||(data.rows||[]).length>=10)?'disabled':''}>Próxima</button></div>`;
      $('[data-activity-page="next"]').disabled=data.total<=activityOffset+10;
    } catch { $('[data-global-activity]').textContent="Atividade indisponível.";reference.activity([],true); }
  }
  async function refresh(force = false) {
    if (!allowed()) return;
    if (refreshPromise) return refreshPromise;
    const version=epoch;
    const button=$('[data-global-refresh]');button.disabled=true;
    refreshPromise=(async()=>{
      try { const data=await service.getGlobalOverview(filters(),force,partial=>{if(!allowed()||version!==epoch)return;snapshot={...partial,errors:{...partial.errors}};renderOverview();}); if(!allowed()||version!==epoch)return;
        snapshot=data;
        if (!$('[data-filter="warehouse"]').value) allWarehouses=data.warehouses;
        options();renderOverview();renderDomainCharts();await Promise.all([activity(),loadDetails(),loadReferenceDetails()]);onSync?.(true);
      } catch(error) { service.diagnostics.lastError=error.message;$('[data-global-errors]').innerHTML=retry("overview");onSync?.(false); }
      finally { button.disabled=false;refreshPromise=null;if(version!==epoch&&allowed())setTimeout(()=>refresh(true),0); }
    })();
    return refreshPromise;
  }
  async function loadReferenceDetails(){
    const version=epoch;
    const tasks=async()=>{try{const response=await service.getDetails("tasks",{...filters(),mode:"running",status:"EM_ANDAMENTO"},2,0);if(allowed()&&version===epoch)reference.tasks((response.rows||[]).filter(row=>row.status==="EM_ANDAMENTO"));}catch{if(allowed()&&version===epoch)reference.tasks(null,true);}};
    await Promise.all([tasks(),reference.refreshTrend()]);
  }
  function recordDetails(row,section=tab) {
    if(!row)return;
    modalRecord=row;modalOffset=0;modalSection=section;
    const translated={warehouse_code:"Estoque",code:"Código",title:"Título",status:"Status",kind:"Tipo",priority:"Prioridade",responsible_name:"Responsável",requester:"Solicitante",sku:"SKU",quantity:"Quantidade",item_count:"Itens",divergence:"Divergências",origin:"Origem",destination:"Destino",created_at:"Criado em",updated_at:"Atualizado em",deadline:"SLA",file_name:"Arquivo",total_rows:"Linhas",error_message:"Erro",active:"Ativos",available:"Disponíveis",busy:"Ocupados",unavailable:"Indisponíveis",started_at:"Iniciada em",finished_at:"Finalizada em",duration_seconds:"Duração (segundos)",skus:"SKUs",separated:"Separados",packed:"Embalados",notes:"Observações",description:"Descrição",blocked_reason:"Bloqueio",attended:"Atendido",pending:"Pendente",location:"Localização"};
    const fields={...row,...row.detail};
    Object.assign(translated,{attention:"Situação operacional",transfers:"Transferências abertas",tasks:"Tarefas",overdue:"Tarefas atrasadas",freshness:"Base CAPTAÇÃO",stalled:"Processos parados",divergence:"Divergências"});
    $('div[data-global-record]').innerHTML=`<h3>${esc(row.title||row.file_name||warehouseLabel(row.warehouse_code))}</h3><dl>${Object.entries(fields).filter(([key,value])=>translated[key]&&value!=null&&typeof value!=="object").map(([key,value])=>`<dt>${esc(translated[key])}</dt><dd>${esc(key.endsWith("_at")||key==="deadline"?date(value):String(value))}</dd>`).join("")}</dl>`;
    if(["team","transfers"].includes(section)) $('div[data-global-record]').insertAdjacentHTML("beforeend",'<label>Busca no detalhe<input type="search" data-modal-search></label><div data-modal-list></div><div class="global-pagination"><button type="button" data-modal-page="previous">Anterior</button><span data-modal-page-label></span><button type="button" data-modal-page="next">Próxima</button></div>');
    if(row.warehouse_code) $('div[data-global-record]').insertAdjacentHTML("beforeend",`<button type="button" data-open-warehouse="${esc(row.warehouse_code)}">Abrir no estoque</button>`);
    $('.global-dialog').showModal();
    if(["team","transfers"].includes(section))loadModalDetails();
  }
  async function loadModalDetails() {
    const row=modalRecord,section=modalSection,version=epoch;
    const container=$('[data-modal-list]');if(!container)return;
    container.textContent="Carregando...";
    try {const data=await service.getDetails(section==="team"?"users":"transfer_items",{...filters(),warehouse:row.warehouse_code,id:row.id,query:$('[data-modal-search]').value},30,modalOffset,true);
      if(!allowed()||version!==epoch||modalRecord!==row)return;
      container.innerHTML=section==="team"?table(["Nome","Perfil","Ativo no cadastro","Disponível","Último login"],data.rows.map(u=>[esc(u.name),esc(u.role),u.active?"Sim":"Não",u.available?"Sim":"Não",esc(date(u.last_login_at))])):
        table(["SKU","Produto","Solicitada","Separada","Lacrada","Divergência","Endereço"],data.rows.map(i=>[esc(i.sku),esc(i.descricao),number(i.quantidade_solicitada),number(i.quantidade_separada),number(i.quantidade_lacrada),i.has_divergence?"Sim":"Não",esc(i.endereco_codigo||"—")]));
      $('[data-modal-page-label]').textContent="Página "+(modalOffset/30+1);$('[data-modal-page="previous"]').disabled=modalOffset===0;$('[data-modal-page="next"]').disabled=data.total<=modalOffset+30;
    }catch(error){service.diagnostics.lastError=error.message;container.textContent="Não foi possível carregar os detalhes.";}
  }
  function selectTab(next) {
    root.querySelectorAll('[data-compact-mode]').forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.compactMode===$('[data-filter="mode"]').value)));
    tabOffsets.set(tab,offset);tab=next;offset=tabOffsets.get(next)||0;epoch++;root.querySelectorAll('[data-global-tab]').forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.globalTab===tab)));$('[data-global-overview]').hidden=tab!=="overview";$('[data-global-details]').hidden=tab==="overview";loadDetails();
    if(tab==="overview")reference.render(snapshot,boardRows());
  }
  $('.compact-secondary').addEventListener("toggle",()=>{if($('.compact-secondary').open)renderOverview();});
  $('.compact-domain-charts').addEventListener("toggle",()=>{if($('.compact-domain-charts').open)renderDomainCharts();});
  root.addEventListener("click",event=>{
    const button=event.target.closest("button");if(!button)return;
    if(button.hasAttribute("data-global-refresh")) refresh(true);
    if(button.dataset.globalTab)selectTab(button.dataset.globalTab);
    if(button.dataset.jump){
      const changed=button.dataset.jumpWarehouse&&$('[data-filter="warehouse"]').value!==button.dataset.jumpWarehouse;
      if(changed)$('[data-filter="warehouse"]').value=button.dataset.jumpWarehouse;
      $('[data-filter="mode"]').value=button.dataset.jumpMode||"open";
      selectTab(button.dataset.jump);if(changed){service.invalidate();refresh(true);}
      if(button.dataset.jump==="overview")reveal($('[data-global-board]'));
    }
    if(button.dataset.retry){service.invalidate(button.dataset.retry);refresh(true);}
    if(button.dataset.globalPeriod){$('[data-filter="period"]').value=button.dataset.globalPeriod;epoch++;service.invalidate();refresh(true);}
    if(button.hasAttribute("data-board-all")){boardLimit=boardLimit===10?Math.max(10,snapshot.warehouses.length):10;boardOffset=0;renderBoard();}
    if(button.dataset.boardRecord){const row=boardRows().find(w=>w.code===button.dataset.boardRecord);recordDetails({...row,warehouse_code:row.code,title:row.name},"team");}
    if(button.dataset.baseRecord)recordDetails(snapshot.captacao.rows.find(r=>r.warehouse_code===button.dataset.baseRecord),"captacao");
    if(button.dataset.executiveRecord){const [domain,index]=button.dataset.executiveRecord.split(":");recordDetails(snapshot.executive?.attention?.[domain]?.[Number(index)],domain);}
    if(button.dataset.openWarehouse){$('.global-dialog').close();openWarehouse(button.dataset.openWarehouse);}
    if(button.hasAttribute("data-global-record"))recordDetails(detailRows[Number(button.dataset.globalRecord)]);
    if(button.dataset.globalPage){offset=Math.max(0,offset+(button.dataset.globalPage==="next"?30:-30));epoch++;loadDetails();}
    if(button.dataset.modalPage){modalOffset=Math.max(0,modalOffset+(button.dataset.modalPage==="next"?30:-30));loadModalDetails();}
    if(button.dataset.boardPage){boardOffset=Math.max(0,boardOffset+(button.dataset.boardPage==="next"?boardLimit:-boardLimit));renderBoard();}
    if(button.dataset.activityPage){activityOffset=Math.max(0,activityOffset+(button.dataset.activityPage==="next"?10:-10));activity();}
  });
  root.addEventListener("change",event=>{
    if(event.target.hasAttribute("data-board-state")){boardState=event.target.value;boardOffset=0;renderBoard();return;}
    if(event.target.hasAttribute("data-board-movement")){movementOnly=event.target.checked;boardOffset=0;renderBoard();return;}
    if(event.target.hasAttribute("data-board-sort")){boardSort=event.target.value;boardOffset=0;renderBoard();return;}
    if(!event.target.dataset.config && !event.target.dataset.filter)return;
    if(event.target.dataset.config){const key=event.target.dataset.config;config[key]=Math.max(1,Math.min(720,Number(event.target.value)||GLOBAL_DASHBOARD_CONFIG[key]));config.staleHours=Math.max(config.freshHours,config.staleHours);service.invalidate();}
    if(event.target.dataset.filter){root.querySelectorAll('[data-custom]').forEach(el=>el.hidden=$('[data-filter="period"]').value!=="custom");}
    offset=0;boardOffset=0;activityOffset=0;epoch++;service.invalidate();refresh(true);
  });
  $('[data-detail-search]').addEventListener("input",()=>{clearTimeout(debounce);debounce=setTimeout(()=>{offset=0;epoch++;loadDetails();},300);});
  root.addEventListener("input",event=>{if(event.target.hasAttribute("data-board-search")){boardQuery=event.target.value;boardOffset=0;renderBoard();}if(event.target.hasAttribute("data-modal-search")){clearTimeout(debounce);debounce=setTimeout(()=>{modalOffset=0;loadModalDetails();},300);}});
  function start() {
    if(live)return refresh();live=true;
    refresh(true);
    channel=client.channel("wms-global-control");
    const domains={operacao_tarefas:"tasks",wms_replenishment_requests:"replenishment",wms_transfers:"transfers",wms_stock_import_batches:"captacao",wms_users:"team"};
    for(const [table,domain] of Object.entries(domains))channel=channel.on("postgres_changes",{event:"*",schema:"public",table},event=>{
      if(!allowed())return;
      const code=event.new?.warehouse_code||event.new?.estoque_id||event.old?.warehouse_code||event.old?.estoque_id;
      if(code==="DOURADOS")return;
      pendingDomains.add(domain);
      clearTimeout(debounce);debounce=setTimeout(async()=>{
        const domainsToRefresh=[...pendingDomains];pendingDomains.clear();
        domainsToRefresh.forEach(d=>service.invalidate(d));
        try { for(const d of domainsToRefresh){const data=await (d==="captacao"||d==="team"?service.getDetails(d,filters(),30,0,true):service.getDomainSummary(d,filters()));if(!allowed())return;snapshot[d]=data;delete snapshot.errors[d];}
          if(domainsToRefresh.includes("captacao")) snapshot.imports=await service.getDetails("imports",filters(),30,0,true);
          if(domainsToRefresh.some(d=>["tasks","replenishment","transfers"].includes(d))) snapshot.team=await service.getDetails("team",filters(),30,0,true);
          if(domainsToRefresh.some(d=>["tasks","replenishment","transfers","team"].includes(d))) {
            try{snapshot.executive=await service.getDetails("executive",filters(),30,0,true);delete snapshot.errors.executive;}
            catch(error){snapshot.errors.executive=error.message;}
          }
          snapshot.alerts=await service.getDetails("alerts_summary",filters(),30,0,true);
          snapshot.generated_at=new Date().toISOString();renderOverview();renderDomainCharts();activity();loadReferenceDetails();if(domainsToRefresh.includes(tab)||tab==="alerts")loadDetails();
        }catch(error){service.diagnostics.lastError=error.message;}
      },1500);
    });
    channel.subscribe(status=>{service.diagnostics.realtime=status==="SUBSCRIBED"?"Ao vivo":"Atualização periódica";onSync?.(status==="SUBSCRIBED");});
    timer=window.setInterval(()=>{if(document.visibilityState!=="hidden"&&allowed())refresh(true);},60000);
  }
  function stop() {live=false;epoch++;reference.stop();window.clearInterval(timer);clearTimeout(debounce);if(channel)client.removeChannel(channel);channel=null;service.clear();snapshot={warehouses:[],errors:{}};allWarehouses=[];service.diagnostics.realtime="Parado";}
  return {start,stop,refresh,diagnostics:service.diagnostics};
}
