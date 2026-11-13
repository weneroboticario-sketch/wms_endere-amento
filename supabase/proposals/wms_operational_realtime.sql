-- Add only existing RLS-protected operational tables. No row changes.
do $migration$
declare name text;
begin
  foreach name in array array['wms_caixa_requests','wms_caixa_request_messages','operacao_tarefas'] loop
    if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=name and c.relrowsecurity) then
      raise exception 'Tabela operacional ausente ou sem RLS: %',name;
    end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=name) then
      execute format('alter publication supabase_realtime add table public.%I',name);
    end if;
  end loop;
end $migration$;
