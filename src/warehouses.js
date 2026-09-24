export const DEFAULT_WAREHOUSE_CODE = "VDCG";
export const DEFAULT_WAREHOUSE_ID = "warehouse-vdcg";

export const WAREHOUSE_SEED = Object.freeze([
  { id: "warehouse-vdcg", code: "VDCG", name: "Estoque VDCG", active: true, notes: "Estoque principal existente" },
  { id: "warehouse-vdar", code: "VDAR", name: "Estoque VDAR", active: true, notes: "Segundo estoque operacional" },
  { id: "warehouse-vdsi", code: "VDSI", name: "Estoque VDSI", active: true, notes: "Terceiro estoque operacional" },
  { id: "warehouse-vdco", code: "VDCO", name: "Estoque VDCO", active: true, notes: "Quarto estoque operacional" }
]);

export function normalizeWarehouseCodeValue(value) {
  const code = String(value || "").trim().toUpperCase();
  if (code === "VDR" || code === "DVR") return "VDAR";
  return code || DEFAULT_WAREHOUSE_CODE;
}
