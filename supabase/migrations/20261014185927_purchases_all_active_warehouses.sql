-- CP Alamo only: trusted active COMPRAS profiles have all active operational units.
-- Preserve the existing authorization lookup, ownership predicate and other roles.
begin;
CREATE OR REPLACE FUNCTION private.current_wms_allowed_warehouses()
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when u.role = 'COMPRAS' then
      coalesce((select array_agg(upper(w.code) order by w.code) from public.wms_warehouses w
        where w.active is true and upper(w.code) <> 'DOURADOS'), array[]::text[])
    when u.role = 'ADMINISTRADOR' and coalesce(u.is_global_admin, false) then
      coalesce((select array_agg(upper(w.code) order by w.code) from public.wms_warehouses w where w.active is true), array[]::text[])
    else array(
      select distinct upper(trim(code))
      from unnest(regexp_split_to_array(coalesce(nullif(u.allowed_warehouse_codes, ''), u.default_warehouse_code, u.warehouse_code, ''), '\\s*,\\s*')) code
      where trim(code) <> ''
    )
  end
  from public.wms_users u
  where u.auth_user_id = (select auth.uid())
    and u.active is true
    and coalesce(u.archived, false) is false
  limit 1
$function$;

notify pgrst,'reload schema';
commit;
