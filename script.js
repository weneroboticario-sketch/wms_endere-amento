import { createWmsSupabaseClient } from "./src/supabase-client.js";
import {
  AUTH_EMAIL_DOMAIN,
  changeOwnPassword,
  getCurrentAuthSession,
  invokeUserAdministration,
  signInWithUsername,
  signOutAuthSession
} from "./src/auth.js";
import { escapeHtml, installHtmlSecurity, randomId } from "./src/utils.js";
import { DEFAULT_WAREHOUSE_CODE, DEFAULT_WAREHOUSE_ID, WAREHOUSE_SEED } from "./src/warehouses.js";
import { loadBuiltinProducts } from "./src/product-catalog.js";
import { nextRealtimeRetryDelay } from "./src/sync-control.js";

(function () {
  "use strict";

  var SUPABASE_CONFIG_KEY = "wms_supabase_config_v1";
  var TASK_SOUND_KEY = "wms_task_sound_enabled_v1";
  var REPLENISHMENT_SOUND_KEY = "wms_replenishment_sound_enabled_v1";
  var REPLENISHMENT_SOUND_VOLUME_KEY = "wms_replenishment_sound_volume_v1";
  var REPLENISHMENT_SOUND_REPEAT_KEY = "wms_replenishment_sound_repeat_v1";
  var REPLENISHMENT_NOTIFICATION_PERMISSION_KEY = "wms_replenishment_notification_prompt_v1";
  var LOCAL_CACHE_DB_NAME = "wms_operational_cache_v1";
  var LOCAL_CACHE_STORE = "records";
  var LOCAL_SYNC_PREFIX = "wms_last_sync_";
  var SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
  var EXPECTED_SCHEMA_VERSION = "2026.09.23.003";
  var ROLES = ["ADMINISTRADOR", "SUPERVISOR", "OPERADOR"];
  var SCREEN_PERMISSIONS = {
    dashboard: ["ADMINISTRADOR", "SUPERVISOR"],
    bipagem: ["ADMINISTRADOR", "SUPERVISOR", "OPERADOR"],
    consultaSku: ["ADMINISTRADOR", "SUPERVISOR", "OPERADOR"],
    consultaPrateleira: ["ADMINISTRADOR", "SUPERVISOR", "OPERADOR"],
    etiquetas: ["ADMINISTRADOR", "SUPERVISOR", "OPERADOR"],
    exportar: ["ADMINISTRADOR", "SUPERVISOR", "OPERADOR"],
    importar: ["ADMINISTRADOR", "SUPERVISOR", "OPERADOR"],
    transferencias: ["ADMINISTRADOR", "SUPERVISOR", "OPERADOR"],
    reposicao: ["ADMINISTRADOR", "SUPERVISOR", "OPERADOR"],
    usuarios: ["ADMINISTRADOR", "SUPERVISOR"],
    saudeSistema: ["ADMINISTRADOR"],
    manutencao: ["ADMINISTRADOR"],
    estoques: ["ADMINISTRADOR"],
    baseEstoque: ["ADMINISTRADOR", "SUPERVISOR", "OPERADOR"],
    configuracoes: ["ADMINISTRADOR"]
  };
  var TRANSFER_STATUSES = [
    "PENDENTE",
    "ATRIBUIDA",
    "AGUARDANDO_SEPARACAO",
    "EM_SEPARACAO",
    "SEPARACAO_CONCLUIDA",
    "EM_LACRE",
    "EM_MONTAGEM_CAIXA",
    "EM_CORRECAO",
    "CORRECAO_SOLICITADA",
    "CORRECAO_CONCLUIDA",
    "LACRE_CONCLUIDO",
    "MONTAGEM_CAIXA_CONCLUIDA",
    "PRONTA_PARA_NOTA",
    "PRONTA_PARA_NOTA_COM_DIVERGENCIA",
    "FINALIZADA",
    "FINALIZADA_PARA_ANALISE",
    "CONCLUIDA_SEM_DIVERGENCIA",
    "CONCLUIDA_COM_DIVERGENCIA",
    "UNIFICADA",
    "ARQUIVADA_POR_UNIFICACAO",
    "CANCELADA"
  ];
  var FINAL_TRANSFER_STATUSES = ["PRONTA_PARA_NOTA", "PRONTA_PARA_NOTA_COM_DIVERGENCIA", "FINALIZADA", "CONCLUIDA_SEM_DIVERGENCIA", "CONCLUIDA_COM_DIVERGENCIA", "FINALIZADA_PARA_ANALISE", "UNIFICADA", "ARQUIVADA_POR_UNIFICACAO"];
  var MERGEABLE_TRANSFER_STATUSES = ["PENDENTE", "ATRIBUIDA", "AGUARDANDO_SEPARACAO"];
  var REPLENISHMENT_STATUSES = ["PENDENTE", "ATRIBUIDO", "EM_SEPARACAO", "SEPARADO", "ENTREGUE_NA_LOJA", "CONCLUIDO", "ATENDIDO_PARCIAL", "SEM_ESTOQUE", "CANCELADO"];
  var FINAL_REPLENISHMENT_STATUSES = ["CONCLUIDO", "ENTREGUE_NA_LOJA", "SEM_ESTOQUE", "CANCELADO"];
  var REPLENISHMENT_RENDER_PAGE_SIZE = 30;
  var REPLENISHMENT_SUGGESTION_PAGE_SIZE = 50;
  var OPEN_REPLENISHMENT_STATUSES = ["PENDENTE", "ATRIBUIDO", "EM_SEPARACAO", "ATENDIDO_PARCIAL"];
  var STORE_REFERENCE_ROWS = [
    { cnpj: "00.138.798/0001-32", loja: "14A1", cod: "5508", canal: "VAREJO", codVf: "743" },
    { cnpj: "00.138.798/0014-57", loja: "14D2", cod: "20004", canal: "VAREJO", codVf: "744" },
    { cnpj: "00.138.798/0003-02", loja: "AERO", cod: "14411", canal: "VAREJO", codVf: "21136" },
    { cnpj: "00.138.798/0006-47", loja: "AQUI", cod: "18021", canal: "VAREJO", codVf: "144634" },
    { cnpj: "00.138.798/0005-66", loja: "BOSQ", cod: "14559", canal: "VAREJO", codVf: "21138" },
    { cnpj: "33.761.917/0005-91", loja: "BRIL", cod: "13230", canal: "VAREJO", codVf: "21135" },
    { cnpj: "03.386.879/0003-01", loja: "CORU", cod: "11121", canal: "VAREJO", codVf: "144641" },
    { cnpj: "00.138.798/0016-19", loja: "ECO1", cod: "21343", canal: "VAREJO", codVf: "144636" },
    { cnpj: "00.138.798/0021-86", loja: "ECO2", cod: "21928", canal: "VAREJO", codVf: "144639" },
    { cnpj: "00.138.798/0020-03", loja: "ECO3", cod: "21929", canal: "VAREJO", codVf: "144638" },
    { cnpj: "00.138.798/0004-85", loja: "EULE", cod: "14472", canal: "VAREJO", codVf: "21137" },
    { cnpj: "33.761.917/0002-49", loja: "HYPE", cod: "11655", canal: "VAREJO", codVf: "21143" },
    { cnpj: "33.761.917/0003-20", loja: "JARD", cod: "11673", canal: "VAREJO", codVf: "21144" },
    { cnpj: "00.138.798/0007-28", loja: "MIRA", cod: "18024", canal: "HIBRIDA", codVf: "144635" },
    { cnpj: "00.138.798/0008-09", loja: "MORE", cod: "17520", canal: "VAREJO", codVf: "21139" },
    { cnpj: "33.761.917/0004-00", loja: "NSUL", cod: "12907", canal: "VAREJO", codVf: "21134" },
    { cnpj: "00.138.798/0015-38", loja: "PARA", cod: "19986", canal: "VAREJO", codVf: "21140" },
    { cnpj: "33.761.917/0007-53", loja: "PARK", cod: "21526", canal: "VAREJO", codVf: "144644" },
    { cnpj: "00.138.798/0011-04", loja: "PATI", cod: "20002", canal: "VAREJO", codVf: "745" },
    { cnpj: "00.138.798/0012-95", loja: "SAMS", cod: "20003", canal: "VAREJO", codVf: "746" },
    { cnpj: "00.138.798/0019-61", loja: "SHOP", cod: "22776", canal: "VAREJO", codVf: "922776" },
    { cnpj: "00.138.798/0022-67", loja: "SIDR", cod: "22208", canal: "VAREJO", codVf: "144640" },
    { cnpj: "33.761.917/0001-68", loja: "SPIP", cod: "4780", canal: "VAREJO", codVf: "4780" },
    { cnpj: "00.138.798/0002-13", loja: "TAMA", cod: "11892", canal: "VAREJO", codVf: "747" },
    { cnpj: "00.138.798/0018-80", loja: "ZAHR", cod: "22105", canal: "VAREJO", codVf: "144637" },
    { cnpj: "08.575.189/0004-03", loja: "VDAQ", cod: "14482", canal: "VD", codVf: "144643" },
    { cnpj: "18.325.344/0004-89", loja: "VDAR", cod: "21973", canal: "VD", codVf: "740" },
    { cnpj: "08.575.189/0001-52", loja: "VDCG", cod: "13437", canal: "VD", codVf: "21141" },
    { cnpj: "08.575.189/0002-33", loja: "VDCO", cod: "14145", canal: "VD", codVf: "144642" },
    { cnpj: "00.138.798/0023-48", loja: "VDSI", cod: "22209", canal: "VD", codVf: "5508" },
    { cnpj: "18.325.344/0001-36", loja: "QDCG", cod: "910102", canal: "VAREJO", codVf: "21145" },
    { cnpj: "00.138.798/0024-29", loja: "VDMO", cod: "23812", canal: "VD", codVf: "4227" }
  ];
  var supabaseConfig = { url: "", key: "" };
  var supabaseConfigDiagnostics = null;
  var supabaseDb = null;
  var productsDirty = false;
  var productsTableAvailable = true;
  var historySchemaAvailable = true;
  var skuSearchTimer = null;
  var HISTORY_RENDER_LIMIT = 200;
  var TRANSFER_PANEL_PAGE_SIZE = 40;
  var TRANSFER_PANEL_RENDER_LIMIT = TRANSFER_PANEL_PAGE_SIZE;
  var TRANSFER_FINALIZED_RENDER_LIMIT = 50;
  var TRANSFER_TASK_RENDER_LIMIT = 80;
  var AREAS = [
    { code: 1, name: "Alto Giro" },
    { code: 2, name: "Médio Giro" },
    { code: 3, name: "Área RF" },
    { code: 4, name: "Baixo Giro" },
    { code: 5, name: "Picking by Light" }
  ];
  var BUILTIN_PRODUCTS = {};
  var REQUIRED_COLUMNS = [
    "Nome estacao",
    "Nr Rack",
    "Area Linha Separaçao",
    "Linha",
    "Coluna",
    "Codigo Material",
    "Conferencia Obrigatoria"
  ];
  var LEGEND_ROWS = [
    ["Nome", "Descrição", "Obrigatório", "Obs"],
    ["Nome estacao", "Nome estacao", "Sim", ""],
    ["Nr Rack", "Nr Rack", "Sim", ""],
    ["Area Linha Separaçao", "Area Linha Separaçao", "Não", "1 - Alto Giro <br/> 2 - Médio Giro <br/> 3 - Área RF <br/> 4 - Baixo Giro <br/> 5 - Picking by Light"],
    ["Linha", "Linha", "Sim", ""],
    ["Coluna", "Coluna", "Sim", ""],
    ["Codigo Material", "Para que o código de material seja considerado válido no processo de endereçamento, é necessário que ele esteja ativo (ou seja, não expirado).", "Não", ""],
    ["Conferencia Obrigatoria", "Conferencia Obrigatoria", "Sim", ""]
  ];
  var LINHA_SEPARACAO_TEMPLATE = [
    { rua: 1, rackStart: 1, rackEnd: 1, area: "2", lineEnd: 4, columnEnd: "G" },
    { rua: 1, rackStart: 2, rackEnd: 10, area: "1", lineEnd: 4, columnEnd: "G" },
    { rua: 2, rackStart: 1, rackEnd: 1, area: "3", lineEnd: 4, columnEnd: "G" },
    { rua: 2, rackStart: 2, rackEnd: 2, area: "1", lineEnd: 4, columnEnd: "G" },
    { rua: 2, rackStart: 3, rackEnd: 3, area: "1", lineEnd: 4, columnEnd: "K" },
    { rua: 2, rackStart: 4, rackEnd: 4, area: "1", lineEnd: 4, columnEnd: "N" },
    { rua: 2, rackStart: 5, rackEnd: 7, area: "1", lineEnd: 4, columnEnd: "H" },
    { rua: 2, rackStart: 8, rackEnd: 9, area: "1", lineEnd: 4, columnEnd: "G" },
    { rua: 2, rackStart: 10, rackEnd: 10, area: "1", lineEnd: 4, columnEnd: "H" },
    { rua: 3, rackStart: 1, rackEnd: 1, area: "2", lineEnd: 4, columnEnd: "G" },
    { rua: 3, rackStart: 2, rackEnd: 2, area: "4", lineEnd: 6, columnEnd: "F" },
    { rua: 3, rackStart: 3, rackEnd: 3, area: "2", lineEnd: 4, columnEnd: "G" },
    { rua: 3, rackStart: 4, rackEnd: 4, area: "2", lineEnd: 4, columnEnd: "D" },
    { rua: 3, rackStart: 5, rackEnd: 9, area: "2", lineEnd: 4, columnEnd: "G" },
    { rua: 1, rackStart: 11, rackEnd: 14, area: "1", lineEnd: 4, columnEnd: "G" },
    { rua: 2, rackStart: 11, rackEnd: 11, area: "1", lineEnd: 4, columnEnd: "H" },
    { rua: 2, rackStart: 12, rackEnd: 12, area: "1", lineEnd: 4, columnEnd: "I" },
    { rua: 2, rackStart: 13, rackEnd: 13, area: "1", lineEnd: 4, columnEnd: "G" },
    { rua: 2, rackStart: 14, rackEnd: 14, area: "1", lineEnd: 4, columnEnd: "I" },
    { rua: 4, rackStart: 1, rackEnd: 1, area: "5", lineEnd: 4, columnEnd: "N" },
    { rua: 4, rackStart: 2, rackEnd: 2, area: "2", lineEnd: 4, columnEnd: "P" },
    { rua: 4, rackStart: 3, rackEnd: 3, area: "2", lineEnd: 4, columnEnd: "N" },
    { rua: 4, rackStart: 4, rackEnd: 4, area: "2", lineEnd: 4, columnEnd: "P" },
    { rua: 5, rackStart: 1, rackEnd: 4, area: "1", lineEnd: 4, columnEnd: "P" },
    { rua: 5, rackStart: 5, rackEnd: 5, area: "1", lineEnd: 7, columnEnd: "M" },
    { rua: 5, rackStart: 6, rackEnd: 6, area: "1", lineEnd: 6, columnEnd: "M" },
    { rua: 5, rackStart: 7, rackEnd: 8, area: "1", lineEnd: 7, columnEnd: "M" },
    { rua: 5, rackStart: 9, rackEnd: 9, area: "1", lineEnd: 3, columnEnd: "D" },
    { rua: 5, rackStart: 10, rackEnd: 10, area: "1", lineEnd: 5, columnEnd: "E" }
  ];

  var state = {
    bindings: [],
    history: [],
    products: {}
  };
  var warehouseState = {
    warehouses: WAREHOUSE_SEED.slice(),
    activeCode: DEFAULT_WAREHOUSE_CODE,
    activeId: DEFAULT_WAREHOUSE_ID,
    tableAvailable: true
  };
  var transferState = {
    establishments: [],
    transfers: [],
    items: [],
    events: [],
    previewItems: [],
    previewErrors: [],
    previewGroups: [],
    previewSource: "",
    previewRawText: "",
    previewFileName: "",
    activeTransferId: "",
    activeWorkMode: "SEPARACAO",
    mergeSelection: {},
    mergePreview: null,
    mergeResolutions: {},
    productPackaging: {},
    packagingPromptedSkus: {},
    loadedItemTransferIds: {},
    loadingTransferItems: {},
    panelRenderLimit: TRANSFER_PANEL_PAGE_SIZE,
    selectedItemId: "",
    manualSeparationQty: false,
    savingActionKey: "",
    actionLocks: {},
    scanInputStartedAt: 0,
    lastScanInputAt: 0,
    cacheWriteTimer: null,
    tablesAvailable: true
  };
  var transferStatsCache = {
    sourceItems: null,
    itemsByTransferId: null,
    statsByTransferId: {}
  };
  var maintenanceState = {
    lastReport: null,
    warehouseFilter: "CURRENT",
    activeScope: "all",
    lastResult: null,
    checking: false,
    cleaning: false
  };
  var healthState = {
    lastReport: null,
    loading: false,
    warehouseFilter: "ALL"
  };
  var replenishmentState = {
    requests: [],
    activeFilter: "",
    renderLimit: REPLENISHMENT_RENDER_PAGE_SIZE,
    suggestions: [],
    suggestionFilter: "",
    suggestionOffset: 0,
    suggestionsLoaded: false,
    suggestionsLoading: false,
    suggestionsHasMore: false,
    activeSuggestion: null,
    saving: false,
    lastCreatedSignature: "",
    lastCreatedAt: 0,
    currentProduct: null,
    tablesAvailable: true
  };
  var stockState = {
    batches: [],
    summary: { loja: 0, captacao: 0, updatedAt: "" },
    positionCache: {},
    lookupTimer: null,
    tablesAvailable: true,
    importing: false
  };
  var localCacheState = {
    db: null,
    available: false,
    warned: false,
    opening: null,
    closing: false,
    writeQueue: Promise.resolve(),
    writesPending: 0,
    lastError: "",
    lastErrorAt: "",
    lastCleanupAt: "",
    disabled: false
  };
  var performanceState = {
    syncStatus: "Inicializando",
    syncType: "warning",
    lastSyncAt: "",
    lastCoreLoadMs: 0,
    lastTransferLoadMs: 0,
    lastReplenishmentLoadMs: 0,
    lastStockLoadMs: 0,
    lastSkuQueryMs: 0,
    lastTransferQueryMs: 0,
    lastTransferListMs: 0,
    lastTransferDetailMs: 0,
    lastTransferItemsMs: 0,
    lastTransferStockMs: 0,
    lastTransferQueryCount: 0,
    lastTransferLoadedItems: 0,
    transferEventsUsage: "removido",
    lastReplenishmentCreateError: "",
    lastReplenishmentCreateErrorAt: "",
    recentErrors: [],
    errorThrottle: {}
  };
  var realtimeState = {
    channel: null,
    channels: [],
    pollTimer: null,
    refreshTimer: null,
    stockRefreshTimer: null,
    refreshRunning: false,
    refreshPending: false,
    failureCount: 0,
    warehouseCode: "",
    subscriptionStatus: "",
    lastLiveUpdateAt: "",
    recentEvents: [],
    disabledOptionalTables: {},
    lastOptionalFailure: null,
    active: false
  };

  var currentSku = "";
  var lastSkuSearch = "";
  var skuSearchRequestSeq = 0;
  var skuSearchState = {
    currentSku: "",
    locations: [],
    stockSuggestion: null,
    stockError: ""
  };
  var currentLocation = null;
  var editingId = null;
  var taskPollTimer = null;
  var taskAlertState = {
    initialized: false,
    signature: "",
    audioUnlocked: false,
    pendingSound: false,
    pendingReplenishmentSound: false,
    replenishmentSoundTimer: null,
    replenishmentSoundUntil: 0,
    notifiedReplenishments: {},
    read: {}
  };
  var authState = {
    currentUser: null,
    currentSession: null,
    users: [],
    accessRequests: [],
    usersTableAvailable: true,
    sessionsTableAvailable: true,
    accessRequestsTableAvailable: true,
    loginInProgress: false
  };
  var userManagementState = {
    tab: "ativos",
    selectedIds: {}
  };
  var moduleLoadState = {
    warehouses: false,
    users: false,
    accessRequests: false,
    core: false,
    transfers: false,
    replenishment: false,
    stock: false
  };
  var protectedAppShell = null;
  var protectedAppShellMarker = null;
  var sessionInactivityTimer = null;

  document.addEventListener("DOMContentLoaded", async function () {
    installHtmlSecurity();
    await initLocalCache();
    bindLocalCacheShutdownEvents();
    registerServiceWorker();
    bindConnectivityEvents();
    await loadSupabaseConfig();
    BUILTIN_PRODUCTS = await loadBuiltinProducts();
    fillSupabaseForm();
    fillTaskSoundSetting();
    initSupabaseClient();
    cacheStaticOptions();
    bindNavigation();
    bindEvents();
    bindSessionInactivityMonitor();
    bindTaskAudioUnlock();
    updateConnectivityUi();
    updateSupabaseStatus();
    await initAuth();
  });

  function $(id) {
    return document.getElementById(id);
  }

  function initLocalCache() {
    if (!("indexedDB" in window)) {
      localCacheState.available = false;
      return Promise.resolve(false);
    }
    if (localCacheState.opening) return localCacheState.opening;
    localCacheState.opening = new Promise(function (resolve) {
      var request = indexedDB.open(LOCAL_CACHE_DB_NAME, 1);
      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains(LOCAL_CACHE_STORE)) {
          db.createObjectStore(LOCAL_CACHE_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = function () {
        localCacheState.db = request.result;
        localCacheState.available = true;
        localCacheState.closing = false;
        localCacheState.disabled = false;
        attachLocalCacheLifecycle(localCacheState.db);
        localCacheState.opening = null;
        resolve(true);
      };
      request.onerror = function () {
        localCacheState.available = false;
        markLocalCacheError("cache-open", request.error);
        localCacheState.opening = null;
        resolve(false);
      };
      request.onblocked = function () {
        markLocalCacheError("cache-open-blocked", new Error("IndexedDB bloqueado por outra aba."));
      };
    });
    return localCacheState.opening;
  }

  function cacheKey(moduleName) {
    return moduleName + ":" + activeWarehouseCode();
  }

  function delay(ms) {
    return new Promise(function (resolve) { window.setTimeout(resolve, ms); });
  }

  function isSupabaseTransientNetworkError(error) {
    var message = formatSupabaseError(error).toLowerCase();
    return message.indexOf("failed to fetch") >= 0 ||
      message.indexOf("networkerror") >= 0 ||
      message.indexOf("network error") >= 0 ||
      message.indexOf("load failed") >= 0 ||
      message.indexOf("fetch failed") >= 0 ||
      message.indexOf("connection") >= 0 && message.indexOf("lost") >= 0 ||
      message.indexOf("timeout") >= 0 ||
      message.indexOf("timed out") >= 0 ||
      message.indexOf("aborted") >= 0;
  }

  async function runSupabaseRequestWithRetry(label, operation) {
    var waits = [0, 800, 2000, 4000, 7000, 10000];
    var lastError = null;
    for (var attempt = 0; attempt < waits.length; attempt += 1) {
      try {
        if (waits[attempt]) await delay(waits[attempt]);
        var response = await operation();
        if (!response || !response.error || !isSupabaseTransientNetworkError(response.error) || attempt === waits.length - 1) {
          return response;
        }
        lastError = response.error;
      } catch (error) {
        if (!isSupabaseTransientNetworkError(error)) throw error;
        lastError = error;
        if (attempt === waits.length - 1) return { error: error, data: null };
      }
    }
    if (lastError) throw lastError;
    return null;
  }

  function smallerSupabaseChunkSize(size) {
    return Math.max(20, Math.floor(Number(size || 20) / 2));
  }

  function bindLocalCacheShutdownEvents() {
    window.addEventListener("pageshow", function () {
      localCacheState.disabled = false;
      localCacheState.closing = false;
      initLocalCache();
    });
    window.addEventListener("pagehide", function () {
      localCacheState.disabled = true;
      closeLocalCache("pagehide");
    });
    window.addEventListener("beforeunload", function () {
      localCacheState.disabled = true;
      closeLocalCache("beforeunload");
    });
  }

  function attachLocalCacheLifecycle(db) {
    if (!db) return;
    db.onversionchange = function () {
      closeLocalCache("versionchange");
    };
    db.onclose = function () {
      localCacheState.db = null;
      localCacheState.available = false;
      localCacheState.closing = true;
      localCacheState.lastCleanupAt = nowIso();
    };
    db.onerror = function (event) {
      markLocalCacheError("cache-db", event && event.target ? event.target.error : event);
    };
  }

  function closeLocalCache(reason) {
    localCacheState.closing = true;
    localCacheState.available = false;
    localCacheState.lastCleanupAt = nowIso();
    if (localCacheState.db) {
      try { localCacheState.db.close(); } catch (error) { markLocalCacheError("cache-close-" + reason, error); }
    }
    localCacheState.db = null;
  }

  async function getLocalCacheDb(forceReopen) {
    if (!("indexedDB" in window) || localCacheState.disabled) return null;
    if (forceReopen) closeLocalCache("reopen");
    if (localCacheState.db && localCacheState.available && !localCacheState.closing) return localCacheState.db;
    await initLocalCache();
    return localCacheState.db && localCacheState.available && !localCacheState.closing ? localCacheState.db : null;
  }

  function isIndexedDbClosingError(error) {
    var message = formatSupabaseError(error).toLowerCase();
    return message.indexOf("connection is closing") >= 0 ||
      message.indexOf("database connection is closing") >= 0 ||
      message.indexOf("the database connection is closing") >= 0 ||
      message.indexOf("database is closing") >= 0 ||
      message.indexOf("invalidstateerror") >= 0 ||
      message.indexOf("transaction") >= 0 && message.indexOf("closing") >= 0;
  }

  function markLocalCacheError(label, error) {
    localCacheState.lastError = formatSupabaseError(error);
    localCacheState.lastErrorAt = nowIso();
    recordPerformanceError(label || "cache", error);
  }

  async function runCacheOperation(label, fallback, operation) {
    var waits = [0, 300];
    for (var attempt = 0; attempt < waits.length + 1; attempt += 1) {
      try {
        if (waits[attempt]) await delay(waits[attempt]);
        var db = await getLocalCacheDb(attempt > 0);
        if (!db) return fallback;
        return await operation(db);
      } catch (error) {
        if (attempt < waits.length && isIndexedDbClosingError(error)) {
          closeLocalCache("retry");
          continue;
        }
        markLocalCacheError(label, error);
        return fallback;
      }
    }
    return fallback;
  }

  function cacheGet(key) {
    return runCacheOperation("cache-read", null, function (db) {
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(LOCAL_CACHE_STORE, "readonly");
          var request = tx.objectStore(LOCAL_CACHE_STORE).get(key);
          request.onsuccess = function () { resolve(request.result || null); };
          request.onerror = function () {
            markLocalCacheError("cache-read", request.error);
            resolve(null);
          };
        } catch (error) {
          resolve(Promise.reject(error));
        }
      });
    });
  }

  function cacheSet(key, value) {
    localCacheState.writesPending += 1;
    localCacheState.writeQueue = localCacheState.writeQueue.catch(function () { return false; }).then(function () {
      if (localCacheState.disabled || localCacheState.closing) return false;
      return runCacheOperation("cache-write", false, function (db) {
        return new Promise(function (resolve, reject) {
          try {
            var tx = db.transaction(LOCAL_CACHE_STORE, "readwrite");
            tx.objectStore(LOCAL_CACHE_STORE).put({ key: key, value: value, updatedAt: new Date().toISOString() });
            tx.oncomplete = function () { resolve(true); };
            tx.onerror = function () { reject(tx.error); };
            tx.onabort = function () { reject(tx.error || new Error("Escrita IndexedDB abortada.")); };
          } catch (error) {
            reject(error);
          }
        });
      });
    }).finally(function () {
      localCacheState.writesPending = Math.max(0, localCacheState.writesPending - 1);
    });
    return localCacheState.writeQueue;
  }

  async function pauseLocalCacheForContextChange(reason) {
    localCacheState.disabled = true;
    try {
      await Promise.race([
        localCacheState.writeQueue.catch(function () { return false; }),
        delay(1200)
      ]);
    } catch (error) {
      markLocalCacheError("cache-pause-" + reason, error);
    }
    if (localCacheState.writesPending > 0) {
      markLocalCacheError("cache-pause-" + reason, new Error("Escrita IndexedDB pendente; fechamento adiado."));
    } else {
      closeLocalCache(reason || "context-change");
    }
    localCacheState.disabled = false;
    localCacheState.closing = false;
  }

  async function readModuleCache(moduleName) {
    var record = await cacheGet(cacheKey(moduleName));
    return record && record.value ? record.value : null;
  }

  async function writeModuleCache(moduleName, value) {
    var scopedKey = cacheKey(moduleName);
    localStorage.setItem(LOCAL_SYNC_PREFIX + scopedKey, nowIso());
    return cacheSet(scopedKey, value);
  }

  function resetLazyModuleState(keepUsers) {
    moduleLoadState.accessRequests = false;
    moduleLoadState.core = false;
    moduleLoadState.transfers = false;
    moduleLoadState.replenishment = false;
    moduleLoadState.stock = false;
    if (!keepUsers) {
      moduleLoadState.users = false;
      moduleLoadState.warehouses = false;
    }
  }

  function setAuthenticatedShellActive(active) {
    var appShell = protectedAppShell || document.querySelector(".app-shell");
    var loginShell = $("loginShell");
    if (appShell && !protectedAppShell) protectedAppShell = appShell;
    if (!protectedAppShellMarker) protectedAppShellMarker = document.createComment("wms-authenticated-shell");
    if (appShell) {
      appShell.inert = !active;
      appShell.setAttribute("aria-hidden", active ? "false" : "true");
      if (!active && appShell.parentNode) {
        appShell.parentNode.insertBefore(protectedAppShellMarker, appShell);
        appShell.parentNode.removeChild(appShell);
      }
      if (active && !appShell.isConnected && protectedAppShellMarker.parentNode) {
        protectedAppShellMarker.parentNode.insertBefore(appShell, protectedAppShellMarker.nextSibling);
      }
    }
    if (loginShell) {
      loginShell.inert = active;
      loginShell.setAttribute("aria-hidden", active ? "true" : "false");
    }
  }

  async function ensureWarehousesLoaded() {
    if (moduleLoadState.warehouses) return true;
    var loaded = await ensureWarehouses();
    moduleLoadState.warehouses = loaded !== false;
    return moduleLoadState.warehouses;
  }

  async function ensureUsersLoaded(options) {
    if (moduleLoadState.users && authState.users.length && (!options || options.repair === false)) return true;
    var loaded = await loadUsers(options);
    moduleLoadState.users = loaded === true;
    return loaded;
  }

  async function ensureAccessRequestsLoaded() {
    if (moduleLoadState.accessRequests) return true;
    if (!isAdminOrSupervisor()) return false;
    var loaded = await loadAccessRequests();
    moduleLoadState.accessRequests = loaded === true;
    return loaded;
  }

  async function ensureCoreDataLoaded() {
    if (moduleLoadState.core) return true;
    await loadData();
    moduleLoadState.core = true;
    return true;
  }

  async function ensureTransferDataLoaded() {
    if (moduleLoadState.transfers) return true;
    if (!canAccessScreen("transferencias")) return false;
    var loaded = await loadTransferData();
    moduleLoadState.transfers = loaded === true;
    return loaded;
  }

  async function ensureReplenishmentDataLoaded() {
    if (moduleLoadState.replenishment) return true;
    if (!canAccessScreen("reposicao")) return false;
    var loaded = await loadReplenishmentData();
    moduleLoadState.replenishment = loaded === true;
    return loaded;
  }

  async function ensureStockDataLoaded() {
    if (moduleLoadState.stock) return true;
    if (!canAccessScreen("baseEstoque")) return false;
    var loaded = await loadStockOperationalData();
    moduleLoadState.stock = loaded === true;
    return loaded;
  }

  async function ensureHealthDataLoaded() {
    await ensureWarehousesLoaded();
    await ensureUsersLoaded({ repair: false });
    await ensureCoreDataLoaded();
    await ensureTransferDataLoaded();
    await ensureReplenishmentDataLoaded();
    await ensureStockDataLoaded();
    return true;
  }

  async function ensureScreenDataLoaded(screenId) {
    if (!authState.currentUser) return false;
    if (["dashboard", "bipagem", "consultaSku", "consultaPrateleira", "etiquetas", "importar", "manutencao", "reposicao", "baseEstoque"].indexOf(screenId) >= 0) {
      await ensureCoreDataLoaded();
    }
    if (screenId === "transferencias") await ensureTransferDataLoaded();
    if (screenId === "dashboard") await ensureReplenishmentDataLoaded();
    if (screenId === "reposicao") await ensureReplenishmentDataLoaded();
    if (screenId === "baseEstoque") await ensureStockDataLoaded();
    if (screenId === "usuarios") {
      await ensureUsersLoaded({ repair: false });
      await ensureAccessRequestsLoaded();
    }
    if (screenId === "estoques") await ensureWarehousesLoaded();
    if (screenId === "saudeSistema") await ensureHealthDataLoaded();
    return true;
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || window.location.protocol === "file:") return;
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function (error) {
        console.warn("Service worker nao registrado:", error);
      });
    });
  }

  function bindConnectivityEvents() {
    window.addEventListener("online", updateConnectivityUi);
    window.addEventListener("offline", updateConnectivityUi);
  }

  function updateConnectivityUi() {
    var banner = $("offlineBanner");
    var offline = "onLine" in navigator && !navigator.onLine;
    if (banner) banner.hidden = !offline;
    if (offline && !localCacheState.warned) {
      localCacheState.warned = true;
      showToast("Voce esta offline. Os dados podem estar desatualizados.", "warning");
    }
    if (!offline) localCacheState.warned = false;
  }

  function canUseNetwork() {
    return !("onLine" in navigator) || navigator.onLine;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function setSyncStatus(label, type) {
    performanceState.syncStatus = label || "Sincronizado";
    performanceState.syncType = type || "success";
    if (type === "success") performanceState.lastSyncAt = nowIso();
    updateHeaderSyncStatus();
  }

  function updateHeaderSyncStatus() {
    var label = $("topSyncLabel");
    var pill = $("topSyncPill");
    if (!label || !pill) return;
    label.textContent = performanceState.syncStatus || "Sincronizado";
    pill.classList.toggle("is-ok", performanceState.syncType === "success");
    pill.classList.toggle("is-syncing", performanceState.syncType === "warning");
    pill.classList.toggle("is-error", performanceState.syncType === "error");
  }

  function recordPerformanceMetric(key, startedAt) {
    performanceState[key] = Math.max(0, Math.round(performance.now() - startedAt));
  }

  function recordPerformanceError(label, error) {
    var message = formatSupabaseError(error);
    var key = label + ":" + message;
    var nowTime = Date.now();
    if (performanceState.errorThrottle[key] && nowTime - performanceState.errorThrottle[key] < 60000) return;
    performanceState.errorThrottle[key] = nowTime;
    if (label === "reposicao-create") {
      performanceState.lastReplenishmentCreateError = message;
      performanceState.lastReplenishmentCreateErrorAt = nowIso();
    }
    performanceState.recentErrors.unshift({
      label: label,
      message: message,
      at: nowIso()
    });
    performanceState.recentErrors = performanceState.recentErrors.slice(0, 8);
  }

  async function estimateLocalCacheBytes() {
    var bytes = 0;
    try {
      if (localCacheState.available || localCacheState.db) {
        bytes += await runCacheOperation("cache-estimate", 0, function (db) {
          return new Promise(function (resolve, reject) {
            var total = 0;
            try {
              var tx = db.transaction(LOCAL_CACHE_STORE, "readonly");
              var request = tx.objectStore(LOCAL_CACHE_STORE).openCursor();
              request.onsuccess = function () {
                var cursor = request.result;
                if (!cursor) return resolve(total);
                try { total += JSON.stringify(cursor.value || {}).length * 2; } catch (error) { total += 0; }
                cursor.continue();
              };
              request.onerror = function () { reject(request.error); };
            } catch (error) {
              reject(error);
            }
          });
        });
      }
      Object.keys(localStorage).forEach(function (key) {
        if (key.indexOf("wms_") === 0) bytes += (key.length + String(localStorage.getItem(key) || "").length) * 2;
      });
    } catch (error) {
      recordPerformanceError("cache", error);
    }
    return bytes;
  }

  function formatBytes(bytes) {
    var value = Number(bytes || 0);
    if (value < 1024) return value + " B";
    if (value < 1024 * 1024) return (value / 1024).toFixed(1).replace(".", ",") + " KB";
    return (value / (1024 * 1024)).toFixed(1).replace(".", ",") + " MB";
  }

  function normalizeWarehouseCode(value) {
    var code = normalizeText(value).toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    return code || DEFAULT_WAREHOUSE_CODE;
  }

  function normalizeWarehouseCodeOrBlank(value) {
    var raw = normalizeText(value);
    if (!raw) return "";
    return normalizeWarehouseCode(raw);
  }

  function normalizeTransferStatus(value) {
    var status = normalizeText(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    var aliases = {
      EM_SEPARAAO: "EM_SEPARACAO",
      SEPARAAO_CONCLUIDA: "SEPARACAO_CONCLUIDA",
      EM_MONTAGEM: "EM_MONTAGEM_CAIXA",
      EM_CAIXA: "EM_MONTAGEM_CAIXA",
      EM_LACRE: "EM_MONTAGEM_CAIXA",
      LACRE_CONCLUIDO: "MONTAGEM_CAIXA_CONCLUIDA",
      CONCLUIDA_COM_DIVERGENCIA: "PRONTA_PARA_NOTA_COM_DIVERGENCIA",
      CONCLUIDA_SEM_DIVERGENCIA: "PRONTA_PARA_NOTA",
      FINALIZADA_PARA_ANALISE: "PRONTA_PARA_NOTA_COM_DIVERGENCIA",
      UNIFICADO: "UNIFICADA"
    };
    status = aliases[status] || status;
    return TRANSFER_STATUSES.indexOf(status) >= 0 ? status : "PENDENTE";
  }

  function transferCurrentStepForStatus(status) {
    status = normalizeTransferStatus(status);
    if (["EM_MONTAGEM_CAIXA", "SEPARACAO_CONCLUIDA", "MONTAGEM_CAIXA_CONCLUIDA"].indexOf(status) >= 0) return "MONTAGEM_CAIXA";
    if (["PRONTA_PARA_NOTA", "PRONTA_PARA_NOTA_COM_DIVERGENCIA", "FINALIZADA"].indexOf(status) >= 0) return "FINALIZACAO";
    if (["EM_CORRECAO", "CORRECAO_SOLICITADA", "CORRECAO_CONCLUIDA"].indexOf(status) >= 0) return "CORRECAO";
    if (status === "UNIFICADA" || status === "ARQUIVADA_POR_UNIFICACAO") return "UNIFICACAO";
    if (status === "CANCELADA") return "CANCELADA";
    return "SEPARACAO";
  }

  function activeWarehouseCodes() {
    var source = warehouseState.warehouses && warehouseState.warehouses.length ? warehouseState.warehouses : WAREHOUSE_SEED;
    return unique(source.filter(function (warehouse) { return warehouse.active !== false; }).map(function (warehouse) {
      return normalizeWarehouseCode(warehouse.code);
    }));
  }

  function warehouseExistsAndActive(code) {
    code = normalizeWarehouseCode(code);
    var codes = activeWarehouseCodes();
    return codes.indexOf(code) >= 0 || !warehouseState.tableAvailable;
  }

  function fromDbWarehouse(row) {
    var code = normalizeWarehouseCode(row && row.code);
    return {
      id: (row && row.id) || warehouseIdForCode(code),
      code: code,
      name: (row && row.name) || ("Estoque " + code),
      active: !row || row.active !== false,
      notes: (row && row.notes) || "",
      createdAt: row && row.created_at ? row.created_at : new Date().toISOString(),
      updatedAt: row && row.updated_at ? row.updated_at : new Date().toISOString()
    };
  }

  function warehouseIdForCode(code) {
    code = normalizeWarehouseCode(code);
    var found = (warehouseState.warehouses || WAREHOUSE_SEED).find(function (warehouse) {
      return normalizeWarehouseCode(warehouse.code) === code;
    });
    return found ? found.id : "warehouse-" + code.toLowerCase();
  }

  function warehouseCodeForId(id) {
    var rawId = normalizeText(id);
    if (!rawId) return "";
    var found = (warehouseState.warehouses || WAREHOUSE_SEED).find(function (warehouse) {
      return normalizeText(warehouse.id).toLowerCase() === rawId.toLowerCase();
    });
    if (found) return normalizeWarehouseCode(found.code);
    var suffix = rawId.toLowerCase().match(/^warehouse-([a-z0-9_-]+)$/);
    return suffix ? normalizeWarehouseCode(suffix[1]) : "";
  }

  function warehouseNameForCode(code) {
    code = normalizeWarehouseCode(code);
    var found = (warehouseState.warehouses || WAREHOUSE_SEED).find(function (warehouse) {
      return normalizeWarehouseCode(warehouse.code) === code;
    });
    return found ? found.name : ("Estoque " + code);
  }

  function activeWarehouseCode() {
    return normalizeWarehouseCode(warehouseState.activeCode);
  }

  function activeWarehouseId() {
    return warehouseState.activeId || warehouseIdForCode(activeWarehouseCode());
  }

  function parseWarehouseCodes(value) {
    if (Array.isArray(value)) {
      return unique(value.map(normalizeWarehouseCode)).filter(Boolean);
    }
    var raw = normalizeText(value);
    if (!raw) return [];
    try {
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return unique(parsed.map(normalizeWarehouseCode)).filter(Boolean);
    } catch (error) {
      // Texto separado por virgula e o formato gravado atualmente.
    }
    return unique(raw.split(/[,\s;|]+/).map(normalizeWarehouseCode)).filter(Boolean);
  }

  function allowedWarehouseCodesForUser(user) {
    var activeCodes = activeWarehouseCodes();
    if (!user) return [DEFAULT_WAREHOUSE_CODE];
    if (user.isGlobalAdmin || user.role === "ADMINISTRADOR") return activeCodes.length ? activeCodes : WAREHOUSE_SEED.map(function (warehouse) { return warehouse.code; });
    var allowed = parseWarehouseCodes(user.allowedWarehouseCodes);
    var defaultCode = normalizeWarehouseCodeOrBlank(user.defaultWarehouseCode || user.warehouseCode);
    var repaired = removeAccidentalDefaultWarehouse(defaultCode, allowed, false);
    defaultCode = repaired.defaultCode;
    allowed = repaired.allowed;
    if (!allowed.length && defaultCode) allowed = [defaultCode];
    if (!allowed.length) allowed = [DEFAULT_WAREHOUSE_CODE];
    return allowed.filter(function (code) {
      return activeCodes.indexOf(code) >= 0 || !warehouseState.tableAvailable;
    });
  }

  function removeAccidentalDefaultWarehouse(defaultCode, allowed, isGlobal) {
    allowed = unique((allowed || []).map(normalizeWarehouseCode));
    if (isGlobal || defaultCode !== DEFAULT_WAREHOUSE_CODE || allowed.indexOf(DEFAULT_WAREHOUSE_CODE) < 0 || allowed.length < 2) {
      return { defaultCode: defaultCode, allowed: allowed };
    }
    var nonDefault = allowed.filter(function (code) { return code !== DEFAULT_WAREHOUSE_CODE; });
    if (allowed[0] !== DEFAULT_WAREHOUSE_CODE || nonDefault.length === 1) {
      return { defaultCode: nonDefault[0] || "", allowed: nonDefault };
    }
    return { defaultCode: defaultCode, allowed: allowed };
  }

  function userCanAccessWarehouse(user, code) {
    code = normalizeWarehouseCode(code);
    return allowedWarehouseCodesForUser(user).indexOf(code) >= 0;
  }

  function setActiveWarehouse(code) {
    code = normalizeWarehouseCode(code);
    warehouseState.activeCode = code;
    warehouseState.activeId = warehouseIdForCode(code);
    if (authState.currentSession) {
      authState.currentSession.activeWarehouseCode = code;
      authState.currentSession.activeWarehouseId = warehouseState.activeId;
    }
    if (replenishmentState) {
      replenishmentState.suggestions = [];
      replenishmentState.suggestionOffset = 0;
      replenishmentState.suggestionsLoaded = false;
      replenishmentState.suggestionsHasMore = false;
      replenishmentState.activeSuggestion = null;
    }
    skuSearchState = { currentSku: "", locations: [], stockSuggestion: null, stockError: "" };
    if ($("skuOperationalHub")) renderSkuOperationalHub("", [], null, "");
    renderActiveWarehouseUi();
  }

  function rowWarehouseCode(row) {
    var rawCode = rawWarehouseCodeValue(row);
    return rawCode ? normalizeWarehouseCode(rawCode) : DEFAULT_WAREHOUSE_CODE;
  }

  function rawWarehouseCodeValue(row) {
    var explicitCode = normalizeText(row && (row.warehouse_code || row.warehouseCode || row.active_warehouse_code));
    if (explicitCode) return explicitCode;
    return warehouseCodeForId(row && (row.warehouse_id || row.warehouseId || row.active_warehouse_id || row.activeWarehouseId));
  }

  function rowMatchesActiveWarehouse(row) {
    return rowWarehouseCode(row) === activeWarehouseCode();
  }

  function processRowMatchesActiveWarehouse(row) {
    if (!row) return false;
    var rawCode = rawWarehouseCodeValue(row);
    if (rawCode) return normalizeWarehouseCode(rawCode) === activeWarehouseCode();
    return !isMultiWarehouseMode();
  }

  function bindingMatchesActiveWarehouse(binding) {
    if (!binding) return false;
    var rawCode = rawWarehouseCodeValue(binding);
    if (rawCode) return normalizeWarehouseCode(rawCode) === activeWarehouseCode();
    return !isMultiWarehouseMode();
  }

  function activeWarehouseBindings() {
    return (state.bindings || []).filter(bindingMatchesActiveWarehouse);
  }

  function bindingsForWarehouse(warehouseCode) {
    var wanted = normalizeWarehouseCode(warehouseCode || activeWarehouseCode());
    return (state.bindings || []).filter(function (binding) {
      var rawCode = rawWarehouseCodeValue(binding);
      if (rawCode) return normalizeWarehouseCode(rawCode) === wanted;
      return wanted === activeWarehouseCode() && !isMultiWarehouseMode();
    });
  }

  function ensureActiveWarehouse() {
    if (activeWarehouseCode()) {
      if (authState.currentUser && !authState.currentUser.warehouseAccessConfirmed && !isGlobalAdminUser(authState.currentUser)) {
        showToast("Usuario sem estoque confirmado no Supabase. Atualize o schema e salve o usuario novamente.", "error");
        return false;
      }
      if (authState.currentUser && !userCanAccessWarehouse(authState.currentUser, activeWarehouseCode())) {
        var allowed = allowedWarehouseCodesForUser(authState.currentUser);
        if (allowed.length) setActiveWarehouse(allowed[0]);
        showToast("Seu usuario nao possui acesso ao estoque selecionado. O estoque ativo foi ajustado.", "error");
        return false;
      }
      return true;
    }
    showToast("Selecione um estoque antes de continuar.", "error");
    return false;
  }

  function isMultiWarehouseMode() {
    return activeWarehouseCodes().length > 1;
  }

  function multiWarehouseSchemaMessage(tableName) {
    var codes = activeWarehouseCodes();
    var label = codes.length ? codes.join(", ") : "os estoques ativos";
    return "Estrutura multiestoque desatualizada no Supabase. A tabela " + tableName + " precisa da coluna warehouse_code para separar " + label + ". Aplique as migrations em supabase/migrations e recarregue o app.";
  }

  function assertWarehouseFallbackAllowed(tableName, error) {
    if (isMissingWarehouseColumnError(error) && isMultiWarehouseMode()) {
      throw new Error(multiWarehouseSchemaMessage(tableName));
    }
  }

  async function ensureWarehouseSeparatedTable(tableName, statusId) {
    if (!isSupabaseReady() || !isMultiWarehouseMode()) return true;
    var response = await supabaseDb.from(tableName).select("warehouse_code").limit(1);
    if (!response.error) return true;
    if (isMissingWarehouseColumnError(response.error)) {
      var message = multiWarehouseSchemaMessage(tableName);
      if (statusId) setStatus(statusId, message, "error");
      updateSupabaseStatus(message, "error");
      showToast("Schema multiestoque ausente. Importacao bloqueada para nao misturar estoques.", "error");
      return false;
    }
    var detail = formatSupabaseError(response.error);
    console.warn("Validacao preventiva de estoque ignorada; a gravacao real fara a verificacao final:", response.error);
    updateSupabaseStatus("Validacao preventiva do estoque nao retornou detalhe do Supabase. Prosseguindo com a importacao para obter a resposta real." + (detail ? " Detalhe: " + detail : ""), "warning");
    return true;
  }

  async function loadSupabaseConfig() {
    supabaseConfigDiagnostics = null;
    var viteConfig = readSupabaseConfigFromViteEnv();
    if (isUsableSupabaseConfig(viteConfig)) {
      supabaseConfig = viteConfig;
      localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify(supabaseConfig));
      return;
    }

    try {
      var remoteConfig = await fetchSupabaseConfigFromApi("/api/supabase-config");
      var apiConfig = sanitizeSupabaseConfig({
        url: remoteConfig && remoteConfig.url,
        key: remoteConfig && (remoteConfig.key || remoteConfig.anonKey)
      });
      if (isUsableSupabaseConfig(apiConfig)) {
        supabaseConfig = apiConfig;
        localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify(supabaseConfig));
        return;
      }
    } catch (error) {
      supabaseConfigDiagnostics = {
        endpoint: "/api/supabase-config",
        error: formatSupabaseError(error),
        note: "Falha ao buscar a rota de configuracao da Vercel."
      };
    }
    try {
      var raw = localStorage.getItem(SUPABASE_CONFIG_KEY);
      var savedConfig = raw ? sanitizeSupabaseConfig(JSON.parse(raw)) : { url: "", key: "" };
      supabaseConfig = isUsableSupabaseConfig(savedConfig) ? savedConfig : { url: "", key: "" };
    } catch (error) {
      supabaseConfig = { url: "", key: "" };
    }
  }

  function readSupabaseConfigFromViteEnv() {
    var env = import.meta.env || {};
    var urlMatch = firstEnvValue(env, ["VITE_SUPABASE_URL", "vite_SUPABASE_URL", "SUPABASE_URL"]);
    var keyMatch = firstEnvValue(env, ["VITE_SUPABASE_ANON_KEY", "VITE_SUPABASE_ANOM_KEY", "SUPABASE_ANON_KEY", "SUPABASE_KEY"]);
    var config = sanitizeSupabaseConfig({ url: urlMatch.value, key: keyMatch.value });

    supabaseConfigDiagnostics = Object.assign({}, supabaseConfigDiagnostics || {}, {
      source: "vite-build",
      viteMode: env.MODE || "",
      viteHasUrl: Boolean(urlMatch.value),
      viteHasKey: Boolean(keyMatch.value),
      viteUrlSource: urlMatch.name,
      viteKeySource: keyMatch.name,
      viteUrlValid: isValidSupabaseUrl(config.url),
      viteKeyValid: isLikelySupabaseAnonKey(config.key),
      viteUrlPreview: previewPublicValue(config.url || urlMatch.value),
      viteKeyPreview: previewSecret(config.key || keyMatch.value),
      checkedViteVariables: ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "vite_SUPABASE_URL", "VITE_SUPABASE_ANOM_KEY"]
    });

    return config;
  }

  async function fetchSupabaseConfigFromApi(endpoint) {
    var response = await fetch(endpoint, { cache: "no-store" });
    var body = null;
    try {
      body = await response.json();
    } catch (error) {
      body = null;
    }

    var apiDiagnostics = body && body.diagnostics ? body.diagnostics : {};
    supabaseConfigDiagnostics = Object.assign({}, supabaseConfigDiagnostics || {}, {
      apiEndpoint: endpoint,
      apiStatus: response.status,
      apiStatusText: response.statusText,
      apiHasUrl: Boolean(body && body.url),
      apiHasKey: Boolean(body && (body.key || body.anonKey)),
      apiUrlValid: apiDiagnostics.hasValidUrl,
      apiKeyValid: apiDiagnostics.hasValidKey,
      apiUrlSource: apiDiagnostics.urlSource || "",
      apiKeySource: apiDiagnostics.keySource || "",
      apiUrlPreview: apiDiagnostics.urlPreview || "",
      apiKeyPreview: apiDiagnostics.keyPreview || "",
      apiNote: apiDiagnostics.note || ""
    });

    if (!response.ok) return null;
    return body;
  }

  function firstEnvValue(env, names) {
    for (var i = 0; i < names.length; i += 1) {
      if (env[names[i]]) return { name: names[i], value: env[names[i]] };
    }
    return { name: "", value: "" };
  }

  function sanitizeSupabaseConfig(config) {
    return {
      url: normalizeSupabaseProjectUrl(config && config.url),
      key: normalizeText(config && config.key)
    };
  }

  function normalizeSupabaseProjectUrl(value) {
    var raw = normalizeText(value);
    if (!raw) return "";
    try {
      var parsed = new URL(raw);
      if (parsed.pathname.replace(/\/+$/, "") === "/rest/v1") return parsed.origin;
      return parsed.origin;
    } catch (error) {
      return raw.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
    }
  }

  function isUsableSupabaseConfig(config) {
    return isValidSupabaseUrl(config && config.url) && isLikelySupabaseAnonKey(config && config.key);
  }

  function isValidSupabaseUrl(value) {
    try {
      var parsed = new URL(normalizeText(value));
      return parsed.protocol === "https:" && /\.supabase\.co$/i.test(parsed.hostname);
    } catch (error) {
      return false;
    }
  }

  function isLikelySupabaseAnonKey(value) {
    var key = normalizeText(value);
    return /^eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(key) || /^sb_publishable_[a-zA-Z0-9_-]{20,}$/.test(key);
  }

  function previewPublicValue(value) {
    if (!value) return "";
    return String(value).replace(/\/+$/, "");
  }

  function previewSecret(value) {
    if (!value) return "";
    value = String(value);
    if (value.length <= 12) return "***";
    return value.slice(0, 8) + "..." + value.slice(-6);
  }

  function fillSupabaseForm() {
    if ($("supabaseUrlInput")) $("supabaseUrlInput").value = supabaseConfig.url || "";
    if ($("supabaseKeyInput")) $("supabaseKeyInput").value = supabaseConfig.key || "";
  }

  function fillTaskSoundSetting() {
    var enabled = localStorage.getItem(TASK_SOUND_KEY) !== "false";
    ["taskSoundInput", "sidebarTaskSoundInput"].forEach(function (id) {
      if ($(id)) $(id).checked = enabled;
    });
    if ($("replenishmentSoundInput")) $("replenishmentSoundInput").checked = localStorage.getItem(REPLENISHMENT_SOUND_KEY) !== "false";
    if ($("replenishmentSoundVolumeInput")) $("replenishmentSoundVolumeInput").value = localStorage.getItem(REPLENISHMENT_SOUND_VOLUME_KEY) || "high";
    if ($("replenishmentSoundRepeatInput")) $("replenishmentSoundRepeatInput").value = localStorage.getItem(REPLENISHMENT_SOUND_REPEAT_KEY) || "repeat_30";
  }

  function isTaskSoundEnabled() {
    return localStorage.getItem(TASK_SOUND_KEY) !== "false";
  }

  function saveTaskSoundSetting() {
    var source = document.activeElement && document.activeElement.type === "checkbox" ? document.activeElement : $("taskSoundInput");
    var enabled = !source || source.checked;
    localStorage.setItem(TASK_SOUND_KEY, enabled ? "true" : "false");
    fillTaskSoundSetting();
  }

  function isReplenishmentSoundEnabled() {
    return localStorage.getItem(REPLENISHMENT_SOUND_KEY) !== "false";
  }

  function saveReplenishmentSoundSetting() {
    if ($("replenishmentSoundInput")) localStorage.setItem(REPLENISHMENT_SOUND_KEY, $("replenishmentSoundInput").checked ? "true" : "false");
    if ($("replenishmentSoundVolumeInput")) localStorage.setItem(REPLENISHMENT_SOUND_VOLUME_KEY, $("replenishmentSoundVolumeInput").value || "high");
    if ($("replenishmentSoundRepeatInput")) localStorage.setItem(REPLENISHMENT_SOUND_REPEAT_KEY, $("replenishmentSoundRepeatInput").value || "repeat_30");
    fillTaskSoundSetting();
  }

  function bindTaskAudioUnlock() {
    var unlock = function () {
      taskAlertState.audioUnlocked = true;
      if (taskAlertState.pendingSound) {
        taskAlertState.pendingSound = false;
        playTaskSound();
      }
      if (taskAlertState.pendingReplenishmentSound) {
        taskAlertState.pendingReplenishmentSound = false;
        playReplenishmentSound();
      }
    };
    document.addEventListener("click", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
  }

  function initSupabaseClient() {
    if (!isUsableSupabaseConfig(supabaseConfig)) {
      supabaseConfigDiagnostics = Object.assign({}, supabaseConfigDiagnostics || {}, {
        hasUrl: Boolean(supabaseConfig.url),
        hasKey: Boolean(supabaseConfig.key),
        hasValidUrl: isValidSupabaseUrl(supabaseConfig.url),
        hasValidKey: isLikelySupabaseAnonKey(supabaseConfig.key)
      });
      supabaseDb = null;
      return false;
    }
    supabaseDb = createWmsSupabaseClient(supabaseConfig.url, supabaseConfig.key);
    productsTableAvailable = true;
    historySchemaAvailable = true;
    return true;
  }

  function isSupabaseReady() {
    return !!supabaseDb;
  }

  async function fetchAllRows(tableName, orderColumn, ascending) {
    var allRows = [];
    var from = 0;
    var pageSize = 500;
    while (true) {
      var response = await runSupabaseRequestWithRetry("fetch-all-" + tableName, function () {
        var query = supabaseDb.from(tableName).select("*");
        if (orderColumn) query = query.order(orderColumn, { ascending: ascending !== false });
        return query.range(from, from + pageSize - 1);
      });
      if (response.error) throw response.error;
      var rows = response.data || [];
      allRows = allRows.concat(rows);
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    return allRows;
  }

  async function fetchWarehouseRowsWithFilter(tableName, orderColumn, ascending, includeWarehouseId) {
    var allRows = [];
    var from = 0;
    var pageSize = 500;
    var code = activeWarehouseCode();
    var id = activeWarehouseId();
    var warehouseFilter = "warehouse_code.eq." + code;
    if (includeWarehouseId && id) warehouseFilter += ",warehouse_id.eq." + id;
    while (true) {
      var response = await runSupabaseRequestWithRetry("fetch-warehouse-" + tableName, function () {
        var query = supabaseDb
          .from(tableName)
          .select("*")
          .or(warehouseFilter);
        if (orderColumn) query = query.order(orderColumn, { ascending: ascending !== false });
        return query.range(from, from + pageSize - 1);
      });
      if (response.error) throw response.error;
      var rows = response.data || [];
      allRows = allRows.concat(rows);
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    return allRows;
  }

  async function fetchWarehouseRows(tableName, orderColumn, ascending) {
    try {
      return await fetchWarehouseRowsWithFilter(tableName, orderColumn, ascending, true);
    } catch (error) {
      if (isMissingWarehouseColumnError(error) && formatSupabaseError(error).toLowerCase().indexOf("warehouse_id") >= 0) {
        try {
          return await fetchWarehouseRowsWithFilter(tableName, orderColumn, ascending, false);
        } catch (retryError) {
          error = retryError;
        }
      }
      if (!isMissingWarehouseColumnError(error)) throw error;
      if (isOptionalRealtimeTable(tableName)) {
        recordPerformanceError("warehouse-optional-" + tableName, error);
        return [];
      }
      assertWarehouseFallbackAllowed(tableName, error);
      return (await fetchAllRows(tableName, orderColumn, ascending)).filter(processRowMatchesActiveWarehouse);
    }
  }

  function transferSummarySelectColumns() {
    return [
      "id",
      "codigo_transferencia",
      "nome_transferencia",
      "estabelecimento_id",
      "estabelecimento_codigo",
      "estabelecimento_nome",
      "estabelecimento_cnpj",
      "import_source",
      "import_batch_id",
      "import_file_name",
      "imported_by_id",
      "imported_by_name",
      "origem_id",
      "origem_nome",
      "origem_cnpj",
      "origem_codigo_loja",
      "origem_codigo_interno",
      "origem_canal",
      "destino_id",
      "destino_nome",
      "destino_cnpj",
      "destino_codigo_loja",
      "destino_codigo_interno",
      "destino_canal",
      "responsavel_id",
      "responsavel_nome",
      "status",
      "observacao",
      "tipo_fluxo",
      "flow_type",
      "tipo_transferencia",
      "criado_por_id",
      "criado_por_nome",
      "iniciado_em",
      "started_at",
      "finalizado_em",
      "finished_at",
      "duracao_segundos",
      "separacao_iniciada_em",
      "separacao_concluida_em",
      "duracao_separacao_segundos",
      "lacre_iniciado_em",
      "lacre_concluido_em",
      "duracao_lacre_segundos",
      "separation_started_at",
      "separation_finished_at",
      "separation_duration_seconds",
      "packing_started_at",
      "packing_finished_at",
      "packing_duration_seconds",
      "total_started_at",
      "total_finished_at",
      "total_duration_seconds",
      "total_items",
      "total_skus",
      "total_expected_quantity",
      "total_separated_quantity",
      "total_packed_quantity",
      "total_previsto",
      "total_enviado",
      "diferenca_total",
      "total_caixas",
      "final_box_count",
      "total_boxes",
      "current_step",
      "last_action_at",
      "last_action_label",
      "itens_pendentes",
      "itens_separados",
      "itens_divergentes",
      "has_divergence",
      "divergence_count",
      "final_result",
      "is_merged",
      "merged_from_ids",
      "merged_into_id",
      "unified_into_transfer_id",
      "merge_status",
      "merged_by_id",
      "merged_by_name",
      "merged_at",
      "archived_by_unification",
      "is_deleted",
      "deleted_at",
      "deleted_by_id",
      "deleted_by_name",
      "idempotency_key",
      "request_id",
      "warehouse_id",
      "warehouse_code",
      "created_at",
      "updated_at"
    ].join(",");
  }

  function transferItemDetailSelectColumns() {
    return [
      "id",
      "created_at",
      "updated_at",
      "transfer_id",
      "sku",
      "codigo_material",
      "descricao",
      "nome_material_snapshot",
      "quantidade_solicitada",
      "unidade_medida",
      "tipo_movimentacao",
      "loja_origem",
      "loja_destino",
      "razao_social_origem",
      "razao_social_destino",
      "agrupamento_razao_social",
      "endereco_rua",
      "endereco_rack",
      "endereco_linha",
      "endereco_letra",
      "endereco_codigo",
      "has_location",
      "location_warning",
      "saldo_loja_disponivel",
      "saldo_captacao_disponivel",
      "saldo_loja_snapshot",
      "saldo_captacao_snapshot",
      "origem_sugerida",
      "quantidade_sugerida_captacao",
      "quantidade_sugerida_loja",
      "quantidade_retirar_captacao",
      "quantidade_retirar_loja",
      "quantidade_faltante",
      "alerta_saldo",
      "alerta_saldo_mensagem",
      "localizacao_sugerida",
      "localizacao_captacao_snapshot",
      "localizacao_wms_snapshot",
      "stock_snapshot_at",
      "tipo_quantidade",
      "tipo_envio",
      "quantidade_caixas",
      "unidades_por_caixa",
      "quantidade_total_unidades",
      "quantidade_lacrada_unidades",
      "embalagem_observacao",
      "quantidade_separada",
      "quantidade_lacrada",
      "quantidade_enviada",
      "quantidade_extra",
      "quantidade_excedente",
      "total_unidades_caixa",
      "diferenca",
      "motivo_pendencia",
      "observacao_pendencia",
      "has_divergence",
      "is_extra",
      "divergence_type",
      "added_by_id",
      "added_by_name",
      "input_type",
      "observation",
      "status_operacional",
      "status_divergencia",
      "status",
      "idempotency_key",
      "request_id",
      "warehouse_id",
      "warehouse_code"
    ].join(",");
  }

  function establishmentSelectColumns() {
    return "id,codigo,codigo_loja,codigo_interno,canal,nome,cnpj,ativo,created_at,updated_at";
  }

  async function fetchTransferSummaryRows(limit) {
    var startedAt = performance.now();
    var response = await selectRowsWithMissingColumnFallback("wms_transfers", transferSummarySelectColumns(), function (query) {
      return query.eq("warehouse_code", activeWarehouseCode()).order("updated_at", { ascending: false }).limit(limit || 200);
    });
    if (response.error && isMissingWarehouseColumnError(response.error)) {
      assertWarehouseFallbackAllowed("wms_transfers", response.error);
      response = await selectRowsWithMissingColumnFallback("wms_transfers", transferSummarySelectColumns(), function (query) {
        return query.order("updated_at", { ascending: false }).limit(limit || 200);
      });
    }
    if (response.error) throw response.error;
    recordPerformanceMetric("lastTransferListMs", startedAt);
    performanceState.lastTransferQueryCount += 1;
    return response.data || [];
  }

  async function fetchTransferItemsForTransfer(transferId, warehouseCode) {
    var startedAt = performance.now();
    var warehouse = normalizeWarehouseCode(warehouseCode || activeWarehouseCode());
    var response = await selectRowsWithMissingColumnFallback("wms_transfer_items", transferItemDetailSelectColumns(), function (query) {
      return query.eq("transfer_id", transferId).eq("warehouse_code", warehouse).order("created_at", { ascending: true }).limit(2000);
    });
    if (response.error && isMissingWarehouseColumnError(response.error)) {
      assertWarehouseFallbackAllowed("wms_transfer_items", response.error);
      response = await selectRowsWithMissingColumnFallback("wms_transfer_items", transferItemDetailSelectColumns(), function (query) {
        return query.eq("transfer_id", transferId).order("created_at", { ascending: true }).limit(2000);
      });
    }
    if (response.error) throw response.error;
    var rows = response.data || [];
    if (!rows.length && isMultiWarehouseMode()) {
      var fallbackResponse = await selectRowsWithMissingColumnFallback("wms_transfer_items", transferItemDetailSelectColumns(), function (query) {
        return query.eq("transfer_id", transferId).order("created_at", { ascending: true }).limit(2000);
      });
      if (fallbackResponse.error) throw fallbackResponse.error;
      rows = (fallbackResponse.data || []).filter(function (row) {
        var explicitWarehouse = rawWarehouseCodeValue(row);
        return !explicitWarehouse || normalizeWarehouseCode(explicitWarehouse) === warehouse;
      }).map(function (row) {
        if (!rawWarehouseCodeValue(row)) row.warehouse_code = warehouse;
        return row;
      });
    }
    recordPerformanceMetric("lastTransferItemsMs", startedAt);
    performanceState.lastTransferQueryCount += 1;
    return rows;
  }

  function stripTransferItemSelectColumns() {
    return [
      "id",
      "created_at",
      "updated_at",
      "transfer_id",
      "sku",
      "codigo_material",
      "descricao",
      "nome_material_snapshot",
      "quantidade_solicitada",
      "unidade_medida",
      "tipo_quantidade",
      "tipo_envio",
      "quantidade_caixas",
      "unidades_por_caixa",
      "quantidade_total_unidades",
      "quantidade_separada",
      "quantidade_lacrada",
      "quantidade_lacrada_unidades",
      "quantidade_extra",
      "quantidade_faltante",
      "quantidade_excedente",
      "status",
      "warehouse_id",
      "warehouse_code"
    ].join(",");
  }

  function selectColumnsToArray(columns) {
    return String(columns || "*").split(",").map(function (column) { return column.trim(); }).filter(Boolean);
  }

  function normalizedSelectColumnName(expression) {
    var value = String(expression || "").trim();
    var colonIndex = value.indexOf(":");
    if (colonIndex >= 0) value = value.slice(colonIndex + 1);
    var parenthesisIndex = value.indexOf("(");
    if (parenthesisIndex >= 0) value = value.slice(0, parenthesisIndex);
    return value.trim().toLowerCase();
  }

  async function selectRowsWithMissingColumnFallback(tableName, selectColumns, configureQuery) {
    var columns = selectColumnsToArray(selectColumns);
    var removedColumns = {};
    while (true) {
      var response = await runSupabaseRequestWithRetry("select-" + tableName, function () {
        var query = supabaseDb.from(tableName).select(columns.join(","));
        return configureQuery(query);
      });
      if (!response.error || !isMissingColumnError(response.error)) return response;
      var missingColumn = getMissingColumnName(response.error).toLowerCase();
      var nextColumns = columns.filter(function (column) { return normalizedSelectColumnName(column) !== missingColumn; });
      if (!missingColumn || removedColumns[missingColumn] || nextColumns.length === columns.length || !nextColumns.length) return response;
      removedColumns[missingColumn] = true;
      columns = nextColumns;
    }
  }

  async function fetchWarehouseUpdatedRows(tableName, timeColumn, sinceIso, orderColumn) {
    if (isOptionalRealtimeTableDisabled(tableName)) return [];
    var selectColumns = tableName === "wms_transfers" ? transferSummarySelectColumns() : tableName === "wms_transfer_items" ? transferItemDetailSelectColumns() : "*";
    try {
      var response = await selectRowsWithMissingColumnFallback(tableName, selectColumns, function (query) {
        query = query.eq("warehouse_code", activeWarehouseCode());
        if (sinceIso) query = query.gt(timeColumn, sinceIso);
        return query.order(orderColumn || timeColumn, { ascending: true }).limit(500);
      });
      if (response.error) throw response.error;
      return response.data || [];
    } catch (error) {
      if (isMissingWarehouseColumnError(error)) {
        if (isOptionalRealtimeTable(tableName)) {
          disableOptionalRealtimeTable(tableName, error, "live-optional-" + tableName);
          return [];
        }
        assertWarehouseFallbackAllowed(tableName, error);
        var fallbackResponse = await selectRowsWithMissingColumnFallback(tableName, selectColumns, function (query) {
          if (sinceIso) query = query.gt(timeColumn, sinceIso);
          return query.order(orderColumn || timeColumn, { ascending: true }).limit(500);
        });
        if (fallbackResponse.error) throw fallbackResponse.error;
        return (fallbackResponse.data || []).filter(processRowMatchesActiveWarehouse);
      }
      if (isOptionalRealtimeTable(tableName) && (isMissingTransferTableError(error) || isMissingColumnError(error))) {
        disableOptionalRealtimeTable(tableName, error, "live-optional-" + tableName);
        return [];
      }
      throw error;
    }
  }

  function isOptionalRealtimeTable(tableName) {
    return [
      "wms_transfer_divergences",
      "wms_task_notifications",
      "wms_notifications",
      "wms_replenishment_requests"
    ].indexOf(tableName) >= 0;
  }

  function isOptionalRealtimeTableDisabled(tableName) {
    return Boolean(realtimeState.disabledOptionalTables && realtimeState.disabledOptionalTables[tableName]);
  }

  function disableOptionalRealtimeTable(tableName, error, label) {
    if (!tableName) return;
    if (!realtimeState.disabledOptionalTables) realtimeState.disabledOptionalTables = {};
    if (realtimeState.disabledOptionalTables[tableName]) return;
    var reason = formatSupabaseError(error);
    realtimeState.disabledOptionalTables[tableName] = {
      table: tableName,
      reason: reason,
      disabledAt: nowIso()
    };
    realtimeState.lastOptionalFailure = realtimeState.disabledOptionalTables[tableName];
    recordPerformanceError(label || "live-optional-" + tableName, error);
  }

  async function fetchActiveWarehouseTransferIds() {
    try {
      var response = await supabaseDb
        .from("wms_transfers")
        .select("id,is_deleted,deleted_at")
        .eq("warehouse_code", activeWarehouseCode());
      if (response.error) throw response.error;
      var ids = {};
      (response.data || []).forEach(function (row) {
        if (row && row.id && row.is_deleted !== true && !row.deleted_at) ids[row.id] = true;
      });
      return ids;
    } catch (error) {
      if (isMissingWarehouseColumnError(error)) {
        assertWarehouseFallbackAllowed("wms_transfers", error);
        var legacy = await supabaseDb.from("wms_transfers").select("id");
        if (legacy.error) throw legacy.error;
        var legacyIds = {};
        (legacy.data || []).forEach(function (row) { if (row && row.id) legacyIds[row.id] = true; });
        return legacyIds;
      }
      if (isMissingColumnError(error)) {
        var fallback = await supabaseDb
          .from("wms_transfers")
          .select("id")
          .eq("warehouse_code", activeWarehouseCode());
        if (fallback.error) throw fallback.error;
        var fallbackIds = {};
        (fallback.data || []).forEach(function (row) { if (row && row.id) fallbackIds[row.id] = true; });
        return fallbackIds;
      }
      throw error;
    }
  }

  async function ensureWarehouses() {
    warehouseState.warehouses = WAREHOUSE_SEED.map(fromDbWarehouse);
    warehouseState.tableAvailable = true;
    if (!isSupabaseReady()) return false;
    try {
      var now = new Date().toISOString();
      var rows = WAREHOUSE_SEED.map(function (warehouse) {
        return {
          id: warehouse.id,
          code: warehouse.code,
          name: warehouse.name,
          active: warehouse.active !== false,
          notes: warehouse.notes || "",
          updated_at: now
        };
      });
      await upsertInChunks("wms_warehouses", rows, "code");
      await loadWarehouses();
      return true;
    } catch (error) {
      warehouseState.tableAvailable = !isMissingWarehouseTableError(error);
      warehouseState.warehouses = WAREHOUSE_SEED.map(fromDbWarehouse);
      if (!warehouseState.tableAvailable) {
        console.warn("Tabela wms_warehouses ausente; usando estoques locais ate executar o schema.", error);
      } else {
        console.warn("Nao foi possivel preparar estoques:", error);
      }
      return false;
    }
  }

  async function loadWarehouses() {
    var cachedWarehouses = await cacheGet("warehouses:global");
    var loadedFromCache = false;
    if (cachedWarehouses && Array.isArray(cachedWarehouses.value)) {
      warehouseState.warehouses = cachedWarehouses.value.map(fromDbWarehouse);
      warehouseState.tableAvailable = true;
      loadedFromCache = true;
    }
    if (!isSupabaseReady() || !canUseNetwork()) return loadedFromCache;
    try {
      var rows = await fetchAllRows("wms_warehouses", "code", true);
      warehouseState.warehouses = (rows.length ? rows : WAREHOUSE_SEED).map(fromDbWarehouse);
      warehouseState.tableAvailable = true;
      if (!userCanAccessWarehouse(authState.currentUser, activeWarehouseCode())) {
        var allowed = allowedWarehouseCodesForUser(authState.currentUser);
        setActiveWarehouse(allowed[0] || DEFAULT_WAREHOUSE_CODE);
      }
      renderActiveWarehouseUi();
      await cacheSet("warehouses:global", warehouseState.warehouses);
      moduleLoadState.warehouses = true;
      return true;
    } catch (error) {
      warehouseState.tableAvailable = !isMissingWarehouseTableError(error);
      if (!loadedFromCache) warehouseState.warehouses = WAREHOUSE_SEED.map(fromDbWarehouse);
      return loadedFromCache;
    }
  }

  function isMissingWarehouseTableError(error) {
    var message = formatSupabaseError(error).toLowerCase();
    return message.indexOf("wms_warehouses") >= 0 && (
      message.indexOf("schema cache") >= 0 ||
      message.indexOf("does not exist") >= 0 ||
      message.indexOf("not found") >= 0 ||
      message.indexOf("pgrst") >= 0 ||
      message.indexOf("404") >= 0
    );
  }

  async function loadData() {
    var loadStartedAt = performance.now();
    setSyncStatus("Sincronizando", "warning");
    state = { bindings: [], history: [], products: {} };
    var cachedCore = await readModuleCache("coreData");
    var loadedFromCache = false;
    if (cachedCore && Array.isArray(cachedCore.bindings)) {
      state.bindings = (cachedCore.bindings || []).filter(bindingMatchesActiveWarehouse);
      state.history = [];
      state.products = cachedCore.products || {};
      loadedFromCache = true;
    }
    if (!isSupabaseReady() || !canUseNetwork()) {
      if (loadedFromCache) updateSupabaseStatus("Dados carregados do cache local. Conecte para sincronizar com o Supabase.", "warning");
      recordPerformanceMetric("lastCoreLoadMs", loadStartedAt);
      setSyncStatus(loadedFromCache ? "Cache local" : "Offline", loadedFromCache ? "warning" : "error");
      return;
    }
    try {
      var bindingRows = await fetchWarehouseRows("wms_bindings", "created_at", false);
      state.bindings = expandDbBindingRows(bindingRows).filter(bindingMatchesActiveWarehouse);

      var statusType = "success";
      state.history = [];

      state.products = {};
      var productsMessage = "";
      try {
        var productRows = await fetchAllRows("wms_products", "sku", true);
        productsTableAvailable = true;
        productRows.forEach(function (product) {
          if (product.sku && product.product_name) state.products[product.sku] = product.product_name;
        });
      } catch (productsError) {
        if (!isMissingProductsTableError(productsError)) throw productsError;
        productsTableAvailable = false;
        rebuildProductsFromBindings();
        productsMessage = " Tabela wms_products ausente; nomes foram lidos de wms_bindings. Aplique as migrations do Supabase para gravar o catalogo de produtos.";
        statusType = "warning";
      }
      productsDirty = false;
      await writeModuleCache("coreData", {
        bindings: state.bindings,
        products: state.products
      });
      recordPerformanceMetric("lastCoreLoadMs", loadStartedAt);
      setSyncStatus("Sincronizado", "success");
      moduleLoadState.core = true;
      updateSupabaseStatus("SELECT OK: " + state.bindings.length + " registro(s) em wms_bindings e " + Object.keys(state.products).length + " produto(s)." + productsMessage, statusType);
    } catch (error) {
      recordPerformanceMetric("lastCoreLoadMs", loadStartedAt);
      recordPerformanceError("enderecamento", error);
      var message = formatSupabaseError(error);
      console.error("Erro no SELECT do Supabase:", error);
      if (!loadedFromCache) state = { bindings: [], history: [], products: {} };
      updateSupabaseStatus("Falha no SELECT do Supabase: " + message, "error");
      setSyncStatus(loadedFromCache ? "Cache local" : "Erro sync", loadedFromCache ? "warning" : "error");
      showToast(loadedFromCache ? "Supabase indisponivel. Usando cache local." : "Nao foi possivel carregar o banco Supabase.", loadedFromCache ? "warning" : "error");
    }
  }

  async function saveData() {
    if (!isSupabaseReady()) {
      updateSupabaseStatus("Supabase nao conectado. " + describeSupabaseConfigProblem(), "warning");
      return false;
    }
    if (!canUseNetwork()) {
      updateSupabaseStatus("Sem conexao. Acoes criticas de escrita foram bloqueadas para evitar conflito.", "warning");
      showToast("Conecte a internet para salvar alteracoes.", "warning");
      return false;
    }
    try {
      if (state.bindings.length) {
        try {
          await upsertInChunks("wms_bindings", dedupeBindingsForSave().map(toDbBinding), "warehouse_code,sku,location_code");
        } catch (bindingError) {
          if (!isMissingWarehouseColumnError(bindingError)) throw bindingError;
          assertWarehouseFallbackAllowed("wms_bindings", bindingError);
          await upsertInChunks("wms_bindings", dedupeBindingsForSave().map(toDbBinding).map(stripWarehouseColumns), "id");
        }
      }
      if (state.history.length && historySchemaAvailable) {
        try {
          await upsertInChunks("wms_history", state.history.map(toDbHistory), "id");
        } catch (historyError) {
          if (isMissingWarehouseColumnError(historyError)) {
            assertWarehouseFallbackAllowed("wms_history", historyError);
            await upsertInChunks("wms_history", state.history.map(toDbHistory).map(stripWarehouseColumns), "id");
            historyError = null;
          }
          if (!historyError) {
            // Historico salvo pelo fallback da VDCG.
          } else if (!isHistorySchemaError(historyError)) {
            throw historyError;
          } else {
            historySchemaAvailable = false;
            updateSupabaseStatus("Dados principais salvos em wms_bindings. Historico nao salvo porque wms_history esta sem a coluna datetime; aplique as migrations do Supabase.", "warning");
          }
        }
      } else if (state.history.length && !historySchemaAvailable) {
        updateSupabaseStatus("Dados principais salvos em wms_bindings. Historico nao salvo porque wms_history esta sem a coluna datetime; aplique as migrations do Supabase.", "warning");
      }
      if (productsDirty) {
        var products = Object.keys(state.products).map(function (sku) {
          return { sku: sku, product_name: state.products[sku] };
        });
        if (products.length && productsTableAvailable) {
          try {
            await upsertInChunks("wms_products", products, "sku");
          } catch (productError) {
            if (!isMissingProductsTableError(productError)) throw productError;
            productsTableAvailable = false;
            updateSupabaseStatus("Dados principais salvos em wms_bindings. Tabela wms_products ausente; aplique as migrations do Supabase para gravar o catalogo de produtos.", "warning");
          }
        } else if (products.length && !productsTableAvailable) {
          updateSupabaseStatus("Dados principais salvos em wms_bindings. Tabela wms_products ausente; aplique as migrations do Supabase para gravar o catalogo de produtos.", "warning");
        }
        productsDirty = false;
      }
      await writeModuleCache("coreData", {
        bindings: state.bindings,
        products: state.products
      });
      return true;
    } catch (error) {
      var message = formatSupabaseError(error);
      console.error("Erro ao salvar no Supabase:", error);
      updateSupabaseStatus("Erro ao salvar no Supabase: " + message, "error");
      showToast("Erro ao salvar no Supabase.", "error");
      return false;
    }
  }

  async function loadTransferData() {
    var loadStartedAt = performance.now();
    var currentWarehouse = activeWarehouseCode();
    var previousItems = transferState.items.filter(function (item) {
      return processRowMatchesActiveWarehouse(item) && item.transferId && transferState.loadedItemTransferIds[item.transferId];
    });
    var previousLoaded = Object.assign({}, transferState.loadedItemTransferIds || {});
    transferState.establishments = [];
    transferState.transfers = [];
    transferState.items = previousItems;
    transferState.events = [];
    transferState.productPackaging = {};
    transferState.loadedItemTransferIds = previousLoaded;
    performanceState.lastTransferQueryCount = 0;
    var cachedTransfers = await readModuleCache("transferData");
    var loadedFromCache = false;
    if (cachedTransfers && Array.isArray(cachedTransfers.transfers)) {
      transferState.establishments = cachedTransfers.establishments || [];
      transferState.transfers = (cachedTransfers.transfers || []).filter(function (transfer) {
        return isOperationalTransferRecord(transfer) && transferBelongsToActiveWarehouse(transfer);
      });
      var cachedTransferIds = {};
      transferState.transfers.forEach(function (transfer) { cachedTransferIds[transfer.id] = true; });
      transferState.items = transferState.items.filter(function (item) { return cachedTransferIds[item.transferId]; });
      Object.keys(transferState.loadedItemTransferIds || {}).forEach(function (transferId) {
        if (!cachedTransferIds[transferId]) delete transferState.loadedItemTransferIds[transferId];
      });
      transferState.events = [];
      transferState.productPackaging = cachedTransfers.productPackaging || {};
      transferState.tablesAvailable = true;
      invalidateTransferStatsCache();
      loadedFromCache = true;
    }
    if (!isSupabaseReady() || !canUseNetwork()) {
      recordPerformanceMetric("lastTransferLoadMs", loadStartedAt);
      return loadedFromCache;
    }
    try {
      var establishmentResponse = await selectRowsWithMissingColumnFallback("wms_establishments", establishmentSelectColumns(), function (query) {
        return query.order("codigo", { ascending: true }).limit(1000);
      });
      if (establishmentResponse.error) throw establishmentResponse.error;
      performanceState.lastTransferQueryCount += 1;
      var establishmentRows = establishmentResponse.data || [];
      var transferRows = await fetchTransferSummaryRows(220);
      var packagingRows = await fetchProductPackagingRows();
      var transferIds = {};
      transferRows.forEach(function (row) { transferIds[row.id] = true; });
      transferState.establishments = establishmentRows.map(fromDbEstablishment);
      transferState.transfers = transferRows.map(fromDbTransfer).filter(isOperationalTransferRecord);
      transferIds = {};
      transferState.transfers.forEach(function (transfer) { transferIds[transfer.id] = true; });
      transferState.items = transferState.items.filter(function (item) { return item.transferId && transferIds[item.transferId] && transferBelongsToActiveWarehouse({ warehouseCode: item.warehouseCode || currentWarehouse }); });
      Object.keys(transferState.loadedItemTransferIds || {}).forEach(function (transferId) {
        if (!transferIds[transferId]) delete transferState.loadedItemTransferIds[transferId];
      });
      transferState.events = [];
      invalidateTransferStatsCache();
      packagingRows.forEach(function (row) {
        var pattern = fromDbProductPackaging(row);
        if (pattern.sku) transferState.productPackaging[normalizeSkuKey(pattern.sku)] = pattern;
      });
      transferState.tablesAvailable = true;
      await writeModuleCache("transferData", {
        establishments: transferState.establishments,
        transfers: transferState.transfers,
        productPackaging: transferState.productPackaging
      });
      performanceState.lastTransferLoadedItems = transferState.items.length;
      recordPerformanceMetric("lastTransferLoadMs", loadStartedAt);
      setSyncStatus("Sincronizado", "success");
      moduleLoadState.transfers = true;
      return true;
    } catch (error) {
      recordPerformanceMetric("lastTransferLoadMs", loadStartedAt);
      if (!isExpectedLegacySchemaCompatibilityError(error)) recordPerformanceError("transferencias", error);
      transferState.tablesAvailable = !isMissingTransferTableError(error);
      if (!transferState.tablesAvailable) {
        showToast("Tabelas de transferencias ausentes. Aplique as migrations do Supabase.", "warning");
      } else {
        showToast(loadedFromCache ? "Transferencias carregadas do cache local." : "Nao foi possivel carregar transferencias.", loadedFromCache ? "warning" : "error");
        console.error("Erro ao carregar transferencias:", error);
      }
      return loadedFromCache;
    }
  }

  async function loadTransferItemsForTransfer(transferId, options) {
    options = options || {};
    if (!transferId) return [];
    var transfer = getTransferById(transferId);
    if (!transfer && options.requireTransfer !== false) return [];
    if (!options.force && transferState.loadedItemTransferIds[transferId]) return getTransferItems(transferId);
    if (transferState.loadingTransferItems[transferId]) return transferState.loadingTransferItems[transferId];
    if (!isSupabaseReady() || !canUseNetwork()) return getTransferItems(transferId);
    var loadPromise = (async function () {
      var startedAt = performance.now();
      try {
        var rows = await fetchTransferItemsForTransfer(transferId, (transfer && transfer.warehouseCode) || activeWarehouseCode());
        var loadedItems = rows.map(fromDbTransferItem).filter(function (item) {
          return item.transferId === transferId && processRowMatchesActiveWarehouse(item);
        });
        transferState.items = transferState.items.filter(function (item) { return item.transferId !== transferId; }).concat(loadedItems);
        transferState.loadedItemTransferIds[transferId] = true;
        transferState.events = [];
        performanceState.lastTransferLoadedItems = loadedItems.length;
        recordPerformanceMetric("lastTransferDetailMs", startedAt);
        invalidateTransferStatsCache();
        writeTransferCacheSoon();
        return loadedItems;
      } catch (error) {
        recordPerformanceMetric("lastTransferDetailMs", startedAt);
        recordPerformanceError("transfer-detail", error);
        showToast("Nao foi possivel carregar itens da transferencia: " + formatSupabaseError(error), "error");
        return getTransferItems(transferId);
      } finally {
        delete transferState.loadingTransferItems[transferId];
      }
    })();
    transferState.loadingTransferItems[transferId] = loadPromise;
    return loadPromise;
  }

  function writeTransferCacheSoon() {
    if (transferState.cacheWriteTimer) window.clearTimeout(transferState.cacheWriteTimer);
    transferState.cacheWriteTimer = window.setTimeout(function () {
      transferState.cacheWriteTimer = null;
      writeModuleCache("transferData", {
        establishments: transferState.establishments,
        transfers: transferState.transfers,
        productPackaging: transferState.productPackaging
      }).catch(function (error) {
        recordPerformanceError("transfer-cache-write", error);
      });
    }, 250);
  }

  function upsertById(list, row) {
    if (!row || !row.id) return;
    var index = list.findIndex(function (entry) { return entry.id === row.id; });
    if (index >= 0) list[index] = row;
    else list.unshift(row);
  }

  function removeById(list, id) {
    var index = list.findIndex(function (entry) { return entry.id === id; });
    if (index >= 0) list.splice(index, 1);
  }

  function isOperationalTransferRecord(transfer) {
    return !!transfer && transfer.isDeleted !== true && !transfer.deletedAt && !isMergedSourceTransfer(transfer);
  }

  function isMergedSourceTransfer(transfer) {
    if (!transfer) return false;
    if (transfer.mergedIntoId) return true;
    if (transfer.status === "ARQUIVADA_POR_UNIFICACAO") return true;
    if (transfer.mergeStatus === "ARQUIVADA_POR_UNIFICACAO") return true;
    return transfer.status === "UNIFICADA" && transfer.isMerged !== true;
  }

  function applyLocalTransferUpdate(transfer) {
    if (!transfer || !transfer.id) return;
    if (!isOperationalTransferRecord(transfer)) {
      removeLocalTransferEverywhere(transfer.id);
      return;
    }
    if (!transferBelongsToActiveWarehouse(transfer)) return;
    upsertById(transferState.transfers, transfer);
    invalidateTransferStatsCache();
    writeTransferCacheSoon();
  }

  function applyLocalTransferItemUpdate(item) {
    if (!item || !item.id || !processRowMatchesActiveWarehouse(item)) return;
    if (item.transferId && !getTransferById(item.transferId)) {
      scheduleTransferRealtimeRefresh("item-without-transfer", 250);
      return;
    }
    if (item.transferId && !transferState.loadedItemTransferIds[item.transferId] && transferState.activeTransferId !== item.transferId) {
      invalidateTransferStatsCache();
      return;
    }
    upsertById(transferState.items, item);
    if (item.transferId) transferState.loadedItemTransferIds[item.transferId] = true;
    invalidateTransferStatsCache();
    writeTransferCacheSoon();
  }

  function removeLocalTransferEverywhere(transferId) {
    if (!transferId) return;
    removeById(transferState.transfers, transferId);
    transferState.items = transferState.items.filter(function (item) { return item.transferId !== transferId; });
    transferState.events = transferState.events.filter(function (event) { return event.transfer_id !== transferId && event.transferId !== transferId; });
    if (transferState.activeTransferId === transferId) transferState.activeTransferId = "";
    if (transferState.mergeSelection && transferState.mergeSelection[transferId]) delete transferState.mergeSelection[transferId];
    transferState.mergePreview = null;
    maintenanceState.lastReport = null;
    invalidateTransferStatsCache();
    writeTransferCacheSoon();
  }

  function transferDebugLog(message, data) {
    try {
      if (import.meta.env && import.meta.env.DEV) console.log("[transferencias] " + message, data || "");
    } catch (error) {
      // Log de desenvolvimento indisponivel fora do build Vite.
    }
  }

  function fromDbEstablishment(row) {
    return {
      id: row.id,
      code: row.codigo || "",
      storeCode: row.codigo_loja || row.codigo || "",
      internalCode: row.codigo_interno || "",
      channel: row.canal || "",
      name: row.nome || "",
      cnpj: row.cnpj || "",
      active: row.ativo !== false,
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || row.created_at || new Date().toISOString()
    };
  }

  function fromDbTransfer(row) {
    var normalizedStatus = normalizeTransferStatus(row.status);
    var deletedAt = row.deleted_at || "";
    return {
      id: row.id,
      code: row.codigo_transferencia || "",
      name: row.nome_transferencia || "",
      establishmentId: row.estabelecimento_id || "",
      establishmentCode: row.estabelecimento_codigo || "",
      establishmentName: row.estabelecimento_nome || "",
      establishmentCnpj: row.estabelecimento_cnpj || "",
      importSource: row.import_source || "",
      importBatchId: row.import_batch_id || "",
      importFileName: row.import_file_name || "",
      importedById: row.imported_by_id || "",
      importedByName: row.imported_by_name || "",
      rawSourceText: row.raw_source_text || "",
      originId: row.origem_id || "",
      originName: row.origem_nome || "",
      originCnpj: row.origem_cnpj || "",
      originStoreCode: row.origem_codigo_loja || "",
      originInternalCode: row.origem_codigo_interno || "",
      originChannel: row.origem_canal || "",
      destinationId: row.destino_id || row.estabelecimento_id || "",
      destinationName: row.destino_nome || row.estabelecimento_nome || "",
      destinationCnpj: row.destino_cnpj || row.estabelecimento_cnpj || "",
      destinationStoreCode: row.destino_codigo_loja || row.estabelecimento_codigo || "",
      destinationInternalCode: row.destino_codigo_interno || "",
      destinationChannel: row.destino_canal || "",
      responsibleId: row.responsavel_id || "",
      responsibleName: row.responsavel_nome || "",
      status: normalizedStatus,
      observation: row.observacao || "",
      flowType: row.tipo_fluxo || row.flow_type || row.tipo_transferencia || "",
      createdById: row.criado_por_id || "",
      createdByName: row.criado_por_nome || "",
      startedAt: row.iniciado_em || row.started_at || "",
      finishedAt: row.finalizado_em || row.finished_at || "",
      durationSeconds: Number(row.duracao_segundos || row.duration_seconds || 0),
      separationStartedAt: row.separacao_iniciada_em || row.separation_started_at || row.iniciado_em || "",
      separationFinishedAt: row.separacao_concluida_em || row.separation_finished_at || "",
      separationDurationSeconds: Number(row.duracao_separacao_segundos || row.separation_duration_seconds || 0),
      packingStartedAt: row.lacre_iniciado_em || row.packing_started_at || "",
      packingFinishedAt: row.lacre_concluido_em || row.packing_finished_at || "",
      packingDurationSeconds: Number(row.duracao_lacre_segundos || row.packing_duration_seconds || 0),
      totalStartedAt: row.total_started_at || row.iniciado_em || row.started_at || "",
      totalFinishedAt: row.total_finished_at || row.finalizado_em || row.finished_at || "",
      totalDurationSeconds: Number(row.total_duration_seconds || row.duracao_segundos || 0),
      totalItems: Number(row.total_items || 0),
      totalSkus: Number(row.total_skus || 0),
      totalExpectedQuantity: Number(row.total_expected_quantity || 0),
      totalSeparatedQuantity: Number(row.total_separated_quantity || 0),
      totalPackedQuantity: Number(row.total_packed_quantity || 0),
      totalPreviewQuantity: Number(row.total_previsto || row.total_expected_quantity || 0),
      totalSentQuantity: Number(row.total_enviado || row.total_packed_quantity || 0),
      totalDifference: Number(row.diferenca_total || 0),
      totalBoxes: Number(row.total_caixas || row.final_box_count || row.total_boxes || 0),
      currentStep: row.current_step || "",
      lastActionAt: row.last_action_at || "",
      lastActionLabel: row.last_action_label || "",
      pendingItems: Number(row.itens_pendentes || 0),
      separatedItems: Number(row.itens_separados || 0),
      divergentItems: Number(row.itens_divergentes || 0),
      hasDivergence: row.has_divergence === true,
      divergenceCount: Number(row.divergence_count || 0),
      finalResult: row.final_result || "",
      isMerged: row.is_merged === true,
      mergedFromIds: normalizeJsonArray(row.merged_from_ids),
      mergedIntoId: row.unified_into_transfer_id || row.merged_into_id || "",
      mergeStatus: row.merge_status || "",
      mergedById: row.merged_by_id || "",
      mergedByName: row.merged_by_name || "",
      mergedAt: row.merged_at || "",
      archivedByUnification: row.archived_by_unification === true,
      isDeleted: row.is_deleted === true || !!deletedAt,
      deletedAt: deletedAt,
      deletedById: row.deleted_by_id || "",
      deletedByName: row.deleted_by_name || "",
      idempotencyKey: row.idempotency_key || "",
      requestId: row.request_id || "",
      warehouseId: row.warehouse_id || warehouseIdForCode(row.warehouse_code),
      warehouseCode: rowWarehouseCode(row),
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || row.created_at || new Date().toISOString()
    };
  }

  function normalizeJsonArray(value) {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    if (typeof value === "string") {
      try {
        var parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        return [];
      }
    }
    return [];
  }

  async function fetchProductPackagingRows() {
    try {
      return await fetchAllRows("wms_product_packaging", "sku", true);
    } catch (error) {
      if (!isMissingTransferTableError(error) && !isMissingColumnError(error)) console.warn("Padroes de embalagem nao carregados:", error);
      return [];
    }
  }

  function fromDbProductPackaging(row) {
    return {
      id: row.id || "",
      sku: row.sku || "",
      description: row.descricao || row.nome_material_snapshot || "",
      unitsPerBox: Number(row.unidades_por_caixa || 0),
      updatedAt: row.updated_at || "",
      updatedBy: row.updated_by || ""
    };
  }

  function fromDbTransferItem(row) {
    return applyTransferQuantityType({
      id: row.id,
      transferId: row.transfer_id || "",
      sku: row.sku || row.codigo_material || "",
      description: row.descricao || row.nome_material_snapshot || "",
      requestedQty: Number(row.quantidade_solicitada || 0),
      unit: row.unidade_medida || "UN",
      movementType: row.tipo_movimentacao || "",
      sourceStore: row.loja_origem || "",
      destinationStore: row.loja_destino || "",
      sourceLegalName: row.razao_social_origem || "",
      destinationLegalName: row.razao_social_destino || "",
      legalNameGroup: row.agrupamento_razao_social || "",
      addressRua: row.endereco_rua || "",
      addressRack: row.endereco_rack || "",
      addressLinha: row.endereco_linha || "",
      addressLetra: row.endereco_letra || "",
      addressCode: row.endereco_codigo || "",
      hasLocation: row.has_location === true,
      locationWarning: row.location_warning || "",
      storeAvailable: row.saldo_loja_snapshot !== undefined && row.saldo_loja_snapshot !== null
        ? Number(row.saldo_loja_snapshot || 0)
        : row.saldo_loja_disponivel !== undefined && row.saldo_loja_disponivel !== null
          ? Number(row.saldo_loja_disponivel || 0)
          : null,
      captureAvailable: Number(row.saldo_captacao_snapshot !== undefined && row.saldo_captacao_snapshot !== null ? row.saldo_captacao_snapshot : row.saldo_captacao_disponivel || 0),
      originSuggested: row.origem_sugerida || "",
      suggestedCaptureQty: Number(row.quantidade_retirar_captacao !== undefined && row.quantidade_retirar_captacao !== null ? row.quantidade_retirar_captacao : row.quantidade_sugerida_captacao || 0),
      suggestedStoreQty: Number(row.quantidade_retirar_loja !== undefined && row.quantidade_retirar_loja !== null ? row.quantidade_retirar_loja : row.quantidade_sugerida_loja || 0),
      quantityShortage: Number(row.quantidade_faltante || 0),
      stockAlert: row.alerta_saldo === true || Boolean(row.alerta_saldo && typeof row.alerta_saldo === "string"),
      stockAlertMessage: row.alerta_saldo_mensagem || row.alerta_saldo || "",
      operationalMessage: row.alerta_saldo_mensagem || row.alerta_saldo || "",
      stockBaseFound: normalizeText(row.alerta_saldo_mensagem || row.alerta_saldo || "") !== "SKU ausente na Base de Estoque.",
      suggestedLocation: row.localizacao_captacao_snapshot || "",
      captureLocationSnapshot: row.localizacao_captacao_snapshot || "",
      wmsLocationSnapshot: "",
      stockSnapshotAt: row.stock_snapshot_at || "",
      quantityType: row.tipo_envio || row.tipo_quantidade || "UNIDADE",
      boxQty: Number(row.quantidade_caixas || 0),
      unitsPerBox: Number(row.unidades_por_caixa || 0),
      totalUnits: Number(row.quantidade_total_unidades || 0),
      separatedQty: Number(row.quantidade_separada || 0),
      packedQty: Number(row.quantidade_lacrada || 0),
      packedUnits: Number(row.quantidade_lacrada_unidades || 0),
      packagingObservation: row.embalagem_observacao || row.observation || "",
      extraQty: Number(row.quantidade_extra || 0),
      missingQty: Number(row.quantidade_faltante || 0),
      excessQty: Number(row.quantidade_excedente || 0),
      isExtra: row.is_extra === true,
      divergenceType: row.divergence_type || "",
      pendingReason: row.motivo_pendencia || "",
      pendingObservation: row.observacao_pendencia || "",
      addedById: row.added_by_id || "",
      addedByName: row.added_by_name || "",
      inputType: row.input_type || "",
      observation: row.observation || "",
      status: normalizeText(row.status || "PENDENTE").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "PENDENTE",
      statusOperational: row.status_operacional || "",
      statusDivergence: row.status_divergencia || "",
      idempotencyKey: row.idempotency_key || "",
      requestId: row.request_id || "",
      warehouseId: row.warehouse_id || warehouseIdForCode(row.warehouse_code),
      warehouseCode: rowWarehouseCode(row),
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || row.created_at || new Date().toISOString()
    });
  }

  function toDbEstablishment(item) {
    return {
      id: item.id,
      codigo: item.code,
      nome: item.name,
      cnpj: item.cnpj || "",
      ativo: item.active !== false,
      created_at: item.createdAt || new Date().toISOString(),
      updated_at: item.updatedAt || new Date().toISOString()
    };
  }

  function toDbTransfer(item) {
    return {
      id: item.id,
      codigo_transferencia: item.code,
      nome_transferencia: item.name,
      estabelecimento_id: item.establishmentId,
      estabelecimento_codigo: item.establishmentCode,
      estabelecimento_nome: item.establishmentName,
      estabelecimento_cnpj: item.establishmentCnpj,
      import_source: item.importSource || "",
      raw_source_text: item.rawSourceText || "",
      origem_id: item.originId || "",
      origem_nome: item.originName || "",
      origem_cnpj: item.originCnpj || "",
      origem_codigo_loja: item.originStoreCode || "",
      origem_codigo_interno: item.originInternalCode || "",
      origem_canal: item.originChannel || "",
      destino_id: item.destinationId || item.establishmentId || "",
      destino_nome: item.destinationName || item.establishmentName || "",
      destino_cnpj: item.destinationCnpj || item.establishmentCnpj || "",
      destino_codigo_loja: item.destinationStoreCode || item.establishmentCode || "",
      destino_codigo_interno: item.destinationInternalCode || "",
      destino_canal: item.destinationChannel || "",
      responsavel_id: item.responsibleId,
      responsavel_nome: item.responsibleName,
      status: normalizeTransferStatus(item.status),
      observacao: item.observation || "",
      criado_por_id: item.createdById,
      criado_por_nome: item.createdByName,
      import_batch_id: item.importBatchId || item.requestId || "",
      import_file_name: item.importFileName || item.rawSourceText || "",
      imported_by_id: item.importedById || item.createdById || "",
      imported_by_name: item.importedByName || item.createdByName || "",
      iniciado_em: item.startedAt || null,
      started_at: item.startedAt || null,
      finalizado_em: item.finishedAt || null,
      finished_at: item.finishedAt || null,
      duracao_segundos: Number(item.durationSeconds || 0),
      separacao_iniciada_em: item.separationStartedAt || null,
      separacao_concluida_em: item.separationFinishedAt || null,
      duracao_separacao_segundos: Number(item.separationDurationSeconds || 0),
      lacre_iniciado_em: item.packingStartedAt || null,
      lacre_concluido_em: item.packingFinishedAt || null,
      duracao_lacre_segundos: Number(item.packingDurationSeconds || 0),
      separation_started_at: item.separationStartedAt || item.startedAt || null,
      separation_finished_at: item.separationFinishedAt || null,
      separation_duration_seconds: Number(item.separationDurationSeconds || 0),
      packing_started_at: item.packingStartedAt || null,
      packing_finished_at: item.packingFinishedAt || null,
      packing_duration_seconds: Number(item.packingDurationSeconds || 0),
      total_started_at: item.totalStartedAt || item.startedAt || item.separationStartedAt || null,
      total_finished_at: item.totalFinishedAt || item.finishedAt || null,
      total_duration_seconds: Number(item.totalDurationSeconds || item.durationSeconds || 0),
      total_previsto: Number(item.totalPreviewQuantity || item.totalExpectedQuantity || 0),
      total_enviado: Number(item.totalSentQuantity || item.totalPackedQuantity || 0),
      diferenca_total: Number(item.totalDifference || 0),
      itens_total: Number(item.totalItems || item.totalSkus || 0),
      itens_separados: Number(item.separatedItems || 0),
      itens_pendentes: Number(item.pendingItems || 0),
      itens_divergentes: Number(item.divergentItems || item.divergenceCount || 0),
      total_caixas: Number(item.totalBoxes || item.finalBoxCount || 0),
      final_box_count: Number(item.totalBoxes || item.finalBoxCount || 0),
      total_boxes: Number(item.totalBoxes || item.finalBoxCount || 0),
      current_step: item.currentStep || transferCurrentStepForStatus(item.status),
      last_action_at: item.lastActionAt || item.updatedAt || null,
      last_action_label: item.lastActionLabel || "",
      is_merged: item.isMerged === true,
      merged_from_ids: item.mergedFromIds || [],
      merged_into_id: item.mergedIntoId || "",
      unified_into_transfer_id: item.mergedIntoId || "",
      merge_status: item.mergeStatus || "",
      merged_by_id: item.mergedById || "",
      merged_by_name: item.mergedByName || "",
      merged_at: item.mergedAt || null,
      archived_by_unification: item.archivedByUnification === true,
      is_deleted: item.isDeleted === true,
      deleted_at: item.deletedAt || null,
      deleted_by_id: item.deletedById || "",
      deleted_by_name: item.deletedByName || "",
      idempotency_key: item.idempotencyKey || "",
      request_id: item.requestId || item.idempotencyKey || "",
      warehouse_id: item.warehouseId || activeWarehouseId(),
      warehouse_code: normalizeWarehouseCode(item.warehouseCode || activeWarehouseCode()),
      created_at: item.createdAt || new Date().toISOString(),
      updated_at: item.updatedAt || new Date().toISOString()
    };
  }

  function toDbTransferItem(item) {
    return {
      id: item.id,
      transfer_id: item.transferId,
      sku: item.sku,
      codigo_material: normalizeSku(item.sku || item.codigoMaterial || ""),
      descricao: item.description,
      quantidade_solicitada: Number(item.requestedQty || 0),
      unidade_medida: item.unit || "UN",
      tipo_movimentacao: item.movementType || "",
      loja_origem: item.sourceStore || "",
      loja_destino: item.destinationStore || "",
      razao_social_origem: item.sourceLegalName || "",
      razao_social_destino: item.destinationLegalName || "",
      agrupamento_razao_social: item.legalNameGroup || "",
      endereco_rua: item.addressRua || "",
      endereco_rack: item.addressRack || "",
      endereco_linha: item.addressLinha || "",
      endereco_letra: item.addressLetra || "",
      endereco_codigo: item.addressCode || "",
      has_location: item.hasLocation === true,
      location_warning: item.locationWarning || "",
      saldo_loja_disponivel: item.storeAvailable === null || item.storeAvailable === undefined ? 0 : Number(item.storeAvailable || 0),
      saldo_captacao_disponivel: Number(item.captureAvailable || 0),
      nome_material_snapshot: item.description || "",
      saldo_loja_snapshot: item.storeAvailable === null || item.storeAvailable === undefined ? 0 : Number(item.storeAvailable || 0),
      saldo_captacao_snapshot: Number(item.captureAvailable || 0),
      origem_sugerida: item.originSuggested || "",
      quantidade_sugerida_captacao: Number(item.suggestedCaptureQty || 0),
      quantidade_sugerida_loja: Number(item.suggestedStoreQty || 0),
      quantidade_retirar_captacao: Number(item.suggestedCaptureQty || 0),
      quantidade_retirar_loja: Number(item.suggestedStoreQty || 0),
      quantidade_faltante: Number(item.quantityShortage || item.missingQty || 0),
      alerta_saldo: item.stockAlert === true,
      alerta_saldo_mensagem: item.stockAlertMessage || "",
      localizacao_sugerida: item.suggestedLocation || "",
      localizacao_captacao_snapshot: item.captureLocationSnapshot || item.suggestedLocation || "",
      localizacao_wms_snapshot: "",
      stock_snapshot_at: item.stockSnapshotAt || null,
      tipo_quantidade: item.quantityType || "UNIDADE",
      tipo_envio: item.quantityType || "UNIDADE",
      quantidade_caixas: Number(item.boxQty || 0),
      unidades_por_caixa: Number(item.unitsPerBox || 0),
      quantidade_total_unidades: isBoxQuantityItem(item) ? getTransferExpectedUnits(item) : Number(item.totalUnits || item.requestedQty || 0),
      quantidade_separada: Number(item.separatedQty || 0),
      quantidade_lacrada: Number(item.packedQty || 0),
      quantidade_lacrada_unidades: Number(item.packedUnits || 0),
      embalagem_observacao: item.packagingObservation || "",
      quantidade_enviada: isBoxQuantityItem(item) ? getTransferPackedUnits(item) : Number(item.packedQty || 0),
      total_unidades_caixa: isBoxQuantityItem(item) ? Number(item.packedUnits || getTransferExpectedUnits(item) || 0) : 0,
      diferenca: getTransferItemDifferenceForDb(item),
      motivo_pendencia: item.pendingReason || "",
      observacao_pendencia: item.pendingObservation || "",
      has_divergence: Boolean(item.divergenceType || Number(item.missingQty || 0) > 0 || Number(item.excessQty || 0) > 0),
      status_operacional: transferOperationalStatusForItem(item),
      status_divergencia: transferDivergenceStatusForItem(item),
      status: item.status || "PENDENTE",
      idempotency_key: item.idempotencyKey || "",
      request_id: item.requestId || item.idempotencyKey || "",
      warehouse_id: item.warehouseId || activeWarehouseId(),
      warehouse_code: normalizeWarehouseCode(item.warehouseCode || activeWarehouseCode()),
      created_at: item.createdAt || new Date().toISOString(),
      updated_at: item.updatedAt || new Date().toISOString()
    };
  }

  function transferItemAuditDbFields(item) {
    return {
      quantidade_extra: Number(item.extraQty || 0),
      quantidade_faltante: Number(item.missingQty || item.quantityShortage || 0),
      quantidade_excedente: Number(item.excessQty || 0),
      is_extra: item.isExtra === true,
      divergence_type: item.divergenceType || "",
      motivo_pendencia: item.pendingReason || "",
      observacao_pendencia: item.pendingObservation || "",
      has_divergence: Boolean(item.divergenceType || Number(item.missingQty || 0) > 0 || Number(item.excessQty || 0) > 0),
      added_by_id: item.addedById || "",
      added_by_name: item.addedByName || "",
      input_type: item.inputType || "",
      observation: item.observation || ""
    };
  }

  function stripOptionalTransferColumns(row) {
    return pickColumns(row, [
      "id",
      "codigo_transferencia",
      "nome_transferencia",
      "estabelecimento_id",
      "estabelecimento_codigo",
      "estabelecimento_nome",
      "estabelecimento_cnpj",
      "responsavel_id",
      "responsavel_nome",
      "status",
      "observacao",
      "criado_por_id",
      "criado_por_nome",
      "iniciado_em",
      "separacao_concluida_em",
      "lacre_concluido_em",
      "created_at",
      "updated_at"
    ]);
  }

  function stripOptionalTransferItemColumns(row) {
    return pickColumns(row, [
      "id",
      "created_at",
      "updated_at",
      "transfer_id",
      "sku",
      "descricao",
      "quantidade_solicitada",
      "unidade_medida",
      "tipo_quantidade",
      "quantidade_caixas",
      "unidades_por_caixa",
      "quantidade_total_unidades",
      "quantidade_separada",
      "quantidade_lacrada",
      "saldo_loja_disponivel",
      "saldo_captacao_disponivel",
      "saldo_loja_snapshot",
      "saldo_captacao_snapshot",
      "origem_sugerida",
      "quantidade_sugerida_captacao",
      "quantidade_sugerida_loja",
      "quantidade_retirar_captacao",
      "quantidade_retirar_loja",
      "alerta_saldo",
      "alerta_saldo_mensagem",
      "localizacao_sugerida",
      "localizacao_captacao_snapshot",
      "localizacao_wms_snapshot",
      "stock_snapshot_at",
      "status",
      "status_operacional",
      "status_divergencia"
    ]);
  }

  function pickColumns(row, allowed) {
    var output = {};
    allowed.forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(row, key)) output[key] = row[key];
    });
    return output;
  }

  function getMissingColumnName(error) {
    var message = formatSupabaseError(error);
    var quotedColumn = message.match(/'([^']+)'\s+column/i);
    if (quotedColumn && quotedColumn[1]) return quotedColumn[1];
    var qualifiedColumn = message.match(/column\s+"?([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)"?/i);
    if (qualifiedColumn && qualifiedColumn[2]) return qualifiedColumn[2];
    var columnMatch = message.match(/column\s+"?([a-zA-Z0-9_]+)"?/i);
    if (columnMatch && columnMatch[1] && columnMatch[1] !== "column") return columnMatch[1];
    return "";
  }

  async function updateTransferWithSchemaFallback(transferId, update) {
    return updateRowWithSchemaFallback("wms_transfers", "id", transferId, update);
  }

  async function updateRowWithSchemaFallback(tableName, columnName, value, update) {
    var payload = Object.assign({}, update);
    var attemptedMissingColumns = {};
    var response = await runSupabaseRequestWithRetry("update-" + tableName, function () {
      return supabaseDb.from(tableName).update(payload).eq(columnName, value);
    });
    while (response.error && isMissingColumnError(response.error)) {
      var missingColumn = getMissingColumnName(response.error);
      if (!missingColumn || attemptedMissingColumns[missingColumn]) break;
      attemptedMissingColumns[missingColumn] = true;
      delete payload[missingColumn];
      response = await runSupabaseRequestWithRetry("update-" + tableName, function () {
        return supabaseDb.from(tableName).update(payload).eq(columnName, value);
      });
    }
    return response;
  }

  async function insertTransferRows(rows) {
    var payload = rows.map(function (row) { return Object.assign({}, row); });
    var attemptedMissingColumns = {};
    var response = await supabaseDb.from("wms_transfers").insert(payload);
    while (response.error && isMissingColumnError(response.error)) {
      if (isMissingWarehouseColumnError(response.error)) assertWarehouseFallbackAllowed("wms_transfers", response.error);
      var missingColumn = getMissingColumnName(response.error);
      if (!missingColumn || attemptedMissingColumns[missingColumn]) break;
      attemptedMissingColumns[missingColumn] = true;
      payload.forEach(function (row) { delete row[missingColumn]; });
      response = await supabaseDb.from("wms_transfers").insert(payload);
    }
    if (response.error && isDuplicateKeyError(response.error) && await transferRowsAlreadyPersisted(payload)) return;
    if (response.error) throw response.error;
  }

  async function transferRowsAlreadyPersisted(rows) {
    var keys = unique((rows || []).map(function (row) { return row.idempotency_key || ""; }).filter(Boolean));
    if (!keys.length) return false;
    var response = await supabaseDb
      .from("wms_transfers")
      .select("id,idempotency_key")
      .eq("warehouse_code", normalizeWarehouseCode(rows[0].warehouse_code || activeWarehouseCode()))
      .in("idempotency_key", keys);
    if (response.error) return false;
    return (response.data || []).length >= keys.length;
  }

  async function insertTransferItemRow(row) {
    var payload = Object.assign({}, row);
    var attemptedMissingColumns = {};
    var response = await supabaseDb.from("wms_transfer_items").insert(payload);
    while (response.error && isMissingColumnError(response.error)) {
      if (isMissingWarehouseColumnError(response.error)) assertWarehouseFallbackAllowed("wms_transfer_items", response.error);
      var missingColumn = getMissingColumnName(response.error);
      if (!missingColumn || attemptedMissingColumns[missingColumn]) break;
      attemptedMissingColumns[missingColumn] = true;
      delete payload[missingColumn];
      response = await supabaseDb.from("wms_transfer_items").insert(payload);
    }
    if (response.error) throw response.error;
  }

  async function upsertTransferItemRows(rows) {
    var payload = rows.map(function (row) { return Object.assign({}, row); });
    var attemptedMissingColumns = {};
    while (true) {
      try {
        await upsertInChunks("wms_transfer_items", payload, "id");
        return;
      } catch (error) {
        if (isDuplicateKeyError(error) && await transferItemRowsAlreadyPersisted(payload)) return;
        if (!isMissingColumnError(error)) throw error;
        if (isMissingWarehouseColumnError(error)) assertWarehouseFallbackAllowed("wms_transfer_items", error);
        var missingColumn = getMissingColumnName(error);
        if (!missingColumn || attemptedMissingColumns[missingColumn]) throw error;
        attemptedMissingColumns[missingColumn] = true;
        payload.forEach(function (row) { delete row[missingColumn]; });
      }
    }
  }

  async function transferItemRowsAlreadyPersisted(rows) {
    var keys = unique((rows || []).map(function (row) { return row.idempotency_key || ""; }).filter(Boolean));
    if (!keys.length) return false;
    var response = await supabaseDb
      .from("wms_transfer_items")
      .select("id,idempotency_key")
      .eq("warehouse_code", normalizeWarehouseCode(rows[0].warehouse_code || activeWarehouseCode()))
      .in("idempotency_key", keys);
    if (response.error) return false;
    return (response.data || []).length >= keys.length;
  }

  async function loadStockOperationalData() {
    var startedAt = performance.now();
    stockState.batches = [];
    stockState.summary = { loja: 0, captacao: 0, updatedAt: "" };
    if (!isSupabaseReady()) return false;
    try {
      if (!stockState.importing) {
        await Promise.all([
          closeInterruptedStockImportBatches("LOJA", 10),
          closeInterruptedStockImportBatches("CAPTACAO", 10)
        ]);
      }
      var stockResults = await Promise.all([
        loadStockImportBatchRows(),
        countActiveStockPositions("LOJA"),
        countActiveStockPositions("CAPTACAO")
      ]);
      var batchResponse = stockResults[0];
      if (batchResponse.error) throw batchResponse.error;
      stockState.batches = batchResponse.data || [];
      stockState.summary.loja = stockResults[1];
      stockState.summary.captacao = stockResults[2];
      stockState.summary.updatedAt = stockState.batches[0] ? stockState.batches[0].created_at : "";
      stockState.tablesAvailable = true;
      recordPerformanceMetric("lastStockLoadMs", startedAt);
      return true;
    } catch (error) {
      stockState.tablesAvailable = !isMissingStockTableError(error);
      recordPerformanceError("base-estoque", error);
      if (getActiveScreenId() === "baseEstoque") setStatus("stockImportStatus", missingStockSchemaMessage(error), "error");
      return false;
    }
  }

  async function countActiveStockPositions(sourceType) {
    var response = await runSupabaseRequestWithRetry("count-stock-" + sourceType, function () {
      return supabaseDb
        .from("wms_stock_positions")
        .select("id", { count: "exact", head: true })
        .eq("warehouse_code", activeWarehouseCode())
        .eq("source_type", sourceType)
        .eq("active", true);
    });
    if (response.error) throw response.error;
    return Number(response.count || 0);
  }

  async function loadStockImportBatchRows() {
    return selectRowsWithMissingColumnFallback("wms_stock_import_batches", "id,created_at,updated_at,finished_at,warehouse_code,source_type,file_name,imported_by_name,total_rows,imported_rows,inserted_rows,updated_rows,unchanged_rows,deactivated_rows,negative_rows,alert_rows,ignored_rows,error_rows,status,notes,error_message,import_mode", function (query) {
      return query.eq("warehouse_code", activeWarehouseCode()).order("created_at", { ascending: false }).limit(10);
    });
  }

  async function refreshStockOperationalData() {
    moduleLoadState.stock = false;
    await ensureStockDataLoaded();
    renderStockBase();
  }

  function renderStockBase() {
    if (!$("stockBaseSummary")) return;
    $("stockBaseSummary").innerHTML = [
      stockSummaryCard("Loja", stockState.summary.loja || 0),
      stockSummaryCard("CAPTACAO ativa", stockState.summary.captacao || 0),
      stockSummaryCard("Ultima importacao", stockState.summary.updatedAt ? formatDateTime(stockState.summary.updatedAt) : "-")
    ].join("");
    if ($("stockBatchRows")) {
      $("stockBatchRows").innerHTML = stockState.batches.length ? stockState.batches.map(function (batch) {
        return [
          "<tr>",
          "<td>" + formatDateTime(batch.created_at) + "</td>",
          "<td>" + escapeHtml(batch.source_type || "-") + "</td>",
          "<td>" + escapeHtml(batch.file_name || "-") + "</td>",
          "<td title=\"" + escapeHtml(batch.notes || "") + "\">" + stockBatchImportedSummary(batch) + "</td>",
          "<td>" + formatQty(batch.ignored_rows || 0) + "</td>",
          "<td><span class=\"status-badge " + (batch.status === "COMPLETED" ? "active" : batch.status === "FAILED" ? "inactive" : "warning") + "\">" + escapeHtml(batch.status || "-") + "</span></td>",
          "<td>" + escapeHtml(batch.imported_by_name || "-") + "</td>",
          "</tr>"
        ].join("");
      }).join("") : "<tr><td colspan=\"7\">Nenhuma importacao operacional no estoque atual.</td></tr>";
    }
  }

  function stockSummaryCard(label, value) {
    return "<article class=\"stock-summary-card\"><span>" + escapeHtml(label) + "</span><strong>" + escapeHtml(String(value)) + "</strong></article>";
  }

  function stockBatchImportedSummary(batch) {
    if (batch.inserted_rows === undefined && batch.updated_rows === undefined && batch.deactivated_rows === undefined) return formatQty(batch.imported_rows || 0);
    return [
      formatQty(batch.imported_rows || 0),
      "<small>+ " + formatQty(batch.inserted_rows || 0) + " novo(s) / " + formatQty(batch.updated_rows || 0) + " alt. / " + formatQty(batch.deactivated_rows || 0) + " inat." + (batch.negative_rows !== undefined ? " / " + formatQty(batch.negative_rows || 0) + " neg." : "") + "</small>"
    ].join("<br>");
  }

  function updateLocalStockBatchProgress(batchId, patch) {
    if (!batchId || !patch) return;
    var existingIndex = (stockState.batches || []).findIndex(function (batch) { return batch.id === batchId; });
    if (existingIndex >= 0) {
      stockState.batches[existingIndex] = Object.assign({}, stockState.batches[existingIndex], patch);
    } else {
      stockState.batches.unshift(Object.assign({ id: batchId }, patch));
      stockState.batches = stockState.batches.slice(0, 10);
    }
    if (getActiveScreenId() === "baseEstoque") renderStockBase();
  }

  async function importStockFromInput(sourceType) {
    if (!ensureActiveWarehouse()) return;
    if (!window.XLSX) {
      setStatus("stockImportStatus", "Biblioteca xlsx nao carregada.", "error");
      return;
    }
    if (!isSupabaseReady()) {
      setStatus("stockImportStatus", "Supabase nao conectado. " + describeSupabaseConfigProblem(), "error");
      return;
    }
    var input = sourceType === "CAPTACAO" ? $("captureStockFileInput") : $("storeStockFileInput");
    var file = input && input.files ? input.files[0] : null;
    if (!file) {
      setStatus("stockImportStatus", "Selecione a planilha de " + stockSourceLabel(sourceType) + ".", "error");
      return;
    }
    var button = sourceType === "CAPTACAO" ? $("importCaptureStockButton") : $("importStoreStockButton");
    if (!beginTransferAction("import-stock-" + sourceType, button, "Importando...")) return;
    try {
      stockState.importing = true;
      var importMode = $("stockImportModeInput") ? $("stockImportModeInput").value : "CARGA_COMPLETA";
      setStatus("stockImportStatus", "Lendo planilha de " + stockSourceLabel(sourceType) + "...", "warning");
      var entry = await readWorkbookFile(file);
      var parsed = parseStockWorkbook(entry.workbook, sourceType);
      if (!parsed.rows.length) {
        setStatus("stockImportStatus", "Nenhuma linha valida encontrada no modelo de " + stockSourceLabel(sourceType) + ".", "error");
        return;
      }
      setStatus("stockImportStatus", "Comparando " + parsed.rows.length + " item(ns) com o Supabase...", "warning");
      var importResult = await saveStockImportBatch(sourceType, file.name, parsed, importMode);
      invalidateStockCacheForWarehouseSource(activeWarehouseCode(), sourceType, importResult.changedSkus || []);
      await refreshStockOperationalData();
      setStatus("stockImportStatus", "Base " + stockSourceLabel(sourceType) + " sincronizada (" + stockImportModeLabel(importMode) + "): " + importResult.inserted + " novo(s), " + importResult.updated + " atualizado(s), " + importResult.unchanged + " igual(is), " + importResult.deactivated + " inativado(s), " + importResult.negative + " negativo(s), " + (importResult.unlocatedBindingsRemoved || 0) + " endereco(s) antigo(s) removido(s), " + parsed.ignored + " ignorado(s).", "success");
      showToast("Base de estoque importada.", "success");
    } catch (error) {
      setStatus("stockImportStatus", "Falha na importacao: " + missingStockSchemaMessage(error), "error");
      recordPerformanceError("import-stock-" + sourceType, error);
    } finally {
      stockState.importing = false;
      endTransferAction(button);
    }
  }

  function parseStockWorkbook(workbook, sourceType) {
    var result = { rows: [], ignored: 0, errors: [] };
    workbook.SheetNames.forEach(function (sheetName) {
      var rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", raw: false });
      rows.forEach(function (row) {
        var sku = firstSkuValue(getByAliases(row, sourceType === "CAPTACAO" ? ["Cod Material", "Codigo Material", "Código Material"] : ["Codigo Material", "Código Material", "Cod Material"]));
        var name = normalizeText(getByAliases(row, sourceType === "CAPTACAO" ? ["Desc Material", "Descricao Material", "Descrição Material", "Nome Material"] : ["Nome Material", "Desc Material", "Descricao Material", "Descrição Material"]));
        if (!sku) {
          result.ignored += 1;
          return;
        }
        var station = sourceType === "CAPTACAO" ? normalizeText(getByAliases(row, ["Estacao", "Estação", "Nome estacao", "Nome estação"])) : "";
        var rack = sourceType === "CAPTACAO" ? normalizeText(getByAliases(row, ["Rack", "Nr Rack"])) : "";
        var line = sourceType === "CAPTACAO" ? normalizeText(getByAliases(row, ["Linha prod alocado", "Linha", "Linha Produto Alocado"])) : "";
        var column = sourceType === "CAPTACAO" ? normalizeText(getByAliases(row, ["Coluna prod alocado", "Coluna", "Coluna Produto Alocado"])) : "";
        var addressText = sourceType === "CAPTACAO" ? normalizeText(getByAliases(row, ["Endereco", "Endereço", "Codigo Endereco", "Código Endereco", "Codigo do Endereco", "Código do Endereço", "Localizacao", "Localização", "Localizacao captacao", "Localização captação"])) : "";
        var locationStatus = sourceType === "CAPTACAO" ? normalizeText(getByAliases(row, ["Status localizacao", "Status localização", "Situacao localizacao", "Situação localização"])) : "";
        var location = sourceType === "CAPTACAO" ? buildStockImportLocation(station, rack, line, column, addressText) : { valid: false };
        var rowHasLocationColumns = sourceType === "CAPTACAO" && stockImportRowHasLocationColumns(row);
        result.rows.push({
          codigoMaterial: normalizeSku(sku) || normalizeText(sku),
          nomeMaterial: name,
          totalFisico: parseQuantity(getByAliases(row, ["Total fisico", "Total físico", "Total - Fisico", "Total - Físico"])),
          totalAlocado: parseQuantity(getByAliases(row, ["Total alocado", "Total - Alocado"])),
          totalDisponivel: parseQuantity(getByAliases(row, ["Total disponivel", "Total disponível", "Total - Disponivel", "Total - Disponível"])),
          estacao: station,
          rack: rack,
          linha: line,
          coluna: column,
          codigoEndereco: location.valid ? location.code : "",
          semLocalizacao: sourceType === "CAPTACAO" && rowHasLocationColumns && !location.valid && stockImportRowMeansNoLocation(station, rack, line, column, addressText, locationStatus),
          isSellable: isSellableStockProduct(name)
        });
      });
    });
    result.rows = dedupeStockRows(sourceType, result.rows);
    return result;
  }

  function stockImportLocationAliases() {
    return [
      "Estacao", "Estação", "Nome estacao", "Nome estação",
      "Rack", "Nr Rack",
      "Linha prod alocado", "Linha", "Linha Produto Alocado",
      "Coluna prod alocado", "Coluna", "Coluna Produto Alocado",
      "Endereco", "Endereço", "Codigo Endereco", "Código Endereco", "Codigo do Endereco", "Código do Endereço",
      "Localizacao", "Localização", "Localizacao captacao", "Localização captação",
      "Status localizacao", "Status localização", "Situacao localizacao", "Situação localização"
    ];
  }

  function stockImportRowHasLocationColumns(row) {
    var available = Object.keys(row || {}).map(normalizeHeader);
    return stockImportLocationAliases().some(function (alias) {
      return available.indexOf(normalizeHeader(alias)) >= 0;
    });
  }

  function buildStockImportLocation(station, rack, line, column, addressText) {
    var fromParts = buildLocationFromParts(station, rack, line, column);
    if (fromParts.valid) return fromParts;
    var fromAddress = normalizeLocation(addressText);
    return fromAddress.valid ? fromAddress : { valid: false };
  }

  function stockImportRowMeansNoLocation(station, rack, line, column, addressText, locationStatus) {
    var values = [station, rack, line, column, addressText, locationStatus].map(normalizeText);
    if (values.some(isNoLocationMarker)) return true;
    return ![station, rack, line, column, addressText].some(stockImportLocationValueHasContent);
  }

  function stockImportLocationValueHasContent(value) {
    var text = normalizeText(value);
    return !!text && text !== "-" && text !== "--" && text !== "0";
  }

  function isNoLocationMarker(value) {
    var text = normalizeHeader(value);
    if (!text) return false;
    return [
      "semlocalizacao",
      "semlocalizacaocadastrada",
      "semendereco",
      "semenderecocadastrado",
      "naolocalizado",
      "naolocalizada",
      "naoenderecado",
      "naoenderecada"
    ].indexOf(text) >= 0;
  }

  function dedupeStockRows(sourceType, rows) {
    var grouped = {};
    (rows || []).forEach(function (row) {
      var key = stockPositionOperationalKey(sourceType, row, activeWarehouseCode());
      if (!key) return;
      if (!grouped[key]) {
        grouped[key] = Object.assign({}, row);
        return;
      }
      grouped[key] = Object.assign({}, grouped[key], row);
    });
    return Object.keys(grouped).map(function (key) { return grouped[key]; });
  }

  function stockImportModeLabel(mode) {
    return mode === "CARGA_PARCIAL" ? "carga parcial" : "carga completa";
  }

  async function saveStockImportBatch(sourceType, fileName, parsed, importMode) {
    importMode = importMode === "CARGA_PARCIAL" ? "CARGA_PARCIAL" : "CARGA_COMPLETA";
    var batchId = randomId("stock-batch");
    var now = nowIso();
    var warehouseCode = activeWarehouseCode();
    var requestId = createIdempotencyKey([warehouseCode, "BASE-ESTOQUE", sourceType, fileName || "", parsed.rows.length, parsed.ignored]);
    var batch = {
      id: batchId,
      created_at: now,
      warehouse_code: warehouseCode,
      source_type: sourceType,
      file_name: fileName || "",
      imported_by_id: authState.currentUser ? authState.currentUser.id : "",
      imported_by_name: authState.currentUser ? (authState.currentUser.name || authState.currentUser.username) : "",
      total_rows: parsed.rows.length + parsed.ignored,
      imported_rows: 0,
      ignored_rows: parsed.ignored,
      error_rows: parsed.errors.length,
      status: "PROCESSING",
      notes: "",
      updated_at: now,
      finished_at: null,
      error_message: "",
      import_mode: importMode,
      negative_rows: 0,
      alert_rows: 0,
      idempotency_key: requestId,
      request_id: requestId
    };
    await closeInterruptedStockImportBatches(sourceType, 10);
    var batchResponse = await insertStockBatchWithFallback(batch);
    if (batchResponse.error) throw batchResponse.error;
    updateLocalStockBatchProgress(batchId, batch);
    try {
      var currentRows = await fetchActiveStockPositions(sourceType);
      setStatus("stockImportStatus", "Base atual carregada. Preparando gravacao no Supabase...", "warning");
      var currentByKey = {};
      var duplicateActiveIds = {};
      currentRows.forEach(function (position) {
        var key = stockPositionOperationalKey(sourceType, position, warehouseCode);
        if (!key) return;
        if (!currentByKey[key]) currentByKey[key] = position;
        else duplicateActiveIds[position.id] = true;
      });
      var incomingKeys = {};
      var upsertRows = [];
      var unlocatedSkuKeys = sourceType === "CAPTACAO" ? stockImportSkuKeysWithoutLocation(parsed.rows) : [];
      var unlocatedSkuKeySet = {};
      unlocatedSkuKeys.forEach(function (key) { unlocatedSkuKeySet[key] = true; });
      var metrics = { inserted: 0, updated: 0, unchanged: 0, deactivated: 0, negative: 0, alertRows: 0, unlocatedBindingsRemoved: 0, changedSkus: [] };
      parsed.rows.forEach(function (row, index) {
        var key = stockPositionOperationalKey(sourceType, row, warehouseCode);
        if (!key) return;
        row.recordHash = calculateStockRecordHash(row, sourceType);
        incomingKeys[key] = true;
        if (Number(row.totalDisponivel || 0) < 0) metrics.negative += 1;
        var current = currentByKey[key];
        if (current && !stockPositionChanged(current, row, sourceType)) {
          metrics.unchanged += 1;
          return;
        }
        if (current) metrics.updated += 1;
        else metrics.inserted += 1;
        metrics.changedSkus.push(normalizeSku(row.codigoMaterial));
        upsertRows.push(toDbStockPosition(Object.assign({}, row, {
          id: current ? current.id : "stock-" + batchId + "-" + index,
          batchId: batchId,
          lastSeenBatchId: batchId,
          sourceType: sourceType,
          warehouseCode: warehouseCode,
          active: true,
          createdAt: current ? (current.createdAt || now) : now,
          updatedAt: now
        })));
      });
      updateLocalStockBatchProgress(batchId, {
        imported_rows: metrics.unchanged,
        inserted_rows: metrics.inserted,
        updated_rows: metrics.updated,
        unchanged_rows: metrics.unchanged,
        negative_rows: metrics.negative,
        notes: "Comparacao concluida. Gravando alteracoes no Supabase..."
      });
      if (upsertRows.length) {
        setStatus("stockImportStatus", "Gravando " + upsertRows.length + " item(ns) alterado(s) no Supabase...", "warning");
        await upsertStockPositionRows(upsertRows, function (progress) {
          setStatus("stockImportStatus", "Gravando " + progress.processed + " de " + progress.total + " item(ns) alterado(s) no Supabase...", "warning");
          updateLocalStockBatchProgress(batchId, {
            imported_rows: metrics.unchanged + progress.processed,
            inserted_rows: metrics.inserted,
            updated_rows: metrics.updated,
            unchanged_rows: metrics.unchanged,
            negative_rows: metrics.negative,
            notes: "Gravando " + progress.processed + " de " + progress.total + " item(ns) alterado(s)."
          });
        });
      }
      var deactivatedPositions = currentRows.filter(function (position) {
        var skuKey = normalizeSkuKey(position.codigoMaterial);
        var becameUnlocated = unlocatedSkuKeySet[skuKey] && stockPositionLocation(position);
        return duplicateActiveIds[position.id] || becameUnlocated || (importMode === "CARGA_COMPLETA" && !incomingKeys[stockPositionOperationalKey(sourceType, position, warehouseCode)]);
      });
      deactivatedPositions.forEach(function (position) { metrics.changedSkus.push(normalizeSku(position.codigoMaterial)); });
      var deactivatedIds = deactivatedPositions.map(function (position) { return position.id; }).filter(Boolean);
      metrics.deactivated = deactivatedIds.length;
      if (deactivatedIds.length) {
        setStatus("stockImportStatus", "Inativando " + deactivatedIds.length + " registro(s) fora da carga atual...", "warning");
        await updateStockRowsByIds(deactivatedIds, { active: false, updated_at: now, batch_id: batchId });
      }
      setStatus("stockImportStatus", "Validando localizacoes antigas e alertas da base...", "warning");
      metrics.unlocatedBindingsRemoved = await clearBindingsForUnlocatedStockImport(sourceType, parsed.rows, warehouseCode, batchId, now);
      metrics.alertRows = await generateNegativeStockAlerts(warehouseCode, sourceType, batchId, now);
      setStatus("stockImportStatus", "Finalizando lote da importacao...", "warning");
      updateLocalStockBatchProgress(batchId, {
        imported_rows: parsed.rows.length,
        deactivated_rows: metrics.deactivated,
        alert_rows: metrics.alertRows,
        notes: "Finalizando lote da importacao..."
      });
      await updateStockBatchMetrics(batchId, Object.assign({}, metrics, {
        importedRows: parsed.rows.length,
        ignoredRows: parsed.ignored,
        errorRows: parsed.errors.length,
        status: "COMPLETED",
        importMode: importMode,
        notes: "Importacao incremental " + stockSourceLabel(sourceType) + " (" + stockImportModeLabel(importMode) + "): " + metrics.inserted + " novo(s), " + metrics.updated + " atualizado(s), " + metrics.unchanged + " igual(is), " + metrics.deactivated + " inativado(s), " + metrics.negative + " negativo(s), " + metrics.unlocatedBindingsRemoved + " vinculo(s) sem localizacao removido(s)."
      }));
      updateLocalStockBatchProgress(batchId, {
        imported_rows: parsed.rows.length,
        inserted_rows: metrics.inserted,
        updated_rows: metrics.updated,
        unchanged_rows: metrics.unchanged,
        deactivated_rows: metrics.deactivated,
        negative_rows: metrics.negative,
        alert_rows: metrics.alertRows,
        ignored_rows: parsed.ignored,
        error_rows: parsed.errors.length,
        status: "COMPLETED",
        updated_at: nowIso(),
        finished_at: nowIso(),
        notes: "Importacao concluida."
      });
      return metrics;
    } catch (error) {
      try {
        updateLocalStockBatchProgress(batchId, {
          status: "FAILED",
          notes: formatSupabaseError(error),
          error_message: formatSupabaseError(error),
          finished_at: nowIso(),
          updated_at: nowIso()
        });
        await updateRowWithSchemaFallback("wms_stock_import_batches", "id", batchId, {
          status: "FAILED",
          notes: formatSupabaseError(error),
          error_message: formatSupabaseError(error),
          finished_at: nowIso(),
          updated_at: nowIso(),
          imported_rows: Math.max(0, Number((stockState.batches.find(function (batch) { return batch.id === batchId; }) || {}).imported_rows || 0))
        });
      } catch (statusError) {
        recordPerformanceError("stock-batch-failed-status", statusError);
      }
      throw error;
    }
  }

  async function insertStockBatchWithFallback(batch) {
    var payload = Object.assign({}, batch);
    var attemptedMissingColumns = {};
    var response = await runSupabaseRequestWithRetry("insert-stock-batch", function () {
      return supabaseDb.from("wms_stock_import_batches").insert(payload);
    });
    while (response.error && isMissingColumnError(response.error)) {
      var missingColumn = getMissingColumnName(response.error);
      if (!missingColumn || attemptedMissingColumns[missingColumn]) break;
      attemptedMissingColumns[missingColumn] = true;
      delete payload[missingColumn];
      response = await runSupabaseRequestWithRetry("insert-stock-batch", function () {
        return supabaseDb.from("wms_stock_import_batches").insert(payload);
      });
    }
    return response;
  }

  async function closeInterruptedStockImportBatches(sourceType, minAgeMinutes) {
    try {
      var cutoff = new Date(Date.now() - Math.max(1, Number(minAgeMinutes || 10)) * 60000).toISOString();
      var response = await runSupabaseRequestWithRetry("select-interrupted-stock-batches", function () {
        return supabaseDb
          .from("wms_stock_import_batches")
          .select("id")
          .eq("warehouse_code", activeWarehouseCode())
          .eq("source_type", sourceType)
          .eq("status", "PROCESSING")
          .lt("created_at", cutoff)
          .limit(20);
      });
      if (response.error) throw response.error;
      var ids = (response.data || []).map(function (row) { return row.id; }).filter(Boolean);
      if (!ids.length) return 0;
      var now = nowIso();
      var updateResponse = await runSupabaseRequestWithRetry("close-interrupted-stock-batches", function () {
        return supabaseDb
          .from("wms_stock_import_batches")
          .update({
            status: "FAILED",
            notes: "Lote encerrado automaticamente antes de nova importacao. A base ativa anterior foi preservada.",
            error_message: "Importacao interrompida antes de finalizar.",
            updated_at: now,
            finished_at: now
          })
          .in("id", ids);
      });
      if (updateResponse.error) throw updateResponse.error;
      return ids.length;
    } catch (error) {
      recordPerformanceError("stock-close-interrupted-batches", error);
      return 0;
    }
  }

  async function upsertStockPositionRows(rows, onProgress) {
    var payload = rows.map(function (row) { return Object.assign({}, row); });
    var attemptedMissingColumns = {};
    while (true) {
      try {
        await upsertInChunks("wms_stock_positions", payload, "id", onProgress);
        return;
      } catch (error) {
        if (!isMissingColumnError(error)) throw error;
        var missingColumn = getMissingColumnName(error);
        if (!missingColumn || attemptedMissingColumns[missingColumn]) throw error;
        attemptedMissingColumns[missingColumn] = true;
        payload.forEach(function (row) { delete row[missingColumn]; });
      }
    }
  }

  async function clearBindingsForUnlocatedStockImport(sourceType, rows, warehouseCode, batchId, now) {
    if (sourceType !== "CAPTACAO") return 0;
    var clearSkuKeys = stockImportSkuKeysWithoutLocation(rows);
    if (!clearSkuKeys.length) return 0;
    var clearSet = {};
    clearSkuKeys.forEach(function (key) { clearSet[key] = true; });
    var removedBindings = state.bindings.filter(function (binding) {
      if (!bindingMatchesWarehouseCode(binding, warehouseCode)) return false;
      return skuCandidateKeys(binding.sku).some(function (key) { return clearSet[key]; });
    });
    if (!removedBindings.length) return 0;
    var remoteIds = await fetchBindingIdsForSkuKeySet(warehouseCode, clearSet);
    var removeIds = unique(removedBindings.map(function (binding) { return binding.id; }).concat(remoteIds).filter(Boolean));
    if (removeIds.length) await deleteBindingsByIds(removeIds);
    var removeIdSet = {};
    removeIds.forEach(function (id) { removeIdSet[id] = true; });
    state.bindings = state.bindings.filter(function (binding) {
      return !removeIdSet[binding.id];
    });
    var removedSkuList = unique(removedBindings.map(function (binding) { return normalizeSku(binding.sku); }).filter(Boolean));
    var sample = removedSkuList.slice(0, 12).join(", ");
    var details = removedBindings.length + " vinculo(s) antigo(s) removido(s) porque a base de captacao importada marcou o SKU sem localizacao no estoque " + normalizeWarehouseCode(warehouseCode) + ".";
    if (sample) details += " SKUs: " + sample + (removedSkuList.length > 12 ? "..." : "") + ".";
    var historyItem = createHistoryItem("Endereco removido pela base", removedSkuList.length === 1 ? removedSkuList[0] : "", "", details);
    state.history.push(historyItem);
    if (state.history.length > 1000) state.history = state.history.slice(state.history.length - 1000);
    if (historySchemaAvailable) {
      try {
        var historyPayload = toDbHistory(historyItem);
        var historyResponse = await supabaseDb.from("wms_history").upsert(historyPayload, { onConflict: "id" });
        if (historyResponse.error && isMissingWarehouseColumnError(historyResponse.error)) {
          assertWarehouseFallbackAllowed("wms_history", historyResponse.error);
          historyResponse = await supabaseDb.from("wms_history").upsert(stripWarehouseColumns(historyPayload), { onConflict: "id" });
        }
        if (historyResponse.error && !isHistorySchemaError(historyResponse.error)) throw historyResponse.error;
        if (historyResponse.error) historySchemaAvailable = false;
      } catch (error) {
        if (!isHistorySchemaError(error)) throw error;
        historySchemaAvailable = false;
      }
    }
    await writeModuleCache("coreData", {
      bindings: state.bindings,
      products: state.products
    });
    invalidateStockCacheForWarehouseSource(warehouseCode, sourceType, removedSkuList);
    return removedBindings.length;
  }

  function stockImportSkuKeysWithoutLocation(rows) {
    var signals = {};
    (rows || []).forEach(function (row) {
      var key = normalizeSkuKey(row && row.codigoMaterial);
      if (!key) return;
      if (!signals[key]) signals[key] = { hasLocation: false, noLocation: false };
      if (normalizeText(row.codigoEndereco)) signals[key].hasLocation = true;
      if (row.semLocalizacao === true) signals[key].noLocation = true;
    });
    return Object.keys(signals).filter(function (key) {
      return signals[key].noLocation && !signals[key].hasLocation;
    });
  }

  function bindingMatchesWarehouseCode(binding, warehouseCode) {
    var wanted = normalizeWarehouseCode(warehouseCode || activeWarehouseCode());
    var rawCode = rawWarehouseCodeValue(binding);
    if (rawCode) return normalizeWarehouseCode(rawCode) === wanted;
    return wanted === activeWarehouseCode() && !isMultiWarehouseMode();
  }

  async function deleteBindingsByIds(ids) {
    var size = 80;
    for (var i = 0; i < ids.length;) {
      var chunk = ids.slice(i, i + size);
      var response = await runSupabaseRequestWithRetry("delete-bindings", function () {
        return supabaseDb.from("wms_bindings").delete().in("id", chunk);
      });
      if (response.error && isSupabaseTransientNetworkError(response.error) && size > 20) {
        size = smallerSupabaseChunkSize(size);
        continue;
      }
      if (response.error) throw response.error;
      i += chunk.length;
    }
  }

  async function fetchBindingIdsForSkuKeySet(warehouseCode, clearSet) {
    try {
      var rows = await fetchWarehouseRows("wms_bindings", "created_at", false);
      return (rows || []).filter(function (row) {
        if (!bindingMatchesWarehouseCode(row, warehouseCode)) return false;
        return skuCandidateKeys(row.sku).some(function (key) { return clearSet[key]; });
      }).map(function (row) { return row.id; }).filter(Boolean);
    } catch (error) {
      recordPerformanceError("stock-unlocated-bindings-fetch", error);
      return [];
    }
  }

  async function generateNegativeStockAlerts(warehouseCode, sourceType, batchId, now) {
    try {
      var positions = await fetchActiveStockPositions("CAPTACAO");
      var grouped = groupStockPositionsBySku(positions);
      var activeNegativeSkus = {};
      var rows = Object.keys(grouped).map(function (sku) {
        var group = grouped[sku] || [];
        var captacaoPositions = group.filter(function (item) { return item.sourceType === "CAPTACAO"; });
        var captacao = aggregateStockPositions(captacaoPositions);
        var captacaoSaldo = Number(captacao.totalDisponivel || 0);
        var alertType = "";
        if (captacaoSaldo < 0) alertType = "CAPTACAO_NEGATIVA";
        if (!alertType) return null;
        activeNegativeSkus[sku] = true;
        var captureLocation = captacaoPositions.filter(function (item) { return item.codigoEndereco || stockPositionLocation(item); })[0] || null;
        return {
          id: "stock-alert-" + normalizeWarehouseCode(warehouseCode) + "-" + sku,
          created_at: now,
          updated_at: now,
          warehouse_code: normalizeWarehouseCode(warehouseCode),
          source_type: sourceType || "",
          alert_type: alertType,
          codigo_material: sku,
          nome_material: captacao.nomeMaterial || "",
          saldo_loja: 0,
          saldo_captacao: captacaoSaldo,
          localizacao_captacao: captureLocation ? stockPositionLocation(captureLocation) : "",
          batch_id: batchId || "",
          active: true
        };
      }).filter(Boolean);
      if (rows.length) await upsertStockAlertsWithFallback(rows);
      await deactivateResolvedStockAlerts(warehouseCode, activeNegativeSkus, now);
      return rows.length;
    } catch (error) {
      if (isMissingTransferTableError(error) || isMissingColumnError(error)) {
        recordPerformanceError("stock-negative-alerts-schema", error);
        return 0;
      }
      throw error;
    }
  }

  async function upsertStockAlertsWithFallback(rows) {
    var payload = rows.map(function (row) { return Object.assign({}, row); });
    var attemptedMissingColumns = {};
    while (true) {
      try {
        await upsertInChunks("wms_stock_alerts", payload, "id");
        return;
      } catch (error) {
        if (isMissingTransferTableError(error)) throw error;
        if (!isMissingColumnError(error)) throw error;
        var missingColumn = getMissingColumnName(error);
        if (!missingColumn || attemptedMissingColumns[missingColumn]) throw error;
        attemptedMissingColumns[missingColumn] = true;
        payload.forEach(function (row) { delete row[missingColumn]; });
      }
    }
  }

  async function deactivateResolvedStockAlerts(warehouseCode, activeNegativeSkus, now) {
    var response = await runSupabaseRequestWithRetry("select-stock-alerts", function () {
      return supabaseDb
        .from("wms_stock_alerts")
        .select("id,codigo_material")
        .eq("warehouse_code", normalizeWarehouseCode(warehouseCode))
        .eq("active", true);
    });
    if (response.error) throw response.error;
    var resolvedIds = (response.data || []).filter(function (row) {
      return !activeNegativeSkus[normalizeSku(row.codigo_material || "")];
    }).map(function (row) { return row.id; }).filter(Boolean);
    if (!resolvedIds.length) return;
    await updateStockAlertsByIds(resolvedIds, { active: false, resolved_at: now, updated_at: now });
  }

  async function updateStockAlertsByIds(ids, payload) {
    var size = 80;
    for (var i = 0; i < ids.length;) {
      var chunk = ids.slice(i, i + size);
      var response = await runSupabaseRequestWithRetry("update-stock-alerts", function () {
        return supabaseDb.from("wms_stock_alerts").update(payload).in("id", chunk);
      });
      if (response.error && isSupabaseTransientNetworkError(response.error) && size > 20) {
        size = smallerSupabaseChunkSize(size);
        continue;
      }
      if (response.error) throw response.error;
      i += chunk.length;
    }
  }

  async function updateStockRowsByIds(ids, payload) {
    var size = 80;
    for (var i = 0; i < ids.length;) {
      var chunk = ids.slice(i, i + size);
      var response = await runSupabaseRequestWithRetry("update-stock-positions", function () {
        return supabaseDb
          .from("wms_stock_positions")
          .update(payload)
          .in("id", chunk);
      });
      if (response.error && isSupabaseTransientNetworkError(response.error) && size > 20) {
        size = smallerSupabaseChunkSize(size);
        continue;
      }
      if (response.error) throw response.error;
      i += chunk.length;
    }
  }

  async function updateStockBatchMetrics(batchId, metrics) {
    var payload = {
      imported_rows: Number(metrics.importedRows || 0),
      inserted_rows: Number(metrics.inserted || 0),
      updated_rows: Number(metrics.updated || 0),
      unchanged_rows: Number(metrics.unchanged || 0),
      deactivated_rows: Number(metrics.deactivated || 0),
      negative_rows: Number(metrics.negative || 0),
      alert_rows: Number(metrics.alertRows || 0),
      ignored_rows: Number(metrics.ignoredRows || 0),
      error_rows: Number(metrics.errorRows || 0),
      status: metrics.status || "COMPLETED",
      notes: metrics.notes || "",
      import_mode: metrics.importMode || "",
      updated_at: nowIso(),
      finished_at: metrics.status === "PROCESSING" ? null : nowIso(),
      error_message: metrics.errorMessage || ""
    };
    var response = await runSupabaseRequestWithRetry("update-stock-batch", function () {
      return supabaseDb.from("wms_stock_import_batches").update(payload).eq("id", batchId);
    });
    var attemptedMissingColumns = {};
    while (response.error && isMissingColumnError(response.error)) {
      var missingColumn = getMissingColumnName(response.error);
      if (!missingColumn || attemptedMissingColumns[missingColumn]) break;
      attemptedMissingColumns[missingColumn] = true;
      delete payload[missingColumn];
      response = await runSupabaseRequestWithRetry("update-stock-batch", function () {
        return supabaseDb.from("wms_stock_import_batches").update(payload).eq("id", batchId);
      });
    }
    if (response.error) throw response.error;
  }

  function invalidateStockCacheForWarehouseSource(warehouseCode, sourceType, skus) {
    var warehouse = normalizeWarehouseCode(warehouseCode || activeWarehouseCode());
    var source = normalizeText(sourceType || "").toUpperCase();
    var skuList = unique((skus || []).map(normalizeSku).filter(Boolean));
    if (!skuList.length) {
      Object.keys(stockState.positionCache || {}).forEach(function (key) {
        if (key.indexOf(warehouse + ":" + source + ":") === 0 || key.indexOf(warehouse + ":ALL:") === 0) delete stockState.positionCache[key];
      });
      return;
    }
    skuList.forEach(function (sku) {
      delete stockState.positionCache[stockCacheKey(warehouse, source, sku)];
      delete stockState.positionCache[stockCacheKey(warehouse, "ALL", sku)];
    });
  }

  function stockPositionOperationalKey(sourceType, row, warehouseCode) {
    var sku = normalizeSku(row && (row.codigoMaterial || row.codigo_material || row.sku) || "");
    if (!sku) return "";
    var normalizedSource = normalizeText(sourceType || row.sourceType || row.source_type || "").toUpperCase() || "CAPTACAO";
    var parts = [normalizeWarehouseCode(warehouseCode || row.warehouseCode || row.warehouse_code || activeWarehouseCode()), normalizedSource, sku];
    if (normalizedSource === "CAPTACAO") {
      parts.push(normalizeHeader(row.estacao || ""));
      parts.push(normalizeHeader(row.rack || ""));
      parts.push(normalizeHeader(row.linha || ""));
      parts.push(normalizeHeader(row.coluna || ""));
      parts.push(normalizeHeader(row.codigoEndereco || row.codigo_endereco || ""));
    }
    return parts.join("|");
  }

  function calculateStockRecordHash(row, sourceType) {
    var comparable = stockPositionComparable(row, sourceType);
    var hash = 2166136261;
    for (var i = 0; i < comparable.length; i += 1) {
      hash ^= comparable.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return ("00000000" + (hash >>> 0).toString(16)).slice(-8);
  }

  function stockPositionComparable(row, sourceType) {
    var normalizedSource = normalizeText(sourceType || row && (row.sourceType || row.source_type) || "").toUpperCase();
    var common = [
      normalizeSku(row && (row.codigoMaterial || row.codigo_material || row.sku) || ""),
      normalizeText(row && (row.nomeMaterial || row.nome_material || "")).toUpperCase(),
      normalizeDecimalForCompare(row && (row.totalDisponivel !== undefined ? row.totalDisponivel : row.total_disponivel))
    ];
    if (normalizedSource === "LOJA") return common.join("|");
    return common.concat([
      normalizeDecimalForCompare(row && (row.totalFisico !== undefined ? row.totalFisico : row.total_fisico)),
      normalizeDecimalForCompare(row && (row.totalAlocado !== undefined ? row.totalAlocado : row.total_alocado)),
      normalizeHeader(row && row.estacao || ""),
      normalizeHeader(row && row.rack || ""),
      normalizeHeader(row && row.linha || ""),
      normalizeHeader(row && row.coluna || ""),
      normalizeHeader(row && (row.codigoEndereco || row.codigo_endereco || "")),
      row && row.isSellable === true ? "1" : "0"
    ]).join("|");
  }

  function normalizeDecimalForCompare(value) {
    var number = Number(value || 0);
    return Number.isFinite(number) ? number.toFixed(4) : "0.0000";
  }

  function stockPositionChanged(current, incoming) {
    var sourceType = incoming.sourceType || current.sourceType || "";
    var incomingHash = incoming.recordHash || calculateStockRecordHash(incoming, sourceType);
    var currentHash = current.recordHash || calculateStockRecordHash(current, sourceType);
    return incomingHash !== currentHash;
  }

  function toDbStockPosition(item) {
    return {
      id: item.id,
      created_at: item.createdAt || nowIso(),
      updated_at: item.updatedAt || nowIso(),
      warehouse_code: normalizeWarehouseCode(item.warehouseCode || activeWarehouseCode()),
      source_type: item.sourceType || "CAPTACAO",
      batch_id: item.batchId || "",
      codigo_material: normalizeSku(item.codigoMaterial || ""),
      nome_material: item.nomeMaterial || "",
      total_fisico: Number(item.totalFisico || 0),
      total_alocado: Number(item.totalAlocado || 0),
      total_disponivel: Number(item.totalDisponivel || 0),
      estacao: item.estacao || "",
      rack: item.rack || "",
      linha: item.linha || "",
      coluna: item.coluna || "",
      codigo_endereco: item.codigoEndereco || "",
      active: item.active !== false,
      is_sellable: item.isSellable === true,
      record_hash: item.recordHash || calculateStockRecordHash(item, item.sourceType || "CAPTACAO"),
      last_seen_batch_id: item.lastSeenBatchId || item.batchId || ""
    };
  }

  function fromDbStockPosition(row) {
    return {
      id: row.id,
      warehouseCode: row.warehouse_code || activeWarehouseCode(),
      sourceType: row.source_type || "",
      batchId: row.batch_id || "",
      codigoMaterial: normalizeSku(row.codigo_material || ""),
      nomeMaterial: row.nome_material || "",
      totalFisico: Number(row.total_fisico || 0),
      totalAlocado: Number(row.total_alocado || 0),
      totalDisponivel: Number(row.total_disponivel || 0),
      estacao: row.estacao || "",
      rack: row.rack || "",
      linha: row.linha || "",
      coluna: row.coluna || "",
      codigoEndereco: row.codigo_endereco || "",
      active: row.active === true,
      isSellable: row.is_sellable === true,
      recordHash: row.record_hash || "",
      lastSeenBatchId: row.last_seen_batch_id || "",
      createdAt: row.created_at || "",
      updatedAt: row.updated_at || ""
    };
  }

  async function getStockPositionsForSkus(skus, warehouseCode) {
    var warehouse = normalizeWarehouseCode(warehouseCode || activeWarehouseCode());
    var cleanSkus = unique((skus || []).map(normalizeSku).filter(Boolean));
    if (!cleanSkus.length || !isSupabaseReady()) return [];
    var missing = cleanSkus.filter(function (sku) {
      return !stockState.positionCache[stockCacheKey(warehouse, "CAPTACAO", sku)] || !stockState.positionCache[stockCacheKey(warehouse, "LOJA", sku)];
    });
    if (missing.length) {
      var response = await supabaseDb
        .from("wms_stock_positions")
        .select(stockPositionSelectColumns())
        .eq("warehouse_code", warehouse)
        .eq("active", true)
        .in("source_type", ["CAPTACAO", "LOJA"])
        .in("codigo_material", missing)
        .limit(Math.max(1000, missing.length * 4));
      if (response.error && isMissingColumnError(response.error)) {
        response = await supabaseDb
          .from("wms_stock_positions")
          .select(stockPositionLegacySelectColumns())
          .eq("warehouse_code", warehouse)
          .eq("active", true)
          .in("source_type", ["CAPTACAO", "LOJA"])
          .in("codigo_material", missing)
          .limit(Math.max(1000, missing.length * 4));
      }
      if (response.error) throw response.error;
      missing.forEach(function (sku) {
        stockState.positionCache[stockCacheKey(warehouse, "CAPTACAO", sku)] = [];
        stockState.positionCache[stockCacheKey(warehouse, "LOJA", sku)] = [];
      });
      (response.data || []).map(fromDbStockPosition).forEach(function (position) {
        var key = stockCacheKey(warehouse, position.sourceType, position.codigoMaterial);
        if (!stockState.positionCache[key]) stockState.positionCache[key] = [];
        stockState.positionCache[key].push(position);
      });
    }
    return cleanSkus.reduce(function (all, sku) {
      return all
        .concat(stockState.positionCache[stockCacheKey(warehouse, "CAPTACAO", sku)] || [])
        .concat(stockState.positionCache[stockCacheKey(warehouse, "LOJA", sku)] || []);
    }, []);
  }

  function stockCacheKey(warehouseCode, sourceType, sku) {
    return normalizeWarehouseCode(warehouseCode || activeWarehouseCode()) + ":" + normalizeText(sourceType || "ALL").toUpperCase() + ":" + normalizeSku(sku);
  }

  async function getStockSuggestion(sku, requestedQty) {
    var positions = await getStockPositionsForSkus([sku]);
    return buildStockSuggestion(sku, requestedQty, positions);
  }

  async function getTransferStockSuggestion(args) {
    args = args || {};
    var warehouse = normalizeWarehouseCode(args.warehouse_code || args.warehouseCode || activeWarehouseCode());
    var items = args.items || [];
    var skus = unique(items.map(function (item) {
      return normalizeSku(item.codigo_material || item.codigoMaterial || item.sku || "");
    }).filter(Boolean));
    if (!skus.length || !isSupabaseReady()) return [];
    var positions = await getStockPositionsForSkus(skus, warehouse);
    var grouped = {};
    positions.forEach(function (position) {
      var key = position.codigoMaterial || "";
      if (!key) return;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(position);
    });
    return items.map(function (item) {
      var sku = normalizeSku(item.codigo_material || item.codigoMaterial || item.sku || "");
      var requested = Number(item.quantidade_solicitada !== undefined ? item.quantidade_solicitada : item.requestedQty || item.quantity || 0);
      return buildStockSuggestion(sku, requested, grouped[sku] || [], warehouse);
    });
  }

  async function getReplenishmentSuggestion(sku, warehouseCode) {
    if (warehouseCode && normalizeWarehouseCode(warehouseCode) !== activeWarehouseCode()) throw new Error("Estoque da consulta diferente do estoque ativo.");
    return getStockSuggestion(sku, 0);
  }

  function buildStockSuggestion(sku, requestedQty, positions, warehouseCode) {
    sku = normalizeSku(sku);
    var captacaoPositions = (positions || []).filter(function (item) { return item.sourceType === "CAPTACAO"; });
    var lojaPositions = (positions || []).filter(function (item) { return item.sourceType === "LOJA"; });
    var captacao = aggregateStockPositions(captacaoPositions);
    var loja = aggregateStockPositions(lojaPositions);
    var captureLocation = captacaoPositions.filter(function (item) { return item.codigoEndereco || stockPositionLocation(item); }).sort(function (a, b) {
      return Number(b.totalDisponivel || 0) - Number(a.totalDisponivel || 0);
    })[0] || null;
    var needed = Number(requestedQty || 0);
    var productName = captacao.nomeMaterial || loja.nomeMaterial || findProductName(sku) || "";
    if (!captacaoPositions.length) {
      var storeOnlyAvailable = Number(loja.totalDisponivel || 0);
      var storeOnlyUsable = Math.max(0, storeOnlyAvailable);
      var storeOnlyQty = needed > 0 ? Math.min(needed, storeOnlyUsable) : 0;
      var storeOnlyShortage = needed > 0 ? Math.max(0, needed - storeOnlyQty) : 0;
      var storeOnlyOrigin = storeOnlyQty > 0 ? "LOJA" : "SEM_SALDO";
      return {
        sku: sku,
        name: productName || findProductName(sku) || "",
        baseFound: lojaPositions.length > 0,
        captureFound: false,
        storeFound: lojaPositions.length > 0,
        storePhysical: lojaPositions.length ? loja.totalFisico : 0,
        storeAllocated: lojaPositions.length ? loja.totalAlocado : 0,
        storeAvailable: storeOnlyAvailable,
        capturePhysical: 0,
        captureAllocated: 0,
        captureAvailable: 0,
        operationalTotal: storeOnlyAvailable,
        rupture: storeOnlyShortage > 0,
        captureLocation: "",
        officialLocation: "",
        originSuggested: storeOnlyOrigin,
        suggestedCaptureQty: 0,
        suggestedStoreQty: storeOnlyQty,
        quantityShortage: storeOnlyShortage,
        suggestedReplenishmentQty: 0,
        stockAlert: storeOnlyShortage > 0,
        alertMessage: storeOnlyShortage > 0 ? "Saldo Loja insuficiente e CAPTAÇÃO zerada. Faltam " + formatQty(storeOnlyShortage) + " un." : "Retirar da Loja. CAPTAÇÃO zerada.",
        operationalMessage: storeOnlyShortage > 0 ? "Saldo insuficiente para atender a transferência." : "Retirar da Loja.",
        sellable: loja.isSellable
      };
    }
    var captureAvailable = Number(captacao.totalDisponivel || 0);
    var storeAvailable = Number(loja.totalDisponivel || 0);
    var operationalTotal = captureAvailable + storeAvailable;
    var captureUsable = Math.max(0, captureAvailable);
    var storeUsable = Math.max(0, storeAvailable);
    var captureQty = needed > 0 ? Math.min(needed, captureUsable) : 0;
    var storeQty = needed > 0 ? Math.min(Math.max(0, needed - captureQty), storeUsable) : 0;
    var shortage = needed > 0 ? Math.max(0, needed - captureQty - storeQty) : 0;
    var originSuggested = "SEM_SALDO";
    if (needed <= 0) {
      originSuggested = captureAvailable > 0 ? "CAPTACAO" : storeAvailable > 0 ? "LOJA" : "SEM_SALDO";
    } else if (captureQty > 0 && storeQty > 0) {
      originSuggested = "CAPTACAO_E_LOJA";
    } else if (captureQty > 0) {
      originSuggested = "CAPTACAO";
    } else if (storeQty > 0) {
      originSuggested = "LOJA";
    } else if (captureAvailable <= 0) {
      originSuggested = "SEM_SALDO_CAPTACAO";
    }
    var location = captureLocation ? stockPositionLocation(captureLocation) : "";
    var hasNegative = captureAvailable < 0;
    var suggestionQty = 0;
    var alertMessage = hasNegative ? "Saldo CAPTAÇÃO negativo para este SKU." : shortage > 0 ? "Saldo CAPTAÇÃO/Loja insuficiente. Faltam " + formatQty(shortage) + " un." : !location && captureQty > 0 ? "Produto encontrado na CAPTAÇÃO sem localização." : storeQty > 0 && captureQty <= 0 ? "Retirar da Loja. CAPTAÇÃO zerada." : storeQty > 0 ? "Completar retirada pela Loja." : needed <= 0 ? "Produto encontrado na CAPTAÇÃO. Verifique a quantidade necessária." : "";
    return {
      sku: sku,
      baseFound: true,
      captureFound: true,
      storeFound: lojaPositions.length > 0,
      name: productName,
      storePhysical: lojaPositions.length ? loja.totalFisico : 0,
      storeAllocated: lojaPositions.length ? loja.totalAlocado : 0,
      storeAvailable: storeAvailable,
      capturePhysical: captacao.totalFisico,
      captureAllocated: captacao.totalAlocado,
      captureAvailable: captacao.totalDisponivel,
      operationalTotal: operationalTotal,
      rupture: shortage > 0,
      captureLocation: location,
      captureStation: captureLocation ? captureLocation.estacao : "",
      captureRack: captureLocation ? captureLocation.rack : "",
      captureLine: captureLocation ? captureLocation.linha : "",
      captureColumn: captureLocation ? captureLocation.coluna : "",
      officialLocation: "",
      originSuggested: originSuggested,
      suggestedCaptureQty: captureQty,
      suggestedStoreQty: storeQty,
      quantityShortage: shortage,
      suggestedReplenishmentQty: suggestionQty,
      stockAlert: shortage > 0 || hasNegative || (captureQty > 0 && !location) || originSuggested === "SEM_SALDO_CAPTACAO",
      alertMessage: alertMessage,
      operationalMessage: alertMessage || "Retirar da CAPTAÇÃO.",
      sellable: captacao.isSellable
    };
  }

  function aggregateStockPositions(items) {
    return (items || []).reduce(function (acc, item) {
      acc.totalFisico += Number(item.totalFisico || 0);
      acc.totalAlocado += Number(item.totalAlocado || 0);
      acc.totalDisponivel += Number(item.totalDisponivel || 0);
      acc.nomeMaterial = acc.nomeMaterial || item.nomeMaterial || "";
      acc.isSellable = acc.isSellable || item.isSellable === true;
      return acc;
    }, { totalFisico: 0, totalAlocado: 0, totalDisponivel: 0, nomeMaterial: "", isSellable: false });
  }

  function stockPositionLocation(item) {
    if (!item) return "";
    if (item.codigoEndereco) return item.codigoEndereco;
    var built = buildLocationFromParts(item.estacao, item.rack, item.linha, item.coluna);
    return built.valid ? built.code : "";
  }

  function isSellableStockProduct(name) {
    var text = normalizeText(name).toUpperCase();
    return /\b(ML|G|GR|GRS|KG|MG|L|LT|LITRO|LITROS)\b/.test(text) || /\d+\s*(ML|G|GR|GRS|KG|MG|L|LT)\b/.test(text);
  }

  function stockSourceLabel(sourceType) {
    return sourceType === "LOJA" ? "Loja" : "Captacao";
  }

  async function fetchActiveStockPositions(sourceType) {
    if (!isSupabaseReady()) throw new Error("Supabase nao conectado.");
    var allRows = [];
    var from = 0;
    var pageSize = 500;
    while (true) {
      var response = await runSupabaseRequestWithRetry("fetch-stock-positions", function () {
        var query = supabaseDb
          .from("wms_stock_positions")
          .select(stockPositionSelectColumns())
          .eq("warehouse_code", activeWarehouseCode())
          .eq("active", true)
          .order("codigo_material", { ascending: true });
        if (sourceType) query = query.eq("source_type", sourceType);
        return query.range(from, from + pageSize - 1);
      });
      if (response.error && isMissingColumnError(response.error)) {
        response = await runSupabaseRequestWithRetry("fetch-stock-positions-legacy", function () {
          var fallbackQuery = supabaseDb
            .from("wms_stock_positions")
            .select(stockPositionLegacySelectColumns())
            .eq("warehouse_code", activeWarehouseCode())
            .eq("active", true)
            .order("codigo_material", { ascending: true });
          if (sourceType) fallbackQuery = fallbackQuery.eq("source_type", sourceType);
          return fallbackQuery.range(from, from + pageSize - 1);
        });
      }
      if (response.error) throw response.error;
      var rows = response.data || [];
      allRows = allRows.concat(rows.map(fromDbStockPosition));
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    return allRows;
  }

  function stockPositionExportRow(position) {
    return {
      Estoque: position.warehouseCode || activeWarehouseCode(),
      Origem: position.sourceType || "",
      "Codigo Material": position.codigoMaterial || "",
      "Nome Material": position.nomeMaterial || "",
      "Total fisico": Number(position.totalFisico || 0),
      "Total alocado": Number(position.totalAlocado || 0),
      "Total disponivel": Number(position.totalDisponivel || 0),
      Estacao: position.estacao || "",
      Rack: position.rack || "",
      Linha: position.linha || "",
      Coluna: position.coluna || "",
      Endereco: stockPositionLocation(position),
      "Produto vendavel": position.isSellable ? "Sim" : "Nao",
      Atualizado: formatDateTime(position.updatedAt || position.createdAt)
    };
  }

  async function getStockAlerts(kind) {
    var positions = await fetchActiveStockPositions("");
    var grouped = {};
    positions.forEach(function (position) {
      var key = position.codigoMaterial || "";
      if (!key) return;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(position);
    });
    return Object.keys(grouped).map(function (sku) {
      var suggestion = buildStockSuggestion(sku, 0, grouped[sku]);
      var classification = classifyReplenishmentSuggestion(suggestion);
      if (!classification) return suggestion;
      return Object.assign({}, suggestion, {
        suggestionType: classification.type,
        suggestionPriority: classification.priority,
        suggestedReplenishmentQty: classification.qty,
        alertMessage: classification.message || suggestion.alertMessage
      });
    }).filter(function (suggestion) {
      if (kind === "SEM_LOCALIZACAO") return !suggestion.captureLocation;
      return suggestion.stockAlert || !suggestion.captureLocation || suggestion.suggestedReplenishmentQty > 0;
    });
  }

  function stockPositionSelectColumns() {
    return "id,warehouse_code,source_type,batch_id,codigo_material,nome_material,total_fisico,total_alocado,total_disponivel,estacao,rack,linha,coluna,codigo_endereco,active,is_sellable,record_hash,last_seen_batch_id,created_at,updated_at";
  }

  function stockPositionLegacySelectColumns() {
    return "id,warehouse_code,source_type,batch_id,codigo_material,nome_material,total_fisico,total_alocado,total_disponivel,estacao,rack,linha,coluna,codigo_endereco,active,is_sellable,created_at,updated_at";
  }

  async function fetchReplenishmentStoreCandidates(filter, offset, limit) {
    var response = await runSupabaseRequestWithRetry("fetch-replenishment-store-candidates", function () {
      return buildReplenishmentStoreCandidatesQuery(filter, stockPositionSelectColumns()).range(offset, offset + limit - 1);
    });
    if (response.error && isMissingColumnError(response.error)) {
      response = await runSupabaseRequestWithRetry("fetch-replenishment-store-candidates-legacy", function () {
        return buildReplenishmentStoreCandidatesQuery(filter, stockPositionLegacySelectColumns()).range(offset, offset + limit - 1);
      });
    }
    if (response.error) throw response.error;
    return (response.data || []).map(fromDbStockPosition);
  }

  function buildReplenishmentStoreCandidatesQuery(filter, columns) {
    var query = supabaseDb
      .from("wms_stock_positions")
      .select(columns)
      .eq("warehouse_code", activeWarehouseCode())
      .eq("source_type", "LOJA")
      .eq("active", true)
      .eq("is_sellable", true)
      .order("total_disponivel", { ascending: true })
      .order("codigo_material", { ascending: true });
    if (filter === "SEM_SALDO_LOJA") {
      return query.lte("total_disponivel", 0);
    }
    if (filter === "LOJA_BAIXA") {
      return query.lt("total_disponivel", 3);
    }
    if (filter === "LOJA_POSITIVA") {
      return query.gt("total_disponivel", 0).lt("total_disponivel", 3);
    }
    return query.lt("total_disponivel", 3);
  }

  async function fetchReplenishmentNoLocationCandidates(offset, limit) {
    var response = await runSupabaseRequestWithRetry("fetch-replenishment-no-location", function () {
      return buildReplenishmentNoLocationCandidatesQuery(stockPositionSelectColumns()).range(offset, offset + limit - 1);
    });
    if (response.error && isMissingColumnError(response.error)) {
      response = await runSupabaseRequestWithRetry("fetch-replenishment-no-location-legacy", function () {
        return buildReplenishmentNoLocationCandidatesQuery(stockPositionLegacySelectColumns()).range(offset, offset + limit - 1);
      });
    }
    if (response.error) throw response.error;
    return (response.data || []).map(fromDbStockPosition).filter(function (position) {
      return !stockPositionLocation(position);
    });
  }

  function buildReplenishmentNoLocationCandidatesQuery(columns) {
    return supabaseDb
      .from("wms_stock_positions")
      .select(columns)
      .eq("warehouse_code", activeWarehouseCode())
      .eq("source_type", "CAPTACAO")
      .eq("active", true)
      .eq("is_sellable", true)
      .gt("total_disponivel", 0)
      .order("codigo_material", { ascending: true });
  }

  async function fetchActiveStockPositionsForSkus(skus) {
    var cleanSkus = unique((skus || []).map(normalizeSku).filter(Boolean));
    if (!cleanSkus.length) return [];
    var response = await runSupabaseRequestWithRetry("fetch-stock-positions-skus", function () {
      return supabaseDb
        .from("wms_stock_positions")
        .select(stockPositionSelectColumns())
        .eq("warehouse_code", activeWarehouseCode())
        .eq("active", true)
        .in("codigo_material", cleanSkus)
        .limit(Math.max(300, cleanSkus.length * 8));
    });
    if (response.error && isMissingColumnError(response.error)) {
      response = await runSupabaseRequestWithRetry("fetch-stock-positions-skus-legacy", function () {
        return supabaseDb
          .from("wms_stock_positions")
          .select(stockPositionLegacySelectColumns())
          .eq("warehouse_code", activeWarehouseCode())
          .eq("active", true)
          .in("codigo_material", cleanSkus)
          .limit(Math.max(300, cleanSkus.length * 8));
      });
    }
    if (response.error) throw response.error;
    return (response.data || []).map(fromDbStockPosition);
  }

  async function getOpenRequestsBySkus(skus) {
    var cleanSkus = unique((skus || []).map(normalizeSku).filter(Boolean));
    if (!cleanSkus.length || !isSupabaseReady()) return {};
    var response = await supabaseDb
      .from("wms_replenishment_requests")
      .select("id,warehouse_code,codigo_material,status,quantidade_solicitada,quantidade_pendente,responsavel_nome,created_at,is_deleted")
      .eq("warehouse_code", activeWarehouseCode())
      .in("codigo_material", cleanSkus)
      .in("status", OPEN_REPLENISHMENT_STATUSES)
      .neq("is_deleted", true)
      .order("created_at", { ascending: false })
      .limit(Math.max(100, cleanSkus.length * 3));
    if (response.error) throw response.error;
    return (response.data || []).reduce(function (acc, row) {
      var sku = normalizeSku(row.codigo_material || "");
      if (sku && !acc[sku]) acc[sku] = row;
      return acc;
    }, {});
  }

  async function getOpenRequestBySku(sku) {
    var map = await getOpenRequestsBySkus([sku]);
    return map[normalizeSku(sku)] || null;
  }

  function groupStockPositionsBySku(positions) {
    return (positions || []).reduce(function (acc, position) {
      var sku = position.codigoMaterial || "";
      if (!sku) return acc;
      if (!acc[sku]) acc[sku] = [];
      acc[sku].push(position);
      return acc;
    }, {});
  }

  function classifyReplenishmentSuggestion(suggestion) {
    var hasStore = suggestion.storeAvailable !== null && suggestion.storeAvailable !== undefined;
    var loja = hasStore ? Number(suggestion.storeAvailable || 0) : null;
    var captacao = Number(suggestion.captureAvailable || 0);
    var totalOperacional = hasStore ? loja + captacao : captacao;
    var canSuggestFromCapture = hasStore && loja < 3 && captacao > 1 && totalOperacional > 3;
    if (canSuggestFromCapture) {
      if (!suggestion.captureLocation) {
        return {
          type: "CAPTACAO_POSITIVA_SEM_LOCALIZACAO",
          priority: 2,
          qty: 0,
          message: "Loja abaixo de 3, CAPTAÇÃO acima de 1 e sem localização cadastrada."
        };
      }
      return {
        type: "ABASTECER_LOJA",
        priority: 2,
        qty: Math.min(captacao, Math.max(0, 3 - loja)),
        message: "Loja abaixo de 3 com CAPTAÇÃO suficiente. Repor a partir da CAPTAÇÃO."
      };
    }
    return null;
  }

  function replenishmentSuggestionMatchesFilter(suggestion, filter) {
    if (!filter) return true;
    if (filter === "LOJA_BAIXA") return suggestion.storeAvailable !== null && suggestion.storeAvailable !== undefined && Number(suggestion.storeAvailable || 0) < 3;
    if (filter === "SEM_SALDO_LOJA") return suggestion.storeAvailable !== null && suggestion.storeAvailable !== undefined && Number(suggestion.storeAvailable || 0) <= 0;
    if (filter === "CAPTACAO_POSITIVA") return Number(suggestion.captureAvailable || 0) > 1;
    if (filter === "SEM_SALDO_CAPTACAO") return Number(suggestion.captureAvailable || 0) <= 0;
    if (filter === "SEM_LOCALIZACAO") return !suggestion.captureLocation;
    if (filter === "COM_PEDIDO_ABERTO") return suggestion.hasOpenRequest;
    if (filter === "SEM_PEDIDO_ABERTO") return !suggestion.hasOpenRequest;
    return true;
  }

  async function getReplenishmentSuggestions(options) {
    options = options || {};
    if (!isSupabaseReady()) throw new Error("Supabase nao conectado.");
    var filter = options.filter || "";
    var offset = Math.max(0, Number(options.offset || 0));
    var limit = Math.min(REPLENISHMENT_SUGGESTION_PAGE_SIZE, Math.max(1, Number(options.limit || REPLENISHMENT_SUGGESTION_PAGE_SIZE)));
    var candidateLimit = limit * 4;
    var candidates = [];
    if (filter === "SEM_LOCALIZACAO") {
      candidates = await fetchReplenishmentNoLocationCandidates(offset, candidateLimit);
    } else {
      candidates = await fetchReplenishmentStoreCandidates(filter, offset, candidateLimit);
      if (!filter) {
        var noLocation = await fetchReplenishmentNoLocationCandidates(offset, Math.max(25, limit));
        candidates = candidates.concat(noLocation);
      }
    }
    var skus = unique(candidates.map(function (position) { return position.codigoMaterial; }).filter(Boolean));
    var positions = await fetchActiveStockPositionsForSkus(skus);
    var grouped = groupStockPositionsBySku(positions);
    var openRequests = await getOpenRequestsBySkus(skus);
    var suggestions = Object.keys(grouped).map(function (sku) {
      var suggestion = buildStockSuggestion(sku, 0, grouped[sku]);
      var classification = classifyReplenishmentSuggestion(suggestion);
      if (!classification || !suggestion.sellable) return null;
      var openRequest = openRequests[sku] || null;
      return Object.assign({}, suggestion, {
        suggestionType: classification.type,
        suggestionPriority: classification.priority,
        suggestedReplenishmentQty: classification.qty,
        alertMessage: classification.message,
        hasOpenRequest: Boolean(openRequest),
        openRequestId: openRequest ? openRequest.id : "",
        openRequestStatus: openRequest ? openRequest.status : "",
        openRequestResponsible: openRequest ? openRequest.responsavel_nome || "" : ""
      });
    }).filter(function (suggestion) {
      return suggestion && replenishmentSuggestionMatchesFilter(suggestion, filter);
    }).sort(function (a, b) {
      if (a.suggestionPriority !== b.suggestionPriority) return a.suggestionPriority - b.suggestionPriority;
      return String(a.sku).localeCompare(String(b.sku));
    }).slice(0, limit);
    return {
      rows: suggestions,
      nextOffset: offset + candidateLimit,
      hasMore: candidates.length >= candidateLimit
    };
  }

  function stockAlertExportRow(alert) {
    return {
      SKU: alert.sku || "",
      Produto: alert.name || "",
      "Saldo Loja": alert.storeAvailable === null || alert.storeAvailable === undefined ? "" : Number(alert.storeAvailable || 0),
      "Saldo CAPTACAO": Number(alert.captureAvailable || 0),
      "Endereco CAPTACAO": alert.captureLocation || "",
      "Sugestao reposicao": Number(alert.suggestedReplenishmentQty || 0),
      "Origem sugerida": alert.originSuggested || "",
      Alerta: alert.alertMessage || (!alert.captureLocation ? "Produto sem localizacao na base da CAPTACAO." : "")
    };
  }

  function writeWorkbookFromSheets(fileName, sheets) {
    if (!window.XLSX) throw new Error("Biblioteca xlsx nao carregada.");
    var workbook = window.XLSX.utils.book_new();
    sheets.forEach(function (sheet) {
      var rows = sheet.rows || [];
      var worksheet = rows.length && Array.isArray(rows[0])
        ? window.XLSX.utils.aoa_to_sheet(rows)
        : window.XLSX.utils.json_to_sheet(rows);
      if (sheet.cols) worksheet["!cols"] = sheet.cols;
      window.XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
    });
    window.XLSX.writeFile(workbook, fileName);
  }

  function exportStockTemplate(sourceType) {
    try {
      var headers = sourceType === "CAPTACAO"
        ? [["Codigo Material", "Nome Material", "Total fisico", "Total alocado", "Total disponivel", "Estacao", "Rack", "Linha", "Coluna"]]
        : [["Codigo Material", "Nome Material", "Total fisico", "Total alocado", "Total disponivel"]];
      writeWorkbookFromSheets("Modelo_Base_" + stockSourceLabel(sourceType) + "_" + dateForFileName(new Date()) + ".xlsx", [{ name: stockSourceLabel(sourceType), rows: headers }]);
      setStatus("stockExportStatus", "Modelo de " + stockSourceLabel(sourceType) + " exportado.", "success");
    } catch (error) {
      setStatus("stockExportStatus", "Erro ao exportar modelo: " + formatSupabaseError(error), "error");
    }
  }

  async function exportCurrentStock() {
    try {
      var sourceType = $("stockExportSourceFilter") ? $("stockExportSourceFilter").value : "";
      setStatus("stockExportStatus", "Preparando exportacao da base atual...", "warning");
      var rows = await fetchActiveStockPositions(sourceType);
      writeWorkbookFromSheets("Base_Estoque_" + activeWarehouseCode() + "_" + dateForFileName(new Date()) + ".xlsx", [
        { name: "Base", rows: rows.map(stockPositionExportRow) }
      ]);
      setStatus("stockExportStatus", rows.length + " linha(s) exportada(s).", "success");
    } catch (error) {
      setStatus("stockExportStatus", missingStockSchemaMessage(error), "error");
    }
  }

  async function exportStockAlerts(kind) {
    try {
      setStatus("stockExportStatus", "Gerando alertas da base operacional...", "warning");
      var alerts = await getStockAlerts(kind || "");
      writeWorkbookFromSheets((kind === "SEM_LOCALIZACAO" ? "Produtos_Sem_Localizacao_" : "Alertas_Estoque_") + activeWarehouseCode() + "_" + dateForFileName(new Date()) + ".xlsx", [
        { name: "Alertas", rows: alerts.map(stockAlertExportRow) }
      ]);
      setStatus("stockExportStatus", alerts.length + " alerta(s) exportado(s).", "success");
    } catch (error) {
      setStatus("stockExportStatus", missingStockSchemaMessage(error), "error");
    }
  }

  async function exportReplenishmentSuggestions() {
    try {
      setStatus("stockExportStatus", "Calculando sugestoes de reposicao...", "warning");
      var alerts = await getStockAlerts("");
      var rows = alerts.filter(function (alert) {
        return Number(alert.suggestedReplenishmentQty || 0) > 0;
      }).map(function (alert) {
        return {
          SKU: alert.sku,
          Produto: alert.name,
          "Saldo Loja": alert.storeAvailable === null || alert.storeAvailable === undefined ? "" : alert.storeAvailable,
          "Saldo CAPTACAO": alert.captureAvailable,
          "Fisico CAPTACAO": alert.capturePhysical,
          "Alocado CAPTACAO": alert.captureAllocated,
          "Qtd sugerida": alert.suggestedReplenishmentQty,
          "Localizacao CAPTACAO": alert.captureLocation || ""
        };
      });
      writeWorkbookFromSheets("Sugestao_Reposicao_" + activeWarehouseCode() + "_" + dateForFileName(new Date()) + ".xlsx", [{ name: "Reposicao", rows: rows }]);
      setStatus("stockExportStatus", rows.length + " sugestao(oes) exportada(s).", "success");
    } catch (error) {
      setStatus("stockExportStatus", missingStockSchemaMessage(error), "error");
    }
  }

  function isMissingStockTableError(error) {
    var message = formatSupabaseError(error).toLowerCase();
    return (
      message.indexOf("wms_stock_positions") >= 0 ||
      message.indexOf("wms_stock_import_batches") >= 0
    ) && (
      message.indexOf("not found") >= 0 ||
      message.indexOf("schema cache") >= 0 ||
      message.indexOf("does not exist") >= 0 ||
      message.indexOf("pgrst") >= 0 ||
      message.indexOf("404") >= 0 ||
      message.indexOf("column") >= 0 ||
      message.indexOf("could not find") >= 0
    );
  }

  function missingStockSchemaMessage(error) {
    if (isSupabaseTransientNetworkError(error)) {
      return "Falha temporaria de comunicacao com o Supabase. O sistema agora tenta novamente automaticamente; se persistir, recarregue a pagina e importe a planilha de novo.";
    }
    if (isMissingStockTableError(error) || isMissingColumnError(error)) {
      return "Estrutura da Base de Estoque desatualizada no Supabase. Aplique as migrations e recarregue o app. Erro original: " + formatSupabaseError(error);
    }
    return "Erro na Base de Estoque: " + formatSupabaseError(error);
  }

  function isMissingReplenishmentTableError(error) {
    var message = formatSupabaseError(error).toLowerCase();
    return message.indexOf("wms_replenishment_requests") >= 0 && (
      message.indexOf("not found") >= 0 ||
      message.indexOf("schema cache") >= 0 ||
      message.indexOf("does not exist") >= 0 ||
      message.indexOf("pgrst") >= 0 ||
      message.indexOf("404") >= 0 ||
      message.indexOf("could not find") >= 0
    );
  }

  function stockService() {
    return {
      importStoreStock: function () { return importStockFromInput("LOJA"); },
      importCaptureStock: function () { return importStockFromInput("CAPTACAO"); },
      getStockPosition: getStockSuggestion,
      getStockAlerts: getStockAlerts,
      exportCurrentStock: exportCurrentStock,
      exportStockAlerts: exportStockAlerts,
      exportStockTemplate: exportStockTemplate,
      getReplenishmentSuggestions: getReplenishmentSuggestions,
      getReplenishmentSuggestion: getReplenishmentSuggestion,
      getTransferStockSuggestion: getTransferStockSuggestion,
      getReplenishmentStockSuggestion: getStockSuggestion
    };
  }

  async function loadReplenishmentData() {
    var loadStartedAt = performance.now();
    replenishmentState.requests = [];
    if (!isSupabaseReady()) return false;
    try {
      var response = await supabaseDb
        .from("wms_replenishment_requests")
        .select(replenishmentRequestSelectColumns())
        .eq("warehouse_code", activeWarehouseCode())
        .neq("is_deleted", true)
        .order("updated_at", { ascending: false })
        .limit(120);
      if (response.error) throw response.error;
      replenishmentState.requests = (response.data || []).map(fromDbReplenishmentRequest);
      replenishmentState.tablesAvailable = true;
      recordPerformanceMetric("lastReplenishmentLoadMs", loadStartedAt);
      return true;
    } catch (error) {
      replenishmentState.tablesAvailable = !isMissingTransferTableError(error);
      recordPerformanceError("reposicao", error);
      var message = isMissingTransferTableError(error) || isMissingColumnError(error)
        ? "Tabela de reposicao ausente ou desatualizada. Aplique as migrations no Supabase."
        : "Nao foi possivel carregar pedidos de reposicao: " + formatSupabaseError(error);
      if (getActiveScreenId() === "reposicao") setStatus("replenishmentQueueStatus", message, "error");
      return false;
    }
  }

  async function refreshReplenishmentData() {
    if (!moduleLoadState.replenishment || !isSupabaseReady() || !canUseNetwork()) return;
    await loadReplenishmentData();
    renderReplenishment();
    renderOperatorTasksAlert();
  }

  function replenishmentRequestSelectColumns() {
    return "id,created_at,updated_at,warehouse_code,codigo_material,nome_material,quantidade_disponivel_loja_informada,quantidade_solicitada,quantidade_atendida,quantidade_pendente,localizacao_wms,localizacao_estacao,localizacao_rack,localizacao_linha,localizacao_coluna,captacao_estacao,captacao_rack,captacao_linha,captacao_coluna,solicitado_por_id,solicitado_por_nome,responsavel_id,responsavel_nome,claimed_by_id,claimed_by_name,claimed_at,returned_to_queue_at,returned_to_queue_by_id,returned_to_queue_by_name,return_reason,status,prioridade,observacao,motivo_cancelamento,started_at,finished_at,duration_seconds,is_deleted,deleted_at,deleted_by_id,deleted_by_name";
  }

  function fromDbReplenishmentRequest(row) {
    var requested = Number(row.quantidade_solicitada || 0);
    var attended = Number(row.quantidade_atendida || 0);
    var pending = row.quantidade_pendente === null || row.quantidade_pendente === undefined
      ? Math.max(0, requested - attended)
      : Number(row.quantidade_pendente || 0);
    var status = REPLENISHMENT_STATUSES.indexOf(row.status) >= 0 ? row.status : "PENDENTE";
    return {
      id: row.id,
      createdAt: row.created_at || nowIso(),
      updatedAt: row.updated_at || row.created_at || nowIso(),
      warehouseCode: rowWarehouseCode(row),
      codigoMaterial: normalizeSku(row.codigo_material || row.sku || ""),
      nomeMaterial: row.nome_material || "",
      storeQty: Number(row.quantidade_disponivel_loja_informada || 0),
      requestedQty: requested,
      attendedQty: attended,
      pendingQty: Math.max(0, pending),
      localizacaoWms: row.localizacao_wms || "",
      localizacaoEstacao: row.localizacao_estacao || "",
      localizacaoRack: row.localizacao_rack || "",
      localizacaoLinha: row.localizacao_linha || "",
      localizacaoColuna: row.localizacao_coluna || "",
      captacaoEstacao: row.captacao_estacao || "",
      captacaoRack: row.captacao_rack || "",
      captacaoLinha: row.captacao_linha || "",
      captacaoColuna: row.captacao_coluna || "",
      solicitadoPorId: row.solicitado_por_id || "",
      solicitadoPorNome: row.solicitado_por_nome || "",
      responsavelId: row.responsavel_id || "",
      responsavelNome: row.responsavel_nome || "",
      claimedById: row.claimed_by_id || "",
      claimedByName: row.claimed_by_name || "",
      claimedAt: row.claimed_at || "",
      returnedToQueueAt: row.returned_to_queue_at || "",
      returnedToQueueById: row.returned_to_queue_by_id || "",
      returnedToQueueByName: row.returned_to_queue_by_name || "",
      returnReason: row.return_reason || "",
      status: status,
      prioridade: row.prioridade || "NORMAL",
      observacao: row.observacao || "",
      motivoCancelamento: row.motivo_cancelamento || "",
      startedAt: row.started_at || "",
      finishedAt: row.finished_at || "",
      durationSeconds: Number(row.duration_seconds || 0),
      isDeleted: row.is_deleted === true,
      deletedAt: row.deleted_at || "",
      deletedById: row.deleted_by_id || "",
      deletedByName: row.deleted_by_name || "",
      idempotencyKey: row.idempotency_key || row.request_id || "",
      requestId: row.request_id || row.idempotency_key || "",
      clientActionId: row.client_action_id || "",
      createdById: row.created_by_id || ""
    };
  }

  function toDbReplenishmentRequest(item) {
    return {
      id: item.id,
      created_at: item.createdAt || nowIso(),
      updated_at: item.updatedAt || nowIso(),
      warehouse_code: normalizeWarehouseCode(item.warehouseCode || activeWarehouseCode()),
      codigo_material: normalizeSku(item.codigoMaterial || ""),
      nome_material: item.nomeMaterial || "",
      quantidade_disponivel_loja_informada: Number(item.storeQty || 0),
      quantidade_solicitada: Number(item.requestedQty || 0),
      quantidade_atendida: Number(item.attendedQty || 0),
      quantidade_pendente: Number(item.pendingQty || 0),
      localizacao_wms: item.localizacaoWms || "",
      localizacao_estacao: item.localizacaoEstacao || "",
      localizacao_rack: item.localizacaoRack || "",
      localizacao_linha: item.localizacaoLinha || "",
      localizacao_coluna: item.localizacaoColuna || "",
      captacao_estacao: item.captacaoEstacao || "",
      captacao_rack: item.captacaoRack || "",
      captacao_linha: item.captacaoLinha || "",
      captacao_coluna: item.captacaoColuna || "",
      solicitado_por_id: item.solicitadoPorId || "",
      solicitado_por_nome: item.solicitadoPorNome || "",
      responsavel_id: item.responsavelId || "",
      responsavel_nome: item.responsavelNome || "",
      claimed_by_id: item.claimedById || "",
      claimed_by_name: item.claimedByName || "",
      claimed_at: item.claimedAt || null,
      returned_to_queue_at: item.returnedToQueueAt || null,
      returned_to_queue_by_id: item.returnedToQueueById || "",
      returned_to_queue_by_name: item.returnedToQueueByName || "",
      return_reason: item.returnReason || "",
      status: item.status || "PENDENTE",
      prioridade: item.prioridade || "NORMAL",
      observacao: item.observacao || "",
      motivo_cancelamento: item.motivoCancelamento || "",
      started_at: item.startedAt || null,
      finished_at: item.finishedAt || null,
      duration_seconds: Number(item.durationSeconds || 0),
      is_deleted: item.isDeleted === true,
      deleted_at: item.deletedAt || null,
      deleted_by_id: item.deletedById || "",
      deleted_by_name: item.deletedByName || ""
    };
  }

  function replenishmentService() {
    return {
      createReplenishmentRequest: createReplenishmentRequest,
      getReplenishmentRequests: getVisibleReplenishmentRequests,
      getMyReplenishmentRequests: getMyReplenishmentRequests,
      getAssignableUsersByWarehouse: getAssignableUsersByWarehouse,
      getOpenRequestBySku: getOpenRequestBySku,
      assignReplenishmentRequest: assignReplenishmentRequest,
      claimReplenishmentRequest: claimReplenishmentRequest,
      returnReplenishmentRequestToQueue: returnReplenishmentRequestToQueue,
      startReplenishmentRequest: startReplenishmentRequest,
      updateReplenishmentQuantity: updateReplenishmentQuantity,
      markReplenishmentNoStock: markReplenishmentNoStock,
      completeReplenishmentRequest: completeReplenishmentRequest,
      cancelReplenishmentRequest: cancelReplenishmentRequest,
      deleteTestReplenishmentRequest: deleteTestReplenishmentRequest,
      subscribeReplenishmentRealtime: startLeaderLiveSync
    };
  }

  async function createReplenishmentRequest(data) {
    if (!isSupabaseReady()) throw new Error("Supabase nao conectado.");
    if (!ensureActiveWarehouse()) throw new Error("Estoque ativo invalido.");
    var sku = normalizeSku(data.codigoMaterial);
    var requestedQty = Number(data.requestedQty || 0);
    var storeQty = Number(data.storeQty || 0);
    if (!sku) throw new Error("Codigo Material obrigatorio.");
    if (!authState.currentUser) throw new Error("Usuario solicitante obrigatorio.");
    if (!requestedQty || requestedQty <= 0) throw new Error("Quantidade para repor deve ser maior que zero.");
    var signature = [activeWarehouseCode(), authState.currentUser.id, sku, requestedQty].join(":");
    if (replenishmentState.lastCreatedSignature === signature && Date.now() - replenishmentState.lastCreatedAt < 15000) {
      var recentDuplicate = findRecentReplenishmentDuplicate(sku, requestedQty, 15000);
      if (recentDuplicate) return recentDuplicate;
      return null;
    }
    var openRequest = await getOpenRequestBySku(sku);
    if (openRequest && !data.forceDuplicate && !window.confirm("Ja existe um pedido aberto para este produto. Deseja abrir outro mesmo assim?")) return null;
    var productInfo = data.productInfo || lookupReplenishmentProduct(sku);
    try {
      var stockSuggestion = await getStockSuggestion(sku, requestedQty);
      productInfo = enrichReplenishmentProductWithStock(productInfo, stockSuggestion);
      if (Number(stockSuggestion.suggestedReplenishmentQty || 0) > 0 && (!requestedQty || requestedQty <= 0)) {
        requestedQty = Number(stockSuggestion.suggestedReplenishmentQty || 0);
      }
    } catch (error) {
      if (!isMissingStockTableError(error) && !isMissingColumnError(error)) recordPerformanceError("reposicao-stock", error);
    }
    var now = nowIso();
    var idempotencyKey = data.idempotencyKey || createIdempotencyKey([activeWarehouseCode(), "REPOSICAO", authState.currentUser.id, sku, requestedQty]);
    var clientActionId = data.clientActionId || idempotencyKey;
    var existingByKey = await findReplenishmentByIdempotencyKey(idempotencyKey);
    if (existingByKey) return existingByKey;
    var request = {
      id: randomId("rep"),
      createdAt: now,
      updatedAt: now,
      warehouseCode: activeWarehouseCode(),
      codigoMaterial: sku,
      nomeMaterial: productInfo.name || findProductName(sku) || "",
      storeQty: Number(storeQty || 0),
      requestedQty: requestedQty,
      attendedQty: 0,
      pendingQty: requestedQty,
      localizacaoWms: productInfo.captureLocation || "",
      localizacaoEstacao: productInfo.captureStation || "",
      localizacaoRack: productInfo.captureRack || "",
      localizacaoLinha: productInfo.captureLine || "",
      localizacaoColuna: productInfo.captureColumn || "",
      captacaoEstacao: productInfo.captureStation || "",
      captacaoRack: productInfo.captureRack || "",
      captacaoLinha: productInfo.captureLine || "",
      captacaoColuna: productInfo.captureColumn || "",
      solicitadoPorId: authState.currentUser.id,
      solicitadoPorNome: authState.currentUser.name || authState.currentUser.username || "",
      responsavelId: "",
      responsavelNome: "",
      claimedById: "",
      claimedByName: "",
      claimedAt: "",
      returnedToQueueAt: "",
      returnedToQueueById: "",
      returnedToQueueByName: "",
      returnReason: "",
      status: "PENDENTE",
      prioridade: "NORMAL",
      observacao: normalizeText(data.observation),
      idempotencyKey: idempotencyKey,
      requestId: idempotencyKey,
      clientActionId: clientActionId,
      createdById: authState.currentUser.id
    };
    var response = await insertReplenishmentRequest(request, idempotencyKey, clientActionId);
    if (response.error && isDuplicateKeyError(response.error)) {
      var duplicated = await findReplenishmentByIdempotencyKey(idempotencyKey);
      if (duplicated) return duplicated;
    }
    if (response.error) throw response.error;
    var saved = fromDbReplenishmentRequest(response.data);
    upsertById(replenishmentState.requests, saved);
    replenishmentState.lastCreatedSignature = signature;
    replenishmentState.lastCreatedAt = Date.now();
    createReplenishmentNotification(saved, "created");
    return saved;
  }

  async function insertReplenishmentRequest(request, idempotencyKey, clientActionId) {
    var payload = Object.assign(toDbReplenishmentRequest(request), {
      idempotency_key: idempotencyKey,
      request_id: idempotencyKey,
      client_action_id: clientActionId,
      created_by_id: authState.currentUser ? authState.currentUser.id : ""
    });
    var optionalColumns = ["idempotency_key", "request_id", "client_action_id", "created_by_id"];
    for (var attempt = 0; attempt <= optionalColumns.length; attempt += 1) {
      var response = await supabaseDb
        .from("wms_replenishment_requests")
        .insert(payload)
        .select(replenishmentRequestSelectColumns())
        .single();
      if (!response.error || isDuplicateKeyError(response.error)) return response;
      var missingColumn = getMissingReplenishmentIdempotencyColumn(response.error);
      if (!missingColumn || !Object.prototype.hasOwnProperty.call(payload, missingColumn)) return response;
      delete payload[missingColumn];
    }
    return supabaseDb
      .from("wms_replenishment_requests")
      .insert(toDbReplenishmentRequest(request))
      .select(replenishmentRequestSelectColumns())
      .single();
  }

  function findRecentReplenishmentDuplicate(sku, requestedQty, maxAgeMs) {
    var now = Date.now();
    return replenishmentState.requests.find(function (request) {
      if (!request || request.isDeleted) return false;
      if (request.warehouseCode !== activeWarehouseCode()) return false;
      if (request.solicitadoPorId !== authState.currentUser.id) return false;
      if (request.codigoMaterial !== sku) return false;
      if (Number(request.requestedQty || 0) !== Number(requestedQty || 0)) return false;
      if (FINAL_REPLENISHMENT_STATUSES.indexOf(request.status) >= 0) return false;
      var createdAt = Date.parse(request.createdAt || "");
      return Number.isFinite(createdAt) && now - createdAt <= maxAgeMs;
    }) || null;
  }

  async function findReplenishmentByIdempotencyKey(idempotencyKey) {
    if (!idempotencyKey || !isSupabaseReady()) return null;
    var response = await supabaseDb
      .from("wms_replenishment_requests")
      .select(replenishmentRequestSelectColumns())
      .eq("warehouse_code", activeWarehouseCode())
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (response.error) {
      if (isMissingIdempotencyColumnError(response.error)) return null;
      throw response.error;
    }
    return response.data ? fromDbReplenishmentRequest(response.data) : null;
  }

  function lookupReplenishmentProduct(sku) {
    sku = normalizeSku(sku);
    return {
      sku: sku,
      name: findProductName(sku) || "",
      storeBalance: null,
      captureBalance: null,
      wmsLocation: "",
      wmsStation: "",
      wmsRack: "",
      wmsLine: "",
      wmsColumn: "",
      captureLocation: "",
      captureStation: "",
      captureRack: "",
      captureLine: "",
      captureColumn: "",
      balanceWarning: "Saldo ainda nao importado."
    };
  }

  function enrichReplenishmentProductWithStock(product, suggestion) {
    product = Object.assign({}, product || {});
    if (!suggestion || !suggestion.sku) return product;
    product.name = suggestion.name || product.name || "";
    product.storeBalance = suggestion.storeAvailable === null || suggestion.storeAvailable === undefined ? null : Number(suggestion.storeAvailable || 0);
    product.captureBalance = Number(suggestion.captureAvailable || 0);
    product.captureLocation = suggestion.captureLocation || product.captureLocation || "";
    product.captureStation = suggestion.captureStation || product.captureStation || "";
    product.captureRack = suggestion.captureRack || product.captureRack || "";
    product.captureLine = suggestion.captureLine || product.captureLine || "";
    product.captureColumn = suggestion.captureColumn || product.captureColumn || "";
    product.balanceWarning = suggestion.alertMessage || (suggestion.suggestedReplenishmentQty > 0 ? "Sugestao de reposicao: " + formatQty(suggestion.suggestedReplenishmentQty) + "." : "");
    return product;
  }

  async function lookupReplenishmentProductWithStock(sku) {
    var product = lookupReplenishmentProduct(sku);
    try {
      var suggestion = await getStockSuggestion(sku, 0);
      product = enrichReplenishmentProductWithStock(product, suggestion);
      if ($("replenishmentRequestQtyInput") && !normalizeText($("replenishmentRequestQtyInput").value) && Number(suggestion.suggestedReplenishmentQty || 0) > 0) {
        $("replenishmentRequestQtyInput").value = String(suggestion.suggestedReplenishmentQty);
      }
      if ($("replenishmentStoreQtyInput")) {
        $("replenishmentStoreQtyInput").value = String(Number(suggestion.storeAvailable || 0));
      }
    } catch (error) {
      if (!isMissingStockTableError(error) && !isMissingColumnError(error)) recordPerformanceError("reposicao-stock-lookup", error);
    }
    replenishmentState.currentProduct = product;
    renderReplenishmentProductCard(product);
    return product;
  }

  async function updateReplenishmentRow(id, patch) {
    var existing = getReplenishmentById(id);
    if (!existing) throw new Error("Pedido de reposicao nao encontrado.");
    if (existing.warehouseCode !== activeWarehouseCode()) throw new Error("Pedido pertence a outro estoque.");
    var updated = Object.assign({}, existing, patch, { updatedAt: nowIso() });
    var response = await supabaseDb
      .from("wms_replenishment_requests")
      .update(toDbReplenishmentRequest(updated))
      .eq("id", id)
      .eq("warehouse_code", activeWarehouseCode())
      .select(replenishmentRequestSelectColumns())
      .single();
    if (response.error) throw response.error;
    var saved = fromDbReplenishmentRequest(response.data);
    upsertById(replenishmentState.requests, saved);
    return saved;
  }

  async function assignReplenishmentRequest(id, userId) {
    var request = getReplenishmentById(id);
    if (!request) throw new Error("Pedido de reposicao nao encontrado.");
    var user = authState.users.find(function (entry) { return entry.id === userId; });
    if (!user || !userCanReceiveReplenishmentInWarehouse(user, request.warehouseCode)) throw new Error("Responsavel invalido: este usuario pertence a outro estoque.");
    var saved = await updateReplenishmentRow(id, {
      responsavelId: user.id,
      responsavelNome: user.name || user.username,
      status: "ATRIBUIDO"
    });
    createReplenishmentNotification(saved, "assigned");
    return saved;
  }

  async function claimReplenishmentRequest(id) {
    if (!authState.currentUser) throw new Error("Usuario logado obrigatorio.");
    var request = getReplenishmentById(id);
    if (!request) throw new Error("Pedido de reposicao nao encontrado.");
    if (!canClaimReplenishmentRequest(request)) throw new Error("Pedido indisponivel para o usuario atual.");
    var now = nowIso();
    var userName = authState.currentUser.name || authState.currentUser.username || "";
    var patch = {
      responsavel_id: authState.currentUser.id,
      responsavel_nome: userName,
      claimed_by_id: authState.currentUser.id,
      claimed_by_name: userName,
      claimed_at: now,
      status: "EM_SEPARACAO",
      started_at: request.startedAt || now,
      updated_at: now
    };
    var response = await supabaseDb
      .from("wms_replenishment_requests")
      .update(patch)
      .eq("id", id)
      .eq("warehouse_code", activeWarehouseCode())
      .eq("status", "PENDENTE")
      .or("responsavel_id.is.null,responsavel_id.eq.")
      .select(replenishmentRequestSelectColumns());
    if (response.error) throw response.error;
    if (!response.data || !response.data.length) throw new Error("Este pedido ja foi assumido por outro colaborador.");
    var saved = fromDbReplenishmentRequest(response.data[0]);
    upsertById(replenishmentState.requests, saved);
    createReplenishmentNotification(saved, "claimed");
    return saved;
  }

  async function returnReplenishmentRequestToQueue(id, reason) {
    if (!authState.currentUser) throw new Error("Usuario logado obrigatorio.");
    var request = getReplenishmentById(id);
    if (!request) throw new Error("Pedido de reposicao nao encontrado.");
    if (!canReturnReplenishmentRequest(request)) throw new Error("Apenas o responsavel atual, supervisor ou administrador pode devolver para a fila.");
    var now = nowIso();
    var userName = authState.currentUser.name || authState.currentUser.username || "";
    var saved = await updateReplenishmentRow(id, {
      responsavelId: "",
      responsavelNome: "",
      claimedById: "",
      claimedByName: "",
      claimedAt: "",
      returnedToQueueAt: now,
      returnedToQueueById: authState.currentUser.id,
      returnedToQueueByName: userName,
      returnReason: normalizeText(reason || "Devolvido para a fila."),
      startedAt: "",
      finishedAt: "",
      durationSeconds: 0,
      status: "PENDENTE"
    });
    createReplenishmentNotification(saved, "returned");
    return saved;
  }

  async function startReplenishmentRequest(id) {
    var request = getReplenishmentById(id);
    return updateReplenishmentRow(id, {
      status: "EM_SEPARACAO",
      startedAt: request && request.startedAt ? request.startedAt : nowIso()
    });
  }

  async function updateReplenishmentQuantity(id, qty, observation) {
    var request = getReplenishmentById(id);
    if (!request) throw new Error("Pedido de reposicao nao encontrado.");
    qty = Number(qty || 0);
    if (qty < 0) throw new Error("Quantidade atendida invalida.");
    var requested = Number(request.requestedQty || 0);
    var attended = Math.min(requested, Number(request.attendedQty || 0) + qty);
    var pending = Math.max(0, requested - attended);
    var status = attended >= requested ? "SEPARADO" : attended > 0 ? "ATENDIDO_PARCIAL" : "SEM_ESTOQUE";
    if (qty === 0 && !normalizeText(observation)) throw new Error("Informe o motivo para marcar sem estoque.");
    return updateReplenishmentRow(id, {
      attendedQty: attended,
      pendingQty: pending,
      status: status,
      observacao: normalizeText(observation || request.observacao)
    });
  }

  async function markReplenishmentNoStock(id, reason) {
    if (!normalizeText(reason)) throw new Error("Informe o motivo do sem estoque.");
    return updateReplenishmentQuantity(id, 0, reason);
  }

  async function completeReplenishmentRequest(id) {
    var request = getReplenishmentById(id);
    if (!request) throw new Error("Pedido de reposicao nao encontrado.");
    if (Number(request.attendedQty || 0) <= 0) throw new Error("Informe o motivo em Sem estoque quando nada foi atendido.");
    if (Number(request.attendedQty || 0) < Number(request.requestedQty || 0)) throw new Error("Ainda ha quantidade pendente. Use Atender para parcial ou Sem estoque com motivo.");
    var now = nowIso();
    var started = request.startedAt || request.createdAt || now;
    return updateReplenishmentRow(id, {
      status: "CONCLUIDO",
      pendingQty: 0,
      finishedAt: now,
      durationSeconds: Math.max(0, Math.round((new Date(now).getTime() - new Date(started).getTime()) / 1000))
    });
  }

  async function cancelReplenishmentRequest(id, reason) {
    if (!isAdminOrSupervisor()) throw new Error("Apenas lider ou administrador pode cancelar.");
    if (!normalizeText(reason)) throw new Error("Motivo do cancelamento obrigatorio.");
    return updateReplenishmentRow(id, {
      status: "CANCELADO",
      motivoCancelamento: normalizeText(reason)
    });
  }

  async function deleteTestReplenishmentRequest(id) {
    if (!isGlobalAdminUser(authState.currentUser)) throw new Error("Somente administrador geral pode excluir pedido de teste.");
    return updateReplenishmentRow(id, {
      isDeleted: true,
      deletedAt: nowIso(),
      deletedById: authState.currentUser.id,
      deletedByName: authState.currentUser.name || authState.currentUser.username || ""
    });
  }

  function getReplenishmentById(id) {
    return replenishmentState.requests.find(function (request) { return request.id === id; }) || null;
  }

  function canClaimReplenishmentRequest(request) {
    if (!authState.currentUser || !request || request.isDeleted) return false;
    if (request.status !== "PENDENTE") return false;
    if (request.responsavelId) return false;
    if (normalizeWarehouseCode(request.warehouseCode) !== activeWarehouseCode()) return false;
    if (!userCanAccessWarehouse(authState.currentUser, request.warehouseCode)) return false;
    return isAdminOrSupervisor() || userCanReceiveReplenishmentInWarehouse(authState.currentUser, request.warehouseCode);
  }

  function canReturnReplenishmentRequest(request) {
    if (!authState.currentUser || !request || request.isDeleted) return false;
    if (FINAL_REPLENISHMENT_STATUSES.indexOf(request.status) >= 0) return false;
    if (!request.responsavelId) return false;
    if (normalizeWarehouseCode(request.warehouseCode) !== activeWarehouseCode()) return false;
    return isAdminOrSupervisor() || request.responsavelId === authState.currentUser.id;
  }

  function isReplenishmentInCurrentUserQueue(request) {
    if (!authState.currentUser || !request || request.isDeleted) return false;
    if (normalizeWarehouseCode(request.warehouseCode) !== activeWarehouseCode()) return false;
    if (request.status === "PENDENTE" && canClaimReplenishmentRequest(request)) return true;
    return request.responsavelId === authState.currentUser.id;
  }

  function getVisibleReplenishmentRequests() {
    return replenishmentState.requests.filter(function (request) {
      if (request.isDeleted) return false;
      if (!processRowMatchesActiveWarehouse(request)) return false;
      if (isAdminOrSupervisor()) return true;
      return isReplenishmentInCurrentUserQueue(request) || (authState.currentUser && request.solicitadoPorId === authState.currentUser.id);
    });
  }

  function getMyReplenishmentRequests() {
    if (!authState.currentUser) return [];
    return getVisibleReplenishmentRequests().filter(function (request) {
      if (["EM_SEPARACAO", "ATENDIDO_PARCIAL", "SEPARADO"].indexOf(request.status) < 0) return false;
      return request.responsavelId === authState.currentUser.id;
    });
  }

  async function recordTransferEvent(transferId, itemId, eventType, sku, quantity, details, payload, meta) {
    return;
  }

  async function upsertInChunks(tableName, rows, onConflict, onProgress) {
    var chunkSize = tableName === "wms_stock_positions" ? 80 : 200;
    for (var i = 0; i < rows.length;) {
      var chunk = rows.slice(i, i + chunkSize);
      var response = await runSupabaseRequestWithRetry("upsert-" + tableName, function () {
        return supabaseDb.from(tableName).upsert(chunk, onConflict ? { onConflict: onConflict } : undefined);
      });
      if (response.error && isSupabaseTransientNetworkError(response.error) && chunkSize > 20) {
        chunkSize = smallerSupabaseChunkSize(chunkSize);
        continue;
      }
      if (response.error) throw response.error;
      i += chunk.length;
      if (typeof onProgress === "function") onProgress({ processed: i, total: rows.length, chunkSize: chunk.length });
      if (tableName === "wms_stock_positions" && i < rows.length) await delay(80);
    }
  }

  function dedupeBindingsForSave() {
    var bySkuLocation = {};
    var deduped = [];
    state.bindings.forEach(function (binding) {
      binding.sku = firstSkuValue(binding.sku);
      var key = normalizeSkuKey(binding.sku) + "\u0001" + locationKeyFromBinding(binding);
      var existing = bySkuLocation[key];
      if (!existing) {
        bySkuLocation[key] = binding;
        deduped.push(binding);
        return;
      }
      existing.productName = existing.productName || binding.productName || "";
      existing.areaCode = binding.areaCode || existing.areaCode;
      existing.areaName = binding.areaName || existing.areaName;
      existing.updatedAt = maxIsoDate(existing.updatedAt, binding.updatedAt);
    });
    if (deduped.length !== state.bindings.length) {
      state.bindings = deduped;
    }
    return state.bindings;
  }

  function maxIsoDate(first, second) {
    if (!first) return second || new Date().toISOString();
    if (!second) return first;
    return new Date(second).getTime() > new Date(first).getTime() ? second : first;
  }

  async function saveBindingAndHistory(binding, historyItem) {
    if (!isSupabaseReady()) {
      var problem = describeSupabaseConfigProblem();
      updateSupabaseStatus("Supabase nao conectado. O SKU nao foi salvo. " + problem, "error");
      return { ok: false, message: "Supabase nao conectado. " + problem };
    }
    try {
    var bindingResponse = await supabaseDb
      .from("wms_bindings")
      .upsert(toDbBinding(binding), { onConflict: "warehouse_code,sku,location_code" });
    if (bindingResponse.error && isMissingWarehouseColumnError(bindingResponse.error)) {
      assertWarehouseFallbackAllowed("wms_bindings", bindingResponse.error);
      bindingResponse = await supabaseDb
        .from("wms_bindings")
        .upsert(stripWarehouseColumns(toDbBinding(binding)), { onConflict: "sku,location_code" });
      }
      if (bindingResponse.error) throw bindingResponse.error;

    var historyResponse = await supabaseDb
      .from("wms_history")
      .upsert(toDbHistory(historyItem), { onConflict: "id" });
    if (historyResponse.error && isMissingWarehouseColumnError(historyResponse.error)) {
      assertWarehouseFallbackAllowed("wms_history", historyResponse.error);
      historyResponse = await supabaseDb
        .from("wms_history")
        .upsert(stripWarehouseColumns(toDbHistory(historyItem)), { onConflict: "id" });
      }
      if (historyResponse.error) {
        if (!isHistorySchemaError(historyResponse.error)) throw historyResponse.error;
        historySchemaAvailable = false;
        updateSupabaseStatus("SKU salvo em wms_bindings. Historico nao salvo porque wms_history esta sem a coluna datetime; aplique as migrations do Supabase.", "warning");
      }

      var verifyResponse = await supabaseDb
        .from("wms_bindings")
        .select("id, sku, location_code")
        .eq("id", binding.id)
        .maybeSingle();
      if (verifyResponse.error) throw verifyResponse.error;
      if (!verifyResponse.data) throw new Error("Registro nao encontrado apos salvar.");

      return { ok: true };
    } catch (error) {
      var message = formatSupabaseError(error);
      console.error("Falha no insert/upsert do Supabase:", error);
      updateSupabaseStatus("Falha ao gravar no Supabase: " + message, "error");
      return { ok: false, message: message };
    }
  }

  function fromDbBinding(row) {
    return {
      id: row.id,
      sku: row.sku || "",
      rua: Number(row.rua),
      rack: Number(row.rack),
      linha: Number(row.linha),
      letra: row.letra || "",
      locationCode: row.location_code || "",
      areaCode: Number(row.area_code || 1),
      areaName: row.area_name || (getAreaByCode(row.area_code) || getAreaByCode(1)).name,
      productName: row.product_name || "",
      warehouseId: row.warehouse_id || warehouseIdForCode(row.warehouse_code),
      warehouseCode: rawWarehouseCodeValue(row) ? rowWarehouseCode(row) : "",
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || row.created_at || new Date().toISOString()
    };
  }

  function expandDbBindingRows(rows) {
    return expandBindingsWithMultipleSkus(rows.map(fromDbBinding));
  }

  function expandBindingsWithMultipleSkus(bindings) {
    var expanded = [];
    bindings.forEach(function (binding) {
      var skus = splitSkuValues(binding.sku);
      if (skus.length <= 1) {
        var singleSku = skus[0] || normalizeSku(binding.sku);
        expanded.push(Object.assign({}, binding, {
          sku: singleSku,
          productName: binding.productName || findProductName(singleSku) || ""
        }));
        return;
      }
      skus.forEach(function (sku, index) {
        expanded.push(Object.assign({}, binding, {
          id: String(binding.id || ("id-" + Date.now())) + "-sku-" + sku + "-" + index,
          sku: sku,
          productName: binding.productName || findProductName(sku) || "",
          updatedAt: binding.updatedAt || new Date().toISOString()
        }));
      });
    });
    return expanded;
  }

  function toDbBinding(binding) {
    return {
      id: binding.id,
      sku: String(binding.sku || ""),
      rua: Number(binding.rua),
      rack: Number(binding.rack),
      linha: Number(binding.linha),
      letra: binding.letra || "",
      location_code: binding.locationCode || "",
      area_code: Number(binding.areaCode || 1),
      area_name: binding.areaName || (getAreaByCode(binding.areaCode) || getAreaByCode(1)).name,
      product_name: binding.productName || findProductName(binding.sku) || "",
      warehouse_id: binding.warehouseId || activeWarehouseId(),
      warehouse_code: normalizeWarehouseCode(binding.warehouseCode || activeWarehouseCode()),
      created_at: binding.createdAt || new Date().toISOString(),
      updated_at: binding.updatedAt || new Date().toISOString()
    };
  }

  function fromDbHistory(row) {
    return {
      id: row.id,
      datetime: row.datetime || new Date().toISOString(),
      action: row.action || "",
      sku: row.sku || "",
      location: row.location || "",
      details: row.details || "",
      warehouseId: row.warehouse_id || warehouseIdForCode(row.warehouse_code),
      warehouseCode: rowWarehouseCode(row)
    };
  }

  function toDbHistory(item) {
    if (!item.id) item.id = randomId("hist");
    return {
      id: item.id,
      datetime: item.datetime || new Date().toISOString(),
      action: item.action || "",
      sku: item.sku || "",
      location: item.location || "",
      details: item.details || "",
      warehouse_id: item.warehouseId || activeWarehouseId(),
      warehouse_code: normalizeWarehouseCode(item.warehouseCode || activeWarehouseCode())
    };
  }

  async function initAuth() {
    document.body.classList.add("auth-locked");
    document.body.classList.remove("auth-unlocked");
    setAuthenticatedShellActive(false);
    if (!isSupabaseReady()) {
      showLogin("Supabase nao conectado. Configure as variaveis antes de entrar.", "error");
      return;
    }
    var savedSession = null;
    try {
      savedSession = await getCurrentAuthSession(supabaseDb);
    } catch (error) {
      console.warn("Nao foi possivel restaurar a sessao Auth:", error);
    }
    if (!savedSession || !savedSession.user) {
      showLogin("", "");
      return;
    }
    await ensureWarehousesLoaded();
    var loaded = await ensureUsersLoaded({ repair: false });
    if (!loaded) {
      await signOutAuthSession(supabaseDb).catch(function () {});
      showLogin("Usuario ou senha invalidos", "error");
      return;
    }
    var user = authState.users.find(function (item) {
      return item.authUserId === savedSession.user.id && item.active && item.archived !== true;
    });
    if (user) {
      authState.currentUser = user;
      authState.currentSession = savedSession;
      setActiveWarehouse(resolveLoginWarehouseForUser(user, ""));
      if (!(await enforceFirstPasswordChange(user))) return;
      await enterAuthenticatedApp(false);
      requestBrowserNotificationPermission();
      return;
    }
    await signOutAuthSession(supabaseDb).catch(function () {});
    showLogin("Usuario ou senha invalidos", "error");
  }

  async function loadUsers(options) {
    if (!isSupabaseReady()) return false;
    var response = await fetchUserRowsForAuth();
    if (response.error) {
      if (isMissingAuthTableError(response.error)) {
        authState.usersTableAvailable = false;
        return false;
      }
      updateSupabaseStatus("Falha ao carregar usuarios: " + formatSupabaseError(response.error), "error");
      return false;
    }
    authState.usersTableAvailable = true;
    authState.users = (response.data || []).map(fromDbUser);
    moduleLoadState.users = true;
    if (authState.currentUser) {
      var refreshedCurrentUser = authState.users.find(function (user) { return user.id === authState.currentUser.id; });
      if (refreshedCurrentUser) {
        authState.currentUser = refreshedCurrentUser;
        var nextWarehouse = resolveLoginWarehouseForUser(refreshedCurrentUser, authState.currentSession && authState.currentSession.activeWarehouseCode);
        if (nextWarehouse && !userCanAccessWarehouse(refreshedCurrentUser, activeWarehouseCode())) setActiveWarehouse(nextWarehouse);
      }
    }
    if (!options || options.repair !== false) {
      var repaired = await repairUserWarehouseAssignments();
      if (repaired) return loadUsers({ repair: false });
    }
    return true;
  }

  async function fetchUserRowsForAuth() {
    var columns = userSelectColumnList();
    return fetchUsersWithColumns(columns, userOptionalColumnMap(), function (query) {
      return query.order("created_at", { ascending: true });
    });
  }

  function userOptionalColumnMap() {
    return {
      default_warehouse_id: true,
      default_warehouse_code: true,
      allowed_warehouse_codes: true,
      warehouse_id: true,
      warehouse_code: true,
      is_global_admin: true,
      supervisor_id: true,
      supervisor_name: true,
      archived: true,
      archived_at: true,
      archived_by_id: true,
      archived_by_name: true
    };
  }

  function userSelectColumnList() {
    return [
      "id",
      "created_at",
      "updated_at",
      "name",
      "username",
      "matricula",
      "role",
      "active",
      "available_for_tasks",
      "last_login_at",
      "default_warehouse_id",
      "default_warehouse_code",
      "allowed_warehouse_codes",
      "warehouse_id",
      "warehouse_code",
      "is_global_admin",
      "supervisor_id",
      "supervisor_name",
      "archived",
      "archived_at",
      "archived_by_id",
      "archived_by_name",
      "auth_user_id",
      "auth_email",
      "must_change_password",
      "auth_migrated_at"
    ];
  }

  async function fetchUsersWithColumns(columns, removable, applyQuery) {
    columns = columns.slice();
    removable = removable || {};
    applyQuery = applyQuery || function (query) { return query; };
    for (var attempt = 0; attempt < 12; attempt += 1) {
      var query = supabaseDb
        .from("wms_users")
        .select(columns.join(","));
      var response = await applyQuery(query);
      if (!response.error) return response;
      var message = formatSupabaseError(response.error).toLowerCase();
      var removed = false;
      Object.keys(removable).forEach(function (column) {
        if (!removed && columns.indexOf(column) >= 0 && message.indexOf(column) >= 0) {
          columns = columns.filter(function (item) { return item !== column; });
          removed = true;
        }
      });
      if (!removed) return response;
    }
    return applyQuery(supabaseDb
      .from("wms_users")
      .select(columns.join(",")));
  }

  function isNamedUser(user, token) {
    token = normalizeText(token).toLowerCase();
    return [
      user && user.name,
      user && user.username,
      user && user.matricula
    ].some(function (value) {
      return normalizeText(value).toLowerCase().indexOf(token) >= 0;
    });
  }

  function canonicalUserWarehousePatch(user) {
    var activeCodes = activeWarehouseCodes();
    var role = ROLES.indexOf(user.role) >= 0 ? user.role : "OPERADOR";
    var isGlobal = role === "ADMINISTRADOR";
    var allowed = isGlobal ? activeCodes.slice() : parseWarehouseCodes(user.allowedWarehouseCodes);
    var defaultCode = normalizeWarehouseCodeOrBlank(user.defaultWarehouseCode || user.warehouseCode);

    var repaired = removeAccidentalDefaultWarehouse(defaultCode, allowed, isGlobal);
    defaultCode = repaired.defaultCode;
    allowed = repaired.allowed;

    if (!defaultCode && allowed.length) defaultCode = allowed[0];
    if (!defaultCode) defaultCode = DEFAULT_WAREHOUSE_CODE;
    if (activeCodes.length && activeCodes.indexOf(defaultCode) < 0) defaultCode = allowed.find(function (code) { return activeCodes.indexOf(code) >= 0; }) || activeCodes[0];

    if (!allowed.length) allowed = [defaultCode || DEFAULT_WAREHOUSE_CODE];
    if (allowed.indexOf(defaultCode) < 0) allowed.push(defaultCode);
    allowed = unique(allowed.map(normalizeWarehouseCode)).filter(function (code) {
      return activeCodes.indexOf(code) >= 0 || !warehouseState.tableAvailable;
    });
    if (!allowed.length) allowed = [DEFAULT_WAREHOUSE_CODE];
    if (allowed.indexOf(defaultCode) < 0) defaultCode = allowed[0];

    return {
      role: role,
      default_warehouse_id: warehouseIdForCode(defaultCode),
      default_warehouse_code: defaultCode,
      warehouse_id: warehouseIdForCode(defaultCode),
      warehouse_code: defaultCode,
      allowed_warehouse_codes: allowed.join(","),
      is_global_admin: isGlobal
    };
  }

  async function repairUserWarehouseAssignments() {
    if (!isSupabaseReady() || !authState.users.length) return false;
    var changed = false;
    for (var i = 0; i < authState.users.length; i += 1) {
      var user = authState.users[i];
      var patch = canonicalUserWarehousePatch(user);
      var currentAllowed = unique(parseWarehouseCodes(user.allowedWarehouseCodes)).join(",");
      if (
        user.role !== patch.role ||
        normalizeWarehouseCodeOrBlank(user.defaultWarehouseCode) !== patch.default_warehouse_code ||
        currentAllowed !== patch.allowed_warehouse_codes ||
        Boolean(user.isGlobalAdmin) !== Boolean(patch.is_global_admin)
      ) {
        patch.updated_at = new Date().toISOString();
        var response = await updateUserRowById(user.id, patch);
        if (response.error) {
          console.warn("Nao foi possivel corrigir vinculo de estoque do usuario " + user.username + ":", response.error);
          continue;
        }
        changed = true;
      }
    }
    return changed;
  }

  async function loadAccessRequests() {
    if (!isSupabaseReady()) return false;
    var response = await supabaseDb
      .from("wms_access_requests")
      .select("id,created_at,updated_at,name,username,matricula,role_requested,job_title,notes,status,approved_by,approved_at,rejected_by,rejected_at,rejection_reason,warehouse_code")
      .order("created_at", { ascending: false });
    if (response.error) {
      authState.accessRequests = [];
      authState.accessRequestsTableAvailable = !isMissingAuthTableError(response.error);
      return authState.accessRequestsTableAvailable;
    }
    authState.accessRequestsTableAvailable = true;
    authState.accessRequests = (response.data || []).map(fromDbAccessRequest);
    moduleLoadState.accessRequests = true;
    return true;
  }

  async function handleLogin() {
    if (authState.loginInProgress) return;
    authState.loginInProgress = true;
    var loginButton = $("loginButton");
    if (loginButton) {
      loginButton.disabled = true;
      loginButton.textContent = "Entrando...";
    }
    try {
      setStatus("loginStatus", "Entrando...", "warning");
    var login = normalizeText($("loginUserInput").value).toLowerCase();
    var password = $("loginPasswordInput").value || "";
    if (!login || !password) {
      setStatus("loginStatus", "Informe usuario e senha.", "error");
      return;
    }
    var authResponse = await signInWithUsername(supabaseDb, login, password, AUTH_EMAIL_DOMAIN);
    if (authResponse.error || !authResponse.data || !authResponse.data.session) {
      setStatus("loginStatus", "Usuario ou senha invalidos", "error");
      return;
    }
    await ensureWarehousesLoaded();
    moduleLoadState.users = false;
    var loaded = await ensureUsersLoaded({ repair: false });
    var user = loaded && authState.users.find(function (item) {
      return item.authUserId === authResponse.data.session.user.id && item.active && item.archived !== true;
    });
    if (!user) {
      await signOutAuthSession(supabaseDb).catch(function () {});
      setStatus("loginStatus", "Usuario ou senha invalidos", "error");
      return;
    }
    var selectedWarehouse = resolveLoginWarehouseForUser(user, "");
    if (!selectedWarehouse) {
      await signOutAuthSession(supabaseDb).catch(function () {});
      setStatus("loginStatus", "Usuario ou senha invalidos", "error");
      return;
    }
    authState.currentUser = user;
    authState.currentSession = authResponse.data.session;
    setActiveWarehouse(selectedWarehouse);
    if (!(await enforceFirstPasswordChange(user))) return;
    invokeUserAdministration(supabaseDb, { action: "touch-login" }).catch(function (error) {
      console.warn("Nao foi possivel registrar o ultimo login:", error);
    });
    $("loginPasswordInput").value = "";
    await enterAuthenticatedApp(true);
    requestBrowserNotificationPermission();
    } catch (error) {
      console.error("Erro ao entrar:", error);
      showLogin("Usuario ou senha invalidos", "error");
    } finally {
      authState.loginInProgress = false;
      if (loginButton) {
        loginButton.disabled = false;
        loginButton.textContent = "Entrar";
      }
    }
  }

  async function enterAuthenticatedApp(showWelcome) {
    document.body.classList.remove("auth-locked");
    document.body.classList.add("auth-unlocked");
    setAuthenticatedShellActive(true);
    applyRoleClass();
    updateLoggedUserUi();
    applyRolePermissions();
    await ensureCoreDataLoaded();
    await applyDataMigrations();
    startTaskPolling();
    startLeaderLiveSync();
    resetSessionInactivityTimeout();
    await showScreen(defaultScreenForUser());
    if (showWelcome) showToast("Bem-vindo, " + authState.currentUser.name + ".", "success");
  }

  function showLogin(message, type) {
    authState.currentUser = null;
    authState.currentSession = null;
    applyRoleClass();
    stopTaskPolling();
    stopLeaderLiveSync();
    resetLazyModuleState(false);
    setAuthenticatedShellActive(false);
    document.body.classList.add("auth-locked");
    document.body.classList.remove("auth-unlocked");
    showLoginForm(false);
    if (message) setStatus("loginStatus", message, type || "warning");
    window.setTimeout(function () {
      if ($("loginUserInput")) $("loginUserInput").focus();
    }, 80);
  }

  function showAccessRequestForm() {
    $("loginForm").hidden = true;
    $("accessRequestForm").hidden = false;
    resetAccessRequestForm();
    window.setTimeout(function () { $("requestNameInput").focus(); }, 60);
  }

  function showLoginForm(clearStatus) {
    if (!$("loginForm") || !$("accessRequestForm")) return;
    $("loginForm").hidden = false;
    $("accessRequestForm").hidden = true;
    if (clearStatus !== false) {
      setStatus("loginStatus", "", "");
      setStatus("accessRequestStatus", "", "");
    }
  }

  function resetAccessRequestForm() {
    ["requestNameInput", "requestUsernameInput", "requestJobInput", "requestNotesInput"].forEach(function (id) {
      $(id).value = "";
    });
    setStatus("accessRequestStatus", "", "");
  }

  async function submitAccessRequest() {
    var name = normalizeText($("requestNameInput").value);
    var username = normalizeText($("requestUsernameInput").value).toLowerCase();
    var jobTitle = normalizeText($("requestJobInput").value);
    var notes = normalizeText($("requestNotesInput").value);
    if (!name || !username) {
      setStatus("accessRequestStatus", "Preencha nome e usuario.", "error");
      return;
    }
    var now = new Date().toISOString();
    var requestRow = {
      id: randomId("req"),
      created_at: now,
      updated_at: now,
      name: name,
      username: username,
      matricula: username,
      role_requested: "OPERADOR",
      job_title: jobTitle,
      notes: notes,
      status: "PENDENTE"
    };
    var response = await supabaseDb.from("wms_access_requests").insert(requestRow);
    if (response.error) {
      setStatus("accessRequestStatus", "Erro ao enviar solicitacao: " + formatSupabaseError(response.error), "error");
      return;
    }
    resetAccessRequestForm();
    setStatus("accessRequestStatus", "Solicitacao enviada. Aguarde aprovacao do administrador.", "success");
  }

  async function logout() {
    stopTaskPolling();
    stopLeaderLiveSync();
    await pauseLocalCacheForContextChange("logout");
    if (sessionInactivityTimer) window.clearTimeout(sessionInactivityTimer);
    sessionInactivityTimer = null;
    if (isSupabaseReady()) await signOutAuthSession(supabaseDb).catch(function () {});
    authState.currentUser = null;
    authState.currentSession = null;
    state = { bindings: [], history: [], products: {} };
    transferState.transfers = [];
    transferState.items = [];
    transferState.events = [];
    resetLazyModuleState(false);
    taskAlertState.initialized = false;
    taskAlertState.signature = "";
    taskAlertState.notifiedReplenishments = {};
    applyRoleClass();
    showLogin("Sessao encerrada.", "success");
  }

  function resolveLoginWarehouseForUser(user, sessionWarehouseCode) {
    var allowed = allowedWarehouseCodesForUser(user);
    if (!allowed.length) return "";
    var preferred = normalizeWarehouseCode(user.defaultWarehouseCode || allowed[0]);
    if (isGlobalAdminUser(user) && sessionWarehouseCode) {
      var sessionCode = normalizeWarehouseCode(sessionWarehouseCode);
      if (allowed.indexOf(sessionCode) >= 0) return sessionCode;
    }
    if (allowed.indexOf(preferred) >= 0) return preferred;
    return allowed[0] || "";
  }

  async function switchActiveWarehouse(code) {
    code = normalizeWarehouseCode(code);
    if (!userCanAccessWarehouse(authState.currentUser, code)) {
      showToast("Seu usuario nao possui acesso ao estoque " + code + ".", "error");
      renderActiveWarehouseUi();
      return;
    }
    if (code === activeWarehouseCode()) return;
    stopLeaderLiveSync();
    await pauseLocalCacheForContextChange("warehouse-switch");
    setActiveWarehouse(code);
    resetLazyModuleState(true);
    await ensureCoreDataLoaded();
    await showScreen(defaultScreenForUser());
    if (!realtimeState.active || realtimeState.warehouseCode !== activeWarehouseCode()) startLeaderLiveSync();
    showToast("Estoque ativo: " + code + ".", "success");
  }

  function renderActiveWarehouseUi() {
    var code = activeWarehouseCode();
    if ($("topWarehouseCode")) $("topWarehouseCode").textContent = code;
    if ($("sidebarWarehouseCode")) $("sidebarWarehouseCode").textContent = "Estoque: " + code;
    var select = $("activeWarehouseSelect");
    if (!select) return;
    var allowed = allowedWarehouseCodesForUser(authState.currentUser);
    select.innerHTML = allowed.map(function (warehouseCode) {
      return "<option value=\"" + escapeHtml(warehouseCode) + "\">" + escapeHtml(warehouseCode + " - " + warehouseNameForCode(warehouseCode)) + "</option>";
    }).join("");
    select.value = code;
    select.hidden = !isGlobalAdmin() || allowed.length <= 1;
  }

  async function enforceFirstPasswordChange(user) {
    if (!user || !user.mustChangePassword) return true;
    var password = window.prompt("Primeiro acesso: informe uma nova senha com pelo menos 8 caracteres.");
    if (!password || password.length < 8) {
      await signOutAuthSession(supabaseDb).catch(function () {});
      showLogin("A troca da senha temporaria e obrigatoria.", "warning");
      return false;
    }
    var confirmPassword = window.prompt("Confirme a nova senha.");
    if (password !== confirmPassword) {
      await signOutAuthSession(supabaseDb).catch(function () {});
      showLogin("As senhas nao conferem. Entre novamente para tentar.", "warning");
      return false;
    }
    try {
      await changeOwnPassword(supabaseDb, password);
      await invokeUserAdministration(supabaseDb, { action: "complete-password-change" });
      user.mustChangePassword = false;
      return true;
    } catch (error) {
      await signOutAuthSession(supabaseDb).catch(function () {});
      showLogin("Nao foi possivel atualizar a senha. Entre novamente.", "error");
      return false;
    }
  }

  function bindSessionInactivityMonitor() {
    ["pointerdown", "keydown", "touchstart"].forEach(function (eventName) {
      document.addEventListener(eventName, resetSessionInactivityTimeout, { passive: true });
    });
  }

  function resetSessionInactivityTimeout() {
    if (!authState.currentUser) return;
    if (sessionInactivityTimer) window.clearTimeout(sessionInactivityTimer);
    sessionInactivityTimer = window.setTimeout(function () {
      logout();
      showToast("Sessao encerrada por inatividade.", "warning");
    }, SESSION_MAX_AGE_MS);
  }

  function updateLoggedUserUi() {
    var user = authState.currentUser;
    if (!user) return;
    ["topUserName", "sidebarUserName"].forEach(function (id) { $(id).textContent = user.name; });
    ["topUserRole", "sidebarUserRole"].forEach(function (id) { $(id).textContent = user.role; });
    renderActiveWarehouseUi();
    updateHeaderConnectionStatus();
  }

  function applyRoleClass() {
    document.body.classList.remove("role-administrador", "role-supervisor", "role-operador");
    if (!authState.currentUser) return;
    document.body.classList.add("role-" + authState.currentUser.role.toLowerCase());
  }

  function defaultScreenForUser() {
    if (!authState.currentUser) return "dashboard";
    if (authState.currentUser.role === "OPERADOR") return "consultaSku";
    return "dashboard";
  }

  function applyRolePermissions() {
    var visibleScreens = 0;
    document.querySelectorAll(".admin-only").forEach(function (element) {
      element.hidden = !isAdmin();
    });
    document.querySelectorAll(".global-admin-only").forEach(function (element) {
      element.hidden = !isGlobalAdmin();
    });
    document.querySelectorAll(".menu-item[data-screen], [data-screen-target]").forEach(function (element) {
      var screenId = element.dataset.screen || element.dataset.screenTarget;
      var allowed = canAccessScreen(screenId);
      element.hidden = !allowed;
      if (allowed && element.classList.contains("menu-item")) visibleScreens += 1;
    });
    if (visibleScreens === 0) showLogin("Seu perfil nao possui permissoes configuradas.", "error");
    document.querySelectorAll(".screen.active").forEach(function (screen) {
      if (!canAccessScreen(screen.id)) showScreen(defaultScreenForUser());
    });
    updateMenuSectionsVisibility();
  }

  function updateMenuSectionsVisibility() {
    document.querySelectorAll(".menu-section").forEach(function (section) {
      var hasVisibleItem = Array.from(section.querySelectorAll(".menu-item")).some(function (item) {
        if (item.hidden) return false;
        if (authState.currentUser && authState.currentUser.role === "OPERADOR" && item.classList.contains("transfer-full-menu")) return false;
        if ((!authState.currentUser || authState.currentUser.role !== "OPERADOR") && item.classList.contains("task-menu-item")) return false;
        return true;
      });
      section.hidden = !hasVisibleItem;
    });
  }

  function isAdmin() {
    return authState.currentUser && authState.currentUser.role === "ADMINISTRADOR";
  }

  function isGlobalAdmin() {
    return isGlobalAdminUser(authState.currentUser);
  }

  function isGlobalAdminUser(user) {
    return !!(user && user.role === "ADMINISTRADOR" && user.isGlobalAdmin === true);
  }

  function canAccessScreen(screenId) {
    // This check controls navigation UX only. Supabase RLS is the authorization boundary.
    if (!authState.currentUser) return false;
    if (screenId === "estoques" || screenId === "manutencao") return isGlobalAdmin();
    var roles = SCREEN_PERMISSIONS[screenId] || ["ADMINISTRADOR"];
    return roles.indexOf(authState.currentUser.role) >= 0;
  }

  function fromDbUser(row) {
    var role = ROLES.indexOf(row.role) >= 0 ? row.role : "OPERADOR";
    var hasStoredWarehouse = Boolean(row.default_warehouse_code || row.warehouse_code || row.allowed_warehouse_codes);
    var allowedWarehouses = parseWarehouseCodes(row.allowed_warehouse_codes || row.warehouse_code);
    var defaultWarehouse = normalizeWarehouseCodeOrBlank(row.default_warehouse_code || row.warehouse_code) || allowedWarehouses[0] || DEFAULT_WAREHOUSE_CODE;
    var repairedWarehouse = removeAccidentalDefaultWarehouse(defaultWarehouse, allowedWarehouses, role === "ADMINISTRADOR");
    defaultWarehouse = repairedWarehouse.defaultCode || defaultWarehouse;
    allowedWarehouses = repairedWarehouse.allowed;
    if (!allowedWarehouses.length) allowedWarehouses = role === "ADMINISTRADOR" ? WAREHOUSE_SEED.map(function (warehouse) { return warehouse.code; }) : [defaultWarehouse];
    var user = {
      id: row.id,
      name: row.name || "",
      username: row.username || "",
      matricula: row.matricula || row.username || "",
      authUserId: row.auth_user_id || "",
      authEmail: row.auth_email || "",
      mustChangePassword: row.must_change_password === true,
      authMigratedAt: row.auth_migrated_at || "",
      role: role,
      active: row.active !== false,
      availableForTasks: row.available_for_tasks !== false,
      archived: row.archived === true,
      archivedAt: row.archived_at || "",
      archivedById: row.archived_by_id || "",
      archivedByName: row.archived_by_name || "",
      supervisorId: row.supervisor_id || "",
      supervisorName: row.supervisor_name || "",
      defaultWarehouseId: row.default_warehouse_id || row.warehouse_id || warehouseIdForCode(defaultWarehouse),
      defaultWarehouseCode: defaultWarehouse,
      allowedWarehouseCodes: allowedWarehouses,
      isGlobalAdmin: role === "ADMINISTRADOR" && row.is_global_admin !== false,
      warehouseAccessConfirmed: hasStoredWarehouse || role === "ADMINISTRADOR",
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
      lastLoginAt: row.last_login_at || ""
    };
    if (!row.default_warehouse_code && !row.warehouse_code) {
      var patch = canonicalUserWarehousePatch(user);
      user.role = patch.role;
      user.defaultWarehouseId = patch.default_warehouse_id;
      user.defaultWarehouseCode = patch.default_warehouse_code;
      user.allowedWarehouseCodes = parseWarehouseCodes(patch.allowed_warehouse_codes);
      user.isGlobalAdmin = patch.role === "ADMINISTRADOR" && patch.is_global_admin !== false;
      user.warehouseAccessConfirmed = user.isGlobalAdmin || Boolean(user.defaultWarehouseCode);
    }
    return user;
  }

  function stripOptionalUserWarehouseColumns(row) {
    var copy = Object.assign({}, row);
    delete copy.default_warehouse_id;
    delete copy.default_warehouse_code;
    delete copy.allowed_warehouse_codes;
    delete copy.is_global_admin;
    return copy;
  }

  function applyUserSchemaFallback(payload, sourceRow, error) {
    var message = formatSupabaseError(error).toLowerCase();
    if (message.indexOf("default_warehouse_code") >= 0) {
      delete payload.default_warehouse_code;
      if (sourceRow.default_warehouse_code) payload.warehouse_code = sourceRow.default_warehouse_code;
      if (sourceRow.default_warehouse_id) payload.warehouse_id = sourceRow.default_warehouse_id;
      return true;
    }
    if (message.indexOf("default_warehouse_id") >= 0) {
      delete payload.default_warehouse_id;
      if (sourceRow.default_warehouse_id) payload.warehouse_id = sourceRow.default_warehouse_id;
      return true;
    }
    var optionalColumns = ["allowed_warehouse_codes", "is_global_admin", "warehouse_id", "warehouse_code", "supervisor_id", "supervisor_name", "archived", "archived_at", "archived_by_id", "archived_by_name"];
    for (var i = 0; i < optionalColumns.length; i += 1) {
      var column = optionalColumns[i];
      if (Object.prototype.hasOwnProperty.call(payload, column) && message.indexOf(column.toLowerCase()) >= 0) {
        delete payload[column];
        return true;
      }
    }
    return false;
  }

  async function upsertUserRow(row) {
    return upsertUserRowWithConflict(row, "id");
  }

  async function upsertUserRowWithConflict(row, onConflict) {
    var payload = Object.assign({}, row);
    for (var attempt = 0; attempt < 8; attempt += 1) {
      var response = await supabaseDb.from("wms_users").upsert(payload, { onConflict: onConflict });
      if (!response.error) return response;
      if (!applyUserSchemaFallback(payload, row, response.error)) return response;
    }
    return supabaseDb.from("wms_users").upsert(payload, { onConflict: onConflict });
  }

  async function updateUserRowById(id, row) {
    var payload = Object.assign({}, row);
    for (var attempt = 0; attempt < 8; attempt += 1) {
      var response = await supabaseDb.from("wms_users").update(payload).eq("id", id);
      if (!response.error) return response;
      if (!applyUserSchemaFallback(payload, row, response.error)) return response;
    }
    return supabaseDb.from("wms_users").update(payload).eq("id", id);
  }

  function fromDbAccessRequest(row) {
    return {
      id: row.id,
      name: row.name || "",
      username: row.username || "",
      matricula: row.matricula || row.username || "",
      roleRequested: row.role_requested || "OPERADOR",
      jobTitle: row.job_title || "",
      notes: row.notes || "",
      status: row.status || "PENDENTE",
      approvedBy: row.approved_by || "",
      approvedAt: row.approved_at || "",
      rejectedBy: row.rejected_by || "",
      rejectedAt: row.rejected_at || "",
      rejectionReason: row.rejection_reason || "",
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || row.created_at || new Date().toISOString()
    };
  }

  function isMissingAuthTableError(error) {
    var message = formatSupabaseError(error).toLowerCase();
    return (message.indexOf("wms_users") >= 0 || message.indexOf("wms_sessions") >= 0 || message.indexOf("wms_access_requests") >= 0) && (
      message.indexOf("schema cache") >= 0 ||
      message.indexOf("does not exist") >= 0 ||
      message.indexOf("not found") >= 0 ||
      message.indexOf("pgrst") >= 0 ||
      message.indexOf("404") >= 0
    );
  }

  async function saveUserFromForm() {
    if (!isAdminOrSupervisor()) {
      setStatus("userFormStatus", "Acesso restrito ao administrador ou supervisor.", "error");
      return;
    }
    var id = $("userEditId").value;
    var name = normalizeText($("userNameInput").value);
    var username = normalizeText($("userUsernameInput").value).toLowerCase();
    var password = $("userPasswordInput").value || "";
    var role = $("userRoleInput").value;
    var active = $("userActiveInput").checked;
    var availableForTasks = $("userAvailableInput").checked;
    var defaultWarehouseCode = normalizeWarehouseCode($("userDefaultWarehouseInput") ? $("userDefaultWarehouseInput").value : activeWarehouseCode());
    var allowedWarehouses = selectedUserWarehouseCodes();
    var supervisorId = $("userSupervisorInput") ? $("userSupervisorInput").value : "";
    var previousUser = id ? authState.users.find(function (item) { return item.id === id; }) : null;
    if (previousUser && !canManageUserRecord(previousUser)) {
      setStatus("userFormStatus", "Voce nao possui permissao para alterar este usuario.", "error");
      return;
    }
    if (isSupervisor()) {
      if (role !== "OPERADOR") {
        setStatus("userFormStatus", "Supervisor so pode cadastrar ou editar operadores.", "error");
        return;
      }
      defaultWarehouseCode = activeWarehouseCode();
      allowedWarehouses = [activeWarehouseCode()];
      if (!supervisorId) supervisorId = authState.currentUser.id;
    }
    if (!isAdmin() && role === "ADMINISTRADOR") {
      setStatus("userFormStatus", "Somente administrador pode criar ou alterar perfil ADMINISTRADOR.", "error");
      return;
    }
    var isGlobal = role === "ADMINISTRADOR" && isAdmin() && $("userGlobalAdminInput") && $("userGlobalAdminInput").checked;
    if (role === "ADMINISTRADOR") {
      allowedWarehouses = activeWarehouseCodes();
      isGlobal = true;
    }
    if (allowedWarehouses.indexOf(defaultWarehouseCode) < 0) allowedWarehouses.push(defaultWarehouseCode);
    var supervisor = supervisorId ? authState.users.find(function (item) { return item.id === supervisorId; }) : null;
    if (role !== "OPERADOR") {
      supervisor = null;
      supervisorId = "";
    }
    if (supervisor && (supervisor.role !== "SUPERVISOR" || !userBelongsToWarehouse(supervisor, defaultWarehouseCode))) {
      setStatus("userFormStatus", "Supervisor responsavel precisa pertencer ao mesmo estoque.", "error");
      return;
    }
    if (!name || !username || ROLES.indexOf(role) === -1) {
      setStatus("userFormStatus", "Preencha nome, usuario e perfil.", "error");
      return;
    }
    var duplicateUser = authState.users.find(function (item) {
      return String(item.username || "").toLowerCase() === username && item.id !== id;
    });
    if (duplicateUser) {
      setStatus("userFormStatus", "Matricula/usuario ja cadastrado para " + duplicateUser.name + ". Clique em Editar nesse usuario para alterar o cadastro.", "error");
      return;
    }
    if (!defaultWarehouseCode || !warehouseExistsAndActive(defaultWarehouseCode)) {
      setStatus("userFormStatus", "Estoque vinculado invalido ou inativo.", "error");
      return;
    }
    if (isSupervisor() && defaultWarehouseCode !== activeWarehouseCode()) {
      setStatus("userFormStatus", "Voce so pode cadastrar usuarios no seu estoque.", "error");
      return;
    }
    if (!id && (!password || password.length < 8)) {
      setStatus("userFormStatus", "Informe uma senha temporaria com pelo menos 8 caracteres.", "error");
      return;
    }
    if (id && password && password.length < 8) {
      setStatus("userFormStatus", "A nova senha temporaria deve ter pelo menos 8 caracteres.", "error");
      return;
    }
    var previousWarehouseCode = previousUser ? normalizeWarehouseCode(previousUser.defaultWarehouseCode) : "";
    var actionButton = $("saveUserButton");
    if (!beginTransferAction("save-user:" + (id || username), actionButton, "Salvando...")) return;
    try {
    var now = new Date().toISOString();
    var row = {
      id: id || randomId("user"),
      name: name,
      username: username,
      matricula: username,
      role: role,
      active: active,
      available_for_tasks: availableForTasks,
      default_warehouse_id: warehouseIdForCode(defaultWarehouseCode),
      default_warehouse_code: defaultWarehouseCode,
      warehouse_id: warehouseIdForCode(defaultWarehouseCode),
      warehouse_code: defaultWarehouseCode,
      allowed_warehouse_codes: unique(allowedWarehouses).join(","),
      is_global_admin: isGlobal,
      supervisor_id: supervisor ? supervisor.id : "",
      supervisor_name: supervisor ? supervisor.name : "",
      updated_at: now
    };
    if (!id) {
      row.created_at = now;
      row.archived = false;
      row.archived_at = null;
      row.archived_by_id = "";
      row.archived_by_name = "";
    }
    var adminResponse;
    try {
      adminResponse = await invokeUserAdministration(supabaseDb, {
        action: id ? "update-user" : "create-user",
        profile: row,
        temporaryPassword: password || undefined
      });
      row.id = adminResponse.userId || row.id;
    } catch (error) {
      setStatus("userFormStatus", "Erro ao salvar usuario: " + formatSupabaseError(error), "error");
      return;
    }
    var confirmResponse = await fetchUsersWithColumns(userSelectColumnList(), userOptionalColumnMap(), function (query) {
      return query.eq("id", row.id).single();
    });
    if (confirmResponse.error) {
      setStatus("userFormStatus", "Usuario salvo, mas nao foi possivel confirmar no Supabase: " + formatSupabaseError(confirmResponse.error), "warning");
      return;
    }
    var savedUser = fromDbUser(confirmResponse.data);
    if (!savedUser.warehouseAccessConfirmed && role !== "ADMINISTRADOR") {
      setStatus("userFormStatus", multiWarehouseSchemaMessage("wms_users"), "error");
      return;
    }
    if (normalizeWarehouseCode(savedUser.defaultWarehouseCode) !== defaultWarehouseCode) {
      setStatus("userFormStatus", "Erro ao confirmar estoque salvo. Esperado " + defaultWarehouseCode + ", gravado " + savedUser.defaultWarehouseCode + ".", "error");
      return;
    }
    await loadUsers({ repair: false });
    await recordAuthHistory(id ? "Usuário atualizado" : "Usuário criado", username, "", name + " - " + role + " - Estoque " + defaultWarehouseCode);
    if (previousWarehouseCode && previousWarehouseCode !== defaultWarehouseCode) {
      await recordAuthHistory("Estoque do usuario alterado", username, "", "De " + previousWarehouseCode + " para " + defaultWarehouseCode + " por " + authState.currentUser.username);
    }
    resetUserForm();
    renderUsers();
    setStatus("userFormStatus", previousWarehouseCode && previousWarehouseCode !== defaultWarehouseCode ? "Usuario atualizado com sucesso. Estoque alterado; a mudanca sera aplicada no proximo login do colaborador." : "Usuario atualizado com sucesso.", "success");
    } finally {
      endTransferAction(actionButton);
    }
  }

  function resetUserForm() {
    $("userEditId").value = "";
    $("userFormTitle").textContent = "Criar usuário";
    $("userNameInput").value = "";
    $("userUsernameInput").value = "";
    $("userUsernameInput").disabled = false;
    $("userPasswordInput").value = "";
    $("userRoleInput").value = "OPERADOR";
    $("userRoleInput").disabled = isSupervisor();
    $("userActiveInput").checked = true;
    $("userAvailableInput").checked = true;
    if ($("userGlobalAdminInput")) $("userGlobalAdminInput").checked = false;
    renderUserWarehouseInputs({ defaultWarehouseCode: activeWarehouseCode(), allowedWarehouseCodes: [activeWarehouseCode()], isGlobalAdmin: false });
    renderUserSupervisorOptions({ role: "OPERADOR", defaultWarehouseCode: activeWarehouseCode(), supervisorId: isSupervisor() ? authState.currentUser.id : "" });
  }

  function renderUserWarehouseInputs(user) {
    var defaultSelect = $("userDefaultWarehouseInput");
    var allowedBox = $("userAllowedWarehousesInput");
    if (!defaultSelect || !allowedBox) return;
    var warehouses = warehouseState.warehouses.filter(function (warehouse) {
      if (warehouse.active === false) return false;
      return isGlobalAdmin() || normalizeWarehouseCode(warehouse.code) === activeWarehouseCode();
    });
    var allowed = user && user.isGlobalAdmin ? warehouses.map(function (warehouse) { return warehouse.code; }) : parseWarehouseCodes(user && user.allowedWarehouseCodes);
    if (!allowed.length) allowed = [normalizeWarehouseCode(user && user.defaultWarehouseCode || activeWarehouseCode())];
    var defaultCode = normalizeWarehouseCode(user && user.defaultWarehouseCode || allowed[0] || activeWarehouseCode());
    if (isSupervisor()) {
      defaultCode = activeWarehouseCode();
      allowed = [activeWarehouseCode()];
    }
    defaultSelect.innerHTML = warehouses.map(function (warehouse) {
      return "<option value=\"" + escapeHtml(warehouse.code) + "\">" + escapeHtml(warehouse.code + " - " + warehouse.name) + "</option>";
    }).join("");
    defaultSelect.value = defaultCode;
    defaultSelect.disabled = isSupervisor();
    allowedBox.innerHTML = warehouses.map(function (warehouse) {
      var checked = allowed.indexOf(warehouse.code) >= 0 ? " checked" : "";
      var disabled = isSupervisor() ? " disabled" : "";
      return "<label class=\"checkbox-label\"><input type=\"checkbox\" value=\"" + escapeHtml(warehouse.code) + "\"" + checked + disabled + "> " + escapeHtml(warehouse.code + " - " + warehouse.name) + "</label>";
    }).join("");
    renderUserSupervisorOptions(Object.assign({}, user || {}, { defaultWarehouseCode: defaultCode }));
  }

  function renderUserSupervisorOptions(user) {
    var select = $("userSupervisorInput");
    if (!select) return;
    var role = user && user.role ? user.role : ($("userRoleInput") ? $("userRoleInput").value : "OPERADOR");
    var warehouseCode = normalizeWarehouseCode(user && user.defaultWarehouseCode || ($("userDefaultWarehouseInput") ? $("userDefaultWarehouseInput").value : activeWarehouseCode()));
    var supervisors = authState.users.filter(function (item) {
      return item.role === "SUPERVISOR" && item.active && item.archived !== true && userBelongsToWarehouse(item, warehouseCode);
    }).sort(function (a, b) {
      return String(a.name || a.username).localeCompare(String(b.name || b.username));
    });
    var selectedId = user && user.supervisorId ? user.supervisorId : "";
    if (isSupervisor() && role === "OPERADOR") selectedId = selectedId || authState.currentUser.id;
    select.innerHTML = "<option value=\"\">Sem supervisor definido</option>" + supervisors.map(function (item) {
      return "<option value=\"" + escapeHtml(item.id) + "\">" + escapeHtml(item.name + " (" + item.defaultWarehouseCode + ")") + "</option>";
    }).join("");
    select.value = selectedId;
    select.disabled = role !== "OPERADOR";
  }

  function selectedUserWarehouseCodes() {
    if (isSupervisor()) return [activeWarehouseCode()];
    var allowedBox = $("userAllowedWarehousesInput");
    if (!allowedBox) return [activeWarehouseCode()];
    var selected = Array.from(allowedBox.querySelectorAll("input[type=\"checkbox\"]:checked")).map(function (input) {
      return normalizeWarehouseCode(input.value);
    });
    return selected.length ? unique(selected) : [activeWarehouseCode()];
  }

  function renderUsers() {
    if (!$("userGroups") || !isAdminOrSupervisor()) return;
    syncUserFilterControls();
    var users = filteredUsersForManagement();
    var validIds = {};
    users.forEach(function (user) { validIds[user.id] = true; });
    Object.keys(userManagementState.selectedIds).forEach(function (id) {
      if (!validIds[id]) delete userManagementState.selectedIds[id];
    });
    renderUserDiagnostics();
    renderUserBulkControls();
    $("userGroups").innerHTML = users.length ? groupedUserCardsHtml(users) : "<div class=\"empty-state\">Nenhum usuario encontrado para os filtros atuais.</div>";
    renderAccessRequests();
    renderWarehouses();
  }

  function syncUserFilterControls() {
    document.querySelectorAll("[data-user-tab]").forEach(function (button) {
      button.classList.toggle("active", button.dataset.userTab === userManagementState.tab);
    });
    fillUserSelect("userWarehouseFilter", userWarehouseFilterOptions(), userFilterValue("userWarehouseFilter"));
    fillUserSelect("userRoleFilter", [
      { value: "", label: "Todos" },
      { value: "ADMINISTRADOR", label: "Administrador" },
      { value: "SUPERVISOR", label: "Supervisor" },
      { value: "OPERADOR", label: "Operador" }
    ], userFilterValue("userRoleFilter"));
    fillUserSelect("userSupervisorFilter", userSupervisorFilterOptions(), userFilterValue("userSupervisorFilter"));
  }

  function userFilterValue(id) {
    return $(id) ? $(id).value : "";
  }

  function fillUserSelect(id, options, selectedValue) {
    var select = $(id);
    if (!select) return;
    select.innerHTML = options.map(function (option) {
      return "<option value=\"" + escapeHtml(option.value) + "\">" + escapeHtml(option.label) + "</option>";
    }).join("");
    select.value = options.some(function (option) { return option.value === selectedValue; }) ? selectedValue : "";
  }

  function userWarehouseFilterOptions() {
    var warehouses = warehouseState.warehouses.filter(function (warehouse) {
      return warehouse.active !== false && (isGlobalAdmin() || normalizeWarehouseCode(warehouse.code) === activeWarehouseCode());
    });
    return [{ value: "", label: isGlobalAdmin() ? "Todos os estoques" : activeWarehouseCode() }].concat(warehouses.map(function (warehouse) {
      return { value: warehouse.code, label: warehouse.code + " - " + warehouse.name };
    }));
  }

  function userSupervisorFilterOptions() {
    var warehouse = normalizeWarehouseCodeOrBlank(userFilterValue("userWarehouseFilter")) || activeWarehouseCode();
    var supervisors = authState.users.filter(function (user) {
      if (user.role !== "SUPERVISOR" || user.archived === true) return false;
      if (isGlobalAdmin() && userFilterValue("userWarehouseFilter") === "") return true;
      return normalizeWarehouseCodeOrBlank(user.defaultWarehouseCode) === warehouse;
    }).sort(function (a, b) {
      return String(a.name || a.username).localeCompare(String(b.name || b.username));
    });
    var seen = {};
    var options = [{ value: "", label: "Todos" }, { value: "__none", label: "Sem supervisor definido" }];
    supervisors.forEach(function (user) {
      if (seen[user.id]) return;
      seen[user.id] = true;
      options.push({ value: user.id, label: user.name + " (" + user.defaultWarehouseCode + ")" });
    });
    return options;
  }

  function filteredUsersForManagement() {
    var query = normalizeText(userFilterValue("userSearchInput")).toLowerCase();
    var warehouse = normalizeWarehouseCodeOrBlank(userFilterValue("userWarehouseFilter"));
    var role = userFilterValue("userRoleFilter");
    var supervisor = userFilterValue("userSupervisorFilter");
    var status = userFilterValue("userStatusFilter");
    var availability = userFilterValue("userAvailabilityFilter");
    return visibleUsersForManagement().filter(function (user) {
      if (userManagementState.tab === "ativos" && (!user.active || user.archived === true)) return false;
      if (userManagementState.tab === "inativos" && (user.active || user.archived === true)) return false;
      if (userManagementState.tab === "arquivados" && user.archived !== true) return false;
      if (warehouse && !userBelongsToWarehouse(user, warehouse)) return false;
      if (role && user.role !== role) return false;
      if (status === "active" && (!user.active || user.archived === true)) return false;
      if (status === "inactive" && (user.active || user.archived === true)) return false;
      if (status === "archived" && user.archived !== true) return false;
      if (availability === "available" && !user.availableForTasks) return false;
      if (availability === "unavailable" && user.availableForTasks) return false;
      if (supervisor === "__none" && (user.role !== "OPERADOR" || user.supervisorId)) return false;
      if (supervisor && supervisor !== "__none" && user.supervisorId !== supervisor) return false;
      if (query && !isNamedUser(user, query)) return false;
      return true;
    }).sort(function (a, b) {
      return [a.defaultWarehouseCode || "", a.supervisorName || "", a.name || a.username].join("|").localeCompare([b.defaultWarehouseCode || "", b.supervisorName || "", b.name || b.username].join("|"));
    });
  }

  function renderUserDiagnostics() {
    var box = $("userDiagnostics");
    if (!box) return;
    var users = visibleUsersForManagement();
    var seenUsernames = {};
    var duplicateCount = 0;
    users.forEach(function (user) {
      var key = String(user.username || user.matricula || "").toLowerCase();
      if (!key) return;
      if (seenUsernames[key]) duplicateCount += 1;
      seenUsernames[key] = true;
    });
    var oldLimit = Date.now() - 1000 * 60 * 60 * 24 * 60;
    var oldLogin = users.filter(function (user) {
      return !user.lastLoginAt || new Date(user.lastLoginAt).getTime() < oldLimit;
    }).length;
    var metrics = [
      ["Ativos", users.filter(function (user) { return user.active && user.archived !== true; }).length],
      ["Inativos", users.filter(function (user) { return !user.active && user.archived !== true; }).length],
      ["Arquivados", users.filter(function (user) { return user.archived === true; }).length],
      ["Sem estoque", users.filter(function (user) { return !user.defaultWarehouseCode; }).length],
      ["Sem supervisor", users.filter(function (user) { return user.role === "OPERADOR" && !user.supervisorId; }).length],
      ["Disponíveis", users.filter(function (user) { return user.active && user.archived !== true && user.availableForTasks; }).length],
      ["Indisponíveis", users.filter(function (user) { return !user.availableForTasks; }).length],
      ["Login antigo", oldLogin],
      ["Duplicados", duplicateCount]
    ];
    box.innerHTML = metrics.map(function (item) {
      return "<div><span>" + escapeHtml(item[0]) + "</span><strong>" + item[1] + "</strong></div>";
    }).join("");
  }

  function groupedUserCardsHtml(users) {
    var byWarehouse = {};
    users.forEach(function (user) {
      var warehouse = user.defaultWarehouseCode || "SEM_ESTOQUE";
      if (!byWarehouse[warehouse]) byWarehouse[warehouse] = {};
      var supervisorKey = user.role === "OPERADOR" ? (user.supervisorId || "__none") : "__role_" + user.role;
      if (!byWarehouse[warehouse][supervisorKey]) {
        byWarehouse[warehouse][supervisorKey] = {
          label: user.role === "OPERADOR" ? (user.supervisorName || "Sem supervisor definido") : user.role,
          users: []
        };
      }
      byWarehouse[warehouse][supervisorKey].users.push(user);
    });
    return Object.keys(byWarehouse).sort().map(function (warehouse) {
      var groups = byWarehouse[warehouse];
      return [
        "<details class=\"user-warehouse-group\" open>",
        "<summary><strong>" + escapeHtml(warehouse) + "</strong><span>" + users.filter(function (user) { return (user.defaultWarehouseCode || "SEM_ESTOQUE") === warehouse; }).length + " usuario(s)</span></summary>",
        Object.keys(groups).sort(function (a, b) { return groups[a].label.localeCompare(groups[b].label); }).map(function (key) {
          var group = groups[key];
          return [
            "<details class=\"user-supervisor-group\" open>",
            "<summary><strong>" + escapeHtml(group.label) + "</strong><span>" + group.users.length + " usuario(s)</span></summary>",
            "<div class=\"user-card-grid\">" + group.users.map(userCardHtml).join("") + "</div>",
            "</details>"
          ].join("");
        }).join(""),
        "</details>"
      ].join("");
    }).join("");
  }

  function userCardHtml(user) {
    var protectedUser = isProtectedUserForDestructiveAction(user);
    var checked = userManagementState.selectedIds[user.id] ? " checked" : "";
    var archivedBadge = user.archived ? "<span class=\"status-badge inactive\">Arquivado</span>" : "";
    return [
      "<article class=\"user-card" + (user.archived ? " is-archived" : "") + "\">",
      "<div class=\"user-card-head\">",
      "<label class=\"checkbox-label\"><input data-user-select=\"" + escapeHtml(user.id) + "\" type=\"checkbox\"" + checked + (protectedUser ? " disabled" : "") + "> <span><strong>" + escapeHtml(user.name || "-") + "</strong><small>" + escapeHtml(user.username || user.matricula || "-") + "</small></span></label>",
      "<span class=\"role-badge\">" + escapeHtml(user.role) + "</span>",
      "</div>",
      "<div class=\"user-card-meta\">",
      "<span>Estoque <strong>" + escapeHtml(user.defaultWarehouseCode || "-") + "</strong></span>",
      "<span>Permitidos <strong>" + escapeHtml((allowedWarehouseCodesForUser(user) || []).join(", ") || "-") + "</strong></span>",
      "<span>Supervisor <strong>" + escapeHtml(user.supervisorName || "Sem supervisor") + "</strong></span>",
      "<span>Status <strong>" + (user.active ? "Ativo" : "Inativo") + "</strong></span>",
      "<span>Tarefas <strong>" + (user.availableForTasks ? "Sim" : "Nao") + "</strong></span>",
      "<span>Último login <strong>" + escapeHtml(formatDateTime(user.lastLoginAt)) + "</strong></span>",
      "</div>",
      "<div class=\"user-card-status\"><span class=\"status-badge " + (user.active ? "active" : "inactive") + "\">" + (user.active ? "Ativo" : "Inativo") + "</span>" + archivedBadge + "</div>",
      "<div class=\"row-actions user-card-actions\">",
      "<button class=\"edit-small\" data-user-edit=\"" + escapeHtml(user.id) + "\" type=\"button\">Editar</button>",
      "<button class=\"secondary-button\" data-user-reset=\"" + escapeHtml(user.id) + "\" type=\"button\">Redefinir senha</button>",
      user.archived ? "" : "<button class=\"remove-small\" data-user-toggle=\"" + escapeHtml(user.id) + "\" type=\"button\">" + (user.active ? "Desativar" : "Ativar") + "</button>",
      "<button class=\"secondary-button\" data-user-archive=\"" + escapeHtml(user.id) + "\" type=\"button\">" + (user.archived ? "Desarquivar" : "Arquivar") + "</button>",
      isGlobalAdmin() ? "<button class=\"remove-small\" data-user-delete=\"" + escapeHtml(user.id) + "\" type=\"button\">Excluir definitivo</button>" : "",
      "</div>",
      "</article>"
    ].join("");
  }

  function renderUserBulkControls() {
    var selected = selectedManageableUsers();
    if ($("userSelectionCount")) $("userSelectionCount").textContent = selected.length + " selecionado(s)";
    fillUserSelect("bulkUserSupervisorSelect", userSupervisorFilterOptions(), $("bulkUserSupervisorSelect") ? $("bulkUserSupervisorSelect").value : "");
    fillUserSelect("bulkUserWarehouseSelect", userWarehouseFilterOptions().filter(function (option) { return option.value; }), $("bulkUserWarehouseSelect") ? $("bulkUserWarehouseSelect").value : "");
    if ($("bulkUserWarehouseButton")) $("bulkUserWarehouseButton").hidden = !isGlobalAdmin();
  }

  function selectedManageableUsers() {
    return Object.keys(userManagementState.selectedIds).map(function (id) {
      return authState.users.find(function (user) { return user.id === id; });
    }).filter(function (user) {
      return user && canManageUserRecord(user) && !isProtectedUserForDestructiveAction(user);
    });
  }

  function isProtectedUserForDestructiveAction(user) {
    if (!user) return true;
    if (authState.currentUser && user.id === authState.currentUser.id) return true;
    if (String(user.username || "").toLowerCase() === "admin" || user.id === "user-admin") return true;
    return false;
  }

  function isLastActiveAdmin(user) {
    if (!user || user.role !== "ADMINISTRADOR" || !user.active || user.archived === true) return false;
    var admins = authState.users.filter(function (item) {
      return item.role === "ADMINISTRADOR" && item.active && item.archived !== true;
    });
    return admins.length <= 1;
  }

  function assertCanDestructUser(user, actionName) {
    if (!user || !canManageUserRecord(user)) {
      showToast("Voce nao possui permissao para alterar este usuario.", "error");
      return false;
    }
    if (isProtectedUserForDestructiveAction(user)) {
      showToast("Nao e permitido " + actionName + " o usuario principal ou o usuario logado.", "error");
      return false;
    }
    if (isLastActiveAdmin(user)) {
      showToast("Nao e permitido " + actionName + " o ultimo administrador ativo.", "error");
      return false;
    }
    return true;
  }

  async function archiveUser(id, archived) {
    var user = authState.users.find(function (item) { return item.id === id; });
    if (!assertCanDestructUser(user, archived ? "arquivar" : "desarquivar")) return;
    var now = new Date().toISOString();
    var patch = {
      archived: archived,
      archived_at: archived ? now : null,
      archived_by_id: archived ? authState.currentUser.id : "",
      archived_by_name: archived ? authState.currentUser.name : "",
      available_for_tasks: archived ? false : user.availableForTasks,
      active: archived ? false : user.active,
      updated_at: now
    };
    var response = await updateUserRowById(user.id, patch);
    if (response.error) {
      showToast("Nao foi possivel arquivar usuario: " + formatSupabaseError(response.error), "error");
      return;
    }
    await loadUsers({ repair: false });
    await recordAuthHistory(archived ? "Usuário arquivado" : "Usuário desarquivado", user.username, "", user.name);
    delete userManagementState.selectedIds[user.id];
    renderUsers();
  }

  async function deleteUserDefinitively(id) {
    if (!isGlobalAdmin()) {
      showToast("Somente administrador geral pode excluir definitivamente.", "error");
      return;
    }
    var user = authState.users.find(function (item) { return item.id === id; });
    if (!assertCanDestructUser(user, "excluir")) return;
    var hasLinks = await userHasOperationalLinks(user);
    if (hasLinks) {
      showToast("Este usuario possui registros operacionais. Ele sera arquivado e desativado para preservar o historico.", "warning");
      await archiveUser(user.id, true);
      return;
    }
    var confirmation = window.prompt("Digite EXCLUIR para confirmar a exclusao definitiva de " + user.name + ".");
    if (confirmation !== "EXCLUIR") return;
    try {
      await invokeUserAdministration(supabaseDb, { action: "delete-user", userId: user.id });
    } catch (error) {
      showToast("Nao foi possivel excluir usuario: " + formatSupabaseError(error), "error");
      return;
    }
    await recordAuthHistory("Usuário excluído definitivamente", user.username, "", user.name);
    delete userManagementState.selectedIds[user.id];
    await loadUsers({ repair: false });
    renderUsers();
  }

  async function userHasOperationalLinks(user) {
    var checks = [
      { table: "wms_transfers", column: "responsavel_id" },
      { table: "wms_transfers", column: "criado_por_id" },
      { table: "wms_transfer_items", column: "added_by_id" },
      { table: "wms_transfer_divergences", column: "user_id" },
      { table: "wms_replenishment_requests", column: "responsavel_id" },
      { table: "wms_replenishment_requests", column: "solicitado_por_id" },
      { table: "wms_replenishment_requests", column: "claimed_by_id" },
      { table: "wms_replenishment_requests", column: "created_by_id" },
      { table: "wms_notifications", column: "user_id" },
      { table: "wms_task_notifications", column: "user_id" },
      { table: "wms_sessions", column: "user_id" },
      { table: "wms_stock_import_batches", column: "imported_by_id" },
      { table: "wms_history", column: "details", textSearch: true }
    ];
    for (var i = 0; i < checks.length; i += 1) {
      var check = checks[i];
      try {
        var query = supabaseDb.from(check.table).select("id", { count: "exact", head: true });
        query = check.textSearch ? query.ilike(check.column, "%" + user.username + "%") : query.eq(check.column, user.id);
        var response = await query;
        if (!response.error && Number(response.count || 0) > 0) return true;
      } catch (error) {
        recordPerformanceError("user-link-check-" + check.table, error);
      }
    }
    return false;
  }

  async function bulkUpdateUsers(patch, actionLabel) {
    var selected = selectedManageableUsers();
    if (!selected.length) {
      showToast("Selecione usuarios validos para " + actionLabel + ".", "warning");
      return;
    }
    var now = new Date().toISOString();
    for (var i = 0; i < selected.length; i += 1) {
      var user = selected[i];
      if (!assertCanDestructUser(user, actionLabel)) continue;
      if (user.archived === true && patch.available_for_tasks === true) continue;
      await updateUserRowById(user.id, Object.assign({}, patch, { updated_at: now }));
    }
    userManagementState.selectedIds = {};
    await loadUsers({ repair: false });
    renderUsers();
  }

  async function bulkArchiveUsers() {
    var selected = selectedManageableUsers();
    if (!selected.length) {
      showToast("Selecione usuarios para arquivar.", "warning");
      return;
    }
    var now = new Date().toISOString();
    for (var i = 0; i < selected.length; i += 1) {
      var user = selected[i];
      if (!assertCanDestructUser(user, "arquivar")) continue;
      await updateUserRowById(user.id, {
        active: false,
        available_for_tasks: false,
        archived: true,
        archived_at: now,
        archived_by_id: authState.currentUser.id,
        archived_by_name: authState.currentUser.name,
        updated_at: now
      });
    }
    userManagementState.selectedIds = {};
    await loadUsers({ repair: false });
    renderUsers();
  }

  async function bulkMoveUsersWarehouse() {
    if (!isGlobalAdmin()) return;
    var warehouseCode = normalizeWarehouseCodeOrBlank($("bulkUserWarehouseSelect") ? $("bulkUserWarehouseSelect").value : "");
    if (!warehouseCode || !warehouseExistsAndActive(warehouseCode)) {
      showToast("Selecione um estoque valido.", "warning");
      return;
    }
    await bulkUpdateUsers({
      default_warehouse_id: warehouseIdForCode(warehouseCode),
      default_warehouse_code: warehouseCode,
      warehouse_id: warehouseIdForCode(warehouseCode),
      warehouse_code: warehouseCode,
      allowed_warehouse_codes: warehouseCode,
      supervisor_id: "",
      supervisor_name: ""
    }, "alterar estoque");
  }

  async function bulkLinkUsersSupervisor() {
    var supervisorId = $("bulkUserSupervisorSelect") ? $("bulkUserSupervisorSelect").value : "";
    if (!supervisorId || supervisorId === "__none") {
      showToast("Selecione um supervisor.", "warning");
      return;
    }
    var supervisor = authState.users.find(function (user) { return user.id === supervisorId; });
    if (!supervisor || supervisor.role !== "SUPERVISOR") {
      showToast("Supervisor invalido.", "error");
      return;
    }
    var selected = selectedManageableUsers().filter(function (user) { return user.role === "OPERADOR"; });
    if (!selected.length) {
      showToast("Selecione operadores para vincular.", "warning");
      return;
    }
    for (var i = 0; i < selected.length; i += 1) {
      if (!userBelongsToWarehouse(supervisor, selected[i].defaultWarehouseCode)) continue;
      await updateUserRowById(selected[i].id, {
        supervisor_id: supervisor.id,
        supervisor_name: supervisor.name,
        updated_at: new Date().toISOString()
      });
    }
    userManagementState.selectedIds = {};
    await loadUsers({ repair: false });
    renderUsers();
  }

  function renderWarehouses() {
    if (!$("warehouseRows") || !isGlobalAdmin()) return;
    var rows = warehouseState.warehouses.map(function (warehouse) {
      var code = normalizeWarehouseCode(warehouse.code);
      var userCount = authState.users.filter(function (user) {
        return allowedWarehouseCodesForUser(user).indexOf(code) >= 0;
      }).length;
      var bindingCount = code === activeWarehouseCode() ? state.bindings.length : "-";
      var transferCount = code === activeWarehouseCode() ? transferState.transfers.length : "-";
      return [
        "<tr>",
        "<td><strong>" + escapeHtml(code) + "</strong></td>",
        "<td>" + escapeHtml(warehouse.name || "-") + "</td>",
        "<td><span class=\"status-badge " + (warehouse.active !== false ? "active" : "inactive") + "\">" + (warehouse.active !== false ? "Ativo" : "Inativo") + "</span></td>",
        "<td>" + userCount + "</td>",
        "<td>" + bindingCount + "</td>",
        "<td>" + transferCount + "</td>",
        "</tr>"
      ].join("");
    });
    $("warehouseRows").innerHTML = rows.length ? rows.join("") : "<tr><td colspan=\"6\">Nenhum estoque cadastrado.</td></tr>";
    if ($("warehouseStatus")) setStatus("warehouseStatus", "Resumo do estoque ativo: " + activeWarehouseCode() + ".", "success");
  }

  function renderAccessRequests() {
    if (!$("accessRequestsRows") || !isAdminOrSupervisor()) return;
    var pending = authState.accessRequests.filter(function (item) {
      return item.status === "PENDENTE";
    });
    $("accessRequestsRows").innerHTML = pending.length ? pending.map(accessRequestRowHtml).join("") : "<tr><td colspan=\"5\">Nenhuma solicitação pendente.</td></tr>";
  }

  function accessRequestRowHtml(request) {
    return [
      "<tr>",
      "<td><strong>" + escapeHtml(request.name) + "</strong><br><span class=\"muted\">" + escapeHtml(request.username) + "</span></td>",
      "<td>" + escapeHtml(request.jobTitle || "-") + "</td>",
      "<td>" + formatDateTime(request.createdAt) + "</td>",
      "<td><span class=\"status-badge pending\">" + escapeHtml(request.status) + "</span></td>",
      "<td><div class=\"row-actions\"><button class=\"edit-small\" data-request-approve=\"" + request.id + "\" type=\"button\">Aprovar</button><button class=\"remove-small\" data-request-reject=\"" + request.id + "\" type=\"button\">Recusar</button></div></td>",
      "</tr>"
    ].join("");
  }

  async function handleUserTableClick(event) {
    var selectInput = event.target.closest("input[data-user-select]");
    if (selectInput) {
      if (selectInput.checked) userManagementState.selectedIds[selectInput.dataset.userSelect] = true;
      else delete userManagementState.selectedIds[selectInput.dataset.userSelect];
      renderUserBulkControls();
      return;
    }
    var actionButton = event.target.closest("button");
    if (!actionButton) return;
    var editId = actionButton.dataset.userEdit;
    var resetId = actionButton.dataset.userReset;
    var toggleId = actionButton.dataset.userToggle;
    var archiveId = actionButton.dataset.userArchive;
    var deleteId = actionButton.dataset.userDelete;
    var approveId = actionButton.dataset.requestApprove;
    var rejectId = actionButton.dataset.requestReject;
    if (editId) editUser(editId);
    if (resetId) await resetUserPassword(resetId);
    if (toggleId) await toggleUserActive(toggleId);
    if (archiveId) {
      var archiveUserRecord = authState.users.find(function (item) { return item.id === archiveId; });
      await archiveUser(archiveId, !(archiveUserRecord && archiveUserRecord.archived));
    }
    if (deleteId) await deleteUserDefinitively(deleteId);
    if (approveId) await approveAccessRequest(approveId);
    if (rejectId) await rejectAccessRequest(rejectId);
  }

  function editUser(id) {
    var user = authState.users.find(function (item) { return item.id === id; });
    if (!user) return;
    if (!canManageUserRecord(user)) {
      showToast("Voce nao possui permissao para editar este usuario.", "error");
      return;
    }
    $("userEditId").value = user.id;
    $("userFormTitle").textContent = "Editar usuário";
    $("userNameInput").value = user.name;
    $("userUsernameInput").value = user.username;
    $("userUsernameInput").disabled = false;
    $("userPasswordInput").value = "";
    $("userRoleInput").value = user.role;
    $("userRoleInput").disabled = isSupervisor();
    $("userActiveInput").checked = user.active;
    $("userAvailableInput").checked = user.availableForTasks;
    if ($("userGlobalAdminInput")) $("userGlobalAdminInput").checked = user.isGlobalAdmin === true;
    renderUserWarehouseInputs(user);
    renderUserSupervisorOptions(user);
    setStatus("userFormStatus", "Editando " + user.name + ". Uma nova senha será temporária e exigirá troca no próximo acesso.", "warning");
  }

  async function resetUserPassword(id) {
    var user = authState.users.find(function (item) { return item.id === id; });
    if (!user) return;
    if (!canManageUserRecord(user)) {
      showToast("Voce nao possui permissao para redefinir este usuario.", "error");
      return;
    }
    var password = window.prompt("Nova senha para " + user.name + ":");
    if (!password) return;
    if (password.length < 8) {
      showToast("A senha temporaria deve ter ao menos 8 caracteres.", "error");
      return;
    }
    try {
      await invokeUserAdministration(supabaseDb, { action: "reset-password", userId: user.id, temporaryPassword: password });
    } catch (error) {
      showToast("Nao foi possivel redefinir a senha: " + formatSupabaseError(error), "error");
      return;
    }
    await recordAuthHistory("Senha redefinida", user.username, "", user.name);
    showToast("Senha redefinida.", "success");
  }

  async function toggleUserActive(id) {
    var user = authState.users.find(function (item) { return item.id === id; });
    if (!user) return;
    if (!canManageUserRecord(user)) {
      showToast("Voce nao possui permissao para alterar este usuario.", "error");
      return;
    }
    if (user.archived === true) {
      showToast("Desarquive o usuario antes de alterar o status.", "warning");
      return;
    }
    if (user.active && !assertCanDestructUser(user, "desativar")) {
      return;
    }
    var patch = { active: !user.active, updated_at: new Date().toISOString() };
    if (user.active) patch.available_for_tasks = false;
    var response = await updateUserRowById(user.id, patch);
    if (response.error) {
      showToast("Nao foi possivel alterar o status.", "error");
      return;
    }
    await loadUsers();
    await recordAuthHistory(user.active ? "Usuário desativado" : "Usuário ativado", user.username, "", user.name);
    renderUsers();
  }

  async function approveAccessRequest(id) {
    if (!isAdminOrSupervisor()) return;
    var request = authState.accessRequests.find(function (item) { return item.id === id; });
    if (!request || request.status !== "PENDENTE") return;
    var duplicate = authState.users.find(function (item) {
      return String(item.username).toLowerCase() === String(request.username).toLowerCase();
    });
    if (duplicate) {
      showToast("Usuario ja cadastrado.", "error");
      return;
    }
    var temporaryPassword = window.prompt("Defina uma senha temporaria com pelo menos 8 caracteres para " + request.name + ":");
    if (!temporaryPassword || temporaryPassword.length < 8) {
      showToast("Aprovacao cancelada: senha temporaria invalida.", "warning");
      return;
    }
    var now = new Date().toISOString();
    var userRow = {
      id: randomId("user"),
      created_at: now,
      updated_at: now,
      name: request.name,
      username: request.username,
      matricula: request.matricula || request.username,
      role: "OPERADOR",
      active: true,
      available_for_tasks: true,
      default_warehouse_id: activeWarehouseId(),
      default_warehouse_code: activeWarehouseCode(),
      warehouse_id: activeWarehouseId(),
      warehouse_code: activeWarehouseCode(),
      allowed_warehouse_codes: activeWarehouseCode(),
      is_global_admin: false,
      supervisor_id: isSupervisor() ? authState.currentUser.id : "",
      supervisor_name: isSupervisor() ? authState.currentUser.name : "",
      archived: false,
      last_login_at: null
    };
    try {
      await invokeUserAdministration(supabaseDb, { action: "create-user", profile: userRow, temporaryPassword: temporaryPassword });
    } catch (error) {
      showToast("Erro ao aprovar: " + formatSupabaseError(error), "error");
      return;
    }
    var requestResponse = await supabaseDb
      .from("wms_access_requests")
      .update({
        status: "APROVADA",
        approved_by: authState.currentUser.username,
        approved_at: now,
        updated_at: now
      })
      .eq("id", request.id);
    if (requestResponse.error) {
      showToast("Usuario criado, mas a solicitacao nao foi atualizada.", "warning");
    }
    await recordAuthHistory("Solicitação aprovada", request.username, "", request.name);
    await loadUsers();
    await loadAccessRequests();
    renderUsers();
    showToast("Solicitação aprovada.", "success");
  }

  async function rejectAccessRequest(id) {
    if (!isAdminOrSupervisor()) return;
    var request = authState.accessRequests.find(function (item) { return item.id === id; });
    if (!request || request.status !== "PENDENTE") return;
    var reason = window.prompt("Motivo da recusa (opcional):") || "";
    var now = new Date().toISOString();
    var response = await supabaseDb
      .from("wms_access_requests")
      .update({
        status: "RECUSADA",
        rejected_by: authState.currentUser.username,
        rejected_at: now,
        rejection_reason: reason,
        updated_at: now
      })
      .eq("id", request.id);
    if (response.error) {
      showToast("Erro ao recusar: " + formatSupabaseError(response.error), "error");
      return;
    }
    await recordAuthHistory("Solicitação recusada", request.username, "", request.name + (reason ? " - " + reason : ""));
    await loadAccessRequests();
    renderUsers();
    showToast("Solicitação recusada.", "success");
  }

  async function seedIfEmpty() {
    if (state.bindings.length > 0) return;
    var samples = [
      ["89261", "R01-RK01-L01-A", 1],
      ["48139", "R01-RK01-L01-B", 2],
      ["84915", "R02-RK01-L02-A", 3],
      ["87842", "R03-RK02-L01-C", 4],
      ["90249", "R04-RK01-L03-A", 5]
    ];
    samples.forEach(function (item) {
      var parsed = normalizeLocation(item[1]);
      if (parsed.valid) {
        state.bindings.push(createBinding(item[0], parsed, item[2]));
      }
    });
    addHistory("Dados de exemplo criados", "", "", "Carga inicial automatica");
    await saveData();
  }

  async function applyDataMigrations() {
    var changed = false;
    state.bindings.forEach(function (binding) {
      var area = getAreaByCode(binding.areaCode);
      if (area && binding.areaName !== area.name) {
        binding.areaName = area.name;
        changed = true;
      }
      var productName = findProductName(binding.sku);
      if (productName && binding.productName !== productName) {
        binding.productName = productName;
        changed = true;
      }
    });
    if (changed) await saveData();
  }

  function bindNavigation() {
    document.querySelectorAll(".menu-item").forEach(function (button) {
      button.addEventListener("click", function () {
        showScreen(button.dataset.screen);
      });
    });

    document.querySelectorAll("[data-screen-target]").forEach(function (button) {
      button.addEventListener("click", function () {
        showScreen(button.dataset.screenTarget);
      });
    });

    $("menuToggle").addEventListener("click", function () {
      $("sidebar").classList.toggle("open");
    });
  }

  async function showScreen(screenId) {
    if (!authState.currentUser) {
      showLogin("Entre para acessar o sistema.", "warning");
      return;
    }
    if (isRemovedScreen(screenId)) {
      showToast("Modulo removido da operacao atual.", "warning");
      screenId = defaultScreenForUser();
    }
    if (!canAccessScreen(screenId)) {
      showToast("Acesso não autorizado.", "error");
      screenId = defaultScreenForUser();
    }
    if (screenId === "transferencias" && authState.currentUser.role === "OPERADOR") {
      activateTransferTab("myTransfersSection");
    }
    document.querySelectorAll(".screen").forEach(function (screen) {
      var isActive = screen.id === screenId;
      screen.classList.toggle("active", isActive);
      screen.hidden = !isActive;
    });
    document.querySelectorAll(".menu-item").forEach(function (item) {
      item.classList.toggle("active", item.dataset.screen === screenId);
    });
    $("sidebar").classList.remove("open");
    updateModuleSubtitle(screenId);
    if (screenId === "baseEstoque" && !moduleLoadState.stock) {
      setStatus("stockImportStatus", "Carregando Base de Estoque...", "warning");
    }
    renderAll();
    await ensureScreenDataLoaded(screenId);
    if (getActiveScreenId() !== screenId) return;
    renderAll();
    if (screenId === "usuarios") renderUsers();
    if (screenId === "manutencao") renderMaintenance();
    if (screenId === "saudeSistema") renderSystemHealth(true);
    if (screenId === "bipagem") focusSkuInput();
    if (screenId === "consultaSku") $("skuSearchInput").focus();
    if (screenId === "consultaPrateleira") $("shelfSearchInput").focus();
    if (screenId === "reposicao" && $("replenishmentSkuInput")) {
      $("replenishmentSkuInput").focus();
      if (!replenishmentState.suggestionsLoaded) refreshReplenishmentSuggestions(true);
    }
    if (screenId === "transferencias" && authState.currentUser.role === "OPERADOR") activateTransferTab("myTransfersSection");
    if (screenId === "transferencias" && !realtimeState.active) startLeaderLiveSync();
    if (screenId === "reposicao" && !realtimeState.active) startLeaderLiveSync();
  }

  function updateModuleSubtitle(screenId) {
    var label = screenId === "transferencias" ? "Transferências" : screenId === "reposicao" ? "Reposição" : screenId === "bipagem" ? "Endereçamento" : screenId === "baseEstoque" ? "Base CAPTACAO" : screenId === "etiquetas" ? "Etiquetas" : screenId === "exportar" ? "Exportar Excel" : screenId === "saudeSistema" ? "Saúde do Sistema" : ["usuarios", "manutencao", "configuracoes"].indexOf(screenId) >= 0 ? "Administração" : "Base CAPTACAO";
    if ($("mobileModuleSubtitle")) $("mobileModuleSubtitle").textContent = label;
    if ($("sidebarModuleSubtitle")) $("sidebarModuleSubtitle").textContent = label;
  }

  function isRemovedScreen(screenId) {
    return ["assistente", "conferencias", "historico", "consultaPrateleira"].indexOf(screenId) >= 0;
  }

  function bindEvents() {
    $("loginForm").addEventListener("submit", function (event) {
      event.preventDefault();
      handleLogin();
    });
    $("loginButton").addEventListener("click", function (event) {
      event.preventDefault();
      handleLogin();
    });
    $("showAccessRequestButton").addEventListener("click", showAccessRequestForm);
    $("backToLoginButton").addEventListener("click", function () { showLoginForm(true); });
    $("accessRequestForm").addEventListener("submit", function (event) {
      event.preventDefault();
      submitAccessRequest();
    });
    ["logoutButton", "topLogoutButton", "mobileLogoutButton"].forEach(function (id) {
      $(id).addEventListener("click", logout);
    });
    if ($("activeWarehouseSelect")) {
      $("activeWarehouseSelect").addEventListener("change", function (event) {
        switchActiveWarehouse(event.target.value);
      });
    }
    $("userForm").addEventListener("submit", function (event) {
      event.preventDefault();
      saveUserFromForm();
    });
    $("clearUserFormButton").addEventListener("click", resetUserForm);
    if ($("usersRows")) $("usersRows").addEventListener("click", handleUserTableClick);
    if ($("userGroups")) $("userGroups").addEventListener("click", handleUserTableClick);
    $("accessRequestsRows").addEventListener("click", handleUserTableClick);
    document.querySelectorAll("[data-user-tab]").forEach(function (button) {
      button.addEventListener("click", function () {
        userManagementState.tab = button.dataset.userTab || "ativos";
        renderUsers();
      });
    });
    ["userSearchInput", "userWarehouseFilter", "userRoleFilter", "userSupervisorFilter", "userStatusFilter", "userAvailabilityFilter"].forEach(function (id) {
      if ($(id)) $(id).addEventListener("input", renderUsers);
      if ($(id)) $(id).addEventListener("change", renderUsers);
    });
    if ($("userRoleInput")) $("userRoleInput").addEventListener("change", function () {
      renderUserSupervisorOptions({ role: $("userRoleInput").value, defaultWarehouseCode: $("userDefaultWarehouseInput").value, supervisorId: $("userSupervisorInput").value });
    });
    if ($("userDefaultWarehouseInput")) $("userDefaultWarehouseInput").addEventListener("change", function () {
      renderUserWarehouseInputs({ role: $("userRoleInput").value, defaultWarehouseCode: $("userDefaultWarehouseInput").value, allowedWarehouseCodes: selectedUserWarehouseCodes(), supervisorId: $("userSupervisorInput").value });
    });
    if ($("bulkUserDisableButton")) $("bulkUserDisableButton").addEventListener("click", function () { bulkUpdateUsers({ active: false, available_for_tasks: false }, "desativar"); });
    if ($("bulkUserArchiveButton")) $("bulkUserArchiveButton").addEventListener("click", function () { bulkArchiveUsers(); });
    if ($("bulkUserAvailableButton")) $("bulkUserAvailableButton").addEventListener("click", function () { bulkUpdateUsers({ available_for_tasks: true }, "liberar para tarefas"); });
    if ($("bulkUserUnavailableButton")) $("bulkUserUnavailableButton").addEventListener("click", function () { bulkUpdateUsers({ available_for_tasks: false }, "tirar das tarefas"); });
    if ($("bulkUserWarehouseButton")) $("bulkUserWarehouseButton").addEventListener("click", bulkMoveUsersWarehouse);
    if ($("bulkUserSupervisorButton")) $("bulkUserSupervisorButton").addEventListener("click", bulkLinkUsersSupervisor);

    $("skuReadButton").addEventListener("click", handleSkuRead);
    $("locationReadButton").addEventListener("click", handleLocationRead);
    $("scanForm").addEventListener("submit", function (event) {
      event.preventDefault();
      saveManualScan();
    });
    $("clearScanButton").addEventListener("click", resetScan);
    $("skuInput").addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        handleSkuRead();
      }
    });
    $("locationInput").addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        handleLocationRead();
      }
    });

    $("skuSearchButton").addEventListener("click", function () {
      renderSkuSearch();
    });
    if ($("dashboardSkuQuickButton")) $("dashboardSkuQuickButton").addEventListener("click", renderDashboardSkuQuickSearch);
    if ($("dashboardSkuQuickInput")) $("dashboardSkuQuickInput").addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        renderDashboardSkuQuickSearch();
      }
    });
    $("clearSkuSearchButton").addEventListener("click", resetSkuSearchView);
    $("newSkuSearchButton").addEventListener("click", resetSkuSearchView);
    $("allocateSkuSearchButton").addEventListener("click", allocateLastSkuSearch);
    if ($("skuOperationalHub")) $("skuOperationalHub").addEventListener("click", handleSkuOperationalHubClick);
    $("skuSearchInput").addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        renderSkuSearch();
      }
    });
    $("skuSearchInput").addEventListener("input", function () {
      window.clearTimeout(skuSearchTimer);
      var value = normalizeSku($("skuSearchInput").value);
      if (value.length < 5) return;
      skuSearchTimer = window.setTimeout(function () {
        renderSkuSearch();
      }, 450);
    });

    $("shelfSearchButton").addEventListener("click", renderShelfSearch);
    $("shelfSearchInput").addEventListener("keydown", function (event) {
      if (event.key === "Enter") renderShelfSearch();
    });

    $("previewLabelsButton").addEventListener("click", function () {
      generateLabels(false);
    });
    $("singleLabelButton").addEventListener("click", clearLabelsPreview);
    $("printLabelsButton").addEventListener("click", function () {
      generateLabels(true);
    });

    if ($("exportExcelButton")) $("exportExcelButton").addEventListener("click", exportExcel);
    $("importExcelButton").addEventListener("click", importExcel);
    if ($("importCaptureStockButton")) $("importCaptureStockButton").addEventListener("click", function () { importStockFromInput("CAPTACAO"); });
    if ($("importStoreStockButton")) $("importStoreStockButton").addEventListener("click", function () { importStockFromInput("LOJA"); });
    if ($("exportCaptureStockTemplateButton")) $("exportCaptureStockTemplateButton").addEventListener("click", function () { exportStockTemplate("CAPTACAO"); });
    if ($("exportStoreStockTemplateButton")) $("exportStoreStockTemplateButton").addEventListener("click", function () { exportStockTemplate("LOJA"); });
    if ($("exportCurrentStockButton")) $("exportCurrentStockButton").addEventListener("click", exportCurrentStock);
    if ($("exportStockAlertsButton")) $("exportStockAlertsButton").addEventListener("click", function () { exportStockAlerts(""); });
    if ($("exportStockNoLocationButton")) $("exportStockNoLocationButton").addEventListener("click", function () { exportStockAlerts("SEM_LOCALIZACAO"); });
    if ($("exportReplenishmentSuggestionButton")) $("exportReplenishmentSuggestionButton").addEventListener("click", exportReplenishmentSuggestions);
    if ($("refreshStockBaseButton")) $("refreshStockBaseButton").addEventListener("click", refreshStockOperationalData);
    if ($("historyFilterButton")) $("historyFilterButton").addEventListener("click", renderHistory);
    if ($("historyFilterInput")) $("historyFilterInput").addEventListener("input", renderHistory);
    document.querySelectorAll(".transfer-tab").forEach(function (button) {
      button.addEventListener("click", function () {
        activateTransferTab(button.dataset.transferTab);
        renderTransfers();
      });
    });
    $("transferDashboardAlert").addEventListener("click", async function (event) {
      if (event.target.closest("[data-address-conflicts-open]")) {
        showScreen("manutencao");
        verifyAddressMaintenance();
        return;
      }
      var button = event.target.closest("[data-transfer-alert-open]");
      if (button) {
        showScreen("transferencias");
        await openTransferWork(button.dataset.transferAlertOpen);
      }
    });
    $("operatorTaskAlert").addEventListener("click", function (event) {
      if (event.target.closest("[data-open-tasks]")) showScreen("transferencias");
      if (event.target.closest("[data-open-replenishments]")) showScreen("reposicao");
    });
    if ($("replenishmentForm")) $("replenishmentForm").addEventListener("submit", handleCreateReplenishment);
    if ($("replenishmentSkuInput")) {
      $("replenishmentSkuInput").addEventListener("input", handleReplenishmentSkuInput);
      $("replenishmentSkuInput").addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          handleReplenishmentSkuInput();
          $("replenishmentStoreQtyInput").focus();
        }
      });
    }
    if ($("replenishmentList")) {
      $("replenishmentList").addEventListener("click", handleReplenishmentActionClick);
      $("replenishmentList").addEventListener("change", handleReplenishmentActionChange);
    }
    if ($("replenishmentSuggestionsList")) $("replenishmentSuggestionsList").addEventListener("click", handleReplenishmentSuggestionClick);
    document.querySelectorAll("[data-replenishment-filter]").forEach(function (button) {
      button.addEventListener("click", function () {
        replenishmentState.activeFilter = button.dataset.replenishmentFilter || "";
        replenishmentState.renderLimit = REPLENISHMENT_RENDER_PAGE_SIZE;
        document.querySelectorAll("[data-replenishment-filter]").forEach(function (entry) {
          entry.classList.toggle("active", entry === button);
        });
        renderReplenishment();
      });
    });
    document.querySelectorAll("[data-replenishment-suggestion-filter]").forEach(function (button) {
      button.addEventListener("click", function () {
        replenishmentState.suggestionFilter = button.dataset.replenishmentSuggestionFilter || "";
        document.querySelectorAll("[data-replenishment-suggestion-filter]").forEach(function (entry) {
          entry.classList.toggle("active", entry === button);
        });
        refreshReplenishmentSuggestions(true);
      });
    });
    if ($("loadMoreReplenishmentButton")) $("loadMoreReplenishmentButton").addEventListener("click", function () {
      replenishmentState.renderLimit += REPLENISHMENT_RENDER_PAGE_SIZE;
      renderReplenishment();
    });
    if ($("refreshReplenishmentSuggestionsButton")) $("refreshReplenishmentSuggestionsButton").addEventListener("click", function () {
      refreshReplenishmentSuggestions(true);
    });
    if ($("loadMoreReplenishmentSuggestionsButton")) $("loadMoreReplenishmentSuggestionsButton").addEventListener("click", function () {
      refreshReplenishmentSuggestions(false);
    });
    if ($("replenishmentSuggestionForm")) $("replenishmentSuggestionForm").addEventListener("submit", handleConfirmReplenishmentSuggestion);
    document.querySelectorAll("[data-replenishment-suggestion-close]").forEach(function (button) {
      button.addEventListener("click", closeReplenishmentSuggestionModal);
    });
    ["transferStatusFilter", "transferResponsibleFilter", "transferEstablishmentFilter", "transferCodeFilter"].forEach(function (id) {
      $(id).addEventListener("input", renderTransferPanel);
      $(id).addEventListener("change", renderTransferPanel);
    });
    if ($("conferenceTransferSelect")) $("conferenceTransferSelect").addEventListener("change", renderTransferConferenceAdminPanel);
    if ($("conferenceUserSelect")) $("conferenceUserSelect").addEventListener("change", renderTransferConferenceAdminPanel);
    if ($("conferenceXmlCreateInput")) $("conferenceXmlCreateInput").addEventListener("change", renderTransferConferenceAdminPanel);
    if ($("createConferenceFromXmlButton")) $("createConferenceFromXmlButton").addEventListener("click", createConferenceFromXmlFile);
    if ($("assignConferenceSelectedButton")) $("assignConferenceSelectedButton").addEventListener("click", assignSelectedTransferConference);
    if ($("exportConferenceSelectedButton")) $("exportConferenceSelectedButton").addEventListener("click", exportSelectedTransferConferenceXml);
    if ($("openConferenceSelectedButton")) $("openConferenceSelectedButton").addEventListener("click", openSelectedTransferConference);
    if ($("deleteConferenceSelectedButton")) $("deleteConferenceSelectedButton").addEventListener("click", deleteSelectedTransferConference);
    $("transferImportModeInput").addEventListener("change", handleTransferImportModeChange);
    $("transferResponsibleInput").addEventListener("change", function () {
      applyDefaultResponsibleToTransferGroups(true);
      renderTransferPreview();
    });
    $("previewTransferExcelButton").addEventListener("click", previewTransferExcel);
    $("newTransferForm").addEventListener("submit", createTransferFromForm);
    $("transferPreviewGroups").addEventListener("change", handleTransferPreviewGroupChange);
    $("transferPreviewGroups").addEventListener("click", handleTransferPreviewGroupClick);
    $("transferPanelRows").addEventListener("click", handleTransferActionClick);
    $("transferPanelRows").addEventListener("change", handleTransferMergeSelectionChange);
    if ($("clearTransferMergeButton")) $("clearTransferMergeButton").addEventListener("click", clearTransferMergeSelection);
    if ($("previewTransferMergeButton")) $("previewTransferMergeButton").addEventListener("click", async function () {
      await ensureSelectedMergeItemsLoaded();
      renderTransferMergePreview(true);
    });
    if ($("confirmTransferMergeButton")) $("confirmTransferMergeButton").addEventListener("click", confirmTransferMerge);
    if ($("transferMergePreview")) $("transferMergePreview").addEventListener("change", handleTransferMergeResolutionChange);
    if ($("transferMergePreview")) $("transferMergePreview").addEventListener("input", handleTransferMergeResolutionChange);
    $("finalizedTransferRows").addEventListener("click", handleTransferActionClick);
    $("transferFinalReportSummary").addEventListener("click", handleTransferActionClick);
    $("transferFinalReportDetails").addEventListener("click", handleTransferActionClick);
    $("myTransfersList").addEventListener("click", handleTransferActionClick);
    $("completedTransfersList").addEventListener("click", handleTransferActionClick);
    $("establishmentForm").addEventListener("submit", function (event) {
      event.preventDefault();
      saveEstablishmentFromForm();
    });
    $("clearEstablishmentButton").addEventListener("click", resetEstablishmentForm);
    $("establishmentsRows").addEventListener("click", handleTransferActionClick);
    $("establishmentSearchButton").addEventListener("click", renderEstablishments);
    $("establishmentSearchInput").addEventListener("input", renderEstablishments);
    $("backToTransfersButton").addEventListener("click", function () {
      activateTransferTab(isAdminOrSupervisor() ? "transferPanelSection" : "myTransfersSection");
      renderTransfers();
    });
    $("refreshTransferStockButton").addEventListener("click", function (event) {
      refreshTransferStockSuggestion(transferState.activeTransferId, { persist: true, button: event.currentTarget });
    });
    $("refreshTransferProgressButton").addEventListener("click", refreshTransferProgress);
    $("transferScanInput").addEventListener("input", markTransferScanInput);
    $("transferScanInput").addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        locateTransferItem();
      }
    });
    $("transferQuantityInput").addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        confirmTransferItem();
      }
    });
    $("transferQuantityInput").addEventListener("input", updateTransferBoxTotalPreview);
    $("transferUnitsPerBoxInput").addEventListener("input", updateTransferBoxTotalPreview);
    $("transferTotalUnitsInput").addEventListener("input", updateTransferBoxTotalPreview);
    $("transferMixedBoxInput").addEventListener("change", function () {
      renderTransferBoxFields();
      updateTransferBoxTotalPreview();
    });
    $("confirmTransferItemButton").addEventListener("click", confirmTransferItem);
    $("finishSeparationButton").addEventListener("click", finishSeparation);
    $("startPackingButton").addEventListener("click", startPacking);
    $("finishPackingButton").addEventListener("click", finishPacking);
    $("confirmCurrentCollectButton").addEventListener("click", confirmCurrentCollect);
    $("differentSeparationQtyButton").addEventListener("click", showManualSeparationQty);
    $("finishSeparationReadyButton").addEventListener("click", finishSeparation);
    $("transferProductList").addEventListener("click", handleTransferWorkListClick);
    if ($("conferenceXmlButton")) $("conferenceXmlButton").addEventListener("click", conferenceTransferXml);
    if ($("clearHistoryButton")) $("clearHistoryButton").addEventListener("click", clearHistory);
    $("verifyMaintenanceButton").addEventListener("click", verifyMaintenanceResidues);
    $("cleanResiduesButton").addEventListener("click", cleanMaintenanceResidues);
    if ($("maintenanceWarehouseFilter")) $("maintenanceWarehouseFilter").addEventListener("change", function (event) {
      maintenanceState.warehouseFilter = event.target.value || "CURRENT";
      maintenanceState.lastReport = null;
      renderMaintenance();
    });
    document.querySelectorAll("[data-maintenance-scope]").forEach(function (button) {
      button.addEventListener("click", verifyMaintenanceResidues);
    });
    if ($("exportMaintenanceReportButton")) $("exportMaintenanceReportButton").addEventListener("click", downloadMaintenanceSafeReport);
    if ($("verifyAddressMaintenanceButton")) $("verifyAddressMaintenanceButton").addEventListener("click", verifyAddressMaintenance);
    if ($("cleanAddressDuplicatesButton")) $("cleanAddressDuplicatesButton").addEventListener("click", cleanAddressDuplicates);
    if ($("maintenanceAddressRows")) $("maintenanceAddressRows").addEventListener("click", handleAddressMaintenanceAction);
    if ($("refreshDiagnosticsButton")) $("refreshDiagnosticsButton").addEventListener("click", renderSystemDiagnostics);
    if ($("refreshHealthButton")) $("refreshHealthButton").addEventListener("click", function () { renderSystemHealth(true); });
    if ($("healthWarehouseFilter")) $("healthWarehouseFilter").addEventListener("change", function (event) {
      healthState.warehouseFilter = event.target.value || "ALL";
      renderSystemHealth(true);
    });
    if ($("generateHealthSqlButton")) $("generateHealthSqlButton").addEventListener("click", generateHealthCorrectionSql);
    if ($("verifyHealthDuplicatesButton")) $("verifyHealthDuplicatesButton").addEventListener("click", function () { renderSystemHealth(true); });
    if ($("verifyHealthOrphansButton")) $("verifyHealthOrphansButton").addEventListener("click", function () { renderSystemHealth(true); });
    if ($("healthProcessRows")) $("healthProcessRows").addEventListener("click", handleHealthProcessAction);
    if ($("clearHealthCacheButton")) $("clearHealthCacheButton").addEventListener("click", clearHealthLocalCache);
    if ($("rebuildHealthCacheButton")) $("rebuildHealthCacheButton").addEventListener("click", rebuildHealthLocalCache);
    if ($("flushHealthPendingButton")) $("flushHealthPendingButton").addEventListener("click", flushHealthPendingWrites);
    if ($("archiveHealthNotificationsButton")) $("archiveHealthNotificationsButton").addEventListener("click", archiveHealthOldNotifications);
    if ($("archiveHealthInactiveUsersButton")) $("archiveHealthInactiveUsersButton").addEventListener("click", archiveHealthInactiveUsers);
    if ($("generateHealthReportButton")) $("generateHealthReportButton").addEventListener("click", downloadSystemHealthReport);
    $("maintenanceTestRows").addEventListener("click", handleTransferActionClick);
    $("resetSampleButton").addEventListener("click", restoreSamples);
    $("clearAllButton").addEventListener("click", clearAllData);
    $("saveSupabaseButton").addEventListener("click", saveSupabaseSettings);
    $("testSupabaseButton").addEventListener("click", testSupabaseConnection);
    $("taskSoundInput").addEventListener("change", saveTaskSoundSetting);
    $("sidebarTaskSoundInput").addEventListener("change", saveTaskSoundSetting);
    if ($("replenishmentSoundInput")) $("replenishmentSoundInput").addEventListener("change", saveReplenishmentSoundSetting);
    if ($("replenishmentSoundVolumeInput")) $("replenishmentSoundVolumeInput").addEventListener("change", saveReplenishmentSoundSetting);
    if ($("replenishmentSoundRepeatInput")) $("replenishmentSoundRepeatInput").addEventListener("change", saveReplenishmentSoundSetting);
  }

  function cacheStaticOptions() {
    var select = $("areaSelect");
    select.innerHTML = AREAS.map(function (area) {
      return "<option value=\"" + area.code + "\">" + area.code + " - " + area.name + "</option>";
    }).join("");
    renderUserWarehouseInputs({ defaultWarehouseCode: activeWarehouseCode(), allowedWarehouseCodes: [activeWarehouseCode()], isGlobalAdmin: false });
  }

  function handleSkuRead() {
    if (!ensureActiveWarehouse()) return;
    var sku = firstSkuValue($("skuInput").value);
    if (!sku) {
      setScanMessage("Informe ou bipe o SKU do produto.", "error");
      $("skuInput").focus();
      return;
    }
    currentSku = sku;
    $("skuInput").value = sku;
    setLocationScanEnabled(true);
    var locations = findBySku(sku);
    addHistory("SKU consultado", sku, "", locations.length ? "Produto ja possui localizacao." : "Produto sem localizacao cadastrada.");
    if (locations.length) {
      setScanMessage("Produto ja possui localizacao.", "warning");
      renderScanResults(locations);
      $("locationInput").focus();
      showToast("Produto bipado com sucesso.", "success");
    } else {
      setScanMessage("Produto sem localizacao cadastrada. Agora bipe a prateleira.", "warning");
      renderScanResults([]);
      $("locationInput").focus();
    }
  }

  async function handleLocationRead() {
    if (!ensureActiveWarehouse()) return;
    if (!currentSku) {
      var sku = firstSkuValue($("skuInput").value);
      if (!sku) {
        setScanMessage("Bipe o SKU antes da prateleira.", "error");
        $("skuInput").focus();
        return;
      }
      currentSku = sku;
    }
    var parsed = normalizeLocation($("locationInput").value);
    if (!parsed.valid) {
      currentLocation = null;
      setScanMessage("Codigo de prateleira invalido.", "error");
      return;
    }
    currentLocation = parsed;
    $("locationInput").value = parsed.code;
    setScanMessage("Prateleira " + parsed.code + " identificada. Verificando ocupação no estoque " + activeWarehouseCode() + "...", "warning");
    await saveManualScan();
  }

  async function saveManualScan() {
    if (!ensureActiveWarehouse()) return;
    var actionButton = $("saveManualButton");
    if (!beginTransferAction("save-manual-scan", actionButton, "Salvando...")) return;
    try {
    var sku = firstSkuValue($("skuInput").value || currentSku);
    var parsed = normalizeLocation($("locationInput").value);
    var existingBinding = editingId ? state.bindings.find(function (binding) { return binding.id === editingId; }) : null;
    var areaCode = existingBinding ? existingBinding.areaCode : Number($("areaSelect").value || 1);
    if (!sku) {
      setScanMessage("Informe ou bipe o SKU do produto.", "error");
      return;
    }
    if (!parsed.valid) {
      setScanMessage("Codigo de prateleira invalido.", "error");
      return;
    }
    if (!getAreaByCode(areaCode)) areaCode = 1;

    if (editingId) {
      var edited = await allocateSkuToLocation(sku, parsed, areaCode, editingId);
      if (!edited.ok) {
        setScanMessage(edited.message, edited.type || "error");
        return;
      }
      editingId = null;
      setScanMessage("Endereco alterado. Pronto para o proximo produto.", "success");
      clearScanFieldsForNext();
      return;
    }

    var allocated = await allocateSkuToLocation(sku, parsed, areaCode, "");
    if (!allocated.ok) {
      setScanMessage(allocated.message, allocated.type || "error");
      return;
    }
    renderScanResults([allocated.binding]);
    setScanMessage("SKU enderecado com sucesso. Pronto para o proximo produto.", "success");
    clearScanFieldsForNext();
    } finally {
      endTransferAction(actionButton);
    }
  }

  async function allocateSkuToLocation(sku, parsed, areaCode, sourceBindingId) {
    var occupancyCheck = await fetchLocationOccupantsForAllocation(parsed.code);
    if (!occupancyCheck.ok) {
      return {
        ok: false,
        message: "Não foi possível verificar se a prateleira está ocupada: " + occupancyCheck.message + ". Tente novamente.",
        type: "error"
      };
    }

    if (!locationExistsInMaster(parsed.code)) {
      var createLocation = window.confirm("Localizacao nao encontrada na base. Deseja criar nova localizacao?");
      if (!createLocation) {
        prepareAnotherLocationScan();
        return { ok: false, message: "Cadastro cancelado. Bipe outra prateleira para o mesmo produto.", type: "warning" };
      }
    }

    var locationOccupants = occupancyCheck.occupants.filter(function (binding) {
      return !sourceBindingId || binding.id !== sourceBindingId;
    });
    var sameLocation = locationOccupants.find(function (binding) { return isSameSku(binding.sku, sku); });
    if (sameLocation) {
      renderScanResults([sameLocation]);
      clearScanFieldsForNext();
      return { ok: false, message: "Esse codigo ja esta alocado nessa localizacao.", type: "warning" };
    }

    if (locationOccupants.length) {
      renderScanResults(locationOccupants);
      var decision = await askLocationConflictDecision(parsed.code, sku, locationOccupants);
      if (decision !== "include") {
        prepareAnotherLocationScan();
        return { ok: false, message: "Endereçamento não realizado. Bipe outra prateleira para o SKU " + sku + ".", type: "warning" };
      }
    }

    var skuLocations = findBySku(sku).filter(function (binding) {
      return binding.locationCode !== parsed.code && (!sourceBindingId || binding.id !== sourceBindingId);
    });
    if (skuLocations.length) {
      renderScanResults(skuLocations);
      var moveSku = askSkuMoveDecision(sku, parsed.code, skuLocations);
      if (!moveSku) {
        clearScanFieldsForNext();
        return { ok: false, message: "Alteração de endereço cancelada. Pronto para o próximo produto.", type: "warning" };
      }
    }

    var target = sourceBindingId
      ? state.bindings.find(function (binding) { return binding.id === sourceBindingId; })
      : (skuLocations[0] || null);
    var previousLocations = [];
    if (target && target.locationCode !== parsed.code) previousLocations.push(target.locationCode);
    skuLocations.forEach(function (item) {
      if (item.id !== (target && target.id) && previousLocations.indexOf(item.locationCode) < 0) previousLocations.push(item.locationCode);
    });
    var binding = target ? Object.assign({}, target) : createBinding(sku, parsed, areaCode);
    var now = new Date().toISOString();
    binding.sku = String(sku);
    binding.rua = parsed.rua;
    binding.rack = parsed.rack;
    binding.linha = parsed.linha;
    binding.letra = parsed.letra;
    binding.locationCode = parsed.code;
    binding.areaCode = target ? target.areaCode : areaCode;
    binding.areaName = (getAreaByCode(binding.areaCode) || getAreaByCode(1)).name;
    binding.productName = findProductName(sku) || binding.productName || "";
    binding.createdAt = binding.createdAt || now;
    binding.updatedAt = now;

    var idsToRemove = skuLocations
      .filter(function (item) { return !target || item.id !== target.id; })
      .map(function (item) { return item.id; });
    var historyItems = [
      createHistoryItem(
        target ? "Endereco alterado" : "SKU incluido em localizacao",
        sku,
        parsed.code,
        target
          ? "SKU movido de " + (previousLocations.join(", ") || "localizacao anterior") + " para " + parsed.code + "."
          : "SKU incluido na localizacao sem remover outros produtos."
      )
    ];

    setScanMessage("Salvando no Supabase...", "warning");
    var saved = await persistAllocationChange(binding, idsToRemove, historyItems);
    if (!saved.ok) return { ok: false, message: "Nao foi possivel salvar no Supabase: " + saved.message, type: "error" };

    var removeSet = {};
    idsToRemove.forEach(function (id) { removeSet[id] = true; });
    state.bindings = state.bindings.filter(function (item) { return !removeSet[item.id] && item.id !== binding.id; });
    state.bindings.push(binding);
    state.history = state.history.concat(historyItems);
    renderAll();
    return { ok: true, binding: binding };
  }

  async function fetchLocationOccupantsForAllocation(locationCode) {
    var normalizedLocation = locationKeyFromCode(locationCode);
    var localOccupants = findByLocation(normalizedLocation);
    if (!isSupabaseReady()) {
      return { ok: false, occupants: localOccupants, message: "Supabase não conectado" };
    }

    try {
      var response = await runSupabaseRequestWithRetry("binding-location-occupancy", function () {
        return supabaseDb
          .from("wms_bindings")
          .select("id,sku,rua,rack,linha,letra,location_code,area_code,area_name,product_name,warehouse_id,warehouse_code,created_at,updated_at")
          .eq("warehouse_code", activeWarehouseCode())
          .eq("location_code", normalizedLocation);
      });
      if (response.error) throw response.error;

      var remoteOccupants = expandDbBindingRows(response.data || []).filter(bindingMatchesActiveWarehouse);
      state.bindings = state.bindings.filter(function (binding) {
        return !bindingMatchesActiveWarehouse(binding) || locationKeyFromBinding(binding) !== normalizedLocation;
      }).concat(remoteOccupants);
      return { ok: true, occupants: findByLocation(normalizedLocation) };
    } catch (error) {
      console.error("Falha ao verificar ocupação da prateleira no Supabase:", error);
      return { ok: false, occupants: localOccupants, message: formatSupabaseError(error) };
    }
  }

  async function persistAllocationChange(binding, idsToRemove, historyItems) {
    if (!isSupabaseReady()) {
      var problem = describeSupabaseConfigProblem();
      updateSupabaseStatus("Supabase nao conectado. O SKU nao foi salvo. " + problem, "error");
      return { ok: false, message: "Supabase nao conectado. " + problem };
    }
    try {
      var bindingResponse = await supabaseDb
        .from("wms_bindings")
        .upsert(toDbBinding(binding), { onConflict: "id" });
      if (bindingResponse.error && isMissingWarehouseColumnError(bindingResponse.error)) {
        assertWarehouseFallbackAllowed("wms_bindings", bindingResponse.error);
        bindingResponse = await supabaseDb
          .from("wms_bindings")
          .upsert(stripWarehouseColumns(toDbBinding(binding)), { onConflict: "id" });
      }
      if (bindingResponse.error) throw bindingResponse.error;

      if (idsToRemove.length) {
        var deleteResponse = await supabaseDb.from("wms_bindings").delete().in("id", idsToRemove);
        if (deleteResponse.error) throw deleteResponse.error;
      }

      if (historyItems.length && historySchemaAvailable) {
        var historyResponse = await supabaseDb
          .from("wms_history")
          .upsert(historyItems.map(toDbHistory), { onConflict: "id" });
        if (historyResponse.error && isMissingWarehouseColumnError(historyResponse.error)) {
          assertWarehouseFallbackAllowed("wms_history", historyResponse.error);
          historyResponse = await supabaseDb
            .from("wms_history")
            .upsert(historyItems.map(toDbHistory).map(stripWarehouseColumns), { onConflict: "id" });
        }
        if (historyResponse.error) {
          if (!isHistorySchemaError(historyResponse.error)) throw historyResponse.error;
          historySchemaAvailable = false;
          updateSupabaseStatus("SKU salvo em wms_bindings. Historico nao salvo porque wms_history esta sem a coluna datetime; aplique as migrations do Supabase.", "warning");
        }
      }

      var verifyResponse = await supabaseDb
        .from("wms_bindings")
        .select("id, sku, location_code")
        .eq("id", binding.id)
        .maybeSingle();
      if (verifyResponse.error) throw verifyResponse.error;
      if (!verifyResponse.data) throw new Error("Registro nao encontrado apos salvar.");
      return { ok: true };
    } catch (error) {
      var message = formatSupabaseError(error);
      console.error("Falha ao atualizar alocacao no Supabase:", error);
      updateSupabaseStatus("Falha ao gravar no Supabase: " + message, "error");
      return { ok: false, message: message };
    }
  }

  function askLocationConflictDecision(locationCode, sku, occupants) {
    var modal = $("locationConflictModal");
    if (!modal) {
      return Promise.resolve(window.confirm("Esta localizacao ja possui outros produtos cadastrados: " + occupants.map(function (binding) { return binding.sku; }).join(", ") + ". Deseja incluir o SKU " + sku + " nesta localizacao?") ? "include" : "cancel");
    }
    $("locationConflictTitle").textContent = "Prateleira " + locationCode + " já está ocupada";
    $("locationConflictMessage").textContent = "Confira os produtos abaixo. O SKU " + sku + " só será incluído neste mesmo endereço se você confirmar.";
    $("locationConflictList").innerHTML = occupants.map(function (binding) {
      var product = binding.productName || findProductName(binding.sku) || "";
      return "<span>" + escapeHtml(binding.sku) + (product ? " - " + escapeHtml(product) : "") + "</span>";
    }).join("");
    modal.hidden = false;

    return new Promise(function (resolve) {
      var buttons = modal.querySelectorAll("[data-location-decision]");
      function finish(decision) {
        modal.hidden = true;
        buttons.forEach(function (button) { button.onclick = null; });
        document.removeEventListener("keydown", handleEscape);
        resolve(decision);
      }
      function handleEscape(event) {
        if (event.key === "Escape") finish("cancel");
      }
      buttons.forEach(function (button) {
        button.onclick = function () {
          finish(button.dataset.locationDecision);
        };
      });
      document.addEventListener("keydown", handleEscape);
      var firstButton = modal.querySelector("[data-location-decision='include']");
      if (firstButton) firstButton.focus();
    });
  }

  function askSkuMoveDecision(sku, newLocationCode, currentLocations) {
    var product = findProductName(sku) || "";
    var message = [
      "Este SKU já está alocado em outra localização. Deseja mover o produto para o novo endereço?",
      "",
      "SKU: " + sku,
      product ? "Produto: " + product : "",
      "Localização atual: " + currentLocations.map(function (binding) { return binding.locationCode; }).join(", "),
      "Nova localização: " + newLocationCode,
      "",
      "Ao confirmar, o SKU será removido da localização anterior."
    ].filter(Boolean).join("\n");
    return window.confirm(message);
  }

  function resetScan() {
    currentSku = "";
    currentLocation = null;
    editingId = null;
    $("skuInput").value = "";
    $("locationInput").value = "";
    setLocationScanEnabled(false);
    $("areaSelect").value = "1";
    renderScanResults([]);
    setScanMessage("Pronto para o proximo produto.", "success");
    focusSkuInput();
  }

  function clearScanFieldsForNext() {
    currentSku = "";
    currentLocation = null;
    editingId = null;
    $("skuInput").value = "";
    $("locationInput").value = "";
    setLocationScanEnabled(false);
    $("areaSelect").value = "1";
    focusSkuInput();
  }

  function prepareAnotherLocationScan() {
    currentLocation = null;
    $("locationInput").value = "";
    setLocationScanEnabled(true);
    window.setTimeout(function () { $("locationInput").focus(); }, 80);
  }

  function focusSkuInput() {
    window.setTimeout(function () {
      var input = $("skuInput");
      if (input) input.focus();
    }, 80);
  }

  function setLocationScanEnabled(enabled) {
    var input = $("locationInput");
    var button = $("locationReadButton");
    if (input) input.disabled = !enabled;
    if (button) button.disabled = !enabled;
    document.querySelectorAll(".scan-flow-step").forEach(function (step, index) {
      step.classList.toggle("active", enabled ? index === 1 : index === 0);
      step.classList.toggle("complete", enabled && index === 0);
    });
  }

  function setScanMessage(message, type) {
    var el = $("scanMessage");
    el.textContent = message;
    el.className = "scan-message" + (type ? " " + type : "");
  }

  function renderScanResults(list) {
    var container = $("scanResults");
    if (!list.length) {
      container.className = "result-list empty-state";
      container.textContent = currentSku ? "Nenhuma localizacao encontrada para este SKU." : "Nenhum SKU bipado ainda.";
      return;
    }
    container.className = "result-list";
    container.innerHTML = list.map(resultCardHtml).join("");
    bindActionButtons(container);
  }

  function resultCardHtml(binding) {
    return [
      "<article class=\"result-card\">",
      "<strong>" + escapeHtml(binding.sku) + " em " + escapeHtml(binding.locationCode) + "</strong>",
      "<span>Rua " + pad2(binding.rua) + " - Rack " + binding.rack + " - Linha " + binding.linha + " - Letra " + escapeHtml(binding.letra) + "</span>",
      binding.productName ? "<span>Produto: " + escapeHtml(binding.productName) + "</span>" : "",
      "<span>Área Linha Separação: " + escapeHtml(binding.areaName) + "</span>",
      "<div class=\"result-actions\">",
      "<button class=\"edit-small\" data-edit=\"" + binding.id + "\" type=\"button\">Editar</button>",
      "<button class=\"remove-small\" data-remove=\"" + binding.id + "\" type=\"button\">Remover vinculo</button>",
      "</div>",
      "</article>"
    ].join("");
  }

  function renderAll() {
    var activeScreen = getActiveScreenId();
    if (activeScreen === "dashboard") renderDashboard();
    if (activeScreen === "transferencias") renderTransfers();
    if (activeScreen === "reposicao") renderReplenishment();
    if (activeScreen === "baseEstoque") renderStockBase();
    if (activeScreen === "manutencao") renderMaintenance();
    if (activeScreen === "saudeSistema") renderSystemHealth(false);
    if (activeScreen === "estoques") renderWarehouses();
    renderOperatorTasksAlert();
  }

  function getActiveScreenId() {
    var activeScreen = document.querySelector(".screen.active");
    return activeScreen ? activeScreen.id : "dashboard";
  }

  function renderDashboard() {
    var captacaoTotal = Number((stockState.summary && stockState.summary.captacao) || 0);
    $("metricSkus").textContent = captacaoTotal || "-";
    $("metricLocations").textContent = captacaoTotal || "-";
    $("metricBindings").textContent = stockState.batches ? stockState.batches.length : 0;
    $("metricUpdated").textContent = stockState.summary && stockState.summary.updatedAt ? formatDateTime(stockState.summary.updatedAt) : "-";
    setTextIfExists("metricTransfersOpen", getVisibleTransfers().filter(function (transfer) {
      return transfer.status !== "CANCELADA" && !isFinalTransferStatus(transfer.status);
    }).length);
    setTextIfExists("metricUsersActive", visibleUsersForManagement().filter(function (user) {
      return user.active !== false && user.archived !== true;
    }).length);
    setTextIfExists("metricTasksActive", getActiveUserTasks().length);
    setTextIfExists("metricReplenishmentPending", getVisibleReplenishmentRequests().filter(function (request) {
      return ["PENDENTE", "ATRIBUIDO", "EM_SEPARACAO", "ATENDIDO_PARCIAL"].indexOf(request.status) >= 0;
    }).length);

    renderTransferDashboardAlert();
    renderReplenishmentLeaderSummary();
  }

  async function renderDashboardSkuQuickSearch() {
    if (!$("dashboardSkuQuickInput") || !$("dashboardSkuQuickResult")) return;
    var sku = firstSkuValue($("dashboardSkuQuickInput").value);
    if (!sku) {
      $("dashboardSkuQuickResult").innerHTML = "<div class=\"inline-status error\">Informe ou bipe um SKU.</div>";
      $("dashboardSkuQuickInput").focus();
      return;
    }
    var suggestion = null;
    try {
      suggestion = await stockService().getReplenishmentSuggestion(sku, activeWarehouseCode());
    } catch (error) {
      recordPerformanceError("dashboard-consulta-captacao", error);
      $("dashboardSkuQuickResult").innerHTML = "<div class=\"inline-status error\">" + escapeHtml(missingStockSchemaMessage(error)) + "</div>";
      $("dashboardSkuQuickInput").select();
      return;
    }
    if (!suggestion || suggestion.baseFound === false) {
      $("dashboardSkuQuickResult").innerHTML = "<div class=\"inline-status warning\">Produto não encontrado na base da CAPTAÇÃO do estoque " + escapeHtml(activeWarehouseCode()) + ".</div>";
      $("dashboardSkuQuickInput").select();
      return;
    }
    $("dashboardSkuQuickResult").innerHTML = [
      "<article class=\"dashboard-sku-result\">",
      "<div><span>SKU</span><strong>" + escapeHtml(sku) + "</strong></div>",
      "<div><span>Produto</span><strong>" + escapeHtml(suggestion.name || findProductName(sku) || "-") + "</strong></div>",
      "<div><span>Localização CAPTAÇÃO</span><strong>" + escapeHtml(suggestion.captureLocation || "Sem localização") + "</strong></div>",
      "<small>Loja: " + escapeHtml(suggestion.storeAvailable === null || suggestion.storeAvailable === undefined ? "Não importado" : formatQty(suggestion.storeAvailable)) + " | CAPTAÇÃO disponível: " + escapeHtml(formatQty(suggestion.captureAvailable)) + " | físico: " + escapeHtml(formatQty(suggestion.capturePhysical)) + " | alocado: " + escapeHtml(formatQty(suggestion.captureAllocated)) + "</small>",
      "</article>"
    ].join("");
    $("dashboardSkuQuickInput").value = "";
    $("dashboardSkuQuickInput").focus();
  }

  function renderReplenishmentLeaderSummary() {
    if (!$("replenishmentLeaderSummary")) return;
    var requests = getVisibleReplenishmentRequests();
    var open = requests.filter(function (request) {
      return FINAL_REPLENISHMENT_STATUSES.indexOf(request.status) < 0;
    });
    var completed = requests.filter(function (request) {
      return request.status === "CONCLUIDO" || request.status === "ENTREGUE_NA_LOJA";
    });
    var avgSeconds = completed.length
      ? Math.round(completed.reduce(function (sum, request) { return sum + Number(request.durationSeconds || 0); }, 0) / completed.length)
      : 0;
    var people = {};
    open.forEach(function (request) {
      var key = request.responsavelNome || "Na fila";
      people[key] = (people[key] || 0) + 1;
    });
    var peopleHtml = Object.keys(people).sort(function (a, b) { return people[b] - people[a]; }).slice(0, 4).map(function (name) {
      return "<span><strong>" + escapeHtml(String(people[name])) + "</strong> " + escapeHtml(name) + "</span>";
    }).join("");
    $("replenishmentLeaderSummary").innerHTML = [
      "<div class=\"replenishment-leader-grid\">",
      replenishmentSummaryTile("Na fila", requests.filter(function (item) { return item.status === "PENDENTE" && !item.responsavelId; }).length, "warning"),
      replenishmentSummaryTile("Em separacao", requests.filter(function (item) { return item.status === "EM_SEPARACAO"; }).length, "info"),
      replenishmentSummaryTile("Parcial", requests.filter(function (item) { return item.status === "ATENDIDO_PARCIAL"; }).length, "warning"),
      replenishmentSummaryTile("Sem estoque", requests.filter(function (item) { return item.status === "SEM_ESTOQUE"; }).length, "danger"),
      replenishmentSummaryTile("Concluidos", completed.length, "success"),
      replenishmentSummaryTile("Tempo medio", humanizeDuration(avgSeconds), "neutral"),
      replenishmentSummaryTile("Em aberto", open.length, "neutral"),
      "</div>",
      "<div class=\"replenishment-open-people\">",
      "<strong>Colaboradores com pedidos em aberto</strong>",
      peopleHtml || "<span>Nenhum pedido em aberto.</span>",
      "</div>"
    ].join("");
  }

  function replenishmentSummaryTile(label, value, tone) {
    return "<div class=\"replenishment-summary-tile tone-" + escapeHtml(tone || "neutral") + "\"><span>" + escapeHtml(label) + "</span><strong>" + escapeHtml(String(value)) + "</strong></div>";
  }

  function renderReplenishment() {
    if (!$("replenishmentList")) return;
    renderReplenishmentSuggestions();
    var visible = getVisibleReplenishmentRequests().slice().sort(function (a, b) {
      return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
    });
    var today = new Date().toISOString().slice(0, 10);
    setTextIfExists("replenishmentMetricPending", visible.filter(function (item) { return item.status === "PENDENTE" && !item.responsavelId; }).length);
    setTextIfExists("replenishmentMetricSeparating", visible.filter(function (item) { return item.status === "EM_SEPARACAO"; }).length);
    setTextIfExists("replenishmentMetricDoneToday", visible.filter(function (item) { return item.status === "CONCLUIDO" && String(item.finishedAt || item.updatedAt).slice(0, 10) === today; }).length);
    setTextIfExists("replenishmentMetricNoStock", visible.filter(function (item) { return item.status === "SEM_ESTOQUE"; }).length);
    if (replenishmentState.activeFilter) {
      visible = visible.filter(function (item) { return item.status === replenishmentState.activeFilter; });
    }
    var limited = visible.slice(0, replenishmentState.renderLimit);
    $("replenishmentList").innerHTML = limited.length
      ? limited.map(replenishmentCardHtml).join("")
      : "<div class=\"empty-state\">Nenhum pedido de reposicao encontrado para o estoque " + escapeHtml(activeWarehouseCode()) + ".</div>";
    if ($("loadMoreReplenishmentButton")) $("loadMoreReplenishmentButton").hidden = visible.length <= limited.length;
    setStatus("replenishmentQueueStatus", visible.length ? visible.length + " pedido(s) no filtro atual." : "", visible.length ? "success" : "");
  }

  async function refreshReplenishmentSuggestions(reset) {
    if (!$("replenishmentSuggestionsList") || replenishmentState.suggestionsLoading) return;
    if (!isSupabaseReady()) {
      setStatus("replenishmentSuggestionsStatus", "Supabase nao conectado.", "error");
      return;
    }
    try {
      replenishmentState.suggestionsLoading = true;
      if (reset) {
        replenishmentState.suggestions = [];
        replenishmentState.suggestionOffset = 0;
        replenishmentState.suggestionsHasMore = false;
      }
      renderReplenishmentSuggestions();
      setStatus("replenishmentSuggestionsStatus", "Buscando sugestoes do estoque " + activeWarehouseCode() + "...", "warning");
      var result = await getReplenishmentSuggestions({
        filter: replenishmentState.suggestionFilter,
        offset: replenishmentState.suggestionOffset,
        limit: REPLENISHMENT_SUGGESTION_PAGE_SIZE
      });
      replenishmentState.suggestions = reset ? (result.rows || []) : mergeReplenishmentSuggestions(replenishmentState.suggestions, result.rows || []);
      replenishmentState.suggestionOffset = result.nextOffset || (replenishmentState.suggestionOffset + REPLENISHMENT_SUGGESTION_PAGE_SIZE);
      replenishmentState.suggestionsHasMore = result.hasMore === true;
      replenishmentState.suggestionsLoaded = true;
      renderReplenishmentSuggestions();
      setStatus("replenishmentSuggestionsStatus", replenishmentState.suggestions.length + " sugestao(oes) no filtro atual.", replenishmentState.suggestions.length ? "success" : "warning");
    } catch (error) {
      recordPerformanceError("reposicao-sugestoes", error);
      setStatus("replenishmentSuggestionsStatus", missingStockSchemaMessage(error), "error");
    } finally {
      replenishmentState.suggestionsLoading = false;
      renderReplenishmentSuggestions();
    }
  }

  function mergeReplenishmentSuggestions(current, incoming) {
    var map = {};
    (current || []).concat(incoming || []).forEach(function (item) {
      if (!item || !item.sku) return;
      var existing = map[item.sku];
      if (!existing || Number(item.suggestionPriority || 99) < Number(existing.suggestionPriority || 99)) map[item.sku] = item;
    });
    return Object.keys(map).map(function (sku) { return map[sku]; }).sort(function (a, b) {
      if (a.suggestionPriority !== b.suggestionPriority) return a.suggestionPriority - b.suggestionPriority;
      return String(a.sku).localeCompare(String(b.sku));
    });
  }

  function renderReplenishmentSuggestions() {
    if (!$("replenishmentSuggestionsList")) return;
    if (replenishmentState.suggestionsLoading && !replenishmentState.suggestions.length) {
      $("replenishmentSuggestionsList").innerHTML = "<div class=\"empty-state\">Carregando sugestoes...</div>";
    } else if (!replenishmentState.suggestionsLoaded) {
      $("replenishmentSuggestionsList").innerHTML = "<div class=\"empty-state\">Abra ou atualize para buscar sugestoes do estoque atual.</div>";
    } else {
      $("replenishmentSuggestionsList").innerHTML = replenishmentState.suggestions.length
        ? replenishmentState.suggestions.map(replenishmentSuggestionCardHtml).join("")
        : "<div class=\"empty-state\">Nenhuma sugestao encontrada para o estoque " + escapeHtml(activeWarehouseCode()) + ".</div>";
    }
    if ($("loadMoreReplenishmentSuggestionsButton")) {
      $("loadMoreReplenishmentSuggestionsButton").hidden = !replenishmentState.suggestionsHasMore;
      $("loadMoreReplenishmentSuggestionsButton").disabled = replenishmentState.suggestionsLoading;
    }
    if ($("refreshReplenishmentSuggestionsButton")) $("refreshReplenishmentSuggestionsButton").disabled = replenishmentState.suggestionsLoading;
  }

  function replenishmentSuggestionCardHtml(item) {
    var location = item.captureLocation || "Sem localizacao";
    var isRupture = item.suggestionType === "RUPTURA";
    var tone = item.suggestionPriority === 1 ? "danger" : item.suggestionPriority === 2 ? "warning" : item.suggestionPriority === 3 ? "danger" : "info";
    return [
      "<article class=\"replenishment-suggestion-card tone-" + escapeHtml(tone) + "\" data-replenishment-suggestion-sku=\"" + escapeHtml(item.sku) + "\">",
      "<div class=\"replenishment-suggestion-main\">",
      "<div><span>Codigo Material</span><strong>" + escapeHtml(item.sku) + "</strong><p>" + escapeHtml(item.name || "Produto sem nome") + "</p></div>",
      "<div><span>Tipo</span><strong>" + escapeHtml(displaySuggestionType(item.suggestionType)) + "</strong><p>" + escapeHtml(item.alertMessage || "") + "</p></div>",
      "</div>",
      "<div class=\"replenishment-card-metrics\">",
      replenishmentMetricHtml("Captacao fisico", formatQty(item.capturePhysical)),
      replenishmentMetricHtml("Saldo Loja", item.storeAvailable === null || item.storeAvailable === undefined ? "Nao importado" : formatQty(item.storeAvailable)),
      replenishmentMetricHtml("Captacao disponivel", formatQty(item.captureAvailable)),
      replenishmentMetricHtml("Qtd sugerida", isRupture ? "Sem sugestao" : item.suggestedReplenishmentQty > 0 ? formatQty(item.suggestedReplenishmentQty) : "Analise"),
      replenishmentMetricHtml("Pedido aberto", item.hasOpenRequest ? "Sim" : "Nao"),
      "</div>",
      "<div class=\"replenishment-suggestion-locations\">",
      "<span><small>Localizacao CAPTACAO</small><b>" + escapeHtml(location) + "</b></span>",
      item.hasOpenRequest ? "<span><small>Pedido aberto</small><b>" + escapeHtml(item.openRequestStatus + (item.openRequestResponsible ? " - " + item.openRequestResponsible : "")) + "</b></span>" : "",
      "</div>",
      isRupture ? "" : "<div class=\"replenishment-actions\"><button class=\"primary-button\" data-create-replenishment-from-suggestion=\"" + escapeHtml(item.sku) + "\" type=\"button\">Criar pedido</button></div>",
      "</article>"
    ].join("");
  }

  function displaySuggestionType(type) {
    if (type === "RUPTURA") return "Ruptura";
    if (type === "ABASTECER_LOJA") return "Abastecer Loja";
    if (type === "CAPTACAO_POSITIVA_SEM_LOCALIZACAO") return "CAPTACAO sem localizacao";
    return type || "-";
  }

  function replenishmentCardHtml(item) {
    var canManage = isAdminOrSupervisor();
    var canWork = authState.currentUser && (item.responsavelId === authState.currentUser.id || canManage);
    var queueLabel = item.status === "PENDENTE" && !item.responsavelId ? "Na fila" : displayReplenishmentStatus(item.status);
    var location = replenishmentCaptureLocationLabel(item);
    var elapsed = humanizeDuration(Math.max(0, Math.round((Date.now() - new Date(item.createdAt).getTime()) / 1000)));
    return [
      "<article class=\"replenishment-card status-" + escapeHtml(item.status.toLowerCase()) + "\" data-replenishment-id=\"" + escapeHtml(item.id) + "\">",
      "<div class=\"replenishment-card-main\">",
      "<div><span>Produto</span><strong>SKU " + escapeHtml(item.codigoMaterial) + "</strong><p>" + escapeHtml(item.nomeMaterial || "-") + "</p></div>",
      "<div class=\"replenishment-location\"><span>Localizacao CAPTACAO</span><strong>" + escapeHtml(location) + "</strong><small>" + escapeHtml(item.captacaoEstacao || item.localizacaoEstacao || "-") + " | " + escapeHtml(item.captacaoRack || item.localizacaoRack || "-") + " | " + escapeHtml(item.captacaoLinha || item.localizacaoLinha || "-") + " | " + escapeHtml(item.captacaoColuna || item.localizacaoColuna || "-") + "</small></div>",
      "</div>",
      "<div class=\"replenishment-card-metrics\">",
      replenishmentMetricHtml("Saldo Loja", formatQty(item.storeQty)),
      replenishmentMetricHtml("Solicitada", formatQty(item.requestedQty)),
      replenishmentMetricHtml("Atendida", formatQty(item.attendedQty)),
      replenishmentMetricHtml("Pendente", formatQty(item.pendingQty)),
      "</div>",
      "<div class=\"replenishment-card-footer\">",
      "<span class=\"status-badge " + statusBadgeClass(item.status) + "\">" + escapeHtml(queueLabel) + "</span>",
      "<span>Solicitado por <strong>" + escapeHtml(item.solicitadoPorNome || "-") + "</strong></span>",
      "<span>Responsavel <strong>" + escapeHtml(item.responsavelNome || "-") + "</strong></span>",
      "<span>" + escapeHtml(elapsed) + "</span>",
      "</div>",
      replenishmentActionsHtml(item, canManage, canWork),
      item.observacao ? "<p class=\"replenishment-note\">" + escapeHtml(item.observacao) + "</p>" : "",
      item.motivoCancelamento ? "<p class=\"replenishment-note danger-text\">" + escapeHtml(item.motivoCancelamento) + "</p>" : "",
      "</article>"
    ].join("");
  }

  function replenishmentMetricHtml(label, value) {
    return "<span><small>" + escapeHtml(label) + "</small><strong>" + escapeHtml(value) + "</strong></span>";
  }

  function replenishmentCaptureLocationLabel(item) {
    if (!item) return "Sem localizacao";
    var built = buildLocationFromParts(item.captacaoEstacao || item.localizacaoEstacao, item.captacaoRack || item.localizacaoRack, item.captacaoLinha || item.localizacaoLinha, item.captacaoColuna || item.localizacaoColuna);
    if (built.valid) return built.code;
    var hasCaptureParts = Boolean(item.captacaoEstacao || item.captacaoRack || item.captacaoLinha || item.captacaoColuna);
    if (hasCaptureParts && item.localizacaoWms) return item.localizacaoWms;
    return "Sem localizacao";
  }

  function replenishmentActionsHtml(item, canManage, canWork) {
    var actions = [];
    if (canClaimReplenishmentRequest(item)) actions.push("<button class=\"primary-button\" data-replenishment-claim=\"" + escapeHtml(item.id) + "\" type=\"button\">Puxar pedido</button>");
    if (canWork && item.status === "ATRIBUIDO") actions.push("<button class=\"primary-button\" data-replenishment-start=\"" + escapeHtml(item.id) + "\" type=\"button\">Iniciar</button>");
    if (canWork && ["ATRIBUIDO", "EM_SEPARACAO", "ATENDIDO_PARCIAL", "SEPARADO"].indexOf(item.status) >= 0) {
      actions.push("<button class=\"secondary-button\" data-replenishment-attend=\"" + escapeHtml(item.id) + "\" type=\"button\">Atender</button>");
      actions.push("<button class=\"secondary-button\" data-replenishment-nostock=\"" + escapeHtml(item.id) + "\" type=\"button\">Sem estoque</button>");
      if (Number(item.attendedQty || 0) >= Number(item.requestedQty || 0) && Number(item.requestedQty || 0) > 0) actions.push("<button class=\"primary-button\" data-replenishment-complete=\"" + escapeHtml(item.id) + "\" type=\"button\">Concluir</button>");
    }
    if (canReturnReplenishmentRequest(item)) {
      actions.push("<button class=\"secondary-button\" data-replenishment-return=\"" + escapeHtml(item.id) + "\" type=\"button\">Devolver para fila</button>");
    }
    if (canManage && item.status !== "CANCELADO" && item.status !== "CONCLUIDO") actions.push("<button class=\"danger-button\" data-replenishment-cancel=\"" + escapeHtml(item.id) + "\" type=\"button\">Cancelar</button>");
    if (isGlobalAdminUser(authState.currentUser)) actions.push("<button class=\"danger-button\" data-replenishment-delete=\"" + escapeHtml(item.id) + "\" type=\"button\">Excluir teste</button>");
    return "<div class=\"replenishment-actions\">" + actions.join("") + "</div>";
  }

  function displayReplenishmentStatus(status) {
    if (status === "PENDENTE") return "Na fila";
    if (status === "EM_SEPARACAO") return "Em separacao";
    if (status === "ATENDIDO_PARCIAL") return "Atendido parcial";
    if (status === "SEM_ESTOQUE") return "Sem estoque";
    return normalizeText(status).replace(/_/g, " ").toLowerCase().replace(/\b\w/g, function (letter) { return letter.toUpperCase(); });
  }

  function statusBadgeClass(status) {
    if (["CONCLUIDO", "ENTREGUE_NA_LOJA", "SEPARADO"].indexOf(status) >= 0) return "active";
    if (["CANCELADO", "SEM_ESTOQUE"].indexOf(status) >= 0) return "inactive";
    return "warning";
  }

  function humanizeDuration(seconds) {
    seconds = Number(seconds || 0);
    if (seconds < 60) return seconds + "s";
    var minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + "min";
    var hours = Math.floor(minutes / 60);
    minutes = minutes % 60;
    return hours + "h " + String(minutes).padStart(2, "0") + "min";
  }

  function renderReplenishmentProductCard(product) {
    if (!$("replenishmentProductCard")) return;
    if (!product || !product.sku) {
      $("replenishmentProductCard").className = "replenishment-product-card empty-state";
      $("replenishmentProductCard").textContent = "Bipe um produto para consultar.";
      return;
    }
    $("replenishmentProductCard").className = "replenishment-product-card";
    $("replenishmentProductCard").innerHTML = [
      "<strong>SKU " + escapeHtml(product.sku) + "</strong>",
      "<span>" + escapeHtml(product.name || "Produto sem nome cadastrado") + "</span>",
      "<div class=\"replenishment-product-meta\">",
      "<span><small>Saldo Loja</small><b>" + escapeHtml(product.storeBalance === null || product.storeBalance === undefined ? "Nao importado" : formatQty(product.storeBalance)) + "</b></span>",
      "<span><small>Saldo CAPTACAO</small><b>" + escapeHtml(product.captureBalance === null ? "Nao importado" : formatQty(product.captureBalance)) + "</b></span>",
      "<span><small>Localizacao CAPTACAO</small><b>" + escapeHtml(product.captureLocation || [product.captureStation, product.captureRack, product.captureLine, product.captureColumn].filter(Boolean).join("-") || "Sem localizacao") + "</b></span>",
      "</div>",
      product.balanceWarning ? "<em>" + escapeHtml(product.balanceWarning) + "</em>" : ""
    ].join("");
  }

  function handleReplenishmentSkuInput() {
    if (!$("replenishmentSkuInput")) return;
    var sku = normalizeSku($("replenishmentSkuInput").value);
    if (stockState.lookupTimer) {
      window.clearTimeout(stockState.lookupTimer);
      stockState.lookupTimer = null;
    }
    if (!sku || sku.length < 4) {
      replenishmentState.currentProduct = null;
      renderReplenishmentProductCard(null);
      return;
    }
    var product = lookupReplenishmentProduct(sku);
    replenishmentState.currentProduct = product;
    renderReplenishmentProductCard(product);
    stockState.lookupTimer = window.setTimeout(function () {
      lookupReplenishmentProductWithStock(sku);
    }, 250);
  }

  async function handleCreateReplenishment(event) {
    event.preventDefault();
    if (replenishmentState.saving) return;
    var button = $("createReplenishmentButton");
    var originalText = button ? button.textContent : "";
    try {
      replenishmentState.saving = true;
      if (button) {
        button.disabled = true;
        button.textContent = "Criando pedido...";
      }
      handleReplenishmentSkuInput();
      var idempotencyKey = button && button.dataset.idempotencyKey
        ? button.dataset.idempotencyKey
        : createIdempotencyKey([activeWarehouseCode(), "REPOSICAO", authState.currentUser && authState.currentUser.id, $("replenishmentSkuInput").value, $("replenishmentRequestQtyInput").value]);
      if (button) button.dataset.idempotencyKey = idempotencyKey;
      var created = await createReplenishmentRequest({
        codigoMaterial: $("replenishmentSkuInput").value,
        storeQty: $("replenishmentStoreQtyInput").value,
        requestedQty: $("replenishmentRequestQtyInput").value,
        observation: $("replenishmentObservationInput").value,
        productInfo: replenishmentState.currentProduct,
        idempotencyKey: idempotencyKey,
        clientActionId: idempotencyKey
      });
      if (!created) return;
      if ($("replenishmentForm")) $("replenishmentForm").reset();
      replenishmentState.currentProduct = null;
      renderReplenishmentProductCard(null);
      await refreshReplenishmentData();
      setStatus("replenishmentCreateStatus", "Pedido criado com sucesso.", "success");
      showToast("Pedido de reposicao criado.", "success");
      if ($("replenishmentSkuInput")) $("replenishmentSkuInput").focus();
    } catch (error) {
      var message = formatSupabaseError(error);
      recordPerformanceError("reposicao-create", error);
      setStatus("replenishmentCreateStatus", "Erro ao criar pedido: " + message, "error");
      showToast("Erro ao criar pedido de reposicao.", "error");
    } finally {
      replenishmentState.saving = false;
      if (button) {
        button.disabled = false;
        button.textContent = originalText || "Criar pedido";
        delete button.dataset.idempotencyKey;
      }
    }
  }

  async function handleReplenishmentActionClick(event) {
    var target = event.target.closest("button");
    if (!target) return;
    var id = target.dataset.replenishmentClaim || target.dataset.replenishmentReturn || target.dataset.replenishmentStart || target.dataset.replenishmentAttend || target.dataset.replenishmentNostock || target.dataset.replenishmentComplete || target.dataset.replenishmentCancel || target.dataset.replenishmentDelete;
    if (!id) return;
    var actionKey = "reposicao:" + id + ":" + Object.keys(target.dataset).sort().join("-");
    if (!beginTransferAction(actionKey, target, "Salvando...")) return;
    try {
      if (target.dataset.replenishmentClaim) await claimReplenishmentRequest(id);
      if (target.dataset.replenishmentReturn) {
        var returnReason = window.prompt("Motivo para devolver para a fila:", "");
        if (returnReason === null) return;
        await returnReplenishmentRequestToQueue(id, returnReason);
      }
      if (target.dataset.replenishmentStart) await startReplenishmentRequest(id);
      if (target.dataset.replenishmentAttend) {
        var request = getReplenishmentById(id);
        var qty = window.prompt("Quantidade atendida agora:", request ? String(request.pendingQty || request.requestedQty || "") : "");
        if (qty === null) return;
        var note = "";
        if (Number(qty || 0) < Number((request && request.requestedQty) || 0)) note = window.prompt("Observacao do atendimento parcial:", (request && request.observacao) || "") || "";
        await updateReplenishmentQuantity(id, Number(qty || 0), note);
      }
      if (target.dataset.replenishmentNostock) {
        var reason = window.prompt("Motivo do sem estoque:");
        if (reason === null) return;
        await markReplenishmentNoStock(id, reason);
      }
      if (target.dataset.replenishmentComplete) await completeReplenishmentRequest(id);
      if (target.dataset.replenishmentCancel) {
        var cancelReason = window.prompt("Motivo do cancelamento:");
        if (cancelReason === null) return;
        await cancelReplenishmentRequest(id, cancelReason);
      }
      if (target.dataset.replenishmentDelete) {
        if (!window.confirm("Excluir logicamente este pedido de teste?")) return;
        await deleteTestReplenishmentRequest(id);
      }
      await refreshReplenishmentData();
      showToast("Pedido atualizado.", "success");
    } catch (error) {
      setStatus("replenishmentQueueStatus", "Erro ao atualizar pedido: " + formatSupabaseError(error), "error");
    } finally {
      endTransferAction(target);
    }
  }

  async function handleReplenishmentActionChange(event) {
    var select = event.target.closest("[data-replenishment-assign]");
    if (!select || !select.value) return;
    var actionKey = "reposicao-atribuir:" + select.dataset.replenishmentAssign + ":" + select.value;
    if (!beginTransferAction(actionKey, null, "Salvando...")) return;
    select.disabled = true;
    try {
      await assignReplenishmentRequest(select.dataset.replenishmentAssign, select.value);
      await refreshReplenishmentData();
      showToast("Responsavel atribuido.", "success");
    } catch (error) {
      setStatus("replenishmentQueueStatus", "Erro ao atribuir responsavel: " + formatSupabaseError(error), "error");
      renderReplenishment();
    } finally {
      select.disabled = false;
      endTransferAction(null);
    }
  }

  function handleReplenishmentSuggestionClick(event) {
    var button = event.target.closest("[data-create-replenishment-from-suggestion]");
    if (!button) return;
    var sku = normalizeSku(button.dataset.createReplenishmentFromSuggestion || "");
    var suggestion = replenishmentState.suggestions.find(function (item) { return item.sku === sku; });
    if (suggestion) openReplenishmentSuggestionModal(suggestion);
  }

  function responsibleOptionsHtml(selectedId) {
    var users = getAssignableUsersByWarehouse(activeWarehouseCode());
    if (!users.length) return "<option value=\"\">Nenhum responsavel do estoque atual</option>";
    return "<option value=\"\">Selecionar responsavel</option>" + users.map(function (user) {
      return "<option value=\"" + escapeHtml(user.id) + "\"" + (user.id === selectedId ? " selected" : "") + ">" + escapeHtml(user.name + " (" + user.username + ")") + "</option>";
    }).join("");
  }

  function openReplenishmentSuggestionModal(suggestion) {
    replenishmentState.activeSuggestion = suggestion;
    if (!$("replenishmentSuggestionModal")) return;
    if ($("replenishmentSuggestionModalSummary")) {
      $("replenishmentSuggestionModalSummary").innerHTML = [
        "<div><span>Codigo Material</span><strong>" + escapeHtml(suggestion.sku) + "</strong></div>",
        "<div><span>Produto</span><strong>" + escapeHtml(suggestion.name || "-") + "</strong></div>",
        "<div><span>Saldo Loja</span><strong>" + escapeHtml(suggestion.storeAvailable === null || suggestion.storeAvailable === undefined ? "Nao importado" : formatQty(suggestion.storeAvailable)) + "</strong></div>",
        "<div><span>Saldo CAPTACAO</span><strong>" + escapeHtml(formatQty(suggestion.captureAvailable)) + "</strong></div>",
        "<div><span>Fisico CAPTACAO</span><strong>" + escapeHtml(formatQty(suggestion.capturePhysical)) + "</strong></div>",
        "<div><span>Alocado CAPTACAO</span><strong>" + escapeHtml(formatQty(suggestion.captureAllocated)) + "</strong></div>",
        "<div><span>Localizacao CAPTACAO</span><strong>" + escapeHtml(suggestion.captureLocation || "Sem localizacao") + "</strong></div>"
      ].join("");
    }
    if ($("suggestionRequestQtyInput")) $("suggestionRequestQtyInput").value = suggestion.suggestedReplenishmentQty > 0 ? String(suggestion.suggestedReplenishmentQty) : "";
    if ($("suggestionObservationInput")) $("suggestionObservationInput").value = suggestion.alertMessage || "";
    setStatus("replenishmentSuggestionModalStatus", suggestion.hasOpenRequest ? "Ja existe pedido aberto para este produto. O sistema pedira confirmacao ao gravar." : "", suggestion.hasOpenRequest ? "warning" : "");
    $("replenishmentSuggestionModal").hidden = false;
    if ($("suggestionRequestQtyInput")) $("suggestionRequestQtyInput").focus();
  }

  function closeReplenishmentSuggestionModal() {
    replenishmentState.activeSuggestion = null;
    if ($("replenishmentSuggestionModal")) $("replenishmentSuggestionModal").hidden = true;
    setStatus("replenishmentSuggestionModalStatus", "", "");
  }

  async function handleConfirmReplenishmentSuggestion(event) {
    event.preventDefault();
    var suggestion = replenishmentState.activeSuggestion;
    if (!suggestion) return;
    var button = event.target.querySelector("button[type='submit']");
    var originalText = button ? button.textContent : "";
    try {
      if (button) {
        button.disabled = true;
        button.textContent = "Criando...";
      }
      var idempotencyKey = button && button.dataset.idempotencyKey
        ? button.dataset.idempotencyKey
        : createIdempotencyKey([activeWarehouseCode(), "REPOSICAO-SUGESTAO", authState.currentUser && authState.currentUser.id, suggestion.sku, $("suggestionRequestQtyInput") ? $("suggestionRequestQtyInput").value : suggestion.suggestedReplenishmentQty]);
      if (button) button.dataset.idempotencyKey = idempotencyKey;
      var created = await createReplenishmentRequest({
        codigoMaterial: suggestion.sku,
        storeQty: suggestion.storeAvailable === null || suggestion.storeAvailable === undefined ? 0 : suggestion.storeAvailable,
        requestedQty: $("suggestionRequestQtyInput") ? $("suggestionRequestQtyInput").value : suggestion.suggestedReplenishmentQty,
        observation: $("suggestionObservationInput") ? $("suggestionObservationInput").value : suggestion.alertMessage,
        productInfo: suggestion.productInfo || {
          sku: suggestion.sku,
          name: suggestion.name,
          storeBalance: suggestion.storeAvailable,
          captureBalance: suggestion.captureAvailable,
          wmsLocation: "",
          captureLocation: suggestion.captureLocation || "",
          captureStation: suggestion.captureStation,
          captureRack: suggestion.captureRack,
          captureLine: suggestion.captureLine,
          captureColumn: suggestion.captureColumn
        },
        idempotencyKey: idempotencyKey,
        clientActionId: idempotencyKey
      });
      if (!created) return;
      closeReplenishmentSuggestionModal();
      await refreshReplenishmentData();
      await refreshReplenishmentSuggestions(true);
      showToast("Pedido de reposicao criado.", "success");
      if (suggestion.source === "consultaSku") {
        resetSkuSearchView();
        setStatus("skuSearchStatus", "Pedido de reposicao criado para SKU " + created.codigoMaterial + ".", "success");
      }
    } catch (error) {
      recordPerformanceError("reposicao-create", error);
      setStatus("replenishmentSuggestionModalStatus", "Erro ao criar pedido: " + formatSupabaseError(error), "error");
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = originalText || "Confirmar pedido";
        delete button.dataset.idempotencyKey;
      }
    }
  }

  function renderTransferDashboardAlert() {
    if (!$("transferDashboardAlert") || !authState.currentUser) return;
    var assigned = getVisibleTransfers().filter(function (transfer) {
      return ["ATRIBUIDA", "PENDENTE", "AGUARDANDO_SEPARACAO", "EM_SEPARACAO", "SEPARACAO_CONCLUIDA", "EM_LACRE", "EM_MONTAGEM_CAIXA"].indexOf(transfer.status) >= 0;
    });
    if (!assigned.length || isAdminOrSupervisor()) {
      $("transferDashboardAlert").hidden = true;
      $("transferDashboardAlert").innerHTML = "";
      return;
    }
    var transfer = assigned[0];
    var stats = getTransferStats(transfer.id);
    $("transferDashboardAlert").hidden = false;
    $("transferDashboardAlert").innerHTML = [
      "<strong>Você tem uma transferência para separar</strong>",
      "<span>" + escapeHtml(transferDisplayName(transfer)) + " - " + escapeHtml(transferRouteDestinationLabel(transfer)) + "</span>",
      "<span>" + stats.totalItems + " item(ns), " + stats.pendingSeparation + " pendente(s).</span>",
      "<button class=\"primary-button\" data-transfer-alert-open=\"" + transfer.id + "\" type=\"button\">Iniciar separação</button>"
    ].join("");
  }

  function getActiveUserTasks() {
    if (!authState.currentUser) return [];
    var transfers = getVisibleTransfers().filter(function (transfer) {
      if (transfer.status === "CANCELADA") return false;
      if (isFinalTransferStatus(transfer.status)) return false;
      if (authState.currentUser.role === "OPERADOR") {
        return transfer.responsibleId === authState.currentUser.id;
      }
      if (transfer.status === "PRONTA_PARA_NOTA" || transfer.status === "PRONTA_PARA_NOTA_COM_DIVERGENCIA") return false;
      return true;
    }).map(function (transfer) {
      return { type: "TRANSFERENCIA", id: transfer.id, title: transferDisplayName(transfer), subtitle: transferRouteDestinationLabel(transfer), source: transfer };
    });
    var replenishments = getMyReplenishmentRequests().map(function (request) {
      return {
        type: "REPOSICAO",
        id: request.id,
        title: "SKU " + request.codigoMaterial,
        subtitle: request.nomeMaterial || "Pedido de reposicao",
        source: request
      };
    });
    return transfers.concat(replenishments);
  }

  function renderOperatorTasksAlert() {
    if (!$("operatorTaskAlert") || !$("taskMenuBadge")) return;
    var tasks = getActiveUserTasks();
    var unreadTasks = tasks.filter(function (task) { return !isTaskAlertRead(task); });
    var transferTasks = tasks.filter(function (task) { return task.type === "TRANSFERENCIA"; });
    var replenishmentTasks = tasks.filter(function (task) { return task.type === "REPOSICAO"; });
    var isOperatorUser = authState.currentUser && authState.currentUser.role === "OPERADOR";
    updateHeaderTaskCount(tasks.length);
    $("taskMenuBadge").hidden = !isOperatorUser || !transferTasks.length;
    $("taskMenuBadge").textContent = String(transferTasks.length);
    if ($("replenishmentMenuBadge")) {
      var openReplenishments = getVisibleReplenishmentRequests().filter(function (request) {
        return FINAL_REPLENISHMENT_STATUSES.indexOf(request.status) < 0;
      });
      var badgeCount = isOperatorUser ? replenishmentTasks.length : openReplenishments.length;
      $("replenishmentMenuBadge").hidden = !badgeCount;
      $("replenishmentMenuBadge").textContent = String(badgeCount);
    }
    if (!isOperatorUser || !unreadTasks.length) {
      $("operatorTaskAlert").hidden = true;
      $("operatorTaskAlert").innerHTML = "";
      rememberTaskSignature(tasks);
      return;
    }
    var mainTask = unreadTasks[0];
    $("operatorTaskAlert").hidden = false;
    $("operatorTaskAlert").innerHTML = [
      "<div>",
      "<strong>Você tem uma nova tarefa</strong>",
      "<span>" + escapeHtml(taskMessage(mainTask)) + "</span>",
      "<span>" + escapeHtml(mainTask.title || "-") + " - " + escapeHtml(mainTask.subtitle || "-") + "</span>",
      "</div>",
      "<button class=\"primary-button\" " + (mainTask.type === "REPOSICAO" ? "data-open-replenishments" : "data-open-tasks") + " type=\"button\">Ver minhas tarefas</button>"
    ].join("");
    notifyTaskChanges(tasks);
  }

  function taskMessage(task) {
    if (!task) return "Não foi possível carregar suas tarefas. Tente novamente.";
    if (task.type === "REPOSICAO") return "Você recebeu um pedido de reposição para atender.";
    var transfer = task.source || task;
    if (transfer.status === "CORRECAO_SOLICITADA" || transfer.status === "EM_CORRECAO") return "Sua transferência voltou para revalidação. Confira a montagem da caixa.";
    if (transfer.status === "SEPARACAO_CONCLUIDA" || transfer.status === "EM_LACRE" || transfer.status === "EM_MONTAGEM_CAIXA") return "Separação concluída. Faça a montagem da caixa.";
    if (transfer.status === "EM_SEPARACAO") return "Você possui uma transferência em andamento.";
    return "Você recebeu uma transferência para separar.";
  }

  function taskReadKey(type, id, status) {
    return [type || "", id || "", status || ""].join(":");
  }

  function isTaskAlertRead(task) {
    var source = task.source || task;
    return taskAlertState.read[taskReadKey(task.type, task.id, source.status || "")] === true;
  }

  function markTaskAlertRead(type, id, status) {
    taskAlertState.read[taskReadKey(type, id, status)] = true;
    if ($("operatorTaskAlert")) {
      $("operatorTaskAlert").hidden = true;
      $("operatorTaskAlert").innerHTML = "";
    }
  }

  function taskSignature(tasks) {
    return tasks.map(function (task) {
      return task.type + ":" + task.id;
    }).sort().join("|");
  }

  function rememberTaskSignature(tasks) {
    taskAlertState.signature = taskSignature(tasks);
    taskAlertState.initialized = true;
  }

  function notifyTaskChanges(tasks) {
    var signature = taskSignature(tasks);
    if (!taskAlertState.initialized) {
      taskAlertState.initialized = true;
      taskAlertState.signature = signature;
      return;
    }
    if (signature && signature !== taskAlertState.signature) {
      taskAlertState.signature = signature;
      showToast("Nova tarefa recebida.", "success");
      if (isTaskSoundEnabled()) {
        if (taskAlertState.audioUnlocked) playTaskSound();
        else taskAlertState.pendingSound = true;
      }
    }
  }

  function playTaskSound() {
    if (!isTaskSoundEnabled()) return;
    try {
      var AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) return;
      var context = new AudioContextCtor();
      var oscillator = context.createOscillator();
      var gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 660;
      gain.gain.setValueAtTime(0.001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.18);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.2);
      oscillator.onended = function () { context.close(); };
    } catch (error) {
      taskAlertState.pendingSound = true;
    }
  }

  function notificationService() {
    return {
      createReplenishmentNotification: createReplenishmentNotification,
      playReplenishmentSound: playReplenishmentSound,
      requestBrowserNotificationPermission: requestBrowserNotificationPermission,
      showBrowserNotification: showBrowserNotification
    };
  }

  function requestBrowserNotificationPermission() {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    if (localStorage.getItem(REPLENISHMENT_NOTIFICATION_PERMISSION_KEY) === "asked") return;
    localStorage.setItem(REPLENISHMENT_NOTIFICATION_PERMISSION_KEY, "asked");
    try {
      Notification.requestPermission().catch(function () {});
    } catch (error) {
      recordPerformanceError("notificacao-reposicao", error);
    }
  }

  function showBrowserNotification(title, body) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try {
      new Notification(title, {
        body: body,
        tag: "wms-reposicao-" + activeWarehouseCode(),
        icon: "/favicon.svg"
      });
    } catch (error) {
      recordPerformanceError("notificacao-browser", error);
    }
  }

  function createReplenishmentNotification(request, type) {
    if (!request || !authState.currentUser) return;
    if (normalizeWarehouseCode(request.warehouseCode) !== activeWarehouseCode()) return;
    if (!shouldNotifyCurrentUserAboutReplenishment(request)) return;
    var notifyKey = [type || "created", request.id || "", request.status || "", request.responsavelId || ""].join(":");
    if (taskAlertState.notifiedReplenishments[notifyKey] && Date.now() - taskAlertState.notifiedReplenishments[notifyKey] < 30000) return;
    taskAlertState.notifiedReplenishments[notifyKey] = Date.now();
    var title = type === "returned" ? "Pedido voltou para a fila" : type === "claimed" || type === "assigned" ? "Pedido de reposicao assumido" : "Novo pedido de reposicao";
    var body = "SKU " + request.codigoMaterial + " - " + (request.nomeMaterial || "Produto") + " (" + activeWarehouseCode() + ")";
    showToast(title + ": " + request.codigoMaterial, "success");
    showBrowserNotification(title, body);
    if (isReplenishmentSoundEnabled()) {
      if (taskAlertState.audioUnlocked) playReplenishmentSound();
      else taskAlertState.pendingReplenishmentSound = true;
    }
    renderReplenishmentRealtimeViews();
  }

  function shouldNotifyCurrentUserAboutReplenishment(request) {
    if (!authState.currentUser) return false;
    if (request.status === "PENDENTE" && !request.responsavelId && userCanAccessWarehouse(authState.currentUser, request.warehouseCode)) return true;
    if (request.responsavelId && request.responsavelId === authState.currentUser.id) return true;
    if (isAdminOrSupervisor() && userCanAccessWarehouse(authState.currentUser, request.warehouseCode)) return true;
    return false;
  }

  function playReplenishmentSound() {
    if (!isReplenishmentSoundEnabled()) return;
    var repeat = localStorage.getItem(REPLENISHMENT_SOUND_REPEAT_KEY) || "repeat_30";
    var maxRuns = repeat === "once" ? 1 : repeat === "repeat_open" ? 6 : 10;
    taskAlertState.replenishmentSoundUntil = Date.now() + 30000;
    runReplenishmentSoundPulse(0, maxRuns);
  }

  function runReplenishmentSoundPulse(count, maxRuns) {
    if (!isReplenishmentSoundEnabled() || count >= maxRuns || Date.now() > taskAlertState.replenishmentSoundUntil) return;
    try {
      var AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) return;
      var context = new AudioContextCtor();
      var volume = localStorage.getItem(REPLENISHMENT_SOUND_VOLUME_KEY) || "high";
      var targetGain = volume === "low" ? 0.05 : volume === "medium" ? 0.1 : 0.18;
      [740, 980].forEach(function (frequency, index) {
        var oscillator = context.createOscillator();
        var gain = context.createGain();
        var start = context.currentTime + index * 0.16;
        oscillator.type = "square";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.001, start);
        gain.gain.exponentialRampToValueAtTime(targetGain, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.14);
      });
      window.setTimeout(function () { context.close(); }, 520);
    } catch (error) {
      taskAlertState.pendingReplenishmentSound = true;
      return;
    }
    window.clearTimeout(taskAlertState.replenishmentSoundTimer);
    taskAlertState.replenishmentSoundTimer = window.setTimeout(function () {
      runReplenishmentSoundPulse(count + 1, maxRuns);
    }, 3000);
  }

  function startTaskPolling() {
    stopTaskPolling();
    if (!isSupabaseReady() || !authState.currentUser) return;
    taskPollTimer = window.setInterval(async function () {
      try {
        if (moduleLoadState.transfers) {
          if (realtimeState.active) scheduleTransferRealtimeRefresh("task-poll", 0);
          else {
            await loadTransferData();
            renderTransfers();
          }
        }
        renderOperatorTasksAlert();
      } catch (error) {
        if (authState.currentUser && authState.currentUser.role === "OPERADOR") showToast("Não foi possível carregar suas tarefas. Tente novamente.", "error");
      }
    }, 45000);
  }

  function stopTaskPolling() {
    if (taskPollTimer) {
      window.clearInterval(taskPollTimer);
      taskPollTimer = null;
    }
  }

  function startLeaderLiveSync() {
    stopLeaderLiveSync();
    if (!isSupabaseReady() || !authState.currentUser || !canUseNetwork()) return;
    realtimeState.active = true;
    realtimeState.warehouseCode = activeWarehouseCode();
    realtimeState.failureCount = 0;
    if (!moduleLoadState.transfers) realtimeState.lastLiveUpdateAt = "";
    try {
      if (typeof supabaseDb.channel === "function") {
        [
          { name: "wms_transfers", optional: false },
          { name: "wms_transfer_items", optional: false },
          { name: "wms_stock_positions", optional: false },
          { name: "wms_notifications", optional: true },
          { name: "wms_replenishment_requests", optional: false }
        ].forEach(function (entry) {
          if (entry.optional && isOptionalRealtimeTableDisabled(entry.name)) return;
          var channel = supabaseDb
            .channel("wms-live-" + realtimeState.warehouseCode + "-" + entry.name)
            .on("postgres_changes", warehouseRealtimeConfig(entry.name), handleTransferRealtimeDelta)
            .subscribe(function (status) {
              realtimeState.subscriptionStatus = entry.name + ":" + status;
              if (status === "SUBSCRIBED") setSyncStatus("Ao vivo", "success");
              if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                if (entry.optional) disableOptionalRealtimeTable(entry.name, new Error("Assinatura realtime " + status), "live-optional-" + entry.name);
                else setSyncStatus("Tempo real reconectando", "warning");
              }
            });
          realtimeState.channels.push(channel);
          if (!realtimeState.channel) realtimeState.channel = channel;
        });
      }
    } catch (error) {
      recordPerformanceError("realtime", error);
    }
    realtimeState.pollTimer = window.setInterval(function () {
      scheduleTransferRealtimeRefresh("poll", 0);
    }, 12000);
    scheduleTransferRealtimeRefresh("start", 250);
  }

  function warehouseRealtimeConfig(tableName) {
    return {
      event: "*",
      schema: "public",
      table: tableName,
      filter: "warehouse_code=eq." + activeWarehouseCode()
    };
  }

  function stopLeaderLiveSync() {
    realtimeState.active = false;
    realtimeState.refreshPending = false;
    realtimeState.refreshRunning = false;
    realtimeState.warehouseCode = "";
    realtimeState.subscriptionStatus = "";
    realtimeState.failureCount = 0;
    if (realtimeState.refreshTimer) {
      window.clearTimeout(realtimeState.refreshTimer);
      realtimeState.refreshTimer = null;
    }
    if (realtimeState.pollTimer) {
      window.clearInterval(realtimeState.pollTimer);
      realtimeState.pollTimer = null;
    }
    if (realtimeState.stockRefreshTimer) {
      window.clearTimeout(realtimeState.stockRefreshTimer);
      realtimeState.stockRefreshTimer = null;
    }
    if (supabaseDb && typeof supabaseDb.removeChannel === "function") {
      (realtimeState.channels || []).forEach(function (channel) {
        try { supabaseDb.removeChannel(channel); } catch (error) { recordPerformanceError("realtime-stop", error); }
      });
      if (!realtimeState.channels.length && realtimeState.channel) {
        try { supabaseDb.removeChannel(realtimeState.channel); } catch (error) { recordPerformanceError("realtime-stop", error); }
      }
    }
    realtimeState.channel = null;
    realtimeState.channels = [];
  }

  async function handleTransferRealtimeDelta(payload) {
    if (!realtimeState.active) return;
    var row = payload && (payload.new || payload.old) ? (payload.new || payload.old) : {};
    if (!processRowMatchesActiveWarehouse(row)) {
      transferDebugLog("Evento ignorado por estoque diferente ou indefinido", payload);
      if (!rawWarehouseCodeValue(row) && isMultiWarehouseMode()) scheduleTransferRealtimeRefresh("realtime-warehouse-indefinido", 500);
      return;
    }
    realtimeState.lastLiveUpdateAt = row.updated_at || row.created_at || nowIso();
    try {
      transferDebugLog("Realtime " + ((payload && payload.eventType) || "EVENTO") + " recebido", payload);
      realtimeState.recentEvents.unshift({
        at: nowIso(),
        table: (payload && payload.table) || "",
        event: (payload && payload.eventType) || "",
        id: row.id || "",
        transferId: row.transfer_id || row.id || "",
        warehouseCode: row.warehouse_code || ""
      });
      realtimeState.recentEvents = realtimeState.recentEvents.slice(0, 10);
      if (payload && payload.table === "wms_replenishment_requests") {
        applyReplenishmentRealtimePayload(payload);
        renderReplenishmentRealtimeViews();
        setSyncStatus("Ao vivo", "success");
        return;
      }
      applyTransferRealtimePayload(payload);
      renderTransferRealtimeViews();
      setSyncStatus("Ao vivo", "success");
    } catch (error) {
      recordPerformanceError("realtime-delta", error);
      scheduleTransferRealtimeRefresh("realtime-fallback", 350);
    }
  }

  function applyTransferRealtimePayload(payload) {
    var table = payload && payload.table ? payload.table : "";
    var eventType = payload && payload.eventType ? payload.eventType : "";
    var row = payload && payload.new ? payload.new : {};
    var oldRow = payload && payload.old ? payload.old : {};
    if (table === "wms_transfers") {
      if (eventType === "DELETE") removeLocalTransferEverywhere(oldRow.id);
      else applyLocalTransferUpdate(fromDbTransfer(row));
    } else if (table === "wms_transfer_items") {
      if (eventType === "DELETE") removeById(transferState.items, oldRow.id);
      else applyLocalTransferItemUpdate(fromDbTransferItem(row));
    } else if (table === "wms_stock_positions") {
      scheduleStockRealtimeRefresh();
    } else if (table === "wms_transfer_divergences") {
      var transferId = (row && row.transfer_id) || (oldRow && oldRow.transfer_id) || "";
      var transfer = getTransferById(transferId);
      if (transfer) transfer.hasDivergence = true;
    } else if (table === "wms_task_notifications" || table === "wms_notifications") {
      renderOperatorTasksAlert();
    }
    invalidateTransferStatsCache();
    writeTransferCacheSoon();
  }

  function renderTransferRealtimeViews() {
    var activeScreen = getActiveScreenId();
    if (activeScreen === "transferencias") renderTransfers();
    if (activeScreen === "dashboard") renderDashboard();
    renderOperatorTasksAlert();
  }

  function scheduleStockRealtimeRefresh() {
    stockState.positionCache = {};
    if (stockState.importing) return;
    if (realtimeState.stockRefreshTimer) window.clearTimeout(realtimeState.stockRefreshTimer);
    realtimeState.stockRefreshTimer = window.setTimeout(function () {
      realtimeState.stockRefreshTimer = null;
      if (stockState.importing || getActiveScreenId() !== "baseEstoque") return;
      refreshStockOperationalData().catch(function (error) {
        recordPerformanceError("stock-realtime-refresh", error);
      });
    }, 1500);
  }

  function applyReplenishmentRealtimePayload(payload) {
    var eventType = payload && payload.eventType ? payload.eventType : "";
    var row = payload && payload.new ? payload.new : {};
    var oldRow = payload && payload.old ? payload.old : {};
    if (eventType === "DELETE" || (row && row.is_deleted === true)) {
      removeById(replenishmentState.requests, (oldRow && oldRow.id) || (row && row.id));
      return;
    }
    if (row && row.id) {
      var before = getReplenishmentById(row.id);
      var request = fromDbReplenishmentRequest(row);
      upsertById(replenishmentState.requests, request);
      if (eventType === "INSERT" || (!before && request.id) || (before && before.responsavelId !== request.responsavelId) || (before && before.status !== request.status && request.status === "PENDENTE")) {
        var type = request.status === "PENDENTE" && !request.responsavelId ? (before ? "returned" : "created") : request.responsavelId ? "claimed" : "created";
        createReplenishmentNotification(request, type);
      }
    }
  }

  function renderReplenishmentRealtimeViews() {
    var activeScreen = getActiveScreenId();
    if (activeScreen === "reposicao") renderReplenishment();
    if (activeScreen === "dashboard") renderDashboard();
    renderOperatorTasksAlert();
  }

  function scheduleTransferRealtimeRefresh(reason, delayMs) {
    if (!realtimeState.active || !isSupabaseReady() || !canUseNetwork()) return;
    if (reason === "poll" && realtimeState.refreshRunning) {
      realtimeState.refreshPending = true;
      return;
    }
    realtimeState.refreshPending = true;
    if (realtimeState.refreshTimer) return;
    realtimeState.refreshTimer = window.setTimeout(refreshLeaderIncrementalData, Math.max(0, delayMs || 0));
  }

  async function refreshLeaderIncrementalData() {
    realtimeState.refreshTimer = null;
    if (!realtimeState.active || !isSupabaseReady() || !canUseNetwork()) return;
    if (transferState.savingActionKey) {
      scheduleTransferRealtimeRefresh("busy", 900);
      return;
    }
    if (realtimeState.refreshRunning) {
      realtimeState.refreshPending = true;
      return;
    }
    realtimeState.refreshRunning = true;
    realtimeState.refreshPending = false;
    var retryDelay = 0;
    try {
      var startedAt = performance.now();
      var since = realtimeState.lastLiveUpdateAt || "";
      invalidateTransferStatsCache();
      if (!since || !moduleLoadState.transfers) {
        await loadTransferData();
        if (moduleLoadState.replenishment) await refreshReplenishmentData();
        realtimeState.lastLiveUpdateAt = latestDate(transferState.transfers.concat(transferState.items).map(function (row) {
          return { createdAt: row.updatedAt || row.createdAt || nowIso() };
        })) || nowIso();
      } else {
        var transferRows = await fetchWarehouseUpdatedRows("wms_transfers", "updated_at", since);
        var shouldFetchItemRows = transferState.activeTransferId || Object.keys(transferState.loadedItemTransferIds || {}).length > 0;
        var itemRows = shouldFetchItemRows ? await fetchWarehouseUpdatedRows("wms_transfer_items", "updated_at", since) : [];
        transferRows.forEach(function (row) { applyLocalTransferUpdate(fromDbTransfer(row)); });
        itemRows.forEach(function (row) { applyLocalTransferItemUpdate(fromDbTransferItem(row)); });
        if (moduleLoadState.replenishment) await refreshReplenishmentData();
        var newest = [since].concat(transferRows.map(function (row) { return row.updated_at || row.created_at || ""; }), itemRows.map(function (row) { return row.updated_at || row.created_at || ""; })).sort().pop();
        realtimeState.lastLiveUpdateAt = newest || nowIso();
        writeTransferCacheSoon();
      }
      recordPerformanceMetric("lastTransferQueryMs", startedAt);
      renderTransferRealtimeViews();
      realtimeState.failureCount = 0;
      setSyncStatus("Ao vivo", "success");
    } catch (error) {
      if (!isExpectedLegacySchemaCompatibilityError(error)) recordPerformanceError("live-transfer", error);
      // A sincronização incremental é recuperável: um schema antigo ou uma resposta
      // interrompida não deve bloquear a operação nem deixar o status em erro permanente.
      try {
        moduleLoadState.transfers = false;
        var recovered = await loadTransferData();
        if (recovered) {
          renderTransferRealtimeViews();
          realtimeState.failureCount = 0;
          setSyncStatus("Sincronizado (recuperado)", "warning");
        } else {
          realtimeState.failureCount += 1;
          retryDelay = nextRealtimeRetryDelay(realtimeState.failureCount);
          setSyncStatus("Conexão instável • nova tentativa", "warning");
        }
      } catch (recoveryError) {
        recordPerformanceError("live-transfer-recovery", recoveryError);
        realtimeState.failureCount += 1;
        retryDelay = nextRealtimeRetryDelay(realtimeState.failureCount);
        setSyncStatus("Conexão instável • nova tentativa", "warning");
      }
      realtimeState.refreshPending = false;
    } finally {
      realtimeState.refreshRunning = false;
      if (retryDelay) scheduleTransferRealtimeRefresh("retry", retryDelay);
      else if (realtimeState.refreshPending) scheduleTransferRealtimeRefresh("pending", 500);
    }
  }

  function renderTransfers() {
    if (!$("transferencias")) return;
    invalidateTransferStatsCache();
    renderTransferTabVisibility();
    var activeSection = getActiveTransferSectionId();
    renderTransferSelects();
    if (activeSection === "transferPanelSection") renderTransferPanel();
    if (activeSection === "myTransfersSection") renderMyTransfers();
    if (activeSection === "finalizedTransfersSection") renderFinalizedTransfers();
    if (activeSection === "establishmentsSection") renderEstablishments();
    if (activeSection === "newTransferSection") renderTransferPreview();
    if (activeSection === "transferWorkSection") renderTransferWork();
  }

  function getActiveTransferSectionId() {
    var activeSection = document.querySelector(".transfer-section:not([hidden])");
    return activeSection ? activeSection.id : "transferPanelSection";
  }

  function renderTransferTabVisibility() {
    var workVisible = $("transferWorkSection") && !$("transferWorkSection").hidden;
    document.querySelectorAll(".transfer-tab").forEach(function (button) {
      var target = button.dataset.transferTab;
      var visible = target === "myTransfersSection" || isAdminOrSupervisor();
      if (target === "transferConferenceSection") visible = false;
      if (target === "establishmentsSection") visible = isAdmin();
      button.hidden = !visible;
      if (button.classList.contains("active") && !visible) activateTransferTab("myTransfersSection");
    });
    if (!workVisible && authState.currentUser && authState.currentUser.role === "OPERADOR") activateTransferTab("myTransfersSection");
  }

  function activateTransferTab(sectionId) {
    document.querySelectorAll(".transfer-section").forEach(function (section) {
      section.hidden = section.id !== sectionId;
    });
    document.querySelectorAll(".transfer-tab").forEach(function (button) {
      button.classList.toggle("active", button.dataset.transferTab === sectionId);
    });
    if (sectionId === "transferWorkSection") {
      document.querySelectorAll(".transfer-tab").forEach(function (button) { button.classList.remove("active"); });
    }
  }

  function renderTransferSelects() {
    var activeEstablishments = transferState.establishments.filter(function (item) { return item.active; });
    var operators = getTaskAssignableUsers();
    if ($("transferDestinationInput")) {
      $("transferDestinationInput").innerHTML = "<option value=\"\">Selecione</option>" + activeEstablishments.map(function (item) {
        return "<option value=\"" + item.id + "\">" + escapeHtml(item.code + " - " + item.name) + "</option>";
      }).join("");
    }
    if ($("transferResponsibleInput")) {
      $("transferResponsibleInput").innerHTML = "<option value=\"\">Selecione</option>" + operators.map(function (user) {
        return "<option value=\"" + user.id + "\">" + escapeHtml(user.name + " (" + user.username + ")") + "</option>";
      }).join("");
    }
    if ($("conferenceUserSelect")) {
      var selectedConferenceUser = $("conferenceUserSelect").value;
      $("conferenceUserSelect").innerHTML = transferConferenceOptionsHtml(selectedConferenceUser);
    }
    if ($("transferResponsibleFilter")) {
      $("transferResponsibleFilter").innerHTML = "<option value=\"\">Todos</option>" + getTaskAssignableUsers().map(function (user) {
        return "<option value=\"" + user.id + "\">" + escapeHtml(user.name) + "</option>";
      }).join("");
    }
    if ($("transferEstablishmentFilter")) {
      $("transferEstablishmentFilter").innerHTML = "<option value=\"\">Todos</option>" + transferState.establishments.map(function (item) {
        return "<option value=\"" + item.id + "\">" + escapeHtml(item.name) + "</option>";
      }).join("");
    }
    if ($("conferenceTransferSelect")) {
      var selectedTransfer = $("conferenceTransferSelect").value;
      var transferOptions = getVisibleTransfers().filter(function (transfer) {
        return transfer.status !== "CANCELADA";
      });
      if (!selectedTransfer && transferOptions.length) selectedTransfer = transferOptions[0].id;
      $("conferenceTransferSelect").innerHTML = transferOptions.length
        ? transferOptions.map(function (transfer) {
          var label = transferDisplayName(transfer) + " - " + transferRouteDestinationLabel(transfer) + " - " + transfer.status;
          return "<option value=\"" + transfer.id + "\"" + (transfer.id === selectedTransfer ? " selected" : "") + ">" + escapeHtml(label) + "</option>";
        }).join("")
        : "<option value=\"\">Nenhuma transferência disponível</option>";
    }
  }

  function getTaskAssignableUsers() {
    return authState.users.filter(function (user) {
      return userCanReceiveTaskInActiveWarehouse(user);
    });
  }

  function userCanReceiveReplenishmentInWarehouse(user, warehouseCode) {
    warehouseCode = normalizeWarehouseCode(warehouseCode || activeWarehouseCode());
    if (!user || !user.active || user.archived === true || !user.availableForTasks) return false;
    if (user.isGlobalAdmin || user.role === "ADMINISTRADOR") return false;
    if (["OPERADOR", "ESTOQUISTA", "SUPERVISOR", "LIDER"].indexOf(user.role) < 0) return false;
    return normalizeWarehouseCodeOrBlank(user.defaultWarehouseCode) === warehouseCode;
  }

  function getAssignableUsersByWarehouse(warehouseCode) {
    warehouseCode = normalizeWarehouseCode(warehouseCode || activeWarehouseCode());
    return authState.users.filter(function (user) {
      return userCanReceiveReplenishmentInWarehouse(user, warehouseCode);
    }).sort(function (a, b) {
      return String(a.name || a.username).localeCompare(String(b.name || b.username));
    });
  }

  function renderTransferPanel() {
    if (!$("transferPanelRows")) return;
    renderTransferMergePanel();
    var transfers = getVisibleTransfers();
    if (isAdminOrSupervisor()) {
      var status = $("transferStatusFilter").value;
      var responsible = $("transferResponsibleFilter").value;
      var establishment = $("transferEstablishmentFilter").value;
      var query = normalizeText($("transferCodeFilter").value).toLowerCase();
      transfers = transfers.filter(function (transfer) {
        if (status && transfer.status !== status) return false;
        if (!status && (isFinalTransferStatus(transfer.status) || transfer.status === "CANCELADA")) return false;
        if (responsible && transfer.responsibleId !== responsible) return false;
        if (establishment && transfer.establishmentId !== establishment) return false;
        if (query) {
          var haystack = [transfer.code, transfer.name, transfer.establishmentName, transfer.responsibleName].join(" ").toLowerCase();
          if (haystack.indexOf(query) === -1) return false;
        }
        return true;
      });
    }
    var operationalTransfers = getVisibleTransfers().filter(function (item) { return !isFinalTransferStatus(item.status); });
    $("transferMetricTotal").textContent = operationalTransfers.length;
    $("transferMetricSeparating").textContent = operationalTransfers.filter(function (item) { return item.status === "EM_SEPARACAO"; }).length;
    setTextIfExists("transferMetricBox", operationalTransfers.filter(function (item) { return ["SEPARACAO_CONCLUIDA", "EM_LACRE", "EM_MONTAGEM_CAIXA", "CORRECAO_SOLICITADA", "EM_CORRECAO", "LACRE_CONCLUIDO", "MONTAGEM_CAIXA_CONCLUIDA"].indexOf(item.status) >= 0; }).length);
    $("transferMetricReady").textContent = operationalTransfers.filter(function (item) { return item.status === "PRONTA_PARA_NOTA" || item.status === "PRONTA_PARA_NOTA_COM_DIVERGENCIA" || item.status === "LACRE_CONCLUIDO" || item.status === "MONTAGEM_CAIXA_CONCLUIDA"; }).length;
    var renderLimit = Number(transferState.panelRenderLimit || TRANSFER_PANEL_RENDER_LIMIT);
    var visibleTransfers = transfers.slice(0, renderLimit);
    $("transferPanelRows").innerHTML = visibleTransfers.length
      ? visibleTransfers.map(transferPanelRowHtml).join("") + renderTransferPanelLimitNotice(transfers.length, visibleTransfers.length)
      : "<div class=\"empty-state compact\">Nenhuma transferência encontrada.</div>";
  }

  function transferPanelRowHtml(transfer) {
    var stats = getTransferStats(transfer.id);
    var conferenceAssignment = getLatestTransferConferenceAssignment(transfer.id);
    var origin = transferRouteOriginLabel(transfer);
    var destination = transferRouteDestinationLabel(transfer);
    var source = transfer.importSource || (getTransferFlow(transfer) === "CONFERENCIA_XML" ? "XML" : "EXCEL");
    var stage = transferPanelStageInfo(transfer.status);
    var pendingCount = stage.label === "Caixa" || stage.label === "Nota" ? stats.pendingPacking : stats.pendingSeparation;
    var progressClass = stats.progress >= 100 ? "is-complete" : stats.progress > 0 ? "is-active" : "is-empty";
    var progressDetail = stage.label === "Caixa" || stage.label === "Nota"
      ? formatQty(stats.packed) + " de " + formatQty(Math.max(stats.separated, stats.requested)) + " na caixa"
      : formatQty(stats.separated) + " de " + formatQty(stats.requested) + " separados";
    var mergeSelect = isAdminOrSupervisor() && canSelectTransferForMerge(transfer)
      ? "<label class=\"transfer-merge-select\"><input type=\"checkbox\" data-transfer-merge-select=\"" + transfer.id + "\"" + (transferState.mergeSelection[transfer.id] ? " checked" : "") + "> Unificar</label>"
      : "";
    var reassignControl = canReassignTransfer(transfer)
      ? "<label class=\"transfer-reassign-control\"><span>Responsavel</span><select data-transfer-reassign=\"" + transfer.id + "\">" + transferResponsibleOptionsHtml(transfer.responsibleId) + "</select></label>"
      : "";
    var mergedInfo = transfer.isMerged ? "<div class=\"transfer-board-note\">Unificada de " + transfer.mergedFromIds.length + " transferencia(s)</div>" : transfer.mergedIntoId ? "<div class=\"transfer-board-note\">Arquivada por unificacao</div>" : "";
    return [
      "<article class=\"transfer-board-card " + stage.className + "\">",
      "<div class=\"transfer-board-main\">",
      "<div class=\"transfer-board-top\"><span class=\"transfer-source-pill\">" + escapeHtml(source) + "</span><span class=\"transfer-stage-chip\">" + escapeHtml(stage.label) + "</span></div>",
      "<div class=\"transfer-board-title\"><strong>" + escapeHtml(transferDisplayName(transfer)) + "</strong><small>" + escapeHtml(transfer.code || "-") + "</small></div>",
      "<div class=\"transfer-route-flow\"><div><span>Sai de</span><strong>" + escapeHtml(origin) + "</strong></div><span class=\"route-arrow\">&rarr;</span><div><span>Vai para</span><strong>" + escapeHtml(destination) + "</strong></div></div>",
      "</div>",
      "<div class=\"transfer-board-status\">",
      "<div class=\"transfer-stage-line\"><span class=\"stage-dot\"></span><strong>" + escapeHtml(stage.label) + "</strong><span>" + escapeHtml(transferStatusDisplayLabel(transfer.status)) + "</span></div>",
      transferStageTrackHtml(transfer.status),
      "<div class=\"transfer-progress " + progressClass + "\"><div class=\"transfer-progress-bar\"><span style=\"width:" + stats.progress + "%\"></span></div><span><strong>" + stats.progress + "%</strong> " + escapeHtml(progressDetail) + "</span></div>",
      "<div class=\"transfer-board-meta\"><span><small>SKUs</small><strong>" + stats.totalItems + "</strong></span><span><small>Volume</small><strong>" + formatQty(stats.requested) + " un.</strong></span><span><small>Pendente</small><strong>" + pendingCount + "</strong></span><span><small>Responsável</small><strong>" + escapeHtml(transfer.responsibleName || "-") + "</strong></span><span><small>Criada</small><strong>" + formatDateTime(transfer.createdAt) + "</strong></span></div>",
      conferenceAssignment ? "<div class=\"transfer-board-note\">Conferente: " + escapeHtml(conferenceAssignment.assignedUserName || "-") + "</div>" : "",
      mergedInfo,
      "</div>",
      "<div class=\"row-actions transfer-action-stack transfer-board-actions\">",
      mergeSelect,
      reassignControl,
      "<button class=\"edit-small\" data-transfer-view=\"" + transfer.id + "\" type=\"button\">Visualizar</button>",
      canCancelTransfer(transfer) ? "<button class=\"remove-small\" data-transfer-cancel=\"" + transfer.id + "\" type=\"button\">Cancelar</button>" : "",
      isAdminOrSupervisor() ? "<button class=\"remove-small\" data-transfer-delete-permanent=\"" + transfer.id + "\" type=\"button\">Excluir</button>" : "",
      "</div>",
      "</article>"
    ].join("");
  }

  function transferPanelStageInfo(status) {
    if (["SEPARACAO_CONCLUIDA", "EM_LACRE", "EM_MONTAGEM_CAIXA", "CORRECAO_SOLICITADA", "EM_CORRECAO", "LACRE_CONCLUIDO", "MONTAGEM_CAIXA_CONCLUIDA"].indexOf(status) >= 0) {
      return { label: "Caixa", className: "stage-box" };
    }
    if (status === "PRONTA_PARA_NOTA" || status === "PRONTA_PARA_NOTA_COM_DIVERGENCIA") {
      return { label: "Nota", className: "stage-note" };
    }
    if (status === "UNIFICADA" || status === "ARQUIVADA_POR_UNIFICACAO") return { label: "Unificada", className: "stage-merged" };
    if (status === "CANCELADA") return { label: "Cancelada", className: "stage-cancelled" };
    return { label: "Separação", className: "stage-separation" };
  }

  function transferStageTrackHtml(status) {
    var activeIndex = 1;
    if (["EM_SEPARACAO", "SEPARACAO_CONCLUIDA"].indexOf(status) >= 0) activeIndex = 2;
    if (["EM_LACRE", "EM_MONTAGEM_CAIXA", "CORRECAO_SOLICITADA", "EM_CORRECAO"].indexOf(status) >= 0) activeIndex = 3;
    if (["LACRE_CONCLUIDO", "MONTAGEM_CAIXA_CONCLUIDA", "PRONTA_PARA_NOTA", "PRONTA_PARA_NOTA_COM_DIVERGENCIA"].indexOf(status) >= 0) activeIndex = 3;
    if (isFinalTransferStatus(status)) activeIndex = 4;
    if (status === "CANCELADA" || status === "UNIFICADA" || status === "ARQUIVADA_POR_UNIFICACAO") activeIndex = -1;
    var steps = ["Criada", "Separação", "Caixa", "Nota"];
    return "<div class=\"transfer-stage-track\">" + steps.map(function (label, index) {
      var stepIndex = index + 1;
      var className = activeIndex < 0 ? "" : stepIndex < activeIndex ? "is-done" : stepIndex === activeIndex ? "is-current" : "";
      return "<span class=\"" + className + "\">" + escapeHtml(label) + "</span>";
    }).join("") + "</div>";
  }

  function renderTransferMergePanel() {
    if (!$("transferMergePanel")) return;
    $("transferMergePanel").hidden = !isAdminOrSupervisor();
    if (!isAdminOrSupervisor()) {
      transferState.mergeSelection = {};
      transferState.mergePreview = null;
      return;
    }
    renderTransferMergePreview(false);
  }

  function handleTransferMergeSelectionChange(event) {
    var reassignSelect = event.target.closest("[data-transfer-reassign]");
    if (reassignSelect) {
      reassignTransferResponsible(reassignSelect.dataset.transferReassign, reassignSelect.value);
      return;
    }
    var input = event.target.closest("[data-transfer-merge-select]");
    if (!input) return;
    var transfer = getTransferById(input.dataset.transferMergeSelect);
    if (!transfer) return;
    if (input.checked && !canSelectTransferForMerge(transfer)) {
      input.checked = false;
      setStatus("transferMergeStatus", mergeBlockedMessage(transfer), "error");
      return;
    }
    if (input.checked) transferState.mergeSelection[transfer.id] = true;
    else delete transferState.mergeSelection[transfer.id];
    transferState.mergePreview = null;
    renderTransferMergePreview(false);
  }

  async function reassignTransferResponsible(transferId, userId) {
    var transfer = getTransferById(transferId);
    var user = authState.users.find(function (entry) { return entry.id === userId; });
    if (!transfer || !canReassignTransfer(transfer)) {
      showToast("Esta transferencia nao permite troca de responsavel.", "warning");
      renderTransfers();
      return;
    }
    if (!user || !user.active || user.archived === true || !user.availableForTasks) {
      showToast("Selecione um usuario ativo e disponivel.", "error");
      renderTransfers();
      return;
    }
    if (!userCanAccessWarehouse(user, transfer.warehouseCode || activeWarehouseCode())) {
      showToast("O responsavel precisa pertencer ao mesmo estoque da transferencia.", "error");
      renderTransfers();
      return;
    }
    if (!isSupabaseReady()) {
      showToast("Supabase nao conectado.", "error");
      renderTransfers();
      return;
    }
    var actionKey = "reassign-transfer:" + transfer.id;
    if (!beginTransferAction(actionKey, null, "Salvando...")) return;
    var previousName = transfer.responsibleName || "-";
    var update = {
      responsavel_id: user.id,
      responsavel_nome: user.name,
      updated_at: new Date().toISOString(),
      last_action_at: new Date().toISOString(),
      last_action_label: "Responsavel alterado para " + user.name,
      current_step: transferCurrentStepForStatus(transfer.status)
    };
    if (transfer.status === "PENDENTE") update.status = "ATRIBUIDA";
    try {
      var response = await updateTransferWithSchemaFallback(transfer.id, update);
      if (response.error) throw response.error;
      transfer.responsibleId = user.id;
      transfer.responsibleName = user.name;
      transfer.updatedAt = update.updated_at;
      transfer.lastActionAt = update.last_action_at;
      transfer.lastActionLabel = update.last_action_label;
      if (update.status) transfer.status = update.status;
      await recordTransferEvent(transfer.id, "", "TRANSFER_REASSIGNED", "", 0, "Responsavel alterado de " + previousName + " para " + user.name + ".", {
        previousResponsibleName: previousName,
        responsibleId: user.id,
        responsibleName: user.name
      });
      invalidateTransferStatsCache();
      writeTransferCacheSoon();
      renderTransfers();
      showToast("Responsavel alterado para " + user.name + ".", "success");
    } catch (error) {
      showToast("Erro ao trocar responsavel: " + formatSupabaseError(error), "error");
      renderTransfers();
    } finally {
      endTransferAction(null);
    }
  }

  function clearTransferMergeSelection() {
    transferState.mergeSelection = {};
    transferState.mergePreview = null;
    transferState.mergeResolutions = {};
    renderTransferPanel();
    setStatus("transferMergeStatus", "Selecao limpa.", "success");
  }

  function selectedMergeTransfers() {
    return selectedMergeTransferIds().map(getTransferById).filter(Boolean);
  }

  function selectedMergeTransferIds() {
    return unique(Object.keys(transferState.mergeSelection || {}).filter(Boolean));
  }

  function canSelectTransferForMerge(transfer) {
    return !!transfer && MERGEABLE_TRANSFER_STATUSES.indexOf(transfer.status) >= 0 && !transfer.mergedIntoId && transfer.status !== "UNIFICADA" && transfer.status !== "ARQUIVADA_POR_UNIFICACAO";
  }

  function canReassignTransfer(transfer) {
    return isAdminOrSupervisor()
      && transfer
      && transfer.status !== "CANCELADA"
      && transfer.status !== "UNIFICADA"
      && transfer.status !== "ARQUIVADA_POR_UNIFICACAO"
      && !isFinalTransferStatus(transfer.status);
  }

  function mergeBlockedMessage(transfer) {
    if (!transfer) return "Transferencia invalida para unificacao.";
    if (transfer.status === "UNIFICADA" || transfer.status === "ARQUIVADA_POR_UNIFICACAO" || transfer.mergedIntoId) return "Esta transferencia ja foi unificada em outra transferencia.";
    return "Esta transferencia ja foi iniciada e nao pode ser unificada.";
  }

  function transferMergeRouteKey(transfer) {
    return [
      normalizeWarehouseCode(transfer.warehouseCode || activeWarehouseCode()),
      normalizeText(transfer.originStoreCode || transfer.originName || transfer.originCnpj).toUpperCase(),
      normalizeText(transfer.destinationStoreCode || transfer.destinationName || transfer.establishmentCode || transfer.establishmentName || transfer.destinationCnpj).toUpperCase()
    ].join("|");
  }

  function buildTransferMergePreview() {
    var selectedIds = selectedMergeTransferIds();
    var transfers = selectedIds.map(getTransferById).filter(Boolean);
    var errors = [];
    if (!Array.isArray(selectedIds) || !selectedIds.length) errors.push("Selecione transferencias no painel para unificar.");
    if (transfers.length !== selectedIds.length) errors.push("A selecao contem transferencia nao carregada. Atualize o painel e selecione novamente.");
    if (transfers.length < 2) errors.push("Selecione duas ou mais transferencias.");
    transfers.forEach(function (transfer) {
      if (!canSelectTransferForMerge(transfer)) errors.push(mergeBlockedMessage(transfer) + " " + transferDisplayName(transfer));
      if (normalizeWarehouseCode(transfer.warehouseCode || activeWarehouseCode()) !== activeWarehouseCode()) errors.push("Nao e permitido unificar transferencias de outro estoque.");
    });
    var firstKey = transfers[0] ? transferMergeRouteKey(transfers[0]) : "";
    if (transfers.some(function (transfer) { return transferMergeRouteKey(transfer) !== firstKey; })) {
      errors.push("As transferências selecionadas pertencem a destinos diferentes. Selecione apenas transferências da mesma VD para unificar.");
    }
    var transferIds = {};
    transfers.forEach(function (transfer) { transferIds[transfer.id] = true; });
    var grouped = {};
    transferState.items.forEach(function (item) {
      if (!transferIds[item.transferId] || item.isExtra) return;
      var key = normalizeSkuKey(item.sku);
      if (!grouped[key]) grouped[key] = { sku: item.sku, description: item.description, entries: [] };
      grouped[key].entries.push({ transfer: getTransferById(item.transferId), item: item, qty: transferMergeOriginalQty(item), unit: item.unit || "UN" });
      if (!grouped[key].description && item.description) grouped[key].description = item.description;
    });
    var items = Object.keys(grouped).map(function (key) {
      var row = grouped[key];
      var units = unique(row.entries.map(function (entry) { return normalizeText(entry.unit || "UN").toUpperCase(); }));
      var repeated = row.entries.length > 1;
      var unitConflict = units.length > 1;
      var conflictType = unitConflict ? "UNIDADE_DIFERENTE" : repeated ? "SKU_REPETIDO" : "";
      var resolution = transferState.mergeResolutions[key] || { type: unitConflict ? "MANUAL" : "SUM", manualQty: "" };
      var finalQty = resolveMergeFinalQty(row.entries, resolution);
      return Object.assign(row, {
        key: key,
        unit: units[0] || "UN",
        repeated: repeated,
        unitConflict: unitConflict,
        conflictType: conflictType,
        resolutionType: resolution.type || "SUM",
        manualQty: resolution.manualQty || "",
        finalQty: finalQty
      });
    }).sort(function (a, b) { return String(a.sku).localeCompare(String(b.sku)); });
    if (items.some(function (item) { return item.unitConflict && !(Number(item.finalQty) > 0); })) {
      errors.push("Existe SKU com unidade diferente. Informe a quantidade final manualmente antes de confirmar.");
    }
    if (items.some(function (item) { return Number(item.finalQty || 0) <= 0; })) {
      errors.push("Existe SKU com quantidade final zero. Corrija a quantidade antes de unificar.");
    }
    var repeatedCount = items.filter(function (item) { return item.repeated; }).length;
    var totalQty = items.reduce(function (sum, item) { return sum + Number(item.finalQty || 0); }, 0);
    return { selectedTransferIds: selectedIds, transfers: transfers, items: items, errors: unique(errors), repeatedCount: repeatedCount, totalQty: totalQty };
  }

  function transferMergeOriginalQty(item) {
    var requested = Number(item && item.requestedQty || 0);
    if (requested > 0) return requested;
    if (isBoxQuantityItem(item)) {
      var boxes = Number(item.boxQty || 0);
      if (boxes > 0) return boxes;
      var unitsPerBox = Number(item.unitsPerBox || 0);
      var totalUnits = Number(item.totalUnits || 0);
      if (unitsPerBox > 0 && totalUnits > 0) return totalUnits / unitsPerBox;
      if (totalUnits > 0) return totalUnits;
    }
    var fallbackUnits = Number(item && item.totalUnits || 0);
    return fallbackUnits > 0 ? fallbackUnits : 0;
  }

  function resolveMergeFinalQty(entries, resolution) {
    var type = resolution && resolution.type ? resolution.type : "SUM";
    if (type === "MANUAL") return Number(resolution.manualQty || 0);
    if (type.indexOf("USE:") === 0) {
      var transferId = type.slice(4);
      var match = entries.find(function (entry) { return entry.transfer && entry.transfer.id === transferId; });
      return match ? Number(match.qty || 0) : 0;
    }
    return entries.reduce(function (sum, entry) { return sum + Number(entry.qty || 0); }, 0);
  }

  function renderTransferMergePreview(forceOpen) {
    if (!$("transferMergePreview")) return;
    var transfers = selectedMergeTransfers();
    if (!transfers.length) {
      $("transferMergePreview").innerHTML = "";
      setStatus("transferMergeStatus", "Selecione transferencias no painel para unificar.", "warning");
      return;
    }
    var preview = buildTransferMergePreview();
    transferState.mergePreview = preview;
    setStatus("transferMergeStatus", preview.errors.length ? preview.errors[0] : "Previa pronta para confirmar.", preview.errors.length ? "error" : "success");
    if (!forceOpen && transfers.length < 2) {
      $("transferMergePreview").innerHTML = "<div class=\"empty-state compact\">" + transfers.length + " transferencia selecionada. Selecione pelo menos duas.</div>";
      return;
    }
    $("transferMergePreview").innerHTML = transferMergePreviewHtml(preview);
  }

  async function ensureSelectedMergeItemsLoaded() {
    var transfers = selectedMergeTransfers();
    if (!transfers.length) return;
    setStatus("transferMergeStatus", "Carregando itens das transferencias selecionadas...", "warning");
    for (var index = 0; index < transfers.length; index += 1) {
      await loadTransferItemsForTransfer(transfers[index].id);
    }
  }

  function transferMergePreviewHtml(preview) {
    var first = preview.transfers[0] || {};
    var responsible = preview.transfers.map(function (transfer) { return transfer.responsibleName || "-"; }).filter(Boolean)[0] || "-";
    var selectedCodes = preview.transfers.map(function (transfer) { return transfer.code || transfer.name || transfer.id; }).join(", ");
    return [
      "<div class=\"transfer-merge-summary\">",
      summaryChip("Estoque", activeWarehouseCode()),
      summaryChip("Origem", transferRouteOriginLabel(first)),
      summaryChip("Destino", transferRouteDestinationLabel(first)),
      summaryChip("Transferencias", preview.transfers.length),
      summaryChip("SKUs", preview.items.length),
      summaryChip("SKUs repetidos", preview.repeatedCount, preview.repeatedCount ? "result-changed" : "result-ok"),
      summaryChip("Qtd prevista", formatQty(preview.totalQty)),
      summaryChip("Responsavel", responsible),
      "</div>",
      "<div class=\"inline-status warning\">Somente as transferências selecionadas serão unificadas. Transferências de outras VDs ou não selecionadas continuarão disponíveis.<br><strong>Selecionadas:</strong> " + escapeHtml(selectedCodes || "-") + "</div>",
      preview.errors.length ? "<div class=\"inline-status error\">" + escapeHtml(preview.errors.join(" ")) + "</div>" : "",
      "<div class=\"table-wrap\"><table><thead><tr><th>SKU</th><th>Produto</th><th>Quantidades originais</th><th>Qtd final</th><th>Unidade</th><th>Status</th><th>Tratamento</th></tr></thead><tbody>",
      preview.items.map(transferMergeItemRowHtml).join(""),
      "</tbody></table></div>"
    ].join("");
  }

  function transferMergeItemRowHtml(row) {
    var entries = row.entries.map(function (entry) {
      return "<span><strong>" + escapeHtml(transferDisplayName(entry.transfer)) + "</strong>: " + formatQty(entry.qty) + " " + escapeHtml(entry.unit || "UN") + "</span>";
    }).join("");
    var status = row.unitConflict ? "Unidades diferentes" : row.repeated ? "SKU repetido" : "OK";
    var options = ["<option value=\"SUM\"" + (row.resolutionType === "SUM" ? " selected" : "") + ">Somar quantidades</option>"].concat(row.entries.map(function (entry) {
      var value = "USE:" + (entry.transfer ? entry.transfer.id : "");
      return "<option value=\"" + value + "\"" + (row.resolutionType === value ? " selected" : "") + ">Usar " + escapeHtml(transferDisplayName(entry.transfer)) + "</option>";
    })).concat(["<option value=\"MANUAL\"" + (row.resolutionType === "MANUAL" ? " selected" : "") + ">Informar manual</option>"]).join("");
    return [
      "<tr class=\"" + (row.conflictType ? "merge-conflict-row" : "") + "\">",
      "<td>" + escapeHtml(row.sku) + "</td>",
      "<td>" + escapeHtml(row.description || "-") + "</td>",
      "<td><div class=\"merge-entry-list\">" + entries + "</div></td>",
      "<td><strong>" + formatQty(row.finalQty) + "</strong></td>",
      "<td>" + escapeHtml(row.unit || "UN") + "</td>",
      "<td><span class=\"status-badge " + (row.conflictType ? "pending" : "active") + "\">" + escapeHtml(status) + "</span></td>",
      "<td><select data-merge-resolution=\"" + escapeHtml(row.key) + "\">" + options + "</select><input data-merge-manual=\"" + escapeHtml(row.key) + "\" type=\"number\" min=\"0\" step=\"0.01\" placeholder=\"Qtd manual\" value=\"" + escapeHtml(row.manualQty || "") + "\"" + (row.resolutionType === "MANUAL" ? "" : " hidden") + "></td>",
      "</tr>"
    ].join("");
  }

  function handleTransferMergeResolutionChange(event) {
    var select = event.target.closest("[data-merge-resolution]");
    var input = event.target.closest("[data-merge-manual]");
    if (!select && !input) return;
    var key = select ? select.dataset.mergeResolution : input.dataset.mergeManual;
    var current = transferState.mergeResolutions[key] || {};
    if (select) current.type = select.value;
    if (input) current.manualQty = input.value;
    transferState.mergeResolutions[key] = current;
    renderTransferMergePreview(true);
  }

  async function confirmTransferMerge() {
    if (!isAdminOrSupervisor()) return;
    if (!ensureActiveWarehouse()) return;
    if (!isSupabaseReady()) {
      setStatus("transferMergeStatus", "Supabase nao conectado.", "error");
      return;
    }
    await ensureSelectedMergeItemsLoaded();
    var preview = buildTransferMergePreview();
    transferState.mergePreview = preview;
    if (preview.errors.length) {
      renderTransferMergePreview(true);
      setStatus("transferMergeStatus", preview.errors[0], "error");
      return;
    }
    if (!window.confirm(transferMergeConfirmationMessage(preview))) return;
    var actionButton = $("confirmTransferMergeButton");
    if (!beginTransferAction("merge-transfer", actionButton, "Unificando...")) return;
    try {
      var created = await createMergedTransfer(preview);
      await loadTransferData();
      transferState.mergeSelection = {};
      transferState.mergePreview = null;
      transferState.mergeResolutions = {};
      renderTransfers();
      setStatus("transferMergeStatus", "Transferencia unificada criada: " + created.name, "success");
      showToast("Transferencias unificadas.", "success");
    } catch (error) {
      console.error("Erro ao unificar transferencias:", error);
      setStatus("transferMergeStatus", "Erro ao unificar transferencias: " + formatSupabaseError(error), "error");
    } finally {
      endTransferAction(actionButton);
    }
  }

  function transferMergeConfirmationMessage(preview) {
    var first = preview.transfers[0] || {};
    var totalSkus = preview.items.length;
    var totalItems = preview.items.reduce(function (sum, item) { return sum + Number(item.finalQty || 0); }, 0);
    var selected = preview.transfers.map(function (transfer) {
      return "- " + (transfer.code || transfer.name || transfer.id) + " [" + transfer.id + "]";
    }).join("\n");
    return [
      "Confirmar unificacao de transferencias?",
      "",
      "Somente as transferências selecionadas serão unificadas. Transferências de outras VDs ou não selecionadas continuarão disponíveis.",
      "",
      "Transferencias selecionadas: " + preview.transfers.length,
      "Origem: " + transferRouteOriginLabel(first),
      "Destino/VD: " + transferRouteDestinationLabel(first),
      "Estoque: " + activeWarehouseCode(),
      "SKUs: " + totalSkus,
      "Quantidade total: " + formatQty(totalItems),
      "",
      "IDs/codigos selecionados:",
      selected || "-"
    ].join("\n");
  }

  function assertTransferMergePreviewSafe(preview) {
    if (!preview || !Array.isArray(preview.selectedTransferIds) || !preview.selectedTransferIds.length) {
      throw new Error("Unificacao bloqueada: selected_transfer_ids vazio ou invalido.");
    }
    var selectedIds = unique(preview.selectedTransferIds.filter(Boolean));
    if (selectedIds.length !== preview.selectedTransferIds.length) {
      throw new Error("Unificacao bloqueada: existem IDs duplicados na selecao.");
    }
    if (!Array.isArray(preview.transfers) || preview.transfers.length !== selectedIds.length) {
      throw new Error("Unificacao bloqueada: quantidade de transferencias carregadas diferente da selecao.");
    }
    var selectedSet = {};
    selectedIds.forEach(function (id) { selectedSet[id] = true; });
    preview.transfers.forEach(function (transfer) {
      if (!transfer || !selectedSet[transfer.id]) throw new Error("Unificacao bloqueada: transferencia fora de selected_transfer_ids.");
      if (normalizeWarehouseCode(transfer.warehouseCode || activeWarehouseCode()) !== activeWarehouseCode()) throw new Error("Unificacao bloqueada: transferencia de outro estoque.");
      if (!canSelectTransferForMerge(transfer)) throw new Error("Unificacao bloqueada: transferencia nao permitida para unificacao.");
    });
    var firstKey = preview.transfers[0] ? transferMergeRouteKey(preview.transfers[0]) : "";
    if (preview.transfers.some(function (transfer) { return transferMergeRouteKey(transfer) !== firstKey; })) {
      throw new Error("As transferências selecionadas pertencem a destinos diferentes. Selecione apenas transferências da mesma VD para unificar.");
    }
    return selectedIds;
  }

  async function createMergedTransfer(preview) {
    var selectedIds = assertTransferMergePreviewSafe(preview);
    var now = new Date().toISOString();
    var first = preview.transfers[0];
    var responsibleId = first.responsibleId || "";
    var responsibleName = first.responsibleName || "";
    var transferId = randomId("trf-unif");
    var code = "TRF-UNIF-" + compactDateTimeForCode(new Date()) + "-" + sanitizeCodePart(first.originStoreCode || first.originName) + "-" + sanitizeCodePart(first.destinationStoreCode || first.destinationName || first.establishmentCode);
    var transfer = Object.assign({}, first, {
      id: transferId,
      code: code,
      name: "UNIFICADA - " + transferRouteLabel(first) + " - " + new Date().toLocaleDateString("pt-BR"),
      status: responsibleId ? "ATRIBUIDA" : "PENDENTE",
      responsibleId: responsibleId,
      responsibleName: responsibleName,
      importSource: "UNIFICADA",
      rawSourceText: preview.transfers.map(function (item) { return item.code || item.id; }).join("; "),
      observation: "Transferencia unificada de: " + preview.transfers.map(function (item) { return item.code || item.name || item.id; }).join(", "),
      createdById: authState.currentUser.id,
      createdByName: authState.currentUser.name,
      startedAt: "",
      finishedAt: "",
      durationSeconds: 0,
      separationStartedAt: "",
      separationFinishedAt: "",
      separationDurationSeconds: 0,
      packingStartedAt: "",
      packingFinishedAt: "",
      packingDurationSeconds: 0,
      isMerged: true,
      mergedFromIds: selectedIds,
      mergedIntoId: "",
      mergeStatus: "TRANSFERENCIA_UNIFICADA",
      mergedById: authState.currentUser.id,
      mergedByName: authState.currentUser.name,
      mergedAt: now,
      createdAt: now,
      updatedAt: now
    });
    var items = preview.items.map(function (row) {
      var base = row.entries[0].item;
      var finalQty = Number(row.finalQty || 0);
      var unit = row.unit || base.unit || "UN";
      var isBox = isBoxUnit(unit) || isBoxQuantityItem(base);
      var unitsPerBox = Number(base.unitsPerBox || 0);
      var item = Object.assign({}, base, {
        id: randomId("trfi-merge"),
        transferId: transferId,
        sku: row.sku,
        description: row.description,
        requestedQty: finalQty,
        unit: isBox ? "CX" : unit,
        quantityType: isBox ? "CAIXA" : "UNIDADE",
        boxQty: isBox ? finalQty : 0,
        unitsPerBox: unitsPerBox,
        totalUnits: isBox ? (unitsPerBox > 0 ? finalQty * unitsPerBox : finalQty) : finalQty,
        separatedQty: 0,
        packedQty: 0,
        packedUnits: 0,
        extraQty: 0,
        missingQty: 0,
        excessQty: 0,
        isExtra: false,
        divergenceType: "",
        observation: row.conflictType ? "Unificado com tratamento: " + row.resolutionType : "",
        status: "PENDENTE",
        createdAt: now,
        updatedAt: now,
        warehouseId: activeWarehouseId(),
        warehouseCode: activeWarehouseCode()
      });
      return applyTransferItemLocation(item);
    });
    await enrichTransferItemsWithStock(items, transfer.warehouseCode || activeWarehouseCode());
    await insertTransferRows([toDbTransfer(transfer)]);
    await upsertTransferItemRows(items.map(function (item) {
      return Object.assign(toDbTransferItem(item), transferItemAuditDbFields(item));
    }));
    await insertTransferMergeItemRows(preview, transferId);
    try {
      await archiveMergedSourceTransfers(preview.transfers, selectedIds, transferId, now);
    } catch (archiveError) {
      await rollbackMergedTransferCreation(transferId);
      throw archiveError;
    }
    await recordTransferEvent(transferId, "", "TRANSFER_MERGED", "", preview.items.length, "Transferencias unificadas.", {
      sourceTransferIds: transfer.mergedFromIds,
      repeatedSkus: preview.repeatedCount,
      totalQuantity: preview.totalQty
    });
    if (responsibleId) {
      await recordTransferEvent(transferId, "", "TRANSFER_ASSIGNED", "", 0, "Voce recebeu uma transferencia unificada para separar.", {
        responsibleId: responsibleId,
        merged: true
      });
    }
    return transfer;
  }

  async function rollbackMergedTransferCreation(transferId) {
    if (!transferId || !isSupabaseReady()) return;
    await rollbackSupabaseDelete("wms_transfer_items", "transfer_id", transferId);
    await rollbackSupabaseDelete("wms_transfer_merge_items", "merged_transfer_id", transferId);
    await rollbackSupabaseDelete("wms_transfers", "id", transferId);
  }

  async function rollbackSupabaseDelete(tableName, columnName, value) {
    try {
      var response = await supabaseDb.from(tableName).delete().eq(columnName, value);
      if (response.error && !isMissingTransferTableError(response.error) && !isMissingColumnError(response.error)) throw response.error;
    } catch (rollbackError) {
      console.warn("Nao foi possivel limpar " + tableName + " durante reversao da unificacao:", rollbackError);
      recordPerformanceError("rollback-unificacao-" + tableName, rollbackError);
    }
  }

  async function insertTransferMergeItemRows(preview, mergedTransferId) {
    var rows = [];
    preview.items.forEach(function (row) {
      row.entries.forEach(function (entry) {
        rows.push({
          id: randomId("trfmi"),
          created_at: new Date().toISOString(),
          merged_transfer_id: mergedTransferId,
          original_transfer_id: entry.transfer ? entry.transfer.id : "",
          sku: row.sku,
          descricao: row.description || "",
          original_quantity: Number(entry.qty || 0),
          final_quantity: Number(row.finalQty || 0),
          unidade_medida: row.unit || entry.unit || "UN",
          conflict_type: row.conflictType || "",
          resolution_type: row.resolutionType || "SUM",
          resolved_by_id: authState.currentUser.id,
          resolved_by_name: authState.currentUser.name
        });
      });
    });
    if (!rows.length) return;
    var response = await supabaseDb.from("wms_transfer_merge_items").insert(rows);
    if (response.error && !isMissingTransferTableError(response.error) && !isMissingColumnError(response.error)) throw response.error;
  }

  async function archiveMergedSourceTransfers(transfers, selectedIds, mergedTransferId, now) {
    if (!Array.isArray(selectedIds) || !selectedIds.length) throw new Error("Unificacao bloqueada: selected_transfer_ids vazio.");
    selectedIds = unique(selectedIds.filter(Boolean));
    var selectedSet = {};
    selectedIds.forEach(function (id) { selectedSet[id] = true; });
    if (!Array.isArray(transfers) || transfers.length !== selectedIds.length) throw new Error("Unificacao bloqueada: selecao inconsistente ao arquivar origens.");
    transfers.forEach(function (transfer) {
      if (!transfer || !selectedSet[transfer.id]) throw new Error("Unificacao bloqueada: tentativa de arquivar transferencia nao selecionada.");
    });

    var payload = {
      status: "UNIFICADA",
      merged_into_id: mergedTransferId,
      unified_into_transfer_id: mergedTransferId,
      archived_by_unification: true,
      merge_status: "UNIFICADA",
      merged_by_id: authState.currentUser.id,
      merged_by_name: authState.currentUser.name,
      merged_at: now,
      updated_at: now
    };
    var attemptedMissingColumns = {};
    var response;
    while (true) {
      response = await supabaseDb
        .from("wms_transfers")
        .update(payload)
        .in("id", selectedIds)
        .eq("warehouse_code", activeWarehouseCode())
        .select("id");
      if (!response.error || !isMissingColumnError(response.error)) break;
      if (isMissingWarehouseColumnError(response.error)) assertWarehouseFallbackAllowed("wms_transfers", response.error);
      var missingColumn = getMissingColumnName(response.error);
      if (!missingColumn || attemptedMissingColumns[missingColumn]) break;
      attemptedMissingColumns[missingColumn] = true;
      delete payload[missingColumn];
    }
    if (response.error) throw response.error;
    var updatedIds = (response.data || []).map(function (rowData) { return rowData.id; }).filter(Boolean);
    if (updatedIds.length > selectedIds.length) throw new Error("Unificacao bloqueada: Supabase alterou mais registros que selected_transfer_ids.");
    if (updatedIds.length !== selectedIds.length) throw new Error("Unificacao incompleta: Supabase alterou " + updatedIds.length + " de " + selectedIds.length + " transferencias selecionadas.");
    updatedIds.forEach(function (id) {
      if (!selectedSet[id]) throw new Error("Unificacao bloqueada: Supabase retornou transferencia fora de selected_transfer_ids.");
    });

    for (var i = 0; i < transfers.length; i += 1) {
      await recordTransferEvent(transfers[i].id, "", "TRANSFER_ARCHIVED_BY_MERGE", "", 0, "Transferencia arquivada por unificacao.", {
        mergedIntoId: mergedTransferId
      });
    }
  }

  function transferConferenceOptionsHtml(selectedUserId) {
    var users = getTaskAssignableUsers();
    return "<option value=\"\">Selecionar conferente</option>" + users.map(function (user) {
      return "<option value=\"" + user.id + "\"" + (user.id === selectedUserId ? " selected" : "") + ">" + escapeHtml(user.name + " (" + user.username + ")") + "</option>";
    }).join("");
  }

  function renderTransferConferenceAdminPanel() {
    if (!$("conferenceAdminSummary")) return;
    if (!isAdminOrSupervisor()) {
      $("conferenceAdminSummary").innerHTML = "";
      return;
    }
    var selectedUser = authState.users.find(function (user) { return user.id === $("conferenceUserSelect").value; });
    var file = ($("conferenceXmlCreateInput").files || [])[0];
    var transfer = getTransferById($("conferenceTransferSelect").value);
    if (!transfer) {
      $("conferenceAdminSummary").innerHTML = "";
      if (file && selectedUser) {
        setStatus("conferenceAdminStatus", "XML selecionado. Clique em Criar conferência pelo XML para gerar a tarefa para " + selectedUser.name + ".", "success");
      } else if (file) {
        setStatus("conferenceAdminStatus", "XML selecionado. Escolha a pessoa que vai conferir.", "warning");
      } else {
        setStatus("conferenceAdminStatus", "Nenhuma transferência disponível. Você pode selecionar um XML para criar uma nova conferência.", "warning");
      }
      return;
    }
    var stats = getTransferStats(transfer.id);
    var assignment = getLatestTransferConferenceAssignment(transfer.id);
    $("conferenceAdminSummary").innerHTML = [
      summaryChip("Transferência", transferDisplayName(transfer)),
      summaryChip("Destino", transferRouteDestinationLabel(transfer)),
      summaryChip("Status", transferStatusDisplayLabel(transfer.status)),
      summaryChip("Conferente", assignment && assignment.assignedUserName ? assignment.assignedUserName : "Não atribuído"),
      summaryChip("Itens", stats.totalItems),
      summaryChip("Solicitada", formatQty(stats.requested)),
      summaryChip("Separada", formatQty(stats.separated)),
      summaryChip("Lacrada", formatQty(stats.packed))
    ].join("");
    if (file && selectedUser) {
      setStatus("conferenceAdminStatus", "XML selecionado. Clique em Criar conferência pelo XML para gerar a tarefa para " + selectedUser.name + ".", "success");
      return;
    }
    setStatus("conferenceAdminStatus", selectedUser ? "Pronto para atribuir ou exportar o XML para " + selectedUser.name + "." : "Selecione a pessoa que vai conferir antes de atribuir.", selectedUser ? "success" : "warning");
  }

  async function createConferenceFromXmlFile() {
    if (!ensureActiveWarehouse()) return;
    if (!isAdminOrSupervisor()) return;
    if (!isSupabaseReady()) {
      setStatus("conferenceAdminStatus", "Supabase não conectado. Confira as variáveis antes de criar a conferência.", "error");
      return;
    }
    var file = ($("conferenceXmlCreateInput").files || [])[0];
    var responsible = authState.users.find(function (user) { return user.id === $("conferenceUserSelect").value; });
    if (!file) {
      setStatus("conferenceAdminStatus", "Selecione o arquivo XML da conferência.", "error");
      return;
    }
    if (!responsible) {
      setStatus("conferenceAdminStatus", "Selecione a pessoa que vai conferir.", "error");
      return;
    }
    try {
      setStatus("conferenceAdminStatus", "Lendo XML e criando conferência...", "warning");
      var parsed = parseNfeXml(await file.text());
      if (!parsed.items.length) {
        setStatus("conferenceAdminStatus", "O XML não possui produtos para conferir.", "error");
        return;
      }
      var created = await createTransferFromParsedXml(parsed, responsible, file.name);
      await loadTransferData();
      $("conferenceTransferSelect").value = created.transferId;
      $("conferenceXmlCreateInput").value = "";
      renderTransfers();
      activateTransferTab("transferConferenceSection");
      $("conferenceTransferSelect").value = created.transferId;
      renderTransferConferenceAdminPanel();
      setStatus("conferenceAdminStatus", "Conferência criada e atribuída para " + responsible.name + " com " + created.itemCount + " item(ns).", "success");
    } catch (error) {
      console.error("Erro ao criar conferencia pelo XML:", error);
      setStatus("conferenceAdminStatus", "Não foi possível criar a conferência pelo XML: " + formatSupabaseError(error), "error");
    }
  }

  async function createTransferFromParsedXml(parsed, responsible, fileName) {
    var note = parsed.note || {};
    var now = new Date().toISOString();
    var suffix = note.number || (note.key ? note.key.slice(-8) : dateForFileName(new Date()));
    var transferId = randomId("trf-xml");
    var establishment = findXmlDestinationEstablishment(note);
    var transferName = "XML " + suffix;
    var transfer = {
      id: transferId,
      code: transferName,
      name: transferName,
      establishmentId: establishment.id,
      establishmentCode: establishment.code,
      establishmentName: establishment.name,
      establishmentCnpj: establishment.cnpj,
      responsibleId: responsible.id,
      responsibleName: responsible.name,
      status: "ATRIBUIDA",
      flowType: "CONFERENCIA_XML",
      observation: "Conferência criada pelo XML " + (fileName || "") + ". Origem: " + (note.emitterName || "-") + ".",
      createdById: authState.currentUser.id,
      createdByName: authState.currentUser.name,
      startedAt: "",
      separationFinishedAt: "",
      packingFinishedAt: "",
      warehouseId: activeWarehouseId(),
      warehouseCode: activeWarehouseCode(),
      createdAt: now,
      updatedAt: now
    };
    var items = parsed.items.map(function (item) {
      var transferItem = {
        id: randomId("trfi"),
        transferId: transferId,
        sku: item.sku,
        description: item.description,
        requestedQty: Number(item.quantity || 0),
        unit: item.unit || "UN",
        quantityType: "UNIDADE",
        boxQty: 0,
        unitsPerBox: 0,
        totalUnits: Number(item.quantity || 0),
        separatedQty: 0,
        packedQty: 0,
        status: "PENDENTE",
        createdAt: now,
        updatedAt: now
      };
      return applyTransferItemLocation(transferItem);
    });
    await insertTransferRows([toDbTransfer(transfer)]);
    await upsertTransferItemRows(items.map(toDbTransferItem));
    await recordTransferEvent(transferId, "", "TRANSFER_CREATED_FROM_XML", "", items.length, "Conferência criada a partir de XML.", { fileName: fileName || "", note: note, itemCount: items.length });
    await recordTransferEvent(transferId, "", "TRANSFER_ASSIGNED", "", 0, "Responsável atribuído.", { responsibleId: responsible.id });
    await recordTransferEvent(
      transferId,
      "",
      "XML_CONFERENCE_ASSIGNED",
      "",
      0,
      "Conferência XML atribuída para " + responsible.name + ".",
      {
        assignedAt: now,
        assignedUserId: responsible.id,
        assignedUserName: responsible.name,
        assignedUsername: responsible.username,
        transferId: transferId,
        transferCode: transfer.code,
        transferName: transfer.name,
        sourceFileName: fileName || ""
      }
    );
    return { transferId: transferId, itemCount: items.length };
  }

  function findXmlDestinationEstablishment(note) {
    var destinationCnpj = normalizeText(note.destinationCnpj || "");
    var destinationName = normalizeText(note.destinationName || "Destino do XML");
    var existing = transferState.establishments.find(function (item) {
      return (destinationCnpj && item.cnpj === destinationCnpj) || item.name.toLowerCase() === destinationName.toLowerCase();
    });
    if (existing) {
      return {
        id: existing.id,
        code: existing.code,
        name: existing.name,
        cnpj: existing.cnpj
      };
    }
    return {
      id: "",
      code: destinationCnpj || "XML",
      name: destinationName || "Destino do XML",
      cnpj: destinationCnpj
    };
  }

  async function assignSelectedTransferConference() {
    var transferId = $("conferenceTransferSelect").value;
    var userId = $("conferenceUserSelect").value;
    await assignTransferConference(transferId, userId);
    renderTransferConferenceAdminPanel();
  }

  async function exportSelectedTransferConferenceXml() {
    var transferId = $("conferenceTransferSelect").value;
    if (!transferId) {
      setStatus("conferenceAdminStatus", "Selecione uma transferência para exportar.", "error");
      return;
    }
    await exportTransferConferenceXml(transferId);
    setStatus("conferenceAdminStatus", "XML exportado. Entregue esse arquivo para a pessoa conferir na tela da transferência.", "success");
  }

  async function openSelectedTransferConference() {
    var transferId = $("conferenceTransferSelect").value;
    if (!transferId) {
      setStatus("conferenceAdminStatus", "Selecione uma transferência para abrir.", "error");
      return;
    }
    await openTransferWork(transferId);
  }

  async function deleteSelectedTransferConference() {
    var transferId = $("conferenceTransferSelect").value;
    if (!transferId) {
      setStatus("conferenceAdminStatus", "Selecione uma conferência para excluir.", "error");
      return;
    }
    var deleted = await deleteTransferPermanently(transferId);
    if (deleted) setStatus("conferenceAdminStatus", "Conferência excluída.", "success");
  }

  function renderMyTransfers() {
    if (!$("myTransfersList")) return;
    var visible = getVisibleTransfers().filter(function (transfer) {
      return transfer.status !== "CANCELADA";
    });
    var transfers = visible.filter(function (transfer) { return !isFinalTransferStatus(transfer.status); });
    var completed = visible.filter(function (transfer) { return isFinalTransferStatus(transfer.status); });
    var visibleTasks = transfers.slice(0, TRANSFER_TASK_RENDER_LIMIT);
    var visibleCompleted = completed.slice(0, TRANSFER_TASK_RENDER_LIMIT);
    $("myTransfersList").innerHTML = visibleTasks.length
      ? visibleTasks.map(myTransferCardHtml).join("") + renderListLimitNotice(transfers.length, visibleTasks.length, "tarefas")
      : "<div class=\"empty-state\">Nenhuma tarefa atribuida.</div>";
    if ($("completedTransfersList")) {
      $("completedTransfersList").innerHTML = visibleCompleted.length
        ? visibleCompleted.map(myTransferCardHtml).join("") + renderListLimitNotice(completed.length, visibleCompleted.length, "tarefas concluídas")
        : "<div class=\"empty-state\">Nenhuma tarefa concluida.</div>";
    }
  }

  function myTransferCardHtml(transfer) {
    var stats = getTransferStats(transfer.id);
    var action = isFinalTransferStatus(transfer.status) ? "Ver resultado" : transfer.status === "CORRECAO_SOLICITADA" || transfer.status === "EM_CORRECAO" ? "Revalidar" : transfer.status === "SEPARACAO_CONCLUIDA" ? "Iniciar montagem" : transfer.status === "EM_LACRE" || transfer.status === "EM_MONTAGEM_CAIXA" || transfer.status === "EM_SEPARACAO" ? "Continuar" : "Iniciar";
    return [
      "<article class=\"transfer-card\">",
      "<span class=\"eyebrow\">Transferência</span>",
      "<h3>" + escapeHtml(transferDisplayName(transfer)) + "</h3>",
      "<span>Origem: " + escapeHtml(transferRouteOriginLabel(transfer)) + "</span>",
      "<span>Destino: " + escapeHtml(transferRouteDestinationLabel(transfer)) + "</span>",
      "<span>Status: " + escapeHtml(transferStatusDisplayLabel(transfer.status)) + "</span>",
      "<span>Itens: " + stats.totalItems + "</span>",
      "<div class=\"transfer-progress\"><div class=\"transfer-progress-bar\"><span style=\"width:" + stats.progress + "%\"></span></div><span>" + stats.progress + "%</span></div>",
      "<button class=\"primary-button\" data-transfer-open=\"" + transfer.id + "\" type=\"button\">" + action + "</button>",
      "</article>"
    ].join("");
  }

  function renderFinalizedTransfers() {
    if (!$("finalizedTransferRows")) return;
    if (!isAdminOrSupervisor()) {
      $("finalizedTransferRows").innerHTML = "";
      return;
    }
    var transfers = getVisibleTransfers().filter(function (transfer) { return isFinalTransferStatus(transfer.status); });
    var visibleTransfers = transfers.slice(0, TRANSFER_FINALIZED_RENDER_LIMIT);
    $("finalizedTransferRows").innerHTML = visibleTransfers.length
      ? visibleTransfers.map(finalizedTransferRowHtml).join("") + renderTableLimitNotice(transfers.length, visibleTransfers.length, 9, "transferências finalizadas")
      : "<tr><td colspan=\"9\">Nenhuma transferência finalizada.</td></tr>";
  }

  function renderListLimitNotice(total, shown, label) {
    if (total <= shown) return "";
    return "<div class=\"empty-state compact\">Mostrando " + shown + " de " + total + " " + escapeHtml(label) + ". Use os filtros para refinar.</div>";
  }

  function renderTransferPanelLimitNotice(total, shown) {
    if (total <= shown) return "";
    return [
      "<div class=\"empty-state compact transfer-load-more-row\">",
      "<span>Mostrando " + shown + " de " + total + " transferências.</span>",
      "<button class=\"secondary-button\" data-transfer-load-more type=\"button\">Carregar mais</button>",
      "</div>"
    ].join("");
  }

  function renderTableLimitNotice(total, shown, colspan, label) {
    if (total <= shown) return "";
    return "<tr><td colspan=\"" + colspan + "\" class=\"muted\">Mostrando " + shown + " de " + total + " " + escapeHtml(label) + ". Use os filtros para refinar.</td></tr>";
  }

  function finalizedTransferRowHtml(transfer) {
    var report = getTransferFinalReport(transfer);
    return [
      "<tr>",
      "<td><strong>" + escapeHtml(transferDisplayName(transfer)) + "</strong><br><span class=\"muted\">" + escapeHtml(transfer.code || "-") + "</span></td>",
      "<td>" + escapeHtml(transferRouteDestinationLabel(transfer)) + "</td>",
      "<td>" + escapeHtml(transfer.responsibleName || "-") + "</td>",
      "<td><span class=\"status-badge " + (transfer.status === "CONCLUIDA_SEM_DIVERGENCIA" ? "active" : "pending") + "\">" + escapeHtml(transferStatusDisplayLabel(transfer.status)) + "</span></td>",
      "<td>" + formatDuration(report.totalDurationSeconds) + "</td>",
      "<td>" + report.stats.totalItems + "</td>",
      "<td>" + report.divergences.length + "</td>",
      "<td>" + formatDateTime(report.finishedAt) + "</td>",
      "<td><div class=\"row-actions transfer-action-stack\"><button class=\"edit-small\" data-transfer-open=\"" + transfer.id + "\" type=\"button\">Ver detalhes</button>" + (canRequestTransferRevalidation(transfer) ? "<button class=\"edit-small\" data-transfer-revalidate=\"" + transfer.id + "\" type=\"button\">Revalidar</button>" : "") + (isAdminOrSupervisor() ? "<button class=\"remove-small\" data-transfer-delete-permanent=\"" + transfer.id + "\" type=\"button\">Excluir</button>" : "") + "</div></td>",
      "</tr>"
    ].join("");
  }

  function renderAddressMaintenance(report) {
    if (!$("addressMaintenanceSummary") || !$("maintenanceAddressRows")) return;
    $("addressMaintenanceSummary").innerHTML = [
      summaryChip("Duplicidades exatas", report.locationDuplicates.length, report.locationDuplicates.length ? "result-missing" : "result-ok"),
      summaryChip("Conflitos de SKU", report.skuConflicts.length, report.skuConflicts.length ? "result-changed" : "result-ok"),
      summaryChip("Registros invalidos", report.invalidRows.length, report.invalidRows.length ? "result-missing" : "result-ok"),
      summaryChip("Registros a corrigir", report.deleteIds.length, report.deleteIds.length ? "result-changed" : "result-ok")
    ].join("");
    var rows = [];
    report.locationDuplicates.forEach(function (entry) {
      rows.push(maintenanceAddressRowHtml("SKU duplicado na mesma BP", entry.label || entry.key, entry.items, "<button class=\"danger-button\" data-address-remove-duplicates=\"" + escapeHtml(entry.key) + "\" type=\"button\">Remover duplicadas</button>"));
    });
    report.skuConflicts.forEach(function (entry) {
      rows.push(maintenanceAddressRowHtml("SKU em mais de uma BP", entry.key, entry.items, "<button class=\"primary-button\" data-address-resolve-sku=\"" + escapeHtml(entry.key) + "\" type=\"button\">Resolver conflito</button><button class=\"secondary-button\" data-address-ignore-sku=\"" + escapeHtml(entry.key) + "\" type=\"button\">Manter temporariamente</button>"));
    });
    report.invalidRows.forEach(function (entry) {
      rows.push(maintenanceAddressRowHtml("Registro invalido", entry.key, entry.items, "Corrigir cadastro ou remover manualmente."));
    });
    $("maintenanceAddressRows").innerHTML = rows.length ? rows.join("") : "<tr><td colspan=\"4\">Nenhuma duplicidade encontrada no enderecamento.</td></tr>";
  }

  function maintenanceAddressRowHtml(type, key, items, action) {
    var records = items.map(function (binding) {
      return escapeHtml(binding.sku || "-") + " em " + escapeHtml(binding.locationCode || "-");
    }).join("<br>");
    return [
      "<tr>",
      "<td>" + escapeHtml(type) + "</td>",
      "<td><strong>" + escapeHtml(key || "-") + "</strong></td>",
      "<td>" + records + "</td>",
      "<td><div class=\"row-actions\">" + action + "</div></td>",
      "</tr>"
    ].join("");
  }

  function buildAddressMaintenanceReport() {
    var byExactPair = {};
    var bySku = {};
    var invalidRows = [];
    state.bindings.forEach(function (binding) {
      var parsed = normalizeLocation(binding.locationCode);
      if (!binding.id || !binding.sku || !parsed.valid) {
        invalidRows.push({ key: binding.locationCode || binding.id || "-", items: [binding] });
        return;
      }
      var locationKey = locationKeyFromBinding(binding);
      var skuKey = normalizeSkuKey(binding.sku);
      var exactKey = skuKey + "|" + locationKey;
      if (!byExactPair[exactKey]) byExactPair[exactKey] = [];
      byExactPair[exactKey].push(binding);
      if (!bySku[skuKey]) bySku[skuKey] = [];
      bySku[skuKey].push(binding);
    });
    var deleteIds = {};
    var locationDuplicates = Object.keys(byExactPair).filter(function (key) { return byExactPair[key].length > 1; }).map(function (key) {
      var items = byExactPair[key].slice().sort(sortByDateDesc);
      items.slice(1).forEach(function (binding) { if (binding.id) deleteIds[binding.id] = true; });
      return { key: key, label: items[0].sku + " em " + items[0].locationCode, items: items };
    });
    var skuConflicts = Object.keys(bySku).filter(function (key) {
      if (!key) return false;
      var locations = unique(bySku[key].map(locationKeyFromBinding));
      return locations.length > 1;
    }).map(function (key) {
      var items = bySku[key].slice().sort(sortByDateDesc);
      return { key: key, items: items };
    });
    return {
      locationDuplicates: locationDuplicates,
      skuConflicts: skuConflicts,
      skuDuplicates: skuConflicts,
      invalidRows: invalidRows,
      deleteIds: Object.keys(deleteIds)
    };
  }

  function verifyAddressMaintenance() {
    if (!isAdminOrSupervisor()) return;
    var report = buildAddressMaintenanceReport();
    renderAddressMaintenance(report);
    var total = report.locationDuplicates.length + report.skuConflicts.length + report.invalidRows.length;
    setStatus("maintenanceStatus", total ? "Relatorio de enderecamento pronto. Nada foi apagado." : "Enderecamento sem pendencias.", total ? "warning" : "success");
  }

  async function cleanAddressDuplicates() {
    if (!isAdminOrSupervisor()) return;
    var report = buildAddressMaintenanceReport();
    if (!report.deleteIds.length) {
      setStatus("maintenanceStatus", "Nenhuma duplicidade de enderecamento para corrigir.", "success");
      renderAddressMaintenance(report);
      return;
    }
    if (!window.confirm("Esta acao remove apenas duplicidades exatas do mesmo SKU na mesma BP, mantendo o registro mais recente. Conflitos de SKU em localizacoes diferentes continuam para decisao do lider. Deseja continuar?")) return;
    if (isSupabaseReady()) {
      try {
        var response = await supabaseDb.from("wms_bindings").delete().in("id", report.deleteIds);
        if (response.error) throw response.error;
      } catch (error) {
        setStatus("maintenanceStatus", "Erro ao corrigir duplicidades: " + formatSupabaseError(error), "error");
        return;
      }
    }
    var removeSet = {};
    report.deleteIds.forEach(function (id) { removeSet[id] = true; });
    state.bindings = state.bindings.filter(function (binding) { return !removeSet[binding.id]; });
    addHistory("Duplicidades corrigidas", "", "", report.deleteIds.length + " registro(s) duplicado(s) removido(s) do enderecamento.");
    await saveData();
    await loadData();
    renderAll();
    setStatus("maintenanceStatus", report.deleteIds.length + " duplicidade(s) corrigida(s).", "success");
  }

  async function handleAddressMaintenanceAction(event) {
    var button = event.target.closest("button");
    if (!button || !isAdminOrSupervisor()) return;
    if (button.dataset.addressResolveSku) {
      await resolveSkuLocationConflict(button.dataset.addressResolveSku);
      return;
    }
    if (button.dataset.addressIgnoreSku) {
      addHistory("Conflito mantido temporariamente", button.dataset.addressIgnoreSku, "", "Lider optou por manter SKU em multiplas localizacoes temporariamente.");
      await saveData();
      renderMaintenance();
      setStatus("maintenanceStatus", "Conflito mantido temporariamente. A exportacao continuara alertando.", "warning");
      return;
    }
    if (button.dataset.addressRemoveDuplicates) {
      await removeExactDuplicateRows(button.dataset.addressRemoveDuplicates);
    }
  }

  async function resolveSkuLocationConflict(skuKey) {
    var items = activeWarehouseBindings().filter(function (binding) { return normalizeSkuKey(binding.sku) === skuKey; }).sort(sortByDateDesc);
    if (items.length < 2) {
      setStatus("maintenanceStatus", "Conflito nao encontrado.", "warning");
      renderMaintenance();
      return;
    }
    var options = items.map(function (binding, index) {
      return (index + 1) + " - " + binding.locationCode + " (" + binding.sku + ")";
    }).join("\n");
    var choice = window.prompt("Escolha a localizacao oficial para o SKU " + skuKey + ":\n\n" + options, "1");
    var index = Number(choice) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= items.length) {
      setStatus("maintenanceStatus", "Resolucao cancelada.", "warning");
      return;
    }
    var official = items[index];
    var removeIds = items.filter(function (binding) { return binding.id !== official.id; }).map(function (binding) { return binding.id; });
    if (!window.confirm("Manter " + official.locationCode + " como oficial e remover " + removeIds.length + " outra(s) localizacao(oes)?")) return;
    await removeBindingIds(removeIds);
    addHistory("Conflito resolvido", official.sku, official.locationCode, "Localizacao oficial definida pelo lider.");
    await saveData();
    await loadData();
    renderAll();
    setStatus("maintenanceStatus", "Conflito resolvido para SKU " + skuKey + ".", "success");
  }

  async function removeExactDuplicateRows(exactKey) {
    var items = activeWarehouseBindings().filter(function (binding) {
      return normalizeSkuKey(binding.sku) + "|" + locationKeyFromBinding(binding) === exactKey;
    }).sort(sortByDateDesc);
    if (items.length < 2) {
      setStatus("maintenanceStatus", "Duplicidade exata nao encontrada.", "warning");
      renderMaintenance();
      return;
    }
    var keep = items[0];
    var removeIds = items.slice(1).map(function (binding) { return binding.id; });
    if (!window.confirm("Manter o registro mais recente de " + keep.sku + " em " + keep.locationCode + " e remover " + removeIds.length + " duplicado(s)?")) return;
    await removeBindingIds(removeIds);
    addHistory("Duplicidade exata corrigida", keep.sku, keep.locationCode, removeIds.length + " registro(s) duplicado(s) removido(s).");
    await saveData();
    await loadData();
    renderAll();
    setStatus("maintenanceStatus", "Duplicidade corrigida para " + keep.sku + " em " + keep.locationCode + ".", "success");
  }

  async function removeBindingIds(ids) {
    ids = (ids || []).filter(Boolean);
    if (!ids.length) return;
    if (isSupabaseReady()) {
      var response = await supabaseDb.from("wms_bindings").delete().in("id", ids);
      if (response.error) throw response.error;
    }
    var removeSet = {};
    ids.forEach(function (id) { removeSet[id] = true; });
    state.bindings = state.bindings.filter(function (binding) { return !removeSet[binding.id]; });
  }

  async function renderSystemDiagnostics() {
    if (!$("systemDiagnosticsSummary") || !$("systemDiagnosticsDetails")) return;
    var cacheBytes = await estimateLocalCacheBytes();
    var warehouse = activeWarehouseCode();
    var serviceWorkerStatus = "Indisponivel";
    if ("serviceWorker" in navigator) serviceWorkerStatus = navigator.serviceWorker.controller ? "Ativo" : "Registrado/pendente";
    var syncKeys = ["coreData", "transferData", "stockData", "replenishmentData"].map(function (moduleName) {
      var key = LOCAL_SYNC_PREFIX + moduleName + ":" + warehouse;
      return { moduleName: moduleName, value: localStorage.getItem(key) || "" };
    });
    var disabledRealtimeTables = Object.keys(realtimeState.disabledOptionalTables || {}).map(function (tableName) {
      var entry = realtimeState.disabledOptionalTables[tableName] || {};
      return tableName + ": " + (entry.reason || "desativada");
    });
    var replenishmentSchema = await getReplenishmentSchemaDiagnostics();
    var schemaVersion = await getSchemaVersionDiagnostics();
    $("systemDiagnosticsSummary").innerHTML = [
      summaryChip("Estoque ativo", warehouse),
      summaryChip("Supabase", isSupabaseReady() ? "Conectado" : "Nao configurado", isSupabaseReady() ? "result-ok" : "result-missing"),
      summaryChip("Reposicao schema", replenishmentSchema.ready ? "OK" : "Pendente", replenishmentSchema.ready ? "result-ok" : "result-missing"),
      summaryChip("Cache local", localCacheState.available ? "IndexedDB OK" : "Indisponivel", localCacheState.available ? "result-ok" : "result-missing"),
      summaryChip("Fila cache", localCacheState.writesPending + " pendente(s)", localCacheState.writesPending ? "result-missing" : "result-ok"),
      summaryChip("PWA", serviceWorkerStatus, serviceWorkerStatus === "Ativo" ? "result-ok" : ""),
      summaryChip("Tamanho cache", formatBytes(cacheBytes)),
      summaryChip("Ultima sync", performanceState.lastSyncAt ? formatDateTime(performanceState.lastSyncAt) : "-"),
      summaryChip("Base CAPTACAO", performanceState.lastStockLoadMs + " ms"),
      summaryChip("Transferencias", performanceState.lastTransferLoadMs + " ms"),
      summaryChip("Consulta SKU", performanceState.lastSkuQueryMs + " ms"),
      summaryChip("Schema", schemaVersion.version || "Pendente", schemaVersion.current ? "result-ok" : "result-missing")
    ].join("");
    $("systemDiagnosticsDetails").innerHTML = [
      "<p><strong>Supabase URL em uso:</strong> " + escapeHtml(previewPublicValue(supabaseConfig.url) || "-") + ".</p>",
      "<p><strong>Versao do schema:</strong> codigo espera " + escapeHtml(EXPECTED_SCHEMA_VERSION) + " | banco atual " + escapeHtml(schemaVersion.version || "nao registrada") + " | status " + escapeHtml(schemaVersion.current ? "OK" : "Migration pendente") + (schemaVersion.appliedAt ? " | aplicada em " + escapeHtml(formatDateTime(schemaVersion.appliedAt)) : "") + ".</p>",
      "<p><strong>Tabela wms_replenishment_requests:</strong> idempotency_key existe: " + yesNoDiagnostic(replenishmentSchema.columns.idempotency_key) + " | warehouse_code existe: " + yesNoDiagnostic(replenishmentSchema.columns.warehouse_code) + " | client_action_id existe: " + yesNoDiagnostic(replenishmentSchema.columns.client_action_id) + " | created_by_id existe: " + yesNoDiagnostic(replenishmentSchema.columns.created_by_id) + " | updated_at existe: " + yesNoDiagnostic(replenishmentSchema.columns.updated_at) + ".</p>",
      "<p><strong>Indices de idempotencia da reposicao:</strong> idx_replenishment_requests_idempotency: " + yesNoDiagnostic(replenishmentSchema.indexes.idx_replenishment_requests_idempotency) + " | uq_replenishment_requests_idempotency: " + yesNoDiagnostic(replenishmentSchema.indexes.uq_replenishment_requests_idempotency) + ".</p>",
      "<p><strong>Ultimo erro de criacao de pedido:</strong> " + escapeHtml(performanceState.lastReplenishmentCreateError || "-") + (performanceState.lastReplenishmentCreateErrorAt ? " em " + escapeHtml(formatDateTime(performanceState.lastReplenishmentCreateErrorAt)) : "") + ".</p>",
      replenishmentSchema.error ? "<p><strong>Diagnostico reposicao:</strong> " + escapeHtml(replenishmentSchema.error) + "</p>" : "",
      "<p><strong>Registros carregados:</strong> " + stockState.summary.captacao + " registros CAPTACAO, " + transferState.transfers.length + " transferencias, " + transferState.items.length + " itens de transferencia, " + authState.users.length + " usuarios.</p>",
      "<p><strong>Tempo real das transferencias:</strong> " + escapeHtml(realtimeState.active ? "ativo" : "parado") + " | Canal: " + escapeHtml(realtimeState.warehouseCode ? "wms-live-" + realtimeState.warehouseCode : "-") + " | Status: " + escapeHtml(realtimeState.subscriptionStatus || "-") + (realtimeState.lastLiveUpdateAt ? " | Ultima mensagem: " + escapeHtml(formatDateTime(realtimeState.lastLiveUpdateAt)) : "") + ".</p>",
      "<p><strong>Cache IndexedDB:</strong> " + escapeHtml(localCacheState.available ? "ativo" : "inativo") + " | escritas pendentes: " + escapeHtml(String(localCacheState.writesPending || 0)) + " | ultimo erro: " + escapeHtml(localCacheState.lastError || "-") + " | ultima limpeza: " + escapeHtml(localCacheState.lastCleanupAt ? formatDateTime(localCacheState.lastCleanupAt) : "-") + ".</p>",
      "<p><strong>Tabelas realtime opcionais desativadas:</strong> " + escapeHtml(disabledRealtimeTables.length ? disabledRealtimeTables.join(" | ") : "nenhuma") + ".</p>",
      "<p><strong>Sessao:</strong> usuario " + escapeHtml((authState.currentUser || {}).name || "-") + " | perfil " + escapeHtml((authState.currentUser || {}).role || "-") + " | id " + escapeHtml((authState.currentUser || {}).id || "-") + " | responsavel em tarefas: " + escapeHtml((authState.currentUser || {}).availableForTasks ? "sim" : "nao") + ".</p>",
      "<p><strong>Consulta transferencias:</strong> ultima " + performanceState.lastTransferQueryMs + " ms | carregamento " + performanceState.lastTransferLoadMs + " ms | pendente refresh: " + escapeHtml(realtimeState.refreshPending ? "sim" : "nao") + " | executando: " + escapeHtml(realtimeState.refreshRunning ? "sim" : "nao") + ".</p>",
      "<p><strong>Performance transferencias:</strong> lista " + performanceState.lastTransferListMs + " ms | detalhe " + performanceState.lastTransferDetailMs + " ms | itens " + performanceState.lastTransferItemsMs + " ms | saldo " + performanceState.lastTransferStockMs + " ms | consultas " + performanceState.lastTransferQueryCount + " | itens carregados no detalhe " + performanceState.lastTransferLoadedItems + " | wms_transfer_events " + escapeHtml(performanceState.transferEventsUsage || "removido") + ".</p>",
      "<p><strong>Ultimos eventos realtime:</strong></p>",
      realtimeState.recentEvents.length ? "<ul>" + realtimeState.recentEvents.map(function (entry) { return "<li>" + escapeHtml(formatDateTime(entry.at) + " - " + entry.table + " " + entry.event + " - " + (entry.transferId || entry.id || "-") + " - " + (entry.warehouseCode || "-")) + "</li>"; }).join("") + "</ul>" : "<p>Nenhum evento realtime recebido nesta sessao.</p>",
      "<p><strong>Sincronizacao por modulo:</strong></p>",
      "<ul>" + syncKeys.map(function (entry) { return "<li><code>" + escapeHtml(entry.moduleName) + "</code>: " + escapeHtml(entry.value ? formatDateTime(entry.value) : "sem registro") + "</li>"; }).join("") + "</ul>",
      "<p><strong>Erros recentes:</strong></p>",
      performanceState.recentErrors.length ? "<ul>" + performanceState.recentErrors.map(function (entry) { return "<li>" + escapeHtml(formatDateTime(entry.at) + " - " + entry.label + ": " + entry.message) + "</li>"; }).join("") + "</ul>" : "<p>Nenhum erro recente registrado nesta sessao.</p>"
    ].join("");
  }

  async function getSchemaVersionDiagnostics() {
    var result = { version: "", appliedAt: "", current: false, error: "" };
    if (!isSupabaseReady()) return result;
    try {
      var response = await supabaseDb.from("wms_schema_version").select("version,applied_at").eq("id", "current").limit(1);
      if (response.error) {
        if (!isMissingHealthTableError(response.error) && !isMissingColumnError(response.error)) result.error = formatSupabaseError(response.error);
        return result;
      }
      var row = (response.data || [])[0] || {};
      result.version = normalizeText(row.version);
      result.appliedAt = row.applied_at || "";
      result.current = result.version === EXPECTED_SCHEMA_VERSION;
      return result;
    } catch (error) {
      if (!isMissingHealthTableError(error) && !isMissingColumnError(error)) result.error = formatSupabaseError(error);
      return result;
    }
  }

  function healthRequiredColumns() {
    return {
      wms_replenishment_requests: ["id", "warehouse_code", "codigo_material", "quantidade_solicitada", "status", "created_at", "updated_at", "idempotency_key", "client_action_id", "created_by_id"],
      wms_transfers: ["id", "warehouse_code", "status", "created_at", "updated_at"],
      wms_transfer_items: ["id", "transfer_id", "warehouse_code", "codigo_material", "quantidade_solicitada", "nome_material_snapshot", "saldo_captacao_snapshot", "saldo_loja_snapshot", "quantidade_retirar_captacao", "quantidade_retirar_loja", "quantidade_faltante", "origem_sugerida", "localizacao_captacao_snapshot", "localizacao_wms_snapshot", "stock_snapshot_at", "status_operacional", "status_divergencia", "created_at", "updated_at"],
      wms_stock_positions: ["id", "warehouse_code", "source_type", "codigo_material", "total_disponivel", "active", "batch_id", "record_hash", "updated_at"],
      wms_stock_import_batches: ["id", "warehouse_code", "source_type", "status", "created_at", "updated_at", "finished_at", "error_message"],
      wms_users: ["id", "username", "role", "default_warehouse_code", "active", "archived"]
    };
  }

  async function renderSystemHealth(forceRefresh) {
    if (!$("healthSummary")) return;
    renderHealthWarehouseFilter();
    if (forceRefresh || !healthState.lastReport) {
      await refreshSystemHealth();
      return;
    }
    renderHealthReport(healthState.lastReport);
  }

  function renderHealthWarehouseFilter() {
    var select = $("healthWarehouseFilter");
    if (!select) return;
    var current = healthState.warehouseFilter || "ALL";
    var warehouses = (warehouseState.warehouses && warehouseState.warehouses.length ? warehouseState.warehouses : WAREHOUSE_SEED).filter(function (warehouse) {
      return warehouse.active !== false;
    });
    select.innerHTML = "<option value=\"ALL\">Todos os estoques</option>" + warehouses.map(function (warehouse) {
      var code = normalizeWarehouseCode(warehouse.code);
      return "<option value=\"" + escapeHtml(code) + "\">" + escapeHtml(code + " - " + (warehouse.name || "Estoque " + code)) + "</option>";
    }).join("");
    select.value = warehouses.some(function (warehouse) { return normalizeWarehouseCode(warehouse.code) === current; }) ? current : "ALL";
    healthState.warehouseFilter = select.value;
  }

  async function refreshSystemHealth() {
    if (healthState.loading) return;
    healthState.loading = true;
    setStatus("healthStatus", "Gerando diagnóstico técnico do WMS...", "warning");
    try {
      var report = await buildSystemHealthReport();
      healthState.lastReport = report;
      renderHealthReport(report);
      setStatus("healthStatus", report.summary.criticalIssues ? "Diagnóstico concluído com pontos críticos para revisar." : "Diagnóstico concluído. Nada foi alterado no banco.", report.summary.criticalIssues ? "warning" : "success");
    } catch (error) {
      recordPerformanceError("saude-sistema", error);
      setStatus("healthStatus", "Erro ao gerar diagnóstico: " + formatSupabaseError(error), "error");
    } finally {
      healthState.loading = false;
    }
  }

  async function buildSystemHealthReport() {
    var startedAt = performance.now();
    var selectedCodes = healthSelectedWarehouseCodes();
    var schema = await checkSystemHealthColumns();
    var stockRowsResult = await readHealthRows("wms_stock_positions", "id,warehouse_code,source_type,codigo_material,total_disponivel,estacao,rack,linha,coluna,codigo_endereco,active,batch_id,record_hash,created_at,updated_at", "updated_at", 1800);
    var batchesResult = await readHealthRows("wms_stock_import_batches", "*", "created_at", 240);
    var notificationRowsResult = await readHealthRows("wms_notifications", "id,warehouse_code,user_id,entity_id,event_type,transfer_id,read,seen,archived,created_at", "created_at", 1000);
    if (notificationRowsResult.error && isMissingColumnError(notificationRowsResult.error)) {
      notificationRowsResult = await readHealthRows("wms_notifications", "id,warehouse_code,user_id,transfer_id,created_at", "created_at", 1000);
    }
    var stockRows = (stockRowsResult.rows || []).filter(function (row) { return healthRowMatchesWarehouse(row, selectedCodes, true); });
    var batches = (batchesResult.rows || stockState.batches || []).filter(function (row) { return healthRowMatchesWarehouse(row, selectedCodes, true); });
    var notificationRows = (notificationRowsResult.rows || []).filter(function (row) { return healthRowMatchesWarehouse(row, selectedCodes, true); });
    var transfers = transferState.transfers.filter(function (transfer) { return healthRowMatchesWarehouse(transfer, selectedCodes, true); });
    var transferItems = transferState.items.filter(function (item) { return healthRowMatchesWarehouse(item, selectedCodes, true); });
    var requests = replenishmentState.requests.filter(function (request) { return healthRowMatchesWarehouse(request, selectedCodes, true); });
    var users = authState.users.filter(function (user) {
      if (healthState.warehouseFilter === "ALL") return true;
      return userBelongsToWarehouse(user, selectedCodes[0]);
    });
    var duplicates = buildHealthDuplicateReport(stockRows, transfers, transferItems, requests, notificationRows, users);
    var orphans = buildHealthOrphanReport(stockRows, batches, transfers, transferItems, requests, users);
    var stuckBatches = batches.filter(function (batch) {
      return normalizeText(batch.status).toUpperCase() === "PROCESSING" && healthDateOlderThanHours(batch.updated_at || batch.created_at, 2);
    });
    var imports = buildHealthImportReport(batches);
    var runtime = buildHealthRuntimeReport(startedAt);
    var openTransfers = transfers.filter(function (transfer) { return !transfer.isDeleted && !isFinalTransferStatus(transfer.status) && transfer.status !== "CANCELADA"; });
    var openRequests = requests.filter(function (request) {
      return !request.isDeleted && ["PENDENTE", "ATRIBUIDO", "EM_SEPARACAO", "ATENDIDO_PARCIAL"].indexOf(request.status) >= 0;
    });
    var inactiveUsers = users.filter(function (user) { return user.active === false || user.archived === true; });
    var noWarehouseRecords = orphans.items.filter(function (item) { return item.kind === "warehouse"; }).reduce(function (sum, item) { return sum + item.count; }, 0);
    return {
      generatedAt: nowIso(),
      warehouseLabel: healthState.warehouseFilter === "ALL" ? "Todos" : selectedCodes[0],
      schema: schema,
      duplicates: duplicates,
      orphans: orphans,
      imports: imports,
      stuckBatches: stuckBatches,
      runtime: runtime,
      openTransfers: openTransfers.length,
      openRequests: openRequests.length,
      inactiveUsers: inactiveUsers.length,
      noWarehouseRecords: noWarehouseRecords,
      summary: {
        missingColumns: schema.missing.length,
        duplicateGroups: duplicates.total,
        orphanGroups: orphans.total,
        recentErrors: performanceState.recentErrors.length,
        criticalIssues: schema.missing.length + duplicates.total + noWarehouseRecords + stuckBatches.length
      }
    };
  }

  async function checkSystemHealthColumns() {
    var required = healthRequiredColumns();
    var result = { checked: [], missing: [], errors: [] };
    var tables = Object.keys(required);
    for (var tableIndex = 0; tableIndex < tables.length; tableIndex += 1) {
      var table = tables[tableIndex];
      for (var columnIndex = 0; columnIndex < required[table].length; columnIndex += 1) {
        var column = required[table][columnIndex];
        var probe = await probeHealthColumn(table, column);
        var item = { table: table, column: column, ok: probe.ok, error: probe.error || "" };
        result.checked.push(item);
        if (probe.ok === false) result.missing.push(item);
        if (probe.ok === null && probe.error) result.errors.push(item);
      }
    }
    return result;
  }

  async function probeHealthColumn(tableName, columnName) {
    if (!isSupabaseReady()) return { ok: null, error: "Supabase não configurado." };
    try {
      var response = await supabaseDb.from(tableName).select(columnName).limit(1);
      if (response.error) {
        if (isMissingColumnError(response.error) || isMissingHealthTableError(response.error)) return { ok: false, error: formatSupabaseError(response.error) };
        return { ok: null, error: formatSupabaseError(response.error) };
      }
      return { ok: true };
    } catch (error) {
      if (isMissingColumnError(error) || isMissingHealthTableError(error)) return { ok: false, error: formatSupabaseError(error) };
      return { ok: null, error: formatSupabaseError(error) };
    }
  }

  function isMissingHealthTableError(error) {
    var message = formatSupabaseError(error).toLowerCase();
    return message.indexOf("could not find the table") >= 0 ||
      message.indexOf("does not exist") >= 0 && message.indexOf("relation") >= 0 ||
      message.indexOf("schema cache") >= 0 && message.indexOf("table") >= 0;
  }

  async function readHealthRows(tableName, selectColumns, orderColumn, limit) {
    if (!isSupabaseReady()) return { rows: [], error: null };
    try {
      var response = await selectRowsWithMissingColumnFallback(tableName, selectColumns || "*", function (query) {
        if (orderColumn) query = query.order(orderColumn, { ascending: false });
        if (limit) query = query.limit(limit);
        return query;
      });
      if (response.error) return { rows: [], error: response.error };
      return { rows: response.data || [], error: null };
    } catch (error) {
      return { rows: [], error: error };
    }
  }

  function healthSelectedWarehouseCodes() {
    if (healthState.warehouseFilter && healthState.warehouseFilter !== "ALL") return [normalizeWarehouseCode(healthState.warehouseFilter)];
    return activeWarehouseCodes();
  }

  function healthRowMatchesWarehouse(row, selectedCodes, includeBlankWhenAll) {
    var rawCode = rawWarehouseCodeValue(row);
    if (!rawCode) return healthState.warehouseFilter === "ALL" && includeBlankWhenAll;
    return selectedCodes.indexOf(normalizeWarehouseCode(rawCode)) >= 0;
  }

  function buildHealthDuplicateReport(stockRows, transfers, transferItems, requests, notifications, users) {
    var results = [];
    pushHealthDuplicateGroups(results, stockRows.filter(function (row) { return row.active === true; }), function (row) {
      return [rowWarehouseCode(row), row.source_type || "", normalizeSku(row.codigo_material), row.codigo_endereco || row.localizacao_wms || row.estacao || "", row.rack || "", row.linha || "", row.coluna || ""].join("|");
    }, "Base de Estoque", "Mesmo estoque, origem, SKU e localização ativos.");
    pushHealthDuplicateGroups(results, requests.filter(function (request) {
      return ["PENDENTE", "EM_SEPARACAO", "ATENDIDO_PARCIAL"].indexOf(request.status) >= 0;
    }), function (request) {
      return [request.warehouseCode || rowWarehouseCode(request), request.codigoMaterial].join("|");
    }, "Reposição", "Pedido aberto repetido para o mesmo SKU.");
    pushHealthDuplicateGroups(results, transferItems, function (item) {
      return [item.transferId, item.sku || item.codigo_material || ""].join("|");
    }, "Transferência", "Mesmo SKU duplicado dentro da mesma transferência.");
    pushHealthDuplicateGroups(results, notifications.filter(function (row) {
      return row.archived !== true && row.read !== true && row.seen !== true;
    }), function (row) {
      return [rowWarehouseCode(row), row.user_id || "", row.entity_id || row.transfer_id || "", row.event_type || ""].join("|");
    }, "Notificações", "Notificação não vista repetida para o mesmo evento.");
    pushHealthDuplicateGroups(results, users, function (user) {
      return normalizeText(user.username || user.matricula || "").toLowerCase();
    }, "Usuários", "Login ou matrícula repetidos.");
    return { total: results.reduce(function (sum, item) { return sum + item.count; }, 0), items: results };
  }

  function pushHealthDuplicateGroups(results, rows, keyBuilder, title, detail) {
    var map = {};
    (rows || []).forEach(function (row) {
      var key = keyBuilder(row);
      if (!key || key.replace(/\|/g, "") === "") return;
      if (!map[key]) map[key] = 0;
      map[key] += 1;
    });
    Object.keys(map).forEach(function (key) {
      if (map[key] > 1) results.push({ title: title, detail: detail + " Chave: " + key, count: map[key] });
    });
  }

  function buildHealthOrphanReport(stockRows, batches, transfers, transferItems, requests, users) {
    var results = [];
    var transferIds = {};
    transfers.forEach(function (transfer) { transferIds[transfer.id] = true; });
    pushHealthCount(results, "Itens de transferência sem pai", transferItems.filter(function (item) { return item.transferId && !transferIds[item.transferId]; }).length, "Transferência", "Itens apontam para transferência inexistente.");
    pushHealthCount(results, "Pedidos sem warehouse_code", requests.filter(function (request) { return !rawWarehouseCodeValue(request); }).length, "warehouse", "Reposição precisa pertencer a um estoque.");
    pushHealthCount(results, "Transferências sem warehouse_code", transfers.filter(function (transfer) { return !rawWarehouseCodeValue(transfer); }).length, "warehouse", "Transferência precisa pertencer a um estoque.");
    pushHealthCount(results, "Itens sem código material", transferItems.filter(function (item) { return !normalizeSku(item.sku || item.codigo_material || ""); }).length, "Transferência", "Itens precisam de SKU/código.");
    pushHealthCount(results, "Usuários sem estoque", users.filter(function (user) { return !normalizeWarehouseCodeOrBlank(user.defaultWarehouseCode) && !allowedWarehouseCodesForUser(user).length; }).length, "warehouse", "Usuário precisa de estoque padrão ou permitido.");
    pushHealthCount(results, "Base sem warehouse_code", stockRows.filter(function (row) { return !rawWarehouseCodeValue(row); }).length, "warehouse", "Registro de estoque precisa pertencer a um estoque.");
    pushHealthCount(results, "Base sem codigo_material", stockRows.filter(function (row) { return !normalizeSku(row.codigo_material || ""); }).length, "Base de Estoque", "Registro de estoque sem SKU.");
    pushHealthCount(results, "Importações travadas", (batches || []).filter(function (batch) {
      return normalizeText(batch.status).toUpperCase() === "PROCESSING" && healthDateOlderThanHours(batch.updated_at || batch.created_at, 2);
    }).length, "Importação", "Lote ficou PROCESSING por mais de 2 horas.");
    return { total: results.reduce(function (sum, item) { return sum + item.count; }, 0), items: results };
  }

  function pushHealthCount(results, title, count, kind, detail) {
    if (count > 0) results.push({ title: title, count: count, kind: kind || "", detail: detail || "" });
  }

  function buildHealthImportReport(batches) {
    var groups = {};
    (batches || []).forEach(function (batch) {
      var key = [rowWarehouseCode(batch), normalizeText(batch.source_type || "-").toUpperCase()].join("|");
      if (!groups[key] || new Date(batch.created_at || 0) > new Date(groups[key].created_at || 0)) groups[key] = batch;
    });
    return Object.keys(groups).sort().map(function (key) {
      var batch = groups[key];
      return {
        title: rowWarehouseCode(batch) + " - " + (batch.source_type || "-"),
        status: batch.status || "-",
        createdAt: batch.created_at || "",
        user: batch.imported_by_name || "-",
        detail: "Linhas: " + formatQty(batch.total_rows || 0) + " | importadas: " + formatQty(batch.imported_rows || 0) + " | ignoradas: " + formatQty(batch.ignored_rows || 0) + " | negativas: " + formatQty(batch.negative_rows || 0) + " | erros: " + formatQty(batch.error_rows || 0)
      };
    }).slice(0, 12);
  }

  function buildHealthRuntimeReport(startedAt) {
    var serviceWorkerStatus = "Indisponível";
    if ("serviceWorker" in navigator) serviceWorkerStatus = navigator.serviceWorker.controller ? "Ativo" : "Registrado/pendente";
    return {
      generatedMs: Math.round(performance.now() - startedAt),
      cacheBytes: 0,
      serviceWorkerStatus: serviceWorkerStatus,
      cacheKeys: ["coreData", "transferData", "stockData", "replenishmentData"].map(function (moduleName) {
        return { moduleName: moduleName, value: localStorage.getItem(LOCAL_SYNC_PREFIX + cacheKey(moduleName)) || "" };
      })
    };
  }

  function renderHealthReport(report) {
    if (!$("healthSummary")) return;
    $("healthSummary").innerHTML = [
      summaryChip("Supabase", isSupabaseReady() ? "Online" : "Não configurado", isSupabaseReady() ? "result-ok" : "result-missing"),
      summaryChip("Realtime", realtimeState.active ? "Conectado" : (realtimeState.subscriptionStatus || "Desconectado"), realtimeState.active ? "result-ok" : "result-missing"),
      summaryChip("Cache local", localCacheState.disabled ? "Desativado" : localCacheState.lastError ? "Erro" : localCacheState.available ? "OK" : "Indisponível", localCacheState.lastError ? "result-missing" : localCacheState.available ? "result-ok" : "result-changed"),
      summaryChip("Sincronização", localCacheState.writesPending ? localCacheState.writesPending + " pendência(s)" : performanceState.syncStatus || "OK", localCacheState.writesPending ? "result-changed" : performanceState.syncType === "error" ? "result-missing" : "result-ok"),
      summaryChip("Última importação Captação", healthLastImportLabel(report.imports, "CAPTACAO"), healthLastImportClass(report.imports, "CAPTACAO")),
      summaryChip("Pedidos abertos", report.openRequests, report.openRequests ? "result-changed" : "result-ok"),
      summaryChip("Transferências abertas", report.openTransfers, report.openTransfers ? "result-changed" : "result-ok"),
      summaryChip("Erros recentes", report.summary.recentErrors, report.summary.recentErrors ? "result-missing" : "result-ok"),
      summaryChip("Duplicidades", report.summary.duplicateGroups, report.summary.duplicateGroups ? "result-missing" : "result-ok"),
      summaryChip("Sem warehouse_code", report.noWarehouseRecords, report.noWarehouseRecords ? "result-missing" : "result-ok"),
      summaryChip("Usuários inativos/arquivados", report.inactiveUsers, report.inactiveUsers ? "result-changed" : "result-ok")
    ].join("");
    renderHealthRows("healthSchemaRows", report.schema.missing.length ? report.schema.missing.map(function (item) {
      return { title: "Coluna ausente: " + item.table + "." + item.column, detail: item.error || "Campo obrigatório não encontrado.", count: "Corrigir", level: "error" };
    }) : [{ title: "Estrutura obrigatória OK", detail: report.schema.checked.length + " coluna(s) verificadas.", count: "OK", level: "ok" }]);
    renderHealthRows("healthDuplicateRows", report.duplicates.items.length ? report.duplicates.items.map(function (item) {
      return { title: item.title, detail: item.detail, count: item.count, level: "warning" };
    }) : [{ title: "Nenhuma duplicidade crítica", detail: "Amostra operacional verificada para o estoque selecionado.", count: "OK", level: "ok" }]);
    renderHealthRows("healthOrphanRows", report.orphans.items.length ? report.orphans.items.map(function (item) {
      return { title: item.title, detail: item.detail, count: item.count, level: item.kind === "warehouse" ? "error" : "warning" };
    }) : [{ title: "Nenhum órfão crítico", detail: "Não foram encontrados registros soltos na amostra operacional.", count: "OK", level: "ok" }]);
    renderHealthRows("healthImportRows", report.imports.length ? report.imports.map(function (item) {
      return { title: item.title, detail: (item.createdAt ? formatDateTime(item.createdAt) + " | " : "") + item.detail + " | Usuário: " + item.user, count: item.status, level: item.status === "COMPLETED" ? "ok" : item.status === "FAILED" ? "error" : "warning" };
    }) : [{ title: "Sem importação recente", detail: "Nenhum lote de Base de Estoque encontrado para o filtro atual.", count: "-", level: "muted" }]);
    renderHealthRows("healthCacheDetails", [
      { title: "IndexedDB", detail: "Último erro: " + (localCacheState.lastError || "-"), count: localCacheState.available ? "OK" : "Indisponível", level: localCacheState.lastError ? "error" : localCacheState.available ? "ok" : "warning" },
      { title: "Escritas pendentes", detail: "Fila local do navegador.", count: localCacheState.writesPending || 0, level: localCacheState.writesPending ? "warning" : "ok" },
      { title: "Última limpeza", detail: localCacheState.lastCleanupAt ? formatDateTime(localCacheState.lastCleanupAt) : "-", count: "Info", level: "muted" }
    ]);
    renderHealthRows("healthRealtimeDetails", [
      { title: "Canal ativo", detail: realtimeState.warehouseCode ? "wms-live-" + realtimeState.warehouseCode : "-", count: realtimeState.active ? "Ativo" : "Parado", level: realtimeState.active ? "ok" : "warning" },
      { title: "Status assinatura", detail: realtimeState.subscriptionStatus || "-", count: realtimeState.refreshRunning ? "Atualizando" : "Estável", level: realtimeState.active ? "ok" : "warning" },
      { title: "Tabelas operacionais", detail: "wms_transfers, wms_transfer_items, wms_replenishment_requests, wms_stock_positions e wms_notifications quando usada.", count: "OK", level: "ok" }
    ]);
    renderHealthRows("healthPerformanceDetails", [
      { title: "Diagnóstico", detail: "Tempo para montar este relatório.", count: report.runtime.generatedMs + " ms", level: report.runtime.generatedMs > 2500 ? "warning" : "ok" },
      { title: "Login/carregamento inicial", detail: "O diagnóstico só carrega ao abrir esta tela.", count: "Sob demanda", level: "ok" },
      { title: "Módulos", detail: "Base CAPTACAO " + performanceState.lastStockLoadMs + " ms | Transferências " + performanceState.lastTransferLoadMs + " ms | Reposição " + performanceState.lastReplenishmentLoadMs + " ms", count: "Info", level: "muted" },
      { title: "Transferências - lista", detail: "Painel carrega resumo sem itens/eventos/base completa.", count: performanceState.lastTransferListMs + " ms", level: performanceState.lastTransferListMs > 1800 ? "warning" : "ok" },
      { title: "Transferências - detalhe", detail: "Itens carregados sob demanda por transfer_id + warehouse_code.", count: performanceState.lastTransferItemsMs + " ms", level: performanceState.lastTransferItemsMs > 1800 ? "warning" : "ok" },
      { title: "Transferências - estoque", detail: "Consulta apenas SKUs da transferência aberta.", count: performanceState.lastTransferStockMs + " ms", level: performanceState.lastTransferStockMs > 1800 ? "warning" : "ok" },
      { title: "Eventos antigos", detail: "wms_transfer_events removida do fluxo vivo.", count: performanceState.transferEventsUsage || "removido", level: "ok" }
    ]);
    renderHealthRows("healthProcessRows", buildHealthStuckProcessRows(report));
  }

  function renderHealthRows(targetId, rows) {
    var target = $(targetId);
    if (!target) return;
    target.innerHTML = rows.map(function (row) {
      return "<div class=\"health-row is-" + escapeHtml(row.level || "muted") + "\"><span><strong>" + escapeHtml(row.title) + "</strong><small>" + escapeHtml(row.detail || "") + "</small>" + (row.actionHtml || "") + "</span><em class=\"health-pill\">" + escapeHtml(String(row.count === undefined ? "-" : row.count)) + "</em></div>";
    }).join("");
  }

  function healthLastImportLabel(imports, sourceType) {
    var normalized = normalizeText(sourceType).toUpperCase();
    var item = (imports || []).find(function (entry) { return normalizeText(entry.title).toUpperCase().indexOf(normalized) >= 0; });
    return item && item.createdAt ? formatDateTime(item.createdAt) : "-";
  }

  function healthLastImportClass(imports, sourceType) {
    var normalized = normalizeText(sourceType).toUpperCase();
    var item = (imports || []).find(function (entry) { return normalizeText(entry.title).toUpperCase().indexOf(normalized) >= 0; });
    if (!item) return "result-changed";
    return item.status === "COMPLETED" ? "result-ok" : item.status === "FAILED" ? "result-missing" : "result-changed";
  }

  function buildHealthStuckProcessRows(report) {
    var selectedCodes = healthSelectedWarehouseCodes();
    var rows = [];
    (report && report.stuckBatches || []).filter(function (batch) {
      return healthRowMatchesWarehouse(batch, selectedCodes, true);
    }).slice(0, 5).forEach(function (batch) {
      rows.push({
        title: "Lote de estoque travado",
        detail: (batch.source_type || "Estoque") + " | " + (batch.file_name || batch.id) + " | PROCESSING há mais de 2 horas.",
        count: "Corrigir",
        level: "error",
        actionHtml: "<button type=\"button\" class=\"secondary-button small-button health-fix-button\" data-health-fix-stock-batch=\"" + escapeHtml(batch.id) + "\">Corrigir lote travado</button>"
      });
    });
    transferState.transfers.filter(function (transfer) {
      return healthRowMatchesWarehouse(transfer, selectedCodes, true) && !transfer.isDeleted && !isFinalTransferStatus(transfer.status) && healthDateOlderThanHours(transfer.lastActionAt || transfer.updatedAt || transfer.createdAt, 8);
    }).slice(0, 5).forEach(function (transfer) {
      rows.push({ title: "Transferência parada", detail: (transfer.name || transfer.code || transfer.id) + " | Status: " + transfer.status, count: "Atenção", level: "warning" });
    });
    replenishmentState.requests.filter(function (request) {
      return healthRowMatchesWarehouse(request, selectedCodes, true) && !request.isDeleted && ["PENDENTE", "ATRIBUIDO", "EM_SEPARACAO", "ATENDIDO_PARCIAL"].indexOf(request.status) >= 0 && healthDateOlderThanHours(request.updatedAt || request.createdAt, 8);
    }).slice(0, 5).forEach(function (request) {
      rows.push({ title: "Reposição parada", detail: "SKU " + request.codigoMaterial + " | Status: " + request.status, count: "Atenção", level: "warning" });
    });
    return rows.length ? rows : [{ title: "Nenhum processo travado", detail: "Transferências, reposições e lotes de estoque abertos não ultrapassaram o limite operacional.", count: "OK", level: "ok" }];
  }

  async function handleHealthProcessAction(event) {
    var button = event.target.closest ? event.target.closest("[data-health-fix-stock-batch]") : null;
    if (!button) return;
    await fixStuckStockBatch(button.getAttribute("data-health-fix-stock-batch"), button);
  }

  async function fixStuckStockBatch(batchId, button) {
    if (!isAdmin() || !batchId) return;
    var originalLabel = button ? button.textContent : "Corrigir lote travado";
    if (button) {
      button.disabled = true;
      button.textContent = "Corrigindo...";
    }
    var message = "Lote encerrado pelo diagnóstico após permanecer PROCESSING por mais de 2 horas.";
    try {
      var response = await updateRowWithSchemaFallback("wms_stock_import_batches", "id", batchId, {
        status: "FAILED",
        notes: message,
        error_message: message,
        finished_at: nowIso(),
        updated_at: nowIso()
      });
      if (response.error) throw response.error;
      setStatus("healthStatus", "Lote travado encerrado com segurança. A base anterior foi mantida.", "success");
      moduleLoadState.stock = false;
      await ensureStockDataLoaded();
      await refreshSystemHealth();
    } catch (error) {
      if (button) {
        button.disabled = false;
        button.textContent = originalLabel;
      }
      setStatus("healthStatus", "Não foi possível corrigir o lote: " + formatSupabaseError(error), "error");
    }
  }

  function healthDateOlderThanHours(value, hours) {
    if (!value) return false;
    var time = new Date(value).getTime();
    if (!time) return false;
    return Date.now() - time > hours * 60 * 60 * 1000;
  }

  async function generateHealthCorrectionSql() {
    if (!healthState.lastReport) await refreshSystemHealth();
    var sql = buildHealthCorrectionSql(healthState.lastReport);
    $("healthSqlOutput").textContent = sql || "-- Nenhuma coluna obrigatória ausente no diagnóstico atual.";
  }

  function buildHealthCorrectionSql(report) {
    if (!report || !report.schema || !report.schema.missing.length) return "";
    return report.schema.missing.map(function (item) {
      return "alter table public." + item.table + "\nadd column if not exists " + item.column + " " + healthSqlTypeForColumn(item.table, item.column) + ";";
    }).join("\n\n");
  }

  function healthSqlTypeForColumn(tableName, columnName) {
    if (columnName === "id") return "text";
    if (columnName === "active") return "boolean default true";
    if (columnName === "archived") return "boolean default false";
    if (columnName === "quantidade_solicitada" || columnName === "total_disponivel") return "numeric default 0";
    if (columnName === "created_at" || columnName === "updated_at") return "timestamptz default now()";
    if (columnName === "finished_at" || columnName === "archived_at" || columnName === "stock_snapshot_at") return "timestamptz";
    if (columnName === "status_operacional") return "text default 'PENDENTE'";
    if (columnName === "status_divergencia") return "text default 'SEM_DIVERGENCIA'";
    if (columnName === "record_hash" || columnName === "idempotency_key" || columnName === "client_action_id" || columnName === "created_by_id") return "text default ''";
    return "text default ''";
  }

  async function clearHealthLocalCache() {
    if (!confirmHealthDanger("limpar o cache local deste navegador")) return;
    await performHealthLocalCacheClear();
    setStatus("healthStatus", "Cache local limpo neste dispositivo. O Supabase não foi alterado.", "success");
    await refreshSystemHealth();
  }

  async function performHealthLocalCacheClear() {
    await waitForLocalCacheQueue();
    closeLocalCache("health-clear");
    await deleteIndexedDb(LOCAL_CACHE_DB_NAME);
    Object.keys(localStorage).forEach(function (key) {
      if (key.indexOf(LOCAL_SYNC_PREFIX) === 0) localStorage.removeItem(key);
    });
    localCacheState.lastCleanupAt = nowIso();
  }

  async function rebuildHealthLocalCache() {
    if (!confirmHealthDanger("recriar o cache local do estoque atual")) return;
    await performHealthLocalCacheClear();
    resetLazyModuleState(true);
    await ensureHealthDataLoaded();
    setStatus("healthStatus", "Cache local recriado com os dados atuais.", "success");
    await refreshSystemHealth();
  }

  async function flushHealthPendingWrites() {
    await waitForLocalCacheQueue();
    setStatus("healthStatus", "Fila local sincronizada. Pendências atuais: " + localCacheState.writesPending + ".", localCacheState.writesPending ? "warning" : "success");
    await refreshSystemHealth();
  }

  async function waitForLocalCacheQueue() {
    try {
      await Promise.race([localCacheState.writeQueue.catch(function () { return false; }), delay(1800)]);
    } catch (error) {
      markLocalCacheError("health-cache-wait", error);
    }
  }

  function deleteIndexedDb(dbName) {
    return new Promise(function (resolve) {
      if (!("indexedDB" in window)) {
        resolve(false);
        return;
      }
      var request = indexedDB.deleteDatabase(dbName);
      request.onsuccess = function () { resolve(true); };
      request.onerror = function () {
        markLocalCacheError("health-cache-delete", request.error);
        resolve(false);
      };
      request.onblocked = function () { resolve(false); };
    });
  }

  async function archiveHealthOldNotifications() {
    if (!isSupabaseReady()) {
      setStatus("healthStatus", "Supabase não conectado.", "error");
      return;
    }
    if (!confirmHealthDanger("arquivar notificações antigas já vistas")) return;
    var cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    var payload = { archived: true, archived_at: nowIso() };
    var query = supabaseDb.from("wms_notifications").update(payload).lt("created_at", cutoff).eq("read", true);
    if (healthState.warehouseFilter !== "ALL") query = query.eq("warehouse_code", healthState.warehouseFilter);
    var response = await query;
    if (response.error) {
      $("healthSqlOutput").textContent = [
        "alter table if exists public.wms_notifications",
        "add column if not exists archived boolean default false;",
        "",
        "alter table if exists public.wms_notifications",
        "add column if not exists archived_at timestamptz;"
      ].join("\n");
      setStatus("healthStatus", "Não foi possível arquivar notificações. Gere o SQL de correção se faltar coluna: " + formatSupabaseError(response.error), "error");
      return;
    }
    setStatus("healthStatus", "Notificações antigas arquivadas com segurança.", "success");
    await refreshSystemHealth();
  }

  async function archiveHealthInactiveUsers() {
    if (!isAdmin()) return;
    if (!isSupabaseReady()) {
      setStatus("healthStatus", "Supabase não conectado.", "error");
      return;
    }
    if (!confirmHealthDanger("arquivar usuários inativos do filtro atual")) return;
    var inactiveUsers = authState.users.filter(function (user) {
      if (user.archived === true || user.active !== false) return false;
      if (healthState.warehouseFilter === "ALL") return true;
      return userBelongsToWarehouse(user, healthState.warehouseFilter);
    });
    if (!inactiveUsers.length) {
      setStatus("healthStatus", "Nenhum usuário inativo para arquivar.", "success");
      return;
    }
    try {
      var now = nowIso();
      for (var i = 0; i < inactiveUsers.length; i += 1) {
        var user = inactiveUsers[i];
        var response = await supabaseDb.from("wms_users").update({
          archived: true,
          archived_at: now,
          archived_by_id: (authState.currentUser || {}).id || "",
          archived_by_name: (authState.currentUser || {}).name || ""
        }).eq("id", user.id);
        if (response.error) throw response.error;
        user.archived = true;
        user.archivedAt = now;
      }
    } catch (error) {
      setStatus("healthStatus", "Erro ao arquivar usuários inativos: " + formatSupabaseError(error), "error");
      return;
    }
    setStatus("healthStatus", inactiveUsers.length + " usuário(s) inativo(s) arquivado(s).", "success");
    await refreshSystemHealth();
  }

  async function downloadSystemHealthReport() {
    if (!healthState.lastReport) await refreshSystemHealth();
    var report = healthState.lastReport;
    var lines = [
      "# Relatório técnico - Saúde do Sistema WMS",
      "",
      "Gerado em: " + formatDateTime(report.generatedAt),
      "Filtro de estoque: " + report.warehouseLabel,
      "",
      "Resumo:",
      "- Colunas ausentes: " + report.summary.missingColumns,
      "- Duplicidades encontradas: " + report.summary.duplicateGroups,
      "- Registros órfãos: " + report.summary.orphanGroups,
      "- Registros sem warehouse_code: " + report.noWarehouseRecords,
      "- Transferências abertas: " + report.openTransfers,
      "- Pedidos de reposição abertos: " + report.openRequests,
      "- Erros recentes: " + report.summary.recentErrors,
      "",
      "Colunas ausentes:",
      report.schema.missing.length ? report.schema.missing.map(function (item) { return "- Coluna ausente: " + item.table + "." + item.column; }).join("\n") : "- Nenhuma",
      "",
      "Duplicidades:",
      report.duplicates.items.length ? report.duplicates.items.map(function (item) { return "- " + item.title + ": " + item.count + " | " + item.detail; }).join("\n") : "- Nenhuma",
      "",
      "Registros órfãos:",
      report.orphans.items.length ? report.orphans.items.map(function (item) { return "- " + item.title + ": " + item.count + " | " + item.detail; }).join("\n") : "- Nenhum",
      "",
      "SQL sugerido:",
      buildHealthCorrectionSql(report) || "-- Nenhuma correção estrutural necessária no diagnóstico atual."
    ];
    var content = lines.join("\n");
    $("healthSqlOutput").textContent = content;
    downloadTextFile("relatorio-saude-sistema-wms-" + new Date().toISOString().slice(0, 10) + ".md", content, "text/markdown;charset=utf-8");
  }

  function confirmHealthDanger(actionLabel) {
    return window.prompt("Digite CONFIRMAR para " + actionLabel + ".") === "CONFIRMAR";
  }

  async function getReplenishmentSchemaDiagnostics() {
    var result = {
      ready: false,
      columns: {
        idempotency_key: null,
        warehouse_code: null,
        client_action_id: null,
        created_by_id: null,
        updated_at: null
      },
      indexes: {
        idx_replenishment_requests_idempotency: null,
        uq_replenishment_requests_idempotency: null
      },
      error: ""
    };
    if (!isSupabaseReady()) return result;
    var rpcResponse = await supabaseDb.rpc("wms_replenishment_schema_diagnostics");
    if (!rpcResponse.error && rpcResponse.data) {
      var data = Array.isArray(rpcResponse.data) ? rpcResponse.data[0] : rpcResponse.data;
      result.columns = Object.assign(result.columns, (data && data.columns) || {});
      result.indexes = Object.assign(result.indexes, (data && data.indexes) || {});
      result.ready = result.columns.idempotency_key === true &&
        result.columns.warehouse_code === true &&
        result.indexes.uq_replenishment_requests_idempotency === true;
      return result;
    }
    if (rpcResponse.error && !isMissingRpcFunctionError(rpcResponse.error)) {
      result.error = "Falha ao executar diagnostico SQL: " + formatSupabaseError(rpcResponse.error);
      return result;
    }
    var columnNames = Object.keys(result.columns);
    for (var index = 0; index < columnNames.length; index += 1) {
      result.columns[columnNames[index]] = await probeReplenishmentColumn(columnNames[index]);
    }
    result.ready = false;
    result.error = result.columns.idempotency_key === false
      ? "Coluna idempotency_key ausente em wms_replenishment_requests. Execute a migration no Supabase correto."
      : "Funcao wms_replenishment_schema_diagnostics ausente; indices nao verificados pelo app. Aplique as migrations no Supabase correto.";
    return result;
  }

  async function probeReplenishmentColumn(columnName) {
    var response = await supabaseDb
      .from("wms_replenishment_requests")
      .select("id," + columnName)
      .limit(1);
    if (!response.error) return true;
    if (isMissingColumnError(response.error) || isMissingReplenishmentTableError(response.error)) return false;
    return null;
  }

  function isMissingRpcFunctionError(error) {
    var message = formatSupabaseError(error).toLowerCase();
    return message.indexOf("could not find the function") >= 0 ||
      (message.indexOf("function") >= 0 && message.indexOf("schema cache") >= 0) ||
      message.indexOf("pgrst202") >= 0;
  }

  function yesNoDiagnostic(value) {
    if (value === true) return "Sim";
    if (value === false) return "Nao";
    return "Nao verificado";
  }

  function renderMaintenance() {
    if (!$("maintenanceSummary")) return;
    renderMaintenanceWarehouseFilter();
    if (!isGlobalAdmin()) {
      $("maintenanceSummary").innerHTML = "<div class=\"empty-state\">Acesso restrito ao administrador geral.</div>";
      if ($("maintenancePreviewRows")) $("maintenancePreviewRows").innerHTML = "<tr><td colspan=\"7\">Acesso restrito.</td></tr>";
      if ($("maintenanceTestRows")) $("maintenanceTestRows").innerHTML = "";
      if ($("maintenanceResidueRows")) $("maintenanceResidueRows").innerHTML = "";
      if ($("addressMaintenanceSummary")) $("addressMaintenanceSummary").innerHTML = "";
      if ($("maintenanceAddressRows")) $("maintenanceAddressRows").innerHTML = "";
      return;
    }
    var report = maintenanceState.lastReport || buildLocalMaintenanceReport();
    var addressReport = buildAddressMaintenanceReport();
    var executable = (report.preview || []).filter(function (entry) { return entry.executable && entry.count > 0; });
    var manual = (report.preview || []).filter(function (entry) { return !entry.executable && entry.count > 0; });
    $("maintenanceSummary").innerHTML = [
      summaryChip("Filtro", maintenanceWarehouseLabel()),
      summaryChip("Ações seguras", executable.length, executable.length ? "result-changed" : "result-ok"),
      summaryChip("Registros na prévia", report.previewCount || 0, report.previewCount ? "result-changed" : "result-ok"),
      summaryChip("Revisão manual", manual.length, manual.length ? "result-missing" : "result-ok"),
      summaryChip("Transferências teste", report.testTransfers.length, report.testTransfers.length ? "result-changed" : "result-ok"),
      summaryChip("Órfãos", report.orphanTotal, report.orphanTotal ? "result-missing" : "result-ok"),
      summaryChip("Última execução", maintenanceState.lastResult ? formatDateTime(maintenanceState.lastResult.executedAt) : "-")
    ].join("");
    renderMaintenancePreview(report);
    $("maintenanceTestRows").innerHTML = report.testTransfers.length ? report.testTransfers.map(function (transfer) {
      return [
        "<tr>",
        "<td><strong>" + escapeHtml(transferDisplayName(transfer)) + "</strong><br><span class=\"muted\">" + escapeHtml(transfer.code || transfer.id) + "</span></td>",
        "<td><span class=\"status-badge pending\">" + escapeHtml(transferStatusDisplayLabel(transfer.status)) + "</span></td>",
        "<td>" + escapeHtml(transfer.responsibleName || "-") + "</td>",
        "<td>" + formatDateTime(transfer.createdAt) + "</td>",
        "<td><span class=\"status-badge pending\">Soft delete na limpeza segura</span></td>",
        "</tr>"
      ].join("");
    }).join("") : "<tr><td colspan=\"5\">Nenhuma transferência marcada como teste.</td></tr>";
    $("maintenanceResidueRows").innerHTML = report.tables.length ? report.tables.map(function (table) {
      return [
        "<tr>",
        "<td>" + escapeHtml(table.name) + "</td>",
        "<td>" + table.orphanCount + "</td>",
        "<td>" + escapeHtml(table.missing ? "Tabela ausente" : table.orphanCount ? "Entra na prévia" : "OK") + "</td>",
        "</tr>"
      ].join("");
    }).join("") : "<tr><td colspan=\"3\">Gere uma prévia para avaliar o banco.</td></tr>";
    renderAddressMaintenance(addressReport);
    renderSystemDiagnostics();
  }

  function renderMaintenanceWarehouseFilter() {
    var select = $("maintenanceWarehouseFilter");
    if (!select) return;
    var current = maintenanceState.warehouseFilter || "CURRENT";
    var warehouses = (warehouseState.warehouses && warehouseState.warehouses.length ? warehouseState.warehouses : WAREHOUSE_SEED).filter(function (warehouse) {
      return warehouse.active !== false;
    });
    select.innerHTML = [
      "<option value=\"CURRENT\">Estoque atual (" + escapeHtml(activeWarehouseCode()) + ")</option>",
      "<option value=\"ALL\">Todos os estoques ativos</option>"
    ].concat(warehouses.map(function (warehouse) {
      var code = normalizeWarehouseCode(warehouse.code);
      return "<option value=\"" + escapeHtml(code) + "\">" + escapeHtml(code + " - " + (warehouse.name || "Estoque " + code)) + "</option>";
    })).join("");
    select.value = current === "ALL" || current === "CURRENT" || warehouses.some(function (warehouse) { return normalizeWarehouseCode(warehouse.code) === current; }) ? current : "CURRENT";
    maintenanceState.warehouseFilter = select.value;
  }

  function maintenanceSelectedWarehouseCodes() {
    if (maintenanceState.warehouseFilter === "ALL") return activeWarehouseCodes();
    if (maintenanceState.warehouseFilter && maintenanceState.warehouseFilter !== "CURRENT") return [normalizeWarehouseCode(maintenanceState.warehouseFilter)];
    return [activeWarehouseCode()];
  }

  function maintenanceWarehouseLabel() {
    if (maintenanceState.warehouseFilter === "ALL") return "Todos";
    return maintenanceSelectedWarehouseCodes().join(", ");
  }

  function maintenanceRowMatchesWarehouse(row, includeBlankWhenAll) {
    var rawCode = rawWarehouseCodeValue(row);
    if (!rawCode) return maintenanceState.warehouseFilter === "ALL" && includeBlankWhenAll;
    return maintenanceSelectedWarehouseCodes().indexOf(normalizeWarehouseCode(rawCode)) >= 0;
  }

  function buildLocalMaintenanceReport() {
    var transfers = transferState.transfers.filter(function (transfer) {
      return maintenanceRowMatchesWarehouse(transfer, false);
    });
    var testTransfers = transfers.filter(isLikelyTestTransfer).filter(function (transfer) { return !transfer.isDeleted; });
    return {
      generatedAt: nowIso(),
      scope: maintenanceState.activeScope || "all",
      warehouseLabel: maintenanceWarehouseLabel(),
      transferCount: transfers.length,
      testTransfers: testTransfers,
      orphanTotal: 0,
      previewCount: 0,
      preview: [],
      tables: []
    };
  }

  function isLikelyTestTransfer(transfer) {
    var haystack = normalizeText([
      transfer.id,
      transfer.code,
      transfer.name,
      transfer.observation,
      transfer.createdByName,
      transfer.importFileName
    ].join(" ")).toLowerCase();
    return transfer.isTest === true || haystack.indexOf("teste") >= 0 || haystack.indexOf("test") >= 0;
  }

  async function verifyMaintenanceResidues(eventOrScope) {
    if (!isGlobalAdmin()) {
      setStatus("maintenanceStatus", "Acesso restrito ao administrador geral.", "error");
      return;
    }
    if (!isSupabaseReady()) {
      setStatus("maintenanceStatus", "Supabase não conectado.", "error");
      return;
    }
    if (maintenanceState.checking) return;
    var scope = "all";
    if (typeof eventOrScope === "string") scope = eventOrScope;
    else if (eventOrScope && eventOrScope.currentTarget && eventOrScope.currentTarget.dataset.maintenanceScope) scope = eventOrScope.currentTarget.dataset.maintenanceScope;
    maintenanceState.activeScope = scope;
    maintenanceState.checking = true;
    var button = eventOrScope && eventOrScope.currentTarget ? eventOrScope.currentTarget : $("verifyMaintenanceButton");
    var originalLabel = button ? button.textContent : "";
    if (button) {
      button.disabled = true;
      button.textContent = "Gerando prévia...";
    }
    try {
      setStatus("maintenanceStatus", "Gerando prévia segura. Nada será alterado.", "warning");
      maintenanceState.lastReport = await buildSafeMaintenanceReport(scope);
      await recordMaintenanceLog("PREVIEW", "maintenance_preview", maintenanceState.lastReport.previewCount, "OK", "Prévia gerada para " + maintenanceState.lastReport.warehouseLabel + ".");
      renderMaintenance();
      setStatus("maintenanceStatus", maintenanceState.lastReport.previewCount ? "Prévia pronta. Revise e digite LIMPAR para executar apenas ações seguras." : "Prévia pronta. Nenhuma limpeza segura encontrada.", maintenanceState.lastReport.previewCount ? "warning" : "success");
    } catch (error) {
      recordPerformanceError("manutencao-segura-preview", error);
      setStatus("maintenanceStatus", "Erro ao gerar prévia: " + formatSupabaseError(error), "error");
    } finally {
      maintenanceState.checking = false;
      if (button) {
        button.disabled = false;
        button.textContent = originalLabel || "Gerar prévia da limpeza";
      }
    }
  }

  async function buildSafeMaintenanceReport(scope) {
    var selectedCodes = maintenanceSelectedWarehouseCodes();
    var stockRowsResult = await readHealthRows("wms_stock_positions", "id,warehouse_code,source_type,codigo_material,nome_material,total_disponivel,total_fisico,total_alocado,estacao,rack,linha,coluna,codigo_endereco,active,batch_id,record_hash,archived,created_at,updated_at", "updated_at", 2500);
    var batchesResult = await readHealthRows("wms_stock_import_batches", "id,warehouse_code,source_type,file_name,status,created_at,updated_at,finished_at,error_message,notes,total_rows,imported_rows,archived", "created_at", 600);
    var notificationRowsResult = await readHealthRows("wms_notifications", "id,warehouse_code,user_id,entity_id,event_type,transfer_id,read,seen,archived,created_at", "created_at", 1200);
    if (notificationRowsResult.error && isMissingColumnError(notificationRowsResult.error)) {
      notificationRowsResult = await readHealthRows("wms_notifications", "id,warehouse_code,user_id,transfer_id,created_at", "created_at", 1200);
    }
    var requestRowsResult = await readHealthRows("wms_replenishment_requests", "id,warehouse_code,codigo_material,nome_material,status,observacao,is_test,is_deleted,archived,created_at,updated_at", "created_at", 800);
    var transferRowsResult = await readHealthRows("wms_transfers", transferSummarySelectColumns(), "created_at", 800);
    var transferItemRowsResult = await readHealthRows("wms_transfer_items", "id,transfer_id,warehouse_code,codigo_material,sku,status,created_at,updated_at", "created_at", 1600);
    var stockRows = (stockRowsResult.rows || []).filter(function (row) { return maintenanceRowMatchesWarehouse(row, true); });
    var batches = (batchesResult.rows || []).filter(function (row) { return maintenanceRowMatchesWarehouse(row, true); });
    var notifications = (notificationRowsResult.rows || []).filter(function (row) { return maintenanceRowMatchesWarehouse(row, true); });
    var requests = (requestRowsResult.rows || []).filter(function (row) { return maintenanceRowMatchesWarehouse(row, true); });
    var transfers = (transferRowsResult.rows || []).map(fromDbTransfer).filter(function (transfer) { return maintenanceRowMatchesWarehouse(transfer, true); });
    if (!transfers.length) transfers = transferState.transfers.filter(function (transfer) { return maintenanceRowMatchesWarehouse(transfer, true); });
    var transferRows = transfers.map(function (transfer) {
      return {
        id: transfer.id,
        warehouse_code: transfer.warehouseCode,
        status: transfer.status,
        observacao: transfer.observation,
        nome_transferencia: transfer.name,
        codigo_transferencia: transfer.code,
        created_at: transfer.createdAt,
        updated_at: transfer.updatedAt,
        is_deleted: transfer.isDeleted
      };
    });
    var transferItems = (transferItemRowsResult.rows || []).filter(function (row) { return maintenanceRowMatchesWarehouse(row, true); });
    var preview = [];
    if (scope === "all" || scope === "batches") addMaintenanceBatchPreview(preview, batches, stockRows);
    if (scope === "all" || scope === "stock") addMaintenanceStockPreview(preview, stockRows, batches);
    if (scope === "all" || scope === "duplicates") addMaintenanceDuplicatePreview(preview, stockRows);
    if (scope === "all" || scope === "notifications") addMaintenanceNotificationPreview(preview, notifications);
    if (scope === "all" || scope === "users") addMaintenanceUserPreview(preview);
    if (scope === "all" || scope === "tests") {
      addMaintenanceTestTransferPreview(preview, transferRows);
      addMaintenanceTestReplenishmentPreview(preview, requests);
    }
    var orphanTables = await buildMaintenanceOrphanPreview(preview, transferRows, transferItems, notifications, requests, scope);
    preview = preview.filter(function (entry) { return entry.count > 0; });
    var testTransferIds = {};
    preview.forEach(function (entry) {
      if (entry.type === "SOFT_DELETE_TEST_TRANSFER") (entry.ids || []).forEach(function (id) { testTransferIds[id] = true; });
    });
    return {
      generatedAt: nowIso(),
      scope: scope,
      warehouseLabel: maintenanceWarehouseLabel(),
      selectedWarehouses: selectedCodes,
      transferCount: transferRows.length,
      testTransfers: transfers.filter(function (transfer) { return testTransferIds[transfer.id]; }),
      orphanTotal: orphanTables.reduce(function (sum, table) { return sum + table.orphanCount; }, 0),
      previewCount: preview.reduce(function (sum, entry) { return sum + entry.count; }, 0),
      preview: preview,
      tables: orphanTables,
      notes: [
        stockRowsResult.error ? "Base de estoque: " + formatSupabaseError(stockRowsResult.error) : "",
        batchesResult.error ? "Lotes: " + formatSupabaseError(batchesResult.error) : "",
        notificationRowsResult.error ? "Notificações: " + formatSupabaseError(notificationRowsResult.error) : "",
        requestRowsResult.error ? "Reposição: " + formatSupabaseError(requestRowsResult.error) : "",
        transferRowsResult.error ? "Transferências: " + formatSupabaseError(transferRowsResult.error) : "",
        transferItemRowsResult.error ? "Itens transferência: " + formatSupabaseError(transferItemRowsResult.error) : ""
      ].filter(Boolean)
    };
  }

  function addMaintenanceBatchPreview(preview, batches, stockRows) {
    var activeBatchIds = {};
    stockRows.forEach(function (row) { if (row.active === true && row.batch_id) activeBatchIds[row.batch_id] = true; });
    var stuck = batches.filter(function (batch) {
      return normalizeText(batch.status).toUpperCase() === "PROCESSING" && healthDateOlderThanHours(batch.updated_at || batch.created_at, 2) && rawWarehouseCodeValue(batch);
    });
    pushMaintenancePreview(preview, "FAIL_STUCK_BATCHES", "wms_stock_import_batches", stuck, "Lote PROCESSING travado há mais de 2 horas.", "Baixo", "Marcar como FAILED e manter a base anterior ativa.", "Atualizar");
    var byGroup = {};
    batches.forEach(function (batch) {
      if (!rawWarehouseCodeValue(batch)) return;
      var key = rowWarehouseCode(batch) + "|" + normalizeText(batch.source_type || "-").toUpperCase();
      if (!byGroup[key]) byGroup[key] = [];
      byGroup[key].push(batch);
    });
    var oldBatches = [];
    Object.keys(byGroup).forEach(function (key) {
      byGroup[key].sort(sortDbRowsByDateDesc);
      byGroup[key].slice(5).forEach(function (batch) {
        var status = normalizeText(batch.status).toUpperCase();
        if (status === "PROCESSING" || activeBatchIds[batch.id] || batch.archived === true) return;
        oldBatches.push(batch);
      });
    });
    pushMaintenancePreview(preview, "ARCHIVE_OLD_BATCHES", "wms_stock_import_batches", oldBatches, "Lotes antigos fora dos últimos 5 por estoque e origem.", "Baixo", "Arquivar lote antigo, sem tocar nos registros ativos.", "Arquivar");
    var missingWarehouse = batches.filter(function (batch) { return !rawWarehouseCodeValue(batch); });
    pushMaintenancePreview(preview, "MANUAL_BATCH_NO_WAREHOUSE", "wms_stock_import_batches", missingWarehouse, "Lote sem warehouse_code/source_type confiável.", "Alto", "Revisar manualmente antes de qualquer limpeza.", "Manual", false);
  }

  function addMaintenanceStockPreview(preview, stockRows, batches) {
    var latestBatchByGroup = {};
    batches.forEach(function (batch) {
      if (!rawWarehouseCodeValue(batch)) return;
      var key = rowWarehouseCode(batch) + "|" + normalizeText(batch.source_type || "-").toUpperCase();
      if (!latestBatchByGroup[key] || new Date(batch.created_at || 0) > new Date(latestBatchByGroup[key].created_at || 0)) latestBatchByGroup[key] = batch;
    });
    var inactiveOld = stockRows.filter(function (row) {
      if (!rawWarehouseCodeValue(row) || row.archived === true || row.active === true) return false;
      var groupKey = rowWarehouseCode(row) + "|" + normalizeText(row.source_type || "-").toUpperCase();
      var latestBatch = latestBatchByGroup[groupKey];
      if (latestBatch && row.batch_id && row.batch_id === latestBatch.id) return false;
      return healthDateOlderThanHours(row.updated_at || row.created_at, 24);
    });
    pushMaintenancePreview(preview, "ARCHIVE_INACTIVE_STOCK", "wms_stock_positions", inactiveOld, "Registros inativos antigos fora da base atual.", "Baixo", "Arquivar registros inativos, sem apagar base ativa.", "Arquivar");
    var missingSku = stockRows.filter(function (row) { return rawWarehouseCodeValue(row) && !normalizeSku(row.codigo_material); });
    pushMaintenancePreview(preview, "MANUAL_STOCK_NO_SKU", "wms_stock_positions", missingSku, "Registro da base sem codigo_material.", "Médio", "Revisar arquivo de origem ou corrigir manualmente.", "Manual", false);
    var missingWarehouse = stockRows.filter(function (row) { return !rawWarehouseCodeValue(row); });
    pushMaintenancePreview(preview, "MANUAL_STOCK_NO_WAREHOUSE", "wms_stock_positions", missingWarehouse, "Registro da base sem warehouse_code.", "Alto", "Não limpar automaticamente para não misturar estoques.", "Manual", false);
  }

  function addMaintenanceDuplicatePreview(preview, stockRows) {
    var groups = {};
    stockRows.filter(function (row) {
      return row.active === true && row.archived !== true && rawWarehouseCodeValue(row) && normalizeSku(row.codigo_material);
    }).forEach(function (row) {
      var sourceType = normalizeText(row.source_type || "").toUpperCase();
      var keyParts = [rowWarehouseCode(row), sourceType, normalizeSku(row.codigo_material), "ACTIVE"];
      if (sourceType !== "LOJA") keyParts = keyParts.concat([row.estacao || "", row.rack || "", row.linha || "", row.coluna || "", row.codigo_endereco || ""]);
      var key = keyParts.join("|");
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    });
    var exactDuplicates = [];
    var conflicts = [];
    Object.keys(groups).forEach(function (key) {
      var items = groups[key];
      if (items.length < 2) return;
      var signatures = unique(items.map(maintenanceStockSignature));
      items.sort(sortDbRowsByDateDesc);
      if (signatures.length === 1) exactDuplicates = exactDuplicates.concat(items.slice(1));
      else conflicts.push(items[0]);
    });
    pushMaintenancePreview(preview, "ARCHIVE_DUPLICATE_STOCK", "wms_stock_positions", exactDuplicates, "Duplicidades ativas idênticas na base operacional.", "Médio", "Arquivar duplicado e manter o registro mais recente.", "Arquivar");
    pushMaintenancePreview(preview, "MANUAL_STOCK_CONFLICT", "wms_stock_positions", conflicts, "Duplicidades ativas com valores diferentes.", "Alto", "Exige decisão manual, sem limpeza automática.", "Manual", false);
  }

  function addMaintenanceNotificationPreview(preview, notifications) {
    var oldSeen = notifications.filter(function (row) {
      return rawWarehouseCodeValue(row) && row.archived !== true && (row.read === true || row.seen === true) && healthDateOlderThanHours(row.created_at, 24 * 30);
    });
    pushMaintenancePreview(preview, "ARCHIVE_OLD_NOTIFICATIONS", "wms_notifications", oldSeen, "Notificações vistas com mais de 30 dias.", "Baixo", "Arquivar notificações antigas já vistas.", "Arquivar");
  }

  function addMaintenanceUserPreview(preview) {
    var users = authState.users.filter(function (user) {
      if (user.archived === true || user.active !== false) return false;
      if (user.id === (authState.currentUser || {}).id) return false;
      if (maintenanceState.warehouseFilter === "ALL") return true;
      return maintenanceSelectedWarehouseCodes().some(function (code) { return userBelongsToWarehouse(user, code); });
    });
    pushMaintenancePreview(preview, "ARCHIVE_INACTIVE_USERS", "wms_users", users.map(function (user) {
      return { id: user.id, warehouse_code: user.defaultWarehouseCode, created_at: user.createdAt, updated_at: user.updatedAt };
    }), "Usuários inativos não arquivados.", "Baixo", "Arquivar usuário e manter histórico operacional.", "Arquivar");
  }

  function addMaintenanceTestTransferPreview(preview, transfers) {
    var rows = transfers.filter(function (row) {
      if (!rawWarehouseCodeValue(row) || row.is_deleted === true) return false;
      return isLikelyTestTransfer({
        id: row.id,
        code: row.codigo_transferencia,
        name: row.nome_transferencia,
        observation: row.observacao,
        createdByName: row.criado_por_nome
      });
    });
    pushMaintenancePreview(preview, "SOFT_DELETE_TEST_TRANSFER", "wms_transfers", rows, "Transferências marcadas como teste.", "Médio", "Cancelar e ocultar da operação por soft delete.", "Arquivar");
  }

  function addMaintenanceTestReplenishmentPreview(preview, requests) {
    var rows = requests.filter(function (row) {
      var status = normalizeText(row.status).toUpperCase();
      var text = normalizeText([row.codigo_material, row.nome_material, row.observacao].join(" ")).toLowerCase();
      if (!rawWarehouseCodeValue(row) || row.is_deleted === true || row.archived === true) return false;
      return row.is_test === true || text.indexOf("teste") >= 0 || status === "CANCELADO" && healthDateOlderThanHours(row.updated_at || row.created_at, 24 * 30);
    });
    pushMaintenancePreview(preview, "ARCHIVE_TEST_REPLENISHMENT", "wms_replenishment_requests", rows, "Reposições de teste, canceladas antigas ou marcadas manualmente.", "Médio", "Arquivar/ocultar pedido sem apagar histórico.", "Arquivar");
  }

  async function buildMaintenanceOrphanPreview(preview, transferRows, transferItems, notifications, requests, scope) {
    var activeTransferIds = {};
    transferRows.forEach(function (row) {
      if (row.id && row.is_deleted !== true) activeTransferIds[row.id] = true;
    });
    var tables = [];
    if (scope === "all" || scope === "orphans") {
      var orphanItems = transferItems.filter(function (row) { return row.id && row.transfer_id && !activeTransferIds[row.transfer_id] && rawWarehouseCodeValue(row); });
      tables.push({ name: "wms_transfer_items", orphanCount: orphanItems.length, orphanRows: orphanItems, missing: false });
      pushMaintenancePreview(preview, "DELETE_ORPHAN_TRANSFER_ITEMS", "wms_transfer_items", orphanItems, "Itens de transferência sem transferência ativa.", "Médio", "Remover somente IDs órfãos confirmados.", "Apagar por ID");
      var orphanNotifications = notifications.filter(function (row) { return row.id && row.transfer_id && !activeTransferIds[row.transfer_id] && rawWarehouseCodeValue(row); });
      tables.push({ name: "wms_notifications", orphanCount: orphanNotifications.length, orphanRows: orphanNotifications, missing: false });
      pushMaintenancePreview(preview, "ARCHIVE_ORPHAN_NOTIFICATIONS", "wms_notifications", orphanNotifications, "Notificações de transferência inexistente.", "Baixo", "Arquivar notificações órfãs.", "Arquivar");
      var requestsNoWarehouse = requests.filter(function (row) { return row.id && !rawWarehouseCodeValue(row); });
      tables.push({ name: "wms_replenishment_requests", orphanCount: requestsNoWarehouse.length, orphanRows: requestsNoWarehouse, missing: false });
      pushMaintenancePreview(preview, "MANUAL_REPLENISHMENT_NO_WAREHOUSE", "wms_replenishment_requests", requestsNoWarehouse, "Pedido de reposição sem warehouse_code.", "Alto", "Corrigir manualmente antes de limpar.", "Manual", false);
      var transfersNoWarehouse = transferRows.filter(function (row) { return row.id && !rawWarehouseCodeValue(row); });
      tables.push({ name: "wms_transfers", orphanCount: transfersNoWarehouse.length, orphanRows: transfersNoWarehouse, missing: false });
      pushMaintenancePreview(preview, "MANUAL_TRANSFER_NO_WAREHOUSE", "wms_transfers", transfersNoWarehouse, "Transferência sem warehouse_code.", "Alto", "Corrigir estoque antes de qualquer limpeza.", "Manual", false);
    }
    return tables;
  }

  function pushMaintenancePreview(preview, type, tableName, rows, reason, risk, proposedAction, mode, executable) {
    rows = rows || [];
    if (!rows.length) return;
    if (executable === undefined) executable = true;
    var byWarehouse = {};
    rows.forEach(function (row) {
      var code = rawWarehouseCodeValue(row) ? rowWarehouseCode(row) : "SEM_ESTOQUE";
      if (!byWarehouse[code]) byWarehouse[code] = [];
      byWarehouse[code].push(row);
    });
    Object.keys(byWarehouse).forEach(function (code) {
      var groupedRows = byWarehouse[code].slice(0, 500);
      preview.push({
        id: type + "-" + tableName + "-" + code + "-" + preview.length,
        type: type,
        tableName: tableName,
        warehouseCode: code,
        count: byWarehouse[code].length,
        ids: groupedRows.map(function (row) { return row.id; }).filter(Boolean),
        reason: reason,
        risk: risk,
        proposedAction: proposedAction,
        mode: mode,
        executable: executable && code !== "SEM_ESTOQUE",
        dateRange: maintenanceDateRange(byWarehouse[code])
      });
    });
  }

  function maintenanceDateRange(rows) {
    var dates = (rows || []).map(function (row) { return row.updated_at || row.created_at || row.updatedAt || row.createdAt || ""; }).filter(Boolean).sort();
    if (!dates.length) return "-";
    if (dates.length === 1) return formatDateTime(dates[0]);
    return formatDateTime(dates[0]) + " até " + formatDateTime(dates[dates.length - 1]);
  }

  function maintenanceStockSignature(row) {
    return [
      normalizeText(row.source_type).toUpperCase(),
      normalizeSku(row.codigo_material),
      Number(row.total_fisico || 0),
      Number(row.total_alocado || 0),
      Number(row.total_disponivel || 0),
      normalizeText(row.estacao),
      normalizeText(row.rack),
      normalizeText(row.linha),
      normalizeText(row.coluna),
      normalizeText(row.codigo_endereco),
      normalizeText(row.record_hash)
    ].join("|");
  }

  function sortDbRowsByDateDesc(a, b) {
    return new Date(b.updated_at || b.created_at || b.updatedAt || b.createdAt || 0) - new Date(a.updated_at || a.created_at || a.updatedAt || a.createdAt || 0);
  }

  function renderMaintenancePreview(report) {
    if (!$("maintenancePreviewRows")) return;
    var rows = (report && report.preview) || [];
    $("maintenancePreviewRows").innerHTML = rows.length ? rows.map(function (entry) {
      return [
        "<tr class=\"" + (entry.executable ? "" : "maintenance-manual-row") + "\">",
        "<td><strong>" + escapeHtml(entry.tableName) + "</strong><br><span class=\"muted\">" + escapeHtml(entry.mode || "-") + "</span></td>",
        "<td>" + escapeHtml(entry.warehouseCode || "-") + "</td>",
        "<td>" + entry.count + "</td>",
        "<td>" + escapeHtml(entry.reason) + "</td>",
        "<td><span class=\"status-badge " + (entry.risk === "Alto" ? "inactive" : entry.risk === "Médio" ? "pending" : "active") + "\">" + escapeHtml(entry.risk) + "</span></td>",
        "<td>" + escapeHtml(entry.executable ? entry.proposedAction : "Somente revisão manual") + "</td>",
        "<td>" + escapeHtml(entry.dateRange || "-") + "</td>",
        "</tr>"
      ].join("");
    }).join("") : "<tr><td colspan=\"7\">Nenhuma prévia gerada ainda.</td></tr>";
  }

  async function cleanMaintenanceResidues() {
    if (!isGlobalAdmin()) {
      setStatus("maintenanceStatus", "Acesso restrito ao administrador geral.", "error");
      return;
    }
    if (!isSupabaseReady()) {
      setStatus("maintenanceStatus", "Supabase não conectado.", "error");
      return;
    }
    if (!maintenanceState.lastReport) {
      setStatus("maintenanceStatus", "Gere a prévia antes de executar a limpeza.", "warning");
      return;
    }
    var executable = (maintenanceState.lastReport.preview || []).filter(function (entry) { return entry.executable && entry.count > 0 && entry.ids.length; });
    if (!executable.length) {
      setStatus("maintenanceStatus", "Nenhuma ação automática segura disponível. Revise os itens manuais.", "warning");
      return;
    }
    if ($("maintenanceConfirmInput") && normalizeText($("maintenanceConfirmInput").value).toUpperCase() !== "LIMPAR") {
      setStatus("maintenanceStatus", "Digite LIMPAR para confirmar a execução.", "error");
      return;
    }
    if (maintenanceState.cleaning) return;
    maintenanceState.cleaning = true;
    $("cleanResiduesButton").disabled = true;
    $("cleanResiduesButton").textContent = "Executando...";
    var affected = 0;
    var errors = [];
    try {
      await recordMaintenanceLog("EXECUTION_START", "maintenance_safe_cleanup", maintenanceState.lastReport.previewCount, "STARTED", "Execução iniciada para " + maintenanceState.lastReport.warehouseLabel + ".");
      for (var i = 0; i < executable.length; i += 1) {
        try {
          affected += await executeMaintenancePreviewEntry(executable[i]);
        } catch (entryError) {
          errors.push(executable[i].tableName + ": " + formatSupabaseError(entryError));
        }
      }
      maintenanceState.lastResult = { executedAt: nowIso(), affected: affected, errors: errors };
      await recordMaintenanceLog("EXECUTION_FINISH", "maintenance_safe_cleanup", affected, errors.length ? "PARTIAL" : "OK", errors.join(" | ") || "Limpeza segura concluída.");
      maintenanceState.lastReport = null;
      if ($("maintenanceConfirmInput")) $("maintenanceConfirmInput").value = "";
      resetLazyModuleState(true);
      await loadData();
      renderAll();
      setStatus("maintenanceStatus", errors.length ? "Limpeza parcial: " + affected + " registro(s) ajustado(s). Erros: " + errors.join(" | ") : "Limpeza segura concluída: " + affected + " registro(s) ajustado(s).", errors.length ? "warning" : "success");
    } catch (error) {
      await recordMaintenanceLog("EXECUTION_ERROR", "maintenance_safe_cleanup", affected, "ERROR", formatSupabaseError(error));
      setStatus("maintenanceStatus", "Erro ao executar limpeza: " + formatSupabaseError(error), "error");
    } finally {
      maintenanceState.cleaning = false;
      $("cleanResiduesButton").disabled = false;
      $("cleanResiduesButton").textContent = "Executar limpeza segura";
    }
  }

  async function executeMaintenancePreviewEntry(entry) {
    var ids = (entry.ids || []).filter(Boolean).slice(0, 500);
    if (!ids.length) return 0;
    var now = nowIso();
    if (entry.type === "FAIL_STUCK_BATCHES") {
      return updateRowsByIdsWithSchemaFallback(entry.tableName, ids, {
        status: "FAILED",
        finished_at: now,
        updated_at: now,
        error_message: "Lote travado por mais de 2 horas. Encerrado pela manutenção segura.",
        notes: "Lote travado por mais de 2 horas. Encerrado pela manutenção segura."
      });
    }
    if (entry.type === "ARCHIVE_OLD_BATCHES") {
      return updateRowsByIdsWithSchemaFallback(entry.tableName, ids, maintenanceArchivePayload(now));
    }
    if (entry.type === "ARCHIVE_INACTIVE_STOCK") {
      return updateRowsByIdsWithSchemaFallback(entry.tableName, ids, maintenanceArchivePayload(now));
    }
    if (entry.type === "ARCHIVE_DUPLICATE_STOCK") {
      return updateRowsByIdsWithSchemaFallback(entry.tableName, ids, Object.assign({ active: false }, maintenanceArchivePayload(now)));
    }
    if (entry.type === "ARCHIVE_OLD_NOTIFICATIONS" || entry.type === "ARCHIVE_ORPHAN_NOTIFICATIONS") {
      return updateRowsByIdsWithSchemaFallback(entry.tableName, ids, { archived: true, archived_at: now });
    }
    if (entry.type === "ARCHIVE_INACTIVE_USERS") {
      return updateRowsByIdsWithSchemaFallback(entry.tableName, ids, {
        archived: true,
        archived_at: now,
        archived_by_id: (authState.currentUser || {}).id || "",
        archived_by_name: (authState.currentUser || {}).name || "",
        active: false,
        available_for_tasks: false
      });
    }
    if (entry.type === "SOFT_DELETE_TEST_TRANSFER") {
      return updateRowsByIdsWithSchemaFallback(entry.tableName, ids, {
        status: "CANCELADA",
        is_deleted: true,
        deleted_at: now,
        deleted_by_id: (authState.currentUser || {}).id || "",
        deleted_by_name: (authState.currentUser || {}).name || "",
        updated_at: now,
        last_action_at: now,
        last_action_label: "Transferência de teste arquivada pela manutenção segura"
      });
    }
    if (entry.type === "ARCHIVE_TEST_REPLENISHMENT") {
      return updateRowsByIdsWithSchemaFallback(entry.tableName, ids, Object.assign({
        status: "CANCELADO",
        is_deleted: true,
        deleted_at: now,
        deleted_by_id: (authState.currentUser || {}).id || "",
        deleted_by_name: (authState.currentUser || {}).name || "",
        updated_at: now
      }, maintenanceArchivePayload(now)));
    }
    if (entry.type === "DELETE_ORPHAN_TRANSFER_ITEMS") {
      return deleteRowsByIdsSafely(entry.tableName, ids);
    }
    return 0;
  }

  function maintenanceArchivePayload(now) {
    return {
      archived: true,
      archived_at: now,
      archived_by_id: (authState.currentUser || {}).id || "",
      archived_by_name: (authState.currentUser || {}).name || "",
      updated_at: now
    };
  }

  async function updateRowsByIdsWithSchemaFallback(tableName, ids, payload) {
    var total = 0;
    for (var start = 0; start < ids.length; start += 100) {
      var chunk = ids.slice(start, start + 100);
      var updatePayload = Object.assign({}, payload);
      var attemptedMissingColumns = {};
      while (Object.keys(updatePayload).length) {
        var response = await supabaseDb.from(tableName).update(updatePayload).in("id", chunk);
        if (!response.error) {
          total += chunk.length;
          break;
        }
        if (!isMissingColumnError(response.error)) throw response.error;
        var missingColumn = getMissingColumnName(response.error);
        if (!missingColumn || attemptedMissingColumns[missingColumn]) throw response.error;
        attemptedMissingColumns[missingColumn] = true;
        delete updatePayload[missingColumn];
      }
    }
    return total;
  }

  async function deleteRowsByIdsSafely(tableName, ids) {
    var total = 0;
    for (var start = 0; start < ids.length; start += 100) {
      var chunk = ids.slice(start, start + 100);
      var response = await supabaseDb.from(tableName).delete().in("id", chunk);
      if (response.error && !isMissingTransferTableError(response.error)) throw response.error;
      total += chunk.length;
    }
    return total;
  }

  async function recordMaintenanceLog(actionType, tableName, count, status, notes) {
    if (!isSupabaseReady()) return;
    var row = {
      id: randomId("maint"),
      created_at: nowIso(),
      executed_by_id: (authState.currentUser || {}).id || "",
      executed_by_name: (authState.currentUser || {}).name || "",
      action_type: actionType,
      table_name: tableName,
      warehouse_code: maintenanceWarehouseLabel(),
      preview_count: Number(count || 0),
      affected_count: Number(count || 0),
      criteria: JSON.stringify({
        scope: maintenanceState.activeScope || "all",
        warehouseFilter: maintenanceState.warehouseFilter || "CURRENT"
      }),
      status: status || "OK",
      notes: notes || ""
    };
    try {
      var response = await supabaseDb.from("wms_maintenance_logs").insert(row);
      if (response.error && !isMissingHealthTableError(response.error) && !isMissingColumnError(response.error)) throw response.error;
    } catch (error) {
      recordPerformanceError("maintenance-log", error);
    }
  }

  function downloadMaintenanceSafeReport() {
    var report = maintenanceState.lastReport || buildLocalMaintenanceReport();
    var lines = [
      "# Relatório - Manutenção Segura do Banco",
      "",
      "Gerado em: " + formatDateTime(report.generatedAt || nowIso()),
      "Usuário: " + ((authState.currentUser || {}).name || "-"),
      "Filtro de estoque: " + (report.warehouseLabel || maintenanceWarehouseLabel()),
      "Escopo: " + (report.scope || maintenanceState.activeScope || "all"),
      "",
      "Resumo:",
      "- Transferências avaliadas: " + (report.transferCount || 0),
      "- Registros na prévia: " + (report.previewCount || 0),
      "- Órfãos encontrados: " + (report.orphanTotal || 0),
      "- Transferências de teste: " + ((report.testTransfers || []).length),
      "",
      "Prévia:",
      (report.preview && report.preview.length ? report.preview.map(function (entry) {
        return "- " + entry.tableName + " | " + entry.warehouseCode + " | " + entry.count + " | " + entry.reason + " | Risco: " + entry.risk + " | Ação: " + (entry.executable ? entry.proposedAction : "Manual");
      }).join("\n") : "- Nenhuma ação encontrada"),
      "",
      "Observações:",
      (report.notes && report.notes.length ? report.notes.map(function (note) { return "- " + note; }).join("\n") : "- Nenhum erro de leitura registrado"),
      "",
      "Última execução:",
      maintenanceState.lastResult ? "- " + maintenanceState.lastResult.affected + " registro(s) ajustado(s) em " + formatDateTime(maintenanceState.lastResult.executedAt) + "." : "- Nenhuma execução nesta sessão."
    ];
    var content = lines.join("\n");
    downloadTextFile("relatorio-manutencao-segura-banco-" + new Date().toISOString().slice(0, 10) + ".md", content, "text/markdown;charset=utf-8");
  }

  function renderEstablishments() {
    if (!$("establishmentsRows")) return;
    var query = normalizeText($("establishmentSearchInput").value).toLowerCase();
    var establishments = transferState.establishments.filter(function (item) {
      if (!query) return true;
      return [item.code, item.name, item.cnpj].join(" ").toLowerCase().indexOf(query) >= 0;
    });
    $("establishmentsRows").innerHTML = establishments.length ? establishments.map(establishmentRowHtml).join("") : "<tr><td colspan=\"5\">Nenhum estabelecimento cadastrado.</td></tr>";
  }

  function establishmentRowHtml(item) {
    return [
      "<tr>",
      "<td>" + escapeHtml(item.code) + "</td>",
      "<td>" + escapeHtml(item.name) + "</td>",
      "<td>" + escapeHtml(item.cnpj || "-") + "</td>",
      "<td><span class=\"status-badge " + (item.active ? "active" : "inactive") + "\">" + (item.active ? "Ativo" : "Inativo") + "</span></td>",
      "<td><div class=\"row-actions\"><button class=\"edit-small\" data-establishment-edit=\"" + item.id + "\" type=\"button\">Editar</button><button class=\"remove-small\" data-establishment-toggle=\"" + item.id + "\" type=\"button\">" + (item.active ? "Inativar" : "Ativar") + "</button></div></td>",
      "</tr>"
    ].join("");
  }

  function renderTransferPreview() {
    if (!$("transferPreviewRows")) return;
    var groups = transferState.previewGroups || [];
    var activeGroups = groups.filter(function (group) { return !group.skipped; });
    var totalQty = activeGroups.reduce(function (sum, group) {
      return sum + group.items.reduce(function (itemSum, item) { return itemSum + Number(item.requestedQty || 0); }, 0);
    }, 0);
    if ($("transferPreviewSummary")) {
      $("transferPreviewSummary").innerHTML = groups.length ? [
        summaryChip("Transferencias", activeGroups.length),
        summaryChip("Itens", activeGroups.reduce(function (sum, group) { return sum + group.items.length; }, 0)),
        summaryChip("Quantidade total", formatQty(totalQty)),
        summaryChip("Erros", transferState.previewErrors.length)
      ].join("") : "<div class=\"empty-state\">Nenhuma previa carregada.</div>";
    }
    if ($("transferPreviewGroups")) $("transferPreviewGroups").innerHTML = groups.length ? groups.map(transferPreviewGroupHtml).join("") : "";
    $("transferPreviewRows").innerHTML = transferState.previewItems.length ? transferState.previewItems.map(function (item) {
      var status = item.errors && item.errors.length ? item.errors.join("; ") : (item.stockAlertMessage || "OK");
      return "<tr><td>" + escapeHtml(item.sku) + "</td><td>" + escapeHtml(item.description) + "</td><td>" + formatQty(item.requestedQty) + " " + escapeHtml(item.unit || "UN") + "</td><td>" + transferStockSnapshotCell(item) + "</td><td>" + escapeHtml(transferOriginSuggestionLabel(item.originSuggested)) + "</td><td>" + escapeHtml(transferLocationLabel(item)) + "</td><td>" + escapeHtml(status) + "</td></tr>";
    }).join("") : "<tr><td colspan=\"7\">Nenhuma previa carregada.</td></tr>";
  }

  function transferPreviewGroupHtml(group) {
    var qty = group.items.reduce(function (sum, item) { return sum + Number(item.requestedQty || 0); }, 0);
    return [
      "<article class=\"transfer-preview-group" + (group.skipped ? " skipped" : "") + "\">",
      "<div>",
      "<strong>" + escapeHtml(groupRouteLabel(group)) + "</strong>",
      "<span>" + group.items.length + " item(ns) | " + formatQty(qty) + " un.</span>",
      "<span>Origem: " + escapeHtml(establishmentPreviewLabel(group.origin, group.sourceCode)) + "</span>",
      "<span>Destino: " + escapeHtml(establishmentPreviewLabel(group.destination, group.destinationCode)) + "</span>",
      group.warnings && group.warnings.length ? "<span class=\"muted\">" + escapeHtml(group.warnings.join("; ")) + "</span>" : "",
      group.errors.length ? "<span class=\"danger-text\">" + escapeHtml(group.errors.join("; ")) + "</span>" : "",
      "</div>",
      "<div class=\"transfer-preview-group-actions\">",
      "<select data-transfer-group-responsible=\"" + group.id + "\">" + transferResponsibleOptionsHtml(group.responsibleId) + "</select>",
      "<button class=\"secondary-button\" data-transfer-group-toggle=\"" + group.id + "\" type=\"button\">" + (group.skipped ? "Incluir" : "Cancelar grupo") + "</button>",
      "</div>",
      "</article>"
    ].join("");
  }

  function transferResponsibleOptionsHtml(selectedId) {
    return "<option value=\"\">Selecionar responsavel</option>" + getTaskAssignableUsers().map(function (user) {
      return "<option value=\"" + user.id + "\"" + (user.id === selectedId ? " selected" : "") + ">" + escapeHtml(user.name + " (" + user.username + ")") + "</option>";
    }).join("");
  }

  function establishmentPreviewLabel(item, fallbackCode) {
    if (!item) return formatStoreReferenceLabel(null, fallbackCode) + " (sem cadastro)";
    return formatStoreReferenceLabel(item, fallbackCode);
  }

  function transferPreviewStoreLabel(code) {
    return establishmentPreviewLabel(findTransferEstablishment(code), code);
  }

  function formatStoreReferenceLabel(item, fallbackCode) {
    var storeName = normalizeText(item && (item.name || item.code)) || normalizeText(fallbackCode) || "-";
    var codVf = normalizeText(item && item.storeCode);
    var internalCode = normalizeText(item && item.internalCode);
    var label = "COD VF " + (codVf || "-") + " - " + storeName;
    if (internalCode) label += " | CÓD " + internalCode;
    if (item && item.cnpj) label += " | " + item.cnpj;
    return label;
  }

  function formatCodVfLabel(item, fallbackCode) {
    return formatStoreReferenceLabel(item, fallbackCode);
  }

  function storeRouteName(item, fallbackCode) {
    return normalizeText(item && (item.name || item.code)) || normalizeText(fallbackCode) || "-";
  }

  function storeRouteLabelWithCodVf(item, fallbackCode, fallbackCodVf) {
    var storeName = storeRouteName(item, fallbackCode);
    var rawCodVf = normalizeText(fallbackCodVf || (item && item.storeCode));
    var reference = findStoreReference(storeName) || findStoreReference(fallbackCode) || findStoreReference(rawCodVf);
    var codVf = normalizeText(reference && reference.storeCode ? reference.storeCode : rawCodVf);
    if (codVf && codVf !== storeName) return storeName + " (" + codVf + ")";
    return storeName;
  }

  function groupRouteLabel(group) {
    return storeRouteName(group && group.origin, group && group.sourceCode) + " -> " + storeRouteLabelWithCodVf(group && group.destination, group && group.destinationCode);
  }

  function handleTransferPreviewGroupChange(event) {
    var select = event.target.closest("[data-transfer-group-responsible]");
    if (!select) return;
    var group = transferState.previewGroups.find(function (entry) { return entry.id === select.dataset.transferGroupResponsible; });
    if (group) group.responsibleId = select.value;
  }

  function handleTransferPreviewGroupClick(event) {
    var button = event.target.closest("[data-transfer-group-toggle]");
    if (!button) return;
    var group = transferState.previewGroups.find(function (entry) { return entry.id === button.dataset.transferGroupToggle; });
    if (!group) return;
    group.skipped = !group.skipped;
    renderTransferPreview();
  }

  function applyDefaultResponsibleToTransferGroups(force) {
    var responsibleId = $("transferResponsibleInput").value;
    if (!responsibleId) return;
    transferState.previewGroups.forEach(function (group) {
      if (force || !group.responsibleId) group.responsibleId = responsibleId;
    });
  }

  function renderTransferWork() {
    if (!$("transferWorkRows")) return;
    var transfer = getTransferById(transferState.activeTransferId);
    if (!transfer) {
      $("transferWorkRows").innerHTML = "";
      if ($("transferCurrentItem")) $("transferCurrentItem").innerHTML = emptyCurrentItemHtml();
      if ($("transferProductList")) $("transferProductList").innerHTML = "";
      if ($("transferStepSummary")) $("transferStepSummary").innerHTML = "";
      if ($("transferWorkGrid")) $("transferWorkGrid").hidden = false;
      if ($("transferFinalSummary")) $("transferFinalSummary").hidden = true;
      if ($("adminTransferProgressPanel")) $("adminTransferProgressPanel").hidden = true;
      if ($("transferFinalReportPanel")) $("transferFinalReportPanel").hidden = true;
      if ($("transferBoxFields")) $("transferBoxFields").hidden = true;
      if ($("transferFinalBoxesBox")) $("transferFinalBoxesBox").hidden = true;
      if ($("refreshTransferStockButton")) $("refreshTransferStockButton").hidden = true;
      clearXmlConferencePanel();
      return;
    }
    var stats = getTransferStats(transfer.id);
    var mode = getTransferWorkMode(transfer);
    transferState.activeWorkMode = mode;
    if ($("transferWorkGrid")) $("transferWorkGrid").hidden = mode === "FINALIZACAO";
    $("transferWorkSection").classList.toggle("transfer-mode-montagem", mode === "MONTAGEM");
    $("transferWorkSection").classList.toggle("transfer-mode-separacao", mode === "SEPARACAO");
    $("transferWorkSection").classList.toggle("transfer-mode-finalizacao", mode === "FINALIZACAO");
    var finalized = isFinalTransferStatus(transfer.status);
    if ($("refreshTransferStockButton")) $("refreshTransferStockButton").hidden = !isAdminOrSupervisor();
    var items = sortTransferItemsForWork(getTransferItems(transfer.id));
    var activeItem = getTransferActiveItem(items, mode);
    var selectedCandidate = items.find(function (item) { return item.id === transferState.selectedItemId; });
    if (!selectedCandidate || !isTransferItemActionable(selectedCandidate, mode)) {
      transferState.selectedItemId = activeItem ? activeItem.id : "";
    }
    var selectedForQty = items.find(function (item) { return item.id === transferState.selectedItemId; });
    if (mode === "SEPARACAO" && selectedForQty && transferState.manualSeparationQty && !$("transferQuantityInput").value) {
      $("transferQuantityInput").value = formatInputQty(Math.max(0, Number(selectedForQty.requestedQty || 0) - Number(selectedForQty.separatedQty || 0)) || Number(selectedForQty.requestedQty || 0));
    }
    $("transferWorkTitle").textContent = transferStageLabel(mode) + " - " + transferDisplayName(transfer);
    $("transferWorkSummary").innerHTML = [
      "<div><span>Rota</span><strong>" + escapeHtml(transferRouteLabel(transfer)) + "</strong></div>",
      "<div><span>Status</span><strong>" + escapeHtml(transferStatusDisplayLabel(transfer.status)) + "</strong></div>",
      "<div><span>Progresso</span><strong>" + transferProgressText(stats, mode) + "</strong></div>",
      "<div><span>Tempo</span><strong>" + formatDuration(secondsBetween(transfer.startedAt || transfer.separationStartedAt || transfer.createdAt, new Date().toISOString())) + "</strong></div>"
    ].join("");
    renderTransferStepSummary(transfer, stats, mode, items);
    renderTransferFinalSummary(transfer, stats, items, mode);
    var requiresScan = mode === "MONTAGEM";
    var allSeparated = mode === "SEPARACAO" && stats.pendingSeparation <= 0;
    var waitingPacking = mode === "MONTAGEM" && items.some(function (item) { return !item.isExtra && Number(item.packedQty || 0) < Number(item.separatedQty || 0); });
    var showFinalBoxes = !finalized && mode === "MONTAGEM";
    $("transferStepHelp").innerHTML = transferStepHelpHtml(mode);
    setTransferFieldHidden("transferScanInput", !requiresScan);
    setTransferFieldHidden("transferQuantityInput", finalized || (mode === "SEPARACAO" && !transferState.manualSeparationQty));
    $("transferQuantityInput").placeholder = mode === "MONTAGEM" && isBoxQuantityItem(selectedForQty) ? "Quantidade de caixas" : "Quantidade";
    $("startPackingButton").hidden = true;
    $("finishSeparationButton").hidden = true;
    $("finishPackingButton").hidden = finalized || mode !== "MONTAGEM";
    $("finishPackingButton").disabled = false;
    if ($("transferFinalBoxesBox")) $("transferFinalBoxesBox").hidden = !showFinalBoxes;
    if (!showFinalBoxes && $("transferFinalBoxesInput")) $("transferFinalBoxesInput").value = "";
    $("confirmTransferItemButton").hidden = finalized || (mode === "SEPARACAO" && !transferState.manualSeparationQty);
    $("confirmTransferItemButton").textContent = mode === "SEPARACAO" ? "Confirmar quantidade diferente" : mode === "MONTAGEM" ? "Confirmar item na caixa" : "Atualizar item";
    $("transferScanInput").disabled = finalized || !requiresScan;
    $("transferQuantityInput").disabled = finalized;
    renderTransferBoxFields();
    $("confirmCurrentCollectButton").hidden = finalized || mode !== "SEPARACAO" || allSeparated;
    $("differentSeparationQtyButton").hidden = finalized || mode !== "SEPARACAO" || allSeparated;
    $("finishSeparationReadyButton").hidden = finalized || mode !== "SEPARACAO" || !allSeparated;
    $("separationPendingHint").hidden = finalized || mode !== "SEPARACAO" || allSeparated;
    $("separationPendingHint").textContent = !allSeparated && mode === "SEPARACAO" ? "Finalize todos os itens para concluir a separação." : "";
    $("separationPendingHint").className = "inline-status warning";
    $("transferCompletionActions").hidden = finalized || mode === "FINALIZACAO";
    if ($("transferCompletionHint")) {
      $("transferCompletionHint").hidden = finalized || (mode === "SEPARACAO" ? allSeparated : !waitingPacking);
      $("transferCompletionHint").textContent = mode === "SEPARACAO" && !allSeparated ? "Finalize todos os itens para concluir a separacao." : mode === "MONTAGEM" && waitingPacking ? "Existem itens faltando na caixa. Voce pode finalizar com divergencia." : "";
      $("transferCompletionHint").className = "inline-status warning";
    }
    $("transferStepHelp").parentElement.hidden = mode === "SEPARACAO" && !transferState.manualSeparationQty;
    setTransferFieldHidden("sealNumberInput", true);
    setTransferFieldHidden("boxIdInput", true);
    $("transferWorkRows").textContent = items.length ? items.map(function (item) { return item.sku; }).join(",") : "";
    renderTransferProductList(items);
    renderCurrentTransferItem();
    renderAdminTransferProgress(transfer, mode);
    renderTransferFinalReport(transfer);
  }

  function renderTransferProductList(items) {
    if (!$("transferProductList")) return;
    if (!items.length) {
      $("transferProductList").innerHTML = "";
      return;
    }
    var mode = transferState.activeWorkMode;
    var pending = items.filter(function (item) { return isTransferItemPendingForMode(item, mode); });
    var done = items.filter(function (item) { return !isTransferItemPendingForMode(item, mode); });
    $("transferProductList").innerHTML = [
      transferWorkSectionHtml(mode === "MONTAGEM" ? "Itens faltando colocar na caixa" : "Itens pendentes", pending, mode, false),
      transferWorkSectionHtml(mode === "MONTAGEM" ? "Itens já colocados na caixa" : "Itens separados", done, mode, true)
    ].join("");
  }

  function isTransferItemPendingForMode(item, mode) {
    if (mode === "SEPARACAO" && isTransferItemSeparationClosed(item)) return false;
    if (isTransferItemNotSent(item)) return false;
    if (mode === "MONTAGEM") return !item.isExtra && Number(item.packedQty || 0) < Number(item.separatedQty || 0);
    if (mode === "FINALIZACAO") return false;
    return !item.isExtra && Number(item.separatedQty || 0) < Number(item.requestedQty || 0);
  }

  function transferWorkSectionHtml(title, items, mode, done) {
    return [
      "<section class=\"transfer-work-list-section" + (done ? " done" : " pending") + "\">",
      "<div class=\"transfer-list-heading\"><strong>" + escapeHtml(title) + "</strong><span>" + items.length + " item(ns)</span></div>",
      items.length ? items.map(function (item) { return transferWorkItemCardHtml(item); }).join("") : "<div class=\"empty-state compact\">Nenhum item nesta etapa.</div>",
      "</section>"
    ].join("");
  }

  function getTransferWorkMode(transfer) {
    if (!transfer) return "SEPARACAO";
    if (isFinalTransferStatus(transfer.status) || ["LACRE_CONCLUIDO", "MONTAGEM_CAIXA_CONCLUIDA"].indexOf(transfer.status) >= 0) return "FINALIZACAO";
    if (["SEPARACAO_CONCLUIDA", "EM_LACRE", "EM_MONTAGEM_CAIXA", "CORRECAO_SOLICITADA", "EM_CORRECAO"].indexOf(transfer.status) >= 0) return "MONTAGEM";
    return "SEPARACAO";
  }

  function canStartTransferSeparation(transfer) {
    return transfer && ["PENDENTE", "ATRIBUIDA", "AGUARDANDO_SEPARACAO"].indexOf(transfer.status) >= 0;
  }

  function transferStageLabel(mode) {
    if (mode === "MONTAGEM") return "Montagem da Caixa";
    if (mode === "FINALIZACAO") return "Finalização";
    return "Separação";
  }

  function transferRouteLabel(transfer) {
    return transferRouteOriginLabel(transfer) + " -> " + transferRouteDestinationLabel(transfer);
  }

  function transferDisplayName(transfer) {
    if (!transfer) return "-";
    var current = normalizeText(transfer.name || transfer.code);
    if (current && /\(\s*\d+\s*\)/.test(current)) return current;
    if (transfer.originName || transfer.originStoreCode || transfer.destinationName || transfer.destinationStoreCode || transfer.establishmentName) {
      var dateMatch = current.match(/\s-\s(\d{2}\/\d{2}\/\d{4})$/);
      return transferRouteLabel(transfer) + (dateMatch ? " - " + dateMatch[1] : "");
    }
    return current || "-";
  }

  function transferRouteOriginLabel(transfer) {
    return normalizeText(transfer && (transfer.originName || transfer.originStoreCode)) || "-";
  }

  function transferRouteDestinationLabel(transfer) {
    if (!transfer) return "-";
    return storeRouteLabelWithCodVf({
      name: transfer.destinationName || transfer.establishmentName || "",
      code: transfer.destinationName || transfer.establishmentName || transfer.destinationStoreCode || transfer.establishmentCode || "",
      storeCode: transfer.destinationStoreCode || transfer.establishmentCode || ""
    }, transfer.destinationName || transfer.establishmentName || transfer.destinationStoreCode || transfer.establishmentCode || "-");
  }

  function transferProgressText(stats, mode) {
    if (mode === "MONTAGEM") return stats.packedItems + " de " + stats.totalItems + " itens na caixa";
    if (mode === "FINALIZACAO") return stats.packedItems + " de " + stats.totalItems + " itens enviados";
    return stats.separatedItems + " de " + stats.totalItems + " itens separados";
  }

  function transferStatusDisplayLabel(status) {
    var labels = {
      ATRIBUIDA: "Atribuída",
      PENDENTE: "Pendente",
      AGUARDANDO_SEPARACAO: "Aguardando separacao",
      EM_SEPARACAO: "Em separação",
      SEPARACAO_CONCLUIDA: "Separação concluída",
      EM_LACRE: "Em montagem",
      EM_MONTAGEM_CAIXA: "Em montagem",
      CORRECAO_SOLICITADA: "Revalidar montagem",
      EM_CORRECAO: "Em revalidação",
      CORRECAO_CONCLUIDA: "Revalidada",
      LACRE_CONCLUIDO: "Montagem concluída",
      MONTAGEM_CAIXA_CONCLUIDA: "Montagem concluída",
      PRONTA_PARA_NOTA: "Pronta para nota",
      PRONTA_PARA_NOTA_COM_DIVERGENCIA: "Com divergência",
      FINALIZADA_PARA_ANALISE: "Para análise",
      CONCLUIDA_SEM_DIVERGENCIA: "Concluída OK",
      CONCLUIDA_COM_DIVERGENCIA: "Com divergência",
      UNIFICADA: "Unificada",
      ARQUIVADA_POR_UNIFICACAO: "Arquivada por unificacao",
      CANCELADA: "Cancelada",
      CORRETA: "Correta",
      PARA_ANALISE: "Para análise"
    };
    return labels[status] || String(status || "-").replace(/_/g, " ");
  }

  function sortTransferItemsForWork(items) {
    return items.slice().sort(function (a, b) {
      return transferLocationSortKey(a).localeCompare(transferLocationSortKey(b), "pt-BR", { numeric: true, sensitivity: "base" })
        || String(a.sku || "").localeCompare(String(b.sku || ""), "pt-BR", { numeric: true, sensitivity: "base" });
    });
  }

  function transferLocationSortKey(item) {
    if (item.isExtra) return "9|EXTRA|" + (item.sku || "");
    var status = transferLocationStatus(item);
    if (!status.hasLocation) return "8|SEM|" + (item.sku || "");
    return ["0", normalizeLocationPart(status.rua), normalizeLocationPart(status.rack), normalizeLocationPart(status.linha), normalizeLocationPart(status.letra), status.code || ""].join("|");
  }

  function normalizeLocationPart(value) {
    var text = normalizeText(value).toUpperCase();
    var number = text.match(/\d+/);
    var letters = text.replace(/\d+/g, "");
    return (number ? number[0].padStart(5, "0") : "99999") + letters;
  }

  function getTransferActiveItem(items, mode) {
    var selected = transferState.items.find(function (entry) { return entry.id === transferState.selectedItemId; });
    if (selected && items.some(function (item) { return item.id === selected.id; })) {
      if (isTransferItemActionable(selected, mode)) return selected;
    }
    if (mode === "MONTAGEM") {
      return items.find(function (item) { return !item.isExtra && !isTransferItemNotSent(item) && Number(item.packedQty || 0) < Number(item.separatedQty || 0); })
        || null;
    }
    if (mode === "FINALIZACAO") return items[0] || null;
    return items.find(function (item) { return !item.isExtra && !isTransferItemSeparationClosed(item) && Number(item.separatedQty || 0) < Number(item.requestedQty || 0); }) || null;
  }

  function isTransferItemActionable(item, mode) {
    if (!item) return false;
    if (mode === "FINALIZACAO") return true;
    if (isTransferItemNotSent(item)) return false;
    if (mode === "MONTAGEM") return Number(item.packedQty || 0) < Number(item.separatedQty || 0);
    return !isTransferItemSeparationClosed(item) && Number(item.separatedQty || 0) < Number(item.requestedQty || 0);
  }

  function isTransferItemNotSent(item) {
    var status = normalizeText(item && item.status).toUpperCase();
    return ["FALTA_TOTAL", "NAO_ATENDIDO", "PENDENTE_NAO_ATENDIDO"].indexOf(status) >= 0;
  }

  function isTransferItemSeparationClosed(item) {
    if (isTransferItemNotSent(item)) return true;
    var status = normalizeText(item && (item.statusOperational || item.status)).toUpperCase();
    var requested = Math.max(0, Number(item && item.requestedQty || 0));
    var separated = Math.max(0, Number(item && item.separatedQty || 0));
    var missing = Math.max(0, Number(item && item.missingQty || 0));
    var hasOperationalMissingReason = Boolean(item && (item.pendingReason || item.pendingObservation));
    if (requested <= 0) return true;
    if (separated >= requested) return true;
    if (["SEPARADO", "SEPARADO_COM_DIVERGENCIA", "ENVIADO", "ENVIADO_PARCIAL", "ENVIADO_COM_DIVERGENCIA", "CONCLUIDO"].indexOf(status) >= 0) {
      return separated > 0 || (missing >= requested && hasOperationalMissingReason);
    }
    if (item && item.divergenceType) return separated > 0 || (missing >= requested && hasOperationalMissingReason);
    return false;
  }

  function isBoxQuantityItem(item) {
    return item && (normalizeText(item.quantityType || "").toUpperCase() === "CAIXA" || isBoxUnit(item.unit));
  }

  function getTransferExpectedUnits(item) {
    if (!isBoxQuantityItem(item)) return Number(item.requestedQty || 0);
    var boxQty = Number(item.requestedQty || item.boxQty || 0);
    var stored = Number(item.totalUnits || 0);
    if (stored > 0 && Number(item.unitsPerBox || 0) > 0) return stored;
    if (boxQty > 0 && Number(item.unitsPerBox || 0) > 0) return boxQty * Number(item.unitsPerBox || 0);
    return boxQty || stored || 0;
  }

  function getTransferPackedUnits(item) {
    if (!isBoxQuantityItem(item)) return Number(item.packedQty || 0);
    var stored = Number(item.packedUnits || 0);
    if (stored > 0) return stored;
    if (Number(item.packedQty || 0) > 0 && Number(item.unitsPerBox || 0) > 0) return Number(item.packedQty || 0) * Number(item.unitsPerBox || 0);
    return Number(item.packedQty || 0);
  }

  function hasTransferBoxConversion(item) {
    return isBoxQuantityItem(item) && Number(item.unitsPerBox || 0) > 0;
  }

  function formatTransferComparableQty(item, qty) {
    var unit = isBoxQuantityItem(item) && !hasTransferBoxConversion(item) ? "CX" : "UN";
    return formatQty(qty) + " " + escapeHtml(unit);
  }

  function formatTransferExpectedLabel(item) {
    if (!isBoxQuantityItem(item)) return formatQty(item.requestedQty) + " " + escapeHtml(item.unit || "UN");
    return formatQty(item.boxQty || item.requestedQty) + " " + escapeHtml(item.unit || "CX");
  }

  function formatTransferPackedLabel(item) {
    if (!isBoxQuantityItem(item)) return formatQty(item.packedQty) + " " + escapeHtml(item.unit || "UN");
    var parts = [formatQty(item.packedQty) + " CX"];
    var packedUnits = getTransferPackedUnits(item);
    if (packedUnits && hasTransferBoxConversion(item)) parts.push(formatQty(packedUnits) + " UN");
    return parts.join(" / ");
  }

  function formatTransferTotalExpectedLabel(item) {
    if (!isBoxQuantityItem(item)) return formatQty(getTransferExpectedUnits(item)) + " UN";
    return hasTransferBoxConversion(item) ? formatQty(getTransferExpectedUnits(item)) + " UN" : formatQty(getTransferExpectedUnits(item)) + " CX";
  }

  function itemQtyNumbers(item) {
    var requested = Number(item.requestedQty || 0);
    var separated = Number(item.separatedQty || 0);
    var packed = Number(item.packedQty || 0);
    var expectedUnits = getTransferExpectedUnits(item);
    var packedUnits = getTransferPackedUnits(item);
    return {
      requested: requested,
      separated: separated,
      pendingSeparation: Math.max(0, requested - separated),
      packed: packed,
      pendingPacking: Math.max(0, separated - packed),
      expectedUnits: expectedUnits,
      packedUnits: packedUnits,
      pendingUnits: Math.max(0, expectedUnits - packedUnits)
    };
  }

  function transferOperationalStatusForItem(item) {
    if (!item) return "PENDENTE";
    if (item.isExtra) return "EXTRA";
    if (isTransferItemNotSent(item)) return "SEPARADO";
    var qty = itemQtyNumbers(item);
    if (qty.packed > 0 || ["ENVIADO", "ENVIADO_PARCIAL", "ENVIADO_COM_DIVERGENCIA"].indexOf(normalizeText(item.status).toUpperCase()) >= 0) return "ENVIADO";
    if (qty.separated > 0 || isTransferItemSeparationClosed(item)) return "SEPARADO";
    return "PENDENTE";
  }

  function transferDivergenceStatusForItem(item) {
    if (!item) return "SEM_DIVERGENCIA";
    if (item.isExtra) return "EXTRA";
    var qty = itemQtyNumbers(item);
    if (isTransferItemNotSent(item)) return "FALTA_TOTAL";
    if (Number(item.excessQty || 0) > 0 || qty.separated > qty.requested || qty.packed > Math.max(qty.separated, qty.requested)) return "EXCESSO";
    if (Number(item.missingQty || 0) >= qty.requested && qty.requested > 0 && qty.separated <= 0) return "FALTA_TOTAL";
    if (Number(item.missingQty || 0) > 0 || (qty.separated > 0 && qty.separated < qty.requested) || (qty.packed > 0 && qty.packed < qty.separated)) return "PARCIAL";
    if (item.divergenceType) return "COM_DIVERGENCIA";
    return "SEM_DIVERGENCIA";
  }

  function getTransferItemCheckedQty(item) {
    return isBoxQuantityItem(item) ? getTransferPackedUnits(item) : Number(item.packedQty || item.separatedQty || 0);
  }

  function getTransferItemDifferenceForDb(item) {
    return getTransferItemCheckedQty(item) - getTransferExpectedUnits(item);
  }

  function transferItemStatusLabel(item) {
    if (item.isExtra) return "EXTRA";
    var qty = itemQtyNumbers(item);
    if (isTransferItemNotSent(item)) return "NAO_ATENDIDO";
    if (item.divergenceType || qty.separated > qty.requested || qty.packed > qty.separated) return "DIVERGENTE";
    if (qty.packed >= qty.separated && qty.separated > 0 && qty.separated >= qty.requested) return "ENVIADO";
    if (qty.separated >= qty.requested) return "SEPARADO";
    if (qty.separated > 0) return "PARCIAL";
    return "PENDENTE";
  }

  function displayTransferStatusLabel(value) {
    var labels = {
      PENDENTE: "Pendente",
      SEPARADO: "Separado",
      PARCIAL: "Parcial",
      SEPARADO_COM_DIVERGENCIA: "Separado com divergencia",
      EM_CAIXA: "Em caixa",
      ENVIADO: "Enviado",
      ENVIADO_PARCIAL: "Enviado parcial",
      ENVIADO_COM_DIVERGENCIA: "Enviado com divergencia",
      NAO_ATENDIDO: "Nao atendido",
      FALTA_TOTAL: "Falta total",
      DIVERGENTE: "Divergente",
      EXTRA: "Extra"
    };
    return labels[value] || String(value || "-").toLowerCase().replace(/_/g, " ").replace(/^\w/, function (letter) { return letter.toUpperCase(); });
  }

  function transferWorkItemCardHtml(item) {
    var qty = itemQtyNumbers(item);
    var selected = item.id === transferState.selectedItemId;
    var mode = transferState.activeWorkMode;
    var statusKey = transferItemStatusLabel(item);
    var statusLabel = displayTransferStatusLabel(statusKey);
    var itemClass = "transfer-work-item status-" + String(statusKey || "PENDENTE").toLowerCase().replace(/_/g, "-") + (selected ? " selected" : "");
    var productName = shortProductName(item.description || "");
    var boxInfo = isBoxQuantityItem(item) ? "<span>Un/CX <b>" + (Number(item.unitsPerBox || 0) > 0 ? formatQty(item.unitsPerBox) : "-") + "</b></span><span>Total UN <b>" + (Number(qty.expectedUnits || 0) > 0 ? formatQty(qty.expectedUnits) : "-") + "</b></span>" : "";
    var stockGuidance = mode === "MONTAGEM" ? "" : transferStockGuidanceHtml(item, "compact");
    var qtyRows = mode === "MONTAGEM" ? [
      "<span>Solicitado <b>" + formatQty(qty.requested) + " " + escapeHtml(item.unit || "UN") + "</b></span>",
      "<span>Separado <b>" + formatQty(qty.separated) + "</b></span>",
      "<span>Na caixa <b>" + formatQty(qty.packed) + "</b></span>",
      "<span>Restante <b>" + formatQty(qty.pendingPacking) + "</b></span>",
      boxInfo
    ].join("") : [
      "<span>Solicitado <b>" + formatQty(qty.requested) + " " + escapeHtml(item.unit || "UN") + "</b></span>",
      "<span>Separado <b>" + formatQty(qty.separated) + "</b></span>",
      "<span>Pendente <b>" + formatQty(qty.pendingSeparation) + "</b></span>",
      "<span>Status <b>" + escapeHtml(displayTransferStatusLabel(transferItemStatusLabel(item))) + "</b></span>"
    ].join("");
    return [
      "<article class=\"" + itemClass + "\" data-transfer-work-item=\"" + item.id + "\">",
      "<div class=\"transfer-work-item-head\"><strong>SKU " + escapeHtml(item.sku || "-") + "</strong><span>" + escapeHtml(statusLabel) + "</span></div>",
      productName ? "<p>" + escapeHtml(productName) + "</p>" : "",
      "<div class=\"transfer-qty-row\">",
      qtyRows,
      "</div>",
      mode === "MONTAGEM" ? "" : "<small>" + escapeHtml(transferCompactLocationLabel(item)) + "</small>",
      stockGuidance,
      transferWorkItemActionsHtml(item, mode),
      "</article>"
    ].join("");
  }

  function transferStockGuidanceHtml(item, variant) {
    if (!item || (!item.originSuggested && !item.stockAlertMessage && !transferCaptureLocationCode(item))) return "";
    var origin = transferOriginSuggestionLabel(item.originSuggested);
    var originResolved = ["CAPTACAO", "LOJA", "CAPTACAO_E_LOJA", "LOJA_E_CAPTACAO"].indexOf(item.originSuggested) >= 0;
    var tone = originResolved && !item.stockAlert ? "ok" : item.originSuggested === "VERIFICAR" || item.originSuggested === "SEM_SALDO" || item.originSuggested === "SEM_SALDO_CAPTACAO" || item.originSuggested === "NAO_ENCONTRADO_CAPTACAO" || Number(item.quantityShortage || 0) > 0 ? "danger" : "warning";
    var captureLocation = transferCaptureLocationCode(item) || "-";
    return [
      "<div class=\"transfer-stock-guidance " + escapeHtml(tone) + (variant ? " " + escapeHtml(variant) : "") + "\">",
      "<strong>Retirar: " + escapeHtml(origin) + "</strong>",
      "<span>Retirar captação " + formatQty(item.suggestedCaptureQty || 0) + " | retirar loja " + formatQty(item.suggestedStoreQty || 0) + " | faltante " + formatQty(item.quantityShortage || 0) + "</span>",
      "<span>Saldo loja " + transferStockValueLabel(item.storeAvailable, null) + "</span>",
      "<span>Saldo captação " + transferStockValueLabel(item.captureAvailable, item) + "</span>",
      "<span>Local CAPTACAO: " + escapeHtml(captureLocation) + "</span>",
      item.stockAlertMessage ? "<em>" + escapeHtml(item.stockAlertMessage) + "</em>" : "",
      "</div>"
    ].join("");
  }

  function transferWorkItemActionsHtml(item, mode) {
    var transfer = getTransferById(item.transferId);
    if (!transfer || isFinalTransferStatus(transfer.status) || item.isExtra) return "";
    if (mode === "SEPARACAO" && Number(item.separatedQty || 0) > 0) {
      return [
        "<div class=\"transfer-card-actions\">",
        "<button class=\"secondary-button\" data-transfer-edit-collection=\"" + item.id + "\" type=\"button\">Editar coleta</button>",
        "<button class=\"remove-small\" data-transfer-undo-collection=\"" + item.id + "\" type=\"button\">Desfazer coleta</button>",
        "</div>"
      ].join("");
    }
    if (mode === "MONTAGEM" && Number(item.packedQty || 0) > 0) {
      return [
        "<div class=\"transfer-card-actions\">",
        "<button class=\"secondary-button\" data-transfer-edit-pack=\"" + item.id + "\" type=\"button\">Editar quantidade</button>",
        "<button class=\"remove-small\" data-transfer-remove-pack=\"" + item.id + "\" type=\"button\">Remover da caixa</button>",
        "</div>"
      ].join("");
    }
    return "";
  }

  function shortProductName(value) {
    var text = normalizeText(value);
    return text.length > 72 ? text.slice(0, 69) + "..." : text;
  }

  function transferCompactLocationLabel(item) {
    var status = transferLocationStatus(item);
    return status.hasLocation ? "Endereço: " + (status.code || [status.rua, status.rack, status.linha, status.letra].filter(Boolean).join("-")) : "Sem localização cadastrada.";
  }

  function renderTransferStepSummary(transfer, stats, mode, items) {
    if (!$("transferStepSummary")) return;
    var nextItem = getTransferActiveItem(items, mode);
    var mergedSourceText = transfer.isMerged && transfer.mergedFromIds.length ? transfer.mergedFromIds.map(function (id) {
      var source = getTransferById(id);
      return source ? (source.code || source.name || id) : id;
    }).join(" | ") : "";
    $("transferStepSummary").innerHTML = [
      "<div class=\"step-pill active\"><span>1</span><strong>Separação</strong></div>",
      "<div class=\"step-pill" + (mode === "MONTAGEM" || mode === "FINALIZACAO" ? " active" : "") + "\"><span>2</span><strong>Montagem</strong></div>",
      "<div class=\"step-pill" + (mode === "FINALIZACAO" ? " active" : "") + "\"><span>3</span><strong>Finalização</strong></div>",
      nextItem ? "<div class=\"step-next\"><span>Próximo</span><strong>" + escapeHtml(nextItem.sku || "-") + "</strong></div>" : ""
    ].join("");
    if (mergedSourceText) {
      var mergedSource = document.createElement("div");
      mergedSource.className = "step-next merge-source";
      var mergedLabel = document.createElement("span");
      mergedLabel.textContent = "Origem da unificacao";
      var mergedValue = document.createElement("strong");
      mergedValue.textContent = mergedSourceText;
      mergedSource.append(mergedLabel, mergedValue);
      $("transferStepSummary").appendChild(mergedSource);
    }
  }

  function transferStepHelpHtml(mode) {
    if (mode === "MONTAGEM") return "<strong>Montagem da caixa</strong><span>Bipe o SKU, informe a quantidade colocada na caixa e confirme.</span>";
    if (mode === "FINALIZACAO") return "<strong>Finalização</strong><span>Revise o resumo e finalize para o líder montar a nota.</span>";
    return "<strong>Separação</strong><span>Confira o item em destaque, ajuste a quantidade se precisar e marque como separado. Bipagem não é obrigatória nesta etapa.</span>";
  }

  function renderTransferFinalSummary(transfer, stats, items, mode) {
    if (!$("transferFinalSummary")) return;
    var noLocation = items.filter(function (item) { return !transferLocationStatus(item).hasLocation; }).length;
    var correct = items.filter(function (item) {
      return !item.isExtra && Number(item.packedQty || 0) === Number(item.requestedQty || 0) && !item.divergenceType;
    }).length;
    var divergent = countTransferDivergences(transfer.id);
    $("transferFinalSummary").hidden = mode === "SEPARACAO";
    $("transferFinalSummary").innerHTML = [
      summaryChip("Total solicitado", formatQty(stats.requested)),
      summaryChip("Total separado", formatQty(stats.separated)),
      summaryChip("Total na caixa", formatQty(stats.packed)),
      summaryChip("Itens corretos", correct, "result-ok"),
      summaryChip("Divergências", divergent, divergent ? "result-changed" : "result-ok"),
      summaryChip("Sem localização", noLocation, noLocation ? "result-missing" : "result-ok"),
      summaryChip("Tempo total", formatDuration(secondsBetween(transfer.startedAt || transfer.createdAt, new Date().toISOString()))),
      summaryChip("Responsável", transfer.responsibleName || "-")
    ].join("");
  }

  function handleTransferWorkListClick(event) {
    var actionButton = event.target.closest("button");
    if (actionButton) {
      if (actionButton.dataset.transferEditCollection) {
        editTransferItemQuantity(actionButton.dataset.transferEditCollection, "SEPARACAO", actionButton);
        return;
      }
      if (actionButton.dataset.transferUndoCollection) {
        resetTransferItemQuantity(actionButton.dataset.transferUndoCollection, "SEPARACAO", actionButton);
        return;
      }
      if (actionButton.dataset.transferEditPack) {
        editTransferItemQuantity(actionButton.dataset.transferEditPack, "MONTAGEM", actionButton);
        return;
      }
      if (actionButton.dataset.transferRemovePack) {
        resetTransferItemQuantity(actionButton.dataset.transferRemovePack, "MONTAGEM", actionButton);
        return;
      }
    }
    var card = event.target.closest("[data-transfer-work-item]");
    if (!card) return;
    transferState.selectedItemId = card.dataset.transferWorkItem;
    var item = transferState.items.find(function (entry) { return entry.id === transferState.selectedItemId; });
    if (item && transferState.activeWorkMode === "SEPARACAO") {
      transferState.manualSeparationQty = false;
      $("transferQuantityInput").value = "";
    }
    renderTransferWork();
  }

  async function editTransferItemQuantity(itemId, mode, button) {
    var item = transferState.items.find(function (entry) { return entry.id === itemId; });
    var transfer = item ? getTransferById(item.transferId) : null;
    if (!item || !transfer || isFinalTransferStatus(transfer.status)) return;
    var current = mode === "MONTAGEM" ? Number(item.packedQty || 0) : Number(item.separatedQty || 0);
    var label = mode === "MONTAGEM" ? "Quantidade na caixa" : "Quantidade separada";
    var value = window.prompt(label + " para o SKU " + item.sku + ":", formatInputQty(current));
    if (value === null) return;
    var qty = parseQuantity(value);
    if (qty < 0 || !Number.isFinite(qty)) {
      setStatus("transferWorkStatus", "Informe uma quantidade valida.", "error");
      return;
    }
    await saveTransferItemOperationalQty(item, transfer, mode, qty, button);
  }

  async function resetTransferItemQuantity(itemId, mode, button) {
    var item = transferState.items.find(function (entry) { return entry.id === itemId; });
    var transfer = item ? getTransferById(item.transferId) : null;
    if (!item || !transfer || isFinalTransferStatus(transfer.status)) return;
    var message = mode === "MONTAGEM" ? "Remover este SKU da caixa?" : "Desfazer a coleta deste SKU?";
    if (!window.confirm(message)) return;
    await saveTransferItemOperationalQty(item, transfer, mode, 0, button);
  }

  async function saveTransferItemOperationalQty(item, transfer, mode, qty, button) {
    var actionKey = "edit-transfer-item:" + item.id + ":" + mode;
    if (!beginTransferAction(actionKey, button, "Salvando...")) return;
    try {
      var now = new Date().toISOString();
      var update = { updated_at: now };
      if (mode === "MONTAGEM") {
        item.packedQty = qty;
        if (isBoxQuantityItem(item)) {
          item.packedUnits = qty > 0 && Number(item.unitsPerBox || 0) > 0 ? qty * Number(item.unitsPerBox || 0) : qty;
          item.totalUnits = Number(item.unitsPerBox || 0) > 0 ? Number(item.boxQty || item.requestedQty || 0) * Number(item.unitsPerBox || 0) : Number(item.requestedQty || item.boxQty || 0);
          if (qty <= 0) item.packagingObservation = "";
        }
        item.excessQty = Math.max(0, qty - Number(item.separatedQty || 0));
        item.divergenceType = item.excessQty > 0 ? "QUANTIDADE_EXCEDENTE" : "";
        item.status = qty <= 0 ? (Number(item.separatedQty || 0) > 0 ? "SEPARADO" : "PENDENTE") : qty >= Number(item.separatedQty || 0) ? "ENVIADO" : "EM_CAIXA";
        update.quantidade_lacrada = item.packedQty;
        update.quantidade_lacrada_unidades = item.packedUnits || 0;
        update.quantidade_total_unidades = getTransferExpectedUnits(item);
        update.embalagem_observacao = item.packagingObservation || "";
      } else {
        item.separatedQty = qty;
        if (Number(item.packedQty || 0) > qty) item.packedQty = qty;
        if (isBoxQuantityItem(item) && Number(item.unitsPerBox || 0) > 0) item.packedUnits = Number(item.packedQty || 0) * Number(item.unitsPerBox || 0);
        item.missingQty = Math.max(0, Number(item.requestedQty || 0) - qty);
        item.excessQty = Math.max(0, qty - Number(item.requestedQty || 0));
        item.divergenceType = item.excessQty > 0 ? "QUANTIDADE_EXCEDENTE" : "";
        item.status = qty <= 0 ? "PENDENTE" : qty >= Number(item.requestedQty || 0) ? "SEPARADO" : "PARCIAL";
        update.quantidade_separada = item.separatedQty;
        update.quantidade_lacrada = item.packedQty;
        update.quantidade_lacrada_unidades = item.packedUnits || 0;
      }
      Object.assign(update, {
        quantidade_faltante: item.missingQty || 0,
        quantidade_excedente: item.excessQty || 0,
        divergence_type: item.divergenceType || "",
        status: item.status
      }, transferItemAuditDbFields(item));
      var response = await updateRowWithSchemaFallback("wms_transfer_items", "id", item.id, update);
      if (response.error) throw response.error;
      invalidateTransferStatsCache();
      await persistTransferLightSummary(transfer, mode === "MONTAGEM" ? "ITEM_PACKED" : "ITEM_SEPARATED", { sku: item.sku });
      await loadTransferData();
      transferState.activeTransferId = transfer.id;
      transferState.activeWorkMode = mode;
      transferState.manualSeparationQty = false;
      clearTransferInputs();
      renderTransfers();
      setStatus("transferWorkStatus", "Ajuste salvo.", "success");
    } catch (error) {
      setStatus("transferWorkStatus", "Erro ao salvar ajuste: " + formatSupabaseError(error), "error");
    } finally {
      endTransferAction(button);
    }
  }

  async function confirmCurrentCollect() {
    var transfer = getTransferById(transferState.activeTransferId);
    if (!transfer || transferState.activeWorkMode !== "SEPARACAO") return;
    var items = sortTransferItemsForWork(getTransferItems(transfer.id));
    var item = getTransferActiveItem(items, "SEPARACAO");
    if (!item) {
      setStatus("transferWorkStatus", "Todos os itens já foram coletados.", "success");
      renderTransferWork();
      return;
    }
    transferState.selectedItemId = item.id;
    transferState.manualSeparationQty = false;
    $("transferQuantityInput").value = "";
    await confirmTransferItem();
  }

  function showManualSeparationQty() {
    var item = transferState.items.find(function (entry) { return entry.id === transferState.selectedItemId; });
    if (!item) return;
    transferState.manualSeparationQty = true;
    $("transferQuantityInput").value = formatInputQty(Math.max(0, Number(item.requestedQty || 0) - Number(item.separatedQty || 0)) || Number(item.requestedQty || 0));
    renderTransferWork();
    $("transferQuantityInput").focus();
  }

  function formatInputQty(value) {
    var number = Number(value || 0);
    return number ? String(number).replace(".", ",") : "";
  }

  function transferQtyResult(expectedQty, checkedQty, item) {
    expectedQty = Number(expectedQty || 0);
    checkedQty = Number(checkedQty || 0);
    var diff = checkedQty - expectedQty;
    if (item && item.isExtra) return { key: "extra", label: "Extra", diff: diff };
    if (expectedQty > 0 && checkedQty <= 0) return { key: "not-picked", label: "Não pego", diff: diff };
    if (expectedQty <= 0 && checkedQty <= 0) return { key: "not-picked", label: "Sem quantidade", diff: diff };
    if (diff < 0) return { key: "missing", label: "Faltando", diff: diff };
    if (diff > 0) return { key: "excess", label: "Sobrando", diff: diff };
    if (item && item.divergenceType) return { key: "changed", label: "Alterado", diff: diff };
    return { key: "ok", label: "OK - pego", diff: diff };
  }

  function readTransferBoxPackingInput(item, boxQty) {
    if (!isBoxQuantityItem(item)) {
      return { valid: true, packedUnitsDelta: boxQty, unitsPerBox: 0, totalUnits: boxQty, observation: "" };
    }
    var mixed = $("transferMixedBoxInput").checked;
    var unitsPerBox = parseQuantity($("transferUnitsPerBoxInput").value);
    var totalUnits = mixed ? parseQuantity($("transferTotalUnitsInput").value) : boxQty * unitsPerBox;
    if (!mixed && (!unitsPerBox || unitsPerBox <= 0)) {
      return { valid: false, message: "Informe quantas unidades vêm em cada caixa para continuar.", focusId: "transferUnitsPerBoxInput" };
    }
    if (mixed && (!totalUnits || totalUnits <= 0)) {
      return { valid: false, message: "Informe o total em unidades para continuar.", focusId: "transferTotalUnitsInput" };
    }
    var referenceUnitsPerBox = Number(item.unitsPerBox || 0);
    var expectedByPattern = referenceUnitsPerBox > 0 ? boxQty * referenceUnitsPerBox : (!mixed ? totalUnits : 0);
    return {
      valid: true,
      mixed: mixed,
      unitsPerBox: mixed ? 0 : unitsPerBox,
      totalUnits: totalUnits,
      packedUnitsDelta: totalUnits,
      expectedByPattern: expectedByPattern,
      observation: mixed ? "Caixas com quantidades diferentes" : ""
    };
  }

  async function saveProductPackagingPattern(item) {
    if (!isSupabaseReady() || !isBoxQuantityItem(item) || !Number(item.unitsPerBox || 0)) return;
    var now = new Date().toISOString();
    var row = {
      id: "pkg-" + normalizeSku(item.sku),
      sku: item.sku || "",
      descricao: item.description || "",
      unidades_por_caixa: Number(item.unitsPerBox || 0),
      updated_at: now,
      updated_by: authState.currentUser ? authState.currentUser.name : ""
    };
    var response = await supabaseDb.from("wms_product_packaging").upsert(row, { onConflict: "id" });
    if (response.error && !isMissingTransferTableError(response.error) && !isMissingColumnError(response.error)) {
      console.warn("Nao foi possivel salvar padrao de embalagem:", response.error);
    }
    transferState.productPackaging[normalizeSkuKey(item.sku)] = fromDbProductPackaging(row);
  }

  function getProductPackagingPattern(sku) {
    return transferState.productPackaging[normalizeSkuKey(sku)] || null;
  }

  function applyKnownPackagingPattern(item) {
    if (!isBoxQuantityItem(item) || Number(item.unitsPerBox || 0) > 0) return false;
    var pattern = getProductPackagingPattern(item.sku);
    if (!pattern || Number(pattern.unitsPerBox || 0) <= 0) return false;
    item.unitsPerBox = Number(pattern.unitsPerBox || 0);
    item.totalUnits = Number(item.boxQty || item.requestedQty || 0) * item.unitsPerBox;
    return true;
  }

  function resultBadgeHtml(result) {
    return "<span class=\"result-badge result-" + escapeHtml(result.key) + "\">" + escapeHtml(result.label) + "</span>";
  }

  function renderAdminTransferProgress(transfer, mode) {
    if (!$("adminTransferProgressPanel")) return;
    var visible = isAdminOrSupervisor();
    $("adminTransferProgressPanel").hidden = !visible;
    if (!visible) return;
    var items = getTransferItems(transfer.id);
    var isConference = isXmlConferenceTransfer(transfer);
    var rows = items.map(function (item) {
      var checkedQty = getTransferCheckedQty(item, transfer);
      var expectedQty = isConference ? Number(item.requestedQty || 0) : getTransferExpectedUnits(item);
      var remainingQty = Math.max(0, expectedQty - checkedQty);
      var differenceQty = checkedQty - expectedQty;
      var result = transferQtyResult(expectedQty, checkedQty, item);
      return {
        item: item,
        sku: item.sku,
        description: item.description,
        expectedQty: expectedQty,
        checkedQty: checkedQty,
        remainingQty: remainingQty,
        differenceQty: differenceQty,
        result: result
      };
    });
    var checkedProducts = rows.filter(function (row) { return row.checkedQty > 0; }).length;
    var remainingProducts = rows.filter(function (row) { return row.remainingQty > 0; }).length;
    var checkedQtyTotal = rows.reduce(function (sum, row) { return sum + row.checkedQty; }, 0);
    var remainingQtyTotal = rows.reduce(function (sum, row) { return sum + row.remainingQty; }, 0);
    var expectedQtyTotal = rows.reduce(function (sum, row) { return sum + row.expectedQty; }, 0);
    var differenceQtyTotal = checkedQtyTotal - expectedQtyTotal;
    var totalResult = transferQtyResult(expectedQtyTotal, checkedQtyTotal, { divergenceType: differenceQtyTotal ? "DIFERENCA_TOTAL" : "" });
    $("adminTransferProgressSummary").innerHTML = [
      "<div><span>Produtos</span><strong>" + rows.length + "</strong></div>",
      summaryChip("Produtos lacrados", checkedProducts, checkedProducts ? "result-ok" : "result-not-picked"),
      summaryChip("Produtos faltando", remainingProducts, remainingProducts ? "result-missing" : "result-ok"),
      "<div><span>Qtd prevista</span><strong>" + formatQty(expectedQtyTotal) + "</strong></div>",
      summaryChip("Qtd lacrada", formatQty(checkedQtyTotal), totalResult.key === "ok" ? "result-ok" : "result-changed"),
      summaryChip("Qtd faltando", formatQty(remainingQtyTotal), remainingQtyTotal ? "result-missing" : "result-ok"),
      summaryChip("Diferença", formatQty(differenceQtyTotal), "result-" + totalResult.key)
    ].join("");
    $("adminTransferProgressRows").innerHTML = rows.length ? rows.map(function (row) {
      return [
        "<tr class=\"admin-progress-row result-row result-" + escapeHtml(row.result.key) + "\">",
        "<td data-label=\"SKU\"><strong>" + escapeHtml(row.sku || "-") + "</strong></td>",
        "<td data-label=\"Produto\">" + escapeHtml(row.description || "-") + "</td>",
        transferLocationSummaryCell(row.item),
        "<td data-label=\"Prevista\">" + formatTransferComparableQty(row.item, row.expectedQty) + "</td>",
        "<td data-label=\"Lacrada/Enviada\">" + formatTransferComparableQty(row.item, row.checkedQty) + "</td>",
        "<td data-label=\"Falta\">" + formatTransferComparableQty(row.item, row.remainingQty) + "</td>",
        "<td data-label=\"Diferença\"><strong class=\"result-diff result-" + escapeHtml(row.result.key) + "\">" + formatTransferComparableQty(row.item, row.differenceQty) + "</strong></td>",
        "<td data-label=\"Situação\">" + resultBadgeHtml(row.result) + "</td>",
        "</tr>"
      ].join("");
    }).join("") : "<tr><td colspan=\"8\">Nenhum item nesta transferência.</td></tr>";
  }

  function renderTransferFinalReport(transfer) {
    if (!$("transferFinalReportPanel")) return;
    var visible = isAdminOrSupervisor() && isFinalTransferStatus(transfer.status);
    $("transferFinalReportPanel").hidden = !visible;
    if (!visible) return;
    var report = getTransferFinalReport(transfer);
    var isConference = isXmlConferenceTransfer(transfer);
    var expectedTotal = report.items.reduce(function (sum, item) { return sum + (isConference ? Number(item.requestedQty || 0) : getTransferExpectedUnits(item)); }, 0);
    var packedTotal = report.items.reduce(function (sum, item) { return sum + getTransferCheckedQty(item, transfer); }, 0);
    var totalDifference = packedTotal - expectedTotal;
    var origin = transferRouteOriginLabel(transfer);
    var destination = transferRouteDestinationLabel(transfer);
    var correctItems = report.items.filter(function (item) {
      var expectedQty = isConference ? Number(item.requestedQty || 0) : getTransferExpectedUnits(item);
      return Math.abs(getTransferCheckedQty(item, transfer) - expectedQty) < 0.0001 && !item.divergenceType;
    }).length;
    var missingItems = report.items.filter(function (item) {
      var expectedQty = isConference ? Number(item.requestedQty || 0) : getTransferExpectedUnits(item);
      return getTransferCheckedQty(item, transfer) < expectedQty;
    }).length;
    var divergentItems = report.items.length - correctItems;
    var totalResult = transferQtyResult(expectedTotal, packedTotal, { divergenceType: totalDifference ? "DIFERENCA_TOTAL" : "" });
    $("transferFinalReportSummary").innerHTML = [
      summaryChip("Origem", origin),
      summaryChip("Destino", destination),
      summaryChip("Responsavel", transfer.responsibleName || "-"),
      summaryChip("Status", transferStatusDisplayLabel(transfer.status)),
      summaryChip("Resultado", transferStatusDisplayLabel(transfer.finalResult || transfer.status), totalDifference || report.extraItems.length ? "result-changed" : "result-ok"),
      "<div><span>Tempo separacao</span><strong>" + formatDuration(report.separationDurationSeconds) + "</strong></div>",
      "<div><span>Tempo montagem</span><strong>" + formatDuration(report.packingDurationSeconds) + "</strong></div>",
      "<div><span>Tempo total</span><strong>" + formatDuration(report.totalDurationSeconds) + "</strong></div>",
      "<div><span>Qtd prevista</span><strong>" + formatQty(expectedTotal) + "</strong></div>",
      summaryChip("Lacrado/enviado", formatQty(packedTotal), totalDifference ? "result-changed" : "result-ok"),
      summaryChip("Caixas finais", formatQty(report.finalBoxCount), report.finalBoxCount ? "result-ok" : "result-changed"),
      summaryChip("Diferenca", formatQty(totalDifference), "result-" + totalResult.key),
      summaryChip("Produtos corretos", correctItems, "result-ok"),
      summaryChip("Produtos com diferenca", divergentItems, divergentItems ? "result-changed" : "result-ok"),
      summaryChip("Produtos faltantes", missingItems, missingItems ? "result-missing" : "result-ok"),
      summaryChip("Extras", report.extraItems.length, report.extraItems.length ? "result-extra" : "result-ok"),
      canRequestTransferRevalidation(transfer) ? "<div><span>Ação</span><button class=\"edit-small\" data-transfer-revalidate=\"" + transfer.id + "\" type=\"button\">Revalidar com operador</button></div>" : ""
    ].join("");
    var itemRows = report.items.map(function (item) {
      var checkedQty = getTransferCheckedQty(item, transfer);
      var expectedQty = isConference ? Number(item.requestedQty || 0) : getTransferExpectedUnits(item);
      var diff = checkedQty - expectedQty;
      var missingQty = Math.max(0, expectedQty - checkedQty);
      var excessQty = Math.max(0, checkedQty - expectedQty);
      var result = transferQtyResult(expectedQty, checkedQty, item);
      if (isConference) {
        return "<tr class=\"leader-result-row result-row result-" + escapeHtml(result.key) + "\"><td data-label=\"SKU\"><strong>" + escapeHtml(item.sku) + "</strong></td><td data-label=\"Produto\">" + escapeHtml(item.description || "-") + "</td>" + transferLocationSummaryCell(item) + "<td data-label=\"Prevista\">" + formatQty(expectedQty) + "</td><td data-label=\"Bipada\">" + formatQty(checkedQty) + "</td><td data-label=\"Falta\">" + formatQty(missingQty) + "</td><td data-label=\"Sobra\">" + formatQty(excessQty) + "</td><td data-label=\"Situação\">" + resultBadgeHtml(result) + "</td><td data-label=\"Ajustar\">" + conferenceAdjustHtml(item.id, checkedQty) + "</td></tr>";
      }
      return "<tr class=\"leader-result-row result-row result-" + escapeHtml(result.key) + "\"><td data-label=\"SKU\">" + escapeHtml(item.sku) + "</td><td data-label=\"Produto\">" + escapeHtml(item.description || "-") + "</td>" + transferLocationSummaryCell(item) + "<td data-label=\"Prevista\">" + formatTransferExpectedLabel(item) + "</td><td data-label=\"Unidade\">" + escapeHtml(item.unit || "UN") + "</td><td data-label=\"Un/CX\">" + (isBoxQuantityItem(item) && Number(item.unitsPerBox || 0) > 0 ? formatQty(item.unitsPerBox) : "-") + "</td><td data-label=\"Total previsto\">" + formatTransferTotalExpectedLabel(item) + "</td><td data-label=\"Lacrada/Enviada\">" + formatTransferPackedLabel(item) + "</td><td data-label=\"Dif.\"><strong class=\"result-diff result-" + escapeHtml(result.key) + "\">" + formatTransferComparableQty(item, diff) + "</strong></td><td data-label=\"Motivo\">" + escapeHtml(item.pendingReason || item.pendingObservation || "-") + "</td><td data-label=\"Status\">" + resultBadgeHtml(result) + "</td></tr>";
    }).join("");
    var extraRows = report.extraItems.map(function (item) {
      var extraQty = Number(item.extraQty || item.separatedQty || item.packedQty || 0);
      var result = transferQtyResult(0, extraQty, item);
      var actions = isConference ? conferenceAdjustHtml(item.id, extraQty) + "<button class=\"remove-small\" data-transfer-delete-extra=\"" + item.id + "\" type=\"button\">Remover</button>" : escapeHtml(item.observation || "-");
      return "<tr class=\"leader-result-row result-row result-extra\"><td data-label=\"SKU\">" + escapeHtml(item.sku) + "</td><td data-label=\"Produto\">" + escapeHtml(item.description || "-") + "</td>" + transferLocationSummaryCell(item) + "<td data-label=\"Qtd bipada\">" + formatQty(extraQty) + "</td><td data-label=\"Situação\">" + resultBadgeHtml(result) + "</td><td data-label=\"Quem\">" + escapeHtml(item.addedByName || "-") + "</td><td data-label=\"Entrada\">" + escapeHtml(item.inputType || "-") + "</td><td data-label=\"" + (isConference ? "Ajustar" : "Obs.") + "\">" + actions + "</td></tr>";
    }).join("");
    var locationHeaders = ["Localizacao"];
    var itemHeaders = isConference ? ["SKU", "Produto"].concat(locationHeaders, ["Prevista", "Bipada", "Falta", "Sobra", "Situação", "Ajustar"]) : ["SKU", "Produto"].concat(locationHeaders, ["Prevista", "Lacrada/Enviada", "Dif.", "Status"]);
    var extraHeaders = ["SKU", "Produto"].concat(locationHeaders, ["Qtd bipada", "Situação", "Quem", "Entrada", isConference ? "Ajustar" : "Obs."]);
    if (!isConference) itemHeaders = ["SKU", "Produto"].concat(locationHeaders, ["Prevista", "Unidade", "Un/CX", "Total previsto", "Lacrada/Enviada", "Dif.", "Motivo", "Status"]);
    $("transferFinalReportDetails").innerHTML = [
      reportTableHtml(isConference ? "Itens do XML" : "Resultado por SKU", itemHeaders, itemRows, itemHeaders.length),
      reportTableHtml("Itens extras", extraHeaders, extraRows, extraHeaders.length)
    ].join("");
  }

  function conferenceAdjustHtml(itemId, qty) {
    return [
      "<div class=\"report-adjust-form\">",
      "<input type=\"number\" min=\"0\" step=\"0.001\" value=\"" + Number(qty || 0) + "\" data-transfer-adjust-input=\"" + itemId + "\">",
      "<button class=\"edit-small\" data-transfer-adjust-item=\"" + itemId + "\" type=\"button\">Salvar</button>",
      "</div>"
    ].join("");
  }

  function reportTableHtml(title, headers, rows, colspan) {
    return [
      "<section class=\"leader-report-section\">",
      "<h4>" + escapeHtml(title) + "</h4>",
      "<div class=\"table-wrap\"><table class=\"leader-report-table\"><thead><tr>",
      headers.map(function (header) { return "<th>" + escapeHtml(header) + "</th>"; }).join(""),
      "</tr></thead><tbody>",
      rows || "<tr><td colspan=\"" + colspan + "\">Nenhum registro.</td></tr>",
      "</tbody></table></div>",
      "</section>"
    ].join("");
  }

  async function refreshTransferProgress() {
    var transferId = transferState.activeTransferId;
    if (!transferId) return;
    await loadTransferData();
    var transfer = getTransferById(transferId);
    if (!transfer) {
      transferState.activeTransferId = "";
      renderTransfers();
      showToast("Transferencia nao encontrada no estoque atual.", "error");
      return;
    }
    if (!transferBelongsToActiveWarehouse(transfer)) {
      transferState.activeTransferId = "";
      renderTransfers();
      showToast("Esta transferencia pertence a outro estoque.", "error");
      return;
    }
    transferState.activeTransferId = transferId;
    renderTransferWork();
    setStatus("transferWorkStatus", "Acompanhamento atualizado.", "success");
  }

  function renderCurrentTransferItem() {
    if (!$("transferCurrentItem")) return;
    var item = transferState.items.find(function (entry) { return entry.id === transferState.selectedItemId; });
    if (!item) {
      $("transferCurrentItem").innerHTML = emptyCurrentItemHtml();
      return;
    }
    var qty = itemQtyNumbers(item);
    var mode = transferState.activeWorkMode;
    var statusLabel = displayTransferStatusLabel(transferItemStatusLabel(item));
    var locationLine = transferCompactLocationLabel(item);
    var productName = normalizeText(item.description || "");
    var isBox = isBoxQuantityItem(item);
    var stockGuidance = mode === "MONTAGEM" ? "" : transferStockGuidanceHtml(item);
    var highlight = mode === "MONTAGEM"
      ? "<div class=\"current-qty-highlight packing\"><span>Restante para caixa</span><strong>" + formatQty(qty.pendingPacking) + " " + escapeHtml(item.unit || "UN") + "</strong></div>"
      : "<div class=\"current-qty-highlight\"><span>Quantidade para coletar</span><strong>" + formatQty(qty.pendingSeparation || qty.requested) + " " + escapeHtml(item.unit || "UN") + "</strong></div>";
    var meta = mode === "MONTAGEM" ? [
      "<span>Solicitado <b>" + formatQty(qty.requested) + "</b></span>",
      "<span>Separado <b>" + formatQty(qty.separated) + "</b></span>",
      "<span>Na caixa <b>" + formatQty(qty.packed) + "</b></span>",
      "<span>Restante <b>" + formatQty(qty.pendingPacking) + "</b></span>",
      isBox ? "<span>Unidades por caixa <b>" + (Number(item.unitsPerBox || 0) > 0 ? formatQty(item.unitsPerBox) : "-") + "</b></span>" : "",
      isBox ? "<span>Total em unidades <b>" + (Number(qty.expectedUnits || 0) > 0 ? formatQty(qty.expectedUnits) : "-") + "</b></span>" : ""
    ].join("") : [
      "<span>Solicitado <b>" + formatQty(qty.requested) + "</b></span>",
      "<span>Separado <b>" + formatQty(qty.separated) + "</b></span>",
      "<span>Pendente <b>" + formatQty(qty.pendingSeparation) + "</b></span>",
      "<span>Status <b>" + escapeHtml(statusLabel) + "</b></span>"
    ].join("");
    $("transferCurrentItem").innerHTML = [
      "<span class=\"current-item-kicker\">" + (mode === "MONTAGEM" ? "ITEM PARA CAIXA" : "PRÓXIMO ITEM") + "</span>",
      "<div class=\"current-item-compact-grid\">",
      "<div class=\"current-item-main-info\">",
      "<div class=\"current-item-head\"><strong>SKU " + escapeHtml(item.sku) + "</strong><span>" + escapeHtml(statusLabel) + "</span></div>",
      productName ? "<p>" + escapeHtml(productName) + "</p>" : "",
      mode === "MONTAGEM" ? "" : "<div class=\"current-location-line\"><span>Endereço</span><strong>" + escapeHtml(locationLine.replace(/^EndereÃ§o: |^Endereço: /, "")) + "</strong></div>",
      "</div>",
      highlight,
      "</div>",
      "<div class=\"transfer-qty-row current-item-meta\">",
      meta,
      "</div>",
      stockGuidance
    ].join("");
  }

  function emptyCurrentItemHtml() {
    return "<strong>Nenhum item pendente</strong><span>Avance para a próxima etapa ou finalize a transferência.</span>";
  }

  function getVisibleTransfers() {
    if (!authState.currentUser) return [];
    var activeTransfers = transferState.transfers.filter(function (transfer) {
      return isOperationalTransferRecord(transfer) && transferBelongsToActiveWarehouse(transfer);
    });
    if (isAdminOrSupervisor()) return activeTransfers;
    return activeTransfers.filter(function (transfer) {
      return transfer.responsibleId === authState.currentUser.id;
    });
  }

  function transferBelongsToActiveWarehouse(transfer) {
    var activeCode = activeWarehouseCode();
    if (!transfer || !activeCode) return false;
    var transferWarehouse = normalizeWarehouseCode(transfer.warehouseCode);
    if (transferWarehouse) return transferWarehouse === activeCode;
    if (isMultiWarehouseMode()) return false;
    var originTokens = [
      transfer.originName,
      transfer.originStoreCode,
      transfer.originInternalCode,
      transfer.originCnpj
    ].filter(Boolean);
    if (!originTokens.length) return true;
    return originTokens.some(function (token) {
      return transferStoreTokenMatchesWarehouse(token, activeCode);
    });
  }

  function isAdminOrSupervisor() {
    return authState.currentUser && ["ADMINISTRADOR", "SUPERVISOR"].indexOf(authState.currentUser.role) >= 0;
  }

  function isSupervisor() {
    return authState.currentUser && authState.currentUser.role === "SUPERVISOR";
  }

  function userBelongsToWarehouse(user, code) {
    code = normalizeWarehouseCode(code);
    return normalizeWarehouseCodeOrBlank(user && user.defaultWarehouseCode) === code || allowedWarehouseCodesForUser(user).indexOf(code) >= 0;
  }

  function canManageUserRecord(user) {
    if (!authState.currentUser || !user) return false;
    if (isGlobalAdmin()) return true;
    if (!isSupervisor()) return false;
    if (user.role === "ADMINISTRADOR" || user.isGlobalAdmin) return false;
    if (user.role !== "OPERADOR") return false;
    return normalizeWarehouseCodeOrBlank(user.defaultWarehouseCode) === activeWarehouseCode();
  }

  function visibleUsersForManagement() {
    if (isGlobalAdmin()) return authState.users.slice();
    if (isSupervisor()) {
      return authState.users.filter(function (user) {
        return user.role === "OPERADOR" && !user.isGlobalAdmin && normalizeWarehouseCodeOrBlank(user.defaultWarehouseCode) === activeWarehouseCode();
      });
    }
    return [];
  }

  function userCanReceiveTaskInActiveWarehouse(user) {
    if (!user || !user.active || user.archived === true || !user.availableForTasks) return false;
    if (["OPERADOR", "SUPERVISOR"].indexOf(user.role) < 0) return false;
    if (normalizeWarehouseCodeOrBlank(user.defaultWarehouseCode) !== activeWarehouseCode()) return false;
    if (isSupervisor() && user.role === "ADMINISTRADOR") return false;
    return true;
  }

  function getTransferById(id) {
    return transferState.transfers.find(function (transfer) { return transfer.id === id; });
  }

  function invalidateTransferStatsCache() {
    transferStatsCache = {
      sourceItems: null,
      itemsByTransferId: null,
      statsByTransferId: {}
    };
  }

  function getTransferItemsByTransferId() {
    if (transferStatsCache.sourceItems === transferState.items && transferStatsCache.itemsByTransferId) {
      return transferStatsCache.itemsByTransferId;
    }
    var grouped = {};
    transferState.items.forEach(function (item) {
      var transferId = item.transferId || "";
      if (!grouped[transferId]) grouped[transferId] = [];
      grouped[transferId].push(item);
    });
    transferStatsCache.sourceItems = transferState.items;
    transferStatsCache.itemsByTransferId = grouped;
    transferStatsCache.statsByTransferId = {};
    return grouped;
  }

  function getTransferItems(transferId) {
    return getTransferItemsByTransferId()[transferId] || [];
  }

  function getTransferStats(transferId) {
    if (transferStatsCache.statsByTransferId[transferId]) return transferStatsCache.statsByTransferId[transferId];
    var items = getTransferItems(transferId);
    if (!items.length && transferId && !transferState.loadedItemTransferIds[transferId]) {
      var transfer = getTransferById(transferId);
      if (transfer) {
        var requestedSummary = Number(transfer.totalPreviewQuantity || transfer.totalExpectedQuantity || 0);
        var separatedSummary = Number(transfer.totalSeparatedQuantity || 0);
        var packedSummary = Number(transfer.totalSentQuantity || transfer.totalPackedQuantity || 0);
        var handledSummary = Math.max(separatedSummary, packedSummary);
        var progressSummary = requestedSummary ? Math.round((handledSummary / requestedSummary) * 100) : 0;
        var totalItemsSummary = Number(transfer.totalItems || transfer.totalSkus || 0);
        var statsSummary = {
          totalItems: totalItemsSummary,
          totalSkus: totalItemsSummary,
          pendingSeparation: Number(transfer.pendingItems || 0),
          pendingPacking: Number(transfer.pendingItems || 0),
          separatedItems: Number(transfer.separatedItems || 0),
          packedItems: Number(transfer.separatedItems || 0),
          noLocationItems: 0,
          requested: requestedSummary,
          separated: separatedSummary,
          packed: packedSummary,
          extraItems: 0,
          extraQty: 0,
          missingQty: Math.max(0, requestedSummary - handledSummary),
          excessQty: Math.max(0, Number(transfer.totalDifference || 0)),
          divergenceCount: Number(transfer.divergenceCount || transfer.divergentItems || 0),
          progress: Math.max(0, Math.min(100, progressSummary))
        };
        transferStatsCache.statsByTransferId[transferId] = statsSummary;
        return statsSummary;
      }
    }
    var originalItems = items.filter(function (item) { return !item.isExtra; });
    var extraItems = items.filter(function (item) { return item.isExtra; });
    var totalItems = originalItems.length;
    var pendingSeparation = originalItems.filter(function (item) { return !isTransferItemSeparationClosed(item) && Number(item.separatedQty || 0) < Number(item.requestedQty || 0); }).length;
    var pendingPacking = originalItems.filter(function (item) { return !isTransferItemNotSent(item) && Number(item.packedQty || 0) < Number(item.separatedQty || 0); }).length;
    var separatedItems = originalItems.filter(function (item) { return isTransferItemSeparationClosed(item) || Number(item.separatedQty || 0) >= Number(item.requestedQty || 0); }).length;
    var packedItems = originalItems.filter(function (item) { return isTransferItemNotSent(item) || (Number(item.packedQty || 0) >= Number(item.separatedQty || 0) && Number(item.separatedQty || 0) > 0); }).length;
    var noLocationItems = originalItems.filter(function (item) { return !transferLocationStatus(item).hasLocation; }).length;
    var requested = originalItems.reduce(function (sum, item) { return sum + Number(item.requestedQty || 0); }, 0);
    var packed = items.reduce(function (sum, item) { return sum + Math.min(Number(item.packedQty || 0), Number(item.requestedQty || item.packedQty || 0)); }, 0);
    var separated = items.reduce(function (sum, item) { return sum + Math.min(Number(item.separatedQty || 0), Number(item.requestedQty || item.separatedQty || 0)); }, 0);
    var extraQty = extraItems.reduce(function (sum, item) { return sum + Number(item.extraQty || item.separatedQty || item.packedQty || 0); }, 0);
    var missingQty = originalItems.reduce(function (sum, item) { return sum + Math.max(0, Number(item.requestedQty || 0) - Math.max(Number(item.separatedQty || 0), Number(item.packedQty || 0))); }, 0);
    var excessQty = items.reduce(function (sum, item) { return sum + Number(item.excessQty || 0); }, 0);
    var handledQty = packed || separated || (requested - missingQty);
    var progress = requested ? Math.round((handledQty / requested) * 100) : 0;
    var stats = {
      totalItems: totalItems,
      totalSkus: originalItems.length,
      pendingSeparation: pendingSeparation,
      pendingPacking: pendingPacking,
      separatedItems: separatedItems,
      packedItems: packedItems,
      noLocationItems: noLocationItems,
      requested: requested,
      separated: separated,
      packed: packed,
      extraItems: extraItems.length,
      extraQty: extraQty,
      missingQty: missingQty,
      excessQty: excessQty,
      divergenceCount: countTransferDivergences(transferId),
      progress: Math.max(0, Math.min(100, progress))
    };
    transferStatsCache.statsByTransferId[transferId] = stats;
    return stats;
  }

  function buildTransferLightSummary(transfer, status, eventType, eventPayload) {
    var effectiveStatus = status || (transfer && transfer.status) || "PENDENTE";
    var stats = transfer && transfer.id ? getTransferStats(transfer.id) : {};
    var pending = effectiveStatus === "EM_MONTAGEM_CAIXA" || effectiveStatus === "EM_LACRE" ? Number(stats.pendingPacking || 0) : Number(stats.pendingSeparation || 0);
    var label = eventLabelForLeader(eventType, eventPayload, effectiveStatus);
    return {
      total_items: Number(stats.totalItems || 0),
      total_skus: Number(stats.totalSkus || 0),
      total_expected_quantity: Number(stats.requested || 0),
      total_separated_quantity: Number(stats.separated || 0),
      total_packed_quantity: Number(stats.packed || 0),
      total_previsto: Number(stats.requested || 0),
      total_enviado: Number(stats.packed || 0),
      diferenca_total: Number(stats.packed || 0) - Number(stats.requested || 0),
      itens_total: Number(stats.totalItems || 0),
      itens_separados: Number(stats.separatedItems || 0),
      itens_pendentes: Math.max(0, pending),
      itens_divergentes: Number(stats.divergenceCount || 0),
      current_step: transferCurrentStepForStatus(effectiveStatus),
      last_action_at: nowIso(),
      last_action_label: label,
      has_divergence: Boolean((transfer && transfer.hasDivergence) || Number(stats.divergenceCount || 0) > 0)
    };
  }

  function eventLabelForLeader(eventType, payload, status) {
    var labels = {
      TRANSFER_CREATED: "Transferencia criada",
      TRANSFER_ASSIGNED: "Responsavel definido",
      SEPARATION_STARTED: "Separacao iniciada",
      ITEM_SEPARATED: "SKU separado",
      SEPARATION_FINISHED: "Separacao finalizada",
      PACKING_STARTED: "Montagem iniciada",
      ITEM_PACKED: "SKU colocado na caixa",
      PACKING_FINISHED: "Transferencia enviada",
      TRANSFER_REVALIDATION_REQUESTED: "Revalidacao solicitada",
      TRANSFER_REVALIDATION_STARTED: "Revalidacao iniciada",
      TRANSFER_REVALIDATION_FINISHED: "Revalidacao concluida",
      TRANSFER_FINALIZED: "Transferencia finalizada",
      TRANSFER_FINALIZED_WITH_DIVERGENCE: "Finalizada com divergencia"
    };
    var sku = payload && (payload.sku || payload.code) ? " - SKU " + (payload.sku || payload.code) : "";
    return (labels[eventType] || transferStatusDisplayLabel(status)) + sku;
  }

  async function persistTransferLightSummary(transfer, eventType, payload) {
    if (!transfer || !isSupabaseReady()) return;
    try {
      var update = Object.assign({ updated_at: nowIso() }, buildTransferLightSummary(transfer, transfer.status, eventType, payload));
      var response = await updateTransferWithSchemaFallback(transfer.id, update);
      if (response.error && !isMissingColumnError(response.error)) throw response.error;
    } catch (error) {
      recordPerformanceError("transfer-summary", error);
    }
  }

  function isFinalTransferStatus(status) {
    return FINAL_TRANSFER_STATUSES.indexOf(status) >= 0;
  }

  function getTransferFlow(transfer) {
    if (!transfer) return "TRANSFERENCIA_EXCEL";
    if (transfer.flowType === "CONFERENCIA_XML" || transfer.flowType === "TRANSFERENCIA_EXCEL") return transfer.flowType;
    var text = normalizeText([transfer.code, transfer.name, transfer.observation].join(" ")).toLowerCase();
    return text.indexOf("xml") >= 0 || text.indexOf("conferencia criada pelo xml") >= 0 ? "CONFERENCIA_XML" : "TRANSFERENCIA_EXCEL";
  }

  function isXmlConferenceTransfer(transfer) {
    return getTransferFlow(transfer) === "CONFERENCIA_XML";
  }

  function getTransferCheckedQty(item, transfer) {
    if (!isXmlConferenceTransfer(transfer) && isBoxQuantityItem(item)) return getTransferPackedUnits(item);
    return isXmlConferenceTransfer(transfer) ? Number(item.separatedQty || 0) : Number(item.packedQty || 0);
  }

  function countTransferDivergences(transferId) {
    var items = getTransferItems(transferId);
    var count = 0;
    items.forEach(function (item) {
      if (item.isExtra || item.divergenceType || Number(item.missingQty || 0) > 0 || Number(item.excessQty || 0) > 0) count += 1;
    });
    return count;
  }

  function secondsBetween(start, end) {
    if (!start || !end) return 0;
    var value = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function formatDuration(seconds) {
    seconds = Math.max(0, Math.round(Number(seconds || 0)));
    var hours = Math.floor(seconds / 3600);
    var minutes = Math.floor((seconds % 3600) / 60);
    var secs = seconds % 60;
    if (hours) return hours + "h " + String(minutes).padStart(2, "0") + "min";
    if (minutes) return minutes + "min " + String(secs).padStart(2, "0") + "s";
    return secs + "s";
  }

  function getTransferFinalReport(transfer) {
    var items = getTransferItems(transfer.id);
    var originalItems = items.filter(function (item) { return !item.isExtra; });
    var extraItems = items.filter(function (item) { return item.isExtra; });
    var stats = getTransferStats(transfer.id);
    var milestones = getTransferMilestoneTimes(transfer.id);
    var start = transfer.startedAt || transfer.separationStartedAt || milestones.separationStarted || transfer.createdAt;
    var separationStarted = transfer.separationStartedAt || transfer.startedAt || milestones.separationStarted || start;
    var separationFinished = transfer.separationFinishedAt || milestones.separationFinished || milestones.packingStarted || "";
    var packingStarted = transfer.packingStartedAt || milestones.packingStarted || separationFinished || "";
    var packingFinished = transfer.packingFinishedAt || milestones.packingFinished || transfer.finishedAt || "";
    var finish = transfer.finishedAt || packingFinished || milestones.transferFinalized || transfer.updatedAt;
    var totalDurationSeconds = Number(transfer.durationSeconds || 0) || secondsBetween(start, finish);
    var separationDurationSeconds = Number(transfer.separationDurationSeconds || 0) || secondsBetween(separationStarted, separationFinished);
    var packingDurationSeconds = Number(transfer.packingDurationSeconds || 0) || secondsBetween(packingStarted, packingFinished);
    var divergences = [];
    originalItems.forEach(function (item) {
      var checkedQty = getTransferCheckedQty(item, transfer);
      var expectedQty = isXmlConferenceTransfer(transfer) ? Number(item.requestedQty || 0) : getTransferExpectedUnits(item);
      var diff = checkedQty - expectedQty;
      if (diff < 0) divergences.push({ sku: item.sku, description: item.description, type: "FALTA_DE_ITEM", expected: expectedQty, informed: checkedQty, difference: diff });
      if (diff > 0 || Number(item.excessQty || 0) > 0) divergences.push({ sku: item.sku, description: item.description, type: "QUANTIDADE_EXCEDENTE", expected: expectedQty, informed: checkedQty, difference: diff });
    });
    extraItems.forEach(function (item) {
      var extraQty = Number(item.extraQty || item.separatedQty || item.packedQty || 0);
      if (extraQty <= 0) return;
      divergences.push({ sku: item.sku, description: item.description, type: "ITEM_EXTRA", expected: 0, informed: extraQty, difference: extraQty, observation: item.observation || "" });
    });
    return {
      transfer: transfer,
      items: originalItems,
      extraItems: extraItems,
      events: [],
      divergences: divergences,
      stats: stats,
      startedAt: start,
      finishedAt: finish,
      totalDurationSeconds: totalDurationSeconds,
      separationDurationSeconds: separationDurationSeconds,
      packingDurationSeconds: packingDurationSeconds,
      finalBoxCount: getTransferFinalBoxCount(transfer),
      scannedEvents: 0,
      manualEvents: 0
    };
  }

  function getTransferFinalBoxCount(transferOrId) {
    var transfer = typeof transferOrId === "object" && transferOrId ? transferOrId : getTransferById(transferOrId);
    var persistedQty = transfer ? Number(transfer.totalBoxes || transfer.finalBoxCount || transfer.finalBoxes || 0) : 0;
    if (Number.isFinite(persistedQty) && persistedQty > 0) return persistedQty;
    var transferId = transfer ? transfer.id : transferOrId;
    var events = transferState.events.filter(function (event) {
      return event.transfer_id === transferId && event.event_type === "PACKING_FINISHED";
    }).sort(function (a, b) {
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
    for (var i = 0; i < events.length; i += 1) {
      var payload = events[i].payload || {};
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch (error) {
          payload = {};
        }
      }
      var qty = Number(payload.finalBoxCount || events[i].quantity || 0);
      if (qty > 0) return qty;
    }
    return 0;
  }

  function getTransferMilestoneTimes(transferId) {
    var events = transferState.events.filter(function (event) {
      return event.transfer_id === transferId;
    }).sort(function (a, b) {
      return new Date(a.created_at || 0) - new Date(b.created_at || 0);
    });
    return {
      separationStarted: firstEventTime(events, ["SEPARATION_STARTED"]),
      separationFinished: firstEventTime(events, ["SEPARATION_FINISHED"]),
      packingStarted: firstEventTime(events, ["PACKING_STARTED", "SEPARATION_FINISHED"]),
      packingFinished: firstEventTime(events, ["PACKING_FINISHED"]),
      transferFinalized: lastEventTime(events, ["TRANSFER_FINALIZED", "PACKING_FINISHED"])
    };
  }

  function firstEventTime(events, types) {
    var match = events.find(function (event) { return types.indexOf(event.event_type) >= 0; });
    return match ? match.created_at : "";
  }

  function lastEventTime(events, types) {
    for (var i = events.length - 1; i >= 0; i -= 1) {
      if (types.indexOf(events[i].event_type) >= 0) return events[i].created_at;
    }
    return "";
  }

  function canCancelTransfer(transfer) {
    if (isFinalTransferStatus(transfer.status)) return false;
    if (!isAdmin()) return ["LACRE_CONCLUIDO", "MONTAGEM_CAIXA_CONCLUIDA", "PRONTA_PARA_NOTA", "PRONTA_PARA_NOTA_COM_DIVERGENCIA"].indexOf(transfer.status) < 0;
    return transfer.status !== "CANCELADA";
  }

  function canRequestTransferRevalidation(transfer) {
    if (!isAdminOrSupervisor() || !transfer || !transferBelongsToActiveWarehouse(transfer)) return false;
    if (!transfer.responsibleId) return false;
    return [
      "LACRE_CONCLUIDO",
      "MONTAGEM_CAIXA_CONCLUIDA",
      "PRONTA_PARA_NOTA",
      "PRONTA_PARA_NOTA_COM_DIVERGENCIA",
      "FINALIZADA",
      "FINALIZADA_PARA_ANALISE",
      "CONCLUIDA_SEM_DIVERGENCIA",
      "CONCLUIDA_COM_DIVERGENCIA"
    ].indexOf(transfer.status) >= 0;
  }

  function getLatestTransferConferenceAssignment(transferId) {
    var events = transferState.events.filter(function (event) {
      return event.transfer_id === transferId && event.event_type === "XML_CONFERENCE_ASSIGNED" && event.payload;
    }).sort(function (a, b) {
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
    return events.length ? events[0].payload : null;
  }

  function isTransferConferenceAssignedToCurrentUser(transferId) {
    if (!authState.currentUser) return false;
    var assignment = getLatestTransferConferenceAssignment(transferId);
    return assignment && assignment.assignedUserId === authState.currentUser.id;
  }

  async function assignTransferConference(transferId, selectedUserId) {
    if (!isAdminOrSupervisor()) return;
    var transfer = getTransferById(transferId);
    var select = $("transferConferenceSelect-" + transferId);
    var userId = selectedUserId || (select ? select.value : "");
    var user = userId ? authState.users.find(function (entry) { return entry.id === userId; }) : null;
    if (!transfer || !user) {
      showToast("Selecione a pessoa que vai conferir a transferência.", "error");
      if ($("conferenceAdminStatus")) setStatus("conferenceAdminStatus", "Selecione a transferência e a pessoa que vai conferir.", "error");
      return;
    }
    await recordTransferEvent(
      transfer.id,
      "",
      "XML_CONFERENCE_ASSIGNED",
      "",
      0,
      "Conferência XML atribuída para " + user.name + ".",
      {
        assignedAt: new Date().toISOString(),
        assignedUserId: user.id,
        assignedUserName: user.name,
        assignedUsername: user.username,
        transferId: transfer.id,
        transferCode: transfer.code,
        transferName: transfer.name
      }
    );
    await loadTransferData();
    renderTransfers();
    renderOperatorTasksAlert();
    showToast("Conferência atribuída para " + user.name + ".", "success");
  }

  async function exportTransferConferenceXml(transferId) {
    if (!isAdminOrSupervisor()) return;
    var transfer = getTransferById(transferId);
    if (!transfer) return;
    var items = getTransferItems(transfer.id);
    if (!items.length) {
      showToast("Transferência sem itens para exportar.", "error");
      return;
    }
    var assignment = getLatestTransferConferenceAssignment(transfer.id) || {};
    var xml = buildTransferConferenceXml(transfer, items, assignment);
    var fileName = "Conferencia_" + sanitizeFileName(transfer.code || transfer.name || transfer.id) + "_" + dateForFileName(new Date()) + ".xml";
    downloadTextFile(fileName, xml, "application/xml;charset=utf-8");
    await recordTransferEvent(
      transfer.id,
      "",
      "XML_CONFERENCE_EXPORTED",
      "",
      items.reduce(function (sum, item) { return sum + Number(item.requestedQty || 0); }, 0),
      "XML da transferência exportado para conferência.",
      {
        exportedAt: new Date().toISOString(),
        fileName: fileName,
        assignedUserId: assignment.assignedUserId || "",
        assignedUserName: assignment.assignedUserName || ""
      }
    );
    showToast("XML da transferência exportado.", "success");
  }

  function buildTransferConferenceXml(transfer, items, assignment) {
    var stats = getTransferStats(transfer.id);
    return [
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
      "<wmsTransferConference version=\"1\">",
      "  <transfer>",
      "    <id>" + xmlEscape(transfer.id) + "</id>",
      "    <code>" + xmlEscape(transfer.code) + "</code>",
      "    <name>" + xmlEscape(transfer.name) + "</name>",
      "    <status>" + xmlEscape(transfer.status) + "</status>",
      "    <createdAt>" + xmlEscape(transfer.createdAt) + "</createdAt>",
      "  </transfer>",
      "  <destination>",
      "    <code>" + xmlEscape(transfer.establishmentCode) + "</code>",
      "    <name>" + xmlEscape(transfer.establishmentName) + "</name>",
      "    <cnpj>" + xmlEscape(transfer.establishmentCnpj) + "</cnpj>",
      "  </destination>",
      "  <separationResponsible>",
      "    <id>" + xmlEscape(transfer.responsibleId) + "</id>",
      "    <name>" + xmlEscape(transfer.responsibleName) + "</name>",
      "  </separationResponsible>",
      "  <conferenceResponsible>",
      "    <id>" + xmlEscape(assignment.assignedUserId || "") + "</id>",
      "    <name>" + xmlEscape(assignment.assignedUserName || "") + "</name>",
      "  </conferenceResponsible>",
      "  <totals>",
      "    <items>" + items.length + "</items>",
      "    <requestedQty>" + formatQty(stats.requested) + "</requestedQty>",
      "    <separatedQty>" + formatQty(stats.separated) + "</separatedQty>",
      "    <packedQty>" + formatQty(stats.packed) + "</packedQty>",
      "  </totals>",
      "  <items>",
      items.map(function (item) {
        return [
          "    <item>",
          "      <sku>" + xmlEscape(item.sku) + "</sku>",
          "      <description>" + xmlEscape(item.description) + "</description>",
          "      <unit>" + xmlEscape(item.unit) + "</unit>",
          "      <requestedQty>" + formatQty(item.requestedQty) + "</requestedQty>",
          "      <separatedQty>" + formatQty(item.separatedQty) + "</separatedQty>",
          "      <packedQty>" + formatQty(item.packedQty) + "</packedQty>",
          "      <status>" + xmlEscape(item.status) + "</status>",
          "    </item>"
        ].join("\n");
      }).join("\n"),
      "  </items>",
      "</wmsTransferConference>"
    ].join("\n");
  }

  function downloadTextFile(fileName, content, mimeType) {
    var blob = new Blob([content], { type: mimeType || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function sanitizeFileName(value) {
    return normalizeText(value || "transferencia").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "_").slice(0, 80);
  }

  function xmlEscape(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function formatQty(value) {
    var number = Number(value || 0);
    return Number.isInteger(number) ? String(number) : number.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  }

  function setTransferFieldHidden(inputId, hidden) {
    var input = $(inputId);
    if (!input) return;
    input.hidden = hidden;
    if (input.previousElementSibling && input.previousElementSibling.tagName === "LABEL") {
      input.previousElementSibling.hidden = hidden;
    }
  }

  function clearXmlConferencePanel() {
    if ($("xmlConferenceSummary")) $("xmlConferenceSummary").innerHTML = "";
    if ($("xmlConferenceRows")) $("xmlConferenceRows").innerHTML = "";
    if ($("xmlConferenceStatus")) setStatus("xmlConferenceStatus", "", "");
  }

  function renderXmlConference(transferId) {
    if (!$("xmlConferenceRows")) return;
    var conference = getLatestXmlConference(transferId);
    if (!conference) {
      $("xmlConferenceSummary").innerHTML = "";
      $("xmlConferenceRows").innerHTML = "";
      setStatus("xmlConferenceStatus", "Ao finalizar a bipagem, envie a conferência para gerar o resultado.", "warning");
      return;
    }
    renderXmlConferencePayload(conference);
  }

  function getLatestXmlConference(transferId) {
    var events = transferState.events.filter(function (event) {
      return event.transfer_id === transferId && event.event_type === "XML_CONFERENCE" && event.payload;
    }).sort(function (a, b) {
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
    return events.length ? events[0].payload : null;
  }

  function renderXmlConferencePayload(conference) {
    if (!$("xmlConferenceSummary") || !$("xmlConferenceRows")) return;
    var summary = conference.summary || {};
    var note = conference.note || {};
    $("xmlConferenceSummary").innerHTML = [
      summaryChip("Conferência", note.number || "-"),
      summaryChip("Destino", (note.destinationName || "-")),
      summaryChip("Itens", summary.transferItems || summary.xmlItems || 0),
      summaryChip("Resultado final", summary.correct ? "CORRETA" : "DIVERGENTE")
    ].join("");
    var issues = (conference.rows || []).filter(function (row) { return row.status !== "CORRETO"; });
    $("xmlConferenceRows").innerHTML = issues.length ? [
      "<div class=\"conference-result-title\">Corrigir antes de finalizar</div>",
      issues.map(function (row) {
        return [
          "<article class=\"conference-result-item\">",
          "<strong>" + escapeHtml(row.sku || "-") + "</strong>",
          "<span>" + escapeHtml(row.xmlDescription || row.transferDescription || "-") + "</span>",
          "<b>" + escapeHtml(row.status) + "</b>",
          "<small>Esperado: " + formatQty(row.xmlQty) + " | Conferido: " + formatQty(row.packedQty || 0) + "</small>",
          "</article>"
        ].join("");
      }).join("")
    ].join("") : "<div class=\"conference-result-ok\">Conferência correta. Todos os itens batem com o XML.</div>";
    setStatus(
      "xmlConferenceStatus",
      summary.correct ? "Conferência enviada: quantidade final correta." : "Conferência enviada: existem itens para corrigir.",
      summary.correct ? "success" : "error"
    );
  }

  async function resolvePendingConferenceExtras(transfer) {
    if (!isXmlConferenceTransfer(transfer)) return transfer;
    var pendingExtras = getTransferItems(transfer.id).filter(function (item) {
      return item.isExtra && (item.status === "EXTRA_PENDENTE" || item.divergenceType === "SKU_NAO_CONSTA_XML");
    });
    if (!pendingExtras.length) return transfer;
    var include = window.confirm("Existem " + pendingExtras.length + " SKU(s) que não fazem parte do XML. Deseja incluir esses itens como divergência nesta conferência?");
    if (include) {
      for (var i = 0; i < pendingExtras.length; i += 1) {
        var item = pendingExtras[i];
        await recordTransferEvent(transfer.id, item.id, "CONFERENCE_EXTRA_INCLUDED", item.sku, Number(item.extraQty || item.separatedQty || 0), "SKU fora do XML incluído na conferência final.", {
          divergenceType: "SKU_NAO_CONSTA_XML",
          inputType: item.inputType || ""
        });
      }
      return transfer;
    }
    var ids = pendingExtras.map(function (item) { return item.id; });
    var deleteResponse = await supabaseDb.from("wms_transfer_items").delete().in("id", ids);
    if (deleteResponse.error) throw deleteResponse.error;
    for (var j = 0; j < pendingExtras.length; j += 1) {
      await recordTransferEvent(transfer.id, "", "CONFERENCE_EXTRA_IGNORED", pendingExtras[j].sku, Number(pendingExtras[j].extraQty || pendingExtras[j].separatedQty || 0), "SKU fora do XML removido da conferência final.", {
        divergenceType: "SKU_NAO_CONSTA_XML",
        inputType: pendingExtras[j].inputType || ""
      });
    }
    await loadTransferData();
    transferState.activeTransferId = transfer.id;
    return getTransferById(transfer.id) || transfer;
  }

  async function conferenceTransferXml() {
    var transfer = getTransferById(transferState.activeTransferId);
    if (transfer && isFinalTransferStatus(transfer.status)) {
      setStatus("xmlConferenceStatus", "Esta conferência já foi enviada. Abra o relatório para consultar o resultado.", "warning");
      return;
    }
    var button = $("conferenceXmlButton");
    if (button && button.disabled) return;
    if (!transfer) {
      setStatus("xmlConferenceStatus", "Abra uma transferência antes de conferir XML.", "error");
      return;
    }
    try {
      if (button) button.disabled = true;
      setStatus("xmlConferenceStatus", "Enviando conferência...", "warning");
      transfer = await resolvePendingConferenceExtras(transfer);
      var conference = buildFinalTransferConference(transfer);
      renderXmlConferencePayload(conference);
      await finalizeTransferAfterConference(transfer, conference);
      await recordTransferEvent(
        transfer.id,
        "",
        "XML_CONFERENCE",
        "",
        conference.summary.totalXmlQty,
        conference.summary.correct ? "Conferência enviada sem divergências." : "Conferência enviada com divergências.",
        conference
      );
      await loadTransferData();
      transferState.activeTransferId = transfer.id;
      renderTransfers();
      setStatus("xmlConferenceStatus", conference.summary.correct ? "Conferência enviada: 100% correta." : "Conferência enviada para análise. Existem itens faltando, sobrando ou extras.", conference.summary.correct ? "success" : "error");
    } catch (error) {
      if (button) button.disabled = false;
      setStatus("xmlConferenceStatus", "Não foi possível enviar a conferência: " + formatSupabaseError(error), "error");
    }
  }

  function buildFinalTransferConference(transfer) {
    var items = getTransferItems(transfer.id);
    var rows = items.map(function (item) {
      var actualQty = getTransferCheckedQty(item, transfer);
      var expectedQty = Number(item.requestedQty || 0);
      var diff = actualQty - expectedQty;
      return xmlConferenceRow(
        item.sku,
        item.description,
        item.description,
        expectedQty,
        item.separatedQty,
        actualQty,
        Math.abs(diff) < 0.0001 ? "CORRETO" : diff < 0 ? "Faltando " + formatQty(Math.abs(diff)) : "Sobrando " + formatQty(diff)
      );
    });
    var errors = rows.filter(function (row) { return row.status !== "CORRETO"; }).length;
    var totalQty = items.reduce(function (sum, item) { return sum + Number(item.requestedQty || 0); }, 0);
    return {
      version: 1,
      checkedAt: new Date().toISOString(),
      checkedBy: { id: authState.currentUser.id, name: authState.currentUser.name },
      transfer: { id: transfer.id, code: transfer.code, name: transfer.name },
      note: {
        key: transfer.id,
        number: transferDisplayName(transfer) || transfer.code || transfer.id,
        issuedAt: transfer.createdAt,
        emitterName: "WMS Estoque",
        destinationName: transferRouteDestinationLabel(transfer),
        destinationCnpj: transfer.establishmentCnpj || ""
      },
      summary: {
        correct: errors === 0,
        xmlItems: items.length,
        transferItems: items.length,
        totalXmlQty: totalQty,
        errors: errors
      },
      rows: rows
    };
  }

  async function registerMissingTransferItems(transfer, stage) {
    var mode = stage === "LACRE" ? "LACRE" : "SEPARACAO";
    var inputType = "DIGITACAO_MANUAL";
    var items = getTransferItems(transfer.id).filter(function (item) { return !item.isExtra; });
    for (var i = 0; i < items.length; i += 1) {
      var item = items[i];
      var expected = mode === "LACRE" ? Number(item.separatedQty || 0) : Number(item.requestedQty || 0);
      var informed = mode === "LACRE" ? Number(item.packedQty || 0) : Number(item.separatedQty || 0);
      var missing = Math.max(0, expected - informed);
      if (!missing) continue;
      item.missingQty = Math.max(Number(item.missingQty || 0), missing);
      item.divergenceType = "FALTA_DE_ITEM";
      item.status = mode === "LACRE" ? (informed > 0 ? "ENVIADO_PARCIAL" : "FALTA_TOTAL") : (informed > 0 ? "SEPARADO_COM_DIVERGENCIA" : "FALTA_TOTAL");
      item.pendingReason = item.pendingReason || "Separacao parcial autorizada";
      var update = Object.assign({
        quantidade_faltante: item.missingQty,
        divergence_type: item.divergenceType,
        status_operacional: transferOperationalStatusForItem(item),
        status_divergencia: transferDivergenceStatusForItem(item),
        status: item.status,
        motivo_pendencia: item.pendingReason,
        observacao_pendencia: item.pendingObservation || "",
        updated_at: new Date().toISOString()
      }, transferItemAuditDbFields(item));
      var response = await updateRowWithSchemaFallback("wms_transfer_items", "id", item.id, update);
      if (response.error) throw response.error;
      await registerTransferDivergence(transfer, item, "FALTA_DE_ITEM", expected, informed, -missing, inputType, "Finalizado com item pendente em " + mode + ".");
    }
    await markTransferHasDivergence(transfer);
  }

  async function finalizeTransferAfterConference(transfer, conference) {
    var report = getTransferFinalReport(transfer);
    var finalStatus = conference.summary.correct && report.divergences.length === 0 ? "CONCLUIDA_SEM_DIVERGENCIA" : "FINALIZADA_PARA_ANALISE";
    var now = new Date().toISOString();
    var stats = report.stats;
    var update = {
      status: finalStatus,
      finalizado_em: now,
      final_result: finalStatus === "CONCLUIDA_SEM_DIVERGENCIA" ? "CORRETA" : "PARA_ANALISE",
      duracao_segundos: secondsBetween(transfer.startedAt || transfer.createdAt, now),
      duracao_separacao_segundos: report.separationDurationSeconds,
      duracao_lacre_segundos: report.packingDurationSeconds,
      total_items: stats.totalItems,
      total_skus: stats.totalSkus,
      total_expected_quantity: stats.requested,
      total_separated_quantity: stats.separated,
      total_packed_quantity: stats.packed,
      has_divergence: finalStatus !== "CONCLUIDA_SEM_DIVERGENCIA",
      divergence_count: report.divergences.length,
      updated_at: now
    };
    var response = await updateTransferWithSchemaFallback(transfer.id, update);
    if (response.error && isMissingColumnError(response.error)) {
      response = await supabaseDb.from("wms_transfers").update({ status: finalStatus, updated_at: now }).eq("id", transfer.id);
    }
    if (response.error) throw response.error;
    await recordTransferEvent(transfer.id, "", "TRANSFER_FINALIZED", "", stats.separated || stats.packed, finalStatus, {
      finalStatus: finalStatus,
      finalResult: update.final_result,
      divergenceCount: report.divergences.length
    });
  }

  function parseNfeXml(xmlText) {
    var doc = new DOMParser().parseFromString(xmlText, "application/xml");
    if (xmlNodes(doc, "parsererror").length) throw new Error("Arquivo XML inválido.");
    if (doc.documentElement && doc.documentElement.localName === "wmsTransferConference") {
      return parseWmsTransferConferenceXml(doc);
    }
    var ide = xmlFirst(doc, "ide");
    var emit = xmlFirst(doc, "emit");
    var dest = xmlFirst(doc, "dest");
    var infNfe = xmlFirst(doc, "infNFe");
    var note = {
      key: infNfe && infNfe.getAttribute ? (infNfe.getAttribute("Id") || "").replace(/^NFe/, "") : xmlTextValue(xmlFirst(doc, "chNFe")),
      number: xmlTextValue(xmlFirst(ide, "nNF")),
      issuedAt: xmlTextValue(xmlFirst(ide, "dhEmi")),
      emitterName: xmlTextValue(xmlFirst(emit, "xNome")),
      emitterCnpj: xmlTextValue(xmlFirst(emit, "CNPJ")),
      destinationName: xmlTextValue(xmlFirst(dest, "xNome")),
      destinationCnpj: xmlTextValue(xmlFirst(dest, "CNPJ"))
    };
    var aggregate = {};
    xmlNodes(doc, "det").forEach(function (det) {
      var prod = xmlFirst(det, "prod");
      if (!prod) return;
      var sku = normalizeSku(xmlTextValue(xmlFirst(prod, "cProd"))) || normalizeText(xmlTextValue(xmlFirst(prod, "cProd")));
      if (!sku) return;
      var qty = parseXmlQuantity(xmlTextValue(xmlFirst(prod, "qCom")));
      if (!aggregate[sku]) {
        aggregate[sku] = {
          sku: sku,
          description: xmlTextValue(xmlFirst(prod, "xProd")),
          unit: xmlTextValue(xmlFirst(prod, "uCom")) || "UN",
          quantity: 0
        };
      }
      aggregate[sku].quantity += qty;
    });
    return { note: note, items: Object.keys(aggregate).map(function (sku) { return aggregate[sku]; }) };
  }

  function parseWmsTransferConferenceXml(doc) {
    var transferNode = xmlFirst(doc, "transfer");
    var destinationNode = xmlFirst(doc, "destination");
    var conferenceNode = xmlFirst(doc, "conferenceResponsible");
    var note = {
      key: xmlTextValue(xmlFirst(transferNode, "id")),
      number: xmlTextValue(xmlFirst(transferNode, "code")),
      issuedAt: xmlTextValue(xmlFirst(transferNode, "createdAt")),
      emitterName: "WMS Estoque",
      emitterCnpj: "",
      destinationName: xmlTextValue(xmlFirst(destinationNode, "name")),
      destinationCnpj: xmlTextValue(xmlFirst(destinationNode, "cnpj")),
      conferenceResponsible: xmlTextValue(xmlFirst(conferenceNode, "name"))
    };
    var items = xmlNodes(xmlFirst(doc, "items"), "item").map(function (itemNode) {
      return {
        sku: normalizeSku(xmlTextValue(xmlFirst(itemNode, "sku"))) || normalizeText(xmlTextValue(xmlFirst(itemNode, "sku"))),
        description: xmlTextValue(xmlFirst(itemNode, "description")),
        unit: xmlTextValue(xmlFirst(itemNode, "unit")) || "UN",
        quantity: parseXmlQuantity(xmlTextValue(xmlFirst(itemNode, "requestedQty")))
      };
    }).filter(function (item) {
      return item.sku;
    });
    return { note: note, items: items };
  }

  function buildXmlConference(transfer, parsed) {
    var transferItems = getTransferItems(transfer.id);
    var transferBySku = {};
    transferItems.forEach(function (item) {
      transferBySku[normalizeSkuKey(item.sku)] = item;
    });
    var seen = {};
    var rows = parsed.items.map(function (xmlItem) {
      var item = transferBySku[normalizeSkuKey(xmlItem.sku)];
      seen[normalizeSkuKey(xmlItem.sku)] = true;
      if (!item) {
        return xmlConferenceRow(xmlItem.sku, xmlItem.description, "", xmlItem.quantity, 0, 0, "SKU não está na transferência");
      }
      var actualQty = getTransferCheckedQty(item, transfer);
      var diff = actualQty - Number(xmlItem.quantity || 0);
      return xmlConferenceRow(
        xmlItem.sku,
        xmlItem.description,
        item.description,
        xmlItem.quantity,
        item.separatedQty,
        actualQty,
        Math.abs(diff) < 0.0001 ? "CORRETO" : diff < 0 ? "Faltando " + formatQty(Math.abs(diff)) : "Sobrando " + formatQty(diff)
      );
    });
    transferItems.forEach(function (item) {
      if (seen[normalizeSkuKey(item.sku)]) return;
      var actualQty = getTransferCheckedQty(item, transfer);
      rows.push(xmlConferenceRow(item.sku, "", item.description, 0, item.separatedQty, actualQty, "SKU não consta no XML"));
      rows[rows.length - 1].difference = actualQty;
    });
    var errors = rows.filter(function (row) { return row.status !== "CORRETO"; }).length;
    var totalXmlQty = parsed.items.reduce(function (sum, item) { return sum + Number(item.quantity || 0); }, 0);
    return {
      version: 1,
      checkedAt: new Date().toISOString(),
      checkedBy: { id: authState.currentUser.id, name: authState.currentUser.name },
      transfer: { id: transfer.id, code: transfer.code, name: transfer.name },
      note: parsed.note,
      summary: {
        correct: errors === 0,
        xmlItems: parsed.items.length,
        transferItems: transferItems.length,
        totalXmlQty: totalXmlQty,
        errors: errors
      },
      rows: rows
    };
  }

  function xmlConferenceRow(sku, xmlDescription, transferDescription, xmlQty, separatedQty, packedQty, status) {
    var actualQty = Number(packedQty || 0);
    return {
      sku: sku,
      xmlDescription: xmlDescription || "",
      transferDescription: transferDescription || "",
      xmlQty: Number(xmlQty || 0),
      separatedQty: Number(separatedQty || 0),
      packedQty: Number(packedQty || 0),
      difference: actualQty - Number(xmlQty || 0),
      status: status
    };
  }

  function xmlNodes(root, localName) {
    if (!root) return [];
    return Array.prototype.slice.call(root.getElementsByTagName("*")).filter(function (node) {
      return node.localName === localName;
    });
  }

  function xmlFirst(root, localName) {
    return xmlNodes(root, localName)[0] || null;
  }

  function xmlTextValue(node) {
    return node ? normalizeText(node.textContent) : "";
  }

  async function renderSkuSearch() {
    var queryStartedAt = performance.now();
    window.clearTimeout(skuSearchTimer);
    var sku = firstSkuValue($("skuSearchInput").value);
    var list = [];
    var requestSeq = ++skuSearchRequestSeq;
    if (!sku) {
      setStatus("skuSearchStatus", "Informe ou bipe um SKU.", "error");
      $("skuResults").innerHTML = "";
      $("skuResultCards").innerHTML = "";
      renderSkuOperationalHub("", [], null, "");
      $("skuResultActions").hidden = true;
      recordPerformanceMetric("lastSkuQueryMs", queryStartedAt);
      return;
    }
    lastSkuSearch = sku;
    list = findBySku(sku);
    refreshProductNamesForBindings(list);
    setStatus("skuSearchStatus", "Consultando SKU " + sku + " no estoque " + activeWarehouseCode() + "...", "warning");
    var stockSuggestion = null;
    var stockError = "";
    try {
      stockSuggestion = await stockService().getReplenishmentSuggestion(sku, activeWarehouseCode());
    } catch (error) {
      stockError = missingStockSchemaMessage(error);
      recordPerformanceError("consulta-sku-estoque", error);
    }
    if (requestSeq !== skuSearchRequestSeq) return;
    addHistory("SKU consultado", sku, "", stockSuggestion && stockSuggestion.baseFound !== false ? "Consulta CAPTACAO encontrou o produto." : "Produto não encontrado na base da CAPTAÇÃO.");
    var hasStockData = stockSuggestion && stockSuggestion.baseFound !== false;
    if (!hasStockData) {
      setStatus("skuSearchStatus", stockError || "Produto não encontrado na base da CAPTAÇÃO.", stockError ? "error" : "warning");
    } else if (!stockSuggestion.captureLocation) {
      setStatus("skuSearchStatus", "Produto encontrado na CAPTAÇÃO, sem localização cadastrada.", "warning");
    } else {
      setStatus("skuSearchStatus", "Produto encontrado na CAPTAÇÃO.", "success");
    }
    $("skuResults").innerHTML = "";
    renderSkuOperationalHub(sku, list, stockSuggestion, stockError);
    try {
      $("skuResultCards").innerHTML = list.map(function (binding, index) {
        return skuLocationCardHtml(binding, index === 0);
      }).join("");
      bindActionButtons($("skuResultCards"));
    } catch (renderError) {
      $("skuResultCards").innerHTML = "";
      recordPerformanceError("consulta-sku-localizacoes", renderError);
    }
    $("skuResultActions").hidden = false;
    clearSkuSearchInput();
    recordPerformanceMetric("lastSkuQueryMs", queryStartedAt);
  }

  function clearSkuSearchInput() {
    $("skuSearchInput").value = "";
    window.setTimeout(function () {
      $("skuSearchInput").focus();
    }, 60);
  }

  function resetSkuSearchView() {
    lastSkuSearch = "";
    $("skuSearchInput").value = "";
    $("skuResults").innerHTML = "";
    $("skuResultCards").innerHTML = "";
    renderSkuOperationalHub("", [], null, "");
    $("skuResultActions").hidden = true;
    setStatus("skuSearchStatus", "", "");
    window.setTimeout(function () { $("skuSearchInput").focus(); }, 60);
  }

  function allocateLastSkuSearch() {
    if (lastSkuSearch) $("skuInput").value = lastSkuSearch;
    setLocationScanEnabled(Boolean(lastSkuSearch));
    showScreen("bipagem");
    if (lastSkuSearch) {
      currentSku = lastSkuSearch;
      renderScanResults(findBySku(lastSkuSearch));
      $("locationInput").focus();
    }
  }

  function renderSkuOperationalHub(sku, locations, stockSuggestion, stockError) {
    var hub = $("skuOperationalHub");
    if (!hub) return;
    sku = normalizeSku(sku || "");
    if (!sku) {
      skuSearchState = { currentSku: "", locations: [], stockSuggestion: null, stockError: "" };
      hub.hidden = true;
      hub.innerHTML = "";
      return;
    }
    var suggestion = buildSkuReplenishmentSuggestion(sku, locations || [], stockSuggestion);
    skuSearchState = {
      currentSku: sku,
      locations: locations || [],
      stockSuggestion: suggestion,
      stockError: stockError || ""
    };
    var tone = suggestion.suggestionPriority === 1 || suggestion.suggestionPriority === 3 ? "danger" : suggestion.suggestionPriority === 2 ? "warning" : "info";
    var suggestionQty = Number(suggestion.suggestedReplenishmentQty || 0);
    var card = document.createElement("section");
    card.className = "sku-hub-card";

    var title = document.createElement("div");
    title.className = "sku-hub-title";
    title.appendChild(skuHubTextElement("span", "Produto"));
    title.appendChild(skuHubTextElement("strong", sku));
    title.appendChild(skuHubTextElement("p", suggestion.name || "Produto sem nome"));
    card.appendChild(title);

    var grid = document.createElement("div");
    grid.className = "sku-hub-grid";
    grid.appendChild(skuHubTile("Localizacao CAPTACAO", suggestion.captureLocation || "Sem localizacao"));
    grid.appendChild(skuHubTile("Saldo Loja", suggestion.storeAvailable === null || suggestion.storeAvailable === undefined ? "Nao importado" : formatQty(suggestion.storeAvailable)));
    grid.appendChild(skuHubTile("Captacao fisico", formatQty(suggestion.capturePhysical)));
    grid.appendChild(skuHubTile("Captacao alocado", formatQty(suggestion.captureAllocated)));
    grid.appendChild(skuHubTile("Captacao disponivel", formatQty(suggestion.captureAvailable)));
    card.appendChild(grid);

    var replenishment = document.createElement("div");
    replenishment.className = "sku-replenishment-box tone-" + tone;
    var replenishmentText = document.createElement("div");
    replenishmentText.appendChild(skuHubTextElement("span", "Reposicao"));
    replenishmentText.appendChild(skuHubTextElement("strong", suggestion.alertMessage || "Pedido manual disponivel para este SKU."));
    replenishmentText.appendChild(skuHubTextElement("p", suggestionQty > 0 ? "Quantidade sugerida: " + formatQty(suggestionQty) : "Informe a quantidade no pedido, se precisar repor."));
    if (stockError) replenishmentText.appendChild(skuHubTextElement("p", stockError, "sku-stock-error"));
    replenishment.appendChild(replenishmentText);

    var createButton = skuHubTextElement("button", "Criar pedido de reposicao", "primary-button");
    createButton.type = "button";
    createButton.dataset.skuCreateReplenishment = sku;
    replenishment.appendChild(createButton);
    card.appendChild(replenishment);

    hub.replaceChildren(card);
    hub.hidden = false;
    hub.removeAttribute("hidden");
  }

  function skuHubTile(label, value) {
    var tile = document.createElement("span");
    tile.appendChild(skuHubTextElement("small", label));
    tile.appendChild(skuHubTextElement("strong", value || "-"));
    return tile;
  }

  function skuHubTextElement(tagName, value, className) {
    var element = document.createElement(tagName);
    if (className) element.className = className;
    element.textContent = value === null || value === undefined ? "" : String(value);
    return element;
  }

  function buildSkuReplenishmentSuggestion(sku, locations, stockSuggestion) {
    var suggestion = stockSuggestion ? Object.assign({}, stockSuggestion) : {
      sku: sku,
      name: "",
      storeAvailable: null,
      capturePhysical: 0,
      captureAllocated: 0,
      captureAvailable: 0,
      captureLocation: "",
      officialLocation: ""
    };
    var classification = classifyReplenishmentSuggestion(suggestion);
    suggestion.sku = sku;
    suggestion.name = suggestion.name || findProductName(sku) || "";
    suggestion.officialLocation = "";
    suggestion.suggestionType = classification ? classification.type : "MANUAL";
    suggestion.suggestionPriority = classification ? classification.priority : 5;
    suggestion.suggestedReplenishmentQty = classification ? classification.qty : 0;
    suggestion.alertMessage = classification ? classification.message : "Produto consultado. Crie pedido manual se houver necessidade operacional.";
    suggestion.source = "consultaSku";
    suggestion.productInfo = {
      sku: sku,
      name: suggestion.name,
      storeBalance: suggestion.storeAvailable,
      captureBalance: suggestion.captureAvailable,
      wmsLocation: "",
      wmsStation: "",
      wmsRack: "",
      wmsLine: "",
      wmsColumn: "",
      captureLocation: suggestion.captureLocation || "",
      captureStation: suggestion.captureStation || "",
      captureRack: suggestion.captureRack || "",
      captureLine: suggestion.captureLine || "",
      captureColumn: suggestion.captureColumn || ""
    };
    return suggestion;
  }

  function handleSkuOperationalHubClick(event) {
    var button = event.target.closest("[data-sku-create-replenishment]");
    if (!button) return;
    var sku = normalizeSku(button.dataset.skuCreateReplenishment || skuSearchState.currentSku || "");
    if (!sku) return;
    var suggestion = skuSearchState.stockSuggestion || buildSkuReplenishmentSuggestion(sku, skuSearchState.locations || [], null);
    openReplenishmentSuggestionModal(suggestion);
  }

  function renderShelfSearch() {
    var parsed = normalizeLocation($("shelfSearchInput").value);
    if (!parsed.valid) {
      setStatus("shelfSearchStatus", "Codigo de prateleira invalido.", "error");
      $("shelfResults").innerHTML = "";
      $("shelfSummary").innerHTML = "";
      $("shelfResultCards").innerHTML = "";
      return;
    }
    $("shelfSearchInput").value = parsed.code;
    var list = findByLocation(parsed.code);
    addHistory("Prateleira consultada", "", parsed.code, list.length ? "Consulta encontrou SKUs." : "Nenhum SKU encontrado.");
    if (!list.length) {
      setStatus("shelfSearchStatus", "Nenhum SKU encontrado nesta prateleira.", "warning");
      $("shelfResults").innerHTML = "";
      $("shelfSummary").innerHTML = "";
      $("shelfResultCards").innerHTML = "";
      saveData();
      return;
    }
    refreshProductNamesForBindings(list);
    var hasShelfConflict = list.some(function (binding) { return findBySku(binding.sku).length > 1; });
    setStatus("shelfSearchStatus", hasShelfConflict ? "Prateleira encontrada com SKU em conflito de localizacao." : list.length + " SKU(s) encontrado(s) nesta prateleira.", hasShelfConflict ? "warning" : "success");
    $("shelfSummary").innerHTML = [
      summaryChip("Prateleira", parsed.code),
      summaryChip("Rua", pad2(parsed.rua)),
      summaryChip("Rack", parsed.rack),
      summaryChip("Linha", parsed.linha),
      summaryChip("Total de SKUs", list.length)
    ].join("");
    $("shelfResults").innerHTML = list.map(shelfTableRowHtml).join("");
    bindActionButtons($("shelfResults"));
    $("shelfResultCards").innerHTML = list.map(function (binding) {
      return skuLocationCardHtml(binding, false);
    }).join("");
    bindActionButtons($("shelfResultCards"));
    saveData();
  }

  function skuLocationCardHtml(binding, latest) {
    var productName = binding.productName || findProductName(binding.sku) || "-";
    var hasConflict = findBySku(binding.sku).length > 1;
    var locationPeers = findByLocation(binding.locationCode).filter(function (item) {
      return item.id !== binding.id && !isSameSku(item.sku, binding.sku);
    }).slice().sort(sortByDateDesc);
    var peerHtml = locationPeers.length ? [
      "<div class=\"sku-card-neighbors\">",
      "<strong>Esta localizacao possui outros SKUs cadastrados.</strong>",
      locationPeers.slice(0, 6).map(function (item) {
        var peerName = item.productName || findProductName(item.sku) || "-";
        return "<span>" + escapeHtml(item.sku) + " - " + escapeHtml(peerName) + "</span>";
      }).join(""),
      locationPeers.length > 6 ? "<small>+" + (locationPeers.length - 6) + " outro(s) SKU(s)</small>" : "",
      "</div>"
    ].join("") : "";
    return [
      "<article class=\"sku-location-card" + (latest ? " latest" : "") + "\">",
      "<div class=\"sku-card-head\">",
      "<div><strong>" + escapeHtml(binding.sku) + "</strong><span>" + escapeHtml(productName) + "</span></div>",
      latest ? "<span class=\"latest-pill\">Mais recente</span>" : "",
      hasConflict ? "<span class=\"status-badge pending\">SKU em conflito</span>" : "",
      "</div>",
      "<div class=\"sku-location-code\">" + escapeHtml(binding.locationCode) + "</div>",
      "<div class=\"sku-location-grid\">",
      "<span>Rua<strong>" + pad2(binding.rua) + "</strong></span>",
      "<span>Rack<strong>" + binding.rack + "</strong></span>",
      "<span>Linha<strong>" + binding.linha + "</strong></span>",
      "<span>Letra<strong>" + escapeHtml(binding.letra) + "</strong></span>",
      "</div>",
      "<div class=\"sku-card-meta\">",
      "<span class=\"sku-card-area\">Area Linha Separacao<strong>" + escapeHtml(binding.areaName || "-") + "</strong></span>",
      "<span class=\"sku-card-date\">Data de cadastro<strong>" + formatDateTime(binding.createdAt) + "</strong></span>",
      "</div>",
      peerHtml,
      "<div class=\"result-actions\">",
      "<button class=\"edit-small\" data-edit=\"" + binding.id + "\" type=\"button\">Editar</button>",
      "<button class=\"remove-small\" data-remove=\"" + binding.id + "\" type=\"button\">Remover</button>",
      "</div>",
      "</article>"
    ].join("");
  }

  function skuTableRowHtml(binding) {
    var productName = binding.productName || findProductName(binding.sku) || "-";
    var hasConflict = findBySku(binding.sku).length > 1;
    return [
      "<tr>",
      "<td class=\"mobile-result-summary\">",
      "<div class=\"mobile-result-location\">" + escapeHtml(binding.locationCode) + "</div>",
      "<div class=\"mobile-result-product\">" + escapeHtml(binding.sku) + " - " + escapeHtml(productName) + "</div>",
      "<div class=\"mobile-result-grid\"><span>Rua<strong>" + pad2(binding.rua) + "</strong></span><span>Rack<strong>" + binding.rack + "</strong></span><span>Linha<strong>" + binding.linha + "</strong></span><span>Letra<strong>" + escapeHtml(binding.letra) + "</strong></span></div>",
      "</td>",
      "<td data-label=\"SKU\">" + escapeHtml(binding.sku) + (hasConflict ? "<br><span class=\"status-badge pending\">Conflito</span>" : "") + "</td>",
      "<td data-label=\"Produto\">" + escapeHtml(productName) + "</td>",
      "<td data-label=\"Rua\">" + pad2(binding.rua) + "</td>",
      "<td data-label=\"Rack\">" + binding.rack + "</td>",
      "<td data-label=\"Linha\">" + binding.linha + "</td>",
      "<td data-label=\"Letra\">" + escapeHtml(binding.letra) + "</td>",
      "<td data-label=\"Codigo tecnico\">" + escapeHtml(binding.locationCode) + "</td>",
      "<td data-label=\"Area\">" + escapeHtml(binding.areaName) + "</td>",
      "<td data-label=\"Data\">" + formatDateTime(binding.createdAt) + "</td>",
      "<td data-label=\"Acoes\"><div class=\"row-actions\"><button class=\"edit-small\" data-edit=\"" + binding.id + "\" type=\"button\">Editar</button><button class=\"remove-small\" data-remove=\"" + binding.id + "\" type=\"button\">Remover</button></div></td>",
      "</tr>"
    ].join("");
  }

  function shelfTableRowHtml(binding) {
    var hasConflict = findBySku(binding.sku).length > 1;
    return [
      "<tr>",
      "<td>" + escapeHtml(binding.sku) + (hasConflict ? "<br><span class=\"status-badge pending\">Conflito</span>" : "") + "</td>",
      "<td>" + escapeHtml(binding.productName || findProductName(binding.sku) || "-") + "</td>",
      "<td>" + escapeHtml(binding.locationCode) + "</td>",
      "<td>" + pad2(binding.rua) + "</td>",
      "<td>" + binding.rack + "</td>",
      "<td>" + binding.linha + "</td>",
      "<td>" + escapeHtml(binding.letra) + "</td>",
      "<td>" + escapeHtml(binding.areaName) + "</td>",
      "<td><div class=\"row-actions\"><button class=\"edit-small\" data-edit=\"" + binding.id + "\" type=\"button\">Editar</button><button class=\"remove-small\" data-remove=\"" + binding.id + "\" type=\"button\">Remover</button></div></td>",
      "</tr>"
    ].join("");
  }

  function summaryChip(label, value, className) {
    return "<div class=\"summary-chip" + (className ? " " + escapeHtml(className) : "") + "\"><span>" + label + "</span><strong>" + escapeHtml(String(value)) + "</strong></div>";
  }

  function bindActionButtons(root) {
    root.querySelectorAll("[data-edit]").forEach(function (button) {
      button.addEventListener("click", function () {
        editBinding(button.dataset.edit);
      });
    });
    root.querySelectorAll("[data-remove]").forEach(function (button) {
      button.addEventListener("click", function () {
        removeBinding(button.dataset.remove);
      });
    });
  }

  function editBinding(id) {
    var binding = state.bindings.find(function (item) { return item.id === id; });
    if (!binding) return;
    editingId = id;
    currentSku = binding.sku;
    $("skuInput").value = binding.sku;
    $("locationInput").value = binding.locationCode;
    $("areaSelect").value = String(binding.areaCode);
    setLocationScanEnabled(true);
    showScreen("bipagem");
    setScanMessage("Edite a prateleira e confirme o endereçamento.", "warning");
  }

  function removeBinding(id) {
    var binding = state.bindings.find(function (item) { return item.id === id; });
    if (!binding) return;
    var ok = window.confirm("Remover o vinculo do SKU " + binding.sku + " com o endereco " + binding.locationCode + "?");
    if (!ok) return;
    state.bindings = state.bindings.filter(function (item) { return item.id !== id; });
    if (isSupabaseReady()) {
      supabaseDb.from("wms_bindings").delete().eq("id", id).then(function (response) {
        if (response.error) showToast("Nao foi possivel remover no Supabase.", "error");
      });
    }
    addHistory("Endereco removido", binding.sku, binding.locationCode, "Vinculo removido pelo usuario.");
    saveData();
    renderAll();
    if ($("consultaSku").classList.contains("active") && $("skuSearchInput").value.trim()) {
      renderSkuSearch();
    }
    if ($("consultaPrateleira").classList.contains("active") && $("shelfSearchInput").value.trim()) {
      renderShelfSearch();
    }
    if ($("bipagem").classList.contains("active") && currentSku) {
      renderScanResults(findBySku(currentSku));
    }
    showToast("Vinculo removido.", "success");
  }

  function generateLabels(printAfter) {
    var range = readLabelRange();
    if (!range.valid) {
      showToast(range.message, "error");
      return;
    }
    var codes = [];
    for (var rua = range.ruaStart; rua <= range.ruaEnd; rua += 1) {
      for (var rack = range.rackStart; rack <= range.rackEnd; rack += 1) {
        for (var linha = range.linhaStart; linha <= range.linhaEnd; linha += 1) {
          for (var letterIndex = range.letraStartIndex; letterIndex <= range.letraEndIndex; letterIndex += 1) {
            var letra = numberToExcelLetters(letterIndex);
            codes.push(normalizeLocation("R" + rua + "-RK" + rack + "-L" + linha + "-" + letra).code);
          }
        }
      }
    }
    renderLabels(codes);
    addHistory("Etiqueta gerada", "", codes.length === 1 ? codes[0] : "", codes.length + " etiqueta(s) gerada(s).");
    saveData();
    showToast(codes.length + " etiqueta(s) pronta(s).", "success");
    if (printAfter) {
      window.setTimeout(function () { window.print(); }, 250);
    }
  }

  function clearLabelsPreview() {
    $("labelsPreview").innerHTML = "";
    if ($("labelsPrintSheet")) $("labelsPrintSheet").innerHTML = "";
    showToast("Visualizacao de etiquetas limpa.", "success");
  }

  function readLabelRange() {
    var range = {
      ruaStart: positiveInt($("labelRuaStart").value),
      ruaEnd: positiveInt($("labelRuaEnd").value),
      rackStart: positiveInt($("labelRackStart").value),
      rackEnd: positiveInt($("labelRackEnd").value),
      linhaStart: positiveInt($("labelLinhaStart").value),
      linhaEnd: positiveInt($("labelLinhaEnd").value),
      letraStartIndex: excelLettersToNumber($("labelLetraStart").value),
      letraEndIndex: excelLettersToNumber($("labelLetraEnd").value)
    };
    var validNumbers = range.ruaStart && range.ruaEnd && range.rackStart && range.rackEnd && range.linhaStart && range.linhaEnd;
    if (!validNumbers || !range.letraStartIndex || !range.letraEndIndex) {
      return { valid: false, message: "Preencha todos os campos de etiquetas com valores validos." };
    }
    if (range.ruaStart > range.ruaEnd || range.rackStart > range.rackEnd || range.linhaStart > range.linhaEnd || range.letraStartIndex > range.letraEndIndex) {
      return { valid: false, message: "Os campos finais devem ser maiores ou iguais aos iniciais." };
    }
    var total = (range.ruaEnd - range.ruaStart + 1) * (range.rackEnd - range.rackStart + 1) * (range.linhaEnd - range.linhaStart + 1) * (range.letraEndIndex - range.letraStartIndex + 1);
    if (total > 500) {
      return { valid: false, message: "Gere no maximo 500 etiquetas por lote." };
    }
    range.valid = true;
    return range;
  }

  function renderLabels(codes) {
    var container = $("labelsPreview");
    var labelsHtml = codes.map(labelCardHtml).join("");
    container.innerHTML = labelsHtml;
    if ($("labelsPrintSheet")) $("labelsPrintSheet").innerHTML = labelsHtml;
    window.setTimeout(function () {
      document.querySelectorAll(".barcode").forEach(function (svg) {
        if (window.JsBarcode) {
          window.JsBarcode(svg, svg.dataset.code, {
            format: "CODE128",
            width: 1.35,
            height: 42,
            displayValue: false,
            margin: 2
          });
        }
      });
    }, 50);
  }

  function labelCardHtml(code, index) {
    var parsed = normalizeLocation(code);
    return [
      "<article class=\"label-card\">",
      "<h3>" + parsed.code + "</h3>",
      "<svg class=\"barcode\" data-label-index=\"" + index + "\" data-code=\"" + parsed.code + "\" aria-label=\"" + parsed.code + "\"></svg>",
      "</article>"
    ].join("");
  }

  async function exportExcel() {
    if (!ensureActiveWarehouse()) return;
    if (!window.XLSX) {
      showToast("Biblioteca xlsx nao carregada. Verifique a conexao com a internet.", "error");
      return;
    }
    if (!(await ensureWarehouseSeparatedTable("wms_bindings", "exportStatus"))) return;
    var actionButton = $("exportExcelButton");
    if (!beginTransferAction("export-addresses", actionButton, "Exportando...")) return;
    try {
    var validation = validateAddressExportState();
    if (!validation.valid) {
      if (validation.type === "sku-conflict" && isAdmin()) {
        var proceed = window.confirm("Exportar com conflito pode gerar duplicidade no Videmais. Deseja continuar?");
        if (!proceed) {
          showToast(validation.message, "error");
          if ($("exportStatus")) setStatus("exportStatus", validation.message, "error");
          return;
        }
      } else {
      showToast(validation.message, "error");
      if ($("exportStatus")) setStatus("exportStatus", validation.message, "error");
      return;
      }
    }
    var exportRows = createLinhaSeparacaoExportRows();
    var resolvedLocationChanges = Number(validation.resolvedSkuConflicts || 0);
    var rows = [REQUIRED_COLUMNS].concat(exportRows);
    var worksheet = window.XLSX.utils.aoa_to_sheet(rows);
    var range = window.XLSX.utils.decode_range(worksheet["!ref"] || "A1:G1");
    for (var row = 1; row <= range.e.r; row += 1) {
      var areaCellRef = window.XLSX.utils.encode_cell({ r: row, c: 2 });
      if (worksheet[areaCellRef]) {
        worksheet[areaCellRef].t = "s";
        worksheet[areaCellRef].v = String(worksheet[areaCellRef].v);
      }
      var lineCellRef = window.XLSX.utils.encode_cell({ r: row, c: 3 });
      if (worksheet[lineCellRef]) {
        worksheet[lineCellRef].t = "s";
        worksheet[lineCellRef].v = String(worksheet[lineCellRef].v);
      }
      var columnCellRef = window.XLSX.utils.encode_cell({ r: row, c: 4 });
      if (worksheet[columnCellRef]) {
        worksheet[columnCellRef].t = "s";
        worksheet[columnCellRef].v = String(worksheet[columnCellRef].v);
      }
      var skuCellRef = window.XLSX.utils.encode_cell({ r: row, c: 5 });
      if (worksheet[skuCellRef]) {
        worksheet[skuCellRef].t = "s";
        worksheet[skuCellRef].v = String(worksheet[skuCellRef].v);
      }
    }
    worksheet["!cols"] = [
      { wch: 14 },
      { wch: 10 },
      { wch: 20 },
      { wch: 10 },
      { wch: 10 },
      { wch: 16 },
      { wch: 24 }
    ];
    var legendSheet = window.XLSX.utils.aoa_to_sheet(LEGEND_ROWS);
    legendSheet["!cols"] = [
      { wch: 28 },
      { wch: 90 },
      { wch: 14 },
      { wch: 80 }
    ];
    var workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, worksheet, "LinhaSeparacao");
    window.XLSX.utils.book_append_sheet(workbook, legendSheet, "Legenda");
    var fileName = "LinhaSeparacao_Enderecamento_" + dateForFileName(new Date()) + ".xlsx";
    window.XLSX.writeFile(workbook, fileName);
    addHistory(
      "Excel exportado",
      "",
      "",
      exportRows.length + " linha(s) exportada(s) no modelo LinhaSeparacao." +
        (resolvedLocationChanges ? " " + resolvedLocationChanges + " SKU(s) com localização antiga foram mantidos apenas no endereço mais recente." : "")
    );
    await saveData();
    var exportMessage = "Excel exportado no modelo LinhaSeparacao, com uma linha por SKU." +
      (resolvedLocationChanges ? " As localizações antigas de " + resolvedLocationChanges + " SKU(s) foram removidas da exportação." : "");
    if ($("exportStatus")) setStatus("exportStatus", exportMessage, "success");
    showToast(exportMessage, "success");
    } finally {
      endTransferAction(actionButton);
    }
  }

  function validateAddressExportState() {
    var report = buildAddressMaintenanceReport();
    if (report.locationDuplicates.length) {
      return { valid: false, message: "Existem duplicidades exatas do mesmo SKU na mesma localizacao. Corrija antes de exportar." };
    }
    if (report.skuConflicts.length) {
      return { valid: true, resolvedSkuConflicts: report.skuConflicts.length, message: "" };
    }
    if (report.invalidRows.length) {
      return { valid: false, message: "Existem enderecamentos com campos invalidos. Corrija antes de exportar." };
    }
    return { valid: true, message: "" };
  }

  function linhaSeparacaoRowFromBinding(binding) {
    return linhaSeparacaoRow(binding.rua, binding.rack, binding.areaCode, binding.linha, binding.letra, firstSkuValue(binding.sku));
  }

  function createLinhaSeparacaoExportRows() {
    var bindingsByLocation = {};
    var exportedSkuKeys = {};
    activeWarehouseBindings().slice().sort(sortByDateDesc).forEach(function (binding) {
      var locationCode = locationKeyFromBinding(binding);
      if (!locationCode) return;
      var skus = splitSkuValues(binding.sku);
      if (!skus.length) skus = [firstSkuValue(binding.sku)];
      skus.filter(Boolean).forEach(function (sku) {
        var skuKey = normalizeSkuKey(sku);
        if (exportedSkuKeys[skuKey]) return;
        exportedSkuKeys[skuKey] = true;
        if (!bindingsByLocation[locationCode]) bindingsByLocation[locationCode] = [];
        bindingsByLocation[locationCode].push(Object.assign({}, binding, {
          sku: sku,
          locationCode: locationCode
        }));
      });
    });
    Object.keys(bindingsByLocation).forEach(function (locationCode) {
      bindingsByLocation[locationCode].sort(sortByLocationThenSku);
    });

    var usedLocations = {};
    var rows = [];
    buildLinhaSeparacaoTemplateRows().forEach(function (templateRow) {
      var locationCode = locationKeyFromCode(templateRow.locationCode);
      var bindings = bindingsByLocation[locationCode] || [];
      usedLocations[locationCode] = true;
      if (!bindings.length) {
        rows.push(linhaSeparacaoRow(templateRow.rua, templateRow.rack, templateRow.area, templateRow.linha, templateRow.letra, ""));
        return;
      }
      bindings.forEach(function (binding) {
        rows.push(linhaSeparacaoRow(templateRow.rua, templateRow.rack, templateRow.area, templateRow.linha, templateRow.letra, firstSkuValue(binding.sku)));
      });
    });

    Object.keys(bindingsByLocation)
      .filter(function (locationCode) { return !usedLocations[locationCode]; })
      .reduce(function (bindings, locationCode) { return bindings.concat(bindingsByLocation[locationCode]); }, [])
      .sort(sortByLocationThenSku)
      .forEach(function (binding) {
        rows.push(linhaSeparacaoRowFromBinding(binding));
      });
    return rows;
  }

  function buildLinhaSeparacaoTemplateRows() {
    var rows = [];
    LINHA_SEPARACAO_TEMPLATE.forEach(function (rule) {
      for (var rack = rule.rackStart; rack <= rule.rackEnd; rack += 1) {
        for (var linha = 1; linha <= rule.lineEnd; linha += 1) {
          for (var columnIndex = 1; columnIndex <= vdMaisColumnLabelToNumber(rule.columnEnd); columnIndex += 1) {
            var letra = numberToVdMaisColumnLabel(columnIndex);
            rows.push({
              rua: rule.rua,
              rack: rack,
              area: rule.area,
              linha: linha,
              letra: letra,
              locationCode: normalizeLocation("R" + rule.rua + "-RK" + rack + "-L" + linha + "-" + letra).code
            });
          }
        }
      }
    });
    return rows;
  }

  function linhaSeparacaoRow(rua, rack, areaCode, linha, letra, sku) {
    return [
      "Rua " + pad2(rua),
      Number(rack),
      String(areaCode || 1),
      " " + Number(linha),
      formatLinhaSeparacaoColumn(letra),
      sku ? String(sku) : "",
      0
    ];
  }

  function formatLinhaSeparacaoColumn(letra) {
    var column = String(letra || "").toUpperCase();
    return column.length === 1 ? " " + column : column;
  }

  function sortByLocationThenSku(first, second) {
    var locationCompare =
      Number(first.rua || 0) - Number(second.rua || 0) ||
      Number(first.rack || 0) - Number(second.rack || 0) ||
      Number(first.linha || 0) - Number(second.linha || 0) ||
      vdMaisColumnLabelToNumber(first.letra || "") - vdMaisColumnLabelToNumber(second.letra || "");
    if (locationCompare) return locationCompare;
    return String(first.sku || "").localeCompare(String(second.sku || ""), "pt-BR", { numeric: true });
  }

  async function saveEstablishmentFromForm() {
    if (!isAdmin()) {
      setStatus("establishmentStatus", "Acesso restrito ao administrador.", "error");
      return;
    }
    var id = $("establishmentEditId").value;
    var code = normalizeText($("establishmentCodeInput").value);
    var name = normalizeText($("establishmentNameInput").value);
    var cnpj = normalizeText($("establishmentCnpjInput").value);
    var active = $("establishmentActiveInput").checked;
    if (!code || !name) {
      setStatus("establishmentStatus", "Informe código e nome.", "error");
      return;
    }
    var actionButton = $("saveEstablishmentButton");
    if (!beginTransferAction("save-establishment:" + (id || code), actionButton, "Salvando...")) return;
    try {
    var now = new Date().toISOString();
    var item = {
      id: id || randomId("est"),
      code: code,
      name: name,
      cnpj: cnpj,
      active: active,
      createdAt: id ? (transferState.establishments.find(function (entry) { return entry.id === id; }) || {}).createdAt : now,
      updatedAt: now
    };
    var response = await supabaseDb.from("wms_establishments").upsert(toDbEstablishment(item), { onConflict: "id" });
    if (response.error) {
      setStatus("establishmentStatus", "Erro ao salvar: " + formatSupabaseError(response.error), "error");
      return;
    }
    await loadTransferData();
    resetEstablishmentForm();
    renderTransfers();
    setStatus("establishmentStatus", "Estabelecimento salvo.", "success");
    } finally {
      endTransferAction(actionButton);
    }
  }

  function resetEstablishmentForm() {
    $("establishmentEditId").value = "";
    $("establishmentFormTitle").textContent = "Cadastrar estabelecimento";
    $("establishmentCodeInput").value = "";
    $("establishmentNameInput").value = "";
    $("establishmentCnpjInput").value = "";
    $("establishmentActiveInput").checked = true;
  }

  function editEstablishment(id) {
    var item = transferState.establishments.find(function (entry) { return entry.id === id; });
    if (!item) return;
    $("establishmentEditId").value = item.id;
    $("establishmentFormTitle").textContent = "Editar estabelecimento";
    $("establishmentCodeInput").value = item.code;
    $("establishmentNameInput").value = item.name;
    $("establishmentCnpjInput").value = item.cnpj;
    $("establishmentActiveInput").checked = item.active;
    setStatus("establishmentStatus", "Editando " + item.name + ".", "warning");
  }

  async function toggleEstablishment(id) {
    if (!isAdmin()) return;
    var item = transferState.establishments.find(function (entry) { return entry.id === id; });
    if (!item) return;
    var response = await supabaseDb.from("wms_establishments").update({ ativo: !item.active, updated_at: new Date().toISOString() }).eq("id", id);
    if (response.error) {
      showToast("Nao foi possivel alterar o estabelecimento.", "error");
      return;
    }
    await loadTransferData();
    renderTransfers();
  }

  async function previewTransferExcel() {
    var mode = $("transferImportModeInput").value || "MESSAGE";
    try {
      var parsed;
      if (mode === "EXCEL") {
        if (!window.XLSX) {
          setStatus("transferImportStatus", "Biblioteca xlsx nao carregada.", "error");
          return;
        }
        var file = ($("transferExcelInput").files || [])[0];
        if (!file) {
          setStatus("transferImportStatus", "Selecione uma planilha Excel.", "error");
          return;
        }
        var entry = await readWorkbookFile(file);
        parsed = parseTransferWorkbook(entry.workbook, file.name);
      } else {
        parsed = parseTransferMessage($("transferMessageInput").value);
      }
      transferState.previewSource = mode;
      transferState.previewRawText = mode === "MESSAGE" ? $("transferMessageInput").value : "";
      transferState.previewFileName = parsed.fileName || "";
      parsed = filterTransferPreviewByActiveWarehouse(parsed);
      await enrichTransferItemsWithStock(parsed.items || []);
      transferState.previewGroups = parsed.groups;
      transferState.previewItems = parsed.items;
      transferState.previewErrors = parsed.errors;
      applyDefaultResponsibleToTransferGroups();
      renderTransferPreview();
      var activeGroups = transferState.previewGroups.filter(function (group) { return !group.skipped; });
      var filterMessage = parsed.filteredOutGroups ? " " + parsed.filteredOutGroups + " transferencia(s) de outro estoque foram ocultadas." : "";
      setStatus("transferImportStatus", parsed.errors.length ? "Previa carregada com " + parsed.errors.length + " erro(s). Corrija antes de criar." : "Previa carregada: " + activeGroups.length + " transferencia(s), " + parsed.items.length + " item(ns)." + filterMessage, parsed.errors.length ? "error" : "success");
    } catch (error) {
      var message = isMissingStockTableError(error) || isMissingColumnError(error) ? missingStockSchemaMessage(error) : "Falha ao ler importacao: " + formatSupabaseError(error);
      setStatus("transferImportStatus", message, "error");
    }
  }

  function handleTransferImportModeChange() {
    var mode = $("transferImportModeInput").value || "MESSAGE";
    $("transferMessageImportBox").hidden = mode !== "MESSAGE";
    $("transferExcelImportBox").hidden = mode !== "EXCEL";
    clearTransferPreview();
    setStatus("transferImportStatus", "", "");
  }

  function clearTransferPreview() {
    transferState.previewItems = [];
    transferState.previewErrors = [];
    transferState.previewGroups = [];
    transferState.previewSource = "";
    transferState.previewRawText = "";
    transferState.previewFileName = "";
    renderTransferPreview();
  }

  function parseTransferMessage(rawText) {
    var raw = String(rawText || "");
    var lines = raw.split(/\r?\n/).map(normalizeText).filter(Boolean);
    var errors = [];
    var items = [];
    if (!lines.length) return { groups: [], items: [], errors: ["Cole a mensagem da transferencia."], fileName: "" };
    var route = parseTransferRoute(lines[0]);
    if (!route.ok) errors.push("Nao foi possivel identificar origem e destino na primeira linha.");
    for (var i = 1; i < lines.length; i += 1) {
      var item = parseTransferMessageItem(lines[i], i + 1);
      item.sourceCode = route.source || "";
      item.destinationCode = route.destination || "";
      item.sourceRaw = route.source || "";
      item.destinationRaw = route.destination || "";
      item.movementType = "";
      item.sourceLegalName = "";
      item.destinationLegalName = "";
      item.legalNameGroup = "";
      item.importSource = "MENSAGEM";
      if (item.errors.length) errors.push("Linha " + (i + 1) + ": " + item.errors.join(", "));
      items.push(item);
    }
    if (route.ok && !items.length) errors.push("Nenhum item encontrado na mensagem.");
    return buildTransferPreviewGroups(items, errors, "MENSAGEM", raw, "");
  }

  function parseTransferRoute(line) {
    var text = normalizeText(line)
      .replace(/\u2192/g, ">")
      .replace(/\s*-\s*>\s*/g, ">")
      .replace(/\s*=>\s*/g, ">")
      .replace(/\u2013|\u2014/g, "-");
    var parts = [];
    if (text.indexOf(">") >= 0) parts = text.split(">");
    else if (/\s+para\s+/i.test(text)) parts = text.split(/\s+para\s+/i);
    else if (/\s+-\s+/.test(text)) parts = text.split(/\s+-\s+/);
    if (parts.length < 2) return { ok: false, source: "", destination: "" };
    return { ok: true, source: normalizeStoreToken(parts[0]), destination: normalizeStoreToken(parts[1]) };
  }

  function parseTransferMessageItem(line, lineNumber) {
    var normalized = normalizeText(line).replace(/\u2013|\u2014/g, "-");
    var match = normalized.match(/^(\S+)\s+(.+?)\s+-\s*([\d.,]+)\s*(un|und|unidade|unidades|cx|cxs|caixa|caixas)?$/i)
      || normalized.match(/^(\S+)\s+(.+?)\s+([\d.,]+)\s*(un|und|unidade|unidades|cx|cxs|caixa|caixas)$/i);
    var errors = [];
    if (!match) return { sku: "", description: line, requestedQty: 0, unit: "UN", quantityType: "UNIDADE", boxQty: 0, unitsPerBox: 0, totalUnits: 0, sourceLine: lineNumber, errors: ["Linha nao interpretada"] };
    var sku = normalizeSku(match[1]) || normalizeText(match[1]);
    var description = normalizeText(match[2]);
    var qty = parseXmlQuantity(match[3]);
    var unit = normalizeTransferUnit(match[4]);
    if (!sku) errors.push("Codigo vazio");
    if (!description) errors.push("Descricao vazia");
    if (!qty || qty <= 0) errors.push("Quantidade invalida");
    return applyTransferQuantityType({ sku: sku, description: description, requestedQty: qty, unit: unit, sourceLine: lineNumber, errors: errors });
  }

  function normalizeTransferUnit(value) {
    var text = normalizeText(value || "UN").toUpperCase();
    if (/^(CX|CXS|CAIXA|CAIXAS)$/.test(text)) return "CX";
    if (/^(UN|UND|UNIDADE|UNIDADES)$/.test(text)) return "UN";
    return text || "UN";
  }

  function isBoxUnit(value) {
    return /^(CX|CXS|CAIXA|CAIXAS)$/.test(normalizeText(value || "").toUpperCase());
  }

  function applyTransferQuantityType(item) {
    var unit = normalizeTransferUnit(item.unit);
    var isBox = isBoxUnit(unit) || normalizeText(item.quantityType || "").toUpperCase() === "CAIXA";
    item.unit = isBox ? "CX" : unit;
    item.quantityType = isBox ? "CAIXA" : "UNIDADE";
    item.boxQty = isBox ? Number(item.requestedQty || 0) : 0;
    item.unitsPerBox = Number(item.unitsPerBox || 0);
    item.totalUnits = isBox ? (item.unitsPerBox > 0 ? Number(item.boxQty || 0) * item.unitsPerBox : Number(item.totalUnits || item.boxQty || item.requestedQty || 0)) : Number(item.totalUnits || item.requestedQty || 0);
    item.packedUnits = Number(item.packedUnits || 0);
    item.packagingObservation = item.packagingObservation || "";
    return item;
  }

  function detectTransferHeader(matrix) {
    var aliases = transferHeaderAliases();
    for (var r = 0; r < Math.min(matrix.length, 20); r += 1) {
      var row = matrix[r] || [];
      var map = {};
      row.forEach(function (cell, index) {
        if (normalizeText(cell) === "&" && map.legalNameGroup === undefined) map.legalNameGroup = index;
        var normalized = normalizeHeader(cell);
        if (!normalized) return;
        Object.keys(aliases).forEach(function (field) {
          if (aliases[field].indexOf(normalized) >= 0 && map[field] === undefined) map[field] = index;
        });
      });
      if (map.sku !== undefined && map.description !== undefined && map.quantity !== undefined && map.source !== undefined && map.destination !== undefined) {
        map.rowIndex = r;
        return map;
      }
    }
    return null;
  }

  function transferHeaderAliases() {
    return {
      sku: ["cod", "codigo", "sku", "codmaterial", "codigomaterial"].map(normalizeHeader),
      description: ["descricao", "produto", "nome", "item"].map(normalizeHeader),
      quantity: ["qtdtransferir", "qtd", "qtde", "quantidade", "quantidadetransferir"].map(normalizeHeader),
      source: ["retirarde", "origem", "lojaorigem", "de"].map(normalizeHeader),
      destination: ["levarpara", "destino", "lojadestino", "para"].map(normalizeHeader),
      movementType: ["perdacomo", "tipo", "tipomovimentacao"].map(normalizeHeader),
      sourceLegalName: ["razaosocial"].map(normalizeHeader),
      destinationLegalName: ["razaosocial2"].map(normalizeHeader),
      legalNameGroup: ["agrupamento", "agrupamentorazaosocial"].map(normalizeHeader),
      unit: ["unidade", "un", "um"].map(normalizeHeader)
    };
  }

  function valueAtHeader(row, header, field) {
    var index = header[field];
    return index === undefined ? "" : row[index];
  }

  function buildTransferPreviewGroups(items, errors, importSource, rawText, fileName) {
    var groupsByKey = {};
    items.forEach(function (item) {
      applyTransferItemLocation(item);
      applyKnownPackagingPattern(item);
      var key = (item.sourceCode || "") + ">" + (item.destinationCode || "");
      if (!groupsByKey[key]) groupsByKey[key] = {
        id: "grp-" + Object.keys(groupsByKey).length,
        key: key,
        sourceCode: item.sourceCode || "",
        destinationCode: item.destinationCode || "",
        origin: findTransferEstablishment(item.sourceCode),
        destination: findTransferEstablishment(item.destinationCode),
        items: [],
        errors: [],
        warnings: [],
        responsibleId: "",
        skipped: false,
        importSource: importSource,
        rawSourceText: rawText || "",
        fileName: fileName || ""
      };
      groupsByKey[key].items.push(item);
    });
    var groups = Object.keys(groupsByKey).map(function (key) {
      var group = groupsByKey[key];
      if (!group.origin) group.warnings.push("Origem sem cadastro: " + formatCodVfLabel(null, group.sourceCode));
      if (!group.destination) group.warnings.push("Destino sem cadastro: " + formatCodVfLabel(null, group.destinationCode));
      group.items.forEach(function (item) {
        if (group.errors.length) item.errors = unique(item.errors.concat(group.errors));
      });
      return group;
    });
    groups.forEach(function (group) {
      group.errors.forEach(function (error) { errors.push(error); });
    });
    return { groups: groups, items: items, errors: unique(errors), fileName: fileName || "" };
  }

  function filterTransferPreviewByActiveWarehouse(parsed) {
    var activeCode = activeWarehouseCode();
    var groups = parsed.groups || [];
    if (!activeCode || !groups.length) return parsed;
    var visibleGroups = groups.filter(function (group) {
      return transferGroupBelongsToActiveWarehouse(group, activeCode);
    });
    var visibleItems = [];
    visibleGroups.forEach(function (group) {
      group.items.forEach(function (item) { visibleItems.push(item); });
    });
    var visibleErrors = [];
    if (!groups.length && parsed.errors && parsed.errors.length) visibleErrors = parsed.errors.slice();
    visibleGroups.forEach(function (group) {
      group.errors.forEach(function (error) { visibleErrors.push(error); });
      group.items.forEach(function (item) {
        (item.errors || []).forEach(function (error) { visibleErrors.push("Linha " + item.sourceLine + ": " + error); });
      });
    });
    if (!visibleGroups.length && groups.length) {
      visibleErrors.push("Nenhuma transferência do estoque " + activeCode + " encontrada na importação.");
    }
    return {
      groups: visibleGroups,
      items: visibleItems,
      errors: unique(visibleErrors),
      fileName: parsed.fileName || "",
      filteredOutGroups: Math.max(0, groups.length - visibleGroups.length)
    };
  }

  function transferGroupBelongsToActiveWarehouse(group, activeCode) {
    var origin = group && group.origin;
    var tokens = [
      group && group.sourceCode,
      origin && origin.code,
      origin && origin.name,
      origin && origin.storeCode,
      origin && origin.internalCode,
      origin && origin.cnpj
    ];
    return tokens.some(function (token) {
      return transferStoreTokenMatchesWarehouse(token, activeCode);
    });
  }

  function transferStoreTokenMatchesWarehouse(token, activeCode) {
    var wanted = normalizeWarehouseCode(activeCode);
    var normalized = normalizeStoreToken(token);
    if (!wanted || !normalized) return false;
    if (normalized === wanted) return true;
    var reference = findStoreReference(normalized);
    return !!reference && normalizeWarehouseCode(reference.code) === wanted;
  }

  function normalizeStoreToken(value) {
    return normalizeText(value)
      .replace(/\u2192/g, ">")
      .replace(/\s*-\s*>\s*/g, ">")
      .replace(/^[\s;:,.>\-]+|[\s;:,.>\-]+$/g, "")
      .replace(/\s+/g, " ")
      .toUpperCase();
  }

  function findTransferEstablishment(token) {
    var wanted = normalizeHeader(token);
    if (!wanted) return null;
    var establishment = transferState.establishments.find(function (item) {
      if (item.active === false) return false;
      var candidates = [item.code, item.storeCode, item.internalCode, item.name, item.cnpj].map(normalizeHeader);
      return candidates.some(function (candidate) {
        return candidate && (candidate === wanted || candidate.indexOf(wanted) >= 0 || wanted.indexOf(candidate) >= 0);
      });
    });
    return enrichEstablishmentWithStoreReference(establishment, token) || findStoreReference(token);
  }

  function enrichEstablishmentWithStoreReference(establishment, token) {
    if (!establishment) return null;
    var reference = findStoreReference(establishment.code || establishment.name || token);
    if (!reference) return establishment;
    return Object.assign({}, establishment, {
      code: establishment.code || reference.code,
      storeCode: establishment.storeCode && establishment.storeCode !== establishment.code ? establishment.storeCode : reference.storeCode,
      internalCode: establishment.internalCode || reference.internalCode,
      channel: establishment.channel || reference.channel,
      name: establishment.name || reference.name,
      cnpj: establishment.cnpj || reference.cnpj,
      fromReference: reference.fromReference
    });
  }

  function findStoreReference(token) {
    var wanted = normalizeHeader(token);
    if (!wanted) return null;
    var row = STORE_REFERENCE_ROWS.find(function (item) {
      var candidates = [item.loja, item.cod, item.codVf, item.cnpj].map(normalizeHeader);
      return candidates.some(function (candidate) {
        return candidate && (candidate === wanted || candidate.indexOf(wanted) >= 0 || wanted.indexOf(candidate) >= 0);
      });
    });
    if (!row) return null;
    return {
      id: "",
      code: row.loja,
      storeCode: row.codVf,
      internalCode: row.cod,
      channel: row.canal,
      name: row.loja,
      cnpj: row.cnpj,
      active: true,
      fromReference: true
    };
  }

  function parseTransferWorkbook(workbook, fileName) {
    var sheetName = workbook.SheetNames.find(function (name) { return normalizeHeader(name) === "planilha1"; }) || workbook.SheetNames[0];
    var sheet = workbook.Sheets[sheetName];
    if (!sheet) return { groups: [], items: [], errors: ["Planilha sem abas reconhecidas."], fileName: fileName || "" };
    var matrix = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
    var header = detectTransferHeader(matrix);
    if (!header) return { groups: [], items: [], errors: ["Nao foi possivel identificar as colunas da planilha."], fileName: fileName || "" };
    var items = [];
    var errors = [];
    for (var rowIndex = header.rowIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
      var row = matrix[rowIndex] || [];
      if (!row.some(function (value) { return normalizeText(value) !== ""; })) continue;
      var rawSku = valueAtHeader(row, header, "sku");
      var sku = normalizeSku(rawSku) || normalizeText(rawSku);
      var description = normalizeText(valueAtHeader(row, header, "description"));
      var qty = parseQuantity(valueAtHeader(row, header, "quantity"));
      var origin = normalizeStoreToken(valueAtHeader(row, header, "source"));
      var destination = normalizeStoreToken(valueAtHeader(row, header, "destination"));
      var itemErrors = [];
      if (!sku) itemErrors.push("Codigo vazio");
      if (!description) itemErrors.push("Descricao vazia");
      if (!qty || qty <= 0) itemErrors.push("Quantidade invalida");
      if (!origin) itemErrors.push("Origem vazia");
      if (!destination) itemErrors.push("Destino vazio");
      var item = applyTransferQuantityType({
        sku: sku,
        description: description,
        requestedQty: qty,
        unit: normalizeText(valueAtHeader(row, header, "unit")) || "UN",
        quantityType: "UNIDADE",
        boxQty: 0,
        unitsPerBox: 0,
        totalUnits: 0,
        sourceCode: origin,
        destinationCode: destination,
        sourceRaw: origin,
        destinationRaw: destination,
        movementType: normalizeText(valueAtHeader(row, header, "movementType")),
        sourceLegalName: normalizeText(valueAtHeader(row, header, "sourceLegalName")),
        destinationLegalName: normalizeText(valueAtHeader(row, header, "destinationLegalName")),
        legalNameGroup: normalizeText(valueAtHeader(row, header, "legalNameGroup")),
        importSource: "EXCEL",
        sourceLine: rowIndex + 1,
        errors: itemErrors
      });
      if (itemErrors.length) errors.push("Linha " + (rowIndex + 1) + ": " + itemErrors.join(", "));
      items.push(item);
    }
    return buildTransferPreviewGroups(items, errors, "EXCEL", "", fileName || "");
  }

  async function createTransferFromForm(event) {
    event.preventDefault();
    if (!ensureActiveWarehouse()) return;
    if (!isAdminOrSupervisor()) {
      setStatus("transferImportStatus", "Acesso restrito.", "error");
      return;
    }
    if (!transferState.previewGroups.length) {
      await previewTransferExcel();
    }
    var groups = transferState.previewGroups.filter(function (group) { return !group.skipped; });
    if (!groups.length) {
      setStatus("transferImportStatus", "Nenhuma transferencia valida selecionada.", "error");
      return;
    }
    if (transferState.previewErrors.length || groups.some(function (group) { return group.errors.length || group.items.some(function (item) { return item.errors.length; }); })) {
      setStatus("transferImportStatus", "Existem itens com erro. Corrija antes de continuar.", "error");
      return;
    }
    if (groups.some(function (group) { return !group.responsibleId; })) {
      setStatus("transferImportStatus", "Selecione um responsavel para a transferencia.", "error");
      return;
    }
    var actionButton = $("createTransferButton");
    var creationRequestId = actionButton && actionButton.dataset.idempotencyKey
      ? actionButton.dataset.idempotencyKey
      : createIdempotencyKey([activeWarehouseCode(), "TRANSFERENCIA", transferState.previewSource || $("transferImportModeInput").value, transferState.previewFileName || "manual", groups.length]);
    if (actionButton) actionButton.dataset.idempotencyKey = creationRequestId;
    if (!beginTransferAction("create-transfer:" + creationRequestId, actionButton, "Salvando...")) return;
    var now = new Date().toISOString();
    var transfers = [];
    var items = [];
    groups.forEach(function (group, groupIndex) {
      var responsible = authState.users.find(function (user) { return user.id === group.responsibleId; });
      var transferId = randomId("trf-" + groupIndex);
      var transfer = buildImportedTransferRecord(group, responsible, transferId, buildTransferCode(group, groupIndex), buildTransferName(group), now);
      transfer.requestId = creationRequestId;
      transfer.idempotencyKey = creationRequestId + ":GRUPO-" + (groupIndex + 1);
      transfer.importBatchId = creationRequestId;
      transfer.importFileName = transferState.previewFileName || group.fileName || "";
      transfer.importedById = authState.currentUser.id;
      transfer.importedByName = authState.currentUser.name;
      transfers.push(transfer);
      consolidateTransferGroupItems(group.items).forEach(function (item, itemIndex) {
        var transferItem = buildImportedTransferItem(item, transferId, now);
        transferItem.requestId = creationRequestId;
        transferItem.idempotencyKey = transfer.idempotencyKey + ":SKU-" + normalizeSkuKey(transferItem.sku) + ":ITEM-" + (itemIndex + 1);
        items.push(transferItem);
      });
    });
    var duplicateLabels = findDuplicateTransferImportGroups(groups);
    if (duplicateLabels.length && !window.confirm("Ja existe transferencia ativa parecida neste estoque:\n" + duplicateLabels.join("\n") + "\n\nDeseja importar mesmo assim?")) {
      setStatus("transferImportStatus", "Importacao cancelada para evitar duplicidade.", "warning");
      endTransferAction(actionButton);
      if (actionButton) delete actionButton.dataset.idempotencyKey;
      return;
    }
    try {
      transferDebugLog("Criando transferencia", { transfers: transfers.length, items: items.length, warehouse: activeWarehouseCode() });
      await enrichTransferItemsWithStock(items);
      await insertTransferRows(transfers.map(toDbTransfer));
      try {
        await upsertTransferItemRows(items.map(toDbTransferItem));
      } catch (itemError) {
        for (var rollbackIndex = 0; rollbackIndex < transfers.length; rollbackIndex += 1) {
          await deleteRelatedTransferRows("wms_transfers", "id", transfers[rollbackIndex].id);
        }
        throw itemError;
      }
      for (var i = 0; i < transfers.length; i += 1) {
        applyLocalTransferUpdate(transfers[i]);
        transferState.loadedItemTransferIds[transfers[i].id] = true;
        getPreparedTransferItems(items, transfers[i].id).forEach(applyLocalTransferItemUpdate);
        await recordTransferEvent(transfers[i].id, "", "TRANSFER_CREATED", "", 0, "Transferencia criada por importacao inteligente.", { itemCount: getPreparedTransferItems(items, transfers[i].id).length, importSource: transfers[i].importSource });
        if (transfers[i].responsibleId) await recordTransferEvent(transfers[i].id, "", "TRANSFER_ASSIGNED", "", 0, "Responsavel atribuido.", { responsibleId: transfers[i].responsibleId });
      }
      transferDebugLog("Transferencia criada", { transfers: transfers.map(function (transfer) { return transfer.id; }) });
    } catch (error) {
      var errorText = formatSupabaseError(error);
      setStatus("transferImportStatus", isMissingStockTableError(error) || errorText.indexOf("wms_stock_positions") >= 0 ? missingStockSchemaMessage(error) : missingTransferImportSchemaMessage(error), "error");
      endTransferAction(actionButton);
      if (actionButton) delete actionButton.dataset.idempotencyKey;
      return;
    }
    clearTransferPreview();
    $("newTransferForm").reset();
    handleTransferImportModeChange();
    scheduleTransferRealtimeRefresh("created-transfer", 0);
    renderTransfers();
    setStatus("transferImportStatus", "Transferencias criadas com sucesso.", "success");
    endTransferAction(actionButton);
    if (actionButton) delete actionButton.dataset.idempotencyKey;
  }

  function consolidateTransferGroupItems(groupItems) {
    var byKey = {};
    var ordered = [];
    (groupItems || []).forEach(function (item) {
      var normalized = applyTransferQuantityType(Object.assign({}, item));
      var key = [
        normalizeSkuKey(normalized.sku),
        normalizeText(normalized.description).toUpperCase(),
        normalizeTransferUnit(normalized.unit),
        normalized.quantityType || "UNIDADE",
        normalized.sourceCode || "",
        normalized.destinationCode || "",
        normalized.movementType || ""
      ].join("\u0001");
      var existing = byKey[key];
      if (!existing) {
        byKey[key] = normalized;
        ordered.push(normalized);
        return;
      }
      existing.requestedQty = Number(existing.requestedQty || 0) + Number(normalized.requestedQty || 0);
      existing.boxQty = Number(existing.boxQty || 0) + Number(normalized.boxQty || 0);
      existing.totalUnits = Number(existing.totalUnits || 0) + Number(normalized.totalUnits || 0);
      existing.errors = unique((existing.errors || []).concat(normalized.errors || []));
      existing.sourceLine = [existing.sourceLine, normalized.sourceLine].filter(Boolean).join(", ");
    });
    return ordered.map(applyTransferQuantityType);
  }

  function buildTransferName(group) {
    return groupRouteLabel(group) + " - " + new Date().toLocaleDateString("pt-BR");
  }

  function buildTransferCode(group, index) {
    var stamp = compactDateTimeForCode(new Date());
    return "TRF-" + stamp + "-" + sanitizeCodePart(group.sourceCode) + "-" + sanitizeCodePart(group.destinationCode) + (index ? "-" + (index + 1) : "");
  }

  function buildImportedTransferRecord(group, responsible, transferId, code, name, now) {
    var origin = group.origin || {};
    var destination = group.destination || {};
    return {
      id: transferId,
      code: code,
      name: name,
      establishmentId: destination.id || "",
      establishmentCode: destination.code || group.destinationCode || "",
      establishmentName: destination.name || group.destinationCode || "",
      establishmentCnpj: destination.cnpj || "",
      importSource: group.importSource,
      rawSourceText: group.rawSourceText || group.fileName || "",
      originId: origin.id || "",
      originName: origin.name || group.sourceCode || "",
      originCnpj: origin.cnpj || "",
      originStoreCode: origin.storeCode || origin.code || group.sourceCode || "",
      originInternalCode: origin.internalCode || "",
      originChannel: origin.channel || "",
      destinationId: destination.id || "",
      destinationName: destination.name || group.destinationCode || "",
      destinationCnpj: destination.cnpj || "",
      destinationStoreCode: destination.storeCode || destination.code || group.destinationCode || "",
      destinationInternalCode: destination.internalCode || "",
      destinationChannel: destination.channel || "",
      responsibleId: responsible.id,
      responsibleName: responsible.name,
      status: "ATRIBUIDA",
      flowType: "TRANSFERENCIA_EXCEL",
      observation: normalizeText($("transferObservationInput").value),
      createdById: authState.currentUser.id,
      createdByName: authState.currentUser.name,
      startedAt: "",
      separationFinishedAt: "",
      packingFinishedAt: "",
      warehouseId: activeWarehouseId(),
      warehouseCode: activeWarehouseCode(),
      createdAt: now,
      updatedAt: now
    };
  }

  function buildImportedTransferItem(item, transferId, now) {
    applyTransferItemLocation(item);
    return {
      id: randomId("trfi"),
      transferId: transferId,
      sku: item.sku,
      description: item.description,
      requestedQty: item.requestedQty,
      unit: item.unit || "UN",
      movementType: item.movementType || "",
      sourceStore: item.sourceCode || "",
      destinationStore: item.destinationCode || "",
      sourceLegalName: item.sourceLegalName || "",
      destinationLegalName: item.destinationLegalName || "",
      legalNameGroup: item.legalNameGroup || "",
      addressRua: item.addressRua || "",
      addressRack: item.addressRack || "",
      addressLinha: item.addressLinha || "",
      addressLetra: item.addressLetra || "",
      addressCode: item.addressCode || "",
      hasLocation: item.hasLocation === true,
      locationWarning: item.locationWarning || "",
      storeAvailable: item.storeAvailable === null || item.storeAvailable === undefined ? null : Number(item.storeAvailable || 0),
      captureAvailable: Number(item.captureAvailable || 0),
      originSuggested: item.originSuggested || "",
      suggestedCaptureQty: Number(item.suggestedCaptureQty || 0),
      suggestedStoreQty: Number(item.suggestedStoreQty || 0),
      stockAlert: item.stockAlert === true,
      stockAlertMessage: item.stockAlertMessage || "",
      suggestedLocation: item.captureLocationSnapshot || item.suggestedLocation || "",
      captureLocationSnapshot: item.captureLocationSnapshot || "",
      wmsLocationSnapshot: "",
      quantityType: item.quantityType || "UNIDADE",
      boxQty: item.boxQty || 0,
      unitsPerBox: item.unitsPerBox || 0,
      totalUnits: isBoxQuantityItem(item) ? Number(item.totalUnits || 0) : Number(item.totalUnits || item.requestedQty || 0),
      separatedQty: 0,
      packedQty: 0,
      packedUnits: 0,
      packagingObservation: "",
      status: "PENDENTE",
      warehouseId: activeWarehouseId(),
      warehouseCode: activeWarehouseCode(),
      createdAt: now,
      updatedAt: now
    };
  }

  async function enrichTransferItemsWithStock(items, warehouseCode) {
    if (!items || !items.length || !isSupabaseReady()) return;
    var warehouse = normalizeWarehouseCode(warehouseCode || (items[0] && items[0].warehouseCode) || activeWarehouseCode());
    try {
      var suggestions = await stockService().getTransferStockSuggestion({
        warehouse_code: warehouse,
        items: items.map(function (item) {
          return {
            codigo_material: item.sku,
            quantidade_solicitada: getTransferExpectedUnits(item) || item.requestedQty || 0
          };
        })
      });
      items.forEach(function (item, index) {
        var suggestion = suggestions[index];
        applyTransferItemStockSuggestion(item, suggestion);
      });
    } catch (error) {
      if (isMissingStockTableError(error) || isMissingColumnError(error)) {
        recordPerformanceError("transfer-stock-schema", error);
      }
      throw error;
    }
  }

  async function refreshTransferStockSuggestion(transferId, options) {
    options = options || {};
    var button = options.button || null;
    var transfer = getTransferById(transferId);
    if (!transfer) {
      setStatus("transferWorkStatus", "Transferencia nao encontrada para atualizar sugestao.", "error");
      return;
    }
    if (!isSupabaseReady()) {
      setStatus("transferWorkStatus", "Supabase nao conectado. Nao foi possivel atualizar sugestao.", "error");
      return;
    }
    var items = getTransferItems(transfer.id).filter(function (item) { return !item.isExtra; });
    if (!items.length) return;
    var actionKey = "refresh-transfer-stock:" + transfer.id;
    if (options.persist && !beginTransferAction(actionKey, button, "Atualizando...")) return;
    try {
      var startedAt = performance.now();
      await enrichTransferItemsWithStock(items, transfer.warehouseCode || activeWarehouseCode());
      recordPerformanceMetric("lastTransferStockMs", startedAt);
      if (options.persist) {
        var now = new Date().toISOString();
        items.forEach(function (item) { item.updatedAt = now; });
        await upsertTransferItemRows(items.map(toDbTransferItem));
        await recordTransferEvent(transfer.id, "", "TRANSFER_STOCK_SUGGESTION_REFRESHED", "", items.length, "Sugestao de saldo atualizada pela Base de Estoque.", {
          warehouseCode: transfer.warehouseCode || activeWarehouseCode()
        });
        setStatus("transferWorkStatus", "Sugestao de saldo atualizada pela Base de Estoque.", "success");
      }
      if (options.render !== false) renderTransferWork();
    } catch (error) {
      console.error("Erro ao atualizar sugestao de saldo:", error);
      setStatus("transferWorkStatus", "Erro ao atualizar sugestao de saldo: " + missingStockSchemaMessage(error), "error");
    } finally {
      if (options.persist) endTransferAction(button);
    }
  }

  function transferItemsNeedStockSnapshot(items) {
    return (items || []).some(function (item) {
      return !item.isExtra && (!item.stockSnapshotAt || !item.originSuggested);
    });
  }

  function applyTransferItemStockSuggestion(item, suggestion) {
    if (!item || !suggestion) return item;
    item.storeAvailable = suggestion.storeAvailable === null || suggestion.storeAvailable === undefined ? null : Number(suggestion.storeAvailable || 0);
    item.captureAvailable = suggestion.captureAvailable === null ? null : Number(suggestion.captureAvailable || 0);
    item.originSuggested = suggestion.originSuggested || "";
    item.suggestedCaptureQty = Number(suggestion.suggestedCaptureQty || 0);
    item.suggestedStoreQty = Number(suggestion.suggestedStoreQty || 0);
    item.quantityShortage = Number(suggestion.quantityShortage || 0);
    item.stockBaseFound = suggestion.baseFound !== false;
    item.stockAlert = suggestion.stockAlert === true;
    item.stockAlertMessage = suggestion.alertMessage || suggestion.operationalMessage || "";
    item.operationalMessage = suggestion.operationalMessage || suggestion.alertMessage || "";
    item.suggestedLocation = suggestion.captureLocation || "";
    item.captureLocationSnapshot = suggestion.captureLocation || "";
    item.wmsLocationSnapshot = "";
    item.stockSnapshotAt = nowIso();
    applyCaptureLocationToTransferItem(item, suggestion.captureLocation || "");
    if (suggestion.name) item.description = suggestion.name;
    return item;
  }

  function getPreparedTransferItems(items, transferId) {
    return items.filter(function (item) { return item.transferId === transferId; });
  }

  function transferImportGroupSignature(group) {
    var items = (group.items || []).map(function (item) {
      return normalizeSkuKey(item.sku) + ":" + formatQty(item.requestedQty);
    }).sort().join("|");
    return [
      normalizeWarehouseCode(activeWarehouseCode()),
      normalizeText(group.sourceCode || ""),
      normalizeText(group.destinationCode || ""),
      items
    ].join("::");
  }

  function existingTransferSignature(transfer) {
    var items = getTransferItems(transfer.id).map(function (item) {
      return normalizeSkuKey(item.sku) + ":" + formatQty(item.requestedQty);
    }).sort().join("|");
    return [
      normalizeWarehouseCode(transfer.warehouseCode || activeWarehouseCode()),
      normalizeText(transfer.originStoreCode || transfer.originName || ""),
      normalizeText(transfer.destinationStoreCode || transfer.destinationName || ""),
      items
    ].join("::");
  }

  function findDuplicateTransferImportGroups(groups) {
    var activeSignatures = {};
    getVisibleTransfers().forEach(function (transfer) {
      if (transfer.status === "CANCELADA" || isFinalTransferStatus(transfer.status)) return;
      activeSignatures[existingTransferSignature(transfer)] = transferDisplayName(transfer) || transfer.code || transfer.id;
    });
    return groups.map(function (group) {
      return activeSignatures[transferImportGroupSignature(group)] || "";
    }).filter(Boolean);
  }

  function applyTransferItemLocation(item) {
    return applyCaptureLocationToTransferItem(item, transferCaptureLocationCode(item));
  }

  function applyLocationToTransferItem(item, location) {
    item.addressRua = "R" + pad2(location.rua);
    item.addressRack = "RK" + pad2(location.rack);
    item.addressLinha = "L" + pad2(location.linha);
    item.addressLetra = location.letra || "";
    item.addressCode = location.locationCode || "";
    item.hasLocation = true;
    item.locationWarning = "";
    return item;
  }

  function clearTransferItemLocation(item) {
    item.addressRua = "";
    item.addressRack = "";
    item.addressLinha = "";
    item.addressLetra = "";
    item.addressCode = "";
    item.hasLocation = false;
    item.locationWarning = "Sem localização cadastrada.";
    return item;
  }

  function transferLocationStatus(item) {
    var locationCode = transferCaptureLocationCode(item);
    var parsed = normalizeLocation(locationCode);
    if (parsed.valid) {
      applyLocationToTransferItem(item, {
        rua: parsed.rua,
        rack: parsed.rack,
        linha: parsed.linha,
        letra: parsed.letra,
        locationCode: parsed.code
      });
      return {
        hasLocation: true,
        rua: item.addressRua || "",
        rack: item.addressRack || "",
        linha: item.addressLinha || "",
        letra: item.addressLetra || "",
        code: item.addressCode || ""
      };
    }
    clearTransferItemLocation(item);
    return { hasLocation: false, warning: item.locationWarning || "Sem localização cadastrada." };
  }

  function transferCaptureLocationCode(item) {
    if (!item) return "";
    return item.captureLocationSnapshot || (isCaptureTransferOrigin(item.originSuggested) ? item.suggestedLocation || "" : "");
  }

  function isCaptureTransferOrigin(origin) {
    return ["CAPTACAO", "CAPTACAO_PARCIAL"].indexOf(origin || "") >= 0;
  }

  function applyCaptureLocationToTransferItem(item, locationCode) {
    var parsed = normalizeLocation(locationCode || "");
    if (!parsed.valid) return clearTransferItemLocation(item);
    return applyLocationToTransferItem(item, {
      rua: parsed.rua,
      rack: parsed.rack,
      linha: parsed.linha,
      letra: parsed.letra,
      locationCode: parsed.code
    });
  }

  function transferLocationLabel(item) {
    var status = transferLocationStatus(item);
    var base = status.hasLocation
      ? "Rua: " + status.rua + " | Rack: " + status.rack + " | Linha: " + status.linha + " | Letra: " + status.letra + " | Endereço: " + status.code
      : status.warning;
    var stock = transferStockLabel(item);
    return stock ? base + " | " + stock : base;
  }

  function transferOriginSuggestionLabel(origin) {
    return {
      CAPTACAO: "Captação",
      CAPTACAO_PARCIAL: "Captação parcial",
      SEM_SALDO_CAPTACAO: "Sem saldo CAPTAÇÃO",
      NAO_ENCONTRADO_CAPTACAO: "Não encontrado CAPTAÇÃO",
      LOJA: "Loja",
      LOJA_E_CAPTACAO: "Loja + CAPTAÇÃO",
      CAPTACAO_E_LOJA: "CAPTAÇÃO + Loja",
      SEM_SALDO: "Sem saldo",
      VERIFICAR: "Verificar"
    }[origin] || origin || "-";
  }

  function transferStockValueLabel(value, item) {
    if (item && item.stockBaseFound === false && (value === null || value === undefined || value === "")) return "não encontrado";
    if (value === null || value === undefined || value === "") return "não encontrado";
    return formatQty(value);
  }

  function transferStockSnapshotCell(item) {
    var pieces = [
      "<div class=\"transfer-stock-snapshot" + (item.stockAlert ? " alert" : "") + "\">",
      "<span>Saldo loja <b>" + escapeHtml(transferStockValueLabel(item.storeAvailable, null)) + "</b></span>",
      "<span>Saldo captação <b>" + escapeHtml(transferStockValueLabel(item.captureAvailable, item)) + "</b></span>",
      "<span>Retirar captação <b>" + formatQty(item.suggestedCaptureQty || 0) + "</b></span>"
    ];
    if (Number(item.suggestedStoreQty || 0) > 0) pieces.push("<span>Retirar loja <b>" + formatQty(item.suggestedStoreQty || 0) + "</b></span>");
    if (Number(item.quantityShortage || 0) > 0) pieces.push("<span class=\"danger-text\">Faltante <b>" + formatQty(item.quantityShortage) + "</b></span>");
    pieces.push("</div>");
    return pieces.join("");
  }

  function transferStockLabel(item) {
    if (!item || (!item.originSuggested && !item.stockAlertMessage && !item.suggestedLocation)) return "";
    var origin = transferOriginSuggestionLabel(item.originSuggested);
    var parts = [];
    if (origin && origin !== "-") parts.push("Pegar: " + origin);
    parts.push("Saldo loja " + transferStockValueLabel(item.storeAvailable, null));
    parts.push("Retirar captacao " + formatQty(item.suggestedCaptureQty || 0));
    if (Number(item.suggestedStoreQty || 0) > 0) parts.push("Retirar loja " + formatQty(item.suggestedStoreQty || 0));
    if (transferCaptureLocationCode(item)) parts.push("Local CAPTACAO: " + transferCaptureLocationCode(item));
    parts.push("Saldo captacao " + transferStockValueLabel(item.captureAvailable, item));
    if (Number(item.quantityShortage || 0) > 0) parts.push("Faltante " + formatQty(item.quantityShortage));
    if (item.stockAlertMessage) parts.push(item.stockAlertMessage);
    return parts.join(" | ");
  }

  function transferLocationCells(item) {
    var status = transferLocationStatus(item);
    if (!status.hasLocation) return "<td>-</td><td>-</td><td>-</td><td>-</td><td>-</td><td>Sem localização cadastrada.</td>";
    return "<td>" + escapeHtml(status.rua) + "</td><td>" + escapeHtml(status.rack) + "</td><td>" + escapeHtml(status.linha) + "</td><td>" + escapeHtml(status.letra) + "</td><td>" + escapeHtml(status.code) + "</td><td>Localizado</td>";
  }

  function transferLocationSummaryCell(item) {
    var status = transferLocationStatus(item);
    var stock = transferStockLabel(item);
    if (!status.hasLocation) {
      return "<td data-label=\"Localização\" class=\"transfer-location-cell no-location\"><strong>Sem localizacao</strong><span>Sem localizacao cadastrada.</span>" + (stock ? "<em class=\"transfer-stock-line\">" + escapeHtml(stock) + "</em>" : "") + "</td>";
    }
    return [
      "<td data-label=\"Localização\" class=\"transfer-location-cell\">",
      "<strong>" + escapeHtml(status.code) + "</strong>",
      "<span>" + escapeHtml(status.rua) + " | " + escapeHtml(status.rack) + " | " + escapeHtml(status.linha) + " | " + escapeHtml(status.letra) + "</span>",
      "<em>Localizado</em>",
      stock ? "<em class=\"transfer-stock-line\">" + escapeHtml(stock) + "</em>" : "",
      "</td>"
    ].join("");
  }

  function compactDateTimeForCode(date) {
    return date.getFullYear() + String(date.getMonth() + 1).padStart(2, "0") + String(date.getDate()).padStart(2, "0") + "-" + String(date.getHours()).padStart(2, "0") + String(date.getMinutes()).padStart(2, "0") + String(date.getSeconds()).padStart(2, "0");
  }

  function sanitizeCodePart(value) {
    return normalizeStoreToken(value).replace(/[^A-Z0-9]/g, "").slice(0, 12) || "LOJA";
  }

  function missingTransferImportSchemaMessage(error) {
    var message = formatSupabaseError(error);
    if (isMissingTransferTableError(error) || isMissingColumnError(error)) return "Estrutura de transferencias desatualizada no Supabase. Aplique as migrations e recarregue o app. Erro original: " + message;
    return "Erro ao criar transferencias: " + message;
  }

  function beginTransferAction(key, button, savingText) {
    key = key || "transfer-action";
    transferState.actionLocks = transferState.actionLocks || {};
    if (transferState.actionLocks[key]) return false;
    transferState.actionLocks[key] = true;
    transferState.savingActionKey = key;
    if (button) {
      button.dataset.originalText = button.dataset.originalText || button.textContent;
      button.dataset.actionLockKey = key;
      button.textContent = savingText || "Salvando...";
      button.disabled = true;
    }
    return true;
  }

  function endTransferAction(button) {
    var key = button && button.dataset.actionLockKey ? button.dataset.actionLockKey : transferState.savingActionKey || "";
    if (button) {
      button.disabled = false;
      if (button.dataset.originalText) button.textContent = button.dataset.originalText;
      delete button.dataset.actionLockKey;
    }
    if (key && transferState.actionLocks) delete transferState.actionLocks[key];
    if (transferState.savingActionKey === key) transferState.savingActionKey = "";
  }

  function createIdempotencyKey(parts) {
    return unique((parts || []).map(function (part) {
      return normalizeText(part).toUpperCase().replace(/[^A-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    }).filter(Boolean)).join(":") + ":" + randomId("action");
  }

  function isMissingIdempotencyColumnError(error) {
    return !!getMissingReplenishmentIdempotencyColumn(error);
  }

  function getMissingReplenishmentIdempotencyColumn(error) {
    if (!isMissingColumnError(error)) return "";
    var message = formatSupabaseError(error).toLowerCase();
    var columns = ["idempotency_key", "request_id", "client_action_id", "created_by_id"];
    for (var index = 0; index < columns.length; index += 1) {
      if (message.indexOf(columns[index]) >= 0) return columns[index];
    }
    return "";
  }

  function isDuplicateKeyError(error) {
    var message = formatSupabaseError(error).toLowerCase();
    return message.indexOf("duplicate key value") >= 0 || message.indexOf("23505") >= 0 || message.indexOf("unique constraint") >= 0;
  }

  async function openTransferWork(transferId, options) {
    options = options || {};
    var transfer = getTransferById(transferId);
    if (!transfer) {
      await ensureTransferDataLoaded();
      transfer = getTransferById(transferId);
    }
    if (!transfer) {
      showToast("Transferencia nao encontrada no estoque atual.", "error");
      return;
    }
    if (!isAdminOrSupervisor() && transfer.responsibleId !== authState.currentUser.id) {
      showToast("Você não tem acesso a esta transferência.", "error");
      return;
    }
    if (!transferBelongsToActiveWarehouse(transfer)) {
      showToast("Esta transferencia pertence a outro estoque.", "error");
      return;
    }
    setStatus("transferWorkStatus", "Carregando itens da transferencia...", "warning");
    var loadedItems = await loadTransferItemsForTransfer(transferId, { force: options.forceItems === true });
    if (!loadedItems.length) {
      showToast("Transferencia sem itens carregados. Atualize e tente novamente.", "warning");
    }
    transferState.activeTransferId = transferId;
    transferState.selectedItemId = "";
    transferState.manualSeparationQty = false;
    if ($("transferFinalBoxesInput")) $("transferFinalBoxesInput").value = "";
    markTaskAlertRead("TRANSFERENCIA", transfer.id, transfer.status);
    transferState.activeWorkMode = getTransferWorkMode(transfer);
    if (!options.viewOnly && canStartTransferSeparation(transfer)) {
      var startedAt = new Date().toISOString();
      try {
        await updateTransferStatus(transfer, "EM_SEPARACAO", { iniciado_em: startedAt, separacao_iniciada_em: startedAt, separation_started_at: startedAt, total_started_at: startedAt }, "SEPARATION_STARTED");
      } catch (error) {
        console.error("Erro ao iniciar transferencia:", error);
        showToast("Erro ao iniciar transferencia: " + formatSupabaseError(error), "error");
        return;
      }
    }
    if (!options.viewOnly && transfer.status === "CORRECAO_SOLICITADA") {
      var revalidationStartedAt = new Date().toISOString();
      try {
        await updateTransferStatus(transfer, "EM_CORRECAO", {
          lacre_iniciado_em: transfer.packingStartedAt || revalidationStartedAt,
          packing_started_at: transfer.packingStartedAt || revalidationStartedAt,
          last_action_at: revalidationStartedAt,
          last_action_label: "Revalidacao iniciada"
        }, "TRANSFER_REVALIDATION_STARTED", {
          startedById: (authState.currentUser || {}).id || "",
          startedByName: (authState.currentUser || {}).name || "",
          startedAt: revalidationStartedAt
        }, {
          observation: "Operador iniciou a revalidacao da montagem."
        });
        transferState.activeWorkMode = getTransferWorkMode(transfer);
      } catch (error) {
        console.error("Erro ao iniciar revalidacao:", error);
        showToast("Erro ao iniciar revalidacao: " + formatSupabaseError(error), "error");
        return;
      }
    }
    if (transferItemsNeedStockSnapshot(getTransferItems(transferId))) {
      await refreshTransferStockSuggestion(transferId, { persist: true, render: false });
    } else {
      await refreshTransferStockSuggestion(transferId, { persist: false, render: false });
    }
    activateTransferTab("transferWorkSection");
    renderTransferWork();
    setStatus("transferWorkStatus", options.viewOnly ? "Visualizacao aberta. A transferencia nao foi iniciada." : "Tarefa aberta. Siga a etapa atual.", options.viewOnly ? "success" : "warning");
    window.setTimeout(function () {
      if (transferState.activeWorkMode === "MONTAGEM") $("transferScanInput").focus();
      else if ($("transferCurrentItem")) $("transferCurrentItem").scrollIntoView({ block: "start", behavior: "smooth" });
    }, 80);
    if (isFinalTransferStatus(transfer.status)) {
      setStatus("transferWorkStatus", "Tarefa finalizada. Confira o resultado no relatório do líder.", transfer.status === "CONCLUIDA_SEM_DIVERGENCIA" ? "success" : "warning");
    }
  }

  async function updateTransferStatus(transfer, status, extra, eventType, eventPayload, eventMeta) {
    var now = new Date().toISOString();
    var update = Object.assign({ status: status, updated_at: now }, buildTransferLightSummary(transfer, status, eventType, eventPayload), extra || {});
    var response = await updateTransferWithSchemaFallback(transfer.id, update);
    if (response.error) throw response.error;
    transfer.status = status;
    transfer.updatedAt = now;
    if (update.iniciado_em) transfer.startedAt = update.iniciado_em;
    if (update.separacao_iniciada_em) transfer.separationStartedAt = update.separacao_iniciada_em;
    if (update.separacao_concluida_em) transfer.separationFinishedAt = update.separacao_concluida_em;
    if (update.lacre_iniciado_em) transfer.packingStartedAt = update.lacre_iniciado_em;
    if (update.lacre_concluido_em) transfer.packingFinishedAt = update.lacre_concluido_em;
    if (update.finalizado_em) transfer.finishedAt = update.finalizado_em;
    if (update.duracao_segundos !== undefined) transfer.durationSeconds = Number(update.duracao_segundos || 0);
    if (update.duracao_separacao_segundos !== undefined) transfer.separationDurationSeconds = Number(update.duracao_separacao_segundos || 0);
    if (update.duracao_lacre_segundos !== undefined) transfer.packingDurationSeconds = Number(update.duracao_lacre_segundos || 0);
    if (update.total_caixas !== undefined) transfer.totalBoxes = Number(update.total_caixas || 0);
    transfer.totalPreviewQuantity = Number(update.total_previsto || transfer.totalPreviewQuantity || 0);
    transfer.totalSentQuantity = Number(update.total_enviado || transfer.totalSentQuantity || 0);
    transfer.totalDifference = Number(update.diferenca_total || transfer.totalDifference || 0);
    transfer.currentStep = update.current_step || transfer.currentStep || "";
    transfer.lastActionAt = update.last_action_at || transfer.lastActionAt || "";
    transfer.lastActionLabel = update.last_action_label || transfer.lastActionLabel || "";
    if (eventType) {
      var eventQuantity = eventMeta && eventMeta.quantity !== undefined ? Number(eventMeta.quantity || 0) : 0;
      await recordTransferEvent(transfer.id, "", eventType, "", eventQuantity, status, eventPayload || {}, eventMeta || {});
    }
  }

  async function markTransferHasDivergence(transfer) {
    if (!transfer || !isSupabaseReady()) return;
    transfer.hasDivergence = true;
    var response = await updateTransferWithSchemaFallback(transfer.id, {
      has_divergence: true,
      divergence_count: countTransferDivergences(transfer.id),
      updated_at: new Date().toISOString()
    });
    if (response.error && !isMissingColumnError(response.error)) console.warn("Divergencia da transferencia nao marcada:", response.error);
  }

  async function registerTransferDivergence(transfer, item, type, expected, informed, difference, inputType, observation) {
    if (!transfer || !isSupabaseReady()) return;
    var user = authState.currentUser || {};
    var row = {
      id: randomId("tdvg"),
      created_at: new Date().toISOString(),
      transfer_id: transfer.id,
      item_id: item && item.id ? item.id : "",
      sku: item && item.sku ? item.sku : "",
      descricao: item && item.description ? item.description : "",
      divergence_type: type,
      expected_quantity: Number(expected || 0),
      informed_quantity: Number(informed || 0),
      difference_quantity: Number(difference || 0),
      user_id: user.id || "",
      user_name: user.name || "",
      input_type: inputType || "",
      observation: observation || "",
      resolved: false,
      warehouse_id: activeWarehouseId(),
      warehouse_code: activeWarehouseCode()
    };
    var response = await supabaseDb.from("wms_transfer_divergences").insert(row);
    if (response.error && isMissingColumnError(response.error)) {
      if (isMissingWarehouseColumnError(response.error)) assertWarehouseFallbackAllowed("wms_transfer_divergences", response.error);
      response = await supabaseDb.from("wms_transfer_divergences").insert(stripWarehouseColumns(row));
    }
    if (response.error && !isMissingTransferTableError(response.error)) {
      console.warn("Divergencia nao salva:", response.error);
    }
  }

  function stripWarehouseColumns(row) {
    var copy = Object.assign({}, row);
    delete copy.warehouse_id;
    delete copy.warehouse_code;
    return copy;
  }

  function markTransferScanInput() {
    var value = $("transferScanInput").value || "";
    if (!value) {
      transferState.scanInputStartedAt = 0;
      transferState.lastScanInputAt = 0;
      return;
    }
    if (!transferState.scanInputStartedAt) transferState.scanInputStartedAt = Date.now();
    transferState.lastScanInputAt = Date.now();
  }

  function detectTransferInputType() {
    var value = $("transferScanInput").value || "";
    var elapsed = transferState.scanInputStartedAt ? Date.now() - transferState.scanInputStartedAt : 9999;
    return value.length >= 5 && elapsed <= 900 ? "BIPAGEM" : "DIGITACAO_MANUAL";
  }

  function clearTransferInputs() {
    transferState.selectedItemId = "";
    transferState.scanInputStartedAt = 0;
    transferState.lastScanInputAt = 0;
    $("transferScanInput").value = "";
    $("transferQuantityInput").value = "";
    if ($("transferUnitsPerBoxInput")) $("transferUnitsPerBoxInput").value = "";
    if ($("transferTotalUnitsInput")) $("transferTotalUnitsInput").value = "";
    if ($("transferMixedBoxInput")) $("transferMixedBoxInput").checked = false;
    renderTransferBoxFields();
  }

  function getSelectedTransferWorkItem() {
    return transferState.items.find(function (entry) { return entry.id === transferState.selectedItemId; }) || null;
  }

  function renderTransferBoxFields() {
    if (!$("transferBoxFields")) return;
    var item = getSelectedTransferWorkItem();
    var show = transferState.activeWorkMode === "MONTAGEM" && isBoxQuantityItem(item) && !isFinalTransferStatus((getTransferById(transferState.activeTransferId) || {}).status);
    $("transferBoxFields").hidden = !show;
    if (!show) return;
    if (!$("transferUnitsPerBoxInput").value && Number(item.unitsPerBox || 0) > 0) {
      $("transferUnitsPerBoxInput").value = formatInputQty(item.unitsPerBox);
    } else if (!$("transferUnitsPerBoxInput").value) {
      var pattern = getProductPackagingPattern(item.sku);
      var promptedKey = normalizeSkuKey(item.sku);
      if (pattern && Number(pattern.unitsPerBox || 0) > 0 && !transferState.packagingPromptedSkus[promptedKey]) {
        transferState.packagingPromptedSkus[promptedKey] = true;
        if (window.confirm("Padrao encontrado: " + formatQty(pattern.unitsPerBox) + " unidades por caixa. Deseja usar?")) {
          item.unitsPerBox = Number(pattern.unitsPerBox || 0);
          item.totalUnits = Number(item.boxQty || item.requestedQty || 0) * item.unitsPerBox;
          $("transferUnitsPerBoxInput").value = formatInputQty(item.unitsPerBox);
        }
      }
    }
    $("transferTotalUnitsInput").disabled = !$("transferMixedBoxInput").checked;
    updateTransferBoxTotalPreview();
  }

  function updateTransferBoxTotalPreview() {
    if (!$("transferBoxFields") || $("transferBoxFields").hidden) return;
    var mixed = $("transferMixedBoxInput").checked;
    $("transferTotalUnitsInput").disabled = !mixed;
    if (mixed) return;
    var boxes = parseQuantity($("transferQuantityInput").value);
    var unitsPerBox = parseQuantity($("transferUnitsPerBoxInput").value);
    $("transferTotalUnitsInput").value = boxes > 0 && unitsPerBox > 0 ? formatInputQty(boxes * unitsPerBox) : "";
  }

  function readFinalBoxCountInput() {
    var input = $("transferFinalBoxesInput");
    var qty = input ? parseQuantity(input.value) : 0;
    return Number.isFinite(qty) && qty > 0 && Math.floor(qty) === qty ? qty : 0;
  }

  async function locateTransferItem() {
    var transfer = getTransferById(transferState.activeTransferId);
    if (!transfer) return;
    if (isFinalTransferStatus(transfer.status)) {
      setStatus("transferWorkStatus", "Esta tarefa ja foi finalizada.", "warning");
      return;
    }
    var sku = firstSkuValue($("transferScanInput").value);
    if (!sku) {
      setStatus("transferWorkStatus", "Informe ou bipe o SKU.", "error");
      return;
    }
    var item = getTransferItems(transfer.id).find(function (entry) { return isSameSku(entry.sku, sku); });
    if (!item) {
      transferState.selectedItemId = "";
      if (isXmlConferenceTransfer(transfer)) {
        renderCurrentTransferItem();
        setStatus("transferWorkStatus", "SKU não consta no XML. Informe a quantidade e confirme para registrar como divergência.", "warning");
        $("transferQuantityInput").focus();
        return;
      }
      await handleUnknownTransferSku(transfer, sku);
      return;
    }
    transferState.selectedItemId = item.id;
    $("transferScanInput").value = item.sku;
    $("transferQuantityInput").value = "";
    renderCurrentTransferItem();
    setStatus("transferWorkStatus", item.description + " localizado. Informe a quantidade conferida.", "success");
    $("transferQuantityInput").focus();
  }

  async function handleUnknownTransferSku(transfer, sku) {
    var inputType = detectTransferInputType();
    var ok = window.confirm("Este item não consta nesta transferência. Deseja adicionar como item extra?");
    if (!ok) {
      await recordTransferEvent(transfer.id, "", "SKU_INVALIDO", sku, 0, "SKU fora da transferência cancelado.", {
        inputType: inputType,
        divergenceType: "SKU_INVALIDO"
      }, {
        inputType: inputType,
        divergenceType: "SKU_INVALIDO",
        observation: "Operador cancelou item fora da transferência."
      });
      setStatus("transferWorkStatus", "Item cancelado. Bipe o código correto.", "warning");
      clearTransferInputs();
      $("transferScanInput").focus();
      return;
    }
    var qtyText = $("transferQuantityInput").value || window.prompt("Quantidade do item extra:", "1");
    var qty = parseQuantity(qtyText);
    if (!qty || qty <= 0) {
      setStatus("transferWorkStatus", "Item extra cancelado. Informe uma quantidade maior que zero.", "error");
      $("transferQuantityInput").focus();
      return;
    }
    var observation = normalizeText(window.prompt("Observação do item extra:", "Item não previsto na transferência") || "");
    if (!observation) observation = "Item extra informado pelo conferente.";
    await addExtraTransferItem(transfer, sku, qty, observation, inputType);
  }

  async function addExtraTransferItem(transfer, sku, qty, observation, inputType) {
    var now = new Date().toISOString();
    var mode = transferState.activeWorkMode;
    var item = {
      id: randomId("trfi-extra"),
      transferId: transfer.id,
      sku: sku,
      description: findProductName(sku) || "Item extra",
      requestedQty: 0,
      unit: "UN",
      quantityType: "UNIDADE",
      boxQty: 0,
      unitsPerBox: 0,
      totalUnits: 0,
      separatedQty: mode === "MONTAGEM" ? 0 : qty,
      packedQty: mode === "MONTAGEM" ? qty : 0,
      extraQty: qty,
      missingQty: 0,
      excessQty: qty,
      isExtra: true,
      divergenceType: "ITEM_EXTRA",
      addedById: authState.currentUser.id,
      addedByName: authState.currentUser.name,
      inputType: inputType,
      observation: observation,
      status: "EXTRA",
      createdAt: now,
      updatedAt: now
    };
    await insertTransferItemRow(Object.assign(toDbTransferItem(item), transferItemAuditDbFields(item)));
    await registerTransferDivergence(transfer, item, "ITEM_EXTRA", 0, qty, qty, inputType, observation);
    await recordTransferEvent(transfer.id, item.id, "ITEM_EXTRA_ADDED", sku, qty, "Item extra registrado.", {
      inputType: inputType,
      divergenceType: "ITEM_EXTRA",
      observation: observation
    }, {
      inputType: inputType,
      divergenceType: "ITEM_EXTRA",
      quantityExpected: 0,
      quantityInformed: qty,
      quantityDifference: qty,
      observation: observation
    });
    await markTransferHasDivergence(transfer);
    invalidateTransferStatsCache();
    await persistTransferLightSummary(transfer, "ITEM_EXTRA_ADDED", { sku: sku });
    await loadTransferData();
    transferState.activeTransferId = transfer.id;
    transferState.activeWorkMode = mode;
    clearTransferInputs();
    renderTransfers();
    setStatus("transferWorkStatus", "Item extra registrado para análise do líder.", "warning");
    $("transferScanInput").focus();
  }

  async function addDeferredConferenceExtraItem(transfer, sku, qty, inputType) {
    var now = new Date().toISOString();
    var mode = transferState.activeWorkMode;
    var existing = getTransferItems(transfer.id).find(function (entry) {
      return entry.isExtra && isSameSku(entry.sku, sku) && (entry.status === "EXTRA_PENDENTE" || entry.divergenceType === "SKU_NAO_CONSTA_XML");
    });
    if (existing) {
      existing.separatedQty = Number(existing.separatedQty || 0) + qty;
      existing.extraQty = Number(existing.extraQty || 0) + qty;
      existing.excessQty = Number(existing.excessQty || 0) + qty;
      existing.updatedAt = now;
      var updateResponse = await updateRowWithSchemaFallback("wms_transfer_items", "id", existing.id, Object.assign({
        quantidade_separada: existing.separatedQty,
        updated_at: now
      }, transferItemAuditDbFields(existing)));
      if (updateResponse.error) throw updateResponse.error;
      await recordTransferEvent(transfer.id, existing.id, "CONFERENCE_EXTRA_SCANNED", sku, qty, "SKU fora do XML somado para decisão final.", {
        inputType: inputType,
        divergenceType: "SKU_NAO_CONSTA_XML"
      });
      invalidateTransferStatsCache();
      await persistTransferLightSummary(transfer, "ITEM_EXTRA_ADDED", { sku: sku });
      await loadTransferData();
      transferState.activeTransferId = transfer.id;
      transferState.activeWorkMode = mode;
      clearTransferInputs();
      renderTransfers();
      setStatus("transferWorkStatus", "Quantidade somada ao SKU fora do XML. Continue a conferência.", "warning");
      $("transferScanInput").focus();
      return;
    }
    var item = {
      id: randomId("trfi-extra"),
      transferId: transfer.id,
      sku: sku,
      description: findProductName(sku) || "Item fora do XML",
      requestedQty: 0,
      unit: "UN",
      quantityType: "UNIDADE",
      boxQty: 0,
      unitsPerBox: 0,
      totalUnits: 0,
      separatedQty: qty,
      packedQty: 0,
      extraQty: qty,
      missingQty: 0,
      excessQty: qty,
      isExtra: true,
      divergenceType: "SKU_NAO_CONSTA_XML",
      addedById: authState.currentUser.id,
      addedByName: authState.currentUser.name,
      inputType: inputType,
      observation: "Item bipado na conferência; decisão pendente no envio final.",
      status: "EXTRA_PENDENTE",
      createdAt: now,
      updatedAt: now
    };
    await insertTransferItemRow(Object.assign(toDbTransferItem(item), transferItemAuditDbFields(item)));
    await recordTransferEvent(transfer.id, item.id, "CONFERENCE_EXTRA_SCANNED", sku, qty, "SKU fora do XML registrado para decisão final.", {
      inputType: inputType,
      divergenceType: "SKU_NAO_CONSTA_XML"
    });
    await loadTransferData();
    transferState.activeTransferId = transfer.id;
    transferState.activeWorkMode = mode;
    clearTransferInputs();
    renderTransfers();
    setStatus("transferWorkStatus", "SKU fora do XML registrado para análise final. Continue a conferência.", "warning");
    $("transferScanInput").focus();
  }

  async function confirmTransferItem() {
    var transfer = getTransferById(transferState.activeTransferId);
    if (transfer && isFinalTransferStatus(transfer.status)) {
      setStatus("transferWorkStatus", "Esta tarefa ja foi finalizada.", "warning");
      return;
    }
    var mode = transferState.activeWorkMode || getTransferWorkMode(transfer);
    var item = transferState.items.find(function (entry) { return entry.id === transferState.selectedItemId; });
    if (transfer && !item && mode === "SEPARACAO") {
      item = getTransferActiveItem(sortTransferItemsForWork(getTransferItems(transfer.id)), mode);
      if (item) transferState.selectedItemId = item.id;
    }
    if (transfer && mode === "MONTAGEM") {
      var typedSku = firstSkuValue($("transferScanInput").value);
      if (!typedSku) {
        setStatus("transferWorkStatus", "Na montagem da caixa, bipe o SKU antes de confirmar.", "error");
        $("transferScanInput").focus();
        return;
      }
      item = getTransferItems(transfer.id).find(function (entry) { return isSameSku(entry.sku, typedSku); });
      if (item) transferState.selectedItemId = item.id;
      else {
        await handleUnknownTransferSku(transfer, typedSku);
        return;
      }
    }
    if (!transfer || !item) {
      setStatus("transferWorkStatus", mode === "MONTAGEM" ? "Bipe um SKU valido antes de confirmar." : "Selecione um item para separar.", "error");
      return;
    }
    if (mode === "MONTAGEM") renderTransferBoxFields();
    var qtyRaw = normalizeText($("transferQuantityInput").value);
    var hasQtyInput = qtyRaw !== "";
    var qty = parseQuantity(qtyRaw);
    if (!hasQtyInput && mode === "SEPARACAO") {
      qty = Math.max(0, Number(item.requestedQty || 0) - Number(item.separatedQty || 0)) || Number(item.requestedQty || 0);
    }
    if (qty < 0 || (!Number.isFinite(qty))) {
      setStatus("transferWorkStatus", "Informe uma quantidade valida.", "error");
      $("transferQuantityInput").focus();
      return;
    }
    if (mode !== "SEPARACAO" && (!qty || qty <= 0)) {
      setStatus("transferWorkStatus", "Informe uma quantidade maior que zero.", "error");
      $("transferQuantityInput").focus();
      return;
    }
    var pendingInfo = null;
    if (mode === "SEPARACAO" && qty === 0) {
      pendingInfo = requestTransferPendingReason(item);
      if (!pendingInfo) {
        setStatus("transferWorkStatus", "Informe o motivo para registrar quantidade zero.", "warning");
        return;
      }
    }
    if (mode === "SEPARACAO" && !confirmSeparationCollection(item, qty)) {
      setStatus("transferWorkStatus", "Coleta cancelada.", "warning");
      return;
    }
    var actionButton = mode === "MONTAGEM" || transferState.manualSeparationQty ? $("confirmTransferItemButton") : $("confirmCurrentCollectButton");
    if (!beginTransferAction("confirm-item:" + transfer.id + ":" + item.id + ":" + mode, actionButton, "Salvando...")) return;
    try {
    var now = new Date().toISOString();
    var inputType = mode === "SEPARACAO" ? (transferState.manualSeparationQty ? "AJUSTE_QUANTIDADE" : "CONFIRMACAO_COLETA") : detectTransferInputType();
    if (mode === "MONTAGEM") {
      var boxPacking = readTransferBoxPackingInput(item, qty);
      if (!boxPacking.valid) {
        setStatus("transferWorkStatus", boxPacking.message, "error");
        if ($(boxPacking.focusId)) $(boxPacking.focusId).focus();
        return;
      }
      var packExpected = item.isExtra ? Number(item.packedQty || 0) + qty : Number(item.separatedQty || 0);
      var packCurrent = Number(item.packedQty || 0);
      var packExcess = Math.max(0, packCurrent + qty - packExpected);
      if (packExcess > 0 && !item.isExtra && !window.confirm("Este produto foi separado com " + formatQty(packExpected) + " unidades, mas você está enviando " + formatQty(packCurrent + qty) + ". Deseja confirmar a divergência?")) {
        setStatus("transferWorkStatus", "Corrija a quantidade antes de confirmar.", "warning");
        $("transferQuantityInput").focus();
        return;
      }
      var referenceUnits = Number(boxPacking.expectedByPattern || 0);
      if (isBoxQuantityItem(item) && referenceUnits > 0 && Math.abs(Number(boxPacking.packedUnitsDelta || 0) - referenceUnits) > 0.0001 && !window.confirm("A quantidade total em unidades está diferente do esperado. Deseja confirmar?")) {
        setStatus("transferWorkStatus", "Corrija a quantidade antes de confirmar.", "warning");
        $("transferTotalUnitsInput").focus();
        return;
      }
      var boxPatternDiff = isBoxQuantityItem(item) && referenceUnits > 0 ? Number(boxPacking.packedUnitsDelta || 0) - referenceUnits : 0;
      item.packedQty = packCurrent + qty;
      if (isBoxQuantityItem(item)) {
        item.packedUnits = getTransferPackedUnits(item) + Number(boxPacking.packedUnitsDelta || 0);
        if (boxPacking.unitsPerBox > 0) item.unitsPerBox = boxPacking.unitsPerBox;
        item.totalUnits = boxPacking.mixed ? item.packedUnits : (Number(item.unitsPerBox || 0) > 0 ? Number(item.boxQty || item.requestedQty || 0) * Number(item.unitsPerBox || 0) : Number(item.requestedQty || item.boxQty || 0));
        item.packagingObservation = boxPacking.observation || item.packagingObservation || "";
      }
      if (packExcess > 0) {
        item.excessQty = Number(item.excessQty || 0) + packExcess;
        item.divergenceType = "QUANTIDADE_EXCEDENTE";
      }
      if (boxPatternDiff !== 0 && item.packedQty >= item.separatedQty) {
        item.divergenceType = "EMBALAGEM_DIFERENTE";
      }
      var unitDiff = isBoxQuantityItem(item) && getTransferExpectedUnits(item) > 0 ? item.packedUnits - getTransferExpectedUnits(item) : 0;
      if (unitDiff !== 0 && item.packedQty >= item.separatedQty) {
        item.divergenceType = unitDiff > 0 ? "QUANTIDADE_EXCEDENTE" : "FALTA_DE_ITEM";
        if (unitDiff > 0) item.excessQty = Math.max(Number(item.excessQty || 0), unitDiff);
        if (unitDiff < 0) item.missingQty = Math.max(Number(item.missingQty || 0), Math.abs(unitDiff));
      }
      item.status = item.packedQty >= item.separatedQty ? "ENVIADO" : "EM_CAIXA";
      var packUpdate = Object.assign({
        quantidade_lacrada: item.packedQty,
        quantidade_lacrada_unidades: item.packedUnits || 0,
        unidades_por_caixa: item.unitsPerBox || 0,
        quantidade_total_unidades: getTransferExpectedUnits(item),
        embalagem_observacao: item.packagingObservation || "",
        status_operacional: transferOperationalStatusForItem(item),
        status_divergencia: transferDivergenceStatusForItem(item),
        status: item.status,
        updated_at: now
      }, transferItemAuditDbFields(item));
      var packResponse = await updateRowWithSchemaFallback("wms_transfer_items", "id", item.id, packUpdate);
      if (packResponse.error) throw packResponse.error;
      if (isBoxQuantityItem(item) && !boxPacking.mixed) await saveProductPackagingPattern(item);
      if (packExcess > 0) await registerTransferDivergence(transfer, item, "QUANTIDADE_EXCEDENTE", packExpected, item.packedQty, packExcess, inputType, "Excesso registrado na montagem da caixa.");
      if (isBoxQuantityItem(item) && (unitDiff !== 0 || boxPatternDiff !== 0) && item.packedQty >= item.separatedQty) {
        await registerTransferDivergence(transfer, item, unitDiff > 0 ? "QUANTIDADE_EXCEDENTE" : unitDiff < 0 ? "FALTA_DE_ITEM" : "EMBALAGEM_DIFERENTE", boxPatternDiff ? referenceUnits : getTransferExpectedUnits(item), boxPatternDiff ? Number(boxPacking.packedUnitsDelta || 0) : item.packedUnits, boxPatternDiff || unitDiff, inputType, "Divergencia registrada no total em unidades das caixas.");
      }
    } else {
      var sepExpected = item.isExtra ? Number(item.separatedQty || 0) + qty : Number(item.requestedQty || 0);
      var sepCurrent = Number(item.separatedQty || 0);
      var sepExcess = Math.max(0, sepCurrent + qty - sepExpected);
      var sepNewQty = sepCurrent + qty;
      var sepMissing = Math.max(0, sepExpected - sepNewQty);
      if (sepMissing > 0 && !pendingInfo && !window.confirm("Este produto foi solicitado com " + formatQty(sepExpected) + ", mas voce esta separando " + formatQty(sepNewQty) + ". Confirmar divergencia?")) {
        setStatus("transferWorkStatus", "Corrija a quantidade antes de confirmar.", "warning");
        $("transferQuantityInput").focus();
        return;
      }
      if (sepExcess > 0 && !item.isExtra && !window.confirm("Quantidade maior que a solicitada. Confirmar divergencia?")) {
        setStatus("transferWorkStatus", "Corrija a quantidade antes de confirmar.", "warning");
        $("transferQuantityInput").focus();
        return;
      }
      item.separatedQty = sepNewQty;
      if (sepExcess > 0) {
        item.excessQty = Number(item.excessQty || 0) + sepExcess;
        item.divergenceType = "QUANTIDADE_EXCEDENTE";
      }
      if (sepMissing > 0 && !item.isExtra) {
        item.missingQty = Math.max(Number(item.missingQty || 0), sepMissing);
        item.divergenceType = "FALTA_DE_ITEM";
        item.pendingReason = pendingInfo ? pendingInfo.reason : item.pendingReason || "Separacao parcial autorizada";
        item.pendingObservation = pendingInfo ? pendingInfo.observation : item.pendingObservation || "";
      }
      item.status = "SEPARADO";
      var sepUpdate = Object.assign({
        quantidade_separada: item.separatedQty,
        quantidade_faltante: item.missingQty || 0,
        status_operacional: transferOperationalStatusForItem(item),
        status_divergencia: transferDivergenceStatusForItem(item),
        status: item.status,
        updated_at: now
      }, transferItemAuditDbFields(item));
      var sepResponse = await updateRowWithSchemaFallback("wms_transfer_items", "id", item.id, sepUpdate);
      if (sepResponse.error) throw sepResponse.error;
      if (sepExcess > 0) await registerTransferDivergence(transfer, item, "QUANTIDADE_EXCEDENTE", sepExpected, item.separatedQty, sepExcess, inputType, "Excesso registrado na separacao.");
      if (sepMissing > 0 && !item.isExtra) await registerTransferDivergence(transfer, item, "FALTA_DE_ITEM", sepExpected, item.separatedQty, -sepMissing, inputType, "Pendencia registrada: " + (item.pendingReason || "Sem motivo informado") + (item.pendingObservation ? " - " + item.pendingObservation : ""));
    }
    if (Number(item.excessQty || 0) > 0 || Number(item.missingQty || 0) > 0 || item.divergenceType) await markTransferHasDivergence(transfer);
    invalidateTransferStatsCache();
    await persistTransferLightSummary(transfer, mode === "MONTAGEM" ? "ITEM_PACKED" : "ITEM_SEPARATED", { sku: item.sku });
    clearTransferInputs();
    if (mode === "SEPARACAO") transferState.manualSeparationQty = false;
    applyLocalTransferItemUpdate(item);
    writeTransferCacheSoon();
    renderTransfers();
    setStatus("transferWorkStatus", mode === "MONTAGEM" ? "Item confirmado na caixa." : "Item marcado como separado.", "success");
    if (mode === "MONTAGEM") $("transferScanInput").focus();
    } finally {
      endTransferAction(actionButton);
    }
  }

  function confirmSeparationCollection(item, qty) {
    return window.confirm([
      "Confirmar coleta deste item?",
      "",
      "SKU: " + (item.sku || "-"),
      "Produto: " + (item.description || "-"),
      "Quantidade a coletar: " + formatQty(qty) + " " + (item.unit || "UN"),
      transferCompactLocationLabel(item)
    ].join("\n"));
  }

  function requestTransferPendingReason(item) {
    var reasons = [
      "Sem estoque",
      "Produto nao localizado",
      "Produto avariado",
      "Produto divergente",
      "Separacao parcial autorizada",
      "Outro"
    ];
    var message = [
      "Este produto foi solicitado, mas sera enviado com quantidade zero. Informe o motivo.",
      "",
      "SKU: " + (item && item.sku || "-"),
      "Produto: " + (item && item.description || "-"),
      "",
      reasons.map(function (reason, index) { return (index + 1) + " - " + reason; }).join("\n")
    ].join("\n");
    var answer = window.prompt(message, "1");
    if (answer === null) return null;
    answer = normalizeText(answer);
    var selected = reasons[Number(answer) - 1] || reasons.find(function (reason) {
      return normalizeHeader(reason) === normalizeHeader(answer);
    }) || answer;
    selected = normalizeText(selected);
    if (!selected) return null;
    var observation = "";
    if (normalizeHeader(selected) === "outro") {
      observation = normalizeText(window.prompt("Descreva o motivo da falta:", "") || "");
      if (!observation) return null;
    }
    return { reason: selected, observation: observation };
  }

  async function finishSeparation() {
    var transfer = getTransferById(transferState.activeTransferId);
    if (!transfer) return;
    var pending = getTransferItems(transfer.id).filter(function (item) { return !item.isExtra && !isTransferItemSeparationClosed(item) && item.separatedQty < item.requestedQty; });
    if (pending.length) {
      if (!window.confirm("Existem itens pendentes. Deseja finalizar com divergência?")) {
        setStatus("transferWorkStatus", "Volte para concluir as pendências.", "warning");
        return;
      }
      await registerMissingTransferItems(transfer, "SEPARACAO");
      pending = [];
    }
    if (pending.length) {
      setStatus("transferWorkStatus", "Só é possível concluir quando todos os itens estiverem separados.", "error");
      return;
    }
    var actionButton = !$("finishSeparationReadyButton").hidden ? $("finishSeparationReadyButton") : $("finishSeparationButton");
    if (!beginTransferAction("finish-separation:" + transfer.id, actionButton, "Salvando...")) return;
    try {
    var separationFinishedAt = new Date().toISOString();
    await updateTransferStatus(transfer, "EM_MONTAGEM_CAIXA", {
      separacao_concluida_em: separationFinishedAt,
      duracao_separacao_segundos: secondsBetween(transfer.separationStartedAt || transfer.startedAt, separationFinishedAt),
      lacre_iniciado_em: separationFinishedAt,
      separation_finished_at: separationFinishedAt,
      separation_duration_seconds: secondsBetween(transfer.separationStartedAt || transfer.startedAt, separationFinishedAt),
      packing_started_at: separationFinishedAt
    }, "SEPARATION_FINISHED");
    await recordTransferEvent(transfer.id, "", "PACKING_STARTED", "", 0, "Montagem da caixa iniciada.", {});
    await loadTransferData();
    transferState.activeTransferId = transfer.id;
    transferState.activeWorkMode = "MONTAGEM";
    transferState.manualSeparationQty = false;
    renderTransfers();
    setStatus("transferWorkStatus", "Separação concluída. Bipe o SKU e informe a quantidade.", "success");
    } finally {
      endTransferAction(actionButton);
    }
  }

  async function startPacking() {
    var transfer = getTransferById(transferState.activeTransferId);
    if (!transfer) return;
    var packingStartedAt = new Date().toISOString();
    await updateTransferStatus(transfer, "EM_MONTAGEM_CAIXA", { lacre_iniciado_em: packingStartedAt, packing_started_at: packingStartedAt }, "PACKING_STARTED");
    await loadTransferData();
    transferState.activeTransferId = transfer.id;
    transferState.activeWorkMode = "MONTAGEM";
    transferState.manualSeparationQty = false;
    renderTransfers();
    setStatus("transferWorkStatus", "Montagem da caixa iniciada. Bipe os itens colocados na caixa.", "success");
  }

  async function finishPacking() {
    var transfer = getTransferById(transferState.activeTransferId);
    if (!transfer) return;
    var finalBoxCount = readFinalBoxCountInput();
    if (!finalBoxCount) {
      setStatus("transferWorkStatus", "Informe a quantidade final de caixas para finalizar.", "error");
      if ($("transferFinalBoxesInput")) $("transferFinalBoxesInput").focus();
      return;
    }
    var pending = getTransferItems(transfer.id).filter(function (item) { return !item.isExtra && !isTransferItemNotSent(item) && item.packedQty < item.separatedQty; });
    var boxWithoutUnits = getTransferItems(transfer.id).filter(function (item) {
      return !item.isExtra && isBoxQuantityItem(item) && Number(item.packedQty || 0) > 0 && getTransferPackedUnits(item) <= 0;
    });
    if (boxWithoutUnits.length) {
      transferState.selectedItemId = boxWithoutUnits[0].id;
      renderTransferWork();
      setStatus("transferWorkStatus", "Informe quantas unidades vêm em cada caixa para continuar.", "error");
      return;
    }
    var shouldRegisterPackingMissing = pending.length > 0;
    if (shouldRegisterPackingMissing && !window.confirm("Existem itens faltando colocar na caixa. Finalizar com divergencia?")) {
      setStatus("transferWorkStatus", "Revise os itens antes de finalizar.", "warning");
      return;
    }
    if (shouldRegisterPackingMissing) pending = [];
    if (pending.length) {
      setStatus("transferWorkStatus", "Finalize todos os itens antes de concluir a transferência.", "error");
      return;
    }
    var report = getTransferFinalReport(transfer);
    var hasDivergence = shouldRegisterPackingMissing || report.divergences.length > 0 || countTransferDivergences(transfer.id) > 0;
    var message = hasDivergence ? "Existem divergências nesta transferência. Finalizar mesmo assim?" : "Transferência pronta para nota. Finalizar?";
    if (!shouldRegisterPackingMissing && !window.confirm(message)) {
      setStatus("transferWorkStatus", "Revise os itens antes de finalizar.", "warning");
      return;
    }
    var actionButton = $("finishPackingButton");
    if (!beginTransferAction("finish-packing:" + transfer.id, actionButton, "Salvando...")) return;
    try {
    if (shouldRegisterPackingMissing) {
      await registerMissingTransferItems(transfer, "LACRE");
      await loadTransferData();
      transfer = getTransferById(transfer.id) || transfer;
      report = getTransferFinalReport(transfer);
      hasDivergence = true;
    }
    var packingFinishedAt = new Date().toISOString();
    var finalStats = getTransferStats(transfer.id);
    var wasRevalidation = ["CORRECAO_SOLICITADA", "EM_CORRECAO"].indexOf(transfer.status) >= 0;
    await updateTransferStatus(transfer, hasDivergence ? "PRONTA_PARA_NOTA_COM_DIVERGENCIA" : "PRONTA_PARA_NOTA", {
      lacre_concluido_em: packingFinishedAt,
      duracao_lacre_segundos: secondsBetween(transfer.packingStartedAt || transfer.separationFinishedAt, packingFinishedAt),
      finalizado_em: packingFinishedAt,
      duracao_segundos: secondsBetween(transfer.startedAt || transfer.separationStartedAt || transfer.createdAt, packingFinishedAt),
      total_caixas: finalBoxCount,
      total_enviado: finalStats.packed,
      diferenca_total: finalStats.packed - finalStats.requested,
      has_divergence: hasDivergence,
      packing_finished_at: packingFinishedAt,
      packing_duration_seconds: secondsBetween(transfer.packingStartedAt || transfer.separationFinishedAt, packingFinishedAt),
      total_finished_at: packingFinishedAt,
      total_duration_seconds: secondsBetween(transfer.startedAt || transfer.separationStartedAt || transfer.createdAt, packingFinishedAt)
    }, wasRevalidation ? "TRANSFER_REVALIDATION_FINISHED" : "PACKING_FINISHED", {
      finalBoxCount: finalBoxCount,
      finalizedById: (authState.currentUser || {}).id || "",
      finalizedByName: (authState.currentUser || {}).name || "",
      finalizedAt: packingFinishedAt,
      hasDivergence: hasDivergence,
      revalidated: wasRevalidation
    }, {
      quantity: finalBoxCount,
      quantityInformed: finalBoxCount,
      observation: (wasRevalidation ? "Revalidacao concluida. " : "") + "Quantidade final de caixas: " + finalBoxCount
    });
    await loadTransferData();
    transferState.activeTransferId = transfer.id;
    transferState.activeWorkMode = "FINALIZACAO";
    renderTransfers();
    setStatus("transferWorkStatus", hasDivergence ? "Transferência pronta para nota com divergência." : "Transferência pronta para nota.", hasDivergence ? "warning" : "success");
    } finally {
      endTransferAction(actionButton);
    }
  }

  async function rebuildConferenceAfterAdminChange(transfer, message) {
    var conference = buildFinalTransferConference(transfer);
    renderXmlConferencePayload(conference);
    await finalizeTransferAfterConference(transfer, conference);
    await recordTransferEvent(
      transfer.id,
      "",
      "XML_CONFERENCE",
      "",
      conference.summary.totalXmlQty,
      message || "Conferência recalculada após ajuste administrativo.",
      conference
    );
    await loadTransferData();
    transferState.activeTransferId = transfer.id;
    transferState.activeWorkMode = isXmlConferenceTransfer(transfer) ? "CONFERENCIA" : transferState.activeWorkMode;
    renderTransfers();
    setStatus("xmlConferenceStatus", conference.summary.correct ? "Conferência ajustada: 100% correta." : "Conferência ajustada. Ainda existem divergências.", conference.summary.correct ? "success" : "warning");
  }

  async function adjustConferenceItemQuantity(itemId) {
    if (!isAdminOrSupervisor()) return;
    var item = transferState.items.find(function (entry) { return entry.id === itemId; });
    var transfer = item ? getTransferById(item.transferId) : null;
    var input = document.querySelector("[data-transfer-adjust-input=\"" + itemId + "\"]");
    if (!item || !transfer || !input) return;
    var qty = parseQuantity(input.value);
    if (qty < 0) {
      setStatus("xmlConferenceStatus", "Informe uma quantidade válida.", "error");
      input.focus();
      return;
    }
    var now = new Date().toISOString();
    var expectedQty = Number(item.requestedQty || 0);
    if (isXmlConferenceTransfer(transfer)) item.separatedQty = qty;
    else item.packedQty = qty;
    if (item.isExtra) {
      item.extraQty = qty;
      item.excessQty = qty;
      item.missingQty = 0;
      item.divergenceType = qty > 0 ? (item.divergenceType || "ITEM_EXTRA") : "";
      item.status = qty > 0 ? "EXTRA" : "REMOVIDO";
    } else {
      item.missingQty = Math.max(0, expectedQty - qty);
      item.excessQty = Math.max(0, qty - expectedQty);
      item.divergenceType = item.missingQty > 0 ? "FALTA_DE_ITEM" : item.excessQty > 0 ? "QUANTIDADE_EXCEDENTE" : "";
      item.status = qty >= expectedQty ? "CONFERIDO" : "PARCIAL";
    }
    item.updatedAt = now;
    var update = Object.assign({
      quantidade_separada: item.separatedQty,
      quantidade_lacrada: item.packedQty,
      status: item.status,
      updated_at: now
    }, transferItemAuditDbFields(item));
    var response = await updateRowWithSchemaFallback("wms_transfer_items", "id", item.id, update);
    if (response.error) throw response.error;
    var diff = qty - expectedQty;
    await recordTransferEvent(transfer.id, item.id, "CONFERENCE_ITEM_ADJUSTED", item.sku, qty, "Quantidade ajustada pelo líder após envio da conferência.", {
      inputType: "AJUSTE_ADMIN",
      divergenceType: item.divergenceType || "",
      previousStatus: transfer.status
    }, {
      inputType: "AJUSTE_ADMIN",
      divergenceType: item.divergenceType || "",
      quantityExpected: expectedQty,
      quantityInformed: qty,
      quantityDifference: diff
    });
    await rebuildConferenceAfterAdminChange(transfer, "Conferência recalculada após ajuste de item.");
  }

  async function deleteConferenceExtraItem(itemId) {
    if (!isAdminOrSupervisor()) return;
    var item = transferState.items.find(function (entry) { return entry.id === itemId; });
    var transfer = item ? getTransferById(item.transferId) : null;
    if (!item || !transfer || !item.isExtra) return;
    if (!window.confirm("Remover o item extra " + item.sku + " desta conferência?")) return;
    var response = await supabaseDb.from("wms_transfer_items").delete().eq("id", item.id);
    if (response.error) throw response.error;
    await recordTransferEvent(transfer.id, "", "CONFERENCE_EXTRA_REMOVED", item.sku, Number(item.extraQty || item.separatedQty || 0), "Item extra removido pelo líder após envio.", {
      inputType: "AJUSTE_ADMIN",
      divergenceType: "ITEM_EXTRA_REMOVIDO"
    });
    await loadTransferData();
    transferState.activeTransferId = transfer.id;
    transfer = getTransferById(transfer.id) || transfer;
    await rebuildConferenceAfterAdminChange(transfer, "Conferência recalculada após remoção de item extra.");
  }

  function requestTransferDeleteConfirmation(transfer) {
    var items = getTransferItems(transfer.id);
    var details = [
      "Transferencia: " + (transferDisplayName(transfer) || transfer.code || transfer.id),
      "Rota: " + transferRouteOriginLabel(transfer) + " > " + transferRouteDestinationLabel(transfer),
      "Responsavel: " + (transfer.responsibleName || "-"),
      "Status: " + transferStatusDisplayLabel(transfer.status),
      "Itens: " + items.length
    ];
    var modal = $("transferDeleteModal");
    if (!modal) {
      return Promise.resolve(window.confirm("Tem certeza que deseja excluir esta transferencia?\n\n" + details.join("\n") + "\n\nEsta acao removera a transferencia e seus dados relacionados da operacao."));
    }
    $("transferDeleteDetails").innerHTML = details.map(function (detail) {
      return "<span>" + escapeHtml(detail) + "</span>";
    }).join("");
    modal.hidden = false;
    return new Promise(function (resolve) {
      var buttons = modal.querySelectorAll("[data-transfer-delete-decision]");
      function close(result) {
        modal.hidden = true;
        buttons.forEach(function (button) { button.removeEventListener("click", onClick); });
        resolve(result);
      }
      function onClick(event) {
        close(event.currentTarget.dataset.transferDeleteDecision === "confirm");
      }
      buttons.forEach(function (button) { button.addEventListener("click", onClick); });
      var cancelButton = modal.querySelector("[data-transfer-delete-decision='cancel']");
      if (cancelButton) cancelButton.focus();
    });
  }

  async function deleteRelatedTransferRows(tableName, columnName, transferId) {
    var response = await supabaseDb.from(tableName).delete().eq(columnName, transferId);
    if (response.error && !isMissingTransferTableError(response.error) && !isMissingColumnError(response.error)) throw response.error;
  }

  async function cleanupTransferRelatedData(transferId) {
    if (!isSupabaseReady() || !transferId) return;
    var tables = [
      { name: "wms_task_notifications", column: "transfer_id" },
      { name: "wms_notifications", column: "transfer_id" },
      { name: "wms_transfer_boxes", column: "transfer_id" },
      { name: "wms_transfer_packages", column: "transfer_id" },
      { name: "wms_transfer_divergences", column: "transfer_id" },
      { name: "wms_transfer_merge_items", column: "merged_transfer_id" },
      { name: "wms_transfer_merge_items", column: "original_transfer_id" },
      { name: "wms_transfer_items", column: "transfer_id" }
    ];
    for (var i = 0; i < tables.length; i += 1) {
      await deleteRelatedTransferRows(tables[i].name, tables[i].column, transferId);
    }
  }

  async function deleteTransferPermanently(id) {
    if (!isAdminOrSupervisor()) {
      showToast("Somente administrador ou supervisor pode excluir transferencia.", "error");
      return false;
    }
    var transfer = getTransferById(id);
    if (!transfer) return false;
    if (!transferBelongsToActiveWarehouse(transfer)) {
      showToast("Esta transferencia pertence a outro estoque.", "error");
      return false;
    }
    var confirmed = await requestTransferDeleteConfirmation(transfer);
    if (!confirmed) {
      showToast("Exclusão cancelada.", "warning");
      return false;
    }
    var actionButton = document.querySelector("[data-transfer-delete-permanent=\"" + id + "\"]");
    if (!beginTransferAction("delete-test:" + id, actionButton, "Excluindo...")) return false;
    try {
      transferDebugLog("Excluindo transferencia", { id: id, code: transfer.code });
      var now = nowIso();
      var response = await updateTransferWithSchemaFallback(id, {
        status: "CANCELADA",
        is_deleted: true,
        deleted_at: now,
        deleted_by_id: (authState.currentUser || {}).id || "",
        deleted_by_name: (authState.currentUser || {}).name || "",
        updated_at: now,
        last_action_at: now,
        last_action_label: "Transferencia excluida"
      });
      if (response.error) throw response.error;
      await cleanupTransferRelatedData(id);
      removeLocalTransferEverywhere(id);
      maintenanceState.lastReport = null;
      renderTransfers();
      renderMaintenance();
      showToast("Transferencia excluida.", "success");
      return true;
    } finally {
      endTransferAction(actionButton);
    }
  }

  async function cancelTransfer(id) {
    var transfer = getTransferById(id);
    if (!transfer || !canCancelTransfer(transfer)) return;
    if (!window.confirm("Cancelar a transferência " + transferDisplayName(transfer) + "?")) return;
    await updateTransferStatus(transfer, "CANCELADA", {}, "TRANSFER_CANCELLED");
    await loadTransferData();
    renderTransfers();
    showToast("Transferência cancelada.", "success");
  }

  async function requestTransferRevalidation(id) {
    var transfer = getTransferById(id);
    if (!transfer || !canRequestTransferRevalidation(transfer)) {
      showToast("Não foi possível devolver esta transferência para revalidação.", "error");
      return;
    }
    var responsible = transfer.responsibleName || "operador responsável";
    if (!window.confirm("Devolver " + transferDisplayName(transfer) + " para " + responsible + " revalidar a montagem?")) return;
    var actionButton = document.querySelector("[data-transfer-revalidate=\"" + id + "\"]");
    if (!beginTransferAction("revalidate:" + id, actionButton, "Enviando...")) return;
    try {
      var now = new Date().toISOString();
      await updateTransferStatus(transfer, "CORRECAO_SOLICITADA", {
        finalizado_em: null,
        final_result: "",
        total_finished_at: null,
        updated_at: now,
        last_action_at: now,
        last_action_label: "Revalidacao solicitada"
      }, "TRANSFER_REVALIDATION_REQUESTED", {
        requestedById: (authState.currentUser || {}).id || "",
        requestedByName: (authState.currentUser || {}).name || "",
        responsibleId: transfer.responsibleId || "",
        responsibleName: responsible,
        requestedAt: now
      }, {
        observation: "Transferencia devolvida para revalidacao da montagem."
      });
      await loadTransferData();
      transferState.activeTransferId = id;
      transferState.activeWorkMode = "MONTAGEM";
      renderTransfers();
      renderOperatorTasksAlert();
      showToast("Transferência devolvida para revalidação.", "success");
    } catch (error) {
      console.error("Erro ao devolver transferência para revalidação:", error);
      showToast("Erro ao devolver para revalidação: " + formatSupabaseError(error), "error");
    } finally {
      endTransferAction(actionButton);
    }
  }

  async function handleTransferActionClick(event) {
    var button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.transferLoadMore !== undefined) {
      transferState.panelRenderLimit = Number(transferState.panelRenderLimit || TRANSFER_PANEL_PAGE_SIZE) + TRANSFER_PANEL_PAGE_SIZE;
      renderTransferPanel();
      return;
    }
    if (button.dataset.transferView) await openTransferWork(button.dataset.transferView, { viewOnly: true });
    if (button.dataset.transferOpen) await openTransferWork(button.dataset.transferOpen);
    if (button.dataset.transferExportXml) await exportTransferConferenceXml(button.dataset.transferExportXml);
    if (button.dataset.transferAssignConference) await assignTransferConference(button.dataset.transferAssignConference);
    if (button.dataset.transferCancel) await cancelTransfer(button.dataset.transferCancel);
    if (button.dataset.transferRevalidate) await requestTransferRevalidation(button.dataset.transferRevalidate);
    if (button.dataset.transferDeletePermanent) await deleteTransferPermanently(button.dataset.transferDeletePermanent);
    if (button.dataset.transferAdjustItem) await adjustConferenceItemQuantity(button.dataset.transferAdjustItem);
    if (button.dataset.transferDeleteExtra) await deleteConferenceExtraItem(button.dataset.transferDeleteExtra);
    if (button.dataset.establishmentEdit) editEstablishment(button.dataset.establishmentEdit);
    if (button.dataset.establishmentToggle) await toggleEstablishment(button.dataset.establishmentToggle);
  }

  async function importExcel() {
    if (!ensureActiveWarehouse()) {
      setStatus("importStatus", "Selecione um estoque antes de importar.", "error");
      return;
    }
    if (!window.XLSX) {
      setStatus("importStatus", "Biblioteca xlsx nao carregada. Verifique a conexao com a internet.", "error");
      return;
    }
    var files = Array.from($("excelFileInput").files || []);
    if (!files.length) {
      setStatus("importStatus", "Selecione uma ou duas planilhas Excel.", "error");
      return;
    }

    if (!isSupabaseReady()) {
      setStatus("importStatus", "Supabase nao conectado. " + describeSupabaseConfigProblem(), "error");
      return;
    }

    var actionButton = $("importExcelButton");
    if (!beginTransferAction("import-addresses", actionButton, "Importando...")) return;
    try {
      setStatus("importStatus", "Lendo planilha e preparando importacao...", "warning");
      var workbooks = await Promise.all(files.map(readWorkbookFile));
      var parsed = collectImportData(workbooks);
      if (!parsed.addressRows.length && !Object.keys(parsed.products).length) {
        setStatus("importStatus", "Nenhuma aba reconhecida. Selecione LinhaSeparacao e/ou MaterialLinhaSeparacao.", "error");
        return;
      }
      if (parsed.addressRows.length && !(await ensureWarehouseSeparatedTable("wms_bindings", "importStatus"))) return;
      mergeProducts(parsed.products);
      var oldBindingsCount = state.bindings.length;
      if (parsed.addressRows.length) {
        state.bindings = [];
      }
      var result = importRows(parsed.addressRows);
      var importDetails = parsed.addressRows.length
        ? result.created + " endereco(s) novos, " + oldBindingsCount + " endereco(s) antigos substituido(s), " + result.skipped + " duplicado(s), " + result.invalid + " invalido(s), " + Object.keys(parsed.products).length + " produto(s) lido(s)."
        : Object.keys(parsed.products).length + " produto(s) lido(s); enderecamentos atuais mantidos.";
      addHistory("Excel importado", "", "", importDetails);

      setStatus("importStatus", "Gravando no Supabase. Aguarde...", "warning");
      if (parsed.addressRows.length) {
        setStatus("importStatus", "Apagando enderecamentos antigos no Supabase...", "warning");
        await clearRemoteWarehouseRows("wms_bindings", "id");
      }
      var saved = await saveData();
      if (!saved) {
        setStatus("importStatus", "Falha ao gravar a importacao no Supabase. Veja a mensagem em Configuracoes.", "error");
        return;
      }

      await verifyImportedBindings(result.changedIds);
      await loadData();
      renderAll();
      if (parsed.addressRows.length) {
        setStatus("importStatus", "Importacao salva no Supabase: base antiga substituida por " + result.created + " endereco(s), " + result.skipped + " duplicado(s), " + result.invalid + " invalido(s).", "success");
      } else {
        setStatus("importStatus", "Produtos importados no Supabase. Enderecamentos atuais mantidos.", "success");
      }
    } catch (error) {
      var message = explainImportError(error);
      console.error("Falha na importacao:", error);
      setStatus("importStatus", "Falha na importacao: " + message, "error");
      updateSupabaseStatus("Falha na importacao: " + message, "error");
    } finally {
      endTransferAction(actionButton);
    }
  }

  function readWorkbookFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (event) {
        try {
          var data = new Uint8Array(event.target.result);
          var workbook = window.XLSX.read(data, { type: "array", cellText: true, cellDates: false });
          resolve({ fileName: file.name, workbook: workbook });
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  function collectImportData(workbooks) {
    var data = { products: {}, addressRows: [] };
    workbooks.forEach(function (entry) {
      entry.workbook.SheetNames.forEach(function (sheetName) {
        var sheet = entry.workbook.Sheets[sheetName];
        var rows = window.XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
        rows.forEach(function (row) {
          var skuValues = splitSkuValues(getByAliases(row, ["Codigo Material", "Cod Material"]));
          var sku = skuValues[0] || "";
          var productName = normalizeText(getByAliases(row, ["Desc Material", "Descricao Material", "Descrição Material", "Nome Produto", "Produto"]));
          skuValues.forEach(function (skuValue) {
            if (skuValue && productName) data.products[skuValue] = productName;
          });

          var station = getByAliases(row, ["Nome estacao", "Estacao", "Estação"]);
          var rack = getByAliases(row, ["Nr Rack", "Rack"]);
          var line = getByAliases(row, ["Linha", "Linha prod alocado"]);
          var column = getByAliases(row, ["Coluna", "Coluna prod alocado"]);
          var hasAddress = [station, rack, line, column].some(function (value) {
            return normalizeText(value) !== "";
          });
          if (!skuValues.length || !hasAddress) return;

          data.addressRows.push({
            sku: sku,
            productName: productName,
            station: station,
            rack: rack,
            line: line,
            column: column,
            areaCode: Number(getByAliases(row, ["Area Linha Separação", "Area Linha Separaçao", "Area Linha Separacao"])) || 1
          });
        });
      });
    });
    return data;
  }

  function mergeProducts(products) {
    Object.keys(products).forEach(function (sku) {
      state.products[sku] = products[sku];
      productsDirty = true;
      var normalizedWithoutZeros = normalizeSkuKey(sku);
      if (normalizedWithoutZeros && normalizedWithoutZeros !== sku) {
        state.products[normalizedWithoutZeros] = products[sku];
        productsDirty = true;
      }
    });
    state.bindings.forEach(function (binding) {
      var productName = findProductName(binding.sku);
      if (productName) {
        binding.productName = productName;
      }
    });
  }

  function refreshProductNamesForBindings(bindings) {
    var changed = false;
    bindings.forEach(function (binding) {
      var productName = findProductName(binding.sku);
      if (productName && binding.productName !== productName) {
        binding.productName = productName;
        changed = true;
      }
    });
    if (changed) saveData();
  }

  function validateColumns(rows) {
    if (!rows.length) return { valid: false, message: "Planilha vazia." };
    var available = Object.keys(rows[0]).map(normalizeHeader);
    var required = ["Nome estacao", "Nr Rack", "Linha", "Coluna", "Codigo Material"].map(normalizeHeader);
    for (var i = 0; i < required.length; i += 1) {
      if (available.indexOf(required[i]) === -1) {
        return { valid: false, message: "Coluna obrigatoria ausente." };
      }
    }
    return { valid: true };
  }

  function importRows(rows) {
    var result = { created: 0, updated: 0, skipped: 0, invalid: 0, changedIds: [] };
    var usedPairs = {};
    rows.forEach(function (row) {
      var parsed = buildLocationFromParts(row.station, row.rack, row.line, row.column);
      var areaCode = getAreaByCode(row.areaCode) ? row.areaCode : 1;
      var area = getAreaByCode(areaCode);
      if (!row.sku || !area || !parsed.valid) {
        result.invalid += 1;
        return;
      }
      var locationKey = locationKeyFromCode(parsed.code);
      var skuKey = normalizeSkuKey(row.sku);
      var pairKey = skuKey + "\u0001" + locationKey;
      if (usedPairs[pairKey]) {
        result.skipped += 1;
        return;
      }
      usedPairs[pairKey] = true;
      var existing = state.bindings.find(function (binding) {
        return locationKeyFromBinding(binding) === locationKey && normalizeSkuKey(binding.sku) === skuKey;
      });
      if (existing) {
        var newName = row.productName || findProductName(row.sku) || "";
        existing.sku = row.sku;
        existing.rua = parsed.rua;
        existing.rack = parsed.rack;
        existing.linha = parsed.linha;
        existing.letra = parsed.letra;
        existing.locationCode = parsed.code;
        existing.areaCode = areaCode;
        existing.areaName = area.name;
        existing.productName = newName;
        existing.updatedAt = new Date().toISOString();
        result.updated += 1;
        result.changedIds.push(existing.id);
        return;
      }
      var newBinding = createBinding(row.sku, parsed, areaCode, row.productName || findProductName(row.sku) || "");
      state.bindings.push(newBinding);
      result.changedIds.push(newBinding.id);
      result.created += 1;
    });
    return result;
  }

  async function verifyImportedBindings(ids) {
    var sampleIds = Array.from(new Set(ids || [])).slice(0, 20);
    if (!sampleIds.length) return;
    var response = await supabaseDb
      .from("wms_bindings")
      .select("id")
      .eq("warehouse_code", activeWarehouseCode())
      .in("id", sampleIds);
    if (response.error) throw response.error;
    var found = (response.data || []).length;
    if (found !== sampleIds.length) {
      throw new Error("Supabase gravou " + found + " de " + sampleIds.length + " registros verificados em wms_bindings.");
    }
  }

  function explainImportError(error) {
    var message = formatSupabaseError(error);
    var lower = message.toLowerCase();
    if (lower.indexOf("wms_bindings_sku_location_idx") >= 0 || lower.indexOf("wms_bindings_sku_location_key") >= 0) {
      var label = activeWarehouseCodes().length ? activeWarehouseCodes().join(", ") : "os estoques ativos";
      return "O Supabase ainda esta com a regra antiga de enderecamento sem estoque. Aplique as migrations para remover o indice antigo e permitir " + label + " separados. Erro original: " + message;
    }
    if (lower.indexOf("duplicate key value") >= 0 && lower.indexOf("wms_bindings") >= 0) {
      return "A importacao encontrou uma duplicidade no banco. Aplique as migrations para garantir o indice por estoque (warehouse_code, sku, location_code). Erro original: " + message;
    }
    if (isMissingWarehouseColumnError(error)) return multiWarehouseSchemaMessage("wms_bindings") + " Erro original: " + message;
    return message;
  }

  function renderHistory() {
    var filter = ($("historyFilterInput") ? $("historyFilterInput").value : "").toLowerCase().trim();
    var items = state.history.slice().sort(function (a, b) {
      return new Date(b.datetime) - new Date(a.datetime);
    });
    if (filter) {
      items = items.filter(function (item) {
        return [item.datetime, item.action, item.sku, item.location, item.details].join(" ").toLowerCase().indexOf(filter) >= 0;
      });
    }
    var visibleItems = items.slice(0, HISTORY_RENDER_LIMIT);
    $("historyRows").innerHTML = visibleItems.length ? visibleItems.map(function (item) {
      return "<tr><td>" + formatDateTime(item.datetime) + "</td><td>" + escapeHtml(item.action) + "</td><td>" + escapeHtml(item.sku || "-") + "</td><td>" + escapeHtml(item.location || "-") + "</td><td>" + escapeHtml(item.details || "-") + "</td></tr>";
    }).join("") + renderTableLimitNotice(items.length, visibleItems.length, 5, "registros de histórico") : "<tr><td colspan=\"5\">Nenhum historico registrado.</td></tr>";
  }

  async function saveSupabaseSettings() {
    supabaseConfig = sanitizeSupabaseConfig({
      url: normalizeText($("supabaseUrlInput").value),
      key: normalizeText($("supabaseKeyInput").value)
    });
    if (!isUsableSupabaseConfig(supabaseConfig)) {
      initSupabaseClient();
      fillSupabaseForm();
      updateSupabaseStatus("Configuracao Supabase invalida. " + describeSupabaseConfigProblem(), "error");
      showToast("Confira a URL do projeto e a anon public key.", "error");
      return;
    }
    localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify(supabaseConfig));
    initSupabaseClient();
    await loadData();
    await applyDataMigrations();
    renderAll();
    updateSupabaseStatus();
    showToast("Conexao Supabase salva.", "success");
  }

  async function testSupabaseConnection() {
    supabaseConfig = sanitizeSupabaseConfig({
      url: normalizeText($("supabaseUrlInput").value),
      key: normalizeText($("supabaseKeyInput").value)
    });
    fillSupabaseForm();
    initSupabaseClient();
    if (!isSupabaseReady()) {
      updateSupabaseStatus(describeSupabaseConfigProblem(), "error");
      return;
    }
    try {
      var probeId = "probe-" + Date.now();
      var probe = {
        id: probeId,
        sku: "TESTE-CONEXAO",
        rua: 1,
        rack: 1,
        linha: 1,
        letra: "A",
        location_code: "R01-RK01-L01-A",
        area_code: 1,
        area_name: "Alto Giro",
        product_name: "Teste de conexao",
        warehouse_id: activeWarehouseId(),
        warehouse_code: activeWarehouseCode(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      var insertResponse = await supabaseDb.from("wms_bindings").upsert(probe, { onConflict: "warehouse_code,sku,location_code" });
      if (insertResponse.error && isMissingWarehouseColumnError(insertResponse.error)) {
        assertWarehouseFallbackAllowed("wms_bindings", insertResponse.error);
        insertResponse = await supabaseDb.from("wms_bindings").upsert(stripWarehouseColumns(probe), { onConflict: "sku,location_code" });
      }
      if (insertResponse.error) throw insertResponse.error;

      var selectResponse = await supabaseDb.from("wms_bindings").select("id").eq("id", probeId).maybeSingle();
      if (selectResponse.error) throw selectResponse.error;
      if (!selectResponse.data) throw new Error("Insert executou, mas o registro de teste nao voltou no select.");

      var deleteResponse = await supabaseDb.from("wms_bindings").delete().eq("id", probeId);
      if (deleteResponse.error) throw deleteResponse.error;

      var bindingCount = await supabaseDb.from("wms_bindings").select("id", { count: "exact", head: true });
      if (bindingCount.error) throw bindingCount.error;
      var productCount = await supabaseDb.from("wms_products").select("sku", { count: "exact", head: true });
      var productCountText = "";
      var statusType = "success";
      if (productCount.error) {
        if (!isMissingProductsTableError(productCount.error)) throw productCount.error;
        productsTableAvailable = false;
        productCountText = " wms_products ausente; aplique as migrations para criar a tabela de produtos.";
        statusType = "warning";
      } else {
        productsTableAvailable = true;
        productCountText = " wms_products: " + (productCount.count || 0) + " produto(s).";
      }

      updateSupabaseStatus("Conexao OK. Escrita OK. SELECT em wms_bindings: " + (bindingCount.count || 0) + " registro(s)." + productCountText, statusType);
    } catch (error) {
      console.error("Teste Supabase falhou:", error);
      updateSupabaseStatus("Falha no Supabase: " + formatSupabaseError(error), "error");
    }
  }

  function updateSupabaseStatus(message, type) {
    if (!$("supabaseStatus")) return;
    var ready = isSupabaseReady();
    var text = message || (ready ? "Supabase configurado. Dados serao salvos no banco." : describeSupabaseConfigProblem());
    setStatus("supabaseStatus", text, type || (ready ? "success" : "warning"));
    updateHeaderConnectionStatus(type || (ready ? "success" : "warning"));
  }

  function updateHeaderTaskCount(count) {
    var value = Number(count) || 0;
    var el = $("topTaskCount");
    if (!el) return;
    el.textContent = String(value);
    var pill = el.closest(".task-pill");
    if (pill) pill.classList.toggle("has-tasks", value > 0);
  }

  function updateHeaderConnectionStatus(type) {
    var label = $("topConnectionLabel");
    var pill = $("topConnectionPill");
    if (!label || !pill) return;
    var ready = isSupabaseReady();
    label.textContent = ready ? "Online" : "Atencao";
    pill.classList.toggle("is-online", ready && type !== "warning" && type !== "error");
    pill.classList.toggle("is-warning", !ready || type === "warning" || type === "error");
  }

  function describeSupabaseConfigProblem() {
    if (supabaseConfig.url && supabaseConfig.key) {
      return "URL e anon key existem, mas o cliente Supabase nao inicializou. Recarregue a pagina e teste a conexao.";
    }

    var diagnostics = supabaseConfigDiagnostics || {};
    var endpoint = diagnostics.apiEndpoint || "/api/supabase-config";
    var viteUrlInfo = diagnostics.viteHasUrl ? "presente" : "ausente";
    var viteKeyInfo = diagnostics.viteHasKey ? "presente" : "ausente";
    var apiUrlInfo = diagnostics.apiHasUrl ? "presente" : "ausente";
    var apiKeyInfo = diagnostics.apiHasKey ? "presente" : "ausente";

    if (diagnostics.viteUrlPreview) viteUrlInfo += " (" + diagnostics.viteUrlPreview + ")";
    if (diagnostics.viteKeyPreview) viteKeyInfo += " (" + diagnostics.viteKeyPreview + ")";
    if (diagnostics.viteUrlSource) viteUrlInfo += " via " + diagnostics.viteUrlSource;
    if (diagnostics.viteKeySource) viteKeyInfo += " via " + diagnostics.viteKeySource;
    if (diagnostics.viteHasUrl && diagnostics.viteUrlValid === true) viteUrlInfo += " valida";
    if (diagnostics.viteHasKey && diagnostics.viteKeyValid === true) viteKeyInfo += " valida";
    if (diagnostics.viteHasUrl && diagnostics.viteUrlValid === false) viteUrlInfo += " invalida";
    if (diagnostics.viteHasKey && diagnostics.viteKeyValid === false) viteKeyInfo += " invalida";
    if (diagnostics.apiUrlSource) apiUrlInfo += " em " + diagnostics.apiUrlSource;
    if (diagnostics.apiKeySource) apiKeyInfo += " em " + diagnostics.apiKeySource;
    if (diagnostics.apiUrlPreview) apiUrlInfo += " (" + diagnostics.apiUrlPreview + ")";
    if (diagnostics.apiKeyPreview) apiKeyInfo += " (" + diagnostics.apiKeyPreview + ")";
    if (diagnostics.apiHasUrl && diagnostics.apiUrlValid === true) apiUrlInfo += " valida";
    if (diagnostics.apiHasKey && diagnostics.apiKeyValid === true) apiKeyInfo += " valida";
    if (diagnostics.apiHasUrl && diagnostics.apiUrlValid === false) apiUrlInfo += " invalida";
    if (diagnostics.apiHasKey && diagnostics.apiKeyValid === false) apiKeyInfo += " invalida";
    if (diagnostics.hasUrl && diagnostics.hasValidUrl === false) viteUrlInfo = "invalida (" + previewPublicValue(supabaseConfig.url) + ")";
    if (diagnostics.hasKey && diagnostics.hasValidKey === false) viteKeyInfo = "invalida (" + previewSecret(supabaseConfig.key) + ")";

    if (diagnostics.apiStatus && diagnostics.apiStatus !== 200) {
      return "Build Vite: VITE_SUPABASE_URL " + viteUrlInfo + "; VITE_SUPABASE_ANON_KEY " + viteKeyInfo + ". Fallback " + endpoint + " respondeu HTTP " + diagnostics.apiStatus + " " + (diagnostics.apiStatusText || "") + ".";
    }

    if (diagnostics.error) {
      return "Falha ao ler " + endpoint + ": " + diagnostics.error;
    }

    return "Build Vite/import.meta.env: VITE_SUPABASE_URL " + viteUrlInfo + "; VITE_SUPABASE_ANON_KEY " + viteKeyInfo + ". Fallback " + endpoint + ": URL " + apiUrlInfo + "; anon key " + apiKeyInfo + ".";
  }

  function formatSupabaseError(error) {
    if (!error) return "erro desconhecido";
    if (typeof error === "string") return error;
    var message = error.message || error.details || error.hint || error.code || JSON.stringify(error);
    var lower = String(message + " " + (error.code || "")).toLowerCase();
    if (lower.indexOf("row-level security") >= 0 || lower.indexOf("42501") >= 0) {
      return message + ". Aplique as migrations no Supabase para criar as policies de leitura e gravacao.";
    }
    if (lower.indexOf("wms_users_username_key") >= 0) {
      return message + ". Esta matricula/usuario ja existe. Use o botao Editar do cadastro existente ou informe outra matricula.";
    }
    if (lower.indexOf("wms_bindings_sku_location_idx") >= 0 || lower.indexOf("wms_bindings_warehouse_sku_location_idx") >= 0 || (lower.indexOf("duplicate key value") >= 0 && lower.indexOf("wms_bindings") >= 0)) {
      return message + ". O mesmo SKU ja existe nesse endereco dentro do estoque atual; o app atualiza esse vinculo usando estoque + sku + endereco como chave.";
    }
    return message;
  }

  function isMissingProductsTableError(error) {
    var message = formatSupabaseError(error).toLowerCase();
    return message.indexOf("wms_products") >= 0 && (
      message.indexOf("not found") >= 0 ||
      message.indexOf("schema cache") >= 0 ||
      message.indexOf("does not exist") >= 0 ||
      message.indexOf("pgrst") >= 0 ||
      message.indexOf("404") >= 0
    );
  }

  function isMissingTransferTableError(error) {
    var message = formatSupabaseError(error).toLowerCase();
    var mentionsTransferTable = (
      message.indexOf("wms_establishments") >= 0 ||
      message.indexOf("wms_transfers") >= 0 ||
      message.indexOf("wms_transfer_items") >= 0 ||
      message.indexOf("wms_transfer_divergences") >= 0 ||
      message.indexOf("wms_transfer_merge_items") >= 0 ||
      message.indexOf("wms_transfer_boxes") >= 0 ||
      message.indexOf("wms_transfer_packages") >= 0 ||
      message.indexOf("wms_product_packaging") >= 0 ||
      message.indexOf("wms_task_notifications") >= 0 ||
      message.indexOf("wms_notifications") >= 0 ||
      message.indexOf("wms_replenishment_requests") >= 0 ||
      message.indexOf("wms_stock_positions") >= 0 ||
      message.indexOf("wms_stock_import_batches") >= 0 ||
      message.indexOf("wms_stock_alerts") >= 0
    );
    if (!mentionsTransferTable) return false;
    if (message.indexOf("column") >= 0 && message.indexOf("schema cache") >= 0) return false;
    return message.indexOf("could not find the table") >= 0 ||
      message.indexOf("relation") >= 0 && message.indexOf("does not exist") >= 0 ||
      message.indexOf("table") >= 0 && message.indexOf("not found") >= 0 ||
      message.indexOf("pgrst205") >= 0 ||
      message.indexOf("404") >= 0;
  }

  function isMissingColumnError(error) {
    var message = formatSupabaseError(error).toLowerCase();
    return (
      message.indexOf("schema cache") >= 0 ||
      message.indexOf("could not find") >= 0 ||
      message.indexOf("column") >= 0
    ) && (
      message.indexOf("wms_transfers") >= 0 ||
      message.indexOf("wms_transfer_items") >= 0 ||
      message.indexOf("wms_transfer_divergences") >= 0 ||
      message.indexOf("wms_bindings") >= 0 ||
      message.indexOf("wms_history") >= 0 ||
      message.indexOf("wms_users") >= 0 ||
      message.indexOf("wms_sessions") >= 0 ||
      message.indexOf("wms_task_notifications") >= 0 ||
      message.indexOf("wms_notifications") >= 0 ||
      message.indexOf("wms_replenishment_requests") >= 0 ||
      message.indexOf("wms_stock_positions") >= 0 ||
      message.indexOf("wms_stock_import_batches") >= 0 ||
      message.indexOf("wms_stock_alerts") >= 0
    );
  }

  function isExpectedLegacySchemaCompatibilityError(error) {
    if (!isMissingColumnError(error)) return false;
    var column = getMissingColumnName(error).toLowerCase();
    return column === "import_source" || column === "codigo_loja";
  }

  function isMissingWarehouseColumnError(error) {
    var message = formatSupabaseError(error).toLowerCase();
    return isMissingColumnError(error) && (
      message.indexOf("warehouse_code") >= 0 ||
      message.indexOf("warehouse_id") >= 0
    );
  }

  function isHistorySchemaError(error) {
    var message = formatSupabaseError(error).toLowerCase();
    return (message.indexOf("wms_history") >= 0 || message.indexOf("tabela wms_history") >= 0) && (
      message.indexOf("datetime") >= 0 ||
      message.indexOf("warehouse_code") >= 0 ||
      message.indexOf("warehouse_id") >= 0 ||
      message.indexOf("estrutura multiestoque desatualizada") >= 0 ||
      message.indexOf("schema cache") >= 0 ||
      message.indexOf("does not exist") >= 0 ||
      message.indexOf("not found") >= 0 ||
      message.indexOf("pgrst") >= 0 ||
      message.indexOf("404") >= 0
    );
  }

  function rebuildProductsFromBindings() {
    state.bindings.forEach(function (binding) {
      if (!binding.sku || !binding.productName) return;
      state.products[binding.sku] = binding.productName;
      var normalized = normalizeSkuKey(binding.sku);
      if (normalized && normalized !== binding.sku) state.products[normalized] = binding.productName;
    });
  }

  async function clearRemoteTable(tableName, columnName) {
    if (!isSupabaseReady()) return;
    var response = await supabaseDb.from(tableName).delete().neq(columnName, "");
    if (response.error && tableName === "wms_products" && isMissingProductsTableError(response.error)) {
      productsTableAvailable = false;
      return;
    }
    if (response.error) throw response.error;
  }

  async function clearRemoteWarehouseRows(tableName, columnName) {
    if (!isSupabaseReady()) return;
    var response = await supabaseDb.from(tableName).delete().eq("warehouse_code", activeWarehouseCode());
    if (response.error && isMissingWarehouseColumnError(response.error)) {
      assertWarehouseFallbackAllowed(tableName, response.error);
      await clearRemoteTable(tableName, columnName);
      return;
    }
    if (response.error) throw response.error;
  }

  async function clearHistory() {
    if (!window.confirm("Limpar o historico do estoque " + activeWarehouseCode() + "?")) return;
    state.history = [];
    try {
      await clearRemoteWarehouseRows("wms_history", "id");
    } catch (error) {
      showToast("Nao foi possivel limpar o historico no Supabase.", "error");
    }
    renderHistory();
    showToast("Historico limpo.", "success");
  }

  async function restoreSamples() {
    if (!window.confirm("Restaurar dados de exemplo no estoque " + activeWarehouseCode() + "? Os dados atuais desse estoque serao substituidos.")) return;
    state.bindings = [];
    state.history = [];
    try {
      await clearRemoteWarehouseRows("wms_bindings", "id");
      await clearRemoteWarehouseRows("wms_history", "id");
    } catch (error) {
      showToast("Nao foi possivel limpar dados antigos no Supabase.", "error");
    }
    await seedIfEmpty();
    renderAll();
    showToast("Dados de exemplo restaurados.", "success");
  }

  async function clearAllData() {
    if (!window.confirm("Apagar vinculos e historico do estoque " + activeWarehouseCode() + "?")) return;
    state.bindings = [];
    state.history = [];
    try {
      await clearRemoteWarehouseRows("wms_bindings", "id");
      await clearRemoteWarehouseRows("wms_history", "id");
    } catch (error) {
      showToast("Nao foi possivel apagar tudo no Supabase.", "error");
    }
    renderAll();
    showToast("Dados do estoque " + activeWarehouseCode() + " apagados.", "success");
  }

  function createBinding(sku, parsed, areaCode, productName) {
    var area = getAreaByCode(areaCode);
    var finalProductName = productName || findProductName(sku) || "";
    return {
      id: randomId("id"),
      sku: String(sku),
      rua: parsed.rua,
      rack: parsed.rack,
      linha: parsed.linha,
      letra: parsed.letra,
      locationCode: parsed.code,
      areaCode: area.code,
      areaName: area.name,
      productName: finalProductName,
      warehouseId: activeWarehouseId(),
      warehouseCode: activeWarehouseCode(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function findBySku(sku) {
    var targets = skuCandidateKeys(sku);
    return activeWarehouseBindings().filter(function (binding) {
      return skuCandidateKeys(binding.sku).some(function (candidate) {
        return targets.indexOf(candidate) >= 0;
      });
    }).sort(sortByDateDesc);
  }

  function isSameSku(first, second) {
    var firstCandidates = skuCandidateKeys(first);
    var secondCandidates = skuCandidateKeys(second);
    return firstCandidates.some(function (candidate) {
      return secondCandidates.indexOf(candidate) >= 0;
    });
  }

  function findByLocation(locationCode) {
    return activeWarehouseBindings().filter(function (binding) { return binding.locationCode === locationCode; }).sort(sortByDateDesc);
  }

  function locationKeyFromCode(locationCode) {
    var parsed = normalizeLocation(locationCode);
    return parsed.valid ? parsed.code : normalizeText(locationCode).toUpperCase();
  }

  function locationKeyFromBinding(binding) {
    return locationKeyFromCode(binding.locationCode || ("R" + binding.rua + "-RK" + binding.rack + "-L" + binding.linha + "-" + binding.letra));
  }

  function locationExistsInMaster(locationCode) {
    var key = locationKeyFromCode(locationCode);
    if (activeWarehouseBindings().some(function (binding) { return locationKeyFromBinding(binding) === key; })) return true;
    return buildLinhaSeparacaoTemplateRows().some(function (row) { return locationKeyFromCode(row.locationCode) === key; });
  }

  function findProductName(sku) {
    var exact = state.products[sku];
    if (exact) return exact;
    if (BUILTIN_PRODUCTS[sku]) return BUILTIN_PRODUCTS[sku];
    var normalized = normalizeSkuKey(sku);
    return normalized ? state.products[normalized] || BUILTIN_PRODUCTS[normalized] || "" : "";
  }

  function normalizeSku(value) {
    if (value === null || value === undefined) return "";
    var sku = String(value).trim();
    var digits = sku.replace(/\D/g, "");
    var eanStart = digits.indexOf("789");
    if (eanStart >= 0 && digits.length >= eanStart + 13) {
      var ean = digits.slice(eanStart, eanStart + 13);
      return ean.slice(-6, -1);
    }
    return sku;
  }

  function splitSkuValues(value) {
    var raw = normalizeText(value);
    if (!raw) return [];
    var seen = {};
    var values = [];
    var parts = raw.split(/[;,\n\r\t|]+/);
    var normalizedWhole = normalizeSku(raw);
    if (normalizedWhole !== raw || parts.length === 1) {
      addSkuCandidate(values, seen, normalizedWhole);
    }
    parts.forEach(function (part) {
      addSkuCandidate(values, seen, normalizeSku(part));
    });
    return values;
  }

  function skuValueContains(value, sku) {
    var target = normalizeSkuKey(sku);
    if (!target) return false;
    return splitSkuValues(value).some(function (part) {
      return normalizeSkuKey(part) === target;
    });
  }

  function skuCandidateKeys(value) {
    return splitSkuValues(value).map(normalizeSkuKey).filter(Boolean);
  }

  function firstSkuValue(value) {
    var candidates = splitSkuValues(value);
    return candidates[0] || normalizeSku(value) || normalizeText(value);
  }

  function addSkuCandidate(values, seen, sku) {
    sku = normalizeText(sku);
    if (!sku || !isPlausibleSku(sku)) return;
    var key = normalizeSkuKey(sku);
    if (seen[key]) return;
    seen[key] = true;
    values.push(sku);
  }

  function isPlausibleSku(sku) {
    if (!/^\d+$/.test(sku)) return true;
    return sku.length >= 4;
  }

  function normalizeSkuKey(value) {
    var sku = normalizeSku(value);
    if (!/^\d+$/.test(sku)) return sku;
    return sku.replace(/^0+/, "") || "0";
  }

  function normalizeText(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
  }

  function normalizeHeader(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function getByAliases(row, aliases) {
    var keys = Object.keys(row);
    for (var i = 0; i < aliases.length; i += 1) {
      var wanted = normalizeHeader(aliases[i]);
      for (var j = 0; j < keys.length; j += 1) {
        if (normalizeHeader(keys[j]) === wanted) {
          return row[keys[j]];
        }
      }
    }
    return "";
  }

  function buildLocationFromParts(station, rack, line, column) {
    var rua = extractNumber(station);
    var rackNumber = extractNumber(rack);
    var lineNumber = extractNumber(line);
    var letter = cleanExcelLetters(column);
    if (!rua || !rackNumber || !lineNumber || !letter) return { valid: false };
    return normalizeLocation("R" + rua + "-RK" + rackNumber + "-L" + lineNumber + "-" + letter);
  }

  function cleanExcelLetters(value) {
    return String(value || "").trim().toUpperCase().replace(/[^A-Z@]/g, "");
  }

  function normalizeLocation(value) {
    var raw = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
    var match = raw.match(/^R(\d+)-RK(\d+)-L(\d+)-([A-Z@]+)$/);
    if (!match) return { valid: false };
    var rua = Number(match[1]);
    var rack = Number(match[2]);
    var linha = Number(match[3]);
    var letra = match[4];
    if (!rua || !rack || !linha || !vdMaisColumnLabelToNumber(letra)) return { valid: false };
    return {
      valid: true,
      rua: rua,
      rack: rack,
      linha: linha,
      letra: letra,
      code: "R" + pad2(rua) + "-RK" + pad2(rack) + "-L" + pad2(linha) + "-" + letra
    };
  }

  function excelLettersToNumber(value) {
    var letters = String(value || "").trim().toUpperCase();
    if (!/^[A-Z]+$/.test(letters)) return 0;
    var total = 0;
    for (var i = 0; i < letters.length; i += 1) {
      total = total * 26 + (letters.charCodeAt(i) - 64);
    }
    return total;
  }

  function vdMaisColumnLabelToNumber(value) {
    var label = String(value || "").trim().toUpperCase();
    if (/^[A-Z]$/.test(label)) return label.charCodeAt(0) - 64;
    if (!/^[A-Z][A-Z@]$/.test(label)) return 0;
    var group = label.charCodeAt(0) - 64;
    var suffix = label.charCodeAt(1) === 64 ? 0 : label.charCodeAt(1) - 64;
    return 26 + ((group - 1) * 26) + suffix;
  }

  function numberToVdMaisColumnLabel(number) {
    var n = Number(number);
    if (!n || n < 1) return "";
    if (n <= 26) return String.fromCharCode(64 + n);
    var shifted = n - 26;
    var group = Math.floor(shifted / 26) + 1;
    var suffix = shifted % 26;
    return String.fromCharCode(64 + group) + String.fromCharCode(64 + suffix);
  }

  function numberToExcelLetters(number) {
    var n = Number(number);
    var letters = "";
    while (n > 0) {
      var rem = (n - 1) % 26;
      letters = String.fromCharCode(65 + rem) + letters;
      n = Math.floor((n - 1) / 26);
    }
    return letters;
  }

  function addHistory(action, sku, location, details) {
    state.history.push(createHistoryItem(action, sku, location, details));
    if (state.history.length > 1000) {
      state.history = state.history.slice(state.history.length - 1000);
    }
  }

  function createHistoryItem(action, sku, location, details) {
    return {
      id: randomId("hist"),
      datetime: new Date().toISOString(),
      action: action,
      sku: sku || "",
      location: location || "",
      details: details || "",
      warehouseId: activeWarehouseId(),
      warehouseCode: activeWarehouseCode()
    };
  }

  async function recordAuthHistory(action, sku, location, details) {
    if (!isSupabaseReady()) return;
    try {
      var item = createHistoryItem(action, sku, location, details);
      var response = await supabaseDb.from("wms_history").upsert(toDbHistory(item), { onConflict: "id" });
      if (response.error && !isHistorySchemaError(response.error)) console.warn("Historico de usuarios nao salvo:", response.error);
    } catch (error) {
      console.warn("Historico de usuarios nao salvo:", error);
    }
  }

  function getAreaByCode(code) {
    return AREAS.find(function (area) { return area.code === Number(code); });
  }

  function setStatus(id, message, type) {
    var el = $(id);
    if (!el) return;
    el.textContent = message;
    el.className = "inline-status" + (type ? " " + type : "");
  }

  function setTextIfExists(id, value) {
    var el = $(id);
    if (el) el.textContent = String(value);
  }

  function showToast(message, type) {
    var toast = $("toast");
    toast.textContent = message;
    toast.className = "toast show" + (type ? " " + type : "");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(function () {
      toast.className = "toast";
    }, 3200);
  }

  function unique(list) {
    return Array.from(new Set(list));
  }

  function sortByDateDesc(a, b) {
    return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
  }

  function latestDate(list) {
    var latest = list.slice().sort(sortByDateDesc)[0] || {};
    return latest.updatedAt || latest.createdAt || "";
  }

  function positiveInt(value) {
    var number = Number(String(value || "").trim());
    return Number.isInteger(number) && number > 0 ? number : 0;
  }

  function parseQuantity(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    var text = normalizeText(value).replace(/\./g, "").replace(",", ".");
    var number = Number(text);
    return Number.isFinite(number) ? number : 0;
  }

  function parseXmlQuantity(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    var text = normalizeText(value);
    if (text.indexOf(".") >= 0 && text.indexOf(",") >= 0) text = text.replace(/\./g, "").replace(",", ".");
    else text = text.replace(",", ".");
    var number = Number(text);
    return Number.isFinite(number) ? number : 0;
  }

  function extractNumber(value) {
    var match = String(value || "").match(/\d+/);
    return match ? Number(match[0]) : 0;
  }

  function pad2(value) {
    return String(Number(value)).padStart(2, "0");
  }

  function formatDateTime(value) {
    if (!value) return "-";
    return new Date(value).toLocaleString("pt-BR");
  }

  function dateForFileName(date) {
    return [pad2(date.getDate()), pad2(date.getMonth() + 1), date.getFullYear()].join("-");
  }

})();
