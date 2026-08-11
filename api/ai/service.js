export function parseJsonBody(request) {
  if (typeof request.body === "string") return JSON.parse(request.body || "{}");
  return request.body || {};
}

export function prepareAiResponse(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Cache-Control", "no-store");
  if (request.method === "OPTIONS") {
    response.status(204).end();
    return false;
  }
  return true;
}

export function canUseAiRole(role) {
  return ["ADMINISTRADOR", "SUPERVISOR"].includes(String(role || ""));
}

export function sanitizeAiContext(context) {
  const safe = context && typeof context === "object" ? context : {};
  return {
    title: String(safe.title || "").slice(0, 120),
    summary: String(safe.summary || "").slice(0, 1000),
    items: Array.isArray(safe.items) ? safe.items.slice(0, 24).map((item) => String(item).slice(0, 240)) : [],
    metrics: sanitizeMetrics(safe.metrics),
    module: String(safe.module || "").slice(0, 80)
  };
}

export function localAiFallback(context, fallback) {
  if (fallback) return fallback;
  if (context.summary) return context.summary;
  return "Assistente consultivo preparado. Configure OPENAI_API_KEY no backend para respostas mais elaboradas.";
}

export async function askOpenAi({ system, payload, maxOutputTokens = 260 }) {
  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) return "";

  const aiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(payload) }
      ],
      max_output_tokens: maxOutputTokens
    })
  });

  if (!aiResponse.ok) return "";
  const data = await aiResponse.json();
  return extractResponseText(data);
}

export function buildCodexPrompt({ issue, warehouseCode, context }) {
  const safeIssue = String(issue || "").trim() || "Problema operacional observado no WMS.";
  const moduleName = context.module || inferModuleFromIssue(safeIssue);
  const lines = [
    "Contexto:",
    "Sistema WMS Enderecamento de Estoque publicado na Vercel, usando Supabase e estoque ativo " + (warehouseCode || "-") + ".",
    "",
    "Problema observado:",
    safeIssue,
    "",
    "Modulo afetado:",
    moduleName,
    "",
    "Regra que nao pode quebrar:",
    "- Nao misturar dados entre estoques.",
    "- Nao quebrar Login, Usuarios, Enderecamento, Transferencias, Supabase ou exportacao Videmais.",
    "- IA e diagnosticos nao executam acoes criticas sem confirmacao do usuario.",
    "",
    "Contexto tecnico disponivel:",
    context.summary || "- Sem resumo adicional.",
    ...(context.items || []).slice(0, 10).map((item) => "- " + item),
    "",
    "Correcao esperada:",
    "Investigar a causa, corrigir somente o necessario, preservar as regras aprovadas e validar com build.",
    "",
    "Criterios de aceite:",
    "- O erro informado deixa de acontecer.",
    "- O fluxo principal do modulo afetado continua funcionando.",
    "- Dados permanecem isolados por warehouse_code.",
    "- Nenhuma chave secreta fica exposta no frontend.",
    "- Build final roda sem erro."
  ];
  return lines.join("\n");
}

function sanitizeMetrics(metrics) {
  const safe = metrics && typeof metrics === "object" ? metrics : {};
  return Object.fromEntries(Object.entries(safe).slice(0, 20).map(([key, value]) => [
    String(key).slice(0, 60),
    typeof value === "number" || typeof value === "boolean" ? value : String(value || "").slice(0, 160)
  ]));
}

function inferModuleFromIssue(issue) {
  const text = String(issue || "").toLowerCase();
  if (text.includes("sku") || text.includes("endere") || text.includes("prateleira") || text.includes("alocar")) return "Enderecamento";
  if (text.includes("transfer") || text.includes("caixa") || text.includes("separ") || text.includes("lacre")) return "Transferencias";
  if (text.includes("login") || text.includes("senha") || text.includes("usuario")) return "Login e Usuarios";
  if (text.includes("supabase") || text.includes("schema") || text.includes("banco")) return "Supabase";
  return "WMS";
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
