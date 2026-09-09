# Relatorio tecnico - Consultas operacionais pela CAPTACAO

Data: 2026-09-09

## Objetivo

Trocar a fonte operacional de localizacao/retirada do WMS antigo para a Base CAPTACAO. A partir desta revisao, Consulta SKU, Transferencias e Reposicao passam a usar `wms_stock_positions` por `warehouse_code` do estoque ativo. CAPTACAO e a fonte principal de localizacao e retirada; LOJA continua alimentada para consulta de produto, saldo da loja e regra de reposicao.

## Consultas WMS removidas do fluxo vivo

- Consulta SKU deixou de usar `wms_bindings` como fonte de localizacao.
- Transferencias deixaram de buscar localizacao pelo enderecamento manual.
- Reposicao deixou de exibir endereco WMS como referencia de localizacao.
- Dashboard deixou de contar vinculos manuais como indicador operacional.
- Alertas do dashboard deixaram de cobrar manutencao de enderecamento manual.

## Consultas movidas para CAPTACAO

- Consulta SKU busca o SKU em `wms_stock_positions`.
- Transferencias buscam somente os SKUs da transferencia no estoque ativo.
- Reposicao busca o SKU solicitado em LOJA e CAPTACAO: LOJA indica necessidade, CAPTACAO indica saldo/localizacao de retirada.
- Alertas de estoque usam CAPTACAO ativa para saldo negativo e falta de localizacao, mantendo saldo LOJA como apoio consultivo.
- Base de Estoque lista e importa lotes CAPTACAO e LOJA do estoque atual.

## Telas ajustadas

- Menu principal: Prateleira, Alocar Produto e Etiquetas foram ocultados do fluxo operacional.
- Dashboard: atalhos antigos foram ocultados e os indicadores passaram a falar em CAPTACAO.
- Consulta SKU: tabela legada de enderecamento foi ocultada; o card operacional mostra saldo fisico, alocado, disponivel e localizacao CAPTACAO.
- Transferencias: snapshot e orientacao de retirada mostram saldo, retirada, faltante e localizacao CAPTACAO.
- Reposicao: novo pedido, fila, modal de sugestao e cards mostram saldo LOJA e saldo/localizacao CAPTACAO.
- Saude do Sistema: indicadores principais deixaram de apresentar Enderecamento como modulo operacional.

## Services alterados

- `getStockPositionsForSkus` busca CAPTACAO e LOJA ativas por estoque para o mesmo SKU.
- `buildStockSuggestion` calcula retirada, faltante e origem sugerida somente com saldo CAPTACAO.
- `getTransferStockSuggestion` usa a CAPTACAO para enriquecer itens importados e abertos.
- `getReplenishmentSuggestions` busca candidatos da LOJA abaixo de 3 e cruza com CAPTACAO paginada, sem carregar toda a base na tela.
- `getStockAlerts` cruza LOJA e CAPTACAO; `generateNegativeStockAlerts` permanece voltado para alertas da fonte importada.

## Impacto por modulo

Consulta SKU:
- SKU existente mostra produto, saldo fisico, saldo alocado, saldo disponivel e localizacao CAPTACAO.
- SKU sem registro mostra "Produto nao encontrado na base da CAPTACAO."
- SKU com saldo negativo ou sem localizacao gera alerta operacional.

Transferencias:
- Origem sugerida agora segue CAPTACAO, CAPTACAO_PARCIAL, SEM_SALDO_CAPTACAO ou NAO_ENCONTRADO_CAPTACAO.
- Colunas antigas de localizacao WMS continuam preservadas por compatibilidade, mas sao gravadas neutras e nao alimentam a tela.
- Localizacao so aparece quando existe snapshot CAPTACAO valido.

Reposicao:
- Pedido novo usa saldo LOJA informado.
- Sugestao automatica nasce quando LOJA esta abaixo de 3; a quantidade sugerida e limitada pelo saldo disponivel na CAPTACAO.
- Localizacao exibida vem das partes de CAPTACAO.
- Importacao de Estoque Loja permanece disponivel na Base de Estoque; somente a localizacao operacional deixou de vir do WMS manual.

## Banco e performance

Foram adicionados ao `supabase-schema.sql` e aplicados no Supabase real:

- `idx_wms_stock_positions_captacao_sku`
- `idx_wms_stock_positions_captacao_location`
- `idx_wms_stock_positions_captacao_updated`

Esses indices aceleram consulta por SKU, localizacao e ultima atualizacao da CAPTACAO.

## Dados preservados

Nenhuma tabela antiga foi apagada. A importacao de Estoque Loja permanece ativa e necessaria para consulta de produto/saldo e reposicao. `wms_bindings` e campos de localizacao WMS permanecem no schema para compatibilidade, mas deixam de ser fonte operacional de localizacao.

## Riscos restantes

- Registros antigos de Reposicao podem ter sido criados com dados WMS antes desta mudanca. A tela agora evita usar esse valor quando nao ha partes de CAPTACAO.
- Telas antigas permanecem no codigo para compatibilidade tecnica, mas estao ocultas e bloqueadas pela navegacao.
- Uma futura limpeza segura pode arquivar ou remover dados legados depois da validacao operacional.

## Testes

Executar apos a alteracao:

- `node --check script.js`
- `npm run build`
- `git diff --check`

Tambem validar manualmente no app:

- Login.
- Troca de estoque.
- Consulta SKU existente e inexistente.
- Importacao CAPTACAO.
- Criacao e abertura de transferencia.
- Reposicao por SKU e por sugestao.
