# Separação WMS Dourados — proveniência e bloqueios de cutover
Data da auditoria: 2026-11-16 (America/Campo_Grande)

## Estado comprovado
- WMS Endereçamento: projeto Vercel `prj_HTVBYmk1nVKClLoAQt5WnrQEd85s` e Supabase `bzqulgdtfpcmkyaldssy`. A produção verificada usa o commit `d45288f4bfabf35799fa10fe0b1c8a7a8d87d857`.
- Projeto Vercel `wms-dourados`: `prj_pFjBXelJ6N9oMHc5WXaysH6aLa3Q`, Supabase `ztxdqvxvkfgfqowaiaep`.
- Deploy Git de Dourados: `dpl_5QziYVcKBT534Ju26uLPrxBBfQBY` (`READY`), commit `e31b681e3e1e8cea72739ad0a10d32d02efef199`. É a versão usada **como referência Git**, não foi comprovado que é a mesma versão operacional visível no domínio de destino.
- `wms-dourados.vercel.app` aplica redirecionamento permanente para `https://wms-cpalamo.vercel.app/:path*` no `vercel.json` do baseline.
- O alias `wms-cpalamo.vercel.app` está vinculado ao deploy independente via CLI `dpl_E5RrKwZWXMvo7UuYB92bZSzP8kKT` dentro do projeto Vercel Dourados (READY).

## Por que o corte está bloqueado
A fonte do deploy CLI não é idêntica ao commit Git:
- Árvore do commit Git de referência: 339 arquivos Git (blobs).
- Arquivos na árvore de origem do deploy CLI exposta pela Vercel: 94 entradas, incluindo arquivos gerados em `out/`. As contagens **não são diretamente equivalentes** e não indicam, sozinhas, a quantidade de funcionalidades.
- `package.json` da implantação CLI especifica Node `>=20.19`, enquanto o Git está configurado para Node `24.x`.
- A implantação CLI usa dependências de XML e gráficos ausentes no `package.json` Git, enquanto o Git possui dependências de câmera, PDF e OCR ausentes no pacote CLI.
- A implantação CLI contém `src/cpalamo-*.js` e inclui os manifestos CP Álamo e WMS.
- A diferença não prova qual versão está sendo usada por cada colaborador; impõe validação do endereço operacional antes de migrar.

## Restrições de segurança
1. **Não** modificar nenhum banco Supabase, usuários, RLS, Auth, saldos ou movimentos.
2. **Não** alterar domínio, redirecionamento, variáveis de ambiente ou vinculação Git do projeto Vercel Dourados até verificar a aplicação operacional.
3. **Não** modificar nem migrar CP Álamo junto com WMS Dourados; preservar a separação entre sistemas e decidir explicitamente a origem apropriada do código.
4. **Não** efetuar merge no `main` compartilhado, nem utilizar a versão atualizada do WMS Endereçamento como origem de Dourados.
5. **Não** armazenar senhas, chaves privadas ou variáveis de produção em arquivos do GitHub.

## Próxima sequência, sem impacto na produção
1. Criar repositório **privado e vazio** `weneroboticario-sketch/wms-dourados`, por meio do GitHub (o conector atual não oferece criação de repositórios).
2. Confirmar qual URL/variante atende a unidade de Dourados e fazer teste com operadores: `wms-cpalamo.vercel.app` versus versão Git.
3. Validar a cópia do Git por CI sem publicar: `isolation/wms-dourados-safe-baseline-20261116`.
4. Somente após identificar a versão correta, importar o código correspondente para o repositório privado e testar em projeto ou URL de prévia isolada.
5. Conferir banco Supabase de destino, autenticação, endereçamento, reposição, estoque, transferência, câmera, histórico, Service Worker e notificações.
6. Programar a troca de conexão Vercel apenas depois de aprovação dos testes e definição de rollback dos dois destinos.
7. Confirmar que um commit em WMS Endereçamento não gera deploy em Dourados, e vice-versa.

## Implantações preservadas para rollback
- Dourados Git: `dpl_5QziYVcKBT534Ju26uLPrxBBfQBY`
- Dourados alias CLI: `dpl_E5RrKwZWXMvo7UuYB92bZSzP8kKT`
- WMS principal: `dpl_wjkVFccx1ZF4vEbgXvN3V2cACK56`

Este documento é apenas um registro de auditoria e execução planejada. Nenhum deploy de produção ou mudança de conexões foi autorizado pela auditoria.
