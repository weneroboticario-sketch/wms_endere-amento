const samples = [];
export function isServiceRestricted(error) {
  const text = String(error?.message || error || '').toLowerCase();
  return Number(error?.status) === 402 || /exceed_egress_quota|service for this project is restricted|overdue_payment/.test(text);
}
export function serviceFailureMessage(error) {
  if (isServiceRestricted(error)) return 'Serviço temporariamente bloqueado pelo provedor. O administrador deve verificar a cota e o faturamento do Supabase. Não é necessário trocar a senha.';
  if (Number(error?.status) === 429) return 'Muitas tentativas. Aguarde antes de tentar novamente.';
  if (Number(error?.status) >= 500 || /failed to fetch|network|fetch failed|timeout|timed out/i.test(String(error?.message || error || ''))) return 'Não foi possível conectar ao serviço agora. Verifique a conexão e tente novamente em instantes.';
  return '';
}
export function isCancelledRequest(error) {
  const code = String(error?.code || error?.sql_state || '');
  const message = String(error?.message || error?.details || error?.hint || '');
  return error?.name === 'AbortError' ||
    code === '57014' ||
    /aborterror|operation was aborted|signal is aborted|statement timeout|canceling statement due to statement timeout/i.test(message);
}
export function recordRequestHealth(endpoint, started, { status = 0, rows = 0, attempt = 0 } = {}) {
  // Labels only: no URLs, query parameters, bodies, credentials or product data.
  samples.push({ endpoint: String(endpoint).replace(/[^a-z0-9_-]/gi, '').slice(0, 80), latencyMs: Math.max(0, Math.round(performance.now() - started)), status: Number(status) || 0, rows: Number(rows) || 0, attempt, at: new Date().toISOString() });
  if (samples.length > 100) samples.shift();
}
export function requestHealthSnapshot() { return samples.map(sample => ({ ...sample })); }
