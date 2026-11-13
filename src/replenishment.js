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

const routeCollator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

function physicalPart(value, prefix) {
  const raw = String(value ?? "").trim().toUpperCase();
  const part = raw.replace(prefix, "");
  if (!/^[A-Z0-9]+$/.test(part)) return "";
  return /^\d+$/.test(part) ? part.replace(/^0+(?=\d)/, "") : part;
}

export function replenishmentRouteAddress(item, normalizeLocation, columnNumber) {
  const address = normalizeLocation(item.localizacaoWms);
  const fromParts = (station, rack, line, column) => {
    const rua = physicalPart(station, /^(?:RUA[ -]*|R(?=\d))/);
    const rackKey = physicalPart(rack, /^(?:RACK[ -]*|RK(?=\d))/);
    const linha = physicalPart(line, /^(?:(?:LINHA|N[IÍ]VEL)[ -]*|L(?=\d))/);
    const letra = String(column ?? "").trim().toUpperCase();
    if (!rua || rua === "0" || !rackKey || rackKey === "0" || !linha || linha === "0" || !columnNumber(letra)) return null;
    // A separation station such as LS54 is not a physical street.
    if (!/^\d+$/.test(rua) && !/^RUA[ -]/i.test(String(station).trim())) return null;
    return { rua, rack: rackKey, linha, letra, code: [station, rack, line, column].join(" · ") };
  };
  if (address.valid) return { ...address, code: item.localizacaoWms };
  return fromParts(item.captacaoEstacao, item.captacaoRack, item.captacaoLinha, item.captacaoColuna)
    || fromParts(item.localizacaoEstacao, item.localizacaoRack, item.localizacaoLinha, item.localizacaoColuna);
}

export function buildReplenishmentRoute(requests, warehouse, addressFor, columnNumber) {
  return requests.filter(item => item.warehouseCode === warehouse).map(item => ({
    item, address: addressFor(item), priority: Number(normalizeReplenishmentPriority(item.prioridade) !== "CLIENTE")
  })).sort((a, b) => {
    const priority = a.priority - b.priority;
    if (priority) return priority;
    if (a.address && b.address) {
      for (const key of ["rua", "rack", "linha"]) {
        const difference = routeCollator.compare(a.address[key], b.address[key]);
        if (difference) return difference;
      }
      const column = columnNumber(a.address.letra) - columnNumber(b.address.letra);
      if (column) return column;
    } else if (a.address || b.address) {
      return a.address ? -1 : 1;
    }
    return String(a.item.id).localeCompare(String(b.item.id), "en");
  });
}

export async function loadActiveReplenishmentPages(fetchPage, isCurrent, pageSize = 120) {
  const rows = [];
  let after = null;
  while (isCurrent()) {
    const response = await fetchPage(after, pageSize);
    if (response.error) throw response.error;
    if (!isCurrent()) return null;
    const page = response.data || [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
    after = page.at(-1).id;
  }
  return null;
}
