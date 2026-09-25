function normalizeWarehouseCode(value) {
  return String(value || "").trim().toUpperCase();
}

export function shouldUseVdcgLinhaSeparacaoTemplate(warehouseCode) {
  return normalizeWarehouseCode(warehouseCode) === "VDCG";
}

export function formatLinhaSeparacaoStationName(warehouseCode, streetNumber) {
  const street = Math.max(0, Number(streetNumber) || 0);
  if (normalizeWarehouseCode(warehouseCode) === "VDCO") return "RUA " + street;
  return "Rua " + String(street).padStart(2, "0");
}
