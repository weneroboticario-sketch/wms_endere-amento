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
  return error?.name === 'AbortError' || /aborterror|operation was aborted|signal is aborted/i.test(String(error?.message || ''));
}
export function recordRequestHealth(endpoint, started, { status = 0, rows = 0, attempt = 0 } = {}) {
  // Labels only: no URLs, query parameters, bodies, credentials or product data.
  samples.push({ endpoint: String(endpoint).replace(/[^a-z0-9_-]/gi, '').slice(0, 80), latencyMs: Math.max(0, Math.round(performance.now() - started)), status: Number(status) || 0, rows: Number(rows) || 0, attempt, at: new Date().toISOString() });
  if (samples.length > 100) samples.shift();
}
export function requestHealthSnapshot() { return samples.map(sample => ({ ...sample })); }
