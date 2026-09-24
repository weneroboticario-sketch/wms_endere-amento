# Supabase do WMS

As migrations desta pasta são a fonte oficial do schema. Não execute hotfixes antigos fora desta sequência.

## Ordem

1. `20260923000000_legacy_baseline.sql`: baseline idempotente para uma instalação nova.
2. `20260924012751_auth_profile_foundation.sql`: vínculo com Supabase Auth e helpers privados.
3. `20260924012758_rls_security_hardening.sql`: grants mínimos e RLS por perfil/estoque.
4. `20260924014042_operational_data_integrity.sql`: deduplicação auditável, índices e normalização VDAR.

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
