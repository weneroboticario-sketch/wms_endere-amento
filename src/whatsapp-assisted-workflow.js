const copy = value => JSON.parse(JSON.stringify(value));
const signature = text => text.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");

export function approveAssistedDraft(requests, draft, { duplicateReviewed = false } = {}) {
  const existing = requests.find(request => request.id === draft.id);
  if (existing) return existing;
  if (!draft.id || !draft.original?.trim() || !draft.lines?.length) throw new Error("Solicitação sem itens ou identificação.");
  if (!duplicateReviewed && requests.some(request => signature(request.original) === signature(draft.original))) {
    throw new Error("Possível duplicidade: confira a solicitação anterior antes de aprovar outra. Texto igual não comprova mensagem igual.");
  }
  if (draft.lines.some(line => !/^\d{4,8}$/.test(line.sku) || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || ![1, 2, 3, 4].includes(line.priority))) {
    throw new Error("Revise os SKUs, as quantidades inteiras positivas e as prioridades.");
  }
  const timestamp = new Date().toISOString();
  const request = {
    id: draft.id, original: draft.original, receivedAt: timestamp, status: "OPEN", revision: 0,
    lines: draft.lines.map((line, index) => ({ ...copy(line), id: `${draft.id}:${index}`, attended: 0, pending: line.quantity, status: line.kind === "ADJUSTMENT" ? "VERIFICATION" : "PENDING" })),
    history: [{ type: "SIMULATED_APPROVAL", timestamp }], operationIds: []
  };
  requests.push(request);
  return request;
}

export function fulfillAssistedLine(request, { lineId, amount, operationId, expectedRevision }) {
  if (!operationId) throw new Error("Identificação da operação obrigatória.");
  if (request.operationIds.includes(operationId)) return request;
  if (request.revision !== expectedRevision) throw new Error("Solicitação alterada: atualize antes de registrar o atendimento.");
  const line = request.lines.find(item => item.id === lineId);
  if (!line || line.kind === "ADJUSTMENT") throw new Error("Ajustes exigem verificação; não podem registrar abastecimento.");
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > line.pending) throw new Error("Informe quantidade positiva até o saldo pendente.");
  const timestamp = new Date().toISOString();
  line.startedAt ||= timestamp;
  line.attended += amount;
  line.pending = line.quantity - line.attended;
  line.status = line.pending ? "PARTIAL" : "FULFILLED";
  if (!line.pending) line.finishedAt = timestamp;
  request.status = request.lines.every(item => item.status === "FULFILLED") ? "FULFILLED" : "PARTIAL";
  request.history.push({ type: "SIMULATED_FULFILLMENT", lineId, amount, timestamp, operationId });
  request.operationIds.push(operationId);
  request.revision += 1;
  return request;
}

export function assistedQueue(requests) {
  return requests.flatMap(request => request.lines.filter(line => line.pending > 0).map(line => ({ ...line, requestId: request.id, receivedAt: request.receivedAt })))
    .sort((first, second) => first.priority - second.priority || first.receivedAt.localeCompare(second.receivedAt) || first.sourceLine - second.sourceLine);
}
