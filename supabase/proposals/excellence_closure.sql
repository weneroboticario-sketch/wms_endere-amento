begin;
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
 select count(*) into expected from public.wms_users where private.excellence_user(c.warehouse_code,id);
 select count(distinct value->>'user_id') into supplied from jsonb_array_elements(p_assessments);
 if supplied<>expected or supplied<>jsonb_array_length(p_assessments) then raise exception 'Todos os colaboradores elegíveis precisam de avaliação completa, sem duplicação.';end if;
 foreach person in array array(select id from public.wms_users where private.excellence_user(c.warehouse_code,id)) loop
 if not exists(select 1 from jsonb_array_elements(p_assessments) x where x->>'user_id'=person) then raise exception 'Colaborador sem avaliação.';end if;
 end loop;
 for item in select value from jsonb_array_elements(p_assessments) loop
 if not private.excellence_user(c.warehouse_code,item->>'user_id') or item->'calculation'->>'version' is distinct from c.criteria_version_id::text
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
