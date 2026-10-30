import test from 'node:test';
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import handler from '../api/supabase-config.js';
const jwt=role=>'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.signature';
function call(method='GET'){const response={setHeader(){},status(code){response.code=code;return response;},json(body){response.body=body;},end(){}};handler({method},response);return response;}
test('configuration route publishes only anon/publishable keys and never administrative credentials or fragments',()=>{
  const original={...process.env};
  try {
    for(const key of ['SUPABASE_URL','VITE_SUPABASE_URL','vite_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_URL','PUBLIC_SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_KEY','VITE_SUPABASE_ANON_KEY','VITE_SUPABASE_ANOM_KEY','NEXT_PUBLIC_SUPABASE_ANON_KEY','PUBLIC_SUPABASE_ANON_KEY'])delete process.env[key];
    process.env.SUPABASE_URL='https://bzqulgdtfpcmkyaldssy.supabase.co';
    for(const unsafe of [jwt('service_role'),'sb_secret_'+'secret'.repeat(8),jwt('authenticated'),'not-a-key']){
      process.env.SUPABASE_KEY=unsafe;const response=call();assert.equal(response.body.configured,false);assert.equal(response.body.key,'');assert.equal(response.body.diagnostics.keyPreview,'');assert.ok(!JSON.stringify(response.body).includes(unsafe));
    }
    for(const safe of [jwt('anon'),'sb_publishable_'+'a'.repeat(30)]){process.env.SUPABASE_KEY=safe;assert.equal(call().body.configured,true);assert.equal(call().body.key,safe);}
    assert.equal(call('POST').code,405);assert.equal(call('OPTIONS').code,204);
  }finally{for(const key of Object.keys(process.env))if(!(key in original))delete process.env[key];Object.assign(process.env,original);}
});
