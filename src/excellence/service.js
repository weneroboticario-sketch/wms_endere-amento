export function createExcellenceService({ client, warehouse, isCurrent }) {
 return { async rpc(action, data = {}) {
  if (!isCurrent()) throw Error('Sessão ou unidade alterada.');
  const response = await client.rpc('wms_excellence_api', { p_warehouse: warehouse, p_action: action, p_data: data });
  if (!isCurrent()) throw Error('Sessão ou unidade alterada.');
  if (response.error) throw Error(response.error.message || 'Módulo indisponível.');
  return response.data;
 } };
}
