import { createCaixaAlertFeed, isCaixaUrgentCandidate } from './caixa-alert-feed.js';
import './caixa-alerts.css';

export function createCaixaAlerts({ client, actor, role, warehouse, isCurrent, onCount, onOpen, onSound, onError, describeSku = () => '', storage = window.localStorage, timers = window, now = Date.now, vibrate = pattern => navigator.vibrate?.(pattern), locks = navigator.locks, allowRealtime }) {
  let stopped = false, toast = null, expiry = null, waitingDialog = null, queued = [], lastCue = null;
  const current = () => !stopped && isCurrent();
  const key = 'wms_caixa_alert_preferences_v1:' + actor;
  const preferences = { sound: true, vibration: false };
  try { const value = JSON.parse(storage.getItem(key) || '{}'); for (const name of ['sound','vibration']) if (typeof value[name] === 'boolean') preferences[name] = value[name]; } catch { /* defaults */ }
  function unwatch() {
    waitingDialog?.removeEventListener('close', show); waitingDialog = null;
    document.removeEventListener('visibilitychange', show);
  }
  function dismiss() {
    if (expiry) timers.clearTimeout(expiry);
    unwatch(); expiry = null; queued = []; toast?.remove(); toast = null;
  }
  function cue() {
    if (lastCue !== null && now() - lastCue < 12000) return;
    lastCue = now();
    if (preferences.sound) { try { void Promise.resolve(onSound()).catch(() => {}); } catch { /* audio permission */ } }
    if (preferences.vibration) { try { vibrate([100,60,100]); } catch { /* unsupported or blocked */ } }
  }
  function show() {
    unwatch();
    if (!current() || !queued.length) return;
    // Camera and other dialogs keep their top layer and user activation. Never close them.
    const dialog = document.querySelector('dialog[open]');
    if (dialog) { waitingDialog = dialog; dialog.addEventListener('close', show, {once:true}); return; }
    if (document.visibilityState === 'hidden') { document.addEventListener('visibilitychange', show); return; }
    const row = queued[0];
    if (!toast) {
      toast = document.createElement('aside'); toast.id = 'caixaUrgentToast'; toast.className = 'caixa-urgent-toast';
      toast.setAttribute('role','status'); toast.setAttribute('aria-live','polite');
      const title = document.createElement('strong'), detail = document.createElement('p'), actions = document.createElement('div');
      title.dataset.title = ''; detail.dataset.detail = ''; actions.className = 'caixa-urgent-actions';
      const attend = document.createElement('button'), later = document.createElement('button');
      attend.type = later.type = 'button'; attend.textContent = 'Atender'; later.textContent = 'Depois';
      attend.className = 'primary-button'; later.className = 'secondary-button';
      attend.onclick = () => { const selected = queued[0]; dismiss(); if (current() && selected) void Promise.resolve(onOpen(selected.id)).catch(onError); };
      later.onclick = dismiss; actions.append(attend,later); toast.append(title,detail,actions); document.body.append(toast);
      expiry = timers.setTimeout(dismiss, 8000);
    }
    toast.querySelector('[data-title]').textContent = 'Urgente · Cliente no caixa · SKU ' + (row.sku || 'não informado');
    const description = row.product_name || row.nome_material || describeSku(row.sku) || (row.kind === 'ADJUSTMENT' ? 'Solicitação de ajuste' : 'Produto solicitado');
    const priority = row.priority || row.prioridade;
    toast.querySelector('[data-detail]').textContent = description + (priority ? ' · ' + priority : '') + (queued.length > 1 ? ' · +' + (queued.length - 1) + ' solicitações' : '');
  }
  const feed = createCaixaAlertFeed({ client, actor, role, warehouse, isCurrent: current, storage, locks, allowRealtime, timers, onCount, onError,
    onAlert: rows => { if (!current()) return; queued = [...new Map(queued.concat(rows).map(row => [row.id,row])).values()]; cue(); show(); }
  });
  feed.subscribe(({rows}) => {
    if (!queued.length) return;
    queued = queued.filter(row => rows.some(next => next.id === row.id && isCaixaUrgentCandidate(next,actor,role)));
    if (!queued.length) dismiss(); else if (toast) show();
  });
  function mountSettings(host) {
    host.replaceChildren();
    const detail = document.createElement('details'), summary = document.createElement('summary');
    summary.textContent = 'Preferências dos alertas urgentes'; detail.append(summary);
    for (const [name,label] of [['sound','Som (respeita o volume de tarefas)'],['vibration','Vibrar neste dispositivo']]) {
      const field = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox'; input.checked = preferences[name];
      input.onchange = () => { if (!current()) return; preferences[name] = input.checked; try { storage.setItem(key,JSON.stringify(preferences)); } catch { /* in memory */ } };
      field.append(input,document.createTextNode(label)); detail.append(field);
    }
    host.append(detail);
  }
  return { feed, start: () => feed.start(), mountSettings, dismiss,
    close() { stopped = true; dismiss(); feed.close(); }
  };
}
