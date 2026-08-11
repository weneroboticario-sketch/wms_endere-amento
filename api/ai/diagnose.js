import { askOpenAi, canUseAiRole, localAiFallback, parseJsonBody, prepareAiResponse, sanitizeAiContext } from "./service.js";

export default async function handler(request, response) {
  if (!prepareAiResponse(request, response)) return;
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const body = parseJsonBody(request);
    const role = String(body.role || "").slice(0, 40);
    const warehouseCode = String(body.warehouseCode || "").slice(0, 20);
    const context = sanitizeAiContext(body.context);

    if (!canUseAiRole(role)) return response.status(403).json({ error: "forbidden" });

    const answer = await askOpenAi({
      system: "Voce e um diagnostico consultivo de WMS. Analise somente o resumo recebido, liste gargalos provaveis e recomende verificacoes seguras. Nao execute nem recomende delete amplo.",
      payload: { estoque: warehouseCode, diagnostico: context },
      maxOutputTokens: 260
    });

    return response.status(200).json({
      answer: answer || localAiFallback(context, "Diagnostico local pronto. Revise tempos, erros recentes, cache e quantidade de registros no painel de Manutencao.")
    });
  } catch (error) {
    return response.status(200).json({ answer: "Diagnostico indisponivel no momento." });
  }
}
