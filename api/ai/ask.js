import { askOpenAi, canUseAiRole, localAiFallback, parseJsonBody, prepareAiResponse, sanitizeAiContext } from "./service.js";

export default async function handler(request, response) {
  if (!prepareAiResponse(request, response)) return;
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const body = parseJsonBody(request);
    const question = String(body.question || "").slice(0, 500);
    const warehouseCode = String(body.warehouseCode || "").slice(0, 20);
    const role = String(body.role || "").slice(0, 40);
    const context = sanitizeAiContext(body.context);

    if (!question) return response.status(400).json({ error: "missing_question" });
    if (!canUseAiRole(role)) return response.status(403).json({ error: "forbidden" });

    const answer = await askOpenAi({
      system: "Voce e um assistente consultivo de WMS. Responda curto, em portugues, usando apenas o contexto recebido. Nao mande executar exclusoes, finalizacoes, alocacoes ou acoes criticas sem confirmacao no sistema.",
      payload: { pergunta: question, estoque: warehouseCode, contexto: context },
      maxOutputTokens: 220
    });

    return response.status(200).json({
      answer: answer || localAiFallback(context)
    });
  } catch (error) {
    return response.status(200).json({ answer: "Assistente indisponivel no momento." });
  }
}
