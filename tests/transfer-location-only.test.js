import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../script.js", import.meta.url), "utf8");
const label = source.slice(source.indexOf("  function transferLocationLabel("), source.indexOf("  function transferOriginSuggestionLabel("));
const cell = source.slice(source.indexOf("  function transferLocationSummaryCell("), source.indexOf("  function compactDateTimeForCode("));
function render(status) {
  return vm.runInNewContext(label + cell + ";({label: transferLocationLabel({}), cell: transferLocationSummaryCell({})});", {
    transferLocationStatus: () => status,
    escapeHtml: value => String(value).replace(/</g, "&lt;").replace(/>/g, "&gt;")
  });
}
test("transfer location contains only the complete address, without stock or repeated parts", () => {
  const result = render({ hasLocation: true, code: "R01-RK10-L01-C", rua: "R01", rack: "RK10", linha: "L01", letra: "C" });
  assert.equal(result.label, "R01-RK10-L01-C");
  assert.equal(result.cell.match(/R01-RK10-L01-C/g).length, 1);
  assert.ok(!/Saldo|Retirar|Pegar|Rua:|Rack:|Localizado/.test(result.cell));
});
test("missing location keeps one warning and no stock information", () => {
  const result = render({ hasLocation: false, warning: "Sem localização cadastrada." });
  assert.equal(result.label, "Sem localização cadastrada.");
  assert.equal(result.cell.match(/Sem localização cadastrada/g).length, 1);
  assert.ok(!/Saldo|Retirar|Pegar/.test(result.cell));
});
test("custom location warning remains escaped", () => {
  const result = render({ hasLocation: false, warning: "Endereço inválido <teste>" });
  assert.ok(result.cell.includes("&lt;teste&gt;"));
});
