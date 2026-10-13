export const GLOBAL_SCOPE_CODE = "DOURADOS";
export const GLOBAL_DASHBOARD_CONFIG = Object.freeze({
  cacheSeconds: 30,
  freshHours: 24,
  staleHours: 48,
  stalledHours: 4,
  pendingWarningCount: 10,
  minimumAvailable: 1
});

export function isGlobalAdministrator(user) {
  return Boolean(user && user.active === true && user.archived !== true &&
    user.role === "ADMINISTRADOR" &&
    (user.defaultWarehouseCode ?? user.default_warehouse_code) === GLOBAL_SCOPE_CODE &&
    ["admin", "tnogueira"].includes(String(user.username || "").toLowerCase()));
}

export function isGlobalView(user, warehouseCode) {
  return isGlobalAdministrator(user) && warehouseCode === GLOBAL_SCOPE_CODE;
}

export function operationalWarehouses(warehouses) {
  return warehouses.filter(warehouse => warehouse.active === true && warehouse.code !== GLOBAL_SCOPE_CODE);
}

export function captacaoFreshness(batch, config = GLOBAL_DASHBOARD_CONFIG, now = Date.now()) {
  if (!batch) return "DESATUALIZADO";
  if (batch.status === "FAILED") return "ERRO";
  if (batch.status !== "COMPLETED") return "ATENCAO";
  const age = (now - new Date(batch.finished_at || batch.created_at).getTime()) / 3600000;
  return age >= config.staleHours ? "DESATUALIZADO" : age >= config.freshHours ? "ATENCAO" : "ATUALIZADO";
}

export function warehouseAttention(warehouse, config = GLOBAL_DASHBOARD_CONFIG) {
  if (warehouse.overdue || warehouse.stalled || warehouse.freshness === "ERRO" || warehouse.active === 0) return "CRITICO";
  if (warehouse.divergence || warehouse.available < config.minimumAvailable || warehouse.pending >= config.pendingWarningCount || ["DESATUALIZADO", "ATENCAO"].includes(warehouse.freshness)) return "ATENCAO";
  return "NORMAL";
}

export function createGlobalDashboardService(client, getUser, config = GLOBAL_DASHBOARD_CONFIG) {
  const cache = new Map();
  const versions = new Map();
  let generation = 0;
  function authorize() {
    if (!isGlobalAdministrator(getUser())) throw new Error("Visao Geral nao autorizada.");
  }
  const diagnostics = { queries: 0, cacheHits: 0, lastRefresh: "", durationMs: 0, lastError: "", realtime: "Parado", rpcAvailable: false, slowestSource: "", slowestMs: 0 };
  async function read(section, filters = {}, limit = 30, offset = 0, force = false) {
    authorize();
    const userId = getUser().id;
    const key = JSON.stringify([userId, section, filters, limit, offset, config]);
    const entry = cache.get(key);
    if (!force && entry && Date.now() - entry.at < config.cacheSeconds * 1000) { diagnostics.cacheHits++; return entry.data; }
    const version = generation;
    const sectionVersion = versions.get(section) || 0;
    diagnostics.queries++;
    const started=Date.now();
    const { data, error } = await client.rpc("wms_global_dashboard", {
      p_section: section,
      p_filters: { ...filters, stalled_hours: config.stalledHours, stale_hours: config.staleHours },
      p_limit: limit,
      p_offset: offset
    });
    if(Date.now()-started>diagnostics.slowestMs){diagnostics.slowestMs=Date.now()-started;diagnostics.slowestSource=section;}
    if (error) { diagnostics.lastError = error.message; throw error; }
    diagnostics.rpcAvailable = true;
    authorize();
    if (getUser().id !== userId || generation !== version || sectionVersion !== (versions.get(section) || 0)) throw new Error("O escopo da consulta mudou.");
    cache.set(key, { at: Date.now(), data });
    return data;
  }
  async function overview(filters = {}, force = false) {
    authorize();
    const start = Date.now();
    const warehouseResponse = await client.from("wms_warehouses").select("code,name,active").eq("active", true).neq("code", GLOBAL_SCOPE_CODE).order("name");
    if (warehouseResponse.error) throw warehouseResponse.error;
    const sections = { tasks: "tasks_summary", replenishment: "replenishment_summary", transfers: "transfers_summary", team: "team", captacao: "captacao", imports: "imports", alerts: "alerts_summary" };
    const data = { warehouses: operationalWarehouses(warehouseResponse.data || []).filter(w => !filters.warehouse || w.code === filters.warehouse), errors: {} };
    await Promise.all(Object.entries(sections).map(async ([key, section]) => {
      try { data[key] = await read(section, filters, 30, 0, force); }
      catch (error) { data.errors[key] = error.message || String(error); }
    }));
    diagnostics.durationMs = Date.now() - start;
    diagnostics.lastRefresh = new Date().toISOString();
    data.generated_at = diagnostics.lastRefresh;
    return data;
  }
  return {
    diagnostics,
    getGlobalOverview: overview,
    getWarehouseOverview: overview,
    getGlobalTasks: (filters, offset) => read("tasks", filters, 30, offset),
    getGlobalReplenishmentSummary: (filters, offset) => read("replenishment", filters, 30, offset),
    getGlobalTransfersSummary: (filters, offset) => read("transfers", filters, 30, offset),
    getGlobalAlerts: (filters, offset) => read("alerts", filters, 30, offset),
    getWarehouseActivity: filters => read("activity", filters, 20),
    getCaptacaoFreshnessByWarehouse: filters => read("captacao", filters),
    getAvailableUsersByWarehouse: filters => read("team", filters),
    getDomainSummary: (domain, filters) => read(domain + "_summary", filters, 50, 0, true),
    getDetails: read,
    invalidate(domain) {
      const sections=["tasks","tasks_summary","replenishment","replenishment_summary","transfers","transfers_summary","transfer_items","team","users","captacao","imports","alerts","alerts_summary","activity","overview"];
      const affected=section=>!domain || section===domain || section===domain+"_summary" || ["overview","alerts","alerts_summary","activity"].includes(section) ||
        (["tasks","replenishment","transfers","team"].includes(domain)&&["team","users"].includes(section)) || (domain==="captacao"&&section==="imports") || (domain==="transfers"&&section==="transfer_items");
      for(const section of sections)if(affected(section))versions.set(section,(versions.get(section)||0)+1);
      for (const key of cache.keys()) {
        const section = JSON.parse(key)[1];
        if (affected(section)) cache.delete(key);
      }
    },
    clear() { generation++; cache.clear(); }
  };
}
