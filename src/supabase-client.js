import { createClient } from "@supabase/supabase-js";

export function createWmsSupabaseClient(url, key) {
  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "wms-supabase-auth"
    },
    global: {
      headers: { "x-client-info": "wms-enderecamento/1.1" }
    }
  });
}
