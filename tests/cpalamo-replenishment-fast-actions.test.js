import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const script=readFileSync(new URL("../script.js",import.meta.url),"utf8");
const dialog=readFileSync(new URL("../src/cpalamo-appearance.js",import.meta.url),"utf8");

test("CP ÁLAMO: ação da reposição corresponde ao status de trabalho iniciado",()=>{
  assert.match(script,/IS_CP_ALAMO \? "Assumir e iniciar" : "Puxar pedido"/);
  assert.match(script,/status: "EM_SEPARACAO"/);
});
test("CP ÁLAMO: atendimento rápido usa uma única janela para quantidade e observação",()=>{
  assert.match(script,/requestVisualFields\("Atender reposição", \[/);
  assert.match(script,/answered\.qty/);
  assert.match(script,/answered\.note/);
});
test("CP ÁLAMO: observação do atendimento é opcional",()=>{
  assert.match(dialog,/field\.required===false/);
  assert.match(script,/name: "note", label: "Observação \(opcional\)", required: false/);
});
