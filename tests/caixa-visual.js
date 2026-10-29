import { mountCaixaRequests } from "../src/caixa-requests.js";

const now = new Date().toISOString();
const base = { warehouse_code: "VDCG", quantity: 2, attended: 0, requested_by: "caixa-demo", requested_by_name: "Recepção · demonstração", created_at: now, updated_at: now, notes: "Cliente aguardando liberação no caixa." };
const rows = [
  { ...base, id: "product-1", sku: "84862", kind: "PRODUCT", product_name: "Produto demonstrativo A", quantity: 10, customer_service: true, status: "PENDENTE" },
  { ...base, id: "product-2", sku: "84859", kind: "PRODUCT", product_name: "Produto demonstrativo B", quantity: 1, customer_service: true, status: "PENDENTE" },
  { ...base, id: "adjustment-1", sku: "48060", kind: "ADJUSTMENT", status: "EM_VERIFICACAO", claimed_by: "worker-demo", claimed_by_name: "Estoquista · demonstração", notes: "Conferir quantidade para liberar o pedido do cliente." },
  { ...base, id: "adjustment-2", sku: "48060", kind: "ADJUSTMENT", quantity: 5, status: "AGUARDANDO_CONFIRMACAO_CAIXA", claimed_by: "worker-other", claimed_by_name: "Equipe do estoque", resolution_notes: "Conferência realizada. Aguardando confirmação do caixa." },
  { ...base, id: "urgent", sku: "83823", kind: "ADJUSTMENT", status: "PENDENTE" },
  { ...base, id: "done", sku: "85828", kind: "ADJUSTMENT", status: "CONCLUIDO", confirmed_at: now }
];
const cashier = new globalThis.URLSearchParams(globalThis.location.search).has("caixa");
const client = {
  from(table) {
    const query = { then(resolve) { return Promise.resolve({ data: table === "wms_caixa_requests" ? rows : [{ created_at: now, actor_id: "Equipe · demonstração", status: "EM_VERIFICACAO", event_type: "CLAIM", observation: "Ajuste assumido para conferência." }] }).then(resolve); } };
    for (const method of ["select", "eq", "order", "limit"]) query[method] = () => query;
    return query;
  },
  async rpc() { return { error: { code: "P0001", message: "Prévia visual: nenhuma alteração é enviada ao sistema real." } }; }
};
mountCaixaRequests(document.getElementById("caixaRequestsRoot"), { actor: cashier ? "caixa-demo" : "worker-demo", role: cashier ? "CAIXA" : "OPERADOR", warehouse: "VDCG", client, isCurrent: () => true });
