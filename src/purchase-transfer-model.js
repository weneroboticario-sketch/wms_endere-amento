export const STORE_NEED_CONFIG = Object.freeze({ target: 3, maxQuantity: 1000000, maxItems: 500 });
export function getStoreNeedStatus(balance, target = STORE_NEED_CONFIG.target) {
  if (balance === null || balance === undefined || !Number.isFinite(Number(balance))) return "DESCONHECIDO";
  return Number(balance) <= 0 ? "ZERADO" : Number(balance) < target ? "BAIXO" : "NORMAL";
}
export function parseStoreNeedText(text) {
  const rows = new Map(), errors = [];
  String(text).split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    const parts = line.trim().split(/[;\t]/), sku = parts[0]?.trim(), quantity = Number(parts[1]);
    if (parts.length !== 2 || !sku || sku.length > 80 || !Number.isInteger(quantity) || quantity <= 0 || quantity > STORE_NEED_CONFIG.maxQuantity) {
      errors.push(`Linha ${index + 1}: use SKU;QUANTIDADE com quantidade inteira positiva.`); return;
    }
    const total = (rows.get(sku)?.need || 0) + quantity;
    if (total > STORE_NEED_CONFIG.maxQuantity) { errors.push(`Linha ${index + 1}: quantidade acima do limite.`); return; }
    rows.set(sku, { sku, need: total, description: "", store_available: null });
  });
  if (rows.size > STORE_NEED_CONFIG.maxItems) errors.push("Limite de 500 SKUs por transferencia.");
  return { rows: [...rows.values()], errors };
}
export function compareNeedWithCapture(item, capture) {
  const known = !!capture && capture.available !== null && capture.available !== undefined && Number.isFinite(Number(capture.available));
  const available = known ? Math.max(0, Number(capture.available)) : null;
  const need = Number(item.need || 0);
  const suggested = known ? Math.min(need, Math.floor(available)) : 0;
  return { ...item, description: capture?.description || item.description || "Produto sem descricao", available,
    location: capture?.location || "", capture_at: capture?.updated_at || null, suggested,
    quantity: item.quantity ?? suggested, missing: Math.max(0, need - suggested),
    situation: !known ? "NAO ENCONTRADO NA CAPTACAO" : available < 1 ? "SEM SALDO" : suggested < need ? "ATENDIMENTO PARCIAL" : "SALDO SUFICIENTE" };
}
export function validatePurchaseCart(items) {
  if (!items.length || items.length > STORE_NEED_CONFIG.maxItems) return "Selecione de 1 a 500 SKUs.";
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 0 || item.quantity > STORE_NEED_CONFIG.maxQuantity) return `Quantidade invalida: ${item.sku}.`;
    if (item.quantity > 0 && (item.available === null || item.available === undefined || item.quantity > item.available)) return `Saldo insuficiente ou desconhecido: ${item.sku}.`;
  }
  return items.some(item => item.quantity > 0) ? "" : "Nenhum item com quantidade positiva para enviar.";
}
export function summarizePurchaseCart(items) {
  return { skus: items.length, units: items.reduce((n,i) => n + Number(i.quantity || 0), 0), need: items.reduce((n,i) => n + Number(i.need || 0), 0),
    full: items.filter(i => i.quantity > 0 && i.quantity >= i.need).length,
    partial: items.filter(i => i.quantity > 0 && i.quantity < i.need).length,
    zero: items.filter(i => i.quantity === 0).length };
}
