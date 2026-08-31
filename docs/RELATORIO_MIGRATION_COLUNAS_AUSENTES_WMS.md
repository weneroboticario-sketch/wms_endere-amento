# Relatorio da migration de compatibilidade do WMS

## Escopo

A migration `supabase-wms-compatibility-migration.sql` acompanha o schema real usado pela aplicacao Vercel sem criar tabelas duplicadas e sem apagar dados.

## Alteracoes preparadas

- `wms_transfer_items`: snapshots de saldo/localizacao, `codigo_material`, estados operacionais e `updated_at`.
- `wms_stock_positions`: `record_hash` e `updated_at`.
- `wms_stock_import_batches`: `updated_at`, `finished_at`, `error_message` e `notes`.
- `wms_users`: `archived` e metadados de arquivamento.
- Indices de consulta incremental, estados, hash, lotes e usuarios arquivados.
- Backfill de `codigo_material` a partir de `sku`, quando disponivel.
- Lotes `PROCESSING` com mais de duas horas passam a `FAILED`, preservando a base anterior.

`alerta_saldo` permanece com o tipo atual booleano para evitar alteracao destrutiva; a mensagem textual fica em `alerta_saldo_mensagem`.

## Supabase

O projeto configurado no app e o projeto Supabase `bzqulgdtfpcmkyaldssy`. A chave anon nao e registrada neste relatorio. A migration foi preparada para execucao no SQL Editor desse projeto e ainda depende da confirmacao/execucao no ambiente remoto.

## Compatibilidade no app

O app remove colunas ausentes apenas da leitura afetada, usa cache/fallback controlado e nao consulta `wms_transfer_events` no fluxo vivo. Login, Transferencias, Reposicao, Base de Estoque e Usuarios continuam operacionais enquanto a migration nao for executada.

## Testes locais

- `node --check script.js`: aprovado.
- `npm run build`: aprovado.
- `git diff --check`: aprovado.

## Riscos restantes

Enquanto a migration nao for executada no Supabase real, o Diagnostico pode continuar listando colunas ausentes e recursos novos do banco permanecem indisponiveis. A execucao e idempotente e nao remove registros.
