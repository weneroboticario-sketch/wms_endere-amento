const events = [];
export function recordOperationalDiagnostic({ module, event, warehouse, operationId, correlationId, category, result }) {
  events.push({ module: String(module || "operacional"), event: String(event || "unknown"), warehouse: String(warehouse || ""), operationId: String(operationId || ""), correlationId: String(correlationId || operationId || ""), category: String(category || ""), result: String(result || ""), at: new Date().toISOString() });
  if (events.length > 100) events.shift();
}
export function operationalDiagnostics() { return events.map(event => ({ ...event })); }
