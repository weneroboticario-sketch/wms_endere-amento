import { escapeHtml } from './utils.js';
import { buildReplenishmentExportRows, fillReplenishmentTemplate } from './replenishment-export.js';

export function createOwnerExport({ root, db, context, xlsx = () => window.XLSX, fetchTemplate = () => fetch('/templates/materiais-reposicao.xlsx'), save = saveFile }) {
  let version = 0, scope = '', busy = false, mounted = false, batches = [], payload = {}, pending = null;
  const esc = escapeHtml;
  const current = () => { const c = context(); return `${c.warehouse}:${c.user?.id}`; };
  const date = value => value ? new Date(value).toLocaleString('pt-BR') : 'Nenhuma';
  const rpc = async (action, data = {}, warehouse = context().warehouse) => {
    const result = await db().rpc('wms_replenishment_owner_export', { p_warehouse: warehouse, p_action: action, p_payload: data });
    if (result.error) throw new Error(result.error.message || 'Não foi possível acessar a exportação individual.');
    return result.data;
  };
  const status = message => { root.querySelector('[data-owner-status]').textContent = message; };
  function mount() {
    if (mounted) return;
    mounted = true;
    root.innerHTML = `<h3>Exportação de reposição</h3>
      <p data-owner-summary aria-live="polite">Carregando seus itens…</p>
      <div class="button-row"><button type="button" class="primary-button" data-owner-export>EXPORTAR MEUS ITENS</button>
      <button type="button" class="secondary-button" data-owner-refresh>Atualizar</button></div>
      <p data-owner-status role="status"></p><div data-owner-unfinished></div>
      <details data-owner-admin hidden><summary>Exportação administrativa</summary>
        <p>Selecione um único responsável. A exportação padrão continua sendo somente sua.</p>
        <label>Colaborador<select data-owner-select><option value="">Selecione</option></select></label>
        <label>Desde<input type="date" data-owner-from></label><label>Até<input type="date" data-owner-until></label>
        <p>Status: somente parcelas concluídas e não exportadas.</p>
        <div class="button-row"><button type="button" class="secondary-button" data-owner-admin-summary>Consultar responsável</button>
        <button type="button" class="secondary-button" data-owner-admin-export>Exportar responsável selecionado</button>
        <button type="button" class="secondary-button" data-owner-legacy>Histórico legado</button></div>
        <p data-owner-admin-result></p></details>
      <details><summary>Histórico de exportações</summary><div data-owner-history></div></details>`;
    root.addEventListener('click', async event => {
      const button = event.target.closest('button');
      if (!button || busy) return;
      if (button.hasAttribute('data-owner-refresh')) return refresh();
      const token = current(), c = context();
      busy = true; button.disabled = true;
      try {
        if (button.hasAttribute('data-owner-export')) await exportItems({});
        if (button.hasAttribute('data-owner-admin-export')) await exportItems(adminPayload());
        if (button.hasAttribute('data-owner-admin-summary')) {
          payload = adminPayload();
          const summary = await rpc('SUMMARY', payload, c.warehouse);
          if (token === current()) root.querySelector('[data-owner-admin-result]').textContent = describe(summary);
          await history(payload);
        }
        if (button.hasAttribute('data-owner-legacy')) await history({ mode: 'ADMIN', legacy: 'true' });
        if (button.dataset.ownerConclude) {
          await rpc('CONCLUDE_PORTION', { request_id: button.dataset.ownerConclude }, c.warehouse);
          if (token === current()) status('Sua parcela foi concluída para exportação. A reposição e os saldos não foram alterados.');
        }
        if (button.dataset.ownerDownload) await download(button.dataset.ownerDownload, false);
        if (button.dataset.ownerResume) await download(button.dataset.ownerResume, true);
        if (button.dataset.ownerRelease) {
          const batch = batches.find(b => b.id === button.dataset.ownerRelease);
          await rpc('RELEASE', batchPayload(batch), c.warehouse);
          if (token === current()) { pending = null; status('Reserva liberada. Os itens continuam disponíveis para exportar.'); }
        }
      } catch (error) { if (token === current()) status(error.message); }
      finally { busy = false; button.disabled = false; if (token === current()) await refresh(); }
    });
  }
  function adminPayload() {
    const owner = root.querySelector('[data-owner-select]').value;
    if (!owner) throw new Error('Selecione um responsável.');
    const from = root.querySelector('[data-owner-from]').value;
    const until = root.querySelector('[data-owner-until]').value;
    // Inclusive local dates, with the operating unit timezone explicitly carried to Postgres.
    return { mode: 'ADMIN', owner_id: owner, from: from ? `${from}T00:00:00-04:00` : null,
      until: until ? new Date(Date.parse(`${until}T00:00:00-04:00`) + 86400000).toISOString() : null };
  }
  function describe(s) { return `${s.owner_name}: ${s.items} SKU(s) / ${s.units} unidades concluídas pendentes de exportação. Última exportação: ${date(s.last_export)}.`; }
  function batchPayload(batch) { return { mode: batch.owner_id === context().user?.id ? 'SELF' : 'ADMIN', owner_id: batch.owner_id || undefined, batch_id: batch.id }; }
  async function history(filter = {}) {
    const token = current(), data = await rpc('HISTORY', filter);
    if (token !== current()) return;
    batches = data;
    root.querySelector('[data-owner-history]').innerHTML = data.length ? data.map(b => {
      const rows = buildReplenishmentExportRows(b.requests, b.warehouse_code);
      const total = rows.reduce((sum, row) => sum + row[1], 0);
      return `<article><p>${esc(date(b.created_at))} · ${esc(b.owner_name || 'Legado — autoria não comprovada')} · ${rows.length} SKU(s) / ${total} unidades<br>${esc(b.id)} · ${esc(b.export_state)}</p>
        ${b.export_state === 'CONFIRMED' ? `<button class="secondary-button" type="button" data-owner-download="${esc(b.id)}">Baixar novamente</button>` : ''}
        ${b.export_state === 'RESERVED' && b.created_by === context().authId ? `<button type="button" class="secondary-button" data-owner-resume="${esc(b.id)}">Continuar exportação</button>
        <button type="button" class="secondary-button" data-owner-release="${esc(b.id)}">Liberar reserva</button>` : ''}</article>`;
    }).join('') : '<p>Nenhuma exportação neste filtro.</p>';
  }
  async function template() {
    const XLSX = xlsx();
    if (!XLSX) throw new Error('Biblioteca Excel ainda não carregada.');
    const result = await fetchTemplate();
    if (!result.ok) throw new Error('Não foi possível carregar o modelo de materiais.');
    const workbook = XLSX.read(await result.arrayBuffer(), { type: 'array' });
    fillReplenishmentTemplate(XLSX, workbook, []);
    return workbook;
  }
  function serialize(batch, workbook) {
    const rows = buildReplenishmentExportRows(batch.requests, batch.warehouse_code);
    if (!rows.length) throw new Error('Lote sem itens exportáveis.');
    fillReplenishmentTemplate(xlsx(), workbook, rows);
    return xlsx().write(workbook, { bookType: 'xlsx', type: 'array' });
  }
  async function exportItems(filter) {
    const token = current(), c = context(), workbook = await template();
    if (token !== current()) throw new Error('O usuário ou estoque mudou.');
    const key = JSON.stringify([token, filter]);
    if (!pending || pending.key !== key) pending = { key, id: crypto.randomUUID() };
    const params = { ...filter, batch_id: pending.id };
    let batch;
    try {
      batch = await rpc('RESERVE', params, c.warehouse);
      const bytes = serialize(batch, workbook);
      if (token !== current()) throw new Error('O usuário ou estoque mudou.');
      batch = await rpc('CONFIRM', params, c.warehouse);
      pending = null;
      if (token !== current()) return;
      await save(bytes, batch.file_name);
      const rows = buildReplenishmentExportRows(batch.requests, batch.warehouse_code);
      status(`Exportação concluída. ${rows.length} itens / ${rows.reduce((sum, row) => sum + row[1], 0)} unidades. Arquivo gerado somente com os itens atendidos e concluídos por ${batch.owner_name}. Baixe novamente pelo histórico se necessário.`);
    } catch (error) {
      // Unknown network outcomes keep the stable token; history can resume or release the reservation.
      if (batch?.export_state === 'RESERVED') {
        try { await rpc('RELEASE', params, c.warehouse); pending = null; } catch { /* Keep recoverable batch. */ }
      }
      throw error;
    }
  }
  async function download(id, resume) {
    const token = current(), c = context(), item = batches.find(b => b.id === id);
    const params = item.format_version === 1 ? { mode: 'ADMIN', batch_id: id } : batchPayload(item);
    const workbook = await template();
    if (token !== current()) return;
    const batch = resume ? item : await rpc('DOWNLOAD', params, c.warehouse);
    const bytes = serialize(batch, workbook);
    if (token !== current()) return;
    if (resume) await rpc('CONFIRM', params, c.warehouse);
    if (token === current()) await save(bytes, batch.file_name || `Materiais_Reposicao_${batch.warehouse_code}_${batch.id}.xlsx`);
  }
  async function refresh() {
    mount();
    const c = context(), token = current(), seq = ++version;
    root.querySelector('[data-owner-export]').disabled = true;
    if (scope !== token) {
      scope = token; pending = null; payload = {}; batches = [];
      root.querySelector('[data-owner-history]').textContent = '';
      root.querySelector('[data-owner-unfinished]').textContent = '';
      root.querySelector('[data-owner-summary]').textContent = 'Carregando seus itens…';
      root.querySelector('[data-owner-select]').innerHTML = '<option value="">Selecione</option>';
      root.querySelector('[data-owner-admin-result]').textContent = '';
      status('');
    }
    const allowed = ['ADMINISTRADOR', 'SUPERVISOR', 'OPERADOR'].includes(c.user?.role);
    if (!allowed) { root.hidden = true; return; }
    root.querySelector('[data-owner-admin]').hidden = !['ADMINISTRADOR', 'SUPERVISOR'].includes(c.user.role);
    try {
      const summary = await rpc('SUMMARY', {}, c.warehouse);
      if (token !== current() || seq !== version) return;
      root.querySelector('[data-owner-summary]').textContent = describe(summary);
      root.querySelector('[data-owner-export]').disabled = busy || !summary.items;
      root.querySelector('[data-owner-unfinished]').innerHTML = (summary.unfinished || []).map(item =>
        `<p>SKU ${esc(item.codigo_material)} · ${item.quantity} un. atendidas por você, ainda sem conclusão.
        <button type="button" class="secondary-button" data-owner-conclude="${esc(item.request_id)}">Concluir minha parcela para exportação</button></p>`).join('') +
        (summary.legacy_count ? '<p class="muted">Há atendimentos anteriores sem autoria comprovada. Eles não entram automaticamente na exportação individual.</p>' : '');
      if (!summary.items && !root.querySelector('[data-owner-status]').textContent) status('Você não possui itens concluídos pendentes de exportação.');
      if (!root.querySelector('[data-owner-admin]').hidden) {
        const options = await rpc('DIRECTORY', { mode: 'ADMIN' }, c.warehouse);
        if (token !== current() || seq !== version) return;
        const select = root.querySelector('[data-owner-select]'), selected = select.value;
        select.innerHTML = '<option value="">Selecione</option>' + options.map(o => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('');
        select.value = selected;
      }
      await history(payload);
    } catch (error) {
      if (token === current() && seq === version) { root.querySelector('[data-owner-export]').disabled = true; status(error.message); }
    }
  }
  return { refresh };
}

function saveFile(bytes, filename) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
