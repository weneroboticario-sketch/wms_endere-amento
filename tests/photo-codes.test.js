import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVisionResult, validationState, selectedExportRows, photoCsv, removePhotoDuplicates, VISION_INSTRUCTIONS, editPhotoField } from '../src/photo-codes-domain.js';
import { createPhotoHandler, validImage } from '../api/photo-codes.js';
const item=(overrides={})=>({code:'01314',description:'Produto',variant:'Cor',kind:'PRODUTO',review:false,reason:'',bbox:[0.1,0.2,0.3,0.1],...overrides});
const result=(items)=>({page:'23',warning:'',items});
test('photo reading preserves exact codes, occurrence order, types and empty quantities across changing editions',()=>{
  const a=normalizeVisionResult(result([item({code:'01314'}),item({code:'99999',kind:'KIT_COMBO'}),item({code:'01111',kind:'REFIL'}),item({code:'01314'})]));
  assert.deepEqual(a.items.map(r=>r.code),['01314','99999','01111','01314']);assert.ok(a.items.every(r=>r.quantity===''));
  assert.equal(normalizeVisionResult(result([item({code:'54321'})])).items[0].code,'54321');
  assert.match(VISION_INSTRUCTIONS,/posições fixas/);assert.match(VISION_INSTRUCTIONS,/preços/);assert.match(VISION_INSTRUCTIONS,/Não extraia quantidades/);
});
test('uncertain or unreadable codes stay reviewable and are never replaced by catalog values',()=>{
  const row=normalizeVisionResult(result([item({code:'01?14',review:true})])).items[0];assert.equal(row.code,'01?14');assert.equal(validationState(row,true),'REVISAR');
  assert.equal(validationState(item(),false),'NAO_ENCONTRADO');assert.equal(validationState(item(),true),'VALIDADO');
  assert.equal(normalizeVisionResult(result([])).items.length,0);
  assert.equal(normalizeVisionResult(result([item({kind:'INDEFINIDO'})])).items[0].review,true);
});
test('invalid vision output and out-of-image regions are rejected rather than silently repaired',()=>{
  for(const bad of [null,{items:[]},result([item({code:1314})]),result([item({bbox:[0.9,0.2,0.5,0.1]})]),result([item({kind:'PRICE'})])])assert.throws(()=>normalizeVisionResult(bad));
});
test('exports preserve zeroes, require reviewed digit codes and never interpret user text as formulas',()=>{
  const rows=[{...item(),selected:true,status:'VALIDADO',quantity:''}];
  assert.equal(selectedExportRows(rows)[0].code,'01314');assert.match(photoCsv(rows),/"=""01314""";/);
  assert.throws(()=>photoCsv([{...rows[0],code:'=HYPERLINK(1)'}]));assert.throws(()=>photoCsv([{...rows[0],status:'REVISAR'}]));assert.throws(()=>photoCsv([{...rows[0],quantity:-1}]));
  assert.equal(selectedExportRows([{...rows[0],quantity:'2'}])[0].quantity,2);
});
test('explicit deduplication keeps first quantity and distinct product/refill/combo and zeroes',()=>{
  const rows=[item({quantity:'2'}),item({quantity:'3'}),item({kind:'KIT_COMBO'}),item({kind:'REFIL'}),item({code:'1314'})];const kept=removePhotoDuplicates(rows);assert.equal(kept.length,4);assert.equal(kept[0].quantity,'2');
});
test('manual edits preserve leading zeroes and invalidate only the relevant catalog validation',()=>{
  const row={...item(),status:'VALIDADO',catalogDescription:'Cadastro'};editPhotoField(row,'quantity','2');assert.equal(row.status,'VALIDADO');assert.equal(row.quantity,'2');
  editPhotoField(row,'code','00123');assert.equal(row.code,'00123');assert.equal(row.status,'REVISAR');assert.equal(row.catalogDescription,'');assert.equal(row.review,true);
  editPhotoField(row,'kind','REFIL');assert.equal(row.kind,'REFIL');editPhotoField(row,'__proto__','bad');assert.equal(Object.getPrototypeOf(row),Object.prototype);
});
const image='data:image/jpeg;base64,/9j/AA==';
const env={SUPABASE_ANON_KEY:'public',OPENAI_API_KEY:'server-secret',OPENAI_VISION_MODEL:'configured-vision-model',UPSTASH_REDIS_REST_URL:'https://redis.example',UPSTASH_REDIS_REST_TOKEN:'redis-secret'};
const makeClient=(role='OPERADOR',active=true)=>()=>({auth:{getUser:async()=>({data:{user:{id:'user-1'}}})},from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{id:'profile-1',active,role}})})});
async function invoke(handler,body={image},method='POST',token='token'){let status,data;const res={setHeader(){},status(n){status=n;return this;},json(v){data=v;return this;}};await handler({method,headers:{authorization:token?'Bearer '+token:''},body},res);return {status,data};}
test('photo API checks auth, active profile, role and configuration before any paid request',async()=>{
  const request=()=>{throw Error('must not call provider');};
  assert.equal((await invoke(createPhotoHandler({env,makeClient:makeClient(),request}),{},'POST','')).status,401);
  assert.equal((await invoke(createPhotoHandler({env,makeClient:makeClient('OPERADOR',false),request}))).status,403);
  assert.equal((await invoke(createPhotoHandler({env,makeClient:makeClient('OUTRO'),request}))).status,403);
  assert.equal((await invoke(createPhotoHandler({env:{SUPABASE_ANON_KEY:'public'},makeClient:makeClient(),request}))).status,503);
  assert.equal((await invoke(createPhotoHandler({env:{SUPABASE_ANON_KEY:'public'},makeClient:makeClient(),request}),{},'GET')).data.configured,false);
});
test('server rejects forged formats, giant images and invalid methods',async()=>{
  assert.equal(validImage(image),true);assert.equal(validImage('data:image/png;base64,/9j/AA=='),false);assert.equal(validImage('https://evil.example/image.jpg'),false);
  const handler=createPhotoHandler({env,makeClient:makeClient(),request:()=>{throw Error('no request');}});
  assert.equal((await invoke(handler,{image:'bad'})).status,400);assert.equal((await invoke(handler,{},'DELETE')).status,405);
});
test('distributed limit fails closed and prevents calls above quota',async()=>{
  for(const response of [{ok:true,json:async()=>({result:21})},{ok:false,json:async()=>({error:'bad'})}]){let calls=0;const handler=createPhotoHandler({env,makeClient:makeClient(),request:async()=>{calls++;return response;}});const r=await invoke(handler);assert.ok([429,503].includes(r.status));assert.equal(calls,1);}
});
test('server sends only current image with structured output, never writes operations or exposes credentials',async()=>{
  for(const role of ['ADMINISTRADOR','SUPERVISOR','OPERADOR','ATENDENTE','CAIXA']){
    let calls=0;const handler=createPhotoHandler({env,makeClient:makeClient(role),request:async(url,options)=>{
      calls++;if(calls===1)return {ok:true,json:async()=>({result:1})};assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.equal(body.input[0].content[1].image_url,image);assert.equal(body.input.length,1);
      return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(result([item()]))}]}]})};
    }});const r=await invoke(handler);assert.equal(r.status,200);assert.equal(r.data.items[0].code,'01314');assert.ok(!JSON.stringify(r.data).includes('server-secret'));assert.equal(calls,2);
  }
});
test('provider refusal, truncation and malformed output never create fabricated rows',async()=>{
  for(const value of [{status:'incomplete'}, {status:'completed',output:[{content:[{type:'refusal',refusal:'no'}]}]}, {status:'completed',output:[{content:[{type:'output_text',text:'bad json'}]}]}]){
    let n=0;const handler=createPhotoHandler({env,makeClient:makeClient(),request:async()=>++n===1?{ok:true,json:async()=>({result:1})}:{ok:true,json:async()=>value}});const r=await invoke(handler);assert.equal(r.status,502);assert.equal(r.data.items,undefined);
  }
});
