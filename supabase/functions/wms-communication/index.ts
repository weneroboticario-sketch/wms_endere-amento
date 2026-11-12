import {createClient} from 'npm:@supabase/supabase-js@2.110.7';
import webpush from 'npm:web-push@3.6.7';
import {createCommunicationHandler} from './handler.ts';
import {createPushConfigurationLoader} from './server-config.ts';
const configuration=createPushConfigurationLoader({createClient,env:(key:string)=>Deno.env.get(key)});
Deno.serve(async(request:Request)=>{
 const env=await configuration();
 return createCommunicationHandler({createClient,env,sendPush:(subscription:unknown,payload:string)=>webpush.sendNotification(subscription,payload,{
  TTL:3600,timeout:5000,vapidDetails:{subject:env('WMS_CHAT_VAPID_SUBJECT'),publicKey:env('WMS_CHAT_VAPID_PUBLIC_KEY'),privateKey:env('WMS_CHAT_VAPID_PRIVATE_KEY')}
 })})(request);
});
