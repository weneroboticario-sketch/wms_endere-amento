# Correcao do inicio de transferencias

## Escopo

WMS Estoque (`wms-endere-amento.vercel.app`), Supabase `bzqulgdtfpcmkyaldssy`.
O CP Alamo nao recebe esta alteracao.

## Causa confirmada

Os triggers `sync_tarefa_transferencia` e `sync_tarefa_reposicao` usam
`ON CONFLICT (referencia_tipo, referencia_id)` sem predicado. O unico indice
de referencia existente era parcial, com `WHERE referencia_tipo IS NOT NULL
AND referencia_id IS NOT NULL`. O Postgres nao conseguia inferir esse indice
para o UPSERT e retornava `42P10`, revertendo tambem a atualizacao da transferencia.

## Correcao

A migration `20261008184900_fix_task_reference_upsert.sql` adiciona um indice
unico nao parcial nas mesmas colunas. Referencias NULL continuam permitidas
para varias tarefas avulsas. O indice legado e mantido para minimizar o risco
da alteracao em producao. Nenhuma tarefa ou transferencia e apagada ou iniciada
pela migration; triggers e permissoes permanecem inalterados.

O bloco e idempotente e tolera instalacoes sem o modulo opcional de tarefas.
O registro da versao nao rebaixa uma versao posterior ja instalada.

## Validacao

- Reproducao do erro original no banco, em transacao desfeita.
- Testes locais com PGlite: reproducao do erro, inicio e repeticao de atualizacao,
  reposicao, referencia unica, tarefas avulsas, reaplicacao e modulo ausente.
- Simulacao no banco com o papel `authenticated` e a identidade do operador
  responsavel: inicio `EM_SEPARACAO` e uma unica tarefa vinculada.
- A simulacao termina em `ROLLBACK`, preservando o status operacional real.

## Aplicacao

Aplicar somente a migration no banco WMS Estoque. Nao exige publicacao do
frontend nem troca de senha. O usuario pode tentar iniciar a transferencia novamente.
