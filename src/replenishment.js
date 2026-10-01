export const REPLENISHMENT_PRIORITIES = Object.freeze(["NORMAL", "CLIENTE"]);

export function normalizeReplenishmentPriority(value) {
  const priority = String(value || "").trim().toUpperCase();
  return REPLENISHMENT_PRIORITIES.includes(priority) ? priority : "NORMAL";
}

export function compareReplenishmentQueueItems(left, right) {
  if (left.status === right.status) {
    const priorityDifference = Number(right.prioridade === "CLIENTE") - Number(left.prioridade === "CLIENTE");
    if (priorityDifference) return priorityDifference;
  }
  return new Date(right.updatedAt || right.createdAt).getTime() - new Date(left.updatedAt || left.createdAt).getTime();
}
