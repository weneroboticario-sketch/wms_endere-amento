export function hasPulmaoBase(warehouseCode) {
  return ["23696", "22796"].includes(String(warehouseCode || "").trim().toUpperCase());
}

export function summarizePulmao(positions) {
  const rows = (positions || []).filter(row => row.sourceType === "PULMAO");
  return {
    found: rows.length > 0,
    available: rows.reduce((sum, row) => sum + Number(row.totalDisponivel || 0), 0),
    locations: [...new Set(rows.map(row => row.codigoEndereco).filter(Boolean))].join(" / "),
    rows
  };
}

export function buildPulmaoSeparationRows(positions, parseLocation, formatRow) {
  const groups = new Map();
  for (const position of positions || []) {
    if (position.sourceType !== "PULMAO") continue;
    const parsed = parseLocation(position.codigoEndereco || "");
    if (!parsed.valid || !position.codigoMaterial) continue;
    if (!groups.has(parsed.code)) groups.set(parsed.code, { parsed, position, skus: new Set() });
    groups.get(parsed.code).skus.add(String(position.codigoMaterial));
  }
  return [...groups.values()].sort((a, b) => a.parsed.code.localeCompare(b.parsed.code, "pt-BR", {numeric:true})).map(group => {
    const p = group.parsed;
    const row = formatRow(p.rua, p.rack, 1, p.linha, p.letra, [...group.skus].sort().join(";"));
    if (group.position.estacao) row[0] = group.position.estacao;
    return row;
  });
}
