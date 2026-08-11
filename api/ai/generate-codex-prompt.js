import { askOpenAi, buildCodexPrompt, canUseAiRole, parseJsonBody, prepareAiResponse, sanitizeAiContext } from "./service.js";

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
    const issue = String(body.issue || body.question || "").slice(0, 800);
    const context = sanitizeAiContext(body.context);

    if (!canUseAiRole(role)) return response.status(403).json({ error: "forbidden" });
    if (!issue) return response.status(400).json({ error: "missing_issue" });

    const fallbackPrompt = buildCodexPrompt({ issue, warehouseCode, context });
    const aiPrompt = await askOpenAi({
      system: "Voce gera prompts tecnicos para Codex. Use portugues, estrutura fixa e criterios de aceite. Nao inclua chaves, tokens ou dados sensiveis. Nao execute a correcao.",
      payload: { problema: issue, estoque: warehouseCode, contexto: context, formato: fallbackPrompt },
      maxOutputTokens: 420
    });

    return response.status(200).json({ prompt: aiPrompt || fallbackPrompt });
  } catch (error) {
    return response.status(200).json({
      prompt: "Contexto:\nWMS Enderecamento de Estoque.\n\nProblema observado:\nNao foi possivel gerar o prompt automaticamente.\n\nCorrecao esperada:\nRevisar o erro informado, preservar regras aprovadas e validar com build."
    });
  }
}
