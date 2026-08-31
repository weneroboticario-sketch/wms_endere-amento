# Relatorio de Auditoria Completa de Transferencias

Data: 2026-08-30

## Escopo revisado

Foi auditado o fluxo principal de Transferencias no WMS, incluindo:

- previa e criacao por importacao;
- consolidacao de SKUs repetidos;
- vinculo com Base de Estoque;
- snapshot de saldo/localizacao;
- lista leve de transferencias;
- abertura de detalhe por transferencia;
- separacao normal, parcial e falta total;
- montagem/conferencia da caixa;
- finalizacao e relatorio do lider;
- unificacao de transferencias;
- realtime incremental;
- cache local;
- compatibilidade com schema antigo;
- isolamento por `warehouse_code`.

## Erros encontrados

- O carregamento de itens podia ficar vazio quando a tabela `wms_transfer_items` possuia registros antigos sem `warehouse_code` explicito, mesmo a transferencia pai pertencendo ao estoque ativo.
- A tela podia tratar item como concluido apenas por `status`/`divergence_type`, ainda que `quantidade_separada` estivesse zerada.
- O refresh incremental tinha uma rotina de remocao local baseada em uma consulta auxiliar de IDs ativos; em instabilidade ou resposta parcial, isso podia fazer a transferencia sumir da tela.
- O schema principal nao declarava todos os campos de auditoria de importacao pedidos para `wms_transfers`.
- Alguns updates de item nao gravavam `status_operacional` e `status_divergencia` de forma explicita.
- A contagem de divergencias podia ser inflada porque somava `+1` depois de o item ja estar marcado como divergente.
- Um update de finalizacao por conferencia ainda usava chamada direta ao Supabase, sem o fallback padrao para coluna ausente.

## Correcoes aplicadas

- `fetchTransferItemsForTransfer` agora faz fallback por `transfer_id` quando o filtro por estoque retorna vazio e herda o estoque da transferencia aberta para registros antigos sem `warehouse_code`.
- A regra `isTransferItemSeparationClosed` agora exige quantidade separada real ou falta total registrada com motivo antes de tirar o item da fila de pendentes.
- O realtime incremental deixou de remover transferencias locais por consulta auxiliar de IDs ativos. Remocao continua ocorrendo por evento real de `DELETE`, `is_deleted` ou status de unificacao/cancelamento.
- Eventos realtime sem `warehouse_code` explicito agora acionam refresh controlado usando `rawWarehouseCodeValue`.
- `wms_transfer_events` permanece fora do fluxo vivo: sem realtime, sem polling e sem consulta automatica.
- `wms_transfers` passou a mapear `import_batch_id`, `import_file_name`, `imported_by_id`, `imported_by_name`, `started_at` e `finished_at`.
- `supabase-schema.sql` e `supabase-wms-compatibility-migration.sql` receberam `ADD COLUMN IF NOT EXISTS` para os campos faltantes, sem apagar ou recriar dados.
- Os updates de separacao, montagem e falta total agora gravam `status_operacional` e `status_divergencia`.
- `markTransferHasDivergence` usa fallback de schema e calcula a contagem real de itens divergentes.
- `finalizeTransferAfterConference` passou a usar `updateTransferWithSchemaFallback`.

## Schema e indices

O schema revisado contempla os campos operacionais exigidos em:

- `wms_transfers`;
- `wms_transfer_items`;
- `wms_stock_positions`;
- `wms_establishments`;
- `wms_replenishment_requests`;
- `wms_notifications`, quando usada.

Os indices exigidos para Transferencias e Base de Estoque ja existem no `supabase-schema.sql`, incluindo consultas por `warehouse_code`, `status`, `updated_at`, `transfer_id` e `codigo_material`.

## Performance

- A lista de Transferencias continua usando colunas de resumo, sem carregar todos os itens.
- Os itens sao carregados apenas ao abrir o detalhe da transferencia.
- A sugestao de saldo usa apenas os SKUs da transferencia, via `codigo_material IN (...)`.
- O realtime atualiza linhas incrementais e nao depende de `wms_transfer_events`.
- Cache local e diagnosticos nao bloqueiam a operacao quando falham.

## Multiestoque

O fluxo revisado preserva isolamento por `warehouse_code`:

- lista de transferencias filtrada pelo estoque ativo;
- abertura bloqueada quando a transferencia pertence a outro estoque;
- itens herdando estoque da transferencia quando registro antigo nao tem `warehouse_code`;
- unificacao limitada a transferencias selecionadas do mesmo estoque e mesma rota;
- usuarios atribuiveis filtrados pelo estoque ativo.

## Unificacao

A unificacao foi revisada e permanece com protecoes:

- usa somente `selectedTransferIds`;
- valida quantidade de registros selecionados;
- valida mesmo estoque;
- valida mesma rota;
- nao usa filtro amplo por origem/destino/data para arquivar origens;
- marca apenas os IDs selecionados como `UNIFICADA`;
- cria transferencia consolidada com itens novos zerados para separacao.

## Testes realizados

- Validacao de sintaxe com `node --check script.js`.
- Build de producao com `npm run build`.
- Revisao por busca do uso vivo de `wms_transfer_events`.
- Revisao de queries de lista/detalhe de Transferencias.
- Revisao dos pontos de update criticos: iniciar, separar, montar, finalizar, revalidar e unificar.

## Riscos restantes

- Testes reais com operador em celular, duas abas e Supabase realtime dependem de sessao logada e dados operacionais ativos.
- O banco real precisa estar com `supabase-schema.sql` ou a migration de compatibilidade aplicada para todos os campos auxiliares ficarem disponiveis.
- Tabelas antigas podem manter registros sem `warehouse_code`; o app agora tem fallback para a transferencia aberta, mas a correcao definitiva e backfill no banco.

## Resultado

O modulo de Transferencias ficou mais estavel para o fluxo principal: criar/importar, abrir, separar, montar, finalizar, unificar e acompanhar em tempo real sem depender de historico/eventos antigos e sem remover transferencia da tela por resposta parcial.
