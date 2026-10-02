# Relatorio do perfil ATENDENTE

Data da revisao: 01/10/2026

## Objetivo

Adicionar o perfil `ATENDENTE` para as pessoas da loja, restrito a:

- consultar SKU no estoque permitido;
- consultar saldos e localizacao da CAPTACAO;
- criar solicitacoes de produto dos tipos Reposicao e Cliente;
- acompanhar somente os pedidos criados pelo proprio atendente no estoque ativo.

O perfil nao recebe acesso a enderecamento, transferencias, importacao, exportacao, base de estoque, etiquetas, usuarios, manutencao, saude do sistema ou configuracoes.

## Falhas encontradas antes da implementacao

1. A aprovacao de solicitacao ignorava `role_requested` e criava sempre um `OPERADOR`.
2. A policy generica de `UPDATE` de `wms_replenishment_requests` verificava somente o estoque. Qualquer perfil autenticado do estoque poderia tentar alterar o fluxo pela API.
3. A coluna `prioridade` aceitava qualquer texto, era sempre gravada como `NORMAL` e nao influenciava a fila.

Durante a revisao tambem foi confirmado que `wms_bindings` e `wms_stock_positions` herdavam policies genericas de `INSERT/UPDATE` sem restricao de perfil. Essas escritas agora exigem `ADMINISTRADOR`, `SUPERVISOR` ou `OPERADOR`.

## Banco de dados

Migration criada:

`supabase/migrations/20261001143352_atendente_profile_and_priority.sql`

Alteracoes principais:

- leitura de catalogo e metadados liberada para `ATENDENTE`;
- leitura operacional continua isolada por `warehouse_code`;
- `ATENDENTE` pode inserir e consultar pedidos do estoque permitido;
- `UPDATE` de reposicao exige perfil operacional;
- escritas em enderecamento e posicoes de estoque bloqueiam `ATENDENTE`;
- `prioridade` aceita somente `NORMAL` e `CLIENTE`;
- dados antigos invalidos sao normalizados para `NORMAL`;
- indice de fila por estoque, status, prioridade e data;
- solicitacao anonima aceita somente `OPERADOR` ou `ATENDENTE`;
- supervisor pode ler e editar operadores e atendentes apenas nos proprios estoques;
- schema registrado como `2026.10.01.007` após a migration de solicitação de cancelamento;
- cache do PostgREST recarregado ao final da migration.

## Front-end

- `ATENDENTE` foi registrado na lista de perfis.
- As unicas telas liberadas sao Consulta SKU e Pedidos de Reposicao.
- O formulario permite escolher Reposicao (`NORMAL`) ou Cliente (`CLIENTE`).
- O atalho da Consulta SKU e o modal de sugestao preservam a prioridade escolhida.
- A visao do atendente mostra apenas "Meus pedidos deste estoque" e nao renderiza botoes operacionais.
- Pedidos de Cliente recebem destaque e aparecem primeiro dentro do mesmo status para a equipe operacional.
- A solicitacao de acesso permite escolher Operador de estoque ou Atendente de loja.
- Administradores e supervisores podem cadastrar, filtrar e vincular atendentes a um supervisor.
- Atendentes sao sempre gravados como indisponiveis para tarefas operacionais.

## Edge Function

A funcao `manage-wms-user` agora permite que um supervisor crie, edite e redefina a senha de `OPERADOR` e `ATENDENTE` quando o estoque atual e o estoque de destino pertencem ao supervisor.

Continuam bloqueados:

- criacao em outro estoque;
- edicao de colaborador de outro estoque;
- promocao para `SUPERVISOR` ou `ADMINISTRADOR`;
- uso de `available_for_tasks` por `ATENDENTE`.

## Testes executados

- `npm run build`
- `npm test`
- `npx eslint script.js src tests api scripts vite.config.js eslint.config.js`
- `npx deno check supabase/functions/manage-wms-user/index.ts`
- aplicacao de todas as migrations em PostgreSQL local embarcado com PGlite;
- reaplicacao da migration nova para confirmar idempotencia;
- simulacao RLS de `ATENDENTE` VDCG com `is_global_admin = true` indevido;
- leitura VDCG e bloqueio de leitura VDCO nas tabelas operacionais;
- criacao de pedido `CLIENTE` e bloqueio de claim/update;
- bloqueio de insert/update/delete em `wms_bindings`;
- regressao de escrita para ADMINISTRADOR, SUPERVISOR e OPERADOR;
- supervisor gerenciando atendente VDCG e sendo bloqueado no VDCO.

O roteiro `supabase/tests/rls.sql` tambem foi ampliado para repetir as verificacoes numa branch Supabase descartavel. O teste sempre termina com `ROLLBACK`.

## Ordem de implantacao

1. Aplicar a migration `20261001143352_atendente_profile_and_priority.sql`.
2. Confirmar `wms_schema_version.version = '2026.10.01.007'`.
3. Publicar a Edge Function `manage-wms-user` incluindo `index.ts` e `permissions.ts`.
4. Publicar o front-end.
5. Recarregar o aplicativo para ativar o cache estatico `wms-static-v12`.

A migration deve entrar antes do front e da Edge Function. Assim o navegador nunca tenta usar o novo perfil ou a prioridade `CLIENTE` contra um schema antigo.

## Roteiro manual final

1. Criar um `ATENDENTE` vinculado somente ao VDCG.
2. Entrar com esse usuario e confirmar que o menu mostra apenas Consulta SKU e Pedidos de Reposicao.
3. Consultar um SKU e validar saldo Loja, CAPTACAO e localizacao.
4. Criar um pedido `CLIENTE` e confirmar que ele aparece em "Meus pedidos deste estoque".
5. Entrar como OPERADOR VDCG e confirmar que o pedido Cliente aparece destacado antes dos pedidos NORMAL do mesmo status.
6. Tentar acessar uma URL/tela operacional e confirmar o redirecionamento para Consulta SKU.
7. Repetir a consulta com dados existentes somente no VDCO e confirmar que nenhum registro operacional e retornado.

## Validacao pendente em producao

Nao foram executados nesta entrega:

- migration no projeto Supabase real;
- deploy real da Edge Function;
- publicacao real do front-end;
- login real com identidade Auth ATENDENTE;
- teste visual em aparelhos reais com dados de producao.

Essas acoes ficaram deliberadamente fora da execucao para respeitar a exigencia de revisar o plano antes de alterar policies de producao.
