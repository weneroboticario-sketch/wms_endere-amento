function greater(a, b) {
  a = String(a || "0").replace(/^0+/, "") || "0"; b = String(b || "0").replace(/^0+/, "") || "0";
  return a.length > b.length || (a.length === b.length && a > b);
}

export function createCaixaUnread({ actor, warehouse, storage }) {
  const key = `wms:caixa:read:${actor}:${warehouse}`;
  const read = new Map();
  function restore() {
    try {
      const saved = JSON.parse(storage?.getItem(key) || "{}");
      for (const [request, id] of Object.entries(saved)) if (/^\d+$/.test(String(id)) && greater(id, read.get(request))) read.set(request, String(id));
    } catch { return; }
  }
  return {
    unread(messages) {
      restore();
      return messages.filter(message => message.request_id && /^\d+$/.test(String(message.id)) && message.sender_id !== actor && (!message.warehouse_code || message.warehouse_code === warehouse) && greater(message.id, read.get(message.request_id)));
    },
    acknowledge(request, messages) {
      restore();
      for (const message of messages) if (message.request_id === request && /^\d+$/.test(String(message.id)) && greater(message.id, read.get(request))) read.set(request, String(message.id));
      try { storage?.setItem(key, JSON.stringify(Object.fromEntries(read))); } catch { return; }
    }
  };
}
