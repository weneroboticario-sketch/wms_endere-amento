import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');

async function activate(shellReady) {
  const listeners = {}, deleted = [];
  let claimed = 0, navigated = 0;
  const caches = {
    open: async()=>({match:async()=>shellReady ? {ok:true} : undefined}),
    keys: async()=>['wms-static-v59','wms-static-v60','wms-runtime-v23','wms-runtime-v24','unrelated-cache'],
    delete: async key=>{deleted.push(key);return true;}
  };
  const self = {
    addEventListener:(event,fn)=>{listeners[event]=fn;},
    skipWaiting(){},
    clients:{claim:async()=>{claimed++;},matchAll:async()=>[{navigate:async()=>{navigated++;}}]},
    location:{origin:'https://wms-endere-amento.vercel.app'}
  };
  runInNewContext(source,{self,caches,URL,fetch:async()=>({ok:true})});
  let operation;
  listeners.activate({waitUntil(value){operation=value;}});
  await operation;
  return {deleted,claimed,navigated};
}
test('service worker activation never force-reloads operational forms',async()=>{
  const result=await activate(true);
  assert.equal(result.claimed,1);
  assert.equal(result.navigated,0);
  assert.deepEqual(result.deleted,['wms-static-v59','wms-runtime-v23']);
});
test('failed precache does not delete the last usable offline shell',async()=>{
  const result=await activate(false);
  assert.equal(result.claimed,1);
  assert.equal(result.navigated,0);
  assert.deepEqual(result.deleted,['wms-runtime-v23']);
});
test('navigation errors fall back to cached shell without caching a failure',()=>{
  const navigation=source.slice(source.indexOf('if (request.mode === "navigate")'),source.indexOf('if (url.origin === self.location.origin)'));
  assert.match(navigation,/!response\.ok/);
  assert.match(navigation,/caches\.match\("\/"\)/);
});
test('Git integration does not automatically publish each individual commit',async()=>{
  const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.equal(config.git.deploymentEnabled,false);
});
