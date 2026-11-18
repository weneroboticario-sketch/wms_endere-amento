-- Companion API. Install after excellence_foundation.sql. No operational writes.
begin;
create function private.excellence_user(unit text,person text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.wms_users u where u.id=person and coalesce(u.active,true) and not coalesce(u.archived,false)
 and unit=any(string_to_array(coalesce(u.allowed_warehouse_codes,u.warehouse_code,''),',')))
$$;
create function private.excellence_revision(p_cycle uuid) returns text language sql stable security definer set search_path='' as $$
 select md5(to_jsonb(c)::text||coalesce((select id::text from public.wms_excellence_audit_log where warehouse_code=c.warehouse_code order by id desc limit 1),'0'))
 from public.wms_excellence_cycles c where c.id=p_cycle
$$;
create function public.wms_excellence_api(p_warehouse text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor text:=private.current_wms_profile_id();leader boolean:=private.excellence_leader(p_warehouse);
 admin boolean:=private.current_wms_role()='ADMINISTRADOR'; c public.wms_excellence_cycles;
 v uuid; result jsonb; person text; criterion text; source text; r jsonb; target text; stamp timestamptz; n integer:=0; seen integer; inserted integer:=0; cursors jsonb:='{}'; after_at timestamptz; after_id text; has_more boolean:=false; date_column text; zone text; period_start timestamptz; period_end timestamptz;
begin
 if auth.uid() is null or actor is null or not coalesce(private.can_access_warehouse(p_warehouse),false) then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 if p_action='CYCLES' then return coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.wms_excellence_cycles where warehouse_code=p_warehouse order by start_date desc,id limit 40)x),'[]');end if;
 if p_action='CREATE_CYCLE' then
 if (p_data->>'to')::date-(p_data->>'from')::date not between 0 and 62 then raise exception 'Intervalo do ciclo deve ter até 63 dias.';end if;
 if not coalesce(admin,false) then raise exception 'Administrador necessário.' using errcode='42501';end if;
 insert into public.wms_excellence_criteria_versions(warehouse_code,version,config,created_by_id)
 values(p_warehouse,(select coalesce(max(version),0)+1 from public.wms_excellence_criteria_versions where warehouse_code=p_warehouse),
 '{"engineVersion":2,"timeZone":"America/Cuiaba","minimumDays":3,"minimumSample":5,"complexityWeights":{"SIMPLES":1,"INTERMEDIARIA":2,"COMPLEXA":3},"criteria":[{"id":"EXECUCAO","weight":25,"automaticMaximum":25,"assistedMaximum":0,"formula":"EXECUTION"},{"id":"QUALIDADE","weight":25,"automaticMaximum":20,"assistedMaximum":5,"formula":"VERIFICATION"},{"id":"INICIATIVA","weight":20,"automaticMaximum":0,"assistedMaximum":20},{"id":"ORGANIZACAO","weight":10,"automaticMaximum":10,"assistedMaximum":0,"formula":"VERIFICATION"},{"id":"TRABALHO_EM_EQUIPE","weight":10,"automaticMaximum":0,"assistedMaximum":10},{"id":"POSTURA","weight":10,"automaticMaximum":0,"assistedMaximum":10}],"bands":[{"minimum":90,"label":"Excelência"},{"minimum":85,"label":"Alto desempenho"},{"minimum":80,"label":"Bom desempenho"},{"minimum":60,"label":"Em desenvolvimento"},{"minimum":0,"label":"Necessita de acompanhamento"}]}',actor) returning id into v;
 insert into public.wms_excellence_cycles(warehouse_code,name,start_date,end_date,criteria_version_id,created_by_id)
 values(p_warehouse,p_data->>'name',(p_data->>'from')::date,(p_data->>'to')::date,v,actor) returning to_jsonb(wms_excellence_cycles.*) into result;
 return result;end if;
 select * into c from public.wms_excellence_cycles where id=(p_data->>'cycle_id')::uuid and warehouse_code=p_warehouse for update;
 if not found then raise exception 'Ciclo não encontrado.';end if;
 person:=coalesce(nullif(p_data->>'user_id',''),actor);
 if not private.excellence_read(p_warehouse,person) or not private.excellence_user(p_warehouse,person) then raise exception 'Colaborador fora do acesso.' using errcode='42501';end if;
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
 'calibrations',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.wms_excellence_calibrations where cycle_id=c.id and user_id=person order by created_at desc limit 100)x),'[]'));
 end if;
 if p_action='DIRECTORY' then
 if not leader then return jsonb_build_array(jsonb_build_object('id',actor));end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from public.wms_users where private.excellence_user(p_warehouse,id)),'[]');end if;
 if c.status in ('CLOSED','ARCHIVED') then raise exception 'Ciclo fechado é imutável.';end if;
 if p_action='INITIATIVE' then
 if person<>actor then raise exception 'Registre a própria iniciativa.';end if;
 insert into public.wms_excellence_initiatives(cycle_id,warehouse_code,user_id,title,description,created_by)
 values(c.id,p_warehouse,actor,p_data->>'title',p_data->>'description',actor) returning to_jsonb(wms_excellence_initiatives.*) into result;return result;end if;
 if not leader then raise exception 'Liderança necessária.' using errcode='42501';end if;
 if p_action='ENABLE' then
 if not admin then raise exception 'Administrador necessário.';end if;
 update public.wms_excellence_cycles set enabled=true,status='ACTIVE' where id=c.id and status='DRAFT';return jsonb_build_object('enabled',true);end if;
 if not c.enabled then raise exception 'Módulo desativado neste ciclo.';end if;
 if p_action='SYNC' then
 select coalesce(config->>'timeZone','America/Cuiaba') into zone from public.wms_excellence_criteria_versions where id=c.criteria_version_id;
 period_start:=c.start_date::timestamp at time zone zone; period_end:=(c.end_date+1)::timestamp at time zone zone;
 -- Bounded backfill: cycle period only, explicit operator action, no triggers in operational tables.
 if c.end_date-c.start_date>62 then raise exception 'Processar ciclos de até 63 dias.';end if;
 foreach source in array array['operacao_tarefas','wms_replenishment_requests','wms_transfer_events','wms_history'] loop
 if pg_catalog.to_regclass('public.'||source) is null then continue;end if;
 seen:=0;
 date_column:=case when source='operacao_tarefas' then 'data_conclusao' when source='wms_replenishment_requests' then 'finished_at' else 'created_at' end;
 after_at:=nullif(p_data->'cursors'->source->>'at','')::timestamptz;
 after_id:=coalesce(p_data->'cursors'->source->>'id','');
 if after_at is not null and (after_at<period_start or after_at>=period_end) then raise exception 'Cursor fora do ciclo.';end if;
 cursors:=cursors||jsonb_build_object(source,p_data->'cursors'->source);
 for r in execute format('select to_jsonb(s) from public.%I s where s.%I=$1 and s.%I >= $2 and s.%I < $3 and ($4 is null or (s.%I,s.id::text)>($4,$5)) order by s.%I,s.id::text limit 501',source,
 case when source='operacao_tarefas' then 'estoque_id' else 'warehouse_code' end,
 date_column,date_column,date_column,date_column)
 using p_warehouse,period_start,period_end,after_at,after_id loop
 seen:=seen+1;
 if seen>500 then has_more:=true;exit;end if;
 cursors:=jsonb_set(cursors,array[source],jsonb_build_object('at',r->>date_column,'id',r->>'id'));
 target:=case source when 'operacao_tarefas' then r->>'atribuido_para' -- assignment evidence, never proof of execution
 when 'wms_replenishment_requests' then coalesce(r->>'claimed_by_id',r->>'responsavel_id') -- responsibility only
 when 'wms_transfer_events' then r->>'user_id'
 else null end;
 if target is null or not private.excellence_user(p_warehouse,target) then continue;end if;
 stamp:=coalesce(r->>'data_conclusao',r->>'finished_at',r->>'created_at')::timestamptz;
 insert into public.wms_excellence_evidence(cycle_id,warehouse_code,user_id,criterion_id,source_table,source_id,event_type,evidence_date,description,metadata)
 values(c.id,p_warehouse,target,'EXECUCAO',source,r->>'id',coalesce(r->>'event_type','OPERATION_RECORDED'),stamp,'Evento operacional registrado; contribuição sujeita à validação.',jsonb_build_object('sku',r->>'sku','quantity',r->'quantity','attribution',case when source='wms_transfer_events' then 'EVENT_ACTOR' else 'RESPONSIBILITY_NOT_EXECUTION' end,'score_effect',null)) on conflict do nothing;
 get diagnostics n=row_count;inserted:=inserted+n;
 end loop;end loop;
 return jsonb_build_object('processed',not has_more,'has_more',has_more,'cursors',cursors,'inserted',inserted,'limitations',jsonb_build_array('Tarefas: atribuição não comprova execução.','Reposição: claim mutável requer histórico autenticado.','Endereçamento: nome não estabelece identidade.','Processamento em páginas de até 500 registros por fonte, com cursor por data e ID.'));end if;
 if p_action='REVIEW_EVIDENCE' then
 if person=actor then raise exception 'Autovalidação não permitida.';end if;
 if length(trim(coalesce(p_data->>'justification','')))=0 then raise exception 'Justificativa obrigatória.';end if;
 if (p_data->>'score')::numeric not between 0 and 100 then raise exception 'Nota inválida.';end if;
 update public.wms_excellence_evidence set metadata=metadata||jsonb_build_object('reviewed_by',actor,'reviewed_at',now(),'operational_rating',(p_data->>'score')::numeric,'review_justification',p_data->>'justification') where id=(p_data->>'evidence_id')::uuid and cycle_id=c.id and user_id=person returning to_jsonb(wms_excellence_evidence.*) into result;
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
commit;
