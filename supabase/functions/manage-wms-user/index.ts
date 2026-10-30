import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import { createUserManagementHandler } from "./handler.ts";
Deno.serve(createUserManagementHandler({ createClient, env: name => Deno.env.get(name) }));
