# Auditoria XSS

Data: 23/09/2026

## Escopo

Foram pesquisados todos os usos de `innerHTML`, `insertAdjacentHTML`, atributos `data-*`, conteúdo vindo do Supabase, planilhas XLSX e XML. O levantamento inicial encontrou 142 sinks de HTML no `script.js`.

## Proteções aplicadas

- `escapeHtml` agora retorna string vazia para `null` e `undefined`.
- O catálogo, nomes, SKUs, endereços, usuários, observações, transferências, divergências, conferências, reposições e resultados de importação continuam escapados antes de entrar nos templates.
- Foi instalada uma política Trusted Types padrão respaldada por DOMPurify. Em navegadores compatíveis, toda atribuição legada a `innerHTML` passa pela sanitização, inclusive templates montados em múltiplas linhas.
- `insertAdjacentHTML` foi removido do resumo da transferência e substituído por `createElement` e `textContent`.
- A lista compacta `transferWorkRows` usa `textContent`.
- IDs em atributos permanecem escapados e IDs novos usam `crypto.randomUUID()` com fallback.
- A CSP impede scripts inline/não autorizados, objetos incorporados e framing.

## Pontos revisados

| Área | Origem dos dados | Proteção |
| --- | --- | --- |
| Usuários e solicitações | Supabase | colunas explícitas, `escapeHtml`, DOMPurify e RLS |
| Base de estoque e importações | XLSX/Supabase | `escapeHtml`, DOMPurify e paginação |
| Transferências | XLSX/XML/Supabase | `escapeHtml`; sinks críticos convertidos para DOM seguro |
| Reposição | Supabase | `escapeHtml` e DOMPurify |
| Consulta SKU/prateleira | Supabase/catálogo | `escapeHtml` e DOMPurify |
| Conferências | XML/Supabase | `escapeHtml` e DOMPurify |
| Etiquetas | endereço gerado | valor escapado; barcode continua criado pela API JsBarcode |
| Manutenção/saúde | Supabase | `escapeHtml`, DOMPurify e acesso administrativo |

## Risco residual

Trusted Types é uma defesa adicional do Chromium. O código continua aplicando `escapeHtml` nos valores dinâmicos para manter proteção nos demais navegadores. Novos componentes devem preferir `textContent`, `createElement` e propriedades DOM; templates HTML devem ser usados apenas quando a estrutura fixa justificar.
