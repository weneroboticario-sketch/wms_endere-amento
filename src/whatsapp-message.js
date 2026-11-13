const fold = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
const unformatNumbers = value => value.replace(/(\*{1,2}|_{1,2}|~)(\d+(?:[.,]\d+)?)\1/g, "$2");

export function interpretWhatsAppMessage(original) {
  if (typeof original !== "string" || original.length > 20000) throw new Error("Cole uma mensagem de até 20.000 caracteres.");
  const lines = [];
  const review = [];
  const normalized = fold(original.trim());
  if (/^(FEITO|CONTINUA PEDINDO AJUSTE|TENTA NOVAMENTE|TA VINDO\??|NAO TEMOS)[.!?\s]*$/.test(normalized)) {
    return { original, lines, review: ["Resposta ou acompanhamento: não cria tarefa nem conclui atividade."], kind: "RESPONSE" };
  }
  original.split(/\r?\n/).forEach((text, index) => {
    if (!text.trim()) return;
    if (/^\s*>/.test(text)) { review.push(`Linha ${index + 1}: citação ignorada; origem não identificada.`); return; }
    const match = unformatNumbers(text.trim()).match(/^(?:(?:ajuste|produto\s+c[oó]digo)\s+)?(\d{2,}(?:\.\d{3})*|\d{1,3}(?:\.\d{3})+)\b(.*)$/i);
    if (!match || match[1].replaceAll(".", "").length < 4 || match[1].replaceAll(".", "").length > 8) {
      review.push(`Linha ${index + 1}: texto não reconhecido; confira manualmente.`);
      return;
    }
    const sku = match[1].replaceAll(".", "");
    const tail = match[2];
    const quantities = [...tail.matchAll(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(UNIDADES|UNIDADE|UNID|UBID|UNI|UN)\b/gi)];
    const quantity = quantities.length === 1 ? Number(quantities[0][1].replace(",", ".")) : null;
    const warnings = [];
    if (quantity === null || !Number.isSafeInteger(quantity) || quantity <= 0) warnings.push("Quantidade ausente, ambígua ou inválida.");
    if (lines.some(line => line.sku === sku)) warnings.push("SKU repetido: manter contextos separados e revisar possível duplicidade.");
    const normalizedTail = fold(tail);
    const client = /\b(CLIENTE|CLI|CLIE)\b/.test(normalizedTail);
    const kind = /\bAJUSTE\b/.test(fold(text)) ? "ADJUSTMENT" : "REPLENISHMENT";
    const priority = kind === "ADJUSTMENT" ? 4 : client ? 1 : /\b(URGENTE|URGENCIA)\b/.test(normalizedTail) ? 2 : 3;
    if (kind === "ADJUSTMENT") warnings.push("Ajuste requer verificação e autorização; sentido da movimentação não informado.");
    lines.push({ sku, quantity, client, priority, kind, original: text, observation: tail.trim(), sourceLine: index + 1, confidence: warnings.length ? "REVIEW" : "EXPLICIT", warnings });
  });
  lines.sort((first, second) => first.priority - second.priority || first.sourceLine - second.sourceLine);
  return { original, lines, review, kind: "REQUEST" };
}
