import { synchronizeEvidence } from './synchronization.js';
export async function mountExcellence(root, { service, actorId, leader, admin }) {
 let cycle = null, person = actorId, dashboard = null;
 const node = (tag, text, cls) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; return el; };
 const status = node('p', '', 'muted'); status.setAttribute('role', 'status');
 const shell = node('section', undefined, 'panel'); root.replaceChildren(shell);
 shell.append(node('h2', 'Logística de Excelência'), node('p', 'Experimental · informações insuficientes aparecem como N/D.'));
 const controls = node('div', undefined, 'button-row'); shell.append(controls, status);
 const cycles = node('select'); cycles.setAttribute('aria-label', 'Ciclo'); controls.append(cycles);
 const users = node('select'); users.setAttribute('aria-label', 'Colaborador'); controls.append(users);
 const body = node('div'); shell.append(body);
 async function perform(action, data = {}) {
  status.textContent = 'Processando…';
  try { const value = await service.rpc(action, { cycle_id: cycle?.id, user_id: person, ...data }); status.textContent = 'Atualizado.'; return value; }
  catch (error) { status.textContent = error.message; throw error; }
 }
 function button(text, action, host = controls) {
  const el = node('button', text, 'secondary-button'); el.type = 'button';
  el.onclick = async () => { el.disabled = true; try { await action(); } catch { /* Status already shows server error. */ } finally { el.disabled = false; } }; host.append(el); return el;
 }
 async function load() {
  if (!cycle) return;
  dashboard = await perform('DASHBOARD');
  const result = dashboard.calculation;
  if (!result) throw Error('Cálculo validado pelo servidor indisponível.');
  body.replaceChildren(node('h3', leader ? 'Visão da equipe · detalhe individual' : 'Meu desempenho'));
  body.append(node('p', `${cycle.name} · ${dashboard.cycle.status} · Nota preliminar: ${result.score === null ? 'N/D' : result.score.toFixed(1)} · Confiança: ${result.confidence}`));
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
    if(row.source_table==='wms_replenishment_requests') button('Ver origem', async () => {
     const origin=await perform('ORIGIN',{evidence_id:row.id});
     const previous=card.querySelector('[data-origin]');if(previous)previous.remove();
     const detail=node('section',undefined,'panel');detail.dataset.origin='true';detail.append(node('h4','Registro original · somente consulta'));
     if(!origin.available)detail.append(node('p',origin.message));
     else {
      detail.append(node('p','SKU '+origin.sku+' · '+origin.status));
      detail.append(node('p','Solicitada: '+(origin.requested??'N/D')+' · Atendida: '+(origin.attended??'N/D')+' · Pendente: '+(origin.pending??'N/D')));
      detail.append(node('p','Duração: '+(origin.duration_seconds==null?'N/D':Math.floor(origin.duration_seconds/60)+'min '+origin.duration_seconds%60+'s')));
      detail.append(node('p','Conclusão: '+(origin.finished_at??'Não concluída')));
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
     for(const title of ['Colaborador','Automática','Assistida','Proposta','Confiança','Evidências','Pendentes','Ação'])header.append(node('th',title));table.append(header);
     for(const member of team.rows){
      const r=member.calculation;const tr=node('tr');
      for(const value of [member.name,r.criteria.reduce((sum,x)=>sum+(x.automatic??0),0),r.criteria.reduce((sum,x)=>sum+(x.assisted??0),0),r.score??'N/D',r.confidence,member.evidenceCount,r.pendingPoints])tr.append(node('td',String(value)));
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
 if (admin) {
  const creation = node('details'); creation.append(node('summary','Criar ciclo de avaliação'));
  const form = node('form');
  const name = node('input'); name.required=true; name.maxLength=120;
  const from = node('input'); from.type='date'; from.required=true;
  const to = node('input'); to.type='date'; to.required=true;
  for (const [text,input] of [['Nome do ciclo',name],['Início',from],['Encerramento',to]]) {
   const label=node('label',text);label.append(input);form.append(label);
  }
  const submit=node('button','Criar ciclo em rascunho','primary-button');submit.type='submit';form.append(submit);
  form.append(node('p','O ciclo começa desativado. Ative após revisar as datas e as regras experimentais.'));
  form.onsubmit=async event=>{
   event.preventDefault();
   const span=(Date.parse(to.value)-Date.parse(from.value))/86400000;
   if(!Number.isFinite(span)||span<0||span>62){status.textContent='Informe um intervalo de até 63 dias, com encerramento após o início.';return;}
   submit.disabled=true;
   try{
    await perform('CREATE_CYCLE',{name:name.value.trim(),from:from.value,to:to.value});
    await mountExcellence(root,{service,actorId,leader,admin});
   }catch{/* Server error is displayed in status. */}finally{submit.disabled=false;}
  };
  creation.append(form);shell.insertBefore(creation,controls);
 }
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
  if (admin && !cycle.enabled) button('Definir equipe do ciclo', async () => {
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
  if (admin && cycle.enabled && !['CLOSED','ARCHIVED'].includes(cycle.status)) button('Gerenciar elegibilidade', async () => {
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
  if (admin && !cycle.enabled) button('Ativar ciclo local', async () => { await perform('ENABLE'); await load(); });
  await load();
 } else status.textContent = 'Nenhum ciclo cadastrado. Implantação e ativação dependem da administração.';
 return { refresh: load };
}
