# Relatorio de estabilizacao do schema WMS

## Escopo

Estabilizacao idempotente do banco operacional, sem recriar tabelas existentes, remover dados ou adicionar telas operacionais.

## Correcoes aplicadas

- `wms_transfers`: `import_source`, dados do lote de importacao e `updated_at`, com transferencias antigas preenchidas como `MANUAL`.
- `wms_stock_import_batches`: estatisticas de insercao, atualizacao, inalterados, desativados, ignorados, erros, negativos e alertas, alem de timestamps e mensagem de erro.
- `wms_establishments`: `codigo_loja`, `codigo_interno`, `cnpj`, `sigla`, `canal`, `active` e `updated_at`, com aproveitamento de campos de codigo legados quando existentes.
- `wms_transfer_items`, `wms_stock_positions` e `wms_users`: snapshots, hash, timestamps e arquivamento ja previstos pela operacao atual.
- Lotes `PROCESSING` sem atualizacao por mais de duas horas foram encerrados como `FAILED`, sem apagar seus registros.

## Controle de versao

Foi criada a tabela `wms_schema_version` e registrada a versao `2026.08.30.001`.
O Diagnostico do Sistema compara essa versao com a esperada pelo codigo e informa quando houver migration pendente.

## Indices

Foram criados, com `IF NOT EXISTS`, indices para transferencias por estoque/status, origem de importacao, itens por transferencia/SKU, lotes de estoque, estabelecimentos e controle de versao.

## Supabase

A migration foi executada no projeto real usado pela aplicacao Vercel: `bzqulgdtfpcmkyaldssy`.
O retorno final confirmou uma linha em `wms_schema_version` com a versao `2026.08.30.001`.
Nenhuma chave sensivel foi registrada neste documento.

## Compatibilidade do app

As consultas de Transferencias, Base de Estoque e estabelecimentos continuam usando fallback controlado para colunas antigas. O Realtime permanece restrito as tabelas operacionais atuais e tabelas opcionais ausentes nao entram em loop de erro.

O campo legado `alerta_saldo` permanece boolean para evitar alteracao destrutiva de tipo; mensagens textuais ficam em `alerta_saldo_mensagem`.

## Validacao

- `node --check script.js`: aprovado.
- `npm run build`: aprovado.
- `git diff --check`: aprovado.
- Migration executada no Supabase correto: aprovada.
- Versao registrada e consultada no SQL Editor: aprovada.

## Risco restante

O build continua emitindo apenas o aviso nao bloqueante de bundle principal acima de 500 kB. Nao ha erro de schema pendente conhecido apos a migration.
