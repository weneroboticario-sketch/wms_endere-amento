export const STORE_STAFF_ROLES = new Set(["OPERADOR", "ATENDENTE"]);

export function maySupervisorManageStoreUser({
  callerRole,
  allowedWarehouses,
  currentRole,
  currentWarehouse,
  nextRole,
  nextWarehouse
}: {
  callerRole: string;
  allowedWarehouses: string[];
  currentRole?: string;
  currentWarehouse?: string;
  nextRole: string;
  nextWarehouse: string;
}) {
  if (callerRole !== "SUPERVISOR") return false;
  const allowed = new Set(allowedWarehouses.map((code) => String(code || "").trim().toUpperCase()).filter(Boolean));
  const normalizedCurrentRole = String(currentRole || nextRole || "").toUpperCase();
  const normalizedNextRole = String(nextRole || "").toUpperCase();
  const normalizedCurrentWarehouse = String(currentWarehouse || nextWarehouse || "").toUpperCase();
  const normalizedNextWarehouse = String(nextWarehouse || "").toUpperCase();
  return STORE_STAFF_ROLES.has(normalizedCurrentRole)
    && STORE_STAFF_ROLES.has(normalizedNextRole)
    && allowed.has(normalizedCurrentWarehouse)
    && allowed.has(normalizedNextWarehouse);
}
