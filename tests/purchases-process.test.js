import test from "node:test";
import assert from "node:assert/strict";
import { getCurrentProcessOwner, processNeedsAction, getProcessSla, comparePurchaseProcesses, getProcessTimeline } from "../src/purchases-process.js";
import { hasPurchaseCapability } from "../src/access-control.js";

test("responsabilidade fiscal e operacional nao se confundem", () => {
  assert.equal(getCurrentProcessOwner({ invoice_stage: "NF_ANEXADA" }), "COMPRAS");
  assert.equal(getCurrentProcessOwner({ invoice_stage: "LIBERADA_PARA_ENVIO" }), "EXPEDICAO");
  assert.equal(processNeedsAction({ invoice_stage: "NF_ANEXADA" }, "OPERADOR"), false);
  assert.equal(processNeedsAction({ invoice_stage: "DESPACHADA" }, "COMPRAS"), false);
  assert.equal(processNeedsAction({ invoice_stage: "FINALIZADA" }, "ADMINISTRADOR"), false);
  assert.equal(hasPurchaseCapability("COMPRAS", "stock.dispatch"), false);
  assert.equal(hasPurchaseCapability("OPERADOR", "invoice.upload"), false);
});

test("SLA e ordenacao sao informativos e nao alteram registros", () => {
  const now = Date.parse("2026-10-13T12:00:00Z");
  const old = Object.freeze({ id: "01302", invoice_stage: "PRONTA_PARA_NOTA", status_changed_at: "2026-10-13T10:00:00Z" });
  const fresh = { id: "2", invoice_stage: "PRONTA_PARA_NOTA", status_changed_at: "2026-10-13T11:50:00Z" };
  assert.equal(getProcessSla(old, now).level, "late");
  assert.equal(getProcessSla(fresh, now).level, "normal");
  assert.ok(comparePurchaseProcesses(old, fresh, now) < 0);
  assert.equal(getProcessSla({}, now).minutes, null);
  assert.equal(old.id, "01302");
});

test("timeline usa datas reais sem inventar timestamps", () => {
  const timeline = getProcessTimeline({ invoice_stage: "NF_ANEXADA", created_at: "2026-10-13T10:00:00Z" });
  assert.equal(timeline.find(step => step.key === "NF_ANEXADA").state, "current");
  assert.equal(timeline.find(step => step.key === "NF_EM_PREPARACAO").timestamp, null);
  assert.equal(timeline.find(step => step.key === "DESPACHADA").state, "future");
});
