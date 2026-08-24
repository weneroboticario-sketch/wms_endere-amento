# Relatorio - Correcao da Unificacao de Transferencias

## Problema identificado

A unificacao de transferencias precisava garantir, de forma estrutural, que somente as transferencias marcadas pelo usuario fossem alteradas. O risco principal era qualquer operacao de arquivamento baseada em filtros amplos, como origem, destino, data, responsavel ou estoque, afetar transferencias que nao foram selecionadas.

Tambem havia risco operacional em itens de caixa: quando a quantidade principal estava gravada em `boxQty` ou `totalUnits`, a previa da unificacao podia interpretar o item como quantidade zero.

## Onde foi corrigido

Arquivos alterados:

- `script.js`
- `supabase-schema.sql`
- `docs/RELATORIO_CORRECAO_UNIFICACAO_TRANSFERENCIAS.md`

Funcoes principais revisadas:

- `selectedMergeTransferIds`
- `buildTransferMergePreview`
- `transferMergeOriginalQty`
- `transferMergeConfirmationMessage`
- `assertTransferMergePreviewSafe`
- `createMergedTransfer`
- `archiveMergedSourceTransfers`
- `rollbackMergedTransferCreation`

## Correcao aplicada

A unificacao agora opera obrigatoriamente com `selected_transfer_ids`, derivado dos checkboxes marcados na tela.

Antes de criar a transferencia unificada, o sistema valida:

- a selecao nao pode estar vazia;
- a selecao precisa ter pelo menos duas transferencias;
- todos os IDs selecionados precisam estar carregados;
- todos os registros processados precisam estar dentro de `selected_transfer_ids`;
- todos precisam pertencer ao estoque ativo;
- todos precisam ter mesma origem e mesmo destino/VD;
- transferencias finalizadas, canceladas ou ja unificadas sao bloqueadas.

## Protecao contra update amplo

O arquivamento das origens selecionadas usa somente:

- `id IN selected_transfer_ids`
- `warehouse_code = estoque ativo`

Nao existe update/delete amplo por origem, destino, data, responsavel ou status para decidir quais transferencias serao arquivadas.

Apos o update, o sistema confere:

- se o Supabase alterou mais registros que a quantidade selecionada, bloqueia;
- se alterou menos registros que a quantidade selecionada, bloqueia;
- se retornou algum ID fora da selecao, bloqueia.

## Marcacao das origens

As transferencias originais selecionadas nao sao apagadas fisicamente.

Elas passam a ser marcadas como:

- `status = UNIFICADA`
- `merged_into_id = id_da_nova_transferencia`
- `unified_into_transfer_id = id_da_nova_transferencia`
- `archived_by_unification = true`
- `merge_status = UNIFICADA`
- `updated_at = now()`

As colunas `merged_into_id` e `merge_status` foram mantidas por compatibilidade com o historico do sistema.

## Garantia para outras VDs

Transferencias de outras VDs, outros destinos, outros estoques ou nao selecionadas nao entram em `selected_transfer_ids`, portanto nao sao alteradas.

Exemplos protegidos:

- Unificar VDCG > VDAR nao altera VDCG > VDSI.
- Unificar VDCG > VDAR nao altera VDCG > VDMO.
- Uma terceira VDCG > VDAR nao selecionada continua disponivel.
- Transferencia de outro `warehouse_code` nao passa na validacao.

## Itens da transferencia unificada

A quantidade final da unificacao foi corrigida para considerar:

- `requestedQty`, quando preenchido;
- `boxQty`, quando o item e de caixa;
- `totalUnits`, como fallback operacional.

Regras mantidas:

- SKU repetido nas transferencias selecionadas soma quantidades.
- SKU existente em apenas uma transferencia mantem a quantidade original.
- Item unico nao e zerado por nao existir nas outras transferencias.
- SKU com unidade diferente exige tratamento manual.

## Tela de confirmacao

A confirmacao informa:

- quantidade de transferencias selecionadas;
- origem;
- destino/VD;
- estoque;
- total de SKUs;
- quantidade total;
- IDs/codigos selecionados;
- aviso de que somente transferencias selecionadas serao unificadas.

## Realtime e cache

Depois da unificacao, o carregamento e o realtime removem da fila somente as transferencias que foram marcadas como origem unificada.

Transferencias de outras VDs ou nao selecionadas continuam no cache do estoque correspondente e nao sao removidas globalmente.

## Testes realizados

Validacao automatica:

- `npm run build`

Testes logicos cobertos:

- bloqueio de selecao vazia;
- bloqueio de destino/VD diferente;
- bloqueio de outro estoque;
- arquivamento somente por `selected_transfer_ids`;
- conferencia da quantidade de registros retornados pelo Supabase;
- soma de quantidades para SKU repetido;
- preservacao de quantidade para SKU unico;
- leitura correta de quantidade em caixa para nao zerar item.
