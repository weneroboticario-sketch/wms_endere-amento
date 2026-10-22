-- CP Alamo: COMPRAS reads explicitly assigned active units only.
-- No user assignments or operational records are changed.
create or replace function private.current_wms_allowed_warehouses() returns text[]
language sql stable security definer set search_path='' as $$
 select case when private.current_wms_role() in ('COMPRAS','GERENTE','FINANCEIRO') then
  coalesce((select array(select distinct upper(btrim(c.code)) from unnest(string_to_array(
   coalesce(nullif(u.allowed_warehouse_codes,''),u.default_warehouse_code,u.warehouse_code,''),',')) c(code)
   join public.wms_warehouses w on upper(w.code)=upper(btrim(c.code)) and w.active
   order by upper(btrim(c.code)))
   from public.wms_users u where u.id=private.current_wms_profile_id()
    and u.auth_user_id=(select auth.uid()) and u.active and not coalesce(u.archived,false)),'{}'::text[])
 else private.legacy_wms_allowed_warehouses() end
$$;
revoke all on function private.current_wms_allowed_warehouses() from public,anon;
grant execute on function private.current_wms_allowed_warehouses() to authenticated;
