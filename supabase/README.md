# Supabase do WMS

As migrations desta pasta são a fonte oficial do schema. Não execute hotfixes antigos fora desta sequência.

## Exportacao De Reposicao

`20261010122825_replenishment_export_batches.sql`: registra lotes e selo de exportacao por pedido, bloqueia nova exportacao do mesmo pedido e preserva o arquivo para baixar novamente. Aplicar antes do frontend. Exclusiva do WMS Enderecamento.

## Ordem

1. `20260923000000_legacy_baseline.sql`: baseline idempotente para uma instalação nova.
2. `20260924012751_auth_profile_foundation.sql`: vínculo com Supabase Auth e helpers privados.
3. `20260924012758_rls_security_hardening.sql`: grants mínimos e RLS por perfil/estoque.
4. `20260924014042_operational_data_integrity.sql`: deduplicação auditável, índices e normalização VDAR.
5. `20260924115056_user_supervision_compatibility.sql`: compatibilidade do vínculo entre supervisores e operadores.
6. `20260930184528_allow_operator_binding_delete.sql`: operadores podem remover vínculos de endereço somente nos estoques permitidos.
7. `20261001001530_addressing_concurrency_fast_path.sql`: gravação atômica do endereçamento, com trava por estoque/endereço e detecção de alteração concorrente.
8. `20261001143352_atendente_profile_and_priority.sql`: perfil ATENDENTE, prioridade Cliente/Reposição e bloqueio de escritas operacionais por perfil.
9. `20261001210406_replenishment_cancellation_request.sql`: solicitação segura de cancelamento pelo ATENDENTE, sem liberar alterações no fluxo operacional.
10. `20261006005523_addressing_history_optional.sql`: compatibilidade do histórico auxiliar para que falhas de auditoria não bloqueiem o endereçamento atômico.
11. `20261007010406_email_password_recovery.sql`: e-mail real obrigatório nas solicitações de acesso e suporte ao fluxo de recuperação de senha.
12. `20261008184900_fix_task_reference_upsert.sql`: corrige o índice utilizado pela integração da Central de Tarefas, evitando que o início de transferências e as atualizações de reposição sejam bloqueados. Não altera permissões nem dados operacionais.

Em um banco existente, aplique a sequência pelo Supabase CLI. Os comandos `create/alter ... if not exists` e `on conflict` tornam a baseline reaplicável; ainda assim, faça backup antes.

```powershell
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
npx supabase db lint --linked
```

Depois, provisione as identidades conforme [bootstrap-admin.md](../docs/bootstrap-admin.md), faça deploy da função `manage-wms-user` e execute os testes:

```powershell
psql "$env:SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql
```

O teste usa comandos do `psql`, roda dentro de uma transação que termina em `ROLLBACK` e deve ser executado numa branch de banco ou ambiente local. O isolamento usa usuários ativos já vinculados ao Auth; verificações dependentes de fixture são marcadas como `SKIP` quando esse perfil ainda não existe.
