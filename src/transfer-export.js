export function parseTransferQuantity(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+(?:[.,]\d{1,3})?$/.test(text)) return NaN;
  const quantity = Number(text.replace(",", "."));
  return Number.isFinite(quantity) ? quantity : NaN;
}

export function buildPackedProductRows(items) {
  const totals = new Map();
  for (const item of items) {
    if (item.status === "REMOVIDO") continue;
    const packed = Number(item.packedQty ?? 0);
    if (!Number.isFinite(packed) || packed < 0) throw new Error("Quantidade na caixa invalida: " + item.sku);
    if (packed === 0) continue;
    const sku = String(item.sku ?? "").trim();
    if (!/^[a-z0-9._-]+$/i.test(sku)) throw new Error("Codigo de produto invalido para exportacao.");
    const box = item.quantityType === "CAIXA" || /^(CX|CAIXA|CAIXAS)$/i.test(item.unit || "");
    const quantity = box ? Number(item.packedUnits) : packed;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Confira o total em unidades da caixa do SKU " + sku + " antes de exportar.");
    }
    totals.set(sku, Math.round(((totals.get(sku) || 0) + quantity) * 1000) / 1000);
  }
  return Array.from(totals, ([sku, quantity]) => [sku, quantity]);
}

export function packedProductCsv(rows) {
  return rows.map(([sku, quantity]) => sku + ";" + String(quantity).replace(".", ",")).join("\r\n") + "\r\n";
}
