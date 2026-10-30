import { nextRealtimeRetryDelay } from "./sync-control.js";
import { recordOperationalDiagnostic } from "./operational-diagnostics.js";

// One scoped channel; events invalidate only the affected operational domain.
export function createOperationalSync({ client, actor, role, warehouse, isCurrent, onRefresh, onState = () => {}, onStop = () => {}, allowRealtime = true, timers = globalThis }) {
  let channel, retry, debounce, stopped = false, live = false, epoch = 0, failures = 0, refreshing = false, ticks = 0;
  const pending = new Set(), seen = new Set();
  const tables = [["wms_caixa_requests", "warehouse_code"], ["wms_caixa_request_messages", "warehouse_code"]];
  const active = () => !stopped && isCurrent();
  const diagnostic = (event, category, result) => recordOperationalDiagnostic({ module: "caixa", event, category, result, warehouse, operationId: actor + ":" + role });
  const state = value => { if (active()) onState(value); diagnostic("sync-state", value); };
  function clearChannel() { if (channel) { const old = channel; channel = null; Promise.resolve(client.removeChannel?.(old)).catch(() => {}); } }
  function stop() {
    if (stopped) return;
    stopped = true; ++epoch; timers.clearInterval(interval); timers.clearTimeout(retry); timers.clearTimeout(debounce); clearChannel(); pending.clear(); seen.clear(); onStop();
  }
  async function flush(reason) {
    if (!active()) { stop(); return; }
    if (refreshing) { pending.add("all"); return; }
    const affected = [...pending]; pending.clear(); refreshing = true;
    state("SINCRONIZANDO");
    try {
      const accepted = await onRefresh({ tables: affected.length ? affected : ["all"], reason });
      if (!active()) return;
      if (accepted === false) pending.add("all");
      else { state(live ? "CONECTADO" : "DADOS_POSSIVELMENTE_DESATUALIZADOS"); diagnostic("refresh", reason, "ok"); }
    } catch (error) { if (active()) { state("FALHA_SINCRONIZACAO"); diagnostic("refresh", error.code || "network-or-api", "failed"); } }
    finally { refreshing = false; if (pending.size && active()) schedule(); }
  }
  function schedule() {
    if (!active() || debounce) return;
    debounce = timers.setTimeout(() => { debounce = null; void flush("event"); }, 300); debounce?.unref?.();
  }
  function receive(table, payload) {
    if (!active()) return;
    const row = payload.new || {}, old = payload.old || {};
    const code = row.warehouse_code || old.warehouse_code;
    if (code && code !== warehouse) return;
    const id = row.id || old.id, stamp = row.updated_at || (payload.eventType !== "UPDATE" ? id : null);
    if (id && stamp) {
      const key = [table, id, payload.eventType, stamp].join(":");
      if (seen.has(key)) return;
      seen.add(key); if (seen.size > 500) seen.delete(seen.values().next().value);
    }
    pending.add(table); schedule();
  }
  function reconnect() {
    if (!active() || retry) return;
    live = false; ++epoch; clearChannel(); state("RECONECTANDO");
    retry = timers.setTimeout(() => { retry = null; connect(); }, nextRealtimeRetryDelay(++failures)); retry?.unref?.();
  }
  function connect() {
    if (!active() || !allowRealtime || typeof client.channel !== "function") { state("DADOS_POSSIVELMENTE_DESATUALIZADOS"); return; }
    const version = ++epoch;
    try {
      channel = client.channel("wms-caixa:" + warehouse + ":" + actor + ":" + role);
      for (const [table, column] of tables) channel.on("postgres_changes", { event: "*", schema: "public", table, filter: column + "=eq." + warehouse }, payload => { if (version === epoch) receive(table, payload); });
      channel.subscribe(status => {
        if (!active() || version !== epoch) return;
        if (status === "SUBSCRIBED") { const recovered = failures > 0; live = true; failures = 0; ticks = 0; state("CONECTADO"); if (recovered) { pending.add("all"); schedule(); } }
        else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) reconnect();
      });
    } catch { reconnect(); }
  }
  const interval = timers.setInterval(async () => {
    if (!active()) { stop(); return; }
    // Reconcile even with Realtime: filtered DELETE events may not be delivered.
    if (live && ++ticks < 4) return;
    ticks = 0; await flush(live ? "reconciliation" : "poll");
  }, 15000);
  interval?.unref?.(); connect();
  return { stop, reconcile: () => { pending.add("all"); schedule(); } };
}
