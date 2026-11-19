import './view.css';
import { synchronizeEvidence } from './synchronization.js';

const CRITERIA = {
 EXECUCAO:{label:'Execução',icon:'◎',color:'#16a45a'},
 QUALIDADE:{label:'Qualidade',icon:'◇',color:'#16a45a'},
 INICIATIVA:{label:'Iniciativa',icon:'◉',color:'#1269dd'},
 ORGANIZACAO:{label:'Organização',icon:'▱',color:'#1269dd'},
 TRABALHO_EQUIPE:{label:'Trabalho em equipe',icon:'♙',color:'#1269dd'},
 TRABALHO_EM_EQUIPE:{label:'Trabalho em equipe',icon:'♙',color:'#1269dd'},
 POSTURA:{label:'Postura',icon:'☆',color:'#1269dd'}
};

const ROLE_LABELS={ADMINISTRADOR:'Administrador',SUPERVISOR:'Supervisor',OPERADOR:'Operador de Logística',ATENDENTE:'Atendente',CAIXA:'Caixa'};
const STATUS_LABELS={DRAFT:'Rascunho',ACTIVE:'Em andamento',CLOSED:'Fechado',ARCHIVED:'Arquivado'};

export async function mountExcellence(root,{service,actorId,leader,admin}){
 let cycles=[],cycle=null,directory=[],person=actorId,dashboard=null,team=null,monitoring=null,currentView='performance';
 root.classList.add('excellence-app');

 const node=(tag,text,cls)=>{
  const el=document.createElement(tag);
  if(text!==undefined&&text!==null)el.textContent=String(text);
  if(cls)el.className=cls;
  return el;
 };
 const icon=(text,cls='ex-tab-icon')=>node('span',text,cls);
 const warehouseLabel=()=>document.getElementById('topWarehouseCode')?.textContent?.trim()||document.getElementById('sidebarWarehouseCode')?.textContent?.replace(/^Estoque:\s*/i,'').trim()||'Estoque';
 const loggedName=()=>document.getElementById('topUserName')?.textContent?.trim()||document.getElementById('sidebarUserName')?.textContent?.trim()||'Usuário';
 const clamp=(value,min=0,max=100)=>Math.max(min,Math.min(max,Number(value)||0));
 const fmt=(value,digits=0)=>value===null||value===undefined||Number.isNaN(Number(value))?'N/D':Number(value).toFixed(digits).replace('.',',');
 const dateOnly=value=>{
  if(!value)return 'N/D';
  const raw=String(value).slice(0,10).split('-');
  return raw.length===3?raw.reverse().join('/'):String(value);
 };
 const dateTime=value=>{
  if(!value)return 'N/D';
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return String(value);
  return d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
 };
 const monthLabel=value=>{
  if(!value)return 'Sem ciclo';
  const raw=String(value).slice(0,10).split('-');
  if(raw.length!==3)return value;
  const names=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return (names[Number(raw[1])-1]||raw[1])+' / '+raw[0];
 };
 const criterionInfo=id=>CRITERIA[id]||{label:String(id||'Critério').replaceAll('_',' '),icon:'•',color:'#1269dd'};
 const badge=(text,tone='neutral')=>node('span',text,'ex-badge '+tone);
 const confidenceTone=value=>{
  const v=String(value||'').toUpperCase();
  if(v.includes('ALTA')||v.includes('HIGH'))return 'high';
  if(v.includes('BAIXA')||v.includes('LOW'))return 'low';
  return 'medium';
 };
 const confidenceLabel=value=>{
  const v=String(value||'').toUpperCase();
  if(v.includes('ALTA')||v.includes('HIGH'))return 'Alta';
  if(v.includes('BAIXA')||v.includes('LOW'))return 'Baixa';
  if(!v||v==='N/D')return 'N/D';
  return 'Média';
 };
 const coverageFromCount=count=>Number(count)>=12?['Boa','good']:Number(count)>=5?['Média','medium']:['Baixa','low'];
 const cycleStatus=()=>{
  if(!cycle)return ['Sem ciclo','neutral'];
  if(dashboard?.cycle?.status==='CLOSED'||cycle.status==='CLOSED')return ['Fechado','neutral'];
  if((dashboard?.calibrations||[]).length)return ['Em calibração','active'];
  if(cycle.enabled||cycle.status==='ACTIVE')return ['Em andamento','active'];
  return [STATUS_LABELS[cycle.status]||cycle.status||'Rascunho','medium'];
 };
 const selectedUser=()=>directory.find(row=>row.id===person)||{id:person,name:person===actorId?loggedName():'Colaborador',role:''};
 const normalizeScoreParts=result=>{
  const rows=result?.criteria||[];
  const auto=rows.reduce((sum,row)=>sum+(Number(row.automatic)||0),0);
  const assisted=rows.reduce((sum,row)=>sum+(Number(row.assisted)||0),0);
  const autoMax=rows.reduce((sum,row)=>sum+(Number(row.automaticMaximum)||0),0);
  const assistedMax=rows.reduce((sum,row)=>sum+(Number(row.assistedMaximum)||0),0);
  return {
   autoPoints:auto,
   assistedPoints:assisted,
   autoMax,
   assistedMax,
   wms:autoMax>0?auto/autoMax*100:null,
   leadership:assistedMax>0?assisted/assistedMax*100:null,
   autoWeight:autoMax+assistedMax>0?autoMax/(autoMax+assistedMax)*100:0,
   leadershipWeight:autoMax+assistedMax>0?assistedMax/(autoMax+assistedMax)*100:0
  };
 };
 const evidenceSource=row=>{
  const table=String(row?.source_table||'').toLowerCase();
  const type=String(row?.event_type||'').toUpperCase();
  if(table.includes('replenishment')||type.includes('REPLENISHMENT'))return {key:'replenishment',label:'Reposição',icon:'▣'};
  if(table.includes('transfer')||type.includes('TRANSFER'))return {key:'transfer',label:'Transferência',icon:'⇄'};
  if(table.includes('initiative')||type.includes('INITIATIVE'))return {key:'initiative',label:'Iniciativa',icon:'◇'};
  if(table.includes('tarefa')||table.includes('task')||type.includes('TASK'))return {key:'task',label:'Tarefas',icon:'☑'};
  return {key:'other',label:'WMS',icon:'◫'};
 };
 const eventTitle=row=>{
  const names={
   REPLENISHMENT_REQUEST_PROCESSED:'Reposição solicitada',
   REPLENISHMENT_COMPLETION_RECORDED:'Reposição concluída',
   REPLENISHMENT_COMPLETED_FULL:'Reposição concluída',
   REPLENISHMENT_COMPLETED_PARTIAL:'Reposição parcial concluída',
   REPLENISHMENT_COMPLETED:'Reposição concluída',
   REPLENISHMENT_NO_STOCK:'Reposição sem estoque',
   REPLENISHMENT_RETURNED_TO_QUEUE:'Reposição devolvida à fila',
   REPLENISHMENT_ASSIGNED:'Reposição em atendimento',
   STANDARD_TASK_VALIDATED:'Tarefa validada'
  };
  return names[row?.event_type]||String(row?.event_type||'Evidência registrada').replaceAll('_',' ');
 };
 const evidenceCriterion=row=>criterionInfo(row?.metadata?.criterion||row?.metadata?.verification_fact?.criterion||row?.metadata?.excellence_criterion||'EXECUCAO').label;
 const evidenceImpact=row=>{
  if(row?.event_type==='STANDARD_TASK_VALIDATED'){
   const complexity=row?.metadata?.task_fact?.complexity||row?.metadata?.excellence_complexity;
   const points={SIMPLES:1,INTERMEDIARIA:2,COMPLEXA:3}[complexity];
   if(points)return '+'+points;
  }
  if(row?.metadata?.verification_fact?.result==='CONFORME')return 'Validada';
  return 'Registrada';
 };
 const initiativeStatus=row=>{
  const status=String(row?.status||'').toUpperCase();
  if(status==='VALIDATED')return ['Validada','validated'];
  if(status==='REJECTED')return ['Não validada','rejected'];
  if(status==='REGISTERED')return ['Em análise','analysis'];
  return [row?.status||'Pendente','pending'];
 };
 const makeButton=(label,action,cls='secondary-button')=>{
  const btn=node('button',label,cls);btn.type='button';
  btn.onclick=async()=>{btn.disabled=true;try{await action();}catch(error){setStatus(error.message||'Não foi possível concluir a ação.');}finally{btn.disabled=false;}};
  return btn;
 };
 const status=node('p','', 'ex-status');
 const shell=node('section',undefined,'ex-shell');
 root.replaceChildren(shell);

 function setStatus(message=''){status.textContent=message;}

 async function rpc(action,data={}){
  setStatus('Atualizando…');
  try{
   const result=await service.rpc(action,{cycle_id:cycle?.id,user_id:person,...data});
   setStatus('');
   return result;
  }catch(error){
   setStatus(error.message||'Não foi possível atualizar.');
   throw error;
  }
 }

 function renderHeader(){
  const header=node('header',undefined,'ex-module-header');
  const left=node('div',undefined,'ex-title-wrap');
  left.append(icon('🏆','ex-trophy'));
  const title=node('div');title.append(node('h1','Logística de Excelência'),node('p','Avaliação de desempenho, evidências e reconhecimento da equipe'));
  left.append(title);
  const meta=node('div',undefined,'ex-header-meta');
  const wh=node('div',undefined,'ex-header-chip');wh.append(icon('▦'),node('div'));
  wh.lastChild.append(node('small','Estoque'),node('strong',warehouseLabel()));
  const user=node('div',undefined,'ex-header-chip');user.append(icon('●'),node('div'));
  user.lastChild.append(node('small',admin?'Administrador':leader?'Liderança':'Usuário'),node('strong',loggedName()));
  meta.append(wh,user);header.append(left,meta);shell.append(header);
 }

 const tabHost=node('nav',undefined,'ex-tabs');
 const page=node('div',undefined,'ex-page');
 const views={};
 const tabs=[];
 function addTab(id,label,ico,visible=true){
  if(!visible)return;
  const btn=node('button',undefined,'ex-tab');btn.type='button';btn.dataset.view=id;btn.append(icon(ico),node('span',label));
  btn.onclick=()=>switchView(id);tabHost.append(btn);tabs.push(btn);
 }
 function switchView(id){
  currentView=id;
  for(const [key,el] of Object.entries(views))el.hidden=key!==id;
  for(const btn of tabs)btn.classList.toggle('is-active',btn.dataset.view===id);
  if(id==='team')renderTeamView();
  if(id==='evidence')renderEvidenceView();
  if(id==='initiatives')renderInitiativesView();
  if(id==='calibration')renderCalibrationView();
  if(id==='cycles')renderCyclesView();
  window.scrollTo({top:0,behavior:'smooth'});
 }
 function initLayout(){
  renderHeader();
  addTab('performance','Meu Desempenho','♙');
  addTab('team','Visão da Equipe','♚',leader);
  addTab('evidence','Evidências','▱');
  addTab('initiatives','Iniciativas','◉');
  addTab('calibration','Calibração','☷',leader);
  addTab('cycles','Ciclos e Critérios','▣',leader);
  shell.append(tabHost,page);
  for(const id of ['performance','team','evidence','initiatives','calibration','cycles']){
   const view=node('section',undefined,id==='performance'?'ex-view':'ex-view ex-secondary-view');
   view.dataset.view=id;view.hidden=id!=='performance';page.append(view);views[id]=view;
  }
  page.append(status);
 }

 function renderProfileStrip(host){
  const user=selectedUser();
  const strip=node('section',undefined,'ex-card ex-profile-strip');
  const who=node('div',undefined,'ex-profile-cell');
  const personBox=node('div',undefined,'ex-person');personBox.append(node('div','●','ex-avatar'));
  const personText=node('div');personText.append(node('strong',user.name||user.id||'Colaborador'));
  personText.append(node('small',(ROLE_LABELS[user.role]||user.role||'Equipe')+' · '+warehouseLabel()));
  personBox.append(personText);who.append(personBox);

  const cycleCell=node('div',undefined,'ex-profile-cell');
  const cycleBox=node('div');cycleBox.append(node('span','Ciclo atual','ex-meta-label'),node('strong',cycle?monthLabel(cycle.start_date):'Sem ciclo','ex-meta-value'));
  cycleBox.append(node('span',cycle?(dateOnly(cycle.start_date)+' a '+dateOnly(cycle.end_date)):'Acompanhamento operacional ativo','ex-meta-sub'));
  cycleCell.append(cycleBox);

  const statusCell=node('div',undefined,'ex-profile-cell');
  const statusBox=node('div');statusBox.append(node('span','Status do ciclo','ex-meta-label'));
  const [statusText,statusTone]=cycleStatus();statusBox.append(badge(statusText,statusTone));statusCell.append(statusBox);

  const trustCell=node('div',undefined,'ex-profile-cell');
  const trustBox=node('div',undefined,'ex-badge-stack');
  const evidenceCount=dashboard?.evidence?.length||0;
  const [coverage,cTone]=coverageFromCount(evidenceCount);
  trustBox.append(node('span','Cobertura de evidências','ex-meta-label'),badge(cycle?coverage:'N/D',cycle?cTone:'neutral'));
  trustBox.append(node('span','Confiança da avaliação','ex-meta-label'),badge(cycle?confidenceLabel(dashboard?.calculation?.confidence):'N/D',cycle?confidenceTone(dashboard?.calculation?.confidence):'neutral'));
  trustCell.append(trustBox);
  strip.append(who,cycleCell,statusCell,trustCell);host.append(strip);
 }

 function scoreCard(result){
  const card=node('section',undefined,'ex-card ex-score-card');
  card.append(node('h3','Nota preliminar','ex-card-title'));
  const body=node('div',undefined,'ex-score-body');
  const score=result?.score;
  const big=node('div',undefined,'ex-score-number');
  if(score===null||score===undefined)big.append(document.createTextNode('N/D'));
  else big.append(document.createTextNode(fmt(score,0)),node('small','/100'));
  const donut=node('div',undefined,'ex-donut');donut.style.setProperty('--score',clamp(score??0));donut.append(node('strong',score===null||score===undefined?'N/D':fmt(score,0)+'%'));
  body.append(big,donut);card.append(body);
  const parts=normalizeScoreParts(result);
  const components=node('div',undefined,'ex-score-components');
  const line1=node('div',undefined,'ex-score-line');line1.append(icon('▤'),node('span','Nota operacional (WMS - '+fmt(parts.autoWeight,0)+'%)'),node('strong',parts.wms===null?'N/D':fmt(parts.wms,0)));
  const line2=node('div',undefined,'ex-score-line');line2.append(icon('♙'),node('span','Nota da liderança ('+fmt(parts.leadershipWeight,0)+'%)'),node('strong',parts.leadership===null?'N/D':fmt(parts.leadership,0)));
  components.append(line1,line2);card.append(components);
  return card;
 }

 function criteriaCard(result){
  const card=node('section',undefined,'ex-card ex-criteria-card');
  const head=node('div',undefined,'ex-panel-head');head.append(node('h3','Desempenho por critério','ex-card-title'),node('small','Peso'));
  card.append(head);
  const list=node('div',undefined,'ex-criteria-list');
  for(const row of result?.criteria||[]){
   const info=criterionInfo(row.id);
   const value=(Number(row.automatic)||0)+(Number(row.assisted)||0);
   const max=(Number(row.automaticMaximum)||0)+(Number(row.assistedMaximum)||0);
   const pct=max>0?clamp(value/max*100):0;
   const item=node('div',undefined,'ex-criterion');
   const i=node('span',info.icon,'ex-criterion-icon');i.style.color=info.color;
   const bar=node('div',undefined,'ex-progress');bar.style.setProperty('--bar',info.color);bar.style.setProperty('--pct',pct+'%');bar.append(node('span'));
   item.append(i,node('span',info.label,'ex-criterion-name'),bar,node('span',fmt(value,0)+' / '+fmt(max,0),'ex-criterion-value'),node('span',fmt(row.weight??max,0)+'%','ex-criterion-weight'));
   list.append(item);
  }
  if(!(result?.criteria||[]).length)list.append(node('div','Critérios ainda não disponíveis.','ex-empty'));
  card.append(list);return card;
 }

 function insightCards(result){
  const grid=node('div',undefined,'ex-insight-grid');
  const scored=(result?.criteria||[]).map(row=>{
   const max=(Number(row.automaticMaximum)||0)+(Number(row.assistedMaximum)||0);
   const value=(Number(row.automatic)||0)+(Number(row.assisted)||0);
   return {...row,pct:max>0?value/max*100:null,label:criterionInfo(row.id).label};
  }).filter(row=>row.pct!==null).sort((a,b)=>b.pct-a.pct);
  const strengths=scored.slice(0,3);
  const development=[...scored].reverse().slice(0,2);
  const good=node('section',undefined,'ex-card ex-insight positive');good.append(node('h3','👍  Pontos fortes'));
  const gl=node('ul');
  for(const row of strengths)gl.append(node('li','Bom desempenho em '+row.label+' ('+fmt(row.pct,0)+'%).'));
  if(!strengths.length)gl.append(node('li','Aguardando evidências suficientes para destacar pontos fortes.'));
  good.append(gl);
  const dev=node('section',undefined,'ex-card ex-insight development');dev.append(node('h3','↗  Pontos em desenvolvimento'));
  const dl=node('ul');
  for(const row of development)dl.append(node('li','Ampliar consistência em '+row.label+'.'));
  if(!development.length)dl.append(node('li','Aguardando evidências suficientes para identificar oportunidades.'));
  dev.append(dl);grid.append(good,dev);return grid;
 }

 function renderTeamTable(host,rows,compact=false){
  const wrap=node('div',undefined,'ex-table-wrap'),table=node('table',undefined,'ex-table');
  const thead=node('thead'),trh=node('tr');
  for(const title of ['Colaborador','Nota WMS','Nota Liderança','Nota Proposta','Cobertura','Confiança'])trh.append(node('th',title));
  thead.append(trh);table.append(thead);
  const tbody=node('tbody');
  const selectedRows=compact?(rows||[]).slice(0,5):(rows||[]);
  for(const member of selectedRows){
   const r=member.calculation||{},parts=normalizeScoreParts(r);
   const tr=node('tr');if(member.user_id===person)tr.classList.add('is-selected');
   const [cov,covTone]=coverageFromCount(member.evidenceCount||0);
   const values=[
    node('strong',member.name||member.user_id),
    node('span',parts.wms===null?'N/D':fmt(parts.wms,0)),
    node('span',parts.leadership===null?'N/D':fmt(parts.leadership,0)),
    node('strong',r.score===null||r.score===undefined?'N/D':fmt(r.score,0)),
    badge(cov,covTone),
    badge(confidenceLabel(r.confidence),confidenceTone(r.confidence))
   ];
   for(const value of values){const td=node('td');td.append(value);tr.append(td);}
   if(leader){
    tr.style.cursor='pointer';
    tr.onclick=async()=>{person=member.user_id;await loadDashboard();switchView('performance');};
   }
   tbody.append(tr);
  }
  if(!selectedRows.length){const tr=node('tr'),td=node('td','Nenhum dado de equipe disponível.','ex-empty');td.colSpan=6;tr.append(td);tbody.append(tr);}
  table.append(tbody);wrap.append(table);host.append(wrap);
 }

 function teamCard(){
  const card=node('section',undefined,'ex-card ex-team-card');
  const head=node('div',undefined,'ex-panel-head');
  const title=node('h3','Visão da Equipe','ex-card-title');
  if(cycle)title.append(document.createTextNode(' '));title.append(node('small',cycle?'(Ciclo: '+monthLabel(cycle.start_date)+')':''));
  head.append(title);
  if(leader)head.append(makeButton('Ver equipe completa →',()=>Promise.resolve(switchView('team')),'ex-text-link'));
  card.append(head);
  renderTeamTable(card,team?.rows||[],true);return card;
 }

 async function registerInitiative(){
  const title=window.prompt('Título da iniciativa:');if(!title)return;
  const description=window.prompt('Ação realizada e resultado esperado/obtido:');if(!description)return;
  await rpc('INITIATIVE',{title,description});await loadDashboard();
 }
 function initiativesCard(compact=true){
  const card=node('section',undefined,'ex-card ex-initiatives-card');
  const rows=dashboard?.initiatives||[];
  const head=node('div',undefined,'ex-panel-head');head.append(node('h3',(person===actorId?'Minhas iniciativas':'Iniciativas')+' ('+rows.length+')','ex-card-title'));
  if(person===actorId)head.append(makeButton('+ Registrar iniciativa',registerInitiative,'ex-primary-small'));
  card.append(head);
  const list=node('div',undefined,'ex-initiative-list');
  for(const row of (compact?rows.slice(0,3):rows)){
   const [label,tone]=initiativeStatus(row),item=node('div',undefined,'ex-initiative '+(tone==='analysis'||tone==='pending'?'is-pending':''));
   item.append(node('div',tone==='validated'?'✓':'◷','ex-initiative-icon'));
   const text=node('div');text.append(node('strong',row.title||'Iniciativa'),node('small',(label==='Validada'?'Validada':'Status')+(row.created_at?' · '+dateOnly(row.created_at):'')));
   item.append(text,badge(label,tone));list.append(item);
  }
  if(!rows.length)list.append(node('div','Nenhuma iniciativa registrada neste ciclo.','ex-empty'));
  card.append(list);return card;
 }

 function evidenceRowsBySource(source='all'){
  const rows=dashboard?.evidence||[];
  if(source==='all')return rows;
  return rows.filter(row=>evidenceSource(row).key===source);
 }
 async function showOrigin(row,button){
  if(!['wms_replenishment_requests','wms_replenishment_participation_events'].includes(row.source_table)){
   const previous=button.closest('tr')?.nextElementSibling;
   if(previous?.dataset?.evidenceDetail==='true')previous.remove();
   const tr=node('tr');tr.dataset.evidenceDetail='true';const td=node('td',row.description||'Registro de evidência sem detalhe adicional.','ex-detail-panel');td.colSpan=6;tr.append(td);button.closest('tr')?.after(tr);return;
  }
  const origin=await rpc('ORIGIN',{evidence_id:row.id});
  const old=button.closest('tr')?.nextElementSibling;if(old?.dataset?.evidenceDetail==='true')old.remove();
  const tr=node('tr');tr.dataset.evidenceDetail='true';const td=node('td',undefined,'ex-detail-panel');td.colSpan=6;
  if(!origin?.available)td.textContent=origin?.message||'Registro original indisponível.';
  else td.textContent='SKU '+origin.sku+' · '+origin.status+' · Solicitada '+(origin.requested??'N/D')+' · Atendida '+(origin.attended??'N/D')+' · Pendente '+(origin.pending??'N/D')+' · Conclusão '+(origin.finished_at?dateTime(origin.finished_at):'não concluída');
  tr.append(td);button.closest('tr')?.after(tr);
 }
 function renderEvidenceTable(host,{limit=0,withFilter=false}={}){
  let filter='all';
  const block=node('div');
  const head=node('div',undefined,'ex-panel-head');head.append(node('h3','Evidências recentes'+(dashboard?.evidence?.length?' ('+dashboard.evidence.length+' no ciclo)':''),'ex-card-title'));
  let select=null;
  if(withFilter){
   select=node('select',undefined,'ex-filter-select');
   for(const [value,label] of [['all','Todas as fontes'],['replenishment','Reposição'],['task','Tarefas'],['transfer','Transferência'],['initiative','Iniciativa'],['other','Outras']]){const option=node('option',label);option.value=value;select.append(option);}
   head.append(select);
  }
  block.append(head);
  const wrap=node('div',undefined,'ex-table-wrap');block.append(wrap);
  const draw=()=>{
   wrap.replaceChildren();
   const table=node('table',undefined,'ex-table'),thead=node('thead'),hr=node('tr');
   for(const title of ['Data / Hora','Origem','Evento / Descrição','Critério','Impacto','Ação'])hr.append(node('th',title));thead.append(hr);table.append(thead);
   const tbody=node('tbody');let rows=evidenceRowsBySource(filter);if(limit)rows=rows.slice(0,limit);
   for(const row of rows){
    const tr=node('tr'),source=evidenceSource(row);
    const c1=node('td',dateTime(row.evidence_date));
    const c2=node('td');const origin=node('span',undefined,'ex-origin '+source.key);origin.append(icon(source.icon),node('span',source.label));c2.append(origin);
    const c3=node('td');c3.append(node('strong',eventTitle(row)));if(row.description)c3.append(node('small',row.description));
    const c4=node('td',evidenceCriterion(row));
    const c5=node('td');c5.append(node('span',evidenceImpact(row),'ex-impact'));
    const c6=node('td');const btn=makeButton('Ver origem ↗',()=>showOrigin(row,btn),'ex-origin-button');c6.append(btn);
    tr.append(c1,c2,c3,c4,c5,c6);tbody.append(tr);
   }
   if(!rows.length){const tr=node('tr'),td=node('td','Nenhuma evidência disponível para este filtro.','ex-empty');td.colSpan=6;tr.append(td);tbody.append(tr);}
   table.append(tbody);wrap.append(table);
  };
  if(select)select.onchange=()=>{filter=select.value;draw();};
  draw();host.append(block);
 }

 function summaryCard(){
  const rows=dashboard?.evidence||[];
  const counts={
   evidence:rows.length,
   replenishment:new Set(rows.filter(row=>evidenceSource(row).key==='replenishment').map(row=>row.source_id)).size,
   task:new Set(rows.filter(row=>evidenceSource(row).key==='task').map(row=>row.source_id)).size,
   transfer:new Set(rows.filter(row=>evidenceSource(row).key==='transfer').map(row=>row.source_id)).size
  };
  const card=node('section',undefined,'ex-card ex-cycle-summary');card.append(node('h3','Resumo do ciclo','ex-card-title'));
  const grid=node('div',undefined,'ex-summary-grid');
  for(const [ico,value,label] of [['▣',counts.evidence,'Evidências'],['☑',counts.replenishment,'Reposições'],['▱',counts.task,'Tarefas'],['⇄',counts.transfer,'Transferências']]){
   const item=node('div',undefined,'ex-summary-item');item.append(node('span',ico,'ex-summary-icon'),node('strong',value),node('span',label));grid.append(item);
  }
  card.append(grid);return card;
 }

 function renderOperationalMonitoring(host){
  if(!leader||!monitoring)return;
  const card=node('section',undefined,'ex-card ex-secondary-card');card.style.marginTop='14px';
  const head=node('div',undefined,'ex-panel-head');head.append(node('h3','Atividades já contabilizadas no WMS','ex-card-title'),node('small','Acompanhamento automático · não é nota'));
  card.append(head);
  const totals=monitoring.totals||{},kpis=node('div',undefined,'ex-monitor-kpis');
  for(const [label,value] of [['Reposições executadas',totals.replenishments_handled],['Unidades repostas',totals.replenishment_units],['Itens em transferências',totals.transfer_items],['Registros observados',totals.activity_records]]){
   const k=node('div',undefined,'ex-monitor-kpi');k.append(node('small',label),node('strong',value??0));kpis.append(k);
  }
  card.append(kpis);
  const wrap=node('div',undefined,'ex-table-wrap'),table=node('table',undefined,'ex-table'),thead=node('thead'),hr=node('tr');
  for(const title of ['Colaborador','Repos. solicitadas','Repos. executadas','Unid. repostas','Itens transferência','Transf. finalizadas','Tarefas','Rotinas'])hr.append(node('th',title));thead.append(hr);table.append(thead);
  const tbody=node('tbody');
  for(const row of monitoring.people||[]){
   const tr=node('tr');
   for(const value of [row.name,row.replenishments_requested,row.replenishments_handled,row.replenishment_units,row.transfer_items,row.transfers_finalized,row.tasks_completed,row.standard_tasks_completed])tr.append(node('td',value??0));
   tbody.append(tr);
  }
  table.append(tbody);wrap.append(table);card.append(wrap);
  card.append(node('p','Esses números vêm das ações já executadas no WMS e não exigem lançamento duplicado pela equipe.','ex-meta-sub'));
  host.append(card);
 }

 function renderNoCyclePerformance(){
  const host=views.performance;host.replaceChildren();renderProfileStrip(host);
  const card=node('section',undefined,'ex-card ex-secondary-card');card.style.marginTop='14px';
  card.append(node('h3','Acompanhamento operacional ativo','ex-card-title'),node('p','Não existe ciclo formal de avaliação ativo. As atividades já registradas no WMS continuam sendo contabilizadas normalmente.'));
  host.append(card);renderOperationalMonitoring(host);
 }

 function renderPerformance(){
  const host=views.performance;host.replaceChildren();renderProfileStrip(host);
  if(!cycle||!dashboard?.calculation){renderNoCyclePerformance();return;}
  const grid=node('div',undefined,'ex-main-grid'),left=node('div',undefined,'ex-left-stack'),right=node('div',undefined,'ex-right-stack');
  const scoreGrid=node('div',undefined,'ex-score-grid');scoreGrid.append(scoreCard(dashboard.calculation),criteriaCard(dashboard.calculation));left.append(scoreGrid,insightCards(dashboard.calculation));
  const evidenceCard=node('section',undefined,'ex-card ex-evidence-card');renderEvidenceTable(evidenceCard,{limit:4,withFilter:true});left.append(evidenceCard);
  if(leader)right.append(teamCard());
  right.append(initiativesCard(true),summaryCard());
  grid.append(left,right);host.append(grid);renderOperationalMonitoring(host);
 }

 function renderTeamView(){
  const host=views.team;if(!leader)return;
  host.replaceChildren();
  const card=node('section',undefined,'ex-card ex-secondary-card');
  const head=node('div',undefined,'ex-panel-head');head.append(node('h2','Visão completa da equipe','ex-card-title'),node('small',cycle?monthLabel(cycle.start_date):'Sem ciclo'));
  card.append(head);renderTeamTable(card,team?.rows||[],false);host.append(card);
 }

 function renderEvidenceView(){
  const host=views.evidence;host.replaceChildren();
  const card=node('section',undefined,'ex-card ex-secondary-card');renderEvidenceTable(card,{limit:0,withFilter:true});host.append(card);
  if(leader&&cycle&&person!==actorId){
   const note=node('section',undefined,'ex-card ex-secondary-card');note.style.marginTop='14px';
   note.append(node('h3','Verificação independente','ex-card-title'),node('p','A validação de qualidade e organização permanece disponível nos registros individuais. Abra a origem da evidência antes de registrar qualquer avaliação.'));
   const eligible=(dashboard?.evidence||[]).filter(row=>row.id);
   for(const row of eligible.slice(0,10)){
    const form=node('form',undefined,'ex-management-block');form.append(node('strong',eventTitle(row)),node('small',row.description||''));
    const criterion=node('select');for(const value of ['QUALIDADE','ORGANIZACAO']){const o=node('option',criterionInfo(value).label);o.value=value;criterion.append(o);}
    const result=node('select');for(const [value,label] of [['CONFORME','Conforme'],['NAO_CONFORME','Não conforme']]){const o=node('option',label);o.value=value;result.append(o);}
    const justification=node('textarea');justification.placeholder='Fundamento verificável';justification.required=true;justification.maxLength=1000;
    const submit=node('button','Registrar verificação','secondary-button');submit.type='submit';
    const fields=node('div',undefined,'ex-form-grid');const l1=node('label','Critério');l1.append(criterion);const l2=node('label','Resultado');l2.append(result);fields.append(l1,l2);
    form.append(fields,justification,submit);
    form.onsubmit=async event=>{event.preventDefault();submit.disabled=true;try{await rpc('REVIEW_EVIDENCE',{evidence_id:row.id,criterion_id:criterion.value,result:result.value,justification:justification.value.trim()});await loadDashboard();switchView('evidence');}finally{submit.disabled=false;}};
    note.append(form);
   }
   host.append(note);
  }
 }

 function renderInitiativesView(){
  const host=views.initiatives;host.replaceChildren();
  const card=initiativesCard(false);host.append(card);
  if(leader&&person!==actorId){
   const pending=(dashboard?.initiatives||[]).filter(row=>row.status==='REGISTERED');
   if(pending.length){
    const review=node('section',undefined,'ex-card ex-secondary-card');review.style.marginTop='14px';review.append(node('h3','Análise da liderança','ex-card-title'));
    for(const row of pending){
     const block=node('div',undefined,'ex-management-block');block.append(node('strong',row.title),node('p',row.description));
     const actions=node('div',undefined,'ex-management-actions');
     actions.append(makeButton('Validar iniciativa',async()=>{const justification=window.prompt('Justificativa da validação:');if(!justification)return;await rpc('VALIDATE_INITIATIVE',{initiative_id:row.id,decision:'VALIDATED',justification});await loadDashboard();switchView('initiatives');}));
     actions.append(makeButton('Não validar',async()=>{const justification=window.prompt('Justificativa:');if(!justification)return;await rpc('VALIDATE_INITIATIVE',{initiative_id:row.id,decision:'REJECTED',justification});await loadDashboard();switchView('initiatives');}));
     block.append(actions);review.append(block);
    }
    host.append(review);
   }
  }
 }

 function renderCalibrationView(){
  const host=views.calibration;if(!leader)return;host.replaceChildren();
  const card=node('section',undefined,'ex-card ex-secondary-card');card.append(node('h2','Calibração','ex-card-title'));
  if(!cycle||!dashboard){card.append(node('div','Crie e ative um ciclo para usar a calibração.','ex-empty'));host.append(card);return;}
  const result=dashboard.calculation;
  card.append(node('p','Cobertura: '+(result?.days??0)+' dias · '+(result?.sources??0)+' fontes. Confiança: '+confidenceLabel(result?.confidence)+'.'));
  const actions=node('div',undefined,'ex-management-actions');
  actions.append(makeButton('Registrar proposta de calibração',async()=>{const score=window.prompt('Nota proposta (0–100):');if(score===null)return;const justification=window.prompt('Justificativa da proposta:');if(!justification)return;await rpc('CALIBRATION',{score:Number(score),justification});await loadDashboard();switchView('calibration');}));
  if(admin&&cycle.status!=='CLOSED')actions.append(makeButton('Fechar ciclo revisado',async()=>{if(!window.confirm('Fechar o ciclo '+cycle.name+'? O histórico ficará imutável.'))return;await rpc('CLOSE');await reloadAll();switchView('calibration');},'danger-button'));
  card.append(actions);
  const history=node('div',undefined,'ex-management-block');history.append(node('h3','Histórico'));
  for(const row of dashboard.calibrations||[])history.append(node('p',(row.previous_score??'N/D')+' → '+row.new_score+' · '+row.justification));
  if(!(dashboard.calibrations||[]).length)history.append(node('p','Nenhuma calibração registrada.'));
  card.append(history);host.append(card);
 }

 async function renderTaskCatalog(host){
  const block=node('section',undefined,'ex-card ex-management-block');block.append(node('h3','Tarefas avaliadas'));
  let templates=[];
  try{templates=await service.taskTemplates();}catch(error){block.append(node('p',error.message));host.append(block);return;}
  for(const template of templates){
   const row=node('div',undefined,'ex-management-block');row.append(node('strong',template.title),node('p',(template.description||'')+' · '+template.cadence+' · '+criterionInfo(template.criterion_id).label+' · '+template.complexity));
   const actions=node('div',undefined,'ex-management-actions');actions.append(makeButton(template.active?'Desativar':'Ativar',async()=>{await service.setTaskTemplateActive(template.id,!template.active);await renderCyclesView();}));row.append(actions);block.append(row);
  }
  const form=node('form',undefined,'ex-management-block');form.append(node('h4','Adicionar nova tarefa avaliada'));
  const title=node('input');title.required=true;title.maxLength=120;title.placeholder='Nome da tarefa';
  const description=node('textarea');description.maxLength=1000;description.placeholder='Como deve ser executada';
  const criterion=node('select');for(const value of ['ORGANIZACAO','QUALIDADE']){const o=node('option',criterionInfo(value).label);o.value=value;criterion.append(o);}
  const type=node('select');for(const value of ['ORGANIZACAO','AUDITORIA','ENDERECAMENTO','INVENTARIO','AVULSA']){const o=node('option',value);o.value=value;type.append(o);}
  const complexity=node('select');for(const value of ['SIMPLES','INTERMEDIARIA','COMPLEXA']){const o=node('option',value);o.value=value;complexity.append(o);}
  const cadence=node('select');for(const [value,label] of [['DAILY','Diária'],['WEEKLY','Semanal'],['MONTHLY','Mensal']]){const o=node('option',label);o.value=value;cadence.append(o);}
  const target=node('input');target.type='number';target.min='1';target.step='1';target.placeholder='Meta opcional';
  const fields=node('div',undefined,'ex-form-grid');
  for(const [labelText,input] of [['Tarefa',title],['Critério principal',criterion],['Tipo',type],['Complexidade',complexity],['Periodicidade',cadence],['Meta',target]]){const label=node('label',labelText);label.append(input);fields.append(label);}
  const descLabel=node('label','Descrição');descLabel.append(description);
  const submit=node('button','Adicionar tarefa','primary-button');submit.type='submit';form.append(fields,descLabel,submit);
  form.onsubmit=async event=>{event.preventDefault();submit.disabled=true;try{const code=title.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,60);await service.saveTaskTemplate({code,title:title.value.trim(),description:description.value.trim(),criterion_id:criterion.value,task_type:type.value,complexity:complexity.value,cadence:cadence.value,quantity_target:target.value||null,weekdays:[1,2,3,4,5,6],sla_time:'23:59',active:true,config:{}});await renderCyclesView();}catch(error){setStatus(error.message);}finally{submit.disabled=false;}};
  block.append(form);host.append(block);
 }

 async function renderCyclesView(){
  const host=views.cycles;if(!leader)return;host.replaceChildren();
  const manage=node('div',undefined,'ex-manage-grid'),left=node('div'),right=node('div');
  const cycleBlock=node('section',undefined,'ex-card ex-management-block');cycleBlock.append(node('h2','Ciclos e critérios','ex-card-title'));
  const toolbar=node('div',undefined,'ex-toolbar');
  const cycleSelect=node('select');for(const item of cycles){const option=node('option',item.name);option.value=item.id;if(item.id===cycle?.id)option.selected=true;cycleSelect.append(option);}
  const cycleLabel=node('label','Ciclo');cycleLabel.append(cycleSelect);
  const userSelect=node('select');for(const row of directory){const option=node('option',row.name||row.id);option.value=row.id;if(row.id===person)option.selected=true;userSelect.append(option);}
  const userLabel=node('label','Colaborador');userLabel.append(userSelect);toolbar.append(cycleLabel,userLabel);
  cycleSelect.onchange=async()=>{cycle=cycles.find(row=>row.id===cycleSelect.value)||cycle;await refreshDirectory();await loadDashboard();switchView('cycles');};
  userSelect.onchange=async()=>{person=userSelect.value;await loadDashboard();switchView('cycles');};
  cycleBlock.append(toolbar);

  const create=node('form',undefined,'ex-management-block');create.append(node('h3','Criar avaliação mensal'));
  const month=node('input');month.type='month';month.required=true;const now=new Date();month.value=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  const ml=node('label','Mês da avaliação');ml.append(month);const createBtn=node('button','Criar mês em rascunho','primary-button');createBtn.type='submit';create.append(ml,createBtn);
  create.onsubmit=async event=>{event.preventDefault();createBtn.disabled=true;try{const [year,num]=month.value.split('-');await service.createMonthlyCycle({month:month.value,name:'Avaliação Mensal - '+num+'/'+year});await reloadAll();switchView('cycles');}catch(error){setStatus(error.message);}finally{createBtn.disabled=false;}};
  cycleBlock.append(create);

  if(cycle){
   const actions=node('section',undefined,'ex-management-block');actions.append(node('h3','Ações do ciclo'));
   const buttons=node('div',undefined,'ex-management-actions');
   if(!cycle.enabled)buttons.append(makeButton('Definir equipe',renderMemberSelection));
   if(cycle.enabled&&!['CLOSED','ARCHIVED'].includes(cycle.status))buttons.append(makeButton('Gerenciar elegibilidade',renderEligibility));
   if(!cycle.enabled)buttons.append(makeButton('Ativar ciclo',async()=>{await rpc('ENABLE');await reloadAll();switchView('cycles');},'primary-button'));
   buttons.append(makeButton('Gerar evidências do ciclo',async()=>{await synchronizeEvidence({rpc:(action,data)=>rpc(action,data),cycleId:cycle.id,onProgress:p=>setStatus('Processadas '+p.page+' páginas · '+p.inserted+' evidências novas')});await loadDashboard();switchView('cycles');}));
   actions.append(buttons);cycleBlock.append(actions);
  }
  left.append(cycleBlock);manage.append(left,right);host.append(manage);
  await renderTaskCatalog(right);
 }

 async function renderMemberSelection(){
  const host=views.cycles;host.replaceChildren();
  const candidates=await rpc('CANDIDATES');
  const card=node('section',undefined,'ex-card ex-secondary-card');card.append(node('h2','Equipe elegível · '+cycle.name,'ex-card-title'),node('p','Selecione somente quem será comparado neste ciclo.'));
  const form=node('form'),checks=[];
  for(const candidate of candidates){const label=node('label');const input=node('input');input.type='checkbox';input.value=candidate.id;input.checked=Boolean(candidate.selected);label.append(input,document.createTextNode(' '+(candidate.name||candidate.id)+' · '+candidate.role));form.append(label);checks.push(input);}
  const submit=node('button','Salvar equipe','primary-button');submit.type='submit';form.append(submit);
  form.onsubmit=async event=>{event.preventDefault();submit.disabled=true;try{await rpc('SET_MEMBERS',{member_ids:checks.filter(input=>input.checked).map(input=>input.value)});await reloadAll();switchView('cycles');}finally{submit.disabled=false;}};
  card.append(form);host.append(card);
 }

 async function renderEligibility(){
  const host=views.cycles;host.replaceChildren();
  const candidates=(await rpc('CANDIDATES')).filter(candidate=>candidate.member);
  const card=node('section',undefined,'ex-card ex-secondary-card');card.append(node('h2','Elegibilidade do ciclo · '+cycle.name,'ex-card-title'),node('p','Alterações exigem justificativa e ficam registradas na auditoria.'));
  for(const candidate of candidates){
   const row=node('div',undefined,'ex-management-block');row.append(node('strong',(candidate.name||candidate.id)+' · '+(candidate.eligible?'Elegível':'Fora do ciclo')));
   const reason=node('textarea');reason.placeholder='Justificativa obrigatória';reason.required=true;reason.maxLength=1000;
   const btn=makeButton(candidate.eligible?'Excluir da avaliação':'Reincluir na avaliação',async()=>{if(!reason.value.trim()){setStatus('Informe a justificativa.');return;}await rpc('SET_MEMBER_ELIGIBILITY',{user_id:candidate.id,eligible:!candidate.eligible,justification:reason.value.trim()});await reloadAll();switchView('cycles');});
   row.append(reason,btn);card.append(row);
  }
  host.append(card);
 }

 async function refreshDirectory(){
  if(!cycle){directory=[];person=actorId;return;}
  const data=await service.rpc('wms_excellence_api'?undefined:'DIRECTORY').catch(()=>null);
  // Keep the established RPC contract; the fallback above is never used in production.
  directory=await rpc('DIRECTORY');
  if(!directory.some(row=>row.id===person))person=directory.some(row=>row.id===actorId)?actorId:(directory[0]?.id||actorId);
 }

 async function loadMonitoring(){
  if(!leader){monitoring=null;return;}
  const now=new Date(),pad=value=>String(value).padStart(2,'0');
  const from=now.getFullYear()+'-'+pad(now.getMonth()+1)+'-01';
  const to=now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(now.getDate());
  try{monitoring=await service.operationalOverview({from,to});}catch{monitoring=null;}
 }

 async function loadDashboard(){
  if(!cycle){dashboard=null;team=null;renderPerformance();return;}
  dashboard=await rpc('DASHBOARD');
  if(leader){try{team=await rpc('TEAM');}catch{team=null;}}
  renderPerformance();
 }

 async function reloadAll(){
  cycles=await service.rpc('CYCLES');
  cycle=cycles.find(row=>row.id===cycle?.id)||cycles[0]||null;
  if(cycle)await refreshDirectory();else{directory=[];person=actorId;}
  await loadMonitoring();
  await loadDashboard();
 }

 initLayout();
 await reloadAll();
 switchView(currentView);
 return {refresh:reloadAll};
}
