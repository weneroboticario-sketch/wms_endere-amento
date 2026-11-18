-- Isolated Logística de Excelência foundation. No operational table changes.
begin;
create table public.wms_excellence_criteria_versions (
 id uuid primary key default gen_random_uuid(), warehouse_code text not null,
 operational_weight numeric not null default 55,leadership_weight numeric not null default 45,check(operational_weight+leadership_weight=100),version integer not null check(version>0), config jsonb not null check(jsonb_typeof(config)='object'),
 created_by_id text not null references public.wms_users(id), created_at timestamptz not null default now(),
 unique(warehouse_code,version),unique(id,warehouse_code)
);
create table public.wms_excellence_criteria (
 id uuid primary key default gen_random_uuid(),version_id uuid not null,warehouse_code text not null,criterion_id text not null,
 weight numeric not null check(weight between 0 and 100),automatic_maximum numeric not null check(automatic_maximum>=0),assisted_maximum numeric not null check(assisted_maximum>=0),
 check(automatic_maximum+assisted_maximum=weight),foreign key(version_id,warehouse_code) references public.wms_excellence_criteria_versions(id,warehouse_code),unique(version_id,criterion_id)
);
create function private.excellence_materialize_criteria() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (select sum((r->>'weight')::numeric) from jsonb_array_elements(new.config->'criteria')r)<>100 then raise exception 'Pesos precisam somar 100.';end if;
 insert into public.wms_excellence_criteria(version_id,warehouse_code,criterion_id,weight,automatic_maximum,assisted_maximum)
 select new.id,new.warehouse_code,r->>'id',(r->>'weight')::numeric,(r->>'automaticMaximum')::numeric,(r->>'assistedMaximum')::numeric from jsonb_array_elements(new.config->'criteria')r;
 return new;
end $$;
create trigger excellence_criteria_materialize after insert on public.wms_excellence_criteria_versions for each row execute function private.excellence_materialize_criteria();
create table public.wms_excellence_cycles (
 id uuid primary key default gen_random_uuid(),warehouse_code text not null,name text not null check(length(name) between 1 and 120),
 start_date date not null,end_date date not null check(end_date>=start_date),
 status text not null default 'DRAFT' check(status in ('DRAFT','ACTIVE','CALIBRATION','CLOSED','ARCHIVED')),
 enabled boolean not null default false,criteria_version_id uuid not null,
 created_by_id text not null references public.wms_users(id),created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),closed_by_id text references public.wms_users(id),closed_at timestamptz,snapshot jsonb,
 foreign key(criteria_version_id,warehouse_code) references public.wms_excellence_criteria_versions(id,warehouse_code),
 unique(id,warehouse_code)
);
create table public.wms_excellence_cycle_members (
 id uuid primary key default gen_random_uuid(),cycle_id uuid not null,warehouse_code text not null,
 user_id text not null references public.wms_users(id),role_snapshot text,function_snapshot text,
 eligible boolean not null default true,included_from date,included_to date,eligibility_reason text,
 created_by_id text not null references public.wms_users(id),created_at timestamptz not null default now(),
 updated_by_id text references public.wms_users(id),updated_at timestamptz not null default now(),
 foreign key(cycle_id,warehouse_code) references public.wms_excellence_cycles(id,warehouse_code),
 unique(cycle_id,user_id),check(included_to is null or included_from is null or included_to>=included_from)
);
create table public.wms_excellence_absences (
 id uuid primary key default gen_random_uuid(),cycle_id uuid not null,warehouse_code text not null,
 user_id text not null references public.wms_users(id),
 absence_type text not null check(absence_type in ('FERIAS','FOLGA','ATESTADO','AFASTAMENTO','TREINAMENTO','OUTRA_ATIVIDADE')),
 start_date date not null,end_date date not null check(end_date>=start_date),
 status text not null default 'VALIDATED' check(status in ('VALIDATED','CANCELLED')),
 justification text not null check(length(trim(justification)) between 1 and 1000),
 created_by_id text not null references public.wms_users(id),created_at timestamptz not null default now(),
 foreign key(cycle_id,warehouse_code) references public.wms_excellence_cycles(id,warehouse_code)
);
create table public.wms_excellence_evidence (
 id uuid primary key default gen_random_uuid(),cycle_id uuid not null,warehouse_code text not null,
 user_id text not null references public.wms_users(id),user_name_snapshot text,created_by_id text references public.wms_users(id),source_type text not null default 'WMS',weight numeric,score_effect numeric,criterion_id text not null,
 source_table text not null,source_id text not null,event_type text not null,evidence_date timestamptz not null,
 direction text not null default 'NEUTRAL' check(direction in ('POSITIVE','NEUTRAL','NEGATIVE')),
 description text not null,metadata jsonb not null default '{}',automatic boolean not null default true,
 created_at timestamptz not null default now(),
 foreign key(cycle_id,warehouse_code) references public.wms_excellence_cycles(id,warehouse_code),
 unique(cycle_id,source_table,source_id,event_type,user_id,criterion_id)
);
create table public.wms_excellence_manual_scores (
 id uuid primary key default gen_random_uuid(),cycle_id uuid not null,warehouse_code text not null,
 user_id text not null references public.wms_users(id),evaluator_id text not null references public.wms_users(id),
 evidence_ids uuid[] not null default '{}',criterion_id text not null,score numeric not null check(score between 0 and 100),
 updated_at timestamptz not null default now(),justification text not null check(length(trim(justification)) between 1 and 2000),created_at timestamptz not null default now(),
 check(user_id<>evaluator_id),foreign key(cycle_id,warehouse_code) references public.wms_excellence_cycles(id,warehouse_code),
 unique(cycle_id,user_id,criterion_id)
);
create table public.wms_excellence_initiatives (
 id uuid primary key default gen_random_uuid(),cycle_id uuid not null,warehouse_code text not null,
 user_id text not null references public.wms_users(id),title text not null check(length(title) between 1 and 120),description text not null,
 status text not null default 'REGISTERED' check(status in ('REGISTERED','VALIDATED','REJECTED')),
 validation_notes text,created_by text not null references public.wms_users(id),validated_by text references public.wms_users(id),
 created_at timestamptz not null default now(),validated_at timestamptz,
 check(validated_by is null or validated_by<>user_id),
 foreign key(cycle_id,warehouse_code) references public.wms_excellence_cycles(id,warehouse_code)
);
create table public.wms_excellence_assessments (
 id uuid primary key default gen_random_uuid(),cycle_id uuid not null,warehouse_code text not null,
 user_id text not null references public.wms_users(id),result jsonb not null,
 created_at timestamptz not null default now(),
 foreign key(cycle_id,warehouse_code) references public.wms_excellence_cycles(id,warehouse_code),unique(cycle_id,user_id)
);
create table public.wms_excellence_calibrations (
 id uuid primary key default gen_random_uuid(),cycle_id uuid not null,warehouse_code text not null,
 user_id text not null references public.wms_users(id),actor_id text not null references public.wms_users(id),
 previous_score numeric,new_score numeric not null check(new_score between 0 and 100),
 justification text not null check(length(trim(justification)) between 1 and 2000),created_at timestamptz not null default now(),
 check(user_id<>actor_id),foreign key(cycle_id,warehouse_code) references public.wms_excellence_cycles(id,warehouse_code)
);
create table public.wms_excellence_awards (
 id uuid primary key default gen_random_uuid(),cycle_id uuid not null,warehouse_code text not null,
 user_id text not null references public.wms_users(id),category text not null,
 proposed_by text not null references public.wms_users(id),approved_by text references public.wms_users(id),
 status text not null default 'PROPOSED' check(status in ('PROPOSED','APPROVED','REJECTED','DELIVERED')),
 created_at timestamptz not null default now(),foreign key(cycle_id,warehouse_code) references public.wms_excellence_cycles(id,warehouse_code)
);
create table public.wms_excellence_audit_log (
 id bigint generated always as identity primary key,warehouse_code text not null,actor_id text references public.wms_users(id),
 table_name text not null,record_id text not null,action text not null,before_data jsonb,after_data jsonb,
 created_at timestamptz not null default now()
);
create index excellence_evidence_person_period on public.wms_excellence_evidence(cycle_id,user_id,evidence_date desc,id);
create index excellence_cycles_unit_period on public.wms_excellence_cycles(warehouse_code,start_date,end_date);
create index excellence_cycle_members_cycle_user on public.wms_excellence_cycle_members(cycle_id,user_id) where eligible;
create index excellence_cycle_members_user on public.wms_excellence_cycle_members(user_id,cycle_id);
create index excellence_absences_cycle_user_period on public.wms_excellence_absences(cycle_id,user_id,start_date,end_date) where status='VALIDATED';
create index excellence_audit_unit_revision on public.wms_excellence_audit_log(warehouse_code,id desc);
create index excellence_audit_unit_date on public.wms_excellence_audit_log(warehouse_code,created_at desc);

create function private.excellence_leader(unit text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.current_wms_role() in ('ADMINISTRADOR','SUPERVISOR') and private.can_access_warehouse(unit)
$$;
create function private.excellence_read(unit text,person text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.can_access_warehouse(unit) and
 (private.excellence_leader(unit) or person=private.current_wms_profile_id())
$$;
create function private.excellence_immutable() returns trigger language plpgsql set search_path='' as $$
 begin raise exception 'Registro imutável: crie uma nova versão.';end $$;
create trigger excellence_criteria_immutable before update or delete on public.wms_excellence_criteria for each row execute function private.excellence_immutable();
create trigger excellence_versions_immutable before update or delete on public.wms_excellence_criteria_versions for each row execute function private.excellence_immutable();
create trigger excellence_audit_immutable before update or delete on public.wms_excellence_audit_log for each row execute function private.excellence_immutable();
create function private.excellence_audit() returns trigger language plpgsql security definer set search_path='' as $audit$
 declare row_data jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 begin
 insert into public.wms_excellence_audit_log(warehouse_code,actor_id,table_name,record_id,action,before_data,after_data)
 values(row_data->>'warehouse_code',private.current_wms_profile_id(),tg_table_name,row_data->>'id',tg_op,
  case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
  case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end);
 return case when tg_op='DELETE' then old else new end;end $audit$;
do $$declare tab text;begin
 foreach tab in array array['criteria_versions','criteria','cycles','cycle_members','absences','evidence','manual_scores','initiatives','assessments','calibrations','awards','audit_log'] loop
 execute format('alter table public.%I enable row level security','wms_excellence_'||tab);
 execute format('revoke all on public.%I from anon,authenticated','wms_excellence_'||tab);
 execute format('grant select on public.%I to authenticated','wms_excellence_'||tab);
 if tab in ('criteria_versions','criteria','cycles') then
 execute format('create policy excellence_read on public.%I for select to authenticated using(private.can_access_warehouse(warehouse_code) and private.current_wms_profile_id() is not null)','wms_excellence_'||tab);
 elsif tab='audit_log' then
 execute format('create policy excellence_read on public.%I for select to authenticated using(private.excellence_leader(warehouse_code))','wms_excellence_'||tab);
 else
 execute format('create policy excellence_read on public.%I for select to authenticated using(private.excellence_read(warehouse_code,user_id))','wms_excellence_'||tab);
 end if;
 if tab<>'audit_log' then execute format('create trigger excellence_audit after insert or update or delete on public.%I for each row execute function private.excellence_audit()','wms_excellence_'||tab);end if;
 end loop;end $$;
grant execute on function private.excellence_read(text,text),private.excellence_leader(text) to authenticated;

create function private.excellence_evidence_identity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.user_name_snapshot:=(select name from public.wms_users where id=new.user_id);
 new.created_by_id:=private.current_wms_profile_id();
 return new;
end $$;
create trigger excellence_evidence_identity before insert on public.wms_excellence_evidence for each row execute function private.excellence_evidence_identity();
create function private.excellence_updated() returns trigger language plpgsql set search_path='' as $$begin new.updated_at:=now();return new;end $$;
create trigger excellence_cycle_updated before update on public.wms_excellence_cycles for each row execute function private.excellence_updated();
create trigger excellence_manual_updated before update on public.wms_excellence_manual_scores for each row execute function private.excellence_updated();


create function private.excellence_replenishment_fact(r jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare actor text:=coalesce(nullif(r->>'responsavel_id',''),nullif(r->>'claimed_by_id','')); kind text; qty numeric; requested numeric; direction text:='NEUTRAL';
begin
 if coalesce((r->>'is_deleted')::boolean,false) then return null;end if;
 qty:=nullif(r->>'quantidade_atendida','')::numeric; requested:=nullif(r->>'quantidade_solicitada','')::numeric;
 if r->>'status' in ('CONCLUIDO','ENTREGUE_NA_LOJA') then
  kind:=case when qty is null or requested is null then 'REPLENISHMENT_COMPLETED' when qty>=requested then 'REPLENISHMENT_COMPLETED_FULL' else 'REPLENISHMENT_COMPLETED_PARTIAL' end;
  if qty>=requested then direction:='POSITIVE';end if;
 elsif r->>'status'='SEM_ESTOQUE' then kind:='REPLENISHMENT_NO_STOCK';
 elsif actor is not null and nullif(r->>'claimed_at','') is not null and (nullif(r->>'returned_to_queue_at','') is null or (r->>'claimed_at')::timestamptz>(r->>'returned_to_queue_at')::timestamptz) then kind:='REPLENISHMENT_ASSIGNED';
 elsif nullif(r->>'returned_to_queue_at','') is not null then
  actor:=nullif(r->>'returned_to_queue_by_id','');kind:='REPLENISHMENT_RETURNED_TO_QUEUE';
 else return null;end if;
 if actor is null then return null;end if;
 return jsonb_build_object('actor',actor,'event',kind,'direction',direction,'sku',r->>'codigo_material',
 'requested',requested,'attended',qty,'pending',r->'quantidade_pendente','duration_seconds',r->'duration_seconds',
 'started_at',r->'started_at','claimed_at',r->'claimed_at','finished_at',r->'finished_at',
 'opportunity_verified',nullif(r->>'started_at','') is not null and nullif(r->>'claimed_at','') is not null and r->>'responsavel_id'=r->>'claimed_by_id','responsible_id',r->>'responsavel_id','claimed_by_id',r->>'claimed_by_id','score_effect',null,
 'attribution','RECORDED_RESPONSIBLE','limitation','Responsável registrado não comprova execução exclusiva ou prazo acordado.');
end $$;

-- Companion API. Install after excellence_foundation.sql. No operational writes.
create function private.excellence_user(unit text,person text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.wms_users u where u.id=person and coalesce(u.active,true) and not coalesce(u.archived,false)
 and unit=any(string_to_array(coalesce(u.allowed_warehouse_codes,u.warehouse_code,''),',')))
$$;
create function private.excellence_cycle_member(p_cycle uuid,person text) returns boolean language sql stable security definer set search_path='' as $cycle$
 select exists(select 1 from public.wms_excellence_cycle_members m
  where m.cycle_id=p_cycle and m.user_id=person and m.eligible
  and (m.included_from is null or m.included_from <= (select end_date from public.wms_excellence_cycles where id=p_cycle))
  and (m.included_to is null or m.included_to >= (select start_date from public.wms_excellence_cycles where id=p_cycle)))
$cycle$;
create function private.excellence_absent_at(p_cycle uuid,person text,moment timestamptz) returns boolean language sql stable security definer set search_path='' as $absence$
 select exists(
  select 1 from public.wms_excellence_absences a
  join public.wms_excellence_cycles c on c.id=a.cycle_id
  join public.wms_excellence_criteria_versions v on v.id=c.criteria_version_id
  where a.cycle_id=p_cycle and a.user_id=person and a.status='VALIDATED'
  and (moment at time zone coalesce(v.config->>'timeZone','America/Cuiaba'))::date between a.start_date and a.end_date
 )
$absence$;
create function private.excellence_revision(p_cycle uuid) returns text language sql stable security definer set search_path='' as $revision$
 select md5(to_jsonb(c)::text||coalesce((select id::text from public.wms_excellence_audit_log where warehouse_code=c.warehouse_code order by id desc limit 1),'0'))
 from public.wms_excellence_cycles c where c.id=p_cycle
$revision$;
create function public.wms_excellence_api(p_warehouse text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor text:=private.current_wms_profile_id();leader boolean:=private.excellence_leader(p_warehouse);
 admin boolean:=private.current_wms_role()='ADMINISTRADOR'; c public.wms_excellence_cycles;
 v uuid; result jsonb; person text; criterion text; source text; r jsonb; target text; stamp timestamptz; n integer:=0; seen integer; inserted integer:=0; cursors jsonb:='{}'; after_at timestamptz; after_id text; has_more boolean:=false; date_column text; zone text; period_start timestamptz; period_end timestamptz; replenishment_fact jsonb; origin_record jsonb; origin_evidence public.wms_excellence_evidence; date_expression text;
begin
 if auth.uid() is null or actor is null or not coalesce(private.can_access_warehouse(p_warehouse),false) then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 if p_action='CYCLES' then return coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.wms_excellence_cycles where warehouse_code=p_warehouse order by start_date desc,id limit 40)x),'[]');end if;
 if p_action='CANDIDATES' then
  if not leader then raise exception 'Liderança necessária.' using errcode='42501';end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
   'id',u.id,'name',u.name,'role',u.role,
   'selected',exists(select 1 from public.wms_excellence_cycle_members m where m.cycle_id=nullif(p_data->>'cycle_id','')::uuid and m.user_id=u.id and m.eligible)
  ))
   from public.wms_users u where private.excellence_user(p_warehouse,u.id)),'[]');
 end if;
 if p_action='CREATE_CYCLE' then
 if coalesce(p_data->>'execution_model','REPLENISHMENT') not in ('REPLENISHMENT','TASKS') then raise exception 'Modelo de execução inválido.';end if;
 if (p_data->>'to')::date-(p_data->>'from')::date not between 0 and 62 then raise exception 'Intervalo do ciclo deve ter até 63 dias.';end if;
 if not coalesce(admin,false) then raise exception 'Administrador necessário.' using errcode='42501';end if;
 insert into public.wms_excellence_criteria_versions(warehouse_code,version,config,created_by_id)
 values(p_warehouse,(select coalesce(max(version),0)+1 from public.wms_excellence_criteria_versions where warehouse_code=p_warehouse),
 '{"engineVersion":2,"timeZone":"America/Cuiaba","minimumDays":3,"minimumSample":5,"complexityWeights":{"SIMPLES":1,"INTERMEDIARIA":2,"COMPLEXA":3},"criteria":[{"id":"EXECUCAO","weight":25,"automaticMaximum":25,"assistedMaximum":0,"formula":"EXECUTION"},{"id":"QUALIDADE","weight":25,"automaticMaximum":20,"assistedMaximum":5,"formula":"VERIFICATION"},{"id":"INICIATIVA","weight":20,"automaticMaximum":0,"assistedMaximum":20},{"id":"ORGANIZACAO","weight":10,"automaticMaximum":10,"assistedMaximum":0,"formula":"VERIFICATION"},{"id":"TRABALHO_EM_EQUIPE","weight":10,"automaticMaximum":0,"assistedMaximum":10},{"id":"POSTURA","weight":10,"automaticMaximum":0,"assistedMaximum":10}],"bands":[{"minimum":90,"label":"Excelência"},{"minimum":85,"label":"Alto desempenho"},{"minimum":80,"label":"Bom desempenho"},{"minimum":60,"label":"Em desenvolvimento"},{"minimum":0,"label":"Necessita de acompanhamento"}]}'::jsonb || jsonb_build_object('executionModel',coalesce(p_data->>'execution_model','REPLENISHMENT')),actor) returning id into v;
 insert into public.wms_excellence_cycles(warehouse_code,name,start_date,end_date,criteria_version_id,created_by_id)
 values(p_warehouse,p_data->>'name',(p_data->>'from')::date,(p_data->>'to')::date,v,actor) returning to_jsonb(wms_excellence_cycles.*) into result;
 return result;end if;
 select * into c from public.wms_excellence_cycles where id=(p_data->>'cycle_id')::uuid and warehouse_code=p_warehouse for update;
 if not found then raise exception 'Ciclo não encontrado.';end if;
 if p_action='SET_MEMBERS' then
  if not admin or c.status<>'DRAFT' then raise exception 'Equipe só pode ser definida pelo administrador antes da ativação.' using errcode='42501';end if;
  if jsonb_typeof(p_data->'member_ids') is distinct from 'array' or jsonb_array_length(p_data->'member_ids')=0 then raise exception 'Selecione ao menos um colaborador.';end if;
  delete from public.wms_excellence_cycle_members where cycle_id=c.id;
  insert into public.wms_excellence_cycle_members(cycle_id,warehouse_code,user_id,role_snapshot,included_from,included_to,created_by_id)
  select c.id,p_warehouse,u.id,u.role,c.start_date,c.end_date,actor
  from public.wms_users u
  where private.excellence_user(p_warehouse,u.id)
    and u.id in (select distinct jsonb_array_elements_text(p_data->'member_ids'));
  get diagnostics n=row_count;
  if n<>(select count(distinct value) from jsonb_array_elements_text(p_data->'member_ids')) then raise exception 'Há colaborador inválido ou fora da unidade.';end if;
  return coalesce((select jsonb_agg(to_jsonb(m)) from public.wms_excellence_cycle_members m where m.cycle_id=c.id),'[]');
 end if;
 if p_action='SET_MEMBER_ELIGIBILITY' then
  if not admin or c.status in ('CLOSED','ARCHIVED') then raise exception 'Administrador necessário para alterar elegibilidade.' using errcode='42501';end if;
  person:=nullif(p_data->>'user_id','');
  if person is null or length(trim(coalesce(p_data->>'justification','')))=0 then raise exception 'Colaborador e justificativa são obrigatórios.';end if;
  update public.wms_excellence_cycle_members
   set eligible=(p_data->>'eligible')::boolean,eligibility_reason=p_data->>'justification',updated_by_id=actor,updated_at=now()
   where cycle_id=c.id and user_id=person
   returning to_jsonb(wms_excellence_cycle_members.*) into result;
  if result is null then raise exception 'Colaborador não pertence ao ciclo.';end if;
  return result;
 end if;
 if p_action='ADD_ABSENCE' then
  if not leader or c.status in ('CLOSED','ARCHIVED') then raise exception 'Liderança necessária para registrar elegibilidade.' using errcode='42501';end if;
  person:=nullif(p_data->>'user_id','');
  if person is null or not private.excellence_cycle_member(c.id,person) then raise exception 'Colaborador fora do ciclo.';end if;
  if (p_data->>'absence_type') not in ('FERIAS','FOLGA','ATESTADO','AFASTAMENTO','TREINAMENTO','OUTRA_ATIVIDADE') then raise exception 'Tipo de ausência inválido.';end if;
  if (p_data->>'from')::date<c.start_date or (p_data->>'to')::date>c.end_date or (p_data->>'to')::date<(p_data->>'from')::date then raise exception 'Período de ausência fora do ciclo.';end if;
  insert into public.wms_excellence_absences(cycle_id,warehouse_code,user_id,absence_type,start_date,end_date,justification,created_by_id)
  values(c.id,p_warehouse,person,p_data->>'absence_type',(p_data->>'from')::date,(p_data->>'to')::date,p_data->>'justification',actor)
  returning to_jsonb(wms_excellence_absences.*) into result;
  update public.wms_excellence_evidence e set metadata=jsonb_set(e.metadata,'{exemption_validated}','true'::jsonb,true)
   where e.cycle_id=c.id and e.user_id=person
   and (e.evidence_date at time zone coalesce((select config->>'timeZone' from public.wms_excellence_criteria_versions where id=c.criteria_version_id),'America/Cuiaba'))::date
       between (p_data->>'from')::date and (p_data->>'to')::date;
  return result;
 end if;
 if p_action='REMOVE_ABSENCE' then
  if not leader or c.status in ('CLOSED','ARCHIVED') then raise exception 'Liderança necessária.' using errcode='42501';end if;
  update public.wms_excellence_absences set status='CANCELLED'
   where id=(p_data->>'absence_id')::uuid and cycle_id=c.id and status='VALIDATED'
   returning to_jsonb(wms_excellence_absences.*) into result;
  if result is null then raise exception 'Ausência não encontrada.';end if;
  person:=result->>'user_id';
  update public.wms_excellence_evidence e set metadata=jsonb_set(e.metadata,'{exemption_validated}',to_jsonb(private.excellence_absent_at(c.id,person,e.evidence_date)),true)
   where e.cycle_id=c.id and e.user_id=person;
  return result;
 end if;
 person:=coalesce(nullif(p_data->>'user_id',''),actor);
 if not private.excellence_read(p_warehouse,person) or not private.excellence_user(p_warehouse,person) then raise exception 'Colaborador fora do acesso.' using errcode='42501';end if;
 if (not leader or person<>actor) and not private.excellence_cycle_member(c.id,person) then raise exception 'Colaborador fora do ciclo.' using errcode='42501';end if;
 if p_action='ORIGIN' then
 select * into origin_evidence from public.wms_excellence_evidence where id=(p_data->>'evidence_id')::uuid and cycle_id=c.id and user_id=person;
 if not found or origin_evidence.source_table<>'wms_replenishment_requests' then raise exception 'Origem não disponível para esta evidência.';end if;
 select to_jsonb(origin_row) into origin_record from public.wms_replenishment_requests origin_row where origin_row.id=origin_evidence.source_id and origin_row.warehouse_code=p_warehouse;
 if origin_record is null then return jsonb_build_object('available',false,'message','Origem removida ou não disponível; evidência histórica preservada.');end if;
 return jsonb_build_object('available',true,'id',origin_record->>'id','sku',origin_record->>'codigo_material','status',origin_record->>'status','requested',origin_record->'quantidade_solicitada','attended',origin_record->'quantidade_atendida','pending',origin_record->'quantidade_pendente','responsible_id',origin_record->>'responsavel_id','started_at',origin_record->'started_at','finished_at',origin_record->'finished_at','duration_seconds',origin_record->'duration_seconds');
 end if;
 if p_action='ASSESSMENT' then
 select to_jsonb(a) into result from public.wms_excellence_assessments a where cycle_id=c.id and user_id=person;
 if result is null then raise exception 'Snapshot não encontrado.';end if;return result;
 end if;
 if p_action='EVIDENCE_PAGE' then
 return jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.wms_excellence_evidence where cycle_id=c.id and user_id=person
 and (nullif(p_data->>'before_at','') is null or (evidence_date,id)<((p_data->>'before_at')::timestamptz,(p_data->>'before_id')::uuid))
 order by evidence_date desc,id desc limit 100)x),'[]'), 'revision',private.excellence_revision(c.id));
 end if;
 if p_action='DASHBOARD' then
 return jsonb_build_object('revision',private.excellence_revision(c.id),'period',jsonb_build_object('from',c.start_date::timestamp at time zone coalesce((select config->>'timeZone' from public.wms_excellence_criteria_versions where id=c.criteria_version_id),'America/Cuiaba'),'to',(c.end_date+1)::timestamp at time zone coalesce((select config->>'timeZone' from public.wms_excellence_criteria_versions where id=c.criteria_version_id),'America/Cuiaba')),'cycle',to_jsonb(c),'config',(select config from public.wms_excellence_criteria_versions where id=c.criteria_version_id),
 'evidence',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.wms_excellence_evidence where cycle_id=c.id and user_id=person order by evidence_date desc,id desc limit 100)x),'[]'),
 'evidenceTruncated',(select count(*)>100 from public.wms_excellence_evidence where cycle_id=c.id and user_id=person),'scores',coalesce((select jsonb_agg(to_jsonb(x)) from public.wms_excellence_manual_scores x where cycle_id=c.id and user_id=person),'[]'),
 'initiatives',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.wms_excellence_initiatives where cycle_id=c.id and user_id=person order by created_at desc limit 100)x),'[]'),
 'calibrations',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.wms_excellence_calibrations where cycle_id=c.id and user_id=person order by created_at desc limit 100)x),'[]'),
 'absences',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.wms_excellence_absences where cycle_id=c.id and user_id=person and status='VALIDATED' order by start_date,id)x),'[]'));
 end if;
 if p_action='TEAM' then
 if not leader then raise exception 'Liderança necessária.' using errcode='42501';end if;
 if (select count(*) from public.wms_excellence_evidence where cycle_id=c.id)>10000 then raise exception 'Equipe excede limite seguro para cálculo detalhado.';end if;
 return jsonb_build_object('cycle',to_jsonb(c),'config',(select config from public.wms_excellence_criteria_versions where id=c.criteria_version_id),
 'period',jsonb_build_object('from',c.start_date::timestamp at time zone 'America/Cuiaba','to',(c.end_date+1)::timestamp at time zone 'America/Cuiaba'),
 'members',coalesce((with proof as(select user_id,jsonb_agg(to_jsonb(e) order by evidence_date desc,id desc) evidence from public.wms_excellence_evidence e where cycle_id=c.id group by user_id),
 rating as(select user_id,jsonb_agg(to_jsonb(m)) scores from public.wms_excellence_manual_scores m where cycle_id=c.id group by user_id),
 leave as(select user_id,jsonb_agg(to_jsonb(a) order by start_date,id) absences from public.wms_excellence_absences a where cycle_id=c.id and status='VALIDATED' group by user_id)
 select jsonb_agg(jsonb_build_object('user_id',u.id,'name',u.name,'evidence',coalesce(proof.evidence,'[]'::jsonb),'scores',coalesce(rating.scores,'[]'::jsonb),
 'absences',coalesce(leave.absences,'[]'::jsonb),
 'snapshot',(select a.result from public.wms_excellence_assessments a where a.cycle_id=c.id and a.user_id=u.id)))
 from public.wms_excellence_cycle_members cm
 join public.wms_users u on u.id=cm.user_id
 left join proof on proof.user_id=u.id left join rating on rating.user_id=u.id left join leave on leave.user_id=u.id
 where cm.cycle_id=c.id and cm.eligible and private.excellence_user(p_warehouse,u.id)),'[]'::jsonb));end if;
 if p_action='DIRECTORY' then
 if not leader then
  if not private.excellence_cycle_member(c.id,actor) then return '[]'::jsonb;end if;
  return jsonb_build_array(jsonb_build_object('id',actor,'name',(select name from public.wms_users where id=actor)));
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name))
  from public.wms_excellence_cycle_members m join public.wms_users u on u.id=m.user_id
  where m.cycle_id=c.id and m.eligible and private.excellence_user(p_warehouse,u.id)),'[]');end if;
 if c.status in ('CLOSED','ARCHIVED') then raise exception 'Ciclo fechado é imutável.';end if;
 if p_action='INITIATIVE' then
 if person<>actor then raise exception 'Registre a própria iniciativa.';end if;
 insert into public.wms_excellence_initiatives(cycle_id,warehouse_code,user_id,title,description,created_by)
 values(c.id,p_warehouse,actor,p_data->>'title',p_data->>'description',actor) returning to_jsonb(wms_excellence_initiatives.*) into result;return result;end if;
 if not leader then raise exception 'Liderança necessária.' using errcode='42501';end if;
 if p_action='ENABLE' then
 if not admin then raise exception 'Administrador necessário.';end if;
 if not exists(select 1 from public.wms_excellence_cycle_members where cycle_id=c.id and eligible) then raise exception 'Defina a equipe do ciclo antes de ativar.';end if;
 update public.wms_excellence_cycles set enabled=true,status='ACTIVE' where id=c.id and status='DRAFT';return jsonb_build_object('enabled',true);end if;
 if not c.enabled then raise exception 'Módulo desativado neste ciclo.';end if;
 if p_action='SYNC' then
 select coalesce(config->>'timeZone','America/Cuiaba') into zone from public.wms_excellence_criteria_versions where id=c.criteria_version_id;
 period_start:=c.start_date::timestamp at time zone zone; period_end:=(c.end_date+1)::timestamp at time zone zone;
 -- Bounded backfill: cycle period only, explicit operator action, no triggers in operational tables.
 if c.end_date-c.start_date>62 then raise exception 'Processar ciclos de até 63 dias.';end if;
 foreach source in array array['operacao_tarefas','wms_replenishment_requests','wms_transfer_events'] loop
 if pg_catalog.to_regclass('public.'||source) is null then continue;end if;
 seen:=0;
 date_column:=case when source='operacao_tarefas' then 'data_conclusao' when source='wms_replenishment_requests' then 'finished_at' else 'created_at' end;
 after_at:=nullif(p_data->'cursors'->source->>'at','')::timestamptz;
 after_id:=coalesce(p_data->'cursors'->source->>'id','');
 if after_at is not null and (after_at<period_start or after_at>=period_end) then raise exception 'Cursor fora do ciclo.';end if;
 date_expression:=case when source='wms_replenishment_requests' then 'coalesce(s.finished_at,s.returned_to_queue_at,s.claimed_at)' else format('s.%I',date_column) end;
 cursors:=cursors||jsonb_build_object(source,p_data->'cursors'->source);
 for r in execute format('select to_jsonb(s) from public.%I s where s.%I=$1 and %s >= $2 and %s < $3 and ($4 is null or (%s,s.id::text)>($4,$5)) order by %s,s.id::text limit 501',source,
 case when source='operacao_tarefas' then 'estoque_id' else 'warehouse_code' end,
 date_expression,date_expression,date_expression,date_expression)
 using p_warehouse,period_start,period_end,after_at,after_id loop
 seen:=seen+1;
 if seen>500 then has_more:=true;exit;end if;
 cursors:=jsonb_set(cursors,array[source],jsonb_build_object('at',coalesce(r->>date_column,r->>'returned_to_queue_at',r->>'claimed_at'),'id',r->>'id'));
 if source='operacao_tarefas' and upper(coalesce(r->>'referencia_tipo','')) in ('REPOSICAO','TRANSFERENCIA') then continue;end if;
 replenishment_fact:=case when source='wms_replenishment_requests' then private.excellence_replenishment_fact(r) else null end;
 target:=case source when 'operacao_tarefas' then r->>'atribuido_para' -- assignment evidence, never proof of execution
 when 'wms_replenishment_requests' then replenishment_fact->>'actor' -- responsibility only
 when 'wms_transfer_events' then r->>'user_id'
 else null end;
 if target is null or not private.excellence_user(p_warehouse,target) or not private.excellence_cycle_member(c.id,target) then continue;end if;
 stamp:=coalesce(r->>'data_conclusao',r->>'finished_at',r->>'created_at',r->>'returned_to_queue_at',r->>'claimed_at')::timestamptz;
 insert into public.wms_excellence_evidence(cycle_id,warehouse_code,user_id,criterion_id,source_table,source_id,event_type,evidence_date,direction,description,metadata)
 values(c.id,p_warehouse,target,'EXECUCAO',source,r->>'id',coalesce(replenishment_fact->>'event',r->>'event_type','OPERATION_RECORDED'),stamp,coalesce(replenishment_fact->>'direction','NEUTRAL'),case when replenishment_fact is not null then 'Reposição: atendimento registrado no WMS.' else 'Evento operacional registrado; contribuição sujeita à validação.' end,jsonb_build_object(
 'sku',coalesce(r->>'sku',r->>'codigo_material'),'quantity',coalesce(r->'quantity',r->'quantidade_atendida'),
 'attribution',case when source='wms_transfer_events' then 'EVENT_ACTOR' when replenishment_fact is not null then 'RECORDED_RESPONSIBLE' else 'RESPONSIBILITY_NOT_EXECUTION' end,
 'score_effect',null,
 'exemption_validated',private.excellence_absent_at(c.id,target,stamp),
 'task_fact',case when source='operacao_tarefas' then jsonb_build_object(
   'executorVerified',(r->>'status'='CONCLUIDA' and nullif(r->>'data_inicio','') is not null and nullif(r->>'data_conclusao','') is not null),
   'responsibilityVerified',r->>'atribuido_para'=target,
   'status',r->>'status','dueAt',r->>'prazo_sla','completedAt',r->>'data_conclusao',
   'complexity',r->'resultado_execucao'->>'excellence_complexity','complexityDefinedBeforeStart',false,
   'deliveryValidated',r->>'status'='CONCLUIDA','exemptionValidated',private.excellence_absent_at(c.id,target,stamp)
  ) else null end
 )||coalesce(replenishment_fact,'{}'::jsonb)) on conflict do nothing;
 get diagnostics n=row_count;inserted:=inserted+n;
 end loop;end loop;
 return jsonb_build_object('processed',not has_more,'has_more',has_more,'cursors',cursors,'inserted',inserted,'limitations',jsonb_build_array(
 'Tarefas derivadas de Reposição/Transferência são ignoradas para evitar dupla evidência.',
 'Tarefas independentes só pontuam automaticamente quando complexidade e prazo estiverem comprovados antes do início.',
 'Reposição usa responsável/claim autenticado; ausência validada neutraliza a oportunidade.',
 'Endereçamento sem ID confiável permanece fora da pontuação individual.',
 'Processamento em páginas de até 500 registros por fonte, com cursor por data e ID.'));end if;
 if p_action='VALIDATE_INITIATIVE' then
 if person=actor then raise exception 'Autovalidação não permitida.';end if;
 if p_data->>'decision' not in ('VALIDATED','REJECTED') or nullif(trim(p_data->>'justification'),'') is null then raise exception 'Decisão e justificativa obrigatórias.';end if;
 update public.wms_excellence_initiatives set status=p_data->>'decision',validated_by=actor,validated_at=now(),validation_notes=p_data->>'justification'
 where id=(p_data->>'initiative_id')::uuid and cycle_id=c.id and user_id=person and status='REGISTERED'
 returning to_jsonb(wms_excellence_initiatives.*) into result;
 if result is null then raise exception 'Iniciativa não encontrada ou já analisada.';end if;
 if p_data->>'decision'='VALIDATED' then
 insert into public.wms_excellence_evidence(cycle_id,warehouse_code,user_id,criterion_id,source_table,source_id,event_type,evidence_date,description,metadata,automatic)
 values(c.id,p_warehouse,person,'INICIATIVA','wms_excellence_initiatives',result->>'id','INITIATIVE_VALIDATED',(result->>'created_at')::timestamptz,result->>'title',jsonb_build_object('validated_by',actor,'justification',p_data->>'justification','score_effect',null),false) on conflict do nothing;
 end if;
 return result;end if;
 if p_action='REVIEW_EVIDENCE' then
 if person=actor then raise exception 'Autovalidação não permitida.';end if;
 if length(trim(coalesce(p_data->>'justification','')))=0 then raise exception 'Justificativa obrigatória.';end if;
 criterion:=p_data->>'criterion_id';
 if criterion not in ('QUALIDADE','ORGANIZACAO') then raise exception 'Critério de verificação inválido.';end if;
 if p_data->>'result' not in ('CONFORME','NAO_CONFORME') then raise exception 'Resultado da verificação inválido.';end if;
 update public.wms_excellence_evidence
 set metadata=metadata||jsonb_build_object(
  'reviewed_by',actor,'reviewed_at',now(),'review_justification',p_data->>'justification',
  'verification_fact',jsonb_build_object(
    'criterion',criterion,'userId',person,'auditorId',actor,'independentlyValidated',true,
    'responsibilityVerified',true,'result',p_data->>'result','at',evidence_date
  )
 )
 where id=(p_data->>'evidence_id')::uuid and cycle_id=c.id and user_id=person
 returning to_jsonb(wms_excellence_evidence.*) into result;
 if result is null then raise exception 'Evidência não encontrada.';end if;
 return result;end if;
 if p_action='MANUAL_SCORE' then
 if person=actor then raise exception 'Autovalidação não permitida.';end if;
 criterion:=p_data->>'criterion_id';
 if not exists(select 1 from public.wms_excellence_criteria_versions v,jsonb_array_elements(v.config->'criteria') k where v.id=c.criteria_version_id and k->>'id'=criterion and (k->>'assistedMaximum')::numeric>0) then raise exception 'Critério inválido.';end if;
 if jsonb_typeof(p_data->'evidence_ids') is distinct from 'array' or jsonb_array_length(p_data->'evidence_ids')=0 then raise exception 'Evidências complementares obrigatórias.';end if;
 if exists(select 1 from jsonb_array_elements_text(p_data->'evidence_ids') x where not exists(select 1 from public.wms_excellence_evidence e where e.id=x::uuid and e.cycle_id=c.id and e.user_id=person)) then raise exception 'Evidência fora da avaliação.';end if;
 insert into public.wms_excellence_manual_scores(cycle_id,warehouse_code,user_id,evaluator_id,criterion_id,score,justification,evidence_ids)
 values(c.id,p_warehouse,person,actor,criterion,(p_data->>'score')::numeric,p_data->>'justification',array(select jsonb_array_elements_text(p_data->'evidence_ids')::uuid))
 on conflict(cycle_id,user_id,criterion_id) do update set score=excluded.score,justification=excluded.justification,evidence_ids=excluded.evidence_ids,evaluator_id=actor returning to_jsonb(wms_excellence_manual_scores.*) into result;
 return result;end if;
 if p_action='CALIBRATION' then
 if person=actor then raise exception 'Autovalidação não permitida.';end if;
 update public.wms_excellence_cycles set status='CALIBRATION' where id=c.id;
 insert into public.wms_excellence_calibrations(cycle_id,warehouse_code,user_id,actor_id,previous_score,new_score,justification)
 values(c.id,p_warehouse,person,actor,(select new_score from public.wms_excellence_calibrations where cycle_id=c.id and user_id=person order by created_at desc,id desc limit 1),(p_data->>'score')::numeric,p_data->>'justification') returning to_jsonb(wms_excellence_calibrations.*) into result;return result;end if;
 raise exception 'Ação não implementada; fechamento e premiação indisponíveis nesta fundação.';
end $$;
revoke all on function public.wms_excellence_api(text,text,jsonb) from public,anon;
grant execute on function public.wms_excellence_api(text,text,jsonb) to authenticated;

-- Only a trusted backend may submit results computed with the shared engine.
-- Browser/authenticated roles cannot supply a score or snapshot directly.
create function public.wms_excellence_close_cycle(p_cycle uuid,p_actor_auth uuid,p_revision text,p_assessments jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.wms_excellence_cycles; actor public.wms_users; item jsonb; person text; expected integer; supplied integer;
begin
 select * into actor from public.wms_users where auth_user_id=p_actor_auth and coalesce(active,true) and not coalesce(archived,false);
 if not found or actor.role<>'ADMINISTRADOR' then raise exception 'Administrador autenticado necessário.' using errcode='42501';end if;
 select * into c from public.wms_excellence_cycles where id=p_cycle for update;
 if not found or not private.excellence_user(c.warehouse_code,actor.id) then raise exception 'Ciclo fora do acesso.' using errcode='42501';end if;
 if c.status<>'CALIBRATION' or not c.enabled then raise exception 'Ciclo precisa estar em calibração.';end if;
 if private.excellence_revision(c.id) is distinct from p_revision then raise exception 'Dados alterados: recalcule e revise antes de fechar.' using errcode='40001';end if;
 if jsonb_typeof(p_assessments) is distinct from 'array' or jsonb_array_length(p_assessments)=0 then raise exception 'Avaliações obrigatórias.';end if;
 select count(*) into expected from public.wms_excellence_cycle_members where cycle_id=c.id and private.excellence_cycle_member(c.id,user_id);
 select count(distinct value->>'user_id') into supplied from jsonb_array_elements(p_assessments);
 if supplied<>expected or supplied<>jsonb_array_length(p_assessments) then raise exception 'Todos os colaboradores elegíveis precisam de avaliação completa, sem duplicação.';end if;
 foreach person in array array(select user_id from public.wms_excellence_cycle_members where cycle_id=c.id and private.excellence_cycle_member(c.id,user_id)) loop
 if not exists(select 1 from jsonb_array_elements(p_assessments) x where x->>'user_id'=person) then raise exception 'Colaborador sem avaliação.';end if;
 end loop;
 for item in select value from jsonb_array_elements(p_assessments) loop
 if not private.excellence_user(c.warehouse_code,item->>'user_id') or not private.excellence_cycle_member(c.id,item->>'user_id') or item->'calculation'->>'version' is distinct from c.criteria_version_id::text
 or item->'calculation'->>'complete' is distinct from 'true' or item->'calculation'->>'pendingPoints' is distinct from '0'
 or (item->'calculation'->>'assessedPoints')::numeric not between 0 and 100
 or item->'calculation'->>'assessedPoints' is null or item->'calculation'->>'preliminary' is distinct from 'false' or (item->'calculation'->>'definitiveScore')::numeric is distinct from (item->'calculation'->>'assessedPoints')::numeric then raise exception 'Avaliação incompleta ou versão inválida.';end if;
 if jsonb_typeof(item->'calculation'->'criteria') is distinct from 'array' then raise exception 'Critérios do snapshot obrigatórios.';end if;
 if exists(select 1 from public.wms_excellence_criteria_versions cv,jsonb_array_elements(cv.config->'criteria') configured where cv.id=c.criteria_version_id and not exists(
 select 1 from jsonb_array_elements(item->'calculation'->'criteria') actual where actual->>'id'=configured->>'id' and actual->>'coverageSufficient'='true'
 and actual->>'points' is not null and (actual->>'points')::numeric between 0 and (configured->>'weight')::numeric)) then raise exception 'Cobertura incompleta nos critérios do snapshot.';end if;
 if (select count(distinct x->>'id') from jsonb_array_elements(item->'calculation'->'criteria')x)<>(select jsonb_array_length(config->'criteria') from public.wms_excellence_criteria_versions where id=c.criteria_version_id)
 or jsonb_array_length(item->'calculation'->'criteria')<>(select jsonb_array_length(config->'criteria') from public.wms_excellence_criteria_versions where id=c.criteria_version_id)
 or (select sum((x->>'points')::numeric) from jsonb_array_elements(item->'calculation'->'criteria')x) is distinct from (item->'calculation'->>'assessedPoints')::numeric then raise exception 'Composição do snapshot inválida.';end if;
 insert into public.wms_excellence_assessments(cycle_id,warehouse_code,user_id,result)
 values(c.id,c.warehouse_code,item->>'user_id',item||jsonb_build_object('criteria',(select config from public.wms_excellence_criteria_versions where id=c.criteria_version_id),'closed_by',actor.id,'closed_at',now()));
 end loop;
 update public.wms_excellence_cycles set status='CLOSED',closed_by_id=actor.id,closed_at=now(),
 snapshot=jsonb_build_object('criteria_version_id',criteria_version_id,'assessment_count',supplied,'source_revision',p_revision)
 where id=c.id;
 insert into public.wms_excellence_audit_log(warehouse_code,actor_id,table_name,record_id,action,after_data)
 values(c.warehouse_code,actor.id,'wms_excellence_cycles',c.id::text,'CLOSE',jsonb_build_object('assessment_count',supplied,'source_revision',p_revision));
 return jsonb_build_object('closed',true,'count',supplied);
end $$;
revoke all on function public.wms_excellence_close_cycle(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.wms_excellence_close_cycle(uuid,uuid,text,jsonb) to service_role;
create function private.excellence_closed_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='wms_excellence_cycles' then
  if old.status in ('CLOSED','ARCHIVED') then raise exception 'Ciclo fechado imutável.';end if;
 elsif tg_table_name='wms_excellence_assessments' then raise exception 'Snapshot fechado imutável.';
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger excellence_cycle_closed_guard before update or delete on public.wms_excellence_cycles for each row execute function private.excellence_closed_guard();
create trigger excellence_snapshot_closed_guard before update or delete on public.wms_excellence_assessments for each row execute function private.excellence_closed_guard();

commit;
