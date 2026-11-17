# WMS Dourados — baseline de separação segura
Data da preparação: 2026-11-16 (America/Campo_Grande)

## Origem imutável
- Repositório de origem: `weneroboticario-sketch/wms_endere-amento`
- Commit estável publicado em Dourados: `e31b681e3e1e8cea72739ad0a10d32d02efef199`
- Deploy de produção Dourados: `dpl_5QziYVcKBT534Ju26uLPrxBBfQBY`
- Projeto Vercel Dourados: `prj_pFjBXelJ6N9oMHc5WXaysH6aLa3Q`
- Projeto Supabase Dourados: `ztxdqvxvkfgfqowaiaep` (sa-east-1)
- Projeto Vercel WMS Endereçamento: `prj_HTVBYmk1nVKClLoAQt5WnrQEd85s`, NÃO MODIFICAR.
- Projeto Supabase WMS Endereçamento: `bzqulgdtfpcmkyaldssy`, NÃO MODIFICAR.

## Isolamento temporário
- Esta branch é uma cópia da árvore de produção de Dourados mais este documento e `git.deploymentEnabled=false` em `vercel.json`.
- Auto-deploy Git desativado para esta branch. A produção atual não deve ser trocada.
- Nenhuma tabela, dado, usuário, RLS, saldo ou sistema em produção foi modificado.

## Verificações antes da nova conexão
1. Criar repositório GitHub **independente** `weneroboticario-sketch/wms-dourados` de modo que não haja push para o repositório original.
2. Migrar o código desta baseline para o repositório independente e conferir integridade de arquivos e dependências.
3. Confirmar `VITE_SUPABASE_URL` do projeto Dourados apontando apenas para `ztxdqvxvkfgfqowaiaep`; copiar credenciais **somente por painel seguro** e nunca para o Git.
4. **Atenção:** o `vercel.json` original redireciona `wms-dourados.vercel.app` para `wms-cpalamo.vercel.app`. Validar com usuários o endereço operacional ANTES de modificar esse redirecionamento.
5. A CSP `img-src` original permite `bzqulgdtfpcmkyaldssy.supabase.co` (Supabase principal). Auditar necessidade e criar política exclusiva de Dourados após os testes.
6. Testar build, login, endereçamento, reposição, saldos, câmera, transferências, notificações, e acesso a assets no novo repositório/ambiente de teste.
7. No Vercel Dourados, Settings > Git, trocar a conexão somente após a cópia estar validada e houver plano de rollback. Não mexer no projeto Vercel principal.
8. Preservar deployment de produção `dpl_5QziYVcKBT534Ju26uLPrxBBfQBY` e confirmar que o domínio responde.
9. Habilitar auto-deploy exclusivamente após validação da independência, removendo `git.deploymentEnabled=false` **no novo repositório** conforme o fluxo aprovado.

## Bloqueio
Não publicar nem alterar conexão de produção enquanto o repositório GitHub independente não existir e as verificações forem concluídas.
