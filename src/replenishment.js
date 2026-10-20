export const REPLENISHMENT_PRIORITIES = Object.freeze(["NORMAL", "CLIENTE"]);
export const REPLENISHMENT_QUEUE_HIDDEN_STATUSES = Object.freeze(["CONCLUIDO", "ENTREGUE_NA_LOJA", "CANCELADO"]);

export function normalizeReplenishmentPriority(value) {
  const priority = String(value || "").trim().toUpperCase();
  return REPLENISHMENT_PRIORITIES.includes(priority) ? priority : "NORMAL";
}

export function isReplenishmentVisibleInActiveQueue(request) {
  return Boolean(request) && !REPLENISHMENT_QUEUE_HIDDEN_STATUSES.includes(String(request.status || "").trim().toUpperCase());
}

export function matchesReplenishmentQueueFilter(request, filter) {
  if (!filter) return true;
  if (filter === "EM_SEPARACAO") return ["EM_SEPARACAO", "SEPARADO"].includes(request.status);
  return request.status === filter;
}

export function compareReplenishmentQueueItems(left, right) {
  if (left.status === right.status) {
    const priorityDifference = Number(right.prioridade === "CLIENTE") - Number(left.prioridade === "CLIENTE");
    if (priorityDifference) return priorityDifference;
  }
  return new Date(right.updatedAt || right.createdAt).getTime() - new Date(left.updatedAt || left.createdAt).getTime();
}
