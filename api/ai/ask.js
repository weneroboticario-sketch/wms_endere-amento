export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : (request.body || {});
    const question = String(body.question || "").slice(0, 500);
    const warehouseCode = String(body.warehouseCode || "").slice(0, 20);
    const role = String(body.role || "").slice(0, 40);
    const context = sanitizeContext(body.context);

    if (!question) return response.status(400).json({ error: "missing_question" });
    if (!["ADMINISTRADOR", "SUPERVISOR"].includes(role)) {
      return response.status(403).json({ error: "forbidden" });
    }

    const apiKey = process.env.OPENAI_API_KEY || "";
    if (!apiKey) {
      return response.status(200).json({
        answer: context.summary || "Assistente consultivo preparado. Configure OPENAI_API_KEY no backend para respostas mais elaboradas."
      });
    }

    const aiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        input: [
          {
            role: "system",
            content: "Voce e um assistente consultivo de WMS. Responda curto, em portugues, usando apenas o contexto recebido. Nao mande executar exclusoes, finalizacoes, alocacoes ou acoes criticas sem confirmacao no sistema."
          },
          {
            role: "user",
            content: JSON.stringify({
              pergunta: question,
              estoque: warehouseCode,
              contexto: context
            })
          }
        ],
        max_output_tokens: 220
      })
    });

    if (!aiResponse.ok) {
      return response.status(200).json({ answer: context.summary || "Assistente indisponivel no momento." });
    }

    const data = await aiResponse.json();
    return response.status(200).json({ answer: extractResponseText(data) || context.summary || "Sem resposta adicional." });
  } catch (error) {
    return response.status(200).json({ answer: "Assistente indisponivel no momento." });
  }
}

function sanitizeContext(context) {
  const safe = context && typeof context === "object" ? context : {};
  return {
    title: String(safe.title || "").slice(0, 120),
    summary: String(safe.summary || "").slice(0, 800),
    items: Array.isArray(safe.items) ? safe.items.slice(0, 20).map((item) => String(item).slice(0, 220)) : []
  };
}

function extractResponseText(data) {
  if (typeof data.output_text === "string") return data.output_text.trim();
  const output = Array.isArray(data.output) ? data.output : [];
  return output.flatMap((item) => Array.isArray(item.content) ? item.content : [])
    .map((part) => part && (part.text || part.output_text || ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}
