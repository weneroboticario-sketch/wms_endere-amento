export function createExcellenceService({ client, warehouse, isCurrent }) {
 return { async rpc(action, data = {}) {
  if (!isCurrent()) throw Error('Sessão ou unidade alterada.');
  if (action === 'DASHBOARD' || action === 'CLOSE') {
   const session = await client.auth.getSession();
   if (session.error || !session.data.session) throw Error('Autenticação necessária.');
   const response = await fetch('/api/excellence-evaluation', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.data.session.access_token }, body: JSON.stringify({ warehouse, action, cycle_id: data.cycle_id, user_id: data.user_id }) });
   if (!isCurrent()) throw Error('Sessão ou unidade alterada.');
   const result = await response.json();
   if (!response.ok) throw Error(result.error || 'Avaliação indisponível.'); return result;
  }
  const response = await client.rpc('wms_excellence_api', { p_warehouse: warehouse, p_action: action, p_data: data });
  if (!isCurrent()) throw Error('Sessão ou unidade alterada.');
  if (response.error) throw Error(response.error.message || 'Módulo indisponível.');
  return response.data;
 } };
}
