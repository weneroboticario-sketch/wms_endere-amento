export const ACCESS_REQUEST_ROLES = Object.freeze(["OPERADOR", "ATENDENTE"]);
export const STORE_STAFF_ROLES = Object.freeze(["OPERADOR", "ATENDENTE"]);

export function normalizeAccessRequestRole(value) {
  const role = String(value || "").trim().toUpperCase();
  return ACCESS_REQUEST_ROLES.includes(role) ? role : "OPERADOR";
}

export function isStoreStaffRole(value) {
  return STORE_STAFF_ROLES.includes(String(value || "").trim().toUpperCase());
}
