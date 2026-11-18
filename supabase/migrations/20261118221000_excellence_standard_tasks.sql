-- Standard evaluated tasks for Logística de Excelência.
begin;

create table if not exists public.wms_excellence_task_templates (
  id uuid primary key default gen_random_uuid(),
  warehouse_code text not null,
  code text not null,
  title text not null,
  description text,
  task_type public.tipo_tarefa_enum not null default 'AVULSA',
  criterion_id text not null check (criterion_id in ('QUALIDADE','ORGANIZACAO')),
  cadence text not null default 'DAILY' check (cadence in ('DAILY','WEEKLY','MONTHLY','MANUAL')),
  weekdays smallint[] not null default array[1,2,3,4,5,6]::smallint[],
  quantity_target numeric,
  complexity text not null default 'SIMPLES' check (complexity in ('SIMPLES','INTERMEDIARIA','COMPLEXA')),
  sla_time time not null default '23:59',
  config jsonb not null default '{}',
  active boolean not null default true,
  created_by_id text references public.wms_users(id),
  created_at timestamptz not null default now(),
  updated_by_id text references public.wms_users(id),
  updated_at timestamptz not null default now(),
  unique(warehouse_code,code)
);
alter table public.wms_excellence_task_templates enable row level security;
revoke all on table public.wms_excellence_task_templates from public,anon,authenticated,service_role;

create table if not exists public.wms_excellence_address_audit_items (
  id bigint generated always as identity primary key,
  warehouse_code text not null,
  task_id uuid not null,
  actor_id text not null references public.wms_users(id),
  address_code text not null,
  week_start date not null,
  created_at timestamptz not null default now(),
  unique(warehouse_code,week_start,address_code)
);
alter table public.wms_excellence_address_audit_items enable row level security;
revoke all on table public.wms_excellence_address_audit_items from public,anon,authenticated,service_role;
create index if not exists excellence_address_audit_task_idx on public.wms_excellence_address_audit_items(task_id);
create index if not exists excellence_address_audit_actor_week_idx on public.wms_excellence_address_audit_items(warehouse_code,actor_id,week_start);

create unique index if not exists operacao_tarefas_excellence_standard_instance_uq
on public.operacao_tarefas(estoque_id,referencia_tipo,referencia_id)
where referencia_tipo='EXCELLENCE_STANDARD';

drop policy if exists operacao_tarefas_excellence_available_select on public.operacao_tarefas;
create policy operacao_tarefas_excellence_available_select
on public.operacao_tarefas for select to authenticated
using (
  private.current_wms_role()='OPERADOR'
  and private.can_access_warehouse(estoque_id::text)
  and referencia_tipo='EXCELLENCE_STANDARD'
  and atribuido_para is null
  and status='PENDENTE'
  and coalesce(arquivada,false)=false
);

create or replace function public.wms_excellence_task_templates(p_warehouse text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  if private.current_wms_role() not in ('ADMINISTRADOR','SUPERVISOR')
     or not private.can_access_warehouse(upper(p_warehouse)) then
    raise exception 'Liderança necessária.' using errcode='42501';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.active desc,t.title)
    from public.wms_excellence_task_templates t
    where t.warehouse_code=upper(p_warehouse)
  ),'[]'::jsonb);
end $$;
revoke all on function public.wms_excellence_task_templates(text) from public,anon,authenticated,service_role;
grant execute on function public.wms_excellence_task_templates(text) to authenticated;

create or replace function public.wms_excellence_save_task_template(p_warehouse text,p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare actor text:=private.current_wms_profile_id(); result jsonb; template_id uuid;
begin
  if private.current_wms_role()<>'ADMINISTRADOR' or not private.can_access_warehouse(upper(p_warehouse)) then
    raise exception 'Administrador necessário.' using errcode='42501';
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
  if private.current_wms_role()<>'ADMINISTRADOR' or not private.can_access_warehouse(upper(p_warehouse)) then
    raise exception 'Administrador necessário.' using errcode='42501';
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

create or replace function public.wms_excellence_create_monthly_cycle(p_warehouse text,p_month date,p_name text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $
declare
  first_day date;
  last_day date;
  actor text:=private.current_wms_profile_id();
  version_id uuid;
  result jsonb;
  config jsonb:='{"engineVersion":2,"timeZone":"America/Cuiaba","minimumDays":3,"minimumSample":5,"complexityWeights":{"SIMPLES":1,"INTERMEDIARIA":2,"COMPLEXA":3},"criteria":[{"id":"EXECUCAO","weight":25,"automaticMaximum":25,"assistedMaximum":0,"formula":"EXECUTION"},{"id":"QUALIDADE","weight":25,"automaticMaximum":20,"assistedMaximum":5,"formula":"VERIFICATION"},{"id":"INICIATIVA","weight":20,"automaticMaximum":0,"assistedMaximum":20},{"id":"ORGANIZACAO","weight":10,"automaticMaximum":10,"assistedMaximum":0,"formula":"VERIFICATION"},{"id":"TRABALHO_EM_EQUIPE","weight":10,"automaticMaximum":0,"assistedMaximum":10},{"id":"POSTURA","weight":10,"automaticMaximum":0,"assistedMaximum":10}],"bands":[{"minimum":90,"label":"Excelência"},{"minimum":85,"label":"Alto desempenho"},{"minimum":80,"label":"Bom desempenho"},{"minimum":60,"label":"Em desenvolvimento"},{"minimum":0,"label":"Necessita de acompanhamento"}],"executionModel":"HYBRID"}'::jsonb;
begin
  if private.current_wms_role()<>'ADMINISTRADOR' or actor is null or not private.can_access_warehouse(upper(p_warehouse)) then
    raise exception 'Administrador necessário.' using errcode='42501';
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
end $;
revoke all on function public.wms_excellence_create_monthly_cycle(text,date,text) from public,anon,authenticated,service_role;
grant execute on function public.wms_excellence_create_monthly_cycle(text,date,text) to authenticated;

create or replace function public.wms_excellence_ensure_standard_tasks(
  p_warehouse text,
  p_day date default (now() at time zone 'America/Cuiaba')::date
)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare c public.wms_excellence_cycles; t public.wms_excellence_task_templates;created integer:=0;n integer;due_at timestamptz;weekday integer;
begin
  if private.current_wms_profile_id() is null or not private.can_access_warehouse(upper(p_warehouse)) then
    raise exception 'Usuário sem acesso ao estoque.' using errcode='42501';
  end if;
  select * into c from public.wms_excellence_cycles
  where warehouse_code=upper(p_warehouse) and enabled and status='ACTIVE'
    and p_day between start_date and end_date
  order by start_date desc limit 1;
  if not found then return 0;end if;
  weekday:=extract(isodow from p_day)::integer;
  for t in
    select * from public.wms_excellence_task_templates
    where warehouse_code=upper(p_warehouse) and active
      and (
        (cadence='DAILY' and weekday=any(weekdays))
        or (cadence='WEEKLY' and weekday=coalesce(weekdays[1],1))
        or (cadence='MONTHLY' and extract(day from p_day)::integer=coalesce((config->>'dayOfMonth')::integer,1))
      )
  loop
    due_at:=(p_day::text||' '||t.sla_time::text)::timestamp at time zone 'America/Cuiaba';
    insert into public.operacao_tarefas(
      codigo_visivel,tipo,titulo,descricao,estoque_id,referencia_tipo,referencia_id,
      criado_por,prioridade,prazo_sla,status,resultado_execucao
    ) values(
      public.gerar_codigo_tarefa(t.task_type),t.task_type,t.title,t.description,upper(p_warehouse),
      'EXCELLENCE_STANDARD',t.id::text||':'||p_day::text,c.created_by_id,'NORMAL',due_at,'PENDENTE',
      jsonb_build_object(
        'excellence_standard_task',true,
        'excellence_template_id',t.id,
        'excellence_template_code',t.code,
        'excellence_criterion',t.criterion_id,
        'excellence_complexity',t.complexity,
        'excellence_complexity_defined_before_start',true,
        'excellence_quantity_target',t.quantity_target,
        'excellence_task_day',p_day,
        'excellence_cycle_id',c.id
      )
    ) on conflict do nothing;
    get diagnostics n=row_count;created:=created+n;
  end loop;
  return created;
end $$;
revoke all on function public.wms_excellence_ensure_standard_tasks(text,date) from public,anon,authenticated,service_role;
grant execute on function public.wms_excellence_ensure_standard_tasks(text,date) to authenticated;

create or replace function public.wms_excellence_claim_standard_task(p_task_id uuid)
returns public.operacao_tarefas
language plpgsql
security definer
set search_path=''
as $$
declare actor text:=private.current_wms_profile_id();t public.operacao_tarefas;task_day date;cycle_id uuid;
begin
  if actor is null then raise exception 'Autenticação necessária.' using errcode='42501';end if;
  select * into t from public.operacao_tarefas where id=p_task_id for update;
  if not found then raise exception 'Tarefa não encontrada.';end if;
  if t.referencia_tipo<>'EXCELLENCE_STANDARD' then raise exception 'Tarefa não é padrão do Logística de Excelência.';end if;
  if not private.can_access_warehouse(t.estoque_id::text) then raise exception 'Sem acesso ao estoque.' using errcode='42501';end if;
  if t.status<>'PENDENTE' or t.atribuido_para is not null then raise exception 'Esta tarefa já foi assumida por outro colaborador.';end if;
  task_day:=coalesce((t.resultado_execucao->>'excellence_task_day')::date,(now() at time zone 'America/Cuiaba')::date);
  cycle_id:=nullif(t.resultado_execucao->>'excellence_cycle_id','')::uuid;
  if cycle_id is null or not private.excellence_cycle_member(cycle_id,actor) then
    raise exception 'Colaborador não participa do ciclo ativo.' using errcode='42501';
  end if;
  update public.operacao_tarefas
  set atribuido_para=actor,status='EM_ANDAMENTO',data_inicio=now(),
      resultado_execucao=coalesce(resultado_execucao,'{}'::jsonb)||jsonb_build_object('excellence_claimed_by',actor,'excellence_claimed_at',now())
  where id=p_task_id
  returning * into t;
  return t;
end $$;
revoke all on function public.wms_excellence_claim_standard_task(uuid) from public,anon,authenticated,service_role;
grant execute on function public.wms_excellence_claim_standard_task(uuid) to authenticated;

create or replace function private.validate_excellence_standard_task_completion()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare template public.wms_excellence_task_templates;addresses text[];week_start date;count_all integer;count_distinct integer;count_valid integer;
begin
  if new.referencia_tipo<>'EXCELLENCE_STANDARD'
     or new.status not in ('AGUARDANDO_VALIDACAO','CONCLUIDA')
     or old.status in ('AGUARDANDO_VALIDACAO','CONCLUIDA') then
    return new;
  end if;
  select * into template
  from public.wms_excellence_task_templates
  where id=nullif(new.resultado_execucao->>'excellence_template_id','')::uuid
    and warehouse_code=new.estoque_id;
  if not found then raise exception 'Tarefa padrão sem configuração válida.';end if;
  if template.code='CONFERENCIA_7_ENDERECOS' then
    if jsonb_typeof(new.resultado_execucao->'enderecos_conferidos') is distinct from 'array' then
      raise exception 'Informe exatamente 7 endereços conferidos.';
    end if;
    select array_agg(upper(trim(value))),count(*),count(distinct upper(trim(value)))
      into addresses,count_all,count_distinct
    from jsonb_array_elements_text(new.resultado_execucao->'enderecos_conferidos');
    if count_all<>7 or count_distinct<>7 or exists(select 1 from unnest(addresses) a where a='') then
      raise exception 'Informe 7 endereços válidos e sem repetição.';
    end if;
    select count(distinct upper(trim(coalesce(nullif(b.location_code,''),nullif(b.codigo_endereco,''),nullif(b.endereco,''),nullif(b.address,'')))))
      into count_valid
    from public.wms_bindings b
    where b.warehouse_code=new.estoque_id
      and upper(trim(coalesce(nullif(b.location_code,''),nullif(b.codigo_endereco,''),nullif(b.endereco,''),nullif(b.address,''))))=any(addresses);
    if count_valid<>7 then
      raise exception 'Um ou mais endereços informados não existem no estoque atual.';
    end if;
    week_start:=date_trunc('week',coalesce(new.data_conclusao,now()) at time zone 'America/Cuiaba')::date;
    if exists(
      select 1 from public.wms_excellence_address_audit_items x
      where x.warehouse_code=new.estoque_id and x.week_start=week_start and x.address_code=any(addresses) and x.task_id<>new.id
    ) then raise exception 'Um ou mais endereços já foram conferidos nesta semana.';end if;
  end if;
  return new;
end $$;
revoke all on function private.validate_excellence_standard_task_completion() from public,anon,authenticated,service_role;

drop trigger if exists validate_excellence_standard_task_completion on public.operacao_tarefas;
create trigger validate_excellence_standard_task_completion
before update on public.operacao_tarefas
for each row execute function private.validate_excellence_standard_task_completion();

create or replace function private.record_excellence_standard_task_result()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare template public.wms_excellence_task_templates;cycle public.wms_excellence_cycles;validator text;week_start date;criterion text;verification jsonb;
begin
  if new.referencia_tipo<>'EXCELLENCE_STANDARD' then return new;end if;
  select * into template from public.wms_excellence_task_templates
  where id=nullif(new.resultado_execucao->>'excellence_template_id','')::uuid
    and warehouse_code=new.estoque_id;
  if not found then return new;end if;

  if new.status in ('AGUARDANDO_VALIDACAO','CONCLUIDA') and old.status not in ('AGUARDANDO_VALIDACAO','CONCLUIDA')
     and template.code='CONFERENCIA_7_ENDERECOS' then
    week_start:=date_trunc('week',coalesce(new.data_conclusao,now()) at time zone 'America/Cuiaba')::date;
    insert into public.wms_excellence_address_audit_items(warehouse_code,task_id,actor_id,address_code,week_start)
    select new.estoque_id,new.id,new.atribuido_para,upper(trim(value)),week_start
    from jsonb_array_elements_text(new.resultado_execucao->'enderecos_conferidos')
    on conflict do nothing;
  end if;

  if new.status='CONCLUIDA' and old.status is distinct from 'CONCLUIDA' and new.atribuido_para is not null then
    select * into cycle from public.wms_excellence_cycles c
    where c.id=nullif(new.resultado_execucao->>'excellence_cycle_id','')::uuid
      and c.warehouse_code=new.estoque_id and c.enabled and c.status in ('ACTIVE','CALIBRATION')
    limit 1;
    if not found or not private.excellence_cycle_member(cycle.id,new.atribuido_para) then return new;end if;
    validator:=private.current_wms_profile_id();
    criterion:=template.criterion_id;
    verification:=case when validator is not null and validator<>new.atribuido_para then jsonb_build_object(
      'criterion',criterion,'userId',new.atribuido_para,'auditorId',validator,
      'independentlyValidated',true,'responsibilityVerified',true,'result','CONFORME','at',coalesce(new.data_conclusao,now())
    ) else null end;
    insert into public.wms_excellence_evidence(
      cycle_id,warehouse_code,user_id,criterion_id,source_table,source_id,event_type,evidence_date,direction,description,metadata
    ) values(
      cycle.id,new.estoque_id,new.atribuido_para,'EXECUCAO','operacao_tarefas',new.id::text,'STANDARD_TASK_VALIDATED',
      coalesce(new.data_conclusao,now()),'POSITIVE','Tarefa padrão concluída e validada.',
      jsonb_build_object(
        'standard_task',true,'template_id',template.id,'template_code',template.code,'template_title',template.title,
        'criterion',criterion,
        'task_fact',jsonb_build_object(
          'executorVerified',true,'responsibilityVerified',true,'status','CONCLUIDA',
          'dueAt',new.prazo_sla,'completedAt',new.data_conclusao,'complexity',template.complexity,
          'complexityDefinedBeforeStart',true,'deliveryValidated',true,
          'exemptionValidated',private.excellence_absent_at(cycle.id,new.atribuido_para,coalesce(new.data_conclusao,now()))
        ),
        'verification_fact',verification
      )
    ) on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function private.record_excellence_standard_task_result() from public,anon,authenticated,service_role;

drop trigger if exists record_excellence_standard_task_result on public.operacao_tarefas;
create trigger record_excellence_standard_task_result
after update on public.operacao_tarefas
for each row execute function private.record_excellence_standard_task_result();

drop trigger if exists excellence_task_template_audit on public.wms_excellence_task_templates;
create trigger excellence_task_template_audit
after insert or update or delete on public.wms_excellence_task_templates
for each row execute function private.excellence_audit();

insert into public.wms_excellence_task_templates(
  warehouse_code,code,title,description,task_type,criterion_id,cadence,weekdays,quantity_target,complexity,sla_time,config,active
) values
('VDCG','RETIRAR_RECICLAGEM','Retirar reciclagem','Retirar a reciclagem da área operacional e deixar o ponto organizado.','ORGANIZACAO','ORGANIZACAO','DAILY',array[1,2,3,4,5,6]::smallint[],null,'SIMPLES','23:59','{}',true),
('VDCG','MONTAGEM_RECICLAGEM','Montagem da reciclagem','Montar e organizar os materiais destinados à reciclagem.','ORGANIZACAO','ORGANIZACAO','DAILY',array[1,2,3,4,5,6]::smallint[],null,'SIMPLES','23:59','{}',true),
('VDCG','CONFERENCIA_7_ENDERECOS','Conferir 7 endereços do estoque','Conferir 7 endereços por dia. O mesmo endereço não pode repetir na mesma semana.','AUDITORIA','QUALIDADE','DAILY',array[1,2,3,4,5,6]::smallint[],7,'INTERMEDIARIA','23:59','{"input":"ADDRESSES","requireUniqueWeek":true}',true),
('VDCG','TERMO_HIGROMETRO','Assinar TermoHigrômetro','Realizar e registrar a rotina diária do TermoHigrômetro.','AUDITORIA','ORGANIZACAO','DAILY',array[1,2,3,4,5,6]::smallint[],null,'SIMPLES','23:59','{}',true),
('VDCG','ORGANIZAR_PAPELAO','Organizar papelão','Organizar o papelão da área definida e manter o espaço operacional livre.','ORGANIZACAO','ORGANIZACAO','DAILY',array[1,2,3,4,5,6]::smallint[],null,'SIMPLES','23:59','{}',true)
on conflict(warehouse_code,code) do nothing;

commit;