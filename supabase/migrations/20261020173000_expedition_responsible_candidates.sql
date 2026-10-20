create or replace function public.wms_expedition_responsible_candidates(p_transfer_id text)
returns table(id text, name text, role text)
language plpgsql security definer set search_path = ''
as $$
declare
  actor_role text := private.current_wms_role();
  target_warehouse text;
begin
  if auth.uid() is null or actor_role is null
     or actor_role not in ('ADMINISTRADOR','SUPERVISOR','COMPRAS') then
    raise exception 'Sem permissao para consultar responsaveis.' using errcode='42501';
  end if;
  select t.warehouse_code into target_warehouse from public.wms_transfers t
  where t.id=p_transfer_id and not coalesce(t.is_deleted,false) and t.requires_invoice;
  if not found or not private.can_access_warehouse(target_warehouse) then
    raise exception 'Transferencia nao autorizada.' using errcode='42501';
  end if;
  return query select u.id::text,u.name::text,u.role::text
  from public.wms_users u
  where u.active is true and not coalesce(u.archived,false)
    and u.role='COMPRAS'
  order by u.name,u.id;
end;
$$;
revoke all on function public.wms_expedition_responsible_candidates(text) from public,anon;
grant execute on function public.wms_expedition_responsible_candidates(text) to authenticated;
notify pgrst,'reload schema';
