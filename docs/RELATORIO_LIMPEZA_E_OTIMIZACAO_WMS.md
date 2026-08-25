# Relatorio de limpeza e otimizacao do WMS

Data: 24/08/2026

## Objetivo

Remover telas, cards, rotas e consultas que nao fazem mais parte da operacao principal do WMS, mantendo o sistema focado em enderecamento, reposicao, transferencias, multiestoque, Supabase e sincronizacao.

## Removido da interface

- Menu Conferencias.
- Menu Assistente WMS.
- Menu Historico.
- Card Conferencias pendentes no Dashboard.
- Painel Total por Area Linha Separacao no Dashboard.
- Painel Ultimos enderecamentos no Dashboard.
- Tela Conferencias.
- Tela Historico.
- Tela Assistente WMS.
- Botao Diagnostico IA da Manutencao.
- Coluna Conferencias na tela de Estoques.

## Adicionado ao Dashboard leve

- Consulta rapida de SKU respeitando o estoque ativo.
- Retorno compacto com SKU, produto e endereco principal.
- Limpeza automatica do campo apos localizar para facilitar bipagem sequencial.

## Removido do carregamento automatico

- SELECT automatico de `wms_history` no carregamento principal do app.
- SELECT automatico de `wms_conferences`, `wms_conference_items` e `wms_conference_events`.
- Cache local `conferenceData`.
- Metricas de conferencias no diagnostico operacional.
- Rotas serverless de IA em `api/ai`.

## Mantido em funcionamento

- Login e sessoes.
- Usuarios e permissoes.
- Multiestoque VDCG, VDAR, VDSI e VDCO.
- Consulta SKU.
- Prateleira.
- Alocar Produto.
- Importar Excel de enderecamento.
- Exportar Excel no modelo operacional.
- Base de Estoque.
- Pedidos de Reposicao.
- Transferencias e Minhas Tarefas.
- Painel do Lider dentro de Transferencias.
- Supabase.
- Realtime de transferencias, notificacoes e reposicao.
- Diagnostico do Sistema sem IA.
- Manutencao segura.

## Tabelas preservadas no Supabase

Nenhuma tabela foi apagada. As tabelas abaixo podem permanecer no banco por historico ou compatibilidade, mas nao sao mais chamadas automaticamente pela interface limpa:

- `wms_history`
- `wms_conferences`
- `wms_conference_items`
- `wms_conference_events`
- `wms_conference_divergences`

## Observacoes tecnicas

- O historico tecnico ainda pode ser gravado por rotinas internas quando necessario, mas nao existe mais tela de consulta nem carregamento inicial desse modulo.
- O fluxo de Transferencias foi preservado. Nomes internos com a palavra "conference" que pertencem ao relatorio/finalizacao da transferencia foram mantidos quando ainda eram usados pelo processo operacional.
- A Area Linha Separacao continua existindo no modulo de Enderecamento/Excel quando necessaria para o modelo VDMais, mas nao volta ao Dashboard como card ou totalizador.

## Validacao

- `npm run build` executado com sucesso.
- O Vite apenas alertou sobre chunk grande, sem falha de compilacao.
