import { escapeHtml as esc } from "./utils.js";
import { captacaoFreshness, createGlobalDashboardService, GLOBAL_DASHBOARD_CONFIG, isGlobalView, warehouseAttention } from "./global-dashboard-service.js";
import "./global-dashboard.css";

const labels = { overview: "Visão Geral", tasks: "Tarefas", replenishment: "Reposição", transfers: "Transferências", captacao: "Importações", team: "Equipe", alerts: "Alertas" };
const states = { NORMAL: "Normal", ATENCAO: "Atenção", CRITICO: "Crítico", ATUALIZADO: "Atualizada", DESATUALIZADO: "Desatualizada", ERRO: "Falha", SEM_DADOS: "Sem dados" };
const date = value => value ? new Date(value).toLocaleString("pt-BR") : "Sem registro";
const age = value => value ? Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000)) + " min" : "Sem registro";
const number = value => Number(value || 0).toLocaleString("pt-BR");
const sum = (rows, field, statuses) => rows.filter(row => !statuses || statuses.includes(row.status)).reduce((total, row) => total + Number(row[field] || 0), 0);
const badge = value => `<span class="global-state ${esc(value)}">${esc(states[value] || value || "Sem dados")}</span>`;

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
  let modalOffset = 0;
  let boardSort = "attention";
  let boardQuery = "";
  let boardOffset = 0;
  const pendingDomains = new Set();
  const allowed = () => isGlobalView(getUser(), getWarehouse());
  root.innerHTML = `<div class="page-title"><div><p class="eyebrow">Central de controle</p><h2>VISÃO GERAL — OPERAÇÃO ÁLAMO</h2><p>Acompanhamento consolidado de todos os estoques</p></div><button type="button" class="secondary-button" data-global-refresh>Atualizar Dashboard</button></div>
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
    <div data-global-overview><div class="global-metrics" data-global-metrics></div><div data-global-today></div><div data-global-board></div><div class="global-charts" data-global-charts></div><section class="global-band"><h3>Atividade agora</h3><div data-global-activity></div></section></div>
    <section class="global-band" data-global-details hidden><h3 data-global-detail-title></h3><div data-global-domain-metrics class="global-metrics"></div><div data-global-domain-charts class="global-charts"></div>
      <div class="global-detail-controls"><label>Busca<input type="search" data-detail-search placeholder="Código, SKU, produto ou responsável"></label>
      <label>Situação<select data-filter="mode"><option value="open">Abertas</option><option value="pending">Pendentes</option><option value="running">Em andamento</option><option value="overdue">Atrasadas</option><option value="completed">Concluídas recentes</option></select></label>
      <label><input type="checkbox" data-filter="history"> Incluir canceladas e arquivadas</label></div>
      <div data-global-detail-rows></div><div class="global-pagination"><button type="button" data-global-page="previous">Anterior</button><span data-global-page-label></span><button type="button" data-global-page="next">Próxima</button></div>
    </section>
    <dialog class="global-dialog"><form method="dialog"><button class="secondary-button" aria-label="Fechar detalhes">Fechar</button></form><div data-global-record></div></dialog>`;
  const $ = selector => root.querySelector(selector);
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
  function table(headers, rows) {
    if (!rows.length) return '<p class="empty-state">Nenhum registro neste filtro.</p>';
    return `<div class="global-table-wrap"><table class="global-table"><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(cells => `<tr>${cells.map((cell,i) => `<td data-label="${esc(headers[i])}">${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  function chart(title, entries) {
    const max = Math.max(1,...entries.map(entry => entry.values.reduce((a,b) => a+Number(b.value || 0),0)));
    return `<section><h3>${esc(title)}</h3><ul class="global-bars">${entries.map(entry => `<li><span>${esc(entry.label)}</span><div>${entry.values.map((v,i) => `<span class="series-${i % 3}" style="width:${Math.max(0,Number(v.value || 0))/max*100}%" title="${esc(v.label)}: ${number(v.value)}"></span>`).join("")}</div><small>${entry.values.map(v => `${esc(v.label)}: ${number(v.value)}`).join(" · ")}</small></li>`).join("")}</ul></section>`;
  }
  function byWarehouse(domain, field, statuses) {
    return snapshot.warehouses.map(w => ({ label: w.name, values: [{ label: "Total", value: sum((snapshot[domain]?.summary || []).filter(r => r.warehouse_code === w.code),field,statuses) }] }));
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
        unknown: Object.keys(snapshot.errors).length > 0 };
      stats.attention = stats.unknown ? "SEM_DADOS" : warehouseAttention(stats,config);
      return stats;
    }).sort((a,b) => ({CRITICO:0,ATENCAO:1,SEM_DADOS:2,NORMAL:3}[a.attention]-{CRITICO:0,ATENCAO:1,SEM_DADOS:2,NORMAL:3}[b.attention] || b.overdue-a.overdue || b.pending-a.pending));
  }
  function renderOverview() {
    const tasks = snapshot.tasks?.summary || [], rep = snapshot.replenishment?.summary || [], trans = snapshot.transfers?.summary || [];
    const team = snapshot.team?.rows || [], imports = snapshot.imports?.rows || [];
    const board = boardRows();
    $('[data-global-metrics]').innerHTML = metrics([
      ["Estoques ativos",snapshot.warehouses.length],["Usuários ativos no cadastro",sum(team,"active")],["Disponíveis",sum(team,"available")],["Ocupados",sum(team,"busy")],
      ["Tarefas abertas",sum(tasks,"open")],["Tarefas em andamento",sum(tasks,"open",["EM_ANDAMENTO"])],["Tarefas atrasadas",sum(tasks,"overdue")],
      ["Reposições pendentes",sum(rep,"open",["PENDENTE","ATRIBUIDO"])],["Reposições em separação",sum(rep,"open",["EM_SEPARACAO"])],["Reposições separadas",sum(rep,"open",["SEPARADO"])],
      ["Transferências abertas",sum(trans,"open")],["Transferências em separação",sum(trans,"open",["EM_SEPARACAO"])],["Transferências com divergência",sum(trans,"divergence")],
      ["Importações hoje",sum(imports,"today")],["Falhas no período",sum(imports,"total",["FAILED"])],["Alertas críticos",sum(snapshot.alerts?.summary||[],"critical")]
    ]);
    $('[data-global-today]').innerHTML = `<section class="global-band"><h3>Hoje</h3><div class="global-metrics">${metrics([["Reposições criadas",sum(rep,"created_today")],["Reposições concluídas",sum(rep,"finished_today",["CONCLUIDO"])],["Transferências iniciadas",sum(trans,"started_today")],["Transferências concluídas",sum(trans,"finished_today",["FINALIZADA"])],["Tarefas concluídas",sum(tasks,"finished_today",["CONCLUIDA"])]])}</div></section>`;
    $('[data-global-board]').innerHTML = `<section class="global-band"><h3>Status dos estoques</h3><div class="global-detail-controls"><label>Busca de estoque<input type="search" data-board-search value="${esc(boardQuery)}"></label><label>Ordenar por<select data-board-sort><option value="attention">Necessidade de atenção</option><option value="pending">Mais pendências</option><option value="overdue">Mais atrasos</option><option value="active">Menos pessoas</option><option value="captacao">CAPTAÇÃO mais antiga</option></select></label></div><div data-board-table></div><div class="global-pagination"><button type="button" data-board-page="previous">Anterior</button><span data-board-page-label></span><button type="button" data-board-page="next">Próxima</button></div></section>`;
    $('[data-board-sort]').value=boardSort;
    renderBoard(board);
    $('[data-global-charts]').innerHTML = chart("Reposição por estoque",byWarehouse("replenishment","open")) + chart("Transferências abertas por estoque",byWarehouse("transfers","open")) + chart("Tarefas abertas por estoque",byWarehouse("tasks","open"));
    $('[data-global-errors]').innerHTML = Object.entries(snapshot.errors).map(([key]) => `<p class="inline-status error">Não foi possível carregar ${esc(labels[key] || key)}.</p>`).join("");
    $('[data-global-updated]').textContent = "Atualizado às " + date(snapshot.generated_at) + " · " + service.diagnostics.realtime;
  }
  function renderBoard(board = boardRows()) {
    const key = $('[data-board-sort]').value;
    if (key !== "attention") board.sort((a,b) => key === "captacao" ? new Date(a.batch?.last_completed_at || 0)-new Date(b.batch?.last_completed_at || 0) : key === "active" ? a.active-b.active : b[key]-a[key]);
    board=board.filter(w=>[w.name,w.code].join(" ").toLowerCase().includes(boardQuery.toLowerCase()));
    const total=board.length;board=board.slice(boardOffset,boardOffset+30);
    $('[data-board-table]').innerHTML = table(["Estoque","Situação","Ativos / disponíveis","Tarefas / em andamento","Reposições","Transferências / divergências","Última CAPTAÇÃO","Alertas","Última atividade","Ação"],board.map(w => [
      `${esc(w.name)}<small>${esc(w.code)}</small>`,badge(w.attention),`${w.active} / ${w.available}`,`${w.tasks} / ${w.running}`,number(w.pending),`${w.transfers} / ${w.divergence}`,
      `${badge(w.freshness)}<small>${esc(date(w.batch?.last_completed_at))}</small>`,number(w.alerts),esc(date(w.lastActivity)),`<button type="button" data-open-warehouse="${esc(w.code)}">Abrir estoque</button>`]));
    $('[data-board-page-label]').textContent="Página "+(boardOffset/30+1);$('[data-board-page="previous"]').disabled=boardOffset===0;$('[data-board-page="next"]').disabled=total<=boardOffset+30;
  }
  function renderDomainCharts() {
    const rows = snapshot[tab]?.summary || [];
    let cards = [], charts = "";
    if (["tasks","replenishment","transfers"].includes(tab)) {
      const statuses = [...new Set(rows.map(r => r.status))];
      cards = statuses.map(status => [status,sum(rows,"total",[status])]);
      const groups = new Map();
      for (const r of rows) groups.set(tab === "tasks" ? r.kind : r.status,(groups.get(tab === "tasks" ? r.kind : r.status) || 0)+Number(r.open));
      charts = chart(`${labels[tab]} por estoque`,snapshot.warehouses.map(w => ({ label:w.name, values:(tab === "replenishment" ? ["PENDENTE","EM_SEPARACAO","SEPARADO"] : ["Total"]).map(status => ({label:status,value:sum(rows.filter(r => r.warehouse_code===w.code),"open",status==="Total" ? null : [status])})) })))+
        chart(tab === "tasks" ? "Tarefas por tipo" : `${labels[tab]} por status`,[...groups].map(([label,value]) => ({label,values:[{label:"Abertas",value}]})));
      const measured=snapshot.warehouses.map(w=>{const samples=rows.filter(r=>r.warehouse_code===w.code&&r.average_seconds!=null);const n=sum(samples,"duration_samples");return {label:w.name,values:[{label:"Minutos",value:n ? Math.round(samples.reduce((a,b)=>a+Number(b.average_seconds)*Number(b.duration_samples),0)/n/60) : 0}],measured:n>0};}).filter(entry=>entry.measured);
      if(measured.length)charts+=chart(`Tempo médio de ${labels[tab].toLowerCase()} (minutos)`,measured);
    }
    if (tab === "captacao") {
      const imports=snapshot.imports?.rows || [];
      charts=chart("CAPTAÇÃO: idade da base em horas",snapshot.warehouses.map(w=>{const b=snapshot.captacao?.rows?.find(r=>r.warehouse_code===w.code);return {label:`${w.name} · ${states[captacaoFreshness(b,config)]}`,values:[{label:"Horas",value:b?.last_completed_at ? Math.floor((Date.now()-new Date(b.last_completed_at).getTime())/3600000) : 0}]};}))+chart("Importações nos últimos 7 dias",snapshot.warehouses.map(w=>({label:w.name,values:["COMPLETED","FAILED"].map(status=>({label:status,value:sum(imports.filter(r=>r.warehouse_code===w.code&&r.source_type==="CAPTACAO"),"total",[status])}))})))+
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
    $('[data-global-detail-rows]').textContent="Carregando...";
    renderDomainCharts();
    try {
      const response=await service.getDetails(section,filters(),30,offset,true);
      if (!allowed() || requestEpoch!==epoch || section!==tab) return;
      let rows=response.rows || [];
      if (["team","captacao"].includes(section)) rows=rows.filter(r=>!filters().query||[warehouseLabel(r.warehouse_code),r.warehouse_code,r.file_name||""].join(" ").toLowerCase().includes(filters().query.toLowerCase()));
      if (["team","captacao"].includes(section)) rows=rows.slice(offset,offset+30);
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
        cells=rows.map((r,i)=>[esc(warehouseLabel(r.warehouse_code)),badge(r.alert_type),esc(r.title),esc(age(r.updated_at)),esc(r.action),action(i)]);
      } else if (section==="transfers") {
        headers=["Estoque","Código","Origem / destino","Responsável","Status","SKUs / separados","Divergências","Criada / atualizada","Tempo","Detalhes"];
        cells=rows.map((r,i)=>[esc(warehouseLabel(r.warehouse_code)),esc(r.code),`${esc(r.origin)} / ${esc(r.destination)}`,esc(r.responsible_name||"Sem responsável"),badge(r.status),`${number(r.detail?.skus)} / ${number(r.detail?.separated)}`,number(r.divergence),`${esc(date(r.created_at))}<small>${esc(date(r.updated_at))}</small>`,esc(age(r.created_at)),action(i)]);
      } else {
        headers=["Estoque","Código / SKU","Tipo / produto","Quantidade","Prioridade","Status","Solicitante / responsável","Criada / tempo","SLA","Ação"];
        cells=rows.map((r,i)=>[esc(warehouseLabel(r.warehouse_code)),`${esc(r.code)}<small>${esc(r.sku)}</small>`,`${esc(r.kind)}<small>${esc(r.title)}</small>`,number(r.quantity),badge(r.priority),badge(r.status),`${esc(r.requester||"—")}<small>${esc(r.responsible_name||"Sem responsável")}</small>`,`${esc(date(r.created_at))}<small>${esc(age(r.created_at))}</small>`,r.overdue?badge("CRITICO")+esc(date(r.deadline)):esc(date(r.deadline)),action(i)]);
      }
      const stockWarning=section==="captacao"?'<p class="global-stock-warning">Os saldos são baseados na última atualização da CAPTAÇÃO e podem apresentar divergências em relação ao estoque físico atual.</p>':"";
      $('[data-global-detail-rows]').innerHTML=stockWarning+table(headers,cells);
      $('[data-global-page-label]').textContent="Página "+(offset/30+1);
      $('[data-global-page="previous"]').disabled=offset===0;
      $('[data-global-page="next"]').disabled=!(response.has_more || (response.total>offset+30) || (["team","captacao"].includes(section) && (response.rows||[]).length>offset+30));
    } catch(error) { if (requestEpoch===epoch) $('[data-global-detail-rows]').textContent="Não foi possível carregar "+labels[section]+": "+(error.message||String(error)); }
  }
  async function activity() {
    const version=epoch;
    try { const data=await service.getWarehouseActivity(filters()); if(!allowed()||version!==epoch)return;
      $('[data-global-activity]').innerHTML=table(["Horário","Estoque","Usuário","Atividade"],(data.rows||[]).map(r=>[esc(date(r.updated_at)),esc(warehouseLabel(r.warehouse_code)),esc(r.responsible_name||"Não informado"),`${esc(r.kind)} · ${esc(r.status)}<small>${esc(r.title)}</small>`]));
    } catch { $('[data-global-activity]').textContent="Atividade indisponível."; }
  }
  async function refresh(force = false) {
    if (!allowed()) return;
    if (refreshPromise) return refreshPromise;
    const version=epoch;
    const button=$('[data-global-refresh]');button.disabled=true;
    refreshPromise=(async()=>{
      try { const data=await service.getGlobalOverview(filters(),force); if(!allowed()||version!==epoch)return;
        snapshot=data;
        if (!$('[data-filter="warehouse"]').value) allWarehouses=data.warehouses;
        options();renderOverview();renderDomainCharts();await Promise.all([activity(),loadDetails()]);onSync?.(true);
      } catch(error) { $('[data-global-errors]').textContent="Não foi possível atualizar o Dashboard: "+(error.message||String(error));onSync?.(false); }
      finally { button.disabled=false;refreshPromise=null;if(version!==epoch&&allowed())setTimeout(()=>refresh(true),0); }
    })();
    return refreshPromise;
  }
  function recordDetails(row) {
    modalRecord=row;modalOffset=0;
    const translated={warehouse_code:"Estoque",code:"Código",title:"Título",status:"Status",kind:"Tipo",priority:"Prioridade",responsible_name:"Responsável",requester:"Solicitante",sku:"SKU",quantity:"Quantidade",item_count:"Itens",divergence:"Divergências",origin:"Origem",destination:"Destino",created_at:"Criado em",updated_at:"Atualizado em",deadline:"SLA",file_name:"Arquivo",total_rows:"Linhas",error_message:"Erro",active:"Ativos",available:"Disponíveis",busy:"Ocupados",unavailable:"Indisponíveis",started_at:"Iniciada em",finished_at:"Finalizada em",duration_seconds:"Duração (segundos)",skus:"SKUs",separated:"Separados",packed:"Embalados",notes:"Observações",description:"Descrição",blocked_reason:"Bloqueio",attended:"Atendido",pending:"Pendente",location:"Localização"};
    const fields={...row,...row.detail};
    $('div[data-global-record]').innerHTML=`<h3>${esc(row.title||row.file_name||warehouseLabel(row.warehouse_code))}</h3><dl>${Object.entries(fields).filter(([key,value])=>translated[key]&&value!=null&&typeof value!=="object").map(([key,value])=>`<dt>${esc(translated[key])}</dt><dd>${esc(key.endsWith("_at")||key==="deadline"?date(value):String(value))}</dd>`).join("")}</dl>`;
    if(["team","transfers"].includes(tab)) $('div[data-global-record]').insertAdjacentHTML("beforeend",'<label>Busca no detalhe<input type="search" data-modal-search></label><div data-modal-list></div><div class="global-pagination"><button type="button" data-modal-page="previous">Anterior</button><span data-modal-page-label></span><button type="button" data-modal-page="next">Próxima</button></div>');
    if(row.warehouse_code) $('div[data-global-record]').insertAdjacentHTML("beforeend",`<button type="button" data-open-warehouse="${esc(row.warehouse_code)}">Abrir no estoque</button>`);
    $('.global-dialog').showModal();
    if(["team","transfers"].includes(tab))loadModalDetails();
  }
  async function loadModalDetails() {
    const row=modalRecord,section=tab,version=epoch;
    const container=$('[data-modal-list]');if(!container)return;
    container.textContent="Carregando...";
    try {const data=await service.getDetails(section==="team"?"users":"transfer_items",{...filters(),warehouse:row.warehouse_code,id:row.id,query:$('[data-modal-search]').value},30,modalOffset,true);
      if(!allowed()||version!==epoch||modalRecord!==row)return;
      container.innerHTML=section==="team"?table(["Nome","Perfil","Ativo no cadastro","Disponível","Último login"],data.rows.map(u=>[esc(u.name),esc(u.role),u.active?"Sim":"Não",u.available?"Sim":"Não",esc(date(u.last_login_at))])):
        table(["SKU","Produto","Solicitada","Separada","Lacrada","Divergência","Endereço"],data.rows.map(i=>[esc(i.sku),esc(i.descricao),number(i.quantidade_solicitada),number(i.quantidade_separada),number(i.quantidade_lacrada),i.has_divergence?"Sim":"Não",esc(i.endereco_codigo||"—")]));
      $('[data-modal-page-label]').textContent="Página "+(modalOffset/30+1);$('[data-modal-page="previous"]').disabled=modalOffset===0;$('[data-modal-page="next"]').disabled=data.total<=modalOffset+30;
    }catch(error){container.textContent="Detalhes indisponíveis: "+error.message;}
  }
  root.addEventListener("click",event=>{
    const button=event.target.closest("button");if(!button)return;
    if(button.hasAttribute("data-global-refresh")) refresh(true);
    if(button.dataset.globalTab){tab=button.dataset.globalTab;offset=0;epoch++;root.querySelectorAll('[data-global-tab]').forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.globalTab===tab)));$('[data-global-overview]').hidden=tab!=="overview";$('[data-global-details]').hidden=tab==="overview";loadDetails();}
    if(button.dataset.openWarehouse){$('.global-dialog').close();openWarehouse(button.dataset.openWarehouse);}
    if(button.hasAttribute("data-global-record"))recordDetails(detailRows[Number(button.dataset.globalRecord)]);
    if(button.dataset.globalPage){offset=Math.max(0,offset+(button.dataset.globalPage==="next"?30:-30));epoch++;loadDetails();}
    if(button.dataset.modalPage){modalOffset=Math.max(0,modalOffset+(button.dataset.modalPage==="next"?30:-30));loadModalDetails();}
    if(button.dataset.boardPage){boardOffset=Math.max(0,boardOffset+(button.dataset.boardPage==="next"?30:-30));renderBoard();}
  });
  root.addEventListener("change",event=>{
    if(event.target.hasAttribute("data-board-sort")){boardSort=event.target.value;boardOffset=0;renderBoard();return;}
    if(!event.target.dataset.config && !event.target.dataset.filter)return;
    if(event.target.dataset.config){const key=event.target.dataset.config;config[key]=Math.max(1,Math.min(720,Number(event.target.value)||GLOBAL_DASHBOARD_CONFIG[key]));config.staleHours=Math.max(config.freshHours,config.staleHours);service.invalidate();}
    if(event.target.dataset.filter){root.querySelectorAll('[data-custom]').forEach(el=>el.hidden=$('[data-filter="period"]').value!=="custom");}
    offset=0;boardOffset=0;epoch++;service.invalidate();refresh(true);
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
          snapshot.alerts=await service.getDetails("alerts_summary",filters(),30,0,true);
          snapshot.generated_at=new Date().toISOString();renderOverview();renderDomainCharts();activity();if(domainsToRefresh.includes(tab)||tab==="alerts")loadDetails();
        }catch(error){service.diagnostics.lastError=error.message;}
      },1500);
    });
    channel.subscribe(status=>{service.diagnostics.realtime=status==="SUBSCRIBED"?"Ao vivo":"Atualização periódica";onSync?.(status==="SUBSCRIBED");});
    timer=window.setInterval(()=>{if(document.visibilityState!=="hidden"&&allowed())refresh(true);},60000);
  }
  function stop() {live=false;epoch++;window.clearInterval(timer);clearTimeout(debounce);if(channel)client.removeChannel(channel);channel=null;service.clear();snapshot={warehouses:[],errors:{}};allWarehouses=[];service.diagnostics.realtime="Parado";}
  return {start,stop,refresh,diagnostics:service.diagnostics};
}
