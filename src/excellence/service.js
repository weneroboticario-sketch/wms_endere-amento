export function createExcellenceService({ client, warehouse, isCurrent }) {
 async function directRpc(name, args) {
  if (!isCurrent()) throw Error('Sessão ou unidade alterada.');
  const response = await client.rpc(name, args);
  if (!isCurrent()) throw Error('Sessão ou unidade alterada.');
  if (response.error) throw Error(response.error.message || 'Módulo indisponível.');
  return response.data;
 }
 return {
  async rpc(action, data = {}) {
   if (!isCurrent()) throw Error('Sessão ou unidade alterada.');
   if (action === 'SET_MEMBERS') {
    return directRpc('wms_excellence_set_cycle_members', { p_warehouse: warehouse, p_cycle: data.cycle_id, p_member_ids: data.member_ids });
   }
   if (action === 'SET_MEMBER_ELIGIBILITY') {
    return directRpc('wms_excellence_set_member_eligibility', { p_warehouse: warehouse, p_cycle: data.cycle_id, p_user_id: data.user_id, p_eligible: data.eligible, p_justification: data.justification });
   }
   if (action === 'ENABLE') {
    return directRpc('wms_excellence_enable_cycle', { p_warehouse: warehouse, p_cycle: data.cycle_id });
   }
   if (action === 'DASHBOARD' || action === 'CLOSE' || action === 'TEAM') {
    const session = await client.auth.getSession();
    if (session.error || !session.data.session) throw Error('Autenticação necessária.');
    const response = await fetch('/api/excellence-evaluation', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.data.session.access_token }, body: JSON.stringify({ warehouse, action, cycle_id: data.cycle_id, user_id: data.user_id }) });
    if (!isCurrent()) throw Error('Sessão ou unidade alterada.');
    const result = await response.json();
    if (!response.ok) throw Error(result.error || 'Avaliação indisponível.'); return result;
   }
   return directRpc('wms_excellence_api', { p_warehouse: warehouse, p_action: action, p_data: data });
  },
  createMonthlyCycle({ month, name }) {
   return directRpc('wms_excellence_create_monthly_cycle', { p_warehouse: warehouse, p_month: month + '-01', p_name: name || null });
  },
  taskTemplates() {
   return directRpc('wms_excellence_task_templates', { p_warehouse: warehouse });
  },
  saveTaskTemplate(data) {
   return directRpc('wms_excellence_save_task_template', { p_warehouse: warehouse, p_data: data });
  },
  setTaskTemplateActive(id, active) {
   return directRpc('wms_excellence_set_task_template_active', { p_warehouse: warehouse, p_template: id, p_active: active });
  },
  operationalOverview({ from, to }) {
   return directRpc('wms_excellence_operational_overview', { p_warehouse: warehouse, p_from: from, p_to: to });
  }
 };
}
