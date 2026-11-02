import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const code = readFileSync(new URL("../script.js", import.meta.url), "utf8");

test("CP ÁLAMO: a mesma chave é conservada após erro/timeout", () => {
  assert.match(code, /button\.dataset\.idempotencyFingerprint === fingerprint/);
  assert.match(code, /if \(!IS_CP_ALAMO \|\| createdAndRefreshed\) \{/);
  assert.match(code, /button\.dataset\.idempotencyKey = idempotencyKey/);
});
test("CP ÁLAMO: alterações no pedido geram outra identidade lógica", () => {
  assert.match(code, /var fingerprint = IS_CP_ALAMO \? JSON\.stringify\(\[/);
  assert.match(code, /normalizeSku\(\$\("replenishmentSkuInput"\)\.value\)/);
});
test("CP ÁLAMO: pedido com NF pendente não apresenta confirmação falsa", () => {
  assert.match(code, /return \{ pendingFiscal: true, request: request \}/);
  assert.match(code, /pendingFiscal = Boolean\(result && result\.pendingFiscal\)/);
  assert.match(code, /if \(!pendingFiscal\) showToast\("Pedido atualizado\.", "success"\)/);
});
