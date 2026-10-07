begin;

alter table public.wms_access_requests
  add column if not exists email text not null default '';

update public.wms_access_requests
set email = lower(trim(email))
where email <> lower(trim(email));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.wms_access_requests'::regclass
      and conname = 'wms_access_requests_email_format_check'
  ) then
    alter table public.wms_access_requests
      add constraint wms_access_requests_email_format_check
      check (email = '' or email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') not valid;
  end if;
end
$$;

alter table public.wms_access_requests
  validate constraint wms_access_requests_email_format_check;

grant insert (email) on public.wms_access_requests to anon;
grant select (email) on public.wms_access_requests to authenticated;

drop policy if exists wms_access_requests_anon_insert on public.wms_access_requests;
create policy wms_access_requests_anon_insert on public.wms_access_requests
for insert to anon
with check (
  status = 'PENDENTE'
  and role_requested in ('OPERADOR', 'ATENDENTE')
  and coalesce(password_hash, '') = ''
  and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  and email !~* '\.local$'
);

insert into public.wms_schema_version (id, version, description, applied_at, applied_by)
values (
  'current',
  '2026.10.06.009',
  'Recuperacao de senha por email e cadastro de email real para todos os perfis.',
  now(),
  'email-password-recovery'
)
on conflict (id) do update
set version = excluded.version,
    description = excluded.description,
    applied_at = excluded.applied_at,
    applied_by = excluded.applied_by;

notify pgrst, 'reload schema';

commit;
