import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('montagem destaca uma operação incerta e exige retry idempotente antes de novo lançamento',async()=>{
 const [view,gateway]=await Promise.all([
  readFile(new URL('../src/transfer-packing-view.js',import.meta.url),'utf8'),
  readFile(new URL('../src/transfer-packing-api.js',import.meta.url),'utf8')
 ]);
 assert.match(view,/packingPendingWarning/);
 assert.match(view,/pendingOperation=pendingSafe\(\)/);
 assert.match(view,/Tentar novamente a operação/);
 assert.match(view,/Confira o saldo atualizado antes do próximo lançamento/);
 assert.match(view,/pendingWarning\.hidden=!montage\|\|!pendingOperation/);
 assert.match(gateway,/if\(pending\(\)\)throw new Error/);
 assert.match(gateway,/retry\(\)\{const request=pending\(\)/);
 assert.match(gateway,/p_action_id:uuid\(\)/);
});
