-- Compatibility hardening for supervisor cycle membership snapshots.
-- Keeps warehouse/role authorization unchanged and tolerates legacy/minimal wms_users rows.
create or replace function public.wms_excellence_set_cycle_members(
  p_warehouse text,
  p_cycle uuid,
  p_member_ids jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor text:=private.current_wms_profile_id();
  c public.wms_excellence_cycles;
  n integer:=0;
begin
  if actor is null or not private.excellence_leader(upper(p_warehouse)) then
    raise exception 'Liderança necessária.' using errcode='42501';
  end if;
  select * into c
  from public.wms_excellence_cycles
  where id=p_cycle and warehouse_code=upper(p_warehouse)
  for update;
  if not found then raise exception 'Ciclo não encontrado.'; end if;
  if c.status<>'DRAFT' or c.enabled then
    raise exception 'Equipe só pode ser definida antes da ativação.';
  end if;
  if jsonb_typeof(p_member_ids) is distinct from 'array' or jsonb_array_length(p_member_ids)=0 then
    raise exception 'Selecione ao menos um colaborador.';
  end if;

  delete from public.wms_excellence_cycle_members where cycle_id=c.id;
  insert into public.wms_excellence_cycle_members(
    cycle_id,warehouse_code,user_id,role_snapshot,function_snapshot,
    eligible,included_from,included_to,created_by_id
  )
  select
    c.id,upper(p_warehouse),u.id,u.role,
    coalesce(nullif(to_jsonb(u)->>'profile',''),u.role),
    true,c.start_date,c.end_date,actor
  from public.wms_users u
  where private.excellence_user(upper(p_warehouse),u.id)
    and u.id in (select distinct value from jsonb_array_elements_text(p_member_ids));
  get diagnostics n=row_count;

  if n<>(select count(distinct value) from jsonb_array_elements_text(p_member_ids)) then
    raise exception 'Há colaborador inválido ou fora da unidade.';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(m) order by m.created_at,m.user_id)
    from public.wms_excellence_cycle_members m
    where m.cycle_id=c.id
  ),'[]'::jsonb);
end $$;

revoke all on function public.wms_excellence_set_cycle_members(text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.wms_excellence_set_cycle_members(text,uuid,jsonb) to authenticated;
