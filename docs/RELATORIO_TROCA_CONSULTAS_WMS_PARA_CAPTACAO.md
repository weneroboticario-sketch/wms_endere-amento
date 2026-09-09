# Relatorio tecnico - Consultas operacionais pela CAPTACAO

Data: 2026-09-09

## Objetivo

Trocar a fonte operacional do WMS antigo para a Base CAPTACAO. A partir desta revisao, Consulta SKU, Transferencias e Reposicao passam a usar `wms_stock_positions` com `source_type = 'CAPTACAO'`, `active = true` e `warehouse_code` do estoque ativo.

## Consultas WMS removidas do fluxo vivo

- Consulta SKU deixou de usar `wms_bindings` como fonte de localizacao.
- Transferencias deixaram de buscar localizacao pelo enderecamento manual.
- Reposicao deixou de exibir endereco WMS e saldo loja como referencia principal.
- Dashboard deixou de contar vinculos manuais como indicador operacional.
- Alertas do dashboard deixaram de cobrar manutencao de enderecamento manual.

## Consultas movidas para CAPTACAO

- Consulta SKU busca o SKU em `wms_stock_positions`.
- Transferencias buscam somente os SKUs da transferencia no estoque ativo.
- Reposicao busca o SKU solicitado e gera sugestoes usando saldo CAPTACAO.
- Alertas de estoque usam CAPTACAO ativa para saldo negativo, saldo baixo e falta de localizacao.
- Base de Estoque lista e conta lotes CAPTACAO do estoque atual.

## Telas ajustadas

- Menu principal: Prateleira, Alocar Produto e Etiquetas foram ocultados do fluxo operacional.
- Dashboard: atalhos antigos foram ocultados e os indicadores passaram a falar em CAPTACAO.
- Consulta SKU: tabela legada de enderecamento foi ocultada; o card operacional mostra saldo fisico, alocado, disponivel e localizacao CAPTACAO.
- Transferencias: snapshot e orientacao de retirada mostram saldo, retirada, faltante e localizacao CAPTACAO.
- Reposicao: novo pedido, fila, modal de sugestao e cards mostram saldo/localizacao CAPTACAO.
- Saude do Sistema: indicadores principais deixaram de apresentar Enderecamento como modulo operacional.

## Services alterados

- `getStockPositionsForSkus` filtra apenas CAPTACAO ativa por estoque.
- `buildStockSuggestion` calcula retirada, faltante e origem sugerida somente com saldo CAPTACAO.
- `getTransferStockSuggestion` usa a CAPTACAO para enriquecer itens importados e abertos.
- `getReplenishmentSuggestions` busca candidatos na CAPTACAO paginada, sem carregar toda a base.
- `getStockAlerts` e `generateNegativeStockAlerts` passaram a trabalhar com CAPTACAO.

## Impacto por modulo

Consulta SKU:
- SKU existente mostra produto, saldo fisico, saldo alocado, saldo disponivel e localizacao CAPTACAO.
- SKU sem registro mostra "Produto nao encontrado na base da CAPTACAO."
- SKU com saldo negativo ou sem localizacao gera alerta operacional.

Transferencias:
- Origem sugerida agora segue CAPTACAO, CAPTACAO_PARCIAL, SEM_SALDO_CAPTACAO ou NAO_ENCONTRADO_CAPTACAO.
- Colunas antigas de loja/WMS continuam preservadas por compatibilidade, mas sao gravadas neutras e nao alimentam a tela.
- Localizacao so aparece quando existe snapshot CAPTACAO valido.

Reposicao:
- Pedido novo usa saldo CAPTACAO informado.
- Localizacao exibida vem das partes de CAPTACAO.
- Sugestoes automaticas nao usam mais loja negativa/zerada como regra.

## Banco e performance

Foram adicionados ao `supabase-schema.sql` e aplicados no Supabase real:

- `idx_wms_stock_positions_captacao_sku`
- `idx_wms_stock_positions_captacao_location`
- `idx_wms_stock_positions_captacao_updated`

Esses indices aceleram consulta por SKU, localizacao e ultima atualizacao da CAPTACAO.

## Dados preservados

Nenhuma tabela antiga foi apagada. `wms_bindings`, campos de saldo loja e campos de localizacao WMS permanecem no schema para compatibilidade, mas deixam de ser fonte operacional dos modulos principais.

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
