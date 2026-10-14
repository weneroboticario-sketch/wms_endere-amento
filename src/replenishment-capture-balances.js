export async function fetchReplenishmentCaptureBalances(client, warehouseCode, skus) {
  const codes = [...new Set(skus.filter(Boolean))];
  const balances = {};
  if (!codes.length) return balances;
  for (let offset = 0; ; offset += 500) {
    const result = await client.from("wms_stock_positions")
      .select("id,codigo_material,total_disponivel")
      .eq("warehouse_code", warehouseCode).eq("source_type", "CAPTACAO").eq("active", true)
      .or("archived.is.null,archived.eq.false").in("codigo_material", codes)
      .order("id", { ascending: true }).range(offset, offset + 499);
    if (result.error) throw result.error;
    for (const row of result.data || []) {
      const quantity = Number(row.total_disponivel);
      if (row.total_disponivel === null || !Number.isFinite(quantity)) throw new Error("Saldo CAPTACAO invalido.");
      balances[row.codigo_material] = (balances[row.codigo_material] ?? 0) + quantity;
    }
    if ((result.data || []).length < 500) break;
  }
  return balances;
}
