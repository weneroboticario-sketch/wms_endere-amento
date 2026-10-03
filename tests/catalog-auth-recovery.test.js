import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { refreshCurrentAuthSession } from "../src/auth.js";

const script = await readFile(new URL("../script.js", import.meta.url), "utf8");

test("catalog permission failure refreshes auth once before retrying", () => {
  assert.match(script, /async function fetchProductCatalogWithAuthRecovery\(\)/);
  assert.match(script, /if \(!isSupabasePermissionError\(error\) \|\| !authState\.currentUser\) throw error;/);
  assert.match(script, /var refreshedSession = await refreshCurrentAuthSession\(supabaseDb\);/);
  assert.match(script, /authState\.currentSession = refreshedSession;\s*return readCatalog\(\);/);
});

test("successful catalog synchronization clears stale catalog errors", () => {
  assert.match(script, /clearPerformanceErrors\(\["catalogo-produtos", "catalogo-produtos-segundo-plano"\]\)/);
  assert.match(script, /Verifique a sessao autenticada e as policies\/grants do Supabase/);
});

test("refreshCurrentAuthSession returns the refreshed session", async () => {
  const session = { access_token: "new-token" };
  const client = {
    auth: {
      refreshSession: async () => ({ data: { session }, error: null })
    }
  };
  assert.equal(await refreshCurrentAuthSession(client), session);
});

test("refreshCurrentAuthSession propagates authentication errors", async () => {
  const client = {
    auth: {
      refreshSession: async () => ({ data: { session: null }, error: new Error("refresh failed") })
    }
  };
  await assert.rejects(refreshCurrentAuthSession(client), /refresh failed/);
});
