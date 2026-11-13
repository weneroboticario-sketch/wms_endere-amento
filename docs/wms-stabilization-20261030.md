# WMS Endereçamento — estabilização de 30/10/2026

Base: f3069d26b928759325e9ceffdb5756795c9e48c7. Branch local: fix/wms-integracao-total-20261029.

## Alterações independentes do banco

- Atualização de DOMPurify e Vite; versões exatas e Node 24.x.
- API de configuração aceita somente chave pública/anon e não divulga chaves incompatíveis.
- Gestão de usuários mantém autenticação getUser e autorização por perfil/estoque; ausência de sessão retorna 401 antes de criar clientes. verify_jwt permanece na configuração anterior; a função valida o token explicitamente.
- Caixa carregado sob demanda, consultas simultâneas compartilhadas somente no mesmo usuário/perfil/estoque, descarte de respostas de escopos anteriores.
- Adaptador de sincronização com reconexão, agrupamento de eventos, fallback e diagnóstico sem conteúdo das mensagens ou tokens.
- Classificação compartilhada de atualização: 4h operacional; 24/48h gerencial preservados.
- Cache estático v40. Núcleo de Endereçamento preservado.

## Validação

npm ci, lint, 252 testes, build e npm audit executados. Auditoria sem vulnerabilidades. Banco PostgreSQL isolado usado para regressões de RLS, grants, ciclo de tarefas e idempotência. Duas sessões locais com dados fictícios validaram conversa bidirecional, resolução, devolução para correção, confirmação e preservação do SKU digitado.

## Bloqueios obrigatórios

As três migrations desta entrega NÃO foram aplicadas em produção. A estratégia de recuperação física não pôde ser verificada com os acessos disponíveis. Registro do schema e rollback de funções existem, mas não substituem essa verificação.

- 20261030025059_wms_task_security.sql: autorização explícita por perfil/estoque e wrappers invoker; exploit do estado anterior reproduzido e bloqueado no teste local.
- 20261030025101_wms_operational_realtime.sql: publicação adicional das tabelas já protegidas por RLS.
- 20261030030939_wms_catalog_policy_initplan.sql: mesma autorização, avaliação do helper uma vez por declaração.

VITE_WMS_OPERATIONAL_REALTIME não foi habilitada. A atualização por consulta de 15 segundos continua compatível com o schema atual. Não habilitar antes de aplicar e verificar as migrations em ambiente com recuperação confirmada.

Não atualizar refs remotas/main: o repositório também dispara previews de outro projeto, fora do escopo autorizado. O release utiliza commit explícito e deploy restrito ao projeto Vercel WMS. Reconciliação de main depende da separação dessa automação.

## Limites das evidências

Não foram executados testes de escrita com dados reais, nem usados logins reais de colaboradores. As sessões de integração foram locais, com cliente sintético. O bundle principal ainda supera 500 kB. As correções SQL e o novo Realtime permanecem pendentes; esta entrega não conclui integralmente a missão.
