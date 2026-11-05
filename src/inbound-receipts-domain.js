export const inboundRoles = ["ADMINISTRADOR", "SUPERVISOR", "OPERADOR"];
export const inboundLabels = { AGUARDANDO: "Aguardando conferência", EM_CONFERENCIA: "Em conferência", CONCLUIDO_CORRETO: "Concluído sem divergência", CONCLUIDO_DIVERGENTE: "Concluído com divergência" };
export function inboundItemStatus(item) {
  if (item.counted_qty == null) return "PENDENTE";
  if (item.is_extra) return "NÃO PREVISTO";
  const difference = Number(item.counted_qty) - Number(item.expected_qty);
  return Math.abs(difference) < 0.000001 ? "CORRETO" : difference < 0 ? "FALTANTE" : "EXCEDENTE";
}
export function inboundSummary(items) {
  const units = {};
  for (const item of items) {
    const unit = item.commercial_unit;
    units[unit] ||= { expected: 0, counted: 0, missing: 0, excess: 0 };
    const row = units[unit], expected = Number(item.expected_qty), counted = Number(item.counted_qty || 0);
    row.expected += expected; row.counted += counted;
    if (item.counted_qty != null) { row.missing += Math.max(0, expected - counted); row.excess += Math.max(0, counted - expected); }
  }
  return { total: items.length, checked: items.filter(i => i.counted_qty != null).length,
    pending: items.filter(i => i.counted_qty == null).length,
    divergent: items.filter(i => !["CORRETO", "PENDENTE"].includes(inboundItemStatus(i))).length,
    extras: items.filter(i => i.is_extra).length, units };
}
export function findInboundItems(items, code) {
  const value = String(code).trim();
  const numeric = x => /^\d+$/.test(x) ? x.replace(/^0+(?=\d)/, "") : x;
  // cProd is a supplier code. It is never implicitly treated as an internal SKU.
  return items.filter(item => (item.internal_sku && numeric(item.internal_sku) === numeric(value)) ||
    (/^\d{8,14}$/.test(value) && (item.ean === value || item.tributary_ean === value)));
}
export function inboundScanUnit(item, code) {
  if (item.commercial_unit === item.tributary_unit) return item.commercial_unit;
  if (item.ean === code && item.tributary_ean !== code) return item.commercial_unit;
  if (item.tributary_ean === code && item.ean !== code) return item.tributary_unit;
  return null;
}
let xmlPolicy;
export function previewInboundXml(text, Parser = globalThis.DOMParser) {
  if (!text?.trim() || text.length > 5 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error("XML inválido: até 5 MB, sem entidades externas.");
  let input = text;
  if (globalThis.trustedTypes?.createPolicy) {
    xmlPolicy ||= globalThis.trustedTypes.createPolicy("wms-inbound-xml", { createHTML: value => value });
    input = xmlPolicy.createHTML(text);
  }
  const doc = new Parser().parseFromString(input, "application/xml");
  const nodes = (parent, name) => Array.from(parent?.getElementsByTagNameNS("*", name) || []);
  const value = (parent, name) => nodes(parent, name)[0]?.textContent.trim() || "";
  const infos = nodes(doc, "infNFe"), info = infos[0];
  const key = (info?.getAttribute("Id") || "").replace(/^NFe/, "");
  if (doc.getElementsByTagName("parsererror").length || infos.length !== 1 || !/^\d{44}$/.test(key) || value(info, "mod") !== "55") throw new Error("O arquivo deve conter uma NF-e válida.");
  return { key, number: value(info, "nNF"), source: value(nodes(info, "emit")[0], "xNome"),
    destination: value(nodes(info, "dest")[0], "CNPJ"), items: nodes(info, "det").length };
}
export function inboundReportRows(receipt, items) {
  return [["NF-e", "Série", "Chave", "Origem", "Destino", "Estoque", "Linha", "Código NF", "SKU WMS", "Descrição", "Unidade", "Prevista", "Conferida", "Diferença", "Situação", "Conferente", "Data/hora", "Observação"],
    ...items.map(i => [receipt.invoice_number, receipt.series, receipt.invoice_key, receipt.source_name, receipt.destination_name, receipt.warehouse_code,
      i.line_number, i.supplier_code, i.internal_sku || "", i.description, i.commercial_unit, i.expected_qty, i.counted_qty ?? "", i.counted_qty == null ? "" : Number(i.counted_qty) - Number(i.expected_qty), inboundItemStatus(i), i.counted_name || "", i.counted_at || "", i.observation])];
}
