export async function completeMissingTransferSummaries(transfers, readPage) {
  const missing = transfers.filter(row => Number(row.total_items || row.total_skus || 0) <= 0 || Number(row.total_expected_quantity || row.total_previsto || 0) <= 0);
  if (!missing.length) return transfers;
  const totals = new Map();
  for (let start = 0; start < missing.length; start += 50) {
    const ids = missing.slice(start, start + 50).map(row => row.id);
    for (let offset = 0; ; offset += 1000) {
      const items = await readPage(ids, offset, 1000);
      for (const item of items) {
        if (!ids.includes(item.transfer_id) || item.status === "REMOVIDO") continue;
        const total = totals.get(item.transfer_id) || { count: 0, skus: new Set(), expected: 0, separated: 0, packed: 0 };
        if (!item.is_extra) {
          total.count++;
          if (item.sku) total.skus.add(item.sku);
          total.expected += Number(item.quantidade_solicitada || 0);
        }
        total.separated += Number(item.quantidade_separada || 0);
        total.packed += Number(item.quantidade_lacrada || 0);
        totals.set(item.transfer_id, total);
      }
      if (items.length < 1000) break;
    }
  }
  return transfers.map(row => {
    if (!missing.includes(row)) return row;
    const total = totals.get(row.id) || { count: 0, skus: new Set(), expected: 0, separated: 0, packed: 0 };
    return { ...row, total_items: total.count, total_skus: total.skus.size, total_expected_quantity: total.expected, total_previsto: total.expected, total_separated_quantity: total.separated, total_packed_quantity: total.packed, total_enviado: total.packed };
  });
}
