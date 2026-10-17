import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const contract = JSON.parse(await read("tests/fixtures/visual-contract.json"));

test("visual refresh preserves every DOM id and behavior data attribute", async () => {
  const html = await read("index.html");
  assert.deepEqual([...html.matchAll(/\bid="([^"]+)"/g)].map(x => x[1]).sort(), [...contract.ids,"lossesDre","lossesDreContent"].sort());
  assert.deepEqual([...html.matchAll(/\b(data-[a-z-]+)="([^"]*)"/g)].map(x => x[1] + "=" + x[2]).sort(), [...contract.dataAttributes,"data-icon=DRE","data-screen=lossesDre"].sort());
});

test("application JavaScript matches approved application behavior baseline", async () => {
  const source = (await read("script.js")).replace(/\r\n/g, "\n")
    .replaceAll('"WMS Álamo - Visão Geral"', '"Visao Geral - Alamo"')
    .replaceAll('"WMS Álamo"', '"Gestão Operacional"')
    .replaceAll('"Operação CP Álamo"', '"CP Álamo"')
    .replaceAll('strong class=\\"operational-code\\"', "strong")
    .replaceAll('span class=\\"operational-description\\"', "span")
    .replaceAll('sku-location-code location-code', "sku-location-code")
    .replace(/^.*SCREEN_PERMISSIONS\.lossesDre = .*\n/m, "")
    .replace(/^.*\} else if \(screenId === "lossesDre"\) \{\n.*\n/m, "")
    .replaceAll(', "lossesDre"', "")
    .replace(/^.*if \(screenId === "lossesDre"\) return "Perdas e DRE";\n/m, "");
  assert.equal(createHash("sha256").update(source).digest("hex"), contract.scriptSha256);
});

test("shared typography has required tokens and no viewport-scaled screen fonts", async () => {
  const css = await read("style.css");
  for (const token of ["xs","sm","md","lg","xl","2xl","3xl"]) assert.match(css, new RegExp("--text-" + token + ":"));
  for (const path of ["style.css","src/global-dashboard.css","src/purchase-transfer-builder.css"]) {
    const text = await read(path);
    assert.doesNotMatch(text, /font-size:\s*clamp\(|font-size:\s*[\d.]+(?:vw|vh)/);
    assert.doesNotMatch(text, /\bzoom\s*:/);
    assert.doesNotMatch(text, /font-size:\s*0\.(?:6\d*|7\d*)rem/);
  }
});

test("secondary text and primary alert colors meet normal-text contrast", async () => {
  const css = await read("style.css");
  const luminance = hex => {
    const c = hex.match(/[a-f\d]{2}/gi).map(v => parseInt(v,16)/255)
      .map(v => v <= 0.04045 ? v/12.92 : ((v+0.055)/1.055)**2.4);
    return c[0]*0.2126+c[1]*0.7152+c[2]*0.0722;
  };
  for (const [token,bg] of [["muted","ffffff"],["success","e4f7ef"],["danger","fdeaea"],["warning","fff3d6"],["primary-dark","ffffff"]]) {
    const color = css.match(new RegExp("--"+token+":\\s*#([a-f\\d]{6})", "i"))[1];
    const [a,b] = [luminance(color),luminance(bg)].sort((x,y)=>y-x);
    assert.ok((a+0.05)/(b+0.05) >= 4.5, token);
  }
});
