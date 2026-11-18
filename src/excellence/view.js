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
      const reason = { AUTORIA_OU_RESPONSABILIDADE_NAO_COMPROVADA: 'Executor ou responsabilidade ainda não comprovados', PRAZO_FORA_DO_PERIODO: 'Prazo fora do período', IMPEDIMENTO_OU_AUSENCIA_VALIDADA: 'Impedimento ou ausência validada', COMPLEXIDADE_NAO_COMPROVADA: 'Complexidade anterior à execução não comprovada', SITUACAO_AGUARDANDO_REVISAO: 'Situação aguardando revisão', VERIFICACAO_NAO_ELEGIVEL: 'Verificação sem os requisitos necessários' }[excluded.reason] || excluded.reason;
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
    const card = node('article', undefined, 'panel'); card.append(node('strong', row.event_type), node('p', row.description), node('p', `${row.evidence_date} · ${row.source_table} · ${row.source_id} · Evidência ${row.id}`));
    button('Ver origem', () => { status.textContent = `Referência original: ${row.source_table} / ${row.source_id}. Consulta detalhada da origem ainda não integrada.`; }, card);
    if (leader && person !== actorId) button('Validar observação', async () => {
     const score = window.prompt('Avaliação da observação (0–100):'); if (score === null) return;
     const justification = window.prompt('Fundamento verificável da avaliação:'); if (!justification) return;
     await perform('REVIEW_EVIDENCE', { evidence_id: row.id, score: Number(score), justification }); await load();
    }, card);
    content.append(card);
   }
  }), tabs);
  button('Iniciativas', () => show(() => {
   for (const row of dashboard.initiatives) content.append(node('p', `${row.title} · ${row.status}`));
   if (person === actorId) button('Registrar iniciativa', async () => {
    const title = window.prompt('Título da iniciativa:'); if (!title) return;
    const description = window.prompt('Ação e resultado:'); if (!description) return;
    await perform('INITIATIVE', { title, description }); await load();
   }, content);
  }), tabs);
  if (leader) {
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
 const available = await service.rpc('CYCLES');
 for (const row of available) { const option = node('option', row.name); option.value = row.id; cycles.append(option); }
 cycle = available[0] || null;
 cycles.onchange = async () => { cycle = available.find(row => row.id === cycles.value); await load().catch(() => {}); };
 if (cycle) {
  const directory = await perform('DIRECTORY');
  for (const row of directory) { const option = node('option', row.name || row.id); option.value = row.id; users.append(option); }
  users.value = actorId; users.onchange = async () => { person = users.value; await load().catch(() => {}); };
  if (leader) button('Gerar evidências do ciclo', async () => { const result = await perform('SYNC'); await load(); status.textContent = result.limitations.join(' '); });
  if (admin && !cycle.enabled) button('Ativar ciclo local', async () => { await perform('ENABLE'); await load(); });
  await load();
 } else status.textContent = 'Nenhum ciclo cadastrado. Implantação e ativação dependem da administração.';
 return { refresh: load };
}
