import { readFile } from "node:fs/promises";
import vm from "node:vm";
import assert from "node:assert/strict";

const { chromium } = await import(process.argv[2] || "playwright");
const source = await readFile(new URL("../script.js", import.meta.url), "utf8");
const start = source.indexOf("  function transferPanelRowHtml(");
const end = source.indexOf("  function transferPanelStageInfo(", start);
const context = {
  IS_CP_ALAMO: true,
  getTransferStats: () => ({ totalItems: 1, requested: 5, separated: 0, progress: 0, pendingSeparation: 1 }),
  getLatestTransferConferenceAssignment: () => null,
  transferRouteOriginLabel: () => "T E D COSMETICOS LTDA - EPP",
  transferRouteDestinationLabel: () => "T D COSMETICOS LTDA (23696)",
  transferPanelStageInfo: () => ({ label: "Separacao", className: "stage-separation" }),
  transferStatusDisplayLabel: () => "Em separacao",
  transferStageTrackHtml: () => "<div class=transfer-stage-track><span>Criada</span><span>Separacao</span><span>Caixa</span><span>Nota</span></div>",
  formatQty: String,
  isAdminOrSupervisor: () => true,
  canSelectTransferForMerge: () => false,
  canReassignTransfer: () => true,
  transferResponsibleOptionsHtml: () => "<option>Matheus Ribeiro Alves Freitas (mfreitas)</option><option>Outro responsavel</option>",
  escapeHtml: value => String(value ?? ""),
  transferDisplayName: () => "T E D COSMETICOS LTDA - EPP -> T D COSMETICOS LTDA (23696)",
  formatDateTime: () => "21/10/2026, 09:25",
  canCancelTransfer: () => true
};
// Exercise the production card markup with isolated fixture data, never live operations.
const render = vm.runInNewContext("(" + source.slice(start, end).trim() + ")", context);
const html = render({
  id: "layout-test", requestOrigin: "COMPRAS", responsibleName: "Matheus Ribeiro Alves Freitas",
  createdAt: "2026-10-21", status: "EM_SEPARACAO", mergedFromIds: []
});
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  await page.goto((process.env.TEST_BASE_URL || "http://127.0.0.1:4214") + "/tests/cpalamo-layout.html");
  await page.waitForFunction(() => window.layoutFixture?.ready);
  await page.evaluate(html => {
    document.getElementById("transferPanelRows").innerHTML = html;
    window.layoutFixture.show("transferencias", "transferPanelSection");
  }, html);
  for (const [name, width, height] of [["desktop", 1440, 1000], ["tablet", 900, 1000], ["mobile", 390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.locator(".transfer-board-card").scrollIntoViewIfNeeded();
    const boxes = await page.locator(".transfer-board-actions").evaluate(node => ({
      box: node.getBoundingClientRect().toJSON(),
      select: node.querySelector("select").getBoundingClientRect().toJSON(),
      buttons: [...node.querySelectorAll("button")].map(button => button.getBoundingClientRect().toJSON())
    }));
    assert.ok(boxes.box.x >= 0 && boxes.box.right <= width, name + ": footer overflow");
    for (const button of boxes.buttons) assert.ok(button.width < 180 && button.width > 60);
    assert.ok(Math.max(...boxes.buttons.map(b => b.y)) - Math.min(...boxes.buttons.map(b => b.y)) < 1);
    if (width > 1100) assert.ok(boxes.select.width <= 420);
    if (width <= 1100) assert.ok(boxes.select.bottom <= boxes.buttons[0].y);
    if (width < 761) await page.locator(".transfer-board-actions").scrollIntoViewIfNeeded();
    if (width > 1100) {
      await page.locator(".transfer-board-card").screenshot({ path: "outputs/transfer-actions-" + name + ".png" });
    } else {
      await page.screenshot({ path: "outputs/transfer-actions-" + name + ".png" });
    }
    console.log(name + ": compact buttons, aligned actions, responsible fits");
  }
  await page.locator("[data-transfer-reassign]").selectOption({ label: "Outro responsavel" });
  assert.equal(await page.locator("[data-transfer-reassign]").inputValue(), "Outro responsavel");
  console.log("Responsible select remains operable.");
} finally {
  await browser.close();
}
