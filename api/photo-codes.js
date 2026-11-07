import { Buffer } from 'node:buffer';
import { createClient } from '@supabase/supabase-js';
import { PHOTO_LIMITS, normalizeVisionResult, VISION_INSTRUCTIONS, VISION_SCHEMA } from '../src/photo-codes-domain.js';

export const config = { maxDuration: 60 };
const project='https://bzqulgdtfpcmkyaldssy.supabase.co';
export function validImage(data) {
  if(typeof data!=='string'||data.length>PHOTO_LIMITS.encodedBytes) return false;
  const m=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if(!m)return false;
  const b=Buffer.from(m[2],'base64');
  return m[1]==='jpeg'?b[0]===255&&b[1]===216&&b[2]===255:m[1]==='png'?b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP';
}
export function createPhotoHandler({ env=process.env, request=fetch, makeClient=createClient }={}) {
  return async function handler(req,res) {
    res.setHeader('Cache-Control','no-store');
    const send=(code,error)=>res.status(code).json({error});
    if(!['POST','GET'].includes(req.method))return send(405,'Método não permitido.');
    try {
      if(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_URL!==project)return send(503,'Ferramenta disponível somente no WMS Endereçamento.');
      const token=/^Bearer ([A-Za-z0-9._-]+)$/.exec(req.headers.authorization||'')?.[1];
      if(!token)return send(401,'Entre no WMS para usar a leitura.');
      const key=env.SUPABASE_ANON_KEY||env.VITE_SUPABASE_ANON_KEY;
      if(!key)return send(503,'Configuração de autenticação indisponível.');
      const client=makeClient(project,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
      const auth=await client.auth.getUser(token);
      if(auth.error||!auth.data?.user)return send(401,'Sessão inválida. Entre novamente.');
      const profile=await client.from('wms_users').select('id,role,active,archived').eq('auth_user_id',auth.data.user.id).maybeSingle();
      if(profile.error||!profile.data?.active||profile.data.archived||!['ADMINISTRADOR','SUPERVISOR','OPERADOR','ATENDENTE','CAIXA'].includes(profile.data.role))return send(403,'Perfil sem acesso à leitura.');
      const configured=Boolean(env.OPENAI_API_KEY&&env.OPENAI_VISION_MODEL&&env.UPSTASH_REDIS_REST_URL&&env.UPSTASH_REDIS_REST_TOKEN);
      if(req.method==='GET')return res.status(200).json({configured});
      if(!configured)return send(503,'Serviço de leitura por foto ainda não configurado. Você pode adicionar códigos manualmente.');
      const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
      if(!validImage(body?.image))return send(400,'Envie uma imagem JPG, PNG ou WEBP válida de até 2 MB após otimização.');
      // Distributed quota, atomic and expiring; only opaque user id and counter are retained.
      const redisUrl=new URL(env.UPSTASH_REDIS_REST_URL);
      if(redisUrl.protocol!=='https:')return send(503,'Limite de leitura não configurado.');
      const quota=await request(redisUrl,{method:'POST',headers:{Authorization:`Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(['EVAL',"local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],3600) end; return n",'1',`wms:photo:${auth.data.user.id}`]),signal:globalThis.AbortSignal.timeout(8000)});
      const count=await quota.json();
      if(!quota.ok||!Number.isInteger(count.result))return send(503,'Não foi possível verificar o limite. Tente depois.');
      if(count.result>20)return send(429,'Limite de 20 fotos por hora atingido. Tente mais tarde.');
      const response=await request('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:env.OPENAI_VISION_MODEL,store:false,instructions:VISION_INSTRUCTIONS,input:[{role:'user',content:[{type:'input_text',text:'Extraia os códigos desta página sem usar catálogos anteriores.'},{type:'input_image',image_url:body.image,detail:'high'}]}],text:{format:{type:'json_schema',name:'catalog_codes',strict:true,schema:VISION_SCHEMA}},max_output_tokens:12000}),signal:globalThis.AbortSignal.timeout(45000)});
      if(!response.ok)return send(response.status===429?429:502,'O serviço de visão não conseguiu concluir a leitura. Tente mais tarde.');
      const result=await response.json();
      if(result.status!=='completed')return send(502,'Leitura incompleta. Tente uma foto mais próxima, com menos produtos.');
      const output=result.output?.flatMap(o=>o.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('');
      return res.status(200).json(normalizeVisionResult(JSON.parse(output)));
    } catch {return send(502,'Não foi possível concluir a leitura. Nenhum resultado foi inventado.');}
  };
}
export default createPhotoHandler();
