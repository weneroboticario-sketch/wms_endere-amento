import test from "node:test";
import assert from "node:assert/strict";

import {
  formatLinhaSeparacaoStationName,
  shouldUseVdcgLinhaSeparacaoTemplate
} from "../src/linha-separacao.js";

test("VDCO exports only its own occupied locations", () => {
  assert.equal(shouldUseVdcgLinhaSeparacaoTemplate("VDCO"), false);
  assert.equal(shouldUseVdcgLinhaSeparacaoTemplate("VDCG"), true);
});

test("VDCO station name matches the external warehouse registration", () => {
  assert.equal(formatLinhaSeparacaoStationName("VDCO", 1), "RUA 1");
  assert.equal(formatLinhaSeparacaoStationName("VDCG", 1), "Rua 01");
});
