alter table public.wms_reverse_logistics add column if not exists invoice_issue_date date;
alter table public.wms_reverse_logistics add column if not exists financial_competence text
 check(financial_competence ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
alter table public.wms_reverse_logistics add column if not exists competence_review_required boolean not null default true;

create or replace function private.wms_reverse_financial_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(872601601);
 if tg_op='UPDATE' and (new.financial_competence,new.invoice_issue_date) is distinct from (old.financial_competence,old.invoice_issue_date) then
  if private.current_wms_role() not in ('ADMINISTRADOR','SUPERVISOR','COMPRAS') or length(btrim(new.fiscal_reason))<5 then
   raise exception 'Revisao de competencia exige gestor/Compras e justificativa.'; end if;
  if exists(select 1 from public.wms_loss_periods where competence=old.financial_competence and status='FECHADA') then raise exception 'Competencia anterior fechada. Reabra antes da revisao.'; end if;
 end if;
 if new.financial_competence is not null then
  if exists(select 1 from public.wms_loss_periods where competence=new.financial_competence and status='FECHADA')
   and (tg_op='INSERT' or new.financial_competence is distinct from old.financial_competence) then raise exception 'Competencia fechada.'; end if;
  new.competence_month:=(new.financial_competence||'-01')::date;
  new.competence_review_required:=false;
 else new.competence_review_required:=true;
 end if;
 return new;
end $$;
-- Executes after reverse_guard, preserving the operational status checks.
create trigger reverse_z_financial_guard before insert or update on public.wms_reverse_logistics
 for each row execute function private.wms_reverse_financial_guard();
create or replace function public.wms_reverse_set_competence(p_id text,p_competence text,p_issue_date date,p_reason text,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.wms_reverse_logistics%rowtype;
begin
 if auth.uid() is null or private.current_wms_role() not in ('ADMINISTRADOR','SUPERVISOR','COMPRAS') then raise exception 'Perfil nao autorizado.' using errcode='42501';end if;
 if p_competence is null or p_competence !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or length(btrim(coalesce(p_reason,'')))<5 then raise exception 'Competencia e justificativa obrigatorias.';end if;
 select * into r from public.wms_reverse_logistics where id=p_id for update;
 if not found or r.updated_at is distinct from p_expected_updated_at then raise exception 'Registro atualizado por outro usuario.' using errcode='40001';end if;
 update public.wms_reverse_logistics set financial_competence=p_competence,invoice_issue_date=p_issue_date,fiscal_reason=p_reason,
 client_action_id=gen_random_uuid()::text where id=p_id returning * into r;
 return to_jsonb(r);
end $$;
revoke all on function public.wms_reverse_set_competence(text,text,date,text,timestamptz) from public,anon;
grant execute on function public.wms_reverse_set_competence(text,text,date,text,timestamptz) to authenticated;
create or replace function private.wms_reverse_audit() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' or new.status is distinct from old.status or new.is_deleted is distinct from old.is_deleted
  or (new.financial_competence,new.invoice_issue_date) is distinct from (old.financial_competence,old.invoice_issue_date) then
  insert into public.wms_history(id,datetime,action,warehouse_code,details)
  values('reverse:'||new.id||':'||coalesce(new.client_action_id,'created'),now(),'Logistica Reversa',new.warehouse_code,
   jsonb_build_object('entity_id',new.id,'status',new.status,'reason',new.fiscal_reason,'user_id',private.current_wms_profile_id(),'boxes',new.box_quantity,
   'competence',new.financial_competence,'invoice_issue_date',new.invoice_issue_date,'previous_competence',case when tg_op='UPDATE' then old.financial_competence end,
   'competence_review_required',new.competence_review_required)::text)
  on conflict(id) do nothing;
 end if;
 return new;
end $$;
create or replace function public.wms_reverse_summary(p_month date,p_unit text default null)
returns jsonb language sql security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(s) order by s.unit_code),'[]'::jsonb) from (
 select w.code as unit_code,w.name as unit_name,coalesce(t.target_boxes,0) as target_boxes,
 coalesce(sum(r.box_quantity) filter(where r.counted_at is not null and r.status<>'CANCELADA'),0) as completed_boxes,
 count(r.id) as processes,count(r.id) filter(where r.status not in ('CONCLUIDA','CANCELADA')) as pending,
 count(r.id) filter(where r.status='DIVERGENCIA') as divergences,
 (select count(*) from public.wms_reverse_logistics old where old.unit_origin_code=w.code and old.competence_review_required and not old.is_deleted) as competence_pending
 from public.wms_warehouses w
 left join public.wms_reverse_logistics_monthly_targets t on t.unit_code=w.code and t.competence_month=p_month
 left join public.wms_reverse_logistics r on r.unit_origin_code=w.code and r.competence_month=p_month and not r.competence_review_required and not r.is_deleted
 where w.active and w.code=any(private.current_wms_allowed_warehouses()) and (p_unit is null or w.code=p_unit)
 and private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','OPERADOR','COMPRAS'])
 group by w.code,w.name,t.target_boxes
 ) s
$$;
notify pgrst,'reload schema';
