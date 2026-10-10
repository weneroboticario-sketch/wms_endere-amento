export function buildReplenishmentExportRows(requests, warehouseCode, from = "", through = "") {
  const start = from ? new Date(from + "T00:00:00").getTime() : -Infinity;
  const endDate = through ? new Date(through + "T00:00:00") : null;
  if (endDate) endDate.setDate(endDate.getDate() + 1);
  const end = endDate ? endDate.getTime() : Infinity;
  if (Number.isNaN(start) || Number.isNaN(end) || start >= end) {
    throw new Error("Confira o periodo de conclusao.");
  }
  const totals = new Map();
  const seen = new Set();
  for (const request of requests) {
    if (request.warehouse_code !== warehouseCode || request.is_deleted === true ||
        !["CONCLUIDO", "ENTREGUE_NA_LOJA"].includes(request.status)) continue;
    if (seen.has(request.id)) continue;
    seen.add(request.id);
    if (from || through) {
      const completed = new Date(request.finished_at || request.updated_at).getTime();
      if (!Number.isFinite(completed)) throw new Error("Pedido sem data de conclusao valida.");
      if (completed < start || completed >= end) continue;
    }
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
