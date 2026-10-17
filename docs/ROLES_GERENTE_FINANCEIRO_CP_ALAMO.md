# Gerente e Financeiro - CP Alamo

## Auditoria inicial

- Branch: `feature/cpalamo-compras-nf-reversa`; checkout inicialmente limpo em `c71c654`.
- Fast-forward para `46e51ab`: implementacao de Perdas/DRE ja existente, sem sobrescrever trabalho local.
- Supabase exclusivo: `ztxdqvxvkfgfqowaiaep`; publicacao exclusiva `wms-cpalamo.vercel.app`.
- Banco: 19 perfis existentes (2 administradores, 3 supervisores, 6 operadores, 5 compras, 3 atendentes). Nenhum perfil foi convertido automaticamente.
- Confirmados no codigo e no banco: Compras/NF, transferencias, reposicao, expedicao/entregas, reversa, Perdas/DRE, aliquotas, rateios, competencias e exportacoes.
- Nao foi criado um modulo independente de entregas: a consulta usa a expedicao existente.
- RLS auditada: havia politicas antigas com `role <> COMPRAS`. Novas politicas restritivas bloqueiam INSERT/UPDATE/DELETE para os dois perfis, inclusive em tabelas operacionais auxiliares.
- Triggers adicionais impedem escrita fisica por comandos legados SECURITY DEFINER. Comandos financeiros exclusivos continuam mediados por funcoes privadas, autenticadas e auditadas.

## Implantacao incremental

1. Migration aditiva `20261017002616_manager_finance_capabilities.sql`: catalogo/grants/auditoria privados, bloqueios operacionais, leitura por escopo e validacao financeira.
2. Novas opcoes do seletor de perfil e filtros administrativos. Matricula/usuario/email continuam usando a autenticacao existente.
3. Central Gerencial, consultas somente leitura e Painel Financeiro reutilizando Perdas/DRE.
4. Validacao financeira obrigatoria antes de novas exportacoes de perdas aprovadas. Lotes historicos permanecem disponiveis e imutaveis.

## Cadastro

Em Usuarios, administrador seleciona GERENTE ou FINANCEIRO e marca explicitamente as unidades autorizadas. O estoque padrao deve estar nessa selecao. Nao ha ampliacao automatica para todas as lojas.

Em Consultas e Relatorios, o administrador encontra Permissoes adicionais dos perfis. Autorizacoes e bloqueios exigem justificativa e sao registrados. Gerente/Financeiro nao podem administrar essas autorizacoes.

Fechar/reabrir competencia, configurar aliquotas/tipos e reabrir uma perda sao permissoes adicionais, desabilitadas por padrao. A permissao de excecao gerencial habilita apenas a reabertura formal de perdas neste incremento; nao libera reatribuicao ou reabertura generica de transferencias.

O fechamento legado e global por competencia: alem da capability, exige acesso explicito a todas as unidades operacionais ativas. Um financeiro de uma unica unidade pode consultar, validar e exportar seu escopo, mas nao fechar o periodo global.

O WMS Estoque independente, seu banco e sua publicacao nao fazem parte desta alteracao.

## Avisos de auditoria

O advisor identificou comandos legados de tarefas executaveis por anon. A migration remove essa execucao publica, preserva authenticated e nao bloqueia a resolucao publica de matricula para login. Funcoes privadas financeiras mantem RLS sem politicas de acesso direto intencionalmente.

Persistem avisos legados de funcoes SECURITY DEFINER autenticadas (com verificacoes internas e novos bloqueios para os perfis) e protecao de senhas vazadas desativada no Auth. Essa configuracao de Auth nao foi alterada neste incremento. Referencias: [functions](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [senhas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Verificacao

- `npm run lint`, `npm test` (198 aprovados), `npm run build` e `git diff --check` aprovados. Build mantem o aviso preexistente de bundle principal acima de 500 kB.
- PGlite verifica restricoes de escrita/roles/NF, escopo, grants negados, autoaprovacao, validacao separada/idempotente, competencia retroativa, aliquota historica, fechamento e exportacao conciliada preservando NF `00015`.
- Navegador: oito capturas dos modulos reais (Gerente/Financeiro em 1366x768, 1440x900, 1920x1080 e 390x844), sem overflow externo nem erro de pagina; botoes nao autorizados ocultos.
- Banco CP: simulacoes autenticadas de GERENTE e FINANCEIRO com escopo 22796 dentro de transacoes revertidas. Validada ausencia de escrita fisica, alteracao de roles e liberacao fiscal, sem mudancas permanentes em usuarios ou processos.
- Advisor posterior: exposicao anon de comandos legados reduzida de 17 para 1 (resolucao de matricula intencional). Novas funcoes publicas sao invokers; cores privados exigem autenticacao/capability/escopo. As quatro tabelas privadas sem politicas nao aceitam acesso direto.
