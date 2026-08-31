# Relatório - Manutenção Segura do Banco

## Objetivo

Foi criada a base da Manutenção Segura do Banco para reduzir peso no Supabase sem apagar dados reais por engano.

## Regras Aplicadas

- Acesso restrito ao administrador geral.
- Toda limpeza exige prévia.
- A execução exige digitar `LIMPAR`.
- Toda ação usa `warehouse_code` ou IDs específicos.
- Registros sem `warehouse_code` entram como revisão manual.
- Transferências reais não são apagadas.
- Reposições reais não são apagadas.
- Usuários com histórico são arquivados, não removidos.
- Base de estoque ativa atual não é removida.

## Tabelas Verificadas

- `wms_stock_positions`
- `wms_stock_import_batches`
- `wms_notifications`
- `wms_replenishment_requests`
- `wms_transfers`
- `wms_transfer_items`
- `wms_users`

## Ações Automáticas Seguras

- Marcar lotes `PROCESSING` travados há mais de 2 horas como `FAILED`.
- Arquivar lotes antigos fora dos últimos 5 por estoque e origem.
- Arquivar registros inativos antigos da base de estoque.
- Arquivar duplicidades ativas idênticas, mantendo o registro mais recente.
- Arquivar notificações vistas com mais de 30 dias.
- Arquivar usuários inativos.
- Cancelar e ocultar transferências marcadas como teste por soft delete.
- Arquivar reposições de teste ou canceladas antigas.
- Remover por ID itens órfãos de transferência sem transferência ativa.

## Revisão Manual

O sistema não executa limpeza automática quando encontra:

- Registros sem `warehouse_code`.
- Base de estoque sem `codigo_material`.
- Duplicidades ativas com valores diferentes.
- Transferências ou reposições sem estoque confiável.

## Estrutura SQL

Foram adicionados campos de arquivamento quando necessário:

- `archived`
- `archived_at`
- `archived_by_id`
- `archived_by_name`

Também foi criada a tabela:

- `wms_maintenance_logs`

Ela registra prévias, execuções, erros, usuário executor, estoque, critério e quantidade afetada.

## Performance

A manutenção roda apenas quando o administrador abre a tela e solicita a prévia. As leituras usam limites por tabela e a execução acontece em lotes pequenos por ID.

## Critério de Aceite

O fluxo atende ao pedido quando a tela mostra a prévia por estoque, não limpa nada sem confirmação forte, registra logs e só executa ações seguras com filtro ou ID específico.
