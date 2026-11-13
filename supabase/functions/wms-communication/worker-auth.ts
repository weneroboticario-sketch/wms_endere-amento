export async function verifyWorkerRequest(request:Request,secret:string,{now=Date.now()}:{now?:number}={}){
 if(secret.length<32)return false;
 const stamp=request.headers.get('x-wms-worker-time')||'',nonce=request.headers.get('x-wms-worker-nonce')||'',signature=request.headers.get('x-wms-worker-signature')||'';
 if(stamp||nonce||signature){
  if(!/^\d{10}$/.test(stamp)||Math.abs(now/1000-Number(stamp))>90||!/^[a-f0-9-]{36}$/i.test(nonce)||!/^[a-f0-9]{64}$/.test(signature))return false;
  try{
   const encoder=new TextEncoder(),key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
   const bytes=Uint8Array.from(signature.match(/../g)!,value=>parseInt(value,16));
   return await crypto.subtle.verify('HMAC',key,bytes,encoder.encode('wms-chat-drain:'+stamp+':'+nonce));
  }catch{return false;}
 }
 return false;
}
