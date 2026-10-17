-- The trusted backend already has table grants and BYPASSRLS. Its trigger must
-- not invoke profile helpers whose schema is intentionally private to clients.
create or replace function private.wms_scoped_profile_no_physical_write() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if current_user='service_role' then
  if tg_op='DELETE' then return old; else return new; end if;
 end if;
 if private.current_wms_role() in ('GERENTE','FINANCEIRO') then
  raise exception 'Perfil de consulta sem permissao operacional.' using errcode='42501';
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
notify pgrst,'reload schema';
