import {createClient} from 'npm:@supabase/supabase-js@2.110.7';
import webpush from 'npm:web-push@3.6.7';
import {createCommunicationHandler} from './handler.ts';
const env=(key:string)=>Deno.env.get(key);
if(env('WMS_CHAT_VAPID_PUBLIC_KEY')&&env('WMS_CHAT_VAPID_PRIVATE_KEY')&&env('WMS_CHAT_VAPID_SUBJECT')){
 webpush.setVapidDetails(env('WMS_CHAT_VAPID_SUBJECT')!,env('WMS_CHAT_VAPID_PUBLIC_KEY')!,env('WMS_CHAT_VAPID_PRIVATE_KEY')!);
}
Deno.serve(createCommunicationHandler({createClient,env,sendPush:(subscription:unknown,payload:string)=>webpush.sendNotification(subscription,payload,{TTL:3600,timeout:5000})}));
