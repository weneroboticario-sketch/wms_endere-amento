export function buildReplenishmentExportRows(requests, warehouseCode) {
  const totals = new Map();
  const seen = new Set();
  for (const request of requests) {
    if (request.warehouse_code !== warehouseCode || request.is_deleted === true || request.export_batch_id ||
        !["CONCLUIDO", "ENTREGUE_NA_LOJA"].includes(request.status)) continue;
    if (seen.has(request.id)) continue;
    seen.add(request.id);
    const quantity = Number(request.quantidade_atendida ?? 0);
    if (!Number.isFinite(quantity) || quantity < 0) throw new Error("Quantidade atendida invalida.");
    if (quantity === 0) continue;
    const sku = String(request.codigo_material ?? "").trim();
    if (!sku) throw new Error("Pedido concluido sem codigo do material.");
    totals.set(sku, Math.round(((totals.get(sku) || 0) + quantity) * 1000) / 1000);
  }
  return Array.from(totals, ([sku, quantity]) => [sku, quantity]);
}

export function fillReplenishmentTemplate(XLSX, workbook, rows) {
  const sheet = workbook.Sheets.Materiais;
  if (!sheet || sheet.A1?.v !== "Material" || sheet.B1?.v !== "Quantidade") {
    throw new Error("Modelo de materiais invalido.");
  }
  XLSX.utils.sheet_add_aoa(sheet, rows, { origin: "A2" });
  rows.forEach(([sku], index) => {
    sheet["A" + (index + 2)] = { t: "s", v: sku, z: "@" };
  });
  return workbook;
}
