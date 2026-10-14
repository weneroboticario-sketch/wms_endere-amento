export const PURCHASES_SLA_CONFIG = Object.freeze({
  COMPRAS: Object.freeze({ warningMinutes: 30, lateMinutes: 60 }),
  ESTOQUE: Object.freeze({ warningMinutes: 60, lateMinutes: 120 }),
  EXPEDICAO: Object.freeze({ warningMinutes: 60, lateMinutes: 120 })
});

export function getCurrentProcessOwner(process) {
  const stage = process.invoice_stage || "";
  if (stage === "FINALIZADA" || ["CANCELADA", "CANCELADO"].includes(process.status)) return "CONCLUIDO";
  if (["PRONTA_PARA_NOTA", "NF_EM_PREPARACAO", "NF_ANEXADA"].includes(stage)) return "COMPRAS";
  if (["LIBERADA_PARA_ENVIO", "DESPACHADA", "RECEBIDA"].includes(stage)) return "EXPEDICAO";
  return "ESTOQUE";
}

export function processNeedsAction(process, role) {
  const owner = getCurrentProcessOwner(process);
  if (owner === "CONCLUIDO") return false;
  if (["ADMINISTRADOR", "SUPERVISOR"].includes(role)) return true;
  return role === "COMPRAS" ? owner === "COMPRAS" : role === "OPERADOR" && owner !== "COMPRAS";
}

export function getProcessSla(process, now = Date.now(), config = PURCHASES_SLA_CONFIG) {
  const timestamp = Date.parse(process.status_changed_at || process.updated_at || process.created_at || "");
  const minutes = Number.isFinite(timestamp) ? Math.max(0, Math.floor((now - timestamp) / 60000)) : null;
  const limits = config[getCurrentProcessOwner(process)];
  const level = limits && minutes !== null ? minutes >= limits.lateMinutes ? "late" : minutes >= limits.warningMinutes ? "warning" : "normal" : "normal";
  return { minutes, level, label: minutes === null ? "Tempo indisponivel" : minutes < 60 ? `ha ${minutes} min` : `ha ${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}` };
}

export function hasProcessPending(process) {
  return process.invoice_stage === "CORRECAO_SOLICITADA" || Number(process.open_divergences || 0) > 0 || /DIVERGENCIA|SEM_ESTOQUE/.test(process.status || "");
}

export function comparePurchaseProcesses(a, b, now = Date.now()) {
  const first = getProcessSla(a, now), second = getProcessSla(b, now);
  return Number(second.level === "late") - Number(first.level === "late")
    || Number(hasProcessPending(b)) - Number(hasProcessPending(a))
    || (second.minutes ?? -1) - (first.minutes ?? -1)
    || (Date.parse(a.updated_at) || 0) - (Date.parse(b.updated_at) || 0)
    || String(a.id).localeCompare(String(b.id));
}

export function getProcessTimeline(process, events = []) {
  const steps = [
    ["CREATED", "Solicitacao criada", process.created_at],
    ["SEPARATING", "Separacao iniciada", process.iniciado_em],
    ["SEPARATED", "Separacao concluida", process.separacao_concluida_em || process.separation_finished_at],
    ["PACKED", "Conferencia e caixas prontas", process.lacre_concluido_em],
    ["PRONTA_PARA_NOTA", "Disponivel para NF"],
    ["NF_EM_PREPARACAO", "NF em preparacao"],
    ["NF_ANEXADA", "NF anexada", process.invoice_uploaded_at],
    ["LIBERADA_PARA_ENVIO", "Liberada para envio", process.invoice_released_at],
    ["DESPACHADA", "Despachada", process.sent_at],
    ["RECEBIDA", "Recebida", process.received_at],
    ["FINALIZADA", "Concluida", process.finished_at]
  ];
  let current = steps.findIndex(([key]) => key === process.invoice_stage);
  if (current < 0) current = /SEPARACAO|SEPARANDO|EM_ANDAMENTO/.test(process.status || "") ? 1 : 0;
  return steps.map(([key, label, timestamp], index) => ({ key, label,
    timestamp: timestamp || events.find(event => event.event_type === key)?.created_at || null,
    state: process.invoice_stage === "CORRECAO_SOLICITADA" && index === current ? "pending" : index === current ? "current" : index < current || timestamp ? "completed" : "future"
  }));
}
