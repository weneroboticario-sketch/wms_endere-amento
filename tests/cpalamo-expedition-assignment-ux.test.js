import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const moduleSource = readFileSync(new URL("../src/expedition-workflow.js", import.meta.url), "utf8");
const proposedSql = readFileSync(new URL("../docs/CPALAMO_EXPEDITION_MESSAGE_PATCH.sql", import.meta.url), "utf8");

test("CP ÁLAMO: responsável não deve ser selecionado implicitamente", () => {
  assert.match(moduleSource, /<option value="">Selecione um responsável<\/option>/);
  assert.match(moduleSource, /if\(!data\.responsible_id\)return status\("Selecione um responsável antes de confirmar\.","error"\)/);
});
test("CP ÁLAMO: sucesso da atribuição depende do ID retornado pelo banco", () => {
  assert.match(moduleSource, /result\.data\?\.expedition_responsible_id/);
  assert.match(moduleSource, /servidor não confirmou o responsável escolhido/);
});
test("CP ÁLAMO: erros na expedição usam o estado visual de erro", () => {
  assert.match(moduleSource, /context\.diagnostic\("expedition-action",error\);status\(error\.message,"error"\)/);
});
test("CP ÁLAMO: justificativa deve integrar notificação de atribuição", () => {
  assert.match(proposedSql, /v_reason := nullif\(btrim\(coalesce\(new\.delivery_reason/);
  assert.match(proposedSql, /'reason', v_reason/);
  assert.match(proposedSql, /IF new\.expedition_stage = 'ATRIBUIDA'/);
});
