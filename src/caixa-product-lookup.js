export function createCaixaProductLookup({ client, warehouse, isCurrent, now = Date.now }) {
  const cache = new Map();
  return {
    async lookup(value) {
      const code = String(value || "").trim();
      if (/^\d{9,14}$/.test(code)) return { state: "unsupported", message: "Código de barras sem vínculo na base atual. Informe o SKU do produto." };
      if (!/^\d{4,8}$/.test(code)) return { state: "invalid", message: "Informe ou bipe o SKU com 4 a 8 dígitos." };
      if (!isCurrent()) return { state: "stale" };
      const existing = cache.get(code);
      if (existing && existing.until > now()) return existing.promise;
      const promise = (async () => {
        try {
          const response = await client.rpc("lookup_wms_caixa_item", { code: warehouse, product_code: code });
          if (!isCurrent()) return { state: "stale" };
          if (response.error) return { state: "error", message: "Saldo indisponível. Não foi possível consultar este produto. Tente novamente." };
          if (!response.data?.found) return { state: "missing", message: "Produto não encontrado no estoque selecionado." };
          return { state: "found", item: { ...response.data, sku: code } };
        } catch { return { state: "error", message: "Saldo indisponível. Verifique a conexão e tente novamente." }; }
      })();
      cache.set(code, { promise, until: now() + 30000 });
      const result = await promise;
      if (["error", "stale"].includes(result.state)) cache.delete(code);
      return result;
    }
  };
}
