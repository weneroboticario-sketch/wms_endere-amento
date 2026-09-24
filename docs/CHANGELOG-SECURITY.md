# Changelog de segurança e manutenção

Data: 23/09/2026  
Branch: `fix/security-hardening`

## Fase 1 - Autenticação e RLS

| Item | Problema | Alteração | Arquivos | Como validar |
| --- | --- | --- | --- | --- |
| 1 | O navegador lia `password_hash` e validava SHA-256 localmente. | Removidos hash e verificação do cliente; `auth-service.js` foi excluído. | `script.js`, `src/auth.js`, `auth-service.js` | `rg "password_hash|verifyPasswordHash|hashPassword" script.js src` não deve retornar fluxo de login. |
| 2 | Usuários legados não tinham identidade no Auth. | Perfil ganhou vínculo com `auth.users`, e-mail interno, data de migração e troca obrigatória. Script paginado cria ou reconcilia identidades sem apagar perfis. | `supabase/migrations/20260924012751_auth_profile_foundation.sql`, `scripts/provision-auth-users.mjs` | Aplicar em branch de banco, executar `npm run auth:provision` e conferir `auth_user_id`. |
| 3 | A sessão forjável do `localStorage` era fonte de verdade. | Sessão passou para `supabase.auth.getSession()` e tokens do Supabase Auth; timeout local ficou apenas como conveniência. | `src/supabase-client.js`, `src/auth.js`, `script.js` | Alterar manualmente dados antigos do storage não autentica; token inválido não passa pelo RLS. |
| 4 | Policies públicas davam CRUD amplo. | Policies antigas são removidas; grants mínimos e RLS por perfil/estoque foram criados. `anon` só envia solicitação sem senha. Hash legado não tem grant. | `supabase/migrations/20260924012758_rls_security_hardening.sql`, `supabase/tests/rls.sql` | Rodar `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql`. |
| 5 | O frontend criava `admin/admin123`. | Bootstrap automático foi removido. O primeiro admin é criado por procedimento seguro e senha temporária. | `script.js`, `docs/bootstrap-admin.md` | Banco vazio não cria usuário ao abrir o navegador. |
| 6 | Login permitia enumeração e não documentava limites. | Resposta única `Usuario ou senha invalidos`; rate limit do Auth documentado. | `script.js`, `docs/bootstrap-admin.md` | Testar usuário inexistente, inativo e arquivado e comparar a mesma mensagem. |
| 7 | Renomear usuário invalidava hash derivado do username. | A identidade Auth é atualizada pela Edge Function, sem hash dependente do nome. | `supabase/functions/manage-wms-user/index.ts`, `script.js` | Renomear matrícula, sair e entrar com o novo identificador. |
| 8 | Permissões de tela podiam parecer uma barreira de segurança. | `canAccessScreen` está documentado como UX; RLS é a fronteira real. | `script.js` | Fazer requisição direta fora do estoque e confirmar resposta vazia/negada. |
| 9 | Não havia regressão automatizada do RLS. | Teste transacional cobre grants de `anon`, hash, isolamento VDCG/VDAR e promoção por supervisor. | `supabase/tests/rls.sql` | Executar em branch de banco ou ambiente local com perfis vinculados. |

### Administração de usuários

A Edge Function `manage-wms-user` guarda a `service_role` no servidor, valida o chamador e aceita somente uma lista explícita de campos. Supervisor só cria, altera ou redefine senha de operador do próprio estoque; somente administrador global pode administrar outros perfis e acessos globais.

## Fase 2 - XSS e frontend

| Item | Problema | Alteração | Arquivos | Como validar |
| --- | --- | --- | --- | --- |
| 1 | Muitos templates usavam `innerHTML`; havia sinks críticos com HTML incremental. | Valores continuam escapados; `escapeHtml(null/undefined)` retorna vazio; sinks críticos usam `textContent`; DOMPurify e Trusted Types protegem sinks legados. | `src/utils.js`, `script.js` | `npm test` e teste manual com `<img src=x onerror=alert(1)>` em campos importáveis. |
| 2 | Não havia inventário de XSS. | Criado relatório de origens, sinks e proteções. | `docs/xss-audit.md` | Revisão do documento e busca de novos sinks no CI/review. |
| 3 | IDs combinavam tempo e `Math.random`. | Novos IDs usam `crypto.randomUUID()` com fallback centralizado. | `src/utils.js`, `script.js` | `rg "Date\.now\(\).*Math\.random" script.js` não deve retornar geradores antigos. |
| 4 | Consultas amplas podiam truncar em 1000 linhas. | Loaders genéricos usam `.range()` em blocos de 500; consultas sensíveis usam colunas explícitas; provisionamento também pagina. | `script.js`, `scripts/provision-auth-users.mjs` | Importar/consultar mais de 1000 registros e conferir contagem final. |
| 5 | Deploy não enviava cabeçalhos de segurança. | CSP, anti-framing, `nosniff`, referrer policy, permissions policy e COOP foram adicionados. | `vercel.json` | Conferir headers da resposta do deploy e console do navegador. |

Detalhes de sinks e risco residual: [`xss-audit.md`](xss-audit.md).

## Fase 3 - SQL e banco

| Item | Problema | Alteração | Arquivos | Como validar |
| --- | --- | --- | --- | --- |
| 1 | Baseline, hotfixes e schemas duplicados não tinham ordem única. | Conteúdo consolidado em quatro migrations ordenadas; SQLs soltos redundantes foram removidos. | `supabase/migrations/*`, `supabase/README.md` | `npx supabase db push --dry-run` numa branch de banco. |
| 2 | `quantidade_pendente` só atualizava `NULL`, impossível pelo `NOT NULL`. | Comparação usa `IS DISTINCT FROM` contra o cálculo correto. | `20260924014042_operational_data_integrity.sql` | Consultar pedidos divergentes antes/depois da migration. |
| 3 | Índices de reposição estavam duplicados. | Duplicatas conhecidas são removidas e ficam quatro índices canônicos. | mesma migration | Consultar `pg_indexes` para `wms_replenishment_requests`. |
| 4 | A chave idempotente podia bloquear o índice único e diagnostics estava duplicada. | Duplicatas são auditadas e têm somente a chave neutralizada; uma função diagnóstica admin permanece. | mesma migration | Verificar `wms_migration_audit`, índice parcial e acesso à função. |
| 5 | Reimportação podia duplicar posição ativa. | Duplicatas são auditadas/desativadas e índice único parcial protege estoque/origem/material/endereço. | mesma migration | Reimportar a mesma base e conferir uma posição ativa por chave. |
| 6 | O alias VDR/DVR persistia em tabelas e cliente. | Normalização dinâmica cobre todas as tabelas WMS com `warehouse_code`/`warehouse_id`, usuários e lista permitida; referências do cliente foram removidas. | mesma migration, `script.js` | `rg "VDR|DVR" script.js` e consultas SQL por alias. |
| 7 | A versão esperada estava dispersa. | `wms_schema_version` termina em `2026.09.23.003`, igual a `EXPECTED_SCHEMA_VERSION`. | migrations, `script.js` | Abrir Saúde do Sistema após aplicar a sequência. |
| 8 | Relatórios continham identificador real do projeto. | Identificadores foram removidos dos documentos versionados. | `docs/RELATORIO_*.md` | `git grep` pelo identificador não deve retornar resultado. |

Nenhuma migration executa `DROP TABLE` ou `DELETE`. As deduplicações mantêm registros e escrevem auditoria. Cada migration contém orientação de rollback manual.

## Fase 4 - Projeto e manutenção

| Item | Problema | Alteração | Arquivos | Como validar |
| --- | --- | --- | --- | --- |
| 1 | Catálogo de 1,4 MB ficava embutido no `script.js`. | 32.657 produtos foram movidos para JSON estático com `fetch` e cache. Busca mantém chaves/SKUs originais. | `public/data/builtin-products.json`, `src/product-catalog.js`, `script.js` | Buscar SKU com zero à esquerda e testar offline após primeiro carregamento. |
| 2 | O arquivo principal concentrava utilitários de baixo risco. | Auth, cliente Supabase, catálogo, warehouses e utilitários foram extraídos para módulos ES; chunks foram separados. | `src/*`, `vite.config.js` | `npm run build` e smoke test das telas. |
| 3 | Projeto não fixava runtime nem tinha lint/test; dev abria a LAN. | Node `>=20.19`, `dev` local, `dev:lan`, ESLint e Node Test Runner. | `package.json`, `eslint.config.js`, `tests/*` | `npm run lint`, `npm test`, `npm run build`. |
| 4 | Faltava exemplo seguro de ambiente. | `.env.example` contém somente placeholders públicos; nomes canônicos foram preservados. | `.env.example`, `.gitignore`, `vite.config.js` | Confirmar que `.env.local` não é versionado. |
| 5 | README descrevia permissões e deploy antigos. | Documentação refeita para Vite/Vercel, Auth, RLS, migrations e permissões atuais. | `README.md` | Revisar com `SCREEN_PERMISSIONS` e policies. |

## Resultado técnico

- Bundle principal antes: `1.808,38 kB` bruto / `483,02 kB` gzip.
- Bundle principal depois: `441,64 kB` bruto / `121,60 kB` gzip.
- Catálogo externo: `1.427.039 bytes`, carregado e armazenado em cache separadamente.
- `npm run lint`: aprovado.
- `npm test`: 3 testes aprovados.
- `npm run build`: aprovado.
- `npm audit --audit-level=moderate`: 0 vulnerabilidades conhecidas.

## Ações manuais obrigatórias

1. Criar backup e aplicar as migrations numeradas no Supabase real.
2. Executar o provisionamento Auth com a `service_role` somente em ambiente local seguro.
3. Criar/vincular o primeiro administrador conforme `docs/bootstrap-admin.md`.
4. Fazer deploy da Edge Function `manage-wms-user` e configurar `WMS_AUTH_EMAIL_DOMAIN` quando diferente de `wms.local`.
5. Configurar na Vercel `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `VITE_AUTH_EMAIL_DOMAIN`.
6. Desativar cadastro público por e-mail e revisar os limites em Authentication > Rate Limits.
7. Executar `supabase/tests/rls.sql` numa branch de banco antes da produção.
8. Publicar o frontend somente depois do provisionamento, para não interromper o login atual.

## Ainda não verificado

- Execução real das migrations e dos testes SQL: Docker/Postgres local não está disponível neste ambiente e o banco de produção não foi alterado para evitar bloqueio antes do provisionamento Auth.
- Entrega real de e-mail não é necessária para o domínio sintético, mas as identidades e senhas temporárias precisam ser provisionadas.
- Fluxos completos de login, troca de senha, Realtime e isolamento precisam de smoke test contra uma branch Supabase já migrada.
- Headers da Vercel devem ser confirmados depois do deploy.
