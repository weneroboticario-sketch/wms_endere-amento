export const ACCESS_REQUEST_ROLES = Object.freeze(["OPERADOR", "ATENDENTE"]);

export function normalizeAccessRequestRole(value) {
  const role = String(value || "").trim().toUpperCase();
  return ACCESS_REQUEST_ROLES.includes(role) ? role : "OPERADOR";
}
