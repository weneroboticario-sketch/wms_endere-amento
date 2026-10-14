import test from "node:test";
import assert from "node:assert/strict";
import { access,readFile } from "node:fs/promises";
import { createWmsSupabaseClient } from "../src/supabase-client.js";

test("demo navigation, banner and executable modules are retired",async()=>{
  const html=await readFile(new URL("../index.html",import.meta.url),"utf8");
  const script=await readFile(new URL("../script.js",import.meta.url),"utf8");
  assert.doesNotMatch(html,/data-screen="demoMode"|id="demoMode"|MODO DEMONSTRA|DADOS FICT/);
  assert.doesNotMatch(script,/cpDemoController|openDemoModeScreen|demo-mode-active|demo-mode\.js/);
  assert.match(script,/if \(screenId === "demoMode"\) return false;/);
  assert.match(script,/return \["assistente", "conferencias", "historico", "consultaPrateleira", "demoMode"\]/);
  for(const file of ["demo-mode.js","demo-mode.css","demo-scenario.js","demo-request-guard.js"]){
    await assert.rejects(access(new URL("../src/"+file,import.meta.url)),{code:"ENOENT"});
  }
});

test("operational Supabase client preserves authentication and forwards ordinary requests",async()=>{
  const original=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,options)=>{
    calls.push({url:String(url),options});
    return new globalThis.Response('[{"id":"fixture"}]',{status:200,headers:{"Content-Type":"application/json"}});
  };
  const client=createWmsSupabaseClient("https://example.supabase.co","test-public-key");
  try {
    const read=await client.from("wms_transfers").select("id").eq("warehouse_code","14177");
    const write=await client.from("wms_transfers").update({observacao:"Fixture"}).eq("id","fixture").select("id");
    assert.equal(read.error,null);assert.equal(write.error,null);
    assert.equal(calls.length,2);assert.equal(calls[0].options.method,"GET");assert.equal(calls[1].options.method,"PATCH");
    assert.equal(JSON.parse(calls[1].options.body).observacao,"Fixture");
    const source=await readFile(new URL("../src/supabase-client.js",import.meta.url),"utf8");
    for(const setting of ["persistSession: true","autoRefreshToken: true","detectSessionInUrl: true",'storageKey: "wms-supabase-auth"'])assert.ok(source.includes(setting));
    assert.doesNotMatch(source,/Demo|DEMO|demo/);
  }finally{await client.auth.stopAutoRefresh();globalThis.fetch=original;}
});
