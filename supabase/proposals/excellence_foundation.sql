begin;
create table public.wms_excellence_criteria_versions (
 id uuid primary key default gen_random_uuid(), warehouse_code text not null,
 version integer not null check(version>0), config jsonb not null check(jsonb_typeof(config)='object'),
 created_by_id text not null references public.wms_users(id), created_at timestamptz not null default now(),
 unique(warehouse_code,version),unique(id,warehouse_code)
);
create table public.wms_excellence_cycles (
 id uuid primary key default gen_random_uuid(),warehouse_code text not null,name text not null check(length(name) between 1 and 120),
 start_date date not null,end_date date not null check(end_date>=start_date),
 status text not null default 'DRAFT' check(status in ('DRAFT','ACTIVE','CALIBRATION','CLOSED','ARCHIVED')),
 enabled boolean not null default false,criteria_version_id uuid not null,
 created_by_id text not null references public.wms_users(id),created_at timestamptz not null default now(),
 closed_by_id text references public.wms_users(id),closed_at timestamptz,snapshot jsonb,
 foreign key(criteria_version_id,warehouse_code) references public.wms_excellence_criteria_versions(id,warehouse_code),
 unique(id,warehouse_code)
);
create table public.wms_excellence_evidence (
 id uuid primary key default gen_random_uuid(),cycle_id uuid not null,warehouse_code text not null,
 user_id text not null references public.wms_users(id),criterion_id text not null,
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
 justification text not null check(length(trim(justification)) between 1 and 2000),created_at timestamptz not null default now(),
 check(user_id<>evaluator_id),foreign key(cycle_id,warehouse_code) references public.wms_excellence_cycles(id,warehouse_code),
 unique(cycle_id,user_id,criterion_id)
);
create table public.wms_excellence_initiatives (
 id uuid primary key default gen_random_uuid(),cycle_id uuid not null,warehouse_code text not null,
 user_id text not null references public.wms_users(id),title text not null check(length(title) between 1 and 120),description text not null,
 status text not null default 'REGISTERED' check(status in ('REGISTERED','VALIDATED','REJECTED')),
 created_by text not null references public.wms_users(id),validated_by text references public.wms_users(id),
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
create trigger excellence_versions_immutable before update or delete on public.wms_excellence_criteria_versions for each row execute function private.excellence_immutable();
create trigger excellence_audit_immutable before update or delete on public.wms_excellence_audit_log for each row execute function private.excellence_immutable();
create function private.excellence_audit() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 insert into public.wms_excellence_audit_log(warehouse_code,actor_id,table_name,record_id,action,before_data,after_data)
 values(new.warehouse_code,private.current_wms_profile_id(),tg_table_name,new.id::text,tg_op,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return new;end $$;
do $$declare tab text;begin
 foreach tab in array array['criteria_versions','cycles','evidence','manual_scores','initiatives','assessments','calibrations','awards','audit_log'] loop
 execute format('alter table public.%I enable row level security','wms_excellence_'||tab);
 execute format('revoke all on public.%I from anon,authenticated','wms_excellence_'||tab);
 execute format('grant select on public.%I to authenticated','wms_excellence_'||tab);
 if tab in ('criteria_versions','cycles') then
 execute format('create policy excellence_read on public.%I for select to authenticated using(private.can_access_warehouse(warehouse_code) and private.current_wms_profile_id() is not null)','wms_excellence_'||tab);
 elsif tab='audit_log' then
 execute format('create policy excellence_read on public.%I for select to authenticated using(private.excellence_leader(warehouse_code))','wms_excellence_'||tab);
 else
 execute format('create policy excellence_read on public.%I for select to authenticated using(private.excellence_read(warehouse_code,user_id))','wms_excellence_'||tab);
 end if;
 if tab<>'audit_log' then execute format('create trigger excellence_audit after insert or update on public.%I for each row execute function private.excellence_audit()','wms_excellence_'||tab);end if;
 end loop;end $$;
grant execute on function private.excellence_read(text,text),private.excellence_leader(text) to authenticated;
commit;
