create or replace function public.wms_resolve_login_email(p_identifier text)
returns text
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  with normalized as (
    select nullif(btrim(p_identifier), '') as identifier
  )
  select u.auth_email
  from normalized n
  join public.wms_users u
    on (
      lower(u.username) = lower(n.identifier)
      or lower(u.matricula) = lower(n.identifier)
    )
  where n.identifier is not null
    and u.active is true
    and coalesce(u.archived, false) is false
    and coalesce(u.auth_email, '') <> ''
  order by u.updated_at desc
  limit 1;
$$;

revoke all on function public.wms_resolve_login_email(text) from public;
grant execute on function public.wms_resolve_login_email(text) to anon;
grant execute on function public.wms_resolve_login_email(text) to authenticated;
