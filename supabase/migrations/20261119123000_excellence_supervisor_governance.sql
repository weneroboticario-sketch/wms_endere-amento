-- Supervisor governance for Logística de Excelência.
-- Supervisors may operate cycles and task templates only inside warehouses they can access.
begin;

create or replace function public.wms_excellence_create_monthly_cycle(p_warehouse text,p_month date,p_name text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $monthly_cycle$
declare
  first_day date;
  last_day date;
  actor text:=private.current_wms_profile_id();
  version_id uuid;
  result jsonb;
  config jsonb:='{"engineVersion":2,"timeZone":"America/Cuiaba","minimumDays":3,"minimumSample":5,"complexityWeights":{"SIMPLES":1,"INTERMEDIARIA":2,"COMPLEXA":3},"criteria":[{"id":"EXECUCAO","weight":25,"automaticMaximum":25,"assistedMaximum":0,"formula":"EXECUTION"},{"id":"QUALIDADE","weight":25,"automaticMaximum":20,"assistedMaximum":5,"formula":"VERIFICATION"},{"id":"INICIATIVA","weight":20,"automaticMaximum":0,"assistedMaximum":20},{"id":"ORGANIZACAO","weight":10,"automaticMaximum":10,"assistedMaximum":0,"formula":"VERIFICATION"},{"id":"TRABALHO_EM_EQUIPE","weight":10,"automaticMaximum":0,"assistedMaximum":10},{"id":"POSTURA","weight":10,"automaticMaximum":0,"assistedMaximum":10}],"bands":[{"minimum":90,"label":"Excelência"},{"minimum":85,"label":"Alto desempenho"},{"minimum":80,"label":"Bom desempenho"},{"minimum":60,"label":"Em desenvolvimento"},{"minimum":0,"label":"Necessita de acompanhamento"}],"executionModel":"HYBRID"}'::jsonb;
begin
  if actor is null or not private.excellence_leader(upper(p_warehouse)) then
    raise exception 'Liderança necessária.' using errcode='42501';
  end if;
  first_day:=date_trunc('month',p_month)::date;
  last_day:=(date_trunc('month',p_month)+interval '1 month - 1 day')::date;
  if exists(
    select 1 from public.wms_excellence_cycles
    where warehouse_code=upper(p_warehouse)
      and status<>'ARCHIVED'
      and daterange(start_date,end_date,'[]') && daterange(first_day,last_day,'[]')
  ) then raise exception 'Já existe ciclo sobreposto neste mês.';end if;

  insert into public.wms_excellence_criteria_versions(warehouse_code,version,config,created_by_id)
  values(
    upper(p_warehouse),
    (select coalesce(max(version),0)+1 from public.wms_excellence_criteria_versions where warehouse_code=upper(p_warehouse)),
    config,
    actor
  ) returning id into version_id;

  insert into public.wms_excellence_cycles(warehouse_code,name,start_date,end_date,criteria_version_id,created_by_id)
  values(
    upper(p_warehouse),
    coalesce(nullif(trim(p_name),''),'Avaliação Mensal - '||to_char(first_day,'MM/YYYY')),
    first_day,last_day,version_id,actor
  )
  returning to_jsonb(wms_excellence_cycles.*) into result;
  return result;
end $monthly_cycle$;
revoke all on function public.wms_excellence_create_monthly_cycle(text,date,text) from public,anon,authenticated,service_role;
grant execute on function public.wms_excellence_create_monthly_cycle(text,date,text) to authenticated;

create or replace function public.wms_excellence_save_task_template(p_warehouse text,p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare actor text:=private.current_wms_profile_id(); result jsonb; template_id uuid;
begin
  if actor is null or not private.excellence_leader(upper(p_warehouse)) then
    raise exception 'Liderança necessária.' using errcode='42501';
  end if;
  if length(trim(coalesce(p_data->>'code','')))<3 or length(trim(coalesce(p_data->>'title','')))<3 then
    raise exception 'Código e título são obrigatórios.';
  end if;
  if coalesce(p_data->>'criterion_id','') not in ('QUALIDADE','ORGANIZACAO') then
    raise exception 'Critério inválido.';
  end if;
  if coalesce(p_data->>'complexity','SIMPLES') not in ('SIMPLES','INTERMEDIARIA','COMPLEXA') then
    raise exception 'Complexidade inválida.';
  end if;
  if coalesce(p_data->>'cadence','DAILY') not in ('DAILY','WEEKLY','MONTHLY','MANUAL') then
    raise exception 'Periodicidade inválida.';
  end if;
  template_id:=nullif(p_data->>'id','')::uuid;
  if template_id is null then
    insert into public.wms_excellence_task_templates(
      warehouse_code,code,title,description,task_type,criterion_id,cadence,weekdays,
      quantity_target,complexity,sla_time,config,active,created_by_id
    ) values(
      upper(p_warehouse),upper(regexp_replace(trim(p_data->>'code'),'[^A-Za-z0-9_]+','_','g')),
      left(trim(p_data->>'title'),120),nullif(trim(coalesce(p_data->>'description','')),''),
      coalesce(nullif(p_data->>'task_type',''),'AVULSA')::public.tipo_tarefa_enum,
      p_data->>'criterion_id',coalesce(p_data->>'cadence','DAILY'),
      coalesce((select array_agg(value::smallint) from jsonb_array_elements_text(coalesce(p_data->'weekdays','[1,2,3,4,5,6]'::jsonb))),array[1,2,3,4,5,6]::smallint[]),
      nullif(p_data->>'quantity_target','')::numeric,coalesce(p_data->>'complexity','SIMPLES'),
      coalesce(nullif(p_data->>'sla_time','')::time,'23:59'::time),coalesce(p_data->'config','{}'::jsonb),
      coalesce((p_data->>'active')::boolean,true),actor
    ) returning to_jsonb(wms_excellence_task_templates.*) into result;
  else
    update public.wms_excellence_task_templates
    set title=left(trim(p_data->>'title'),120),
        description=nullif(trim(coalesce(p_data->>'description','')),''),
        task_type=coalesce(nullif(p_data->>'task_type',''),'AVULSA')::public.tipo_tarefa_enum,
        criterion_id=p_data->>'criterion_id',
        cadence=coalesce(p_data->>'cadence','DAILY'),
        weekdays=coalesce((select array_agg(value::smallint) from jsonb_array_elements_text(coalesce(p_data->'weekdays','[1,2,3,4,5,6]'::jsonb))),weekdays),
        quantity_target=nullif(p_data->>'quantity_target','')::numeric,
        complexity=coalesce(p_data->>'complexity','SIMPLES'),
        sla_time=coalesce(nullif(p_data->>'sla_time','')::time,sla_time),
        config=coalesce(p_data->'config',config),
        active=coalesce((p_data->>'active')::boolean,active),
        updated_by_id=actor,updated_at=now()
    where id=template_id and warehouse_code=upper(p_warehouse)
    returning to_jsonb(wms_excellence_task_templates.*) into result;
    if result is null then raise exception 'Tarefa padrão não encontrada.';end if;
  end if;
  return result;
end $$;
revoke all on function public.wms_excellence_save_task_template(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.wms_excellence_save_task_template(text,jsonb) to authenticated;

create or replace function public.wms_excellence_set_task_template_active(p_warehouse text,p_template uuid,p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare actor text:=private.current_wms_profile_id(); result jsonb;
begin
  if actor is null or not private.excellence_leader(upper(p_warehouse)) then
    raise exception 'Liderança necessária.' using errcode='42501';
  end if;
  update public.wms_excellence_task_templates
  set active=p_active,updated_by_id=actor,updated_at=now()
  where id=p_template and warehouse_code=upper(p_warehouse)
  returning to_jsonb(wms_excellence_task_templates.*) into result;
  if result is null then raise exception 'Tarefa padrão não encontrada.';end if;
  return result;
end $$;
revoke all on function public.wms_excellence_set_task_template_active(text,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.wms_excellence_set_task_template_active(text,uuid,boolean) to authenticated;


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
    c.id,upper(p_warehouse),u.id,u.role,u.profile,
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

create or replace function public.wms_excellence_set_member_eligibility(
  p_warehouse text,
  p_cycle uuid,
  p_user_id text,
  p_eligible boolean,
  p_justification text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor text:=private.current_wms_profile_id();
  c public.wms_excellence_cycles;
  result jsonb;
begin
  if actor is null or not private.excellence_leader(upper(p_warehouse)) then
    raise exception 'Liderança necessária.' using errcode='42501';
  end if;
  select * into c
  from public.wms_excellence_cycles
  where id=p_cycle and warehouse_code=upper(p_warehouse)
  for update;
  if not found then raise exception 'Ciclo não encontrado.'; end if;
  if c.status in ('CLOSED','ARCHIVED') then
    raise exception 'Ciclo fechado é imutável.';
  end if;
  if nullif(trim(coalesce(p_user_id,'')),'') is null
     or nullif(trim(coalesce(p_justification,'')),'') is null then
    raise exception 'Colaborador e justificativa são obrigatórios.';
  end if;

  update public.wms_excellence_cycle_members
  set eligible=p_eligible,
      eligibility_reason=left(trim(p_justification),1000),
      updated_by_id=actor,
      updated_at=now()
  where cycle_id=c.id and user_id=p_user_id
  returning to_jsonb(wms_excellence_cycle_members.*) into result;

  if result is null then raise exception 'Colaborador não pertence ao ciclo.'; end if;
  return result;
end $$;
revoke all on function public.wms_excellence_set_member_eligibility(text,uuid,text,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.wms_excellence_set_member_eligibility(text,uuid,text,boolean,text) to authenticated;

create or replace function public.wms_excellence_enable_cycle(
  p_warehouse text,
  p_cycle uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  actor text:=private.current_wms_profile_id();
  c public.wms_excellence_cycles;
  result jsonb;
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
    raise exception 'Somente ciclo em rascunho pode ser ativado.';
  end if;
  if not exists(
    select 1 from public.wms_excellence_cycle_members
    where cycle_id=c.id and eligible
  ) then
    raise exception 'Defina a equipe do ciclo antes de ativar.';
  end if;

  update public.wms_excellence_cycles
  set enabled=true,status='ACTIVE',updated_at=now()
  where id=c.id
  returning to_jsonb(wms_excellence_cycles.*) into result;
  return result;
end $$;
revoke all on function public.wms_excellence_enable_cycle(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.wms_excellence_enable_cycle(text,uuid) to authenticated;


commit;
