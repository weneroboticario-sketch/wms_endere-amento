export const ACCESS_REQUEST_ROLES = Object.freeze(["OPERADOR", "ATENDENTE"]);
export const STORE_STAFF_ROLES = Object.freeze(["OPERADOR", "ATENDENTE"]);

const PURCHASE_CAPABILITIES = Object.freeze({
  "purchases.transfer.create": ["COMPRAS", "ADMINISTRADOR"],
  "purchases.transfer.read": ["COMPRAS", "ADMINISTRADOR", "SUPERVISOR", "OPERADOR"],
  "invoice.prepare": ["COMPRAS", "ADMINISTRADOR", "SUPERVISOR"],
  "invoice.upload": ["COMPRAS", "ADMINISTRADOR", "SUPERVISOR"],
  "invoice.release": ["COMPRAS", "ADMINISTRADOR", "SUPERVISOR"],
  "invoice.return_correction": ["COMPRAS", "ADMINISTRADOR", "SUPERVISOR"],
  "stock.execute": ["ADMINISTRADOR", "SUPERVISOR", "OPERADOR"],
  "stock.dispatch": ["ADMINISTRADOR", "SUPERVISOR", "OPERADOR"],
  "invoice.view": ["COMPRAS", "ADMINISTRADOR", "SUPERVISOR", "OPERADOR"]
});

export function hasPurchaseCapability(role, capability) {
  return (PURCHASE_CAPABILITIES[capability] || []).includes(role);
}

export function normalizeAccessRequestRole(value) {
  const role = String(value || "").trim().toUpperCase();
  return ACCESS_REQUEST_ROLES.includes(role) ? role : "OPERADOR";
}

export function isStoreStaffRole(value) {
  return STORE_STAFF_ROLES.includes(String(value || "").trim().toUpperCase());
}
