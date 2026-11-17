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

## Descoberta crítica — domínio ativo de Dourados
- `wms-dourados.vercel.app` tem redirecionamento permanente para `wms-cpalamo.vercel.app` no `vercel.json` publicado.
- O alias `wms-cpalamo.vercel.app` está associado a **outro deployment**, também no projeto Vercel Dourados: `dpl_E5RrKwZWXMvo7UuYB92bZSzP8kKT` (READY; fonte `cli`).
- Esse deployment não usa exatamente o mesmo código do commit Git `e31b681`: `package.json` usa Node `>=20.19`, não define `prebuild`, e contém dependências diferentes da baseline Git.
- **Não substituir nem reconectar o domínio do alias `wms-cpalamo.vercel.app` com base apenas no commit `e31b681`.**
- Antes do corte de Git, identificar qual versão/aplicação atende os operadores de Dourados, preservar o deployment CLI e comparar seu código e fluxos com a versão Git.
- Evitar qualquer alteração no projeto CP ÁLAMO; nomes de domínio não comprovam equivalência funcional entre sistemas.

## Continuidade
A branch de preparação preserva somente o estado publicado pelo Git convencional; o deployment CLI associado ao alias deve ser tratado como fonte operacional distinta até validação.
