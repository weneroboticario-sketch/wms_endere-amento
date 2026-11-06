// CP ÁLAMO only. Additive safety net for stale JWT reads and large task-history selects.
// No changes to RLS, sessions of other applications or operational writes.
const STORAGE_KEY = "wms-supabase-auth";
const RECOVERY_KEY = "cpalamo-p0-expired-token-attempt";
const HISTORY_PATH = "/rest/v1/operacao_tarefas_historico";
const READ_PATHS = new Set([
  "/rest/v1/operacao_tarefas",
  "/rest/v1/wms_replenishment_requests",
  HISTORY_PATH
]);
const HISTORY_BATCH_SIZE = 35;
const HISTORY_LIMIT = 1000;

function requestUrl(input) {
  return typeof input === "string" || input instanceof URL ? String(input) : input?.url || "";
}
function requestMethod(input, init) {
  return String(init?.method || input?.method || "GET").toUpperCase();
}
function requestHeaders(input, init) {
  return new globalThis.Headers(init?.headers || input?.headers || {});
}
function tokenExpiry(bearer) {
  try {
    const token = String(bearer || "").match(/^Bearer\s+([^\s]+)$/i)?.[1];
    const payload = token?.split(".")[1];
    if (!payload || typeof globalThis.atob !== "function") return 0;
    const decoded = globalThis.atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = Number(JSON.parse(decoded).exp);
    return Number.isFinite(exp) ? exp : 0;
  } catch {
    return 0;
  }
}
function expiredBearer(bearer, nowSeconds) {
  const exp = tokenExpiry(bearer);
  return exp > 0 && exp <= nowSeconds;
}
function lastSessionToken(storage) {
  try {
    const session = JSON.parse(storage?.getItem(STORAGE_KEY) || "null");
    return typeof session?.access_token === "string" ? session.access_token : "";
  } catch {
    return "";
  }
}
function withNewBearer(input, init, token) {
  const headers = requestHeaders(input, init);
  headers.set("authorization", "Bearer " + token);
  return { ...init, headers };
}
function taskIds(value) {
  const match = String(value || "").match(/^in\.\((.*)\)$/);
  if (!match) return [];
  const ids = match[1].split(",").map(x => x.trim());
  if (!ids.length || !ids.every(x => /^[0-9a-fA-F-]{36}$/.test(x))) return [];
  return ids;
}
function isProtectedRead(input, init, path) {
  return requestMethod(input, init) === "GET" && READ_PATHS.has(path);
}

export function createCpOperationalFetchGuard(fetcher, options = {}) {
  const storage = options.storage;
  const attempts = options.attempts;
  const reload = options.reload || (() => {});
  const wait = options.wait || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const now = options.now || Date.now;
  let recovering = null;
  let reloading = false;

  async function recoverExpiredToken(input, init, response) {
    if (response.status !== 401) return response;
    const authorization = requestHeaders(input, init).get("authorization") || "";
    if (!expiredBearer(authorization, Math.floor(now() / 1000))) return response;

    if (!recovering) {
      recovering = (async () => {
        // Let the existing Supabase client complete its native token refresh.
        await wait(450);
        const latest = lastSessionToken(storage);
        if (latest && latest !== authorization.replace(/^Bearer\s+/i, "") && !expiredBearer("Bearer " + latest, Math.floor(now() / 1000))) {
          attempts?.removeItem(RECOVERY_KEY);
          return { token: latest };
        }
        if (!reloading) {
          reloading = true;
          const last = Number(attempts?.getItem(RECOVERY_KEY) || 0);
          const repeated = last > 0 && now() - last < 120000;
          attempts?.setItem(RECOVERY_KEY, String(now()));
          // If reloading once did not fix the expired session, require a fresh login.
          // Never clear other local storage keys or sessions.
          if (repeated) storage?.removeItem(STORAGE_KEY);
          reload();
        }
        return null;
      })().finally(() => { recovering = null; });
    }
    const refreshed = await recovering;
    if (!refreshed?.token) return response;
    // Exactly one idempotent retry, using the token already refreshed by Supabase.
    return fetcher(input, withNewBearer(input, init, refreshed.token));
  }

  async function fetchRead(input, init, path) {
    const response = await fetcher(input, init);
    return isProtectedRead(input, init, path) ? recoverExpiredToken(input, init, response) : response;
  }

  async function fetchBatchedHistory(input, init, url, ids) {
    const all = [];
    for (let start = 0; start < ids.length; start += HISTORY_BATCH_SIZE * 2) {
      const pages = [];
      for (let i = start; i < Math.min(start + HISTORY_BATCH_SIZE * 2, ids.length); i += HISTORY_BATCH_SIZE) {
        const part = new URL(url);
        part.searchParams.set("tarefa_id", "in.(" + ids.slice(i, i + HISTORY_BATCH_SIZE).join(",") + ")");
        pages.push(fetchRead(part.toString(), init, HISTORY_PATH));
      }
      const responses = await Promise.all(pages);
      for (const response of responses) {
        if (!response.ok) return response;
        let rows;
        try {
          rows = await response.json();
        } catch {
          return new globalThis.Response(JSON.stringify({ message: "Resposta inválida do histórico de tarefas." }), { status: 502, headers: { "content-type": "application/json" } });
        }
        if (!Array.isArray(rows)) return new globalThis.Response(JSON.stringify({ message: "Formato inesperado do histórico de tarefas." }), { status: 502, headers: { "content-type": "application/json" } });
        all.push(...rows);
      }
    }
    all.sort((a, b) => String(b.data_evento || "").localeCompare(String(a.data_evento || "")));
    return new globalThis.Response(JSON.stringify(all.slice(0, HISTORY_LIMIT)), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }

  return async function cpGuardedFetch(input, init) {
    const rawUrl = requestUrl(input);
    let url;
    try {
      url = new URL(rawUrl, "https://wms-cpalamo.vercel.app");
    } catch {
      return fetcher(input, init);
    }
    // Only CP ÁLAMO's known GET endpoints; no write or Auth call is rewritten.
    const read = isProtectedRead(input, init, url.pathname);
    if (read && url.pathname === HISTORY_PATH) {
      const ids = taskIds(url.searchParams.get("tarefa_id"));
      if (ids.length > HISTORY_BATCH_SIZE && !requestHeaders(input, init).has("range")) {
        return fetchBatchedHistory(input, init, url, ids);
      }
    }
    return fetchRead(input, init, read ? url.pathname : "");
  };
}

export function installCpOperationalFetchGuard(globalObject = globalThis) {
  if (!globalObject.window || globalObject.__cpalamoP0GuardInstalled) return false;
  globalObject.__cpalamoP0GuardInstalled = true;
  const underlying = globalObject.fetch.bind(globalObject);
  globalObject.fetch = createCpOperationalFetchGuard(underlying, {
    storage: globalObject.localStorage,
    attempts: globalObject.sessionStorage,
    reload: () => globalObject.location.reload()
  });
  return true;
}
installCpOperationalFetchGuard();
