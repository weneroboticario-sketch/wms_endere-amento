# Relatorio - Gestao de Usuarios Organizada

## Campos adicionados

Foram adicionados ao schema da tabela `wms_users`:

- `supervisor_id`
- `supervisor_name`
- `archived`
- `archived_at`
- `archived_by_id`
- `archived_by_name`

Tambem foram adicionados indices para consulta por estoque, supervisor e arquivamento.

## Regras de arquivamento

Arquivar usuario desativa o acesso operacional sem apagar historico:

- `archived = true`
- `active = false`
- `available_for_tasks = false`
- registra data e usuario responsavel pelo arquivamento

Usuario arquivado sai da aba Ativos e aparece nas abas Arquivados e Todos.

## Regras de exclusao definitiva

Exclusao definitiva ficou restrita ao administrador geral. Antes de excluir, o app verifica vinculos operacionais em transferencias, reposicao, sessoes, notificacoes, importacoes e historico.

Se houver vinculo operacional, o usuario nao e apagado fisicamente. O sistema arquiva e desativa para preservar rastreabilidade.

Nao e permitido excluir:

- usuario principal `admin`
- usuario logado
- ultimo administrador ativo

Para exclusao fisica, e exigida confirmacao digitando `EXCLUIR`.

## Agrupamento por estoque e supervisor

A tela de Usuarios agora mostra grupos recolhiveis por estoque/VD e, dentro deles, grupos por supervisor.

Operadores sem supervisor aparecem em `Sem supervisor definido`.

## Filtros criados

Foram criados:

- abas Ativos, Inativos, Arquivados e Todos
- filtro por estoque/VD
- filtro por perfil
- filtro por supervisor
- filtro por status
- filtro por disponibilidade para tarefas
- busca por nome, usuario ou matricula

## Permissoes aplicadas

Administrador geral pode ver todos os estoques e mover usuarios entre estoques.

Supervisor ve e gerencia somente usuarios do proprio estoque, sem permissao para alterar administradores ou usuarios de outro estoque.

Operador continua sem acesso a gestao de usuarios.

## Listas de responsaveis

Transferencias e Reposicao passam a considerar somente usuarios:

- ativos
- nao arquivados
- disponiveis para tarefas
- com estoque padrao igual ao estoque ativo
- perfil operacional ou supervisor

## Testes realizados

- Validacao de sintaxe com `node --check script.js`
- Build de producao com `npm run build`
- Checagem de whitespace com `git diff --check`

