import { synchronizeEvidence } from './synchronization.js';
export async function mountExcellence(root, { service, actorId, leader, admin }) {
 let cycle = null, person = actorId, dashboard = null;
 const node = (tag, text, cls) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; return el; };
 const status = node('p', '', 'muted'); status.setAttribute('role', 'status');
 const shell = node('section', undefined, 'panel'); root.replaceChildren(shell);
 shell.append(node('h2', 'Logística de Excelência'), node('p', leader ? 'Acompanhamento automático do trabalho já registrado no WMS. A equipe não precisa preencher esta tela para essas atividades serem contabilizadas.' : 'Seu desempenho e suas evidências aparecem quando houver uma avaliação ativa.'));
 const monitoring = node('section'); shell.append(monitoring);
 const evaluation = node('details'); evaluation.className='panel'; evaluation.open=!leader;
 evaluation.append(node('summary', leader ? 'Avaliação e premiação mensal (opcional)' : 'Minha avaliação'));
 const evaluationInner=node('div');evaluation.append(evaluationInner);shell.append(evaluation);
 const controls = node('div', undefined, 'button-row'); evaluationInner.append(controls, status);
 const cycles = node('select'); cycles.setAttribute('aria-label', 'Ciclo'); controls.append(cycles);
 const users = node('select'); users.setAttribute('aria-label', 'Colaborador'); controls.append(users);
 const body = node('div'); evaluationInner.append(body);
 async function showTaskCatalog() {
  status.textContent='Carregando tarefas avaliadas…';
  try {
   const templates=await service.taskTemplates();
   body.replaceChildren(node('h3','Tarefas avaliadas'),node('p','Estas rotinas geram Pontos Operacionais somente após execução e validação. Os pontos servem para ranking e premiação; a nota de desempenho continua baseada em evidências comparáveis.'));
   for(const template of templates){
    const card=node('article',undefined,'panel');
    card.append(node('strong',template.title),node('p',(template.description||'')+' · '+template.cadence+' · '+template.criterion_id+' · '+template.complexity),node('p','Status: '+(template.active?'Ativa':'Inativa')));
    button(template.active?'Desativar':'Ativar',async()=>{await service.setTaskTemplateActive(template.id,!template.active);await showTaskCatalog();},card);
    body.append(card);
   }
   const form=node('form',undefined,'panel');
   form.append(node('h4','Adicionar nova tarefa avaliada'));
   const title=node('input');title.required=true;title.maxLength=120;title.placeholder='Nome da tarefa';
   const description=node('textarea');description.maxLength=1000;description.placeholder='Como deve ser executada';
   const criterion=node('select');for(const value of ['ORGANIZACAO','QUALIDADE']){const option=node('option',value);option.value=value;criterion.append(option);}
   const type=node('select');for(const value of ['ORGANIZACAO','AUDITORIA','ENDERECAMENTO','INVENTARIO','AVULSA']){const option=node('option',value);option.value=value;type.append(option);}
   const complexity=node('select');for(const value of ['SIMPLES','INTERMEDIARIA','COMPLEXA']){const option=node('option',value);option.value=value;complexity.append(option);}
   const cadence=node('select');for(const value of ['DAILY','WEEKLY','MONTHLY']){const option=node('option',({DAILY:'Diária',WEEKLY:'Semanal',MONTHLY:'Mensal'})[value]);option.value=value;cadence.append(option);}
   const target=node('input');target.type='number';target.min='1';target.step='1';target.placeholder='Meta de quantidade (opcional)';
   for(const [labelText,input] of [['Tarefa',title],['Descrição',description],['Critério principal',criterion],['Tipo',type],['Complexidade',complexity],['Periodicidade',cadence],['Meta',target]]){const label=node('label',labelText);label.append(input);form.append(label);}
   const submit=node('button','Adicionar tarefa','primary-button');submit.type='submit';form.append(submit);
   form.onsubmit=async event=>{event.preventDefault();submit.disabled=true;try{
    const code=title.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,60);
    await service.saveTaskTemplate({code,title:title.value.trim(),description:description.value.trim(),criterion_id:criterion.value,task_type:type.value,complexity:complexity.value,cadence:cadence.value,quantity_target:target.value||null,weekdays:[1,2,3,4,5,6],sla_time:'23:59',active:true,config:{}});
    form.reset();await showTaskCatalog();
   }catch(error){status.textContent=error.message;}finally{submit.disabled=false;}};
   body.append(form);status.textContent='Tarefas avaliadas atualizadas.';
  } catch(error){status.textContent=error.message;}
 }
 async function perform(action, data = {}) {
  status.textContent = 'Processando…';
  try { const value = await service.rpc(action, { cycle_id: cycle?.id, user_id: person, ...data }); status.textContent = 'Atualizado.'; return value; }
  catch (error) { status.textContent = error.message; throw error; }
 }
 function button(text, action, host = controls) {
  const el = node('button', text, 'secondary-button'); el.type = 'button';
  el.onclick = async () => { el.disabled = true; try { await action(); } catch { /* Status already shows server error. */ } finally { el.disabled = false; } }; host.append(el); return el;
 }
 async function loadMonitoring() {
  if (!leader) { monitoring.replaceChildren(); return; }
  const now=new Date(),pad=value=>String(value).padStart(2,'0');
  const defaultFrom=now.getFullYear()+'-'+pad(now.getMonth()+1)+'-01';
  const defaultTo=now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(now.getDate());
  const previousFrom=monitoring.querySelector('[data-monitor-from]')?.value||defaultFrom;
  const previousTo=monitoring.querySelector('[data-monitor-to]')?.value||defaultTo;
  monitoring.replaceChildren();
  const title=node('h3','Atividades já contabilizadas');
  const intro=node('p','Leitura automática dos registros operacionais do WMS. Solicitar reposição, executar reposição, trabalhar em transferências e concluir tarefas já registradas são contabilizados sem ação extra do colaborador.');
  const filters=node('form',undefined,'panel');
  const from=node('input');from.type='date';from.value=previousFrom;from.dataset.monitorFrom='true';
  const to=node('input');to.type='date';to.value=previousTo;to.dataset.monitorTo='true';
  const fromLabel=node('label','De');fromLabel.append(from);
  const toLabel=node('label','Até');toLabel.append(to);
  const refresh=node('button','Atualizar acompanhamento','secondary-button');refresh.type='submit';
  const monitorStatus=node('p','Carregando…','muted');monitorStatus.setAttribute('role','status');
  filters.append(fromLabel,toLabel,refresh,monitorStatus);
  monitoring.append(title,intro,filters);
  const render=async()=>{
   refresh.disabled=true;monitorStatus.textContent='Atualizando registros do WMS…';
   try{
    const data=await service.operationalOverview({from:from.value,to:to.value});
    const old=monitoring.querySelector('[data-monitor-results]');if(old)old.remove();
    const results=node('div');results.dataset.monitorResults='true';
    const totals=data?.totals||{};
    const kpis=node('div',undefined,'button-row');
    const metric=(label,value,help)=>{
     const card=node('article',undefined,'panel');card.append(node('small',label),node('h3',String(value??0)));
     if(help)card.append(node('small',help));kpis.append(card);
    };
    metric('Reposições executadas',totals.replenishments_handled,'Pedidos com participação registrada');
    metric('Unidades repostas',totals.replenishment_units,'Quantidade positiva atendida');
    metric('Itens em transferências',totals.transfer_items,'Itens distintos trabalhados');
    metric('Registros de atividade',totals.activity_records,'Volume observado; não é nota');
    results.append(kpis);
    const wrap=node('div');wrap.style.overflowX='auto';
    const table=node('table');const header=node('tr');
    for(const label of ['Colaborador','Reposições solicitadas','Reposições executadas','Unid. repostas','Itens transferência','Transf. finalizadas','Tarefas Central','Rotinas avaliadas','Registros'])header.append(node('th',label));
    table.append(header);
    for(const person of data?.people||[]){
     const tr=node('tr');
     for(const value of [
      person.name,
      person.replenishments_requested,
      person.replenishments_handled,
      person.replenishment_units,
      person.transfer_items,
      person.transfers_finalized,
      person.tasks_completed,
      person.standard_tasks_completed,
      person.activity_records
     ])tr.append(node('td',String(value??0)));
     table.append(tr);
    }
    wrap.append(table);results.append(wrap);
    results.append(node('p','O total de registros serve para acompanhamento de volume. Ele não é convertido automaticamente em nota ou premiação, porque os fluxos têm cargas de trabalho diferentes.'));
    const rules=node('details');rules.append(node('summary','Como o sistema contabiliza'));
    for(const rule of data?.rules||[])rules.append(node('p',rule));
    results.append(rules);monitoring.append(results);
    monitorStatus.textContent='Atualizado automaticamente com dados registrados no WMS.';
   }catch(error){monitorStatus.textContent=error.message||'Não foi possível atualizar o acompanhamento.';throw error;}
   finally{refresh.disabled=false;}
  };
  filters.onsubmit=async event=>{event.preventDefault();await render().catch(()=>{});};
  await render().catch(()=>{});
 }
 async function load() {
  if (!cycle) return;
  dashboard = await perform('DASHBOARD');
  const result = dashboard.calculation;
  if (!result) throw Error('Cálculo validado pelo servidor indisponível.');
  body.replaceChildren(node('h3', leader ? 'Visão da equipe · detalhe individual' : 'Meu desempenho'));
  body.append(node('p', `${cycle.name} · ${dashboard.cycle.status} · Nota preliminar: ${result.score === null ? 'N/D' : result.score.toFixed(1)} · Confiança: ${result.confidence} · Pontos Operacionais: ${result.operationalPoints?.points ?? 0}`));
  body.append(node('p', result.limitation));
  body.append(node('p', `Apurados: ${result.assessedPoints ?? 'N/D'} · Pendentes: ${result.pendingPoints ?? 'N/D'} · Não obtidos em critérios avaliados: ${result.notObtainedPoints ?? 'N/D'}`));
  const tabs = node('div', undefined, 'button-row'), content = node('div'); body.append(tabs, content);
  const show = render => { content.replaceChildren(); render(); };
  button('Critérios', () => show(() => {
   for (const row of result.criteria) {
    const card = node('article', undefined, 'panel');
    card.append(node('strong', row.id), node('p', `Automáticos: ${row.automatic ?? 'N/D'} / ${row.automaticMaximum ?? 'N/D'} · Assistidos validados: ${row.assisted ?? 'N/D'} / ${row.assistedMaximum ?? 'N/D'} · Amostra: ${row.sample}`));
    const details = node('details'); details.append(node('summary', 'Como foi calculado?'));
    const explanation = node('div');
    const rule = row.explanation;
    if (rule) {
     explanation.append(node('p', 'Fórmula: ' + rule.automatic.formula));
     explanation.append(node('p', 'Numerador: ' + (rule.automatic.numerator ?? 'N/D') + ' · Denominador: ' + (rule.automatic.denominator ?? 'N/D')));
     explanation.append(node('p', 'Período: ' + rule.period.from + ' até ' + rule.period.to + ' (fim exclusivo)'));
     explanation.append(node('p', 'Versão dos critérios: ' + rule.version));
     for (const excluded of rule.automatic.excluded) {
      const reason = { AUTORIA_OU_RESPONSABILIDADE_NAO_COMPROVADA: 'Executor ou responsabilidade ainda não comprovados', PRAZO_FORA_DO_PERIODO: 'Prazo fora do período', IMPEDIMENTO_OU_AUSENCIA_VALIDADA: 'Impedimento ou ausência validada', AUSENCIA_OU_IMPEDIMENTO_VALIDADO: 'Período neutralizado por ausência/impedimento validado', COMPLEXIDADE_NAO_COMPROVADA: 'Complexidade anterior à execução não comprovada', SITUACAO_AGUARDANDO_REVISAO: 'Situação aguardando revisão', VERIFICACAO_NAO_ELEGIVEL: 'Verificação sem os requisitos necessários' }[excluded.reason] || excluded.reason;
      explanation.append(node('p', 'Registro desconsiderado: ' + excluded.id + ' · ' + reason));
     }
     if (rule.assisted) explanation.append(node('p', 'Avaliação assistida: ' + rule.assisted.score + '/100 × ' + rule.assisted.maximum + ' · ' + rule.assisted.justification));
    } else explanation.append(node('p','Versão de regra ainda não integrada.'));
    details.append(explanation); card.append(details); content.append(card);
   }
  }), tabs);
  button('Tarefas e pontos', () => show(() => {
   const summary=result.operationalPoints||{points:0,completed:0,byComplexity:[],byCriterion:[],daily:[],items:[]};
   content.append(node('h4','Pontos Operacionais'));
   content.append(node('p',summary.points+' ponto(s) · '+summary.completed+' tarefa(s) validada(s). Estes pontos são de gamificação e não são somados diretamente à nota de 0–100.'));
   const complexityNames={SIMPLES:'Simples',INTERMEDIARIA:'Intermediária',COMPLEXA:'Complexa'};
   if(summary.byComplexity.length){
    const breakdown=node('div',undefined,'panel');breakdown.append(node('strong','Por complexidade'));
    for(const row of summary.byComplexity)breakdown.append(node('p',(complexityNames[row.id]||row.id)+': '+row.count+' tarefa(s) · '+row.points+' ponto(s)'));
    content.append(breakdown);
   }
   if(summary.daily.length){
    content.append(node('h4','Evolução diária'));
    const max=Math.max(...summary.daily.map(row=>row.points),1);
    for(const row of summary.daily){
     const line=node('div',undefined,'panel');
     line.append(node('strong',row.day+' · '+row.points+' ponto(s)'));
     const track=node('div');track.style.height='14px';track.style.background='#e8edf3';track.style.borderRadius='999px';track.style.overflow='hidden';
     const bar=node('div');bar.style.height='100%';bar.style.width=(row.points/max*100)+'%';bar.style.background='#1468c4';bar.setAttribute('role','img');bar.setAttribute('aria-label',row.day+': '+row.points+' pontos operacionais');
     track.append(bar);line.append(track);content.append(line);
    }
   } else content.append(node('p','Ainda não há tarefa-padrão concluída e validada neste ciclo.'));
   if(summary.items.length){
    content.append(node('h4','Histórico pontuado'));
    for(const item of [...summary.items].reverse())content.append(node('p',item.day+' · '+item.title+' · '+(complexityNames[item.complexity]||item.complexity)+' · +'+item.points+' ponto(s)'));
   }
  }), tabs);
  button('Composição dos pontos', () => show(() => {
   const automatic = result.criteria.reduce((sum,row) => sum + (row.automatic ?? 0),0);
   const assisted = result.criteria.reduce((sum,row) => sum + (row.assisted ?? 0),0);
   const components = [
    ['Automáticos apurados',automatic,'#1468c4'],
    ['Assistidos validados',assisted,'#16845e'],
    ['Pontos pendentes',result.pendingPoints ?? 100,'#bac6d2'],
    ['Não obtidos em critérios avaliados',result.notObtainedPoints ?? 0,'#ba7b19']
   ];
   content.append(node('h4','Composição experimental dos 100 pontos'));
   for (const [label,value,color] of components) {
    const row = node('div'); row.append(node('p',label + ': ' + value.toFixed(1)));
    const bar = node('div'); bar.style.height='18px'; bar.style.width=value + '%'; bar.style.background=color; bar.setAttribute('role','img'); bar.setAttribute('aria-label',label + ': ' + value.toFixed(1) + ' de 100');
    row.append(bar); content.append(row);
   }
   content.append(node('p','Pontos pendentes não representam desempenho zero. Abra Critérios para consultar fórmulas e fontes.'));
  }), tabs);
  button('Evidências', () => show(() => {
   content.append(node('p', 'Até 100 registros recentes. Autoria operacional não implica responsabilidade por divergências.'));
   for (const row of dashboard.evidence) {
    const roleLabel={SOLICITANTE:'Solicitante',EXECUTOR:'Executor',CONCLUIDOR:'Concluidor'}[row.metadata?.replenishment_role]||'';
    const card = node('article', undefined, 'panel'); card.append(node('strong', ({REPLENISHMENT_REQUEST_PROCESSED:'Reposição · solicitação processada',REPLENISHMENT_COMPLETION_RECORDED:'Reposição · conclusão compartilhada',REPLENISHMENT_COMPLETED_FULL:'Reposição concluída · total',REPLENISHMENT_COMPLETED_PARTIAL:'Reposição concluída · parcial',REPLENISHMENT_COMPLETED:'Reposição concluída',REPLENISHMENT_NO_STOCK:'Reposição · sem estoque',REPLENISHMENT_RETURNED_TO_QUEUE:'Reposição devolvida à fila',REPLENISHMENT_ASSIGNED:'Reposição em atendimento'})[row.event_type]||row.event_type), ...(roleLabel?[node('p','Papel na reposição: '+roleLabel)]:[]), node('p', row.description), node('p', `${row.evidence_date} · ${row.source_table} · ${row.source_id} · Evidência ${row.id}`));
    if(['wms_replenishment_requests','wms_replenishment_participation_events'].includes(row.source_table)) button('Ver origem', async () => {
     const origin=await perform('ORIGIN',{evidence_id:row.id});
     const previous=card.querySelector('[data-origin]');if(previous)previous.remove();
     const detail=node('section',undefined,'panel');detail.dataset.origin='true';detail.append(node('h4','Registro original · somente consulta'));
     if(!origin.available)detail.append(node('p',origin.message));
     else {
      detail.append(node('p','SKU '+origin.sku+' · '+origin.status));
      detail.append(node('p','Solicitada: '+(origin.requested??'N/D')+' · Atendida: '+(origin.attended??'N/D')+' · Pendente: '+(origin.pending??'N/D')));
      detail.append(node('p','Duração: '+(origin.duration_seconds==null?'N/D':Math.floor(origin.duration_seconds/60)+'min '+origin.duration_seconds%60+'s')));
      detail.append(node('p','Conclusão: '+(origin.finished_at??'Não concluída')));
      detail.append(node('p','Solicitante: '+(origin.requester_id||'N/D')+' · Executor mais recente: '+(origin.last_attended_by_id||origin.responsible_id||'N/D')+' · Concluiu: '+(origin.completed_by_id||'N/D')));
      detail.append(node('small','Identificador da origem: '+origin.id));
     }
     card.append(detail);
    },card);
    if (leader && person !== actorId) {
     const verification=row.metadata?.verification_fact;
     if(verification) card.append(node('p',`Verificação independente: ${verification.criterion} · ${verification.result}`));
     const review=node('form');review.className='panel';
     const criterion=node('select');criterion.setAttribute('aria-label','Critério da verificação');
     for(const value of ['QUALIDADE','ORGANIZACAO']){const option=node('option',value);option.value=value;criterion.append(option);}
     const outcome=node('select');outcome.setAttribute('aria-label','Resultado da verificação');
     for(const value of ['CONFORME','NAO_CONFORME']){const option=node('option',value==='CONFORME'?'Conforme':'Não conforme');option.value=value;outcome.append(option);}
     const justification=node('textarea');justification.placeholder='Fundamento verificável';justification.required=true;justification.maxLength=1000;
     const submit=node('button',verification?'Atualizar verificação':'Registrar verificação','secondary-button');submit.type='submit';
     review.append(node('strong','Verificação independente'),criterion,outcome,justification,submit);
     review.onsubmit=async event=>{event.preventDefault();submit.disabled=true;try{
      await perform('REVIEW_EVIDENCE',{evidence_id:row.id,criterion_id:criterion.value,result:outcome.value,justification:justification.value.trim()});await load();
     }finally{submit.disabled=false;}};
     card.append(review);
    }
    content.append(card);
   }
  }), tabs);
  button('Iniciativas', () => show(() => {
   for (const row of dashboard.initiatives) {
    const card=node('article',undefined,'panel');card.append(node('strong',row.title),node('p',row.description),node('p',row.status));
    if(leader&&person!==actorId&&row.status==='REGISTERED') for(const decision of ['VALIDATED','REJECTED']) button(decision==='VALIDATED'?'Validar iniciativa':'Não validar',async()=>{
     const justification=window.prompt('Justificativa da análise:');if(!justification)return;
     await perform('VALIDATE_INITIATIVE',{initiative_id:row.id,decision,justification});await load();
    },card);
    if(row.validation_notes)card.append(node('p',row.validation_notes));content.append(card);
   }
   if (person === actorId) button('Registrar iniciativa', async () => {
    const title = window.prompt('Título da iniciativa:'); if (!title) return;
    const description = window.prompt('Ação e resultado:'); if (!description) return;
    await perform('INITIATIVE', { title, description }); await load();
   }, content);
  }), tabs);
  if (leader) {
   button('Elegibilidade', () => show(() => {
    content.append(node('h4','Ausências e impedimentos validados'));
    if(!dashboard.absences.length) content.append(node('p','Nenhum período registrado para este colaborador.'));
    for(const row of dashboard.absences){
     const card=node('article',undefined,'panel');
     card.append(node('strong',row.absence_type),node('p',row.start_date+' até '+row.end_date),node('p',row.justification));
     button('Cancelar registro',async()=>{await perform('REMOVE_ABSENCE',{absence_id:row.id});await load();},card);
     content.append(card);
    }
    const form=node('form',undefined,'panel');
    const type=node('select');for(const value of ['FERIAS','FOLGA','ATESTADO','AFASTAMENTO','TREINAMENTO','OUTRA_ATIVIDADE']){const option=node('option',value);option.value=value;type.append(option);}
    const from=node('input');from.type='date';from.required=true;
    const to=node('input');to.type='date';to.required=true;
    const justification=node('textarea');justification.placeholder='Justificativa';justification.required=true;justification.maxLength=1000;
    const submit=node('button','Registrar período','secondary-button');submit.type='submit';
    form.append(node('strong','Registrar ausência/impedimento'),type,from,to,justification,submit);
    form.onsubmit=async event=>{event.preventDefault();submit.disabled=true;try{
     await perform('ADD_ABSENCE',{absence_type:type.value,from:from.value,to:to.value,justification:justification.value.trim()});await load();
    }finally{submit.disabled=false;}};
    content.append(form);
   }), tabs);
   button('Visão da Equipe',async()=>{
    const team=await perform('TEAM');
    show(()=>{
     const wrap=node('div');wrap.style.overflowX='auto';
     const table=node('table');const header=node('tr');
     for(const title of ['Colaborador','Automática','Assistida','Pontos tarefas','Proposta','Confiança','Evidências','Pendentes','Ação'])header.append(node('th',title));table.append(header);
     for(const member of team.rows){
      const r=member.calculation;const tr=node('tr');
      for(const value of [member.name,r.criteria.reduce((sum,x)=>sum+(x.automatic??0),0),r.criteria.reduce((sum,x)=>sum+(x.assisted??0),0),r.operationalPoints?.points??0,r.score??'N/D',r.confidence,member.evidenceCount,r.pendingPoints])tr.append(node('td',String(value)));
      const action=node('td');button('Abrir',async()=>{person=member.user_id;users.value=person;await load();},action);tr.append(action);table.append(tr);
     }
     wrap.append(table);content.append(wrap);
    });
   },tabs);
   button('Avaliação manual', () => show(() => {
    for (const criterion of dashboard.config.criteria.filter(row => row.assistedMaximum > 0)) button(criterion.id, async () => {
     const score = window.prompt('Nota fundamentada (0–100):'); if (score === null) return;
     const justification = window.prompt('Justificativa:'); if (!justification) return;
     const selected = window.prompt('IDs de evidências complementares, separados por vírgula (consulte a aba Evidências):'); if (!selected) return;
     const evidence_ids = selected.split(',').map(value => value.trim()).filter(Boolean);
     await perform('MANUAL_SCORE', { criterion_id: criterion.id, score: Number(score), justification, evidence_ids }); await load();
    }, content);
   }), tabs);
   button('Calibração', () => show(() => {
    content.append(node('p', `Cobertura: ${result.days} dias e ${result.sources} fontes revisadas. Alertas: ${result.warnings.join(', ') || 'Nenhum'}`));
    for (const row of dashboard.calibrations) content.append(node('p', `${row.previous_score ?? 'N/D'} → ${row.new_score} · ${row.justification}`));
    button('Registrar proposta de calibração', async () => {
     const score = window.prompt('Nota proposta (0–100):'); if (score === null) return;
     const justification = window.prompt('Justificativa da proposta:'); if (!justification) return;
     await perform('CALIBRATION', { score: Number(score), justification }); await load();
    }, content);
   }), tabs);
  }
  tabs.querySelector('button')?.click();
 }
 if (leader) {
  button('Tarefas avaliadas',showTaskCatalog,controls);
  const creation = node('details'); creation.append(node('summary','Criar avaliação mensal'));
  const form = node('form');
  const month = node('input'); month.type='month'; month.required=true;
  const localNow=new Date();month.value=localNow.getFullYear()+'-'+String(localNow.getMonth()+1).padStart(2,'0');
  const label=node('label','Mês da avaliação');label.append(month);form.append(label);
  const submit=node('button','Criar mês em rascunho','primary-button');submit.type='submit';form.append(submit);
  form.append(node('p','O ciclo cobre automaticamente do dia 1 ao último dia do mês e começa desativado.'));
  form.onsubmit=async event=>{
   event.preventDefault();submit.disabled=true;
   try{
    const [year,number]=month.value.split('-');
    const name='Avaliação Mensal - '+number+'/'+year;
    await service.createMonthlyCycle({month:month.value,name});
    await mountExcellence(root,{service,actorId,leader,admin});
   }catch(error){status.textContent=error.message;}finally{submit.disabled=false;}
  };
  creation.append(form);evaluationInner.insertBefore(creation,controls);
 }
 await loadMonitoring();
 const available = await service.rpc('CYCLES');
 for (const row of available) { const option = node('option', row.name); option.value = row.id; cycles.append(option); }
 cycle = available[0] || null;
 async function refreshDirectory(){
  users.replaceChildren();
  const directory=await perform('DIRECTORY');
  for(const row of directory){const option=node('option',row.name||row.id);option.value=row.id;users.append(option);}
  person=directory.some(row=>row.id===actorId)?actorId:(directory[0]?.id||actorId);
  users.value=person;
 }
 cycles.onchange = async () => { cycle = available.find(row => row.id === cycles.value); await refreshDirectory(); await load().catch(() => {}); };
 if (cycle) {
  await refreshDirectory();
  users.onchange = async () => { person = users.value; await load().catch(() => {}); };
  if (leader && !cycle.enabled) button('Definir equipe do ciclo', async () => {
   const candidates=await perform('CANDIDATES');
   body.replaceChildren(node('h3','Equipe elegível · '+cycle.name),node('p','Selecione somente quem será comparado neste ciclo. Usuários fora da equipe não entram no fechamento.'));
   const form=node('form',undefined,'panel');
   const checks=[];
   for(const candidate of candidates){
    const label=node('label');const input=node('input');input.type='checkbox';input.value=candidate.id;input.checked=Boolean(candidate.selected);
    label.append(input,document.createTextNode(' '+(candidate.name||candidate.id)+' · '+candidate.role));form.append(label);checks.push(input);
   }
   const submit=node('button','Salvar equipe','primary-button');submit.type='submit';form.append(submit);
   form.onsubmit=async event=>{event.preventDefault();const member_ids=checks.filter(input=>input.checked).map(input=>input.value);submit.disabled=true;try{
    await perform('SET_MEMBERS',{member_ids});await mountExcellence(root,{service,actorId,leader,admin});
   }finally{submit.disabled=false;}};
   body.append(form);
  });
  if (leader && cycle.enabled && !['CLOSED','ARCHIVED'].includes(cycle.status)) button('Gerenciar elegibilidade', async () => {
   const candidates=(await perform('CANDIDATES')).filter(candidate=>candidate.member);
   body.replaceChildren(node('h3','Elegibilidade do ciclo · '+cycle.name),node('p','Excluir alguém do ciclo exige justificativa e fica registrado na auditoria. Ausências temporárias devem ser registradas na aba Elegibilidade do colaborador.'));
   for(const candidate of candidates){
    const card=node('article',undefined,'panel');
    card.append(node('strong',(candidate.name||candidate.id)+' · '+(candidate.eligible?'Elegível':'Fora do ciclo')));
    if(candidate.eligibility_reason)card.append(node('p','Última justificativa: '+candidate.eligibility_reason));
    const reason=node('textarea');reason.placeholder='Justificativa obrigatória';reason.required=true;reason.maxLength=1000;
    const toggle=node('button',candidate.eligible?'Excluir da avaliação':'Reincluir na avaliação','secondary-button');toggle.type='button';
    toggle.onclick=async()=>{if(!reason.value.trim()){status.textContent='Informe a justificativa da alteração.';return;}toggle.disabled=true;try{
     await perform('SET_MEMBER_ELIGIBILITY',{user_id:candidate.id,eligible:!candidate.eligible,justification:reason.value.trim()});
     await mountExcellence(root,{service,actorId,leader,admin});
    }finally{toggle.disabled=false;}};
    card.append(reason,toggle);body.append(card);
   }
  });
  if (leader) button('Gerar evidências do ciclo', async () => { const result = await synchronizeEvidence({ rpc: (action, data) => perform(action, data), cycleId: cycle.id, onProgress: progress => { status.textContent = 'Processadas ' + progress.page + ' páginas · ' + progress.inserted + ' evidências novas'; } }); await load(); status.textContent = result.limitations.join(' '); });
  if (admin && cycle.status !== 'CLOSED') button('Fechar ciclo revisado', async () => {
   if (!window.confirm('Fechar o ciclo ' + cycle.name + '? Todas as avaliações precisam estar completas e revisadas. O histórico será preservado e ficará imutável.')) return;
   await perform('CLOSE'); await load();
  });
  if (leader && !cycle.enabled) button('Ativar ciclo local', async () => { await perform('ENABLE'); await load(); });
  await load();
 } else status.textContent = leader ? 'Nenhuma avaliação formal ativa. O acompanhamento automático acima continua funcionando normalmente.' : 'Nenhuma avaliação ativa neste momento.';
 return { refresh: async()=>{ await loadMonitoring(); await load(); } };
}
