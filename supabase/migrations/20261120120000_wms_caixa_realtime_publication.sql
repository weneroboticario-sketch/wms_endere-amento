-- Add the low-volume Caixa tables to the existing Realtime publication.
-- Stock positions are intentionally excluded to avoid high-volume change streams.
-- Requires pre-existing SELECT policies and RLS; no user data is modified.
do $wms_caixa_realtime$
declare table_name text;
begin
  foreach table_name in array array['wms_caixa_requests','wms_caixa_request_messages'] loop
    if not exists(
      select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=table_name and c.relrowsecurity
    ) then
      raise exception 'Tabela Caixa ausente ou sem RLS: %',table_name;
    end if;
    if not exists(
      select 1 from pg_policies p where p.schemaname='public'
        and p.tablename=table_name and p.cmd in ('SELECT','ALL')
        and ('authenticated'=any(p.roles) or 'public'=any(p.roles))
    ) then
      raise exception 'Tabela Caixa sem politica SELECT para authenticated: %',table_name;
    end if;
    if not exists(
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename=table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I',table_name);
    end if;
  end loop;
end $wms_caixa_realtime$;
