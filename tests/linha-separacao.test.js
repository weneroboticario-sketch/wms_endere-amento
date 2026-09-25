import test from "node:test";
import assert from "node:assert/strict";

import {
  formatLinhaSeparacaoStationName,
  shouldUseVdcgLinhaSeparacaoTemplate
} from "../src/linha-separacao.js";

test("only VDCG uses the fixed address template", () => {
  assert.equal(shouldUseVdcgLinhaSeparacaoTemplate("VDCG"), true);
  assert.equal(shouldUseVdcgLinhaSeparacaoTemplate("VDAR"), false);
  assert.equal(shouldUseVdcgLinhaSeparacaoTemplate("VDSI"), false);
  assert.equal(shouldUseVdcgLinhaSeparacaoTemplate("VDCO"), false);
});

test("VDCO station name matches the external warehouse registration", () => {
  assert.equal(formatLinhaSeparacaoStationName("VDCO", 1), "RUA 1");
  assert.equal(formatLinhaSeparacaoStationName("VDCG", 1), "Rua 01");
  assert.equal(formatLinhaSeparacaoStationName("VDAR", 1), "Rua 01");
  assert.equal(formatLinhaSeparacaoStationName("VDSI", 1), "Rua 01");
});
