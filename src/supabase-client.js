import { createClient } from "@supabase/supabase-js";
import { createDemoRequestGuard } from "./demo-request-guard.js";

export function createWmsSupabaseClient(url, key, isDemoActive = ()=>false) {
  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "wms-supabase-auth"
    },
    global: {
      fetch: createDemoRequestGuard((...args)=>globalThis.fetch(...args),isDemoActive),
      headers: { "x-client-info": "wms-enderecamento/1.1" }
    }
  });
}
