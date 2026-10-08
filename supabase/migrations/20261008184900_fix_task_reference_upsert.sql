-- The task sync triggers use ON CONFLICT (referencia_tipo, referencia_id)
-- without a predicate. The existing partial index cannot arbitrate that UPSERT.
-- A regular unique index preserves NULL references for standalone tasks.
do $$
begin
  if to_regclass('public.operacao_tarefas') is not null then
    create unique index if not exists uq_operacao_tarefas_referencia_upsert
      on public.operacao_tarefas (referencia_tipo, referencia_id);
  end if;
end;
$$;

insert into public.wms_schema_version (id, version, description, applied_at, applied_by)
values (
  'current',
  '2026.10.08.002',
  'Fix task reference UPSERT blocking transfer and replenishment updates',
  now(),
  'fix-task-reference-upsert'
)
on conflict (id) do update
set version = excluded.version,
    description = excluded.description,
    applied_at = excluded.applied_at,
    applied_by = excluded.applied_by
where public.wms_schema_version.version <= excluded.version;

notify pgrst, 'reload schema';
