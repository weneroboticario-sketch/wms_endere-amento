const normalize = value => String(value || "").trim().toUpperCase();
export function normalizedWarehouseSelection(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(/[,;|\s]+/);
  return [...new Set(values.map(normalize).filter(Boolean))].sort();
}

export function verifySavedWarehouseSelection(expected, saved) {
  const wanted = normalizedWarehouseSelection(expected);
  const actual = normalizedWarehouseSelection(saved);
  if (JSON.stringify(wanted) !== JSON.stringify(actual)) {
    throw new Error("As unidades autorizadas nao foram confirmadas no Supabase. Esperado: " + wanted.join(", ") + ". Confirmado: " + (actual.join(", ") || "nenhuma") + ". As selecoes foram mantidas para revisao.");
  }
  return actual;
}

export function purchasesQueryWarehouse(user, allowedCodes, selected) {
  if (user?.role !== "COMPRAS") throw new Error("Consulta multestoque nao autorizada.");
  const allowed = normalizedWarehouseSelection(allowedCodes);
  if (!allowed.length) throw new Error("Nenhuma unidade autorizada para consulta.");
  if (!selected) return null;
  const code = normalize(selected);
  if (!allowed.includes(code)) throw new Error("Unidade nao autorizada para consulta.");
  return code;
}
