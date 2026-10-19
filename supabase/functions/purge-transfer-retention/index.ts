import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.7";
import { purgeExpiredTransfers } from "./worker.js";

// Custom worker-token authentication replaces public JWT authentication for cron.
Deno.serve(async (request:Request)=>{
  if(request.method!=="POST")return new Response("Method not allowed",{status:405});
  const token=request.headers.get("x-retention-token")||"";
  if(token.length<64||token.length>200)return new Response("Unauthorized",{status:401});
  try{
    const client=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
    const authorized=await client.rpc("wms_transfer_retention_authorize",{p_token:token});
    if(authorized.error||authorized.data!==true)return new Response("Unauthorized",{status:401});
    const result=await purgeExpiredTransfers(client);
    return Response.json(result,{status:result.failed?500:200});
  }catch{return Response.json({error:"Retention worker failed; data retained for retry"},{status:500});}
});
