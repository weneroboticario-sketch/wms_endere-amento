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
const messages = [{ id: 1, warehouse_code: "VDCG", request_id: "adjustment-1", sender_id: "caixa-demo", sender_name: "Caixa · demonstração", body: "O cliente está aguardando. Pode conferir o ajuste?", created_at: now }];
const client = {
  from(table) {
    const filters = {}; let descending = false, limit = 100;
    const query = { then(resolve) {
      let data = table === "wms_caixa_request_messages" ? messages.filter(message => (!filters.request_id || message.request_id === filters.request_id) && (!filters.before || message.id < filters.before)) : [{ created_at: now, actor_id: "Equipe · demonstração", status: "EM_VERIFICACAO", event_type: "CLAIM", observation: "Ajuste assumido para conferência." }];
      if (table === "wms_caixa_request_messages") data = [...data].sort((a,b) => descending ? b.id-a.id : a.id-b.id).slice(0,limit);
      return Promise.resolve({data}).then(resolve);
    }, select(){return query;}, eq(key,value){filters[key]=value;return query;}, lt(key,value){filters.before=value;return query;}, order(key,options){descending=options?.ascending===false;return query;}, limit(value){limit=value;return query;} };
    return query;
  },
  async rpc(name,args) {
    if (name === "list_wms_caixa_attendance") return {data:rows.map(row=>({...row}))};
    if (name === "send_wms_caixa_message") {
      messages.push({ id: messages.length+1, request_id:args.request_key, warehouse_code:"VDCG", sender_id:cashier?"caixa-demo":"worker-demo", sender_name:cashier?"Caixa · demonstração":"Estoquista · demonstração", body:args.body, created_at:new Date().toISOString() });
      return {data:messages.length};
    }
    return { error: { code: "P0001", message: "Prévia visual: nenhuma alteração é enviada ao sistema real." } };
  }
};
mountCaixaRequests(document.getElementById("caixaRequestsRoot"), { actor: cashier ? "caixa-demo" : "worker-demo", role: cashier ? "CAIXA" : "OPERADOR", warehouse: "VDCG", client, isCurrent: () => true });
