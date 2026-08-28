# Relatorio - Correcao de idempotencia da Reposicao

## Causa do erro

O modulo Pedidos de Reposicao grava pedidos na tabela real `public.wms_replenishment_requests`.
O erro `column wms_replenishment_requests.idempotency_key does not exist` ocorre quando o codigo em producao tenta enviar `idempotency_key`, mas o schema aplicado no Supabase real ainda esta antigo.

## Migration criada/atualizada

Os arquivos `supabase-schema.sql`, `supabase-replenishment-schema.sql` e `supabase-replenishment-migration.sql` foram atualizados para garantir, na tabela existente, as colunas:

- `idempotency_key text`
- `client_action_id text`
- `created_by_id text`
- `updated_at timestamptz default now()`
- `warehouse_code text default 'VDCG'`

Tambem foram adicionados indices para leitura e idempotencia:

- `idx_replenishment_requests_warehouse_status`
- `idx_replenishment_requests_warehouse_codigo`
- `idx_replenishment_requests_idempotency`
- `uq_replenishment_requests_idempotency`

O indice unico de idempotencia ignora valores vazios para nao travar bancos que ja possuem registros antigos sem chave preenchida.

Tambem foi criado o arquivo `supabase-replenishment-idempotency-hotfix.sql` com o pacote minimo para executar diretamente no SQL Editor do Supabase real.

## Tabela confirmada

A tabela usada pelo modulo de Reposicao continua sendo:

`public.wms_replenishment_requests`

Nao foi criada outra tabela de reposicao.

## Codigo ajustado

Na criacao de pedido, o app:

- gera `idempotency_key` antes de salvar;
- envia `warehouse_code`, `codigo_material`, quantidades, solicitante, status e metadados de criacao;
- reutiliza a mesma chave enquanto a acao do botao esta em andamento;
- consulta pedido existente quando ocorre duplicidade;
- evita loop quando o Supabase ainda esta com coluna ausente;
- registra o ultimo erro de criacao no Diagnostico do Sistema.

## Diagnostico administrativo

Foi adicionada a funcao SQL `public.wms_replenishment_schema_diagnostics()` e o Diagnostico do Sistema passou a mostrar:

- URL Supabase em uso, sem exibir chave;
- existencia de `idempotency_key`;
- existencia de `warehouse_code`;
- existencia de `client_action_id`;
- existencia de `created_by_id`;
- existencia de `updated_at`;
- existencia dos indices de idempotencia;
- ultimo erro de criacao de pedido.

## Verificacao no Supabase

Depois de executar `supabase-replenishment-idempotency-hotfix.sql` ou `supabase-schema.sql` no SQL Editor do projeto correto, validar:

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'wms_replenishment_requests'
  and column_name = 'idempotency_key';
```

Resultado esperado: uma linha com `idempotency_key`.

Tambem validar:

```sql
select public.wms_replenishment_schema_diagnostics();
```

Resultado esperado: `idempotency_key`, `warehouse_code` e `uq_replenishment_requests_idempotency` como `true`.

## Supabase correto

Nao ha `.env` local no repositorio com `VITE_SUPABASE_URL`.
Em producao, a URL efetiva vem das variaveis da Vercel ou da configuracao salva no app.
O Diagnostico do Sistema agora mostra a URL publica em uso para comparar com o projeto Supabase onde a migration foi executada.

## Testes realizados

- `node --check script.js`
- `npm run build`

## Riscos restantes

- A coluna so passa a existir no Supabase real depois que `supabase-schema.sql` for executado no SQL Editor do projeto correto.
- Se o SQL for executado em outro projeto Supabase, o site continuara apontando para o banco antigo e o diagnostico indicara schema pendente.
