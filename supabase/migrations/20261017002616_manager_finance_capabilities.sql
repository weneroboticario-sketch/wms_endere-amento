-- CP Alamo only. Capabilities never imply an additional warehouse.
create table private.wms_capability_catalog (
 code text primary key, default_roles text[] not null, grant_roles text[] not null
);
insert into private.wms_capability_catalog values
 ('manager.dashboard.read',array['GERENTE'],array['GERENTE']),
 ('manager.approvals.read',array['GERENTE'],array['GERENTE']),
 ('manager.loss.approve',array['GERENTE'],array['GERENTE']),
 ('manager.loss.request_correction',array['GERENTE'],array['GERENTE']),
 ('manager.operational_exception.handle','{}',array['GERENTE']),
 ('finance.dashboard.read',array['FINANCEIRO'],array['FINANCEIRO']),
 ('finance.loss.read',array['FINANCEIRO'],array['FINANCEIRO']),
 ('finance.loss.validate',array['FINANCEIRO'],array['FINANCEIRO']),
 ('finance.loss.request_correction',array['FINANCEIRO'],array['FINANCEIRO']),
 ('finance.dre.read',array['FINANCEIRO'],array['FINANCEIRO']),
 ('finance.export',array['FINANCEIRO'],array['FINANCEIRO']),
 ('finance.close_competence','{}',array['FINANCEIRO']),
 ('finance.reopen_competence','{}',array['FINANCEIRO']),
 ('finance.configure_rates','{}',array['FINANCEIRO']),
 ('finance.configure_types','{}',array['FINANCEIRO']),
 ('transfer.read',array['GERENTE','FINANCEIRO'],array['GERENTE','FINANCEIRO']),
 ('replenishment.read',array['GERENTE'],array['GERENTE']),
 ('invoice.read',array['GERENTE','FINANCEIRO'],array['GERENTE','FINANCEIRO']),
 ('dispatch.read',array['GERENTE'],array['GERENTE']),
 ('reverse.read',array['GERENTE','FINANCEIRO'],array['GERENTE','FINANCEIRO']),
 ('report.read',array['GERENTE','FINANCEIRO'],array['GERENTE','FINANCEIRO']),
 ('report.export',array['GERENTE','FINANCEIRO'],array['GERENTE','FINANCEIRO']);
create table private.wms_capability_grants (
 user_id text references public.wms_users(id), capability text references private.wms_capability_catalog(code),
 enabled boolean not null, granted_by text not null, reason text not null, updated_at timestamptz not null default now(),
 primary key(user_id,capability)
);
create table private.wms_capability_audit (
 id bigint generated always as identity primary key, actor text not null, actor_role text not null,
 target_user text, action text not null, before_state jsonb, after_state jsonb, reason text not null,
 created_at timestamptz not null default now()
);
alter table private.wms_capability_catalog enable row level security;
alter table private.wms_capability_grants enable row level security;
alter table private.wms_capability_audit enable row level security;
revoke all on private.wms_capability_catalog,private.wms_capability_grants,private.wms_capability_audit from public,anon,authenticated;

create function private.wms_has_capability(p_code text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and coalesce(private.current_wms_role()='ADMINISTRADOR' or exists(
  select 1 from private.wms_capability_catalog c where c.code=p_code
   and private.current_wms_role()=any(c.grant_roles)
   and coalesce((select g.enabled from private.wms_capability_grants g
    where g.user_id=private.current_wms_profile_id() and g.capability=c.code),private.current_wms_role()=any(c.default_roles))
 ),false)
$$;
revoke all on function private.wms_has_capability(text) from public,anon;
grant execute on function private.wms_has_capability(text) to authenticated;

-- Preserve legacy scope behavior; use an unambiguous comma parser for new roles.
alter function private.current_wms_allowed_warehouses() rename to legacy_wms_allowed_warehouses;
create function private.current_wms_allowed_warehouses() returns text[]
language sql stable security definer set search_path='' as $$
 select case when private.current_wms_role() in ('GERENTE','FINANCEIRO') then
  coalesce((select array(select distinct upper(btrim(c.code)) from unnest(string_to_array(
   coalesce(nullif(u.allowed_warehouse_codes,''),u.default_warehouse_code,u.warehouse_code,''),',')) c(code)
   join public.wms_warehouses w on w.code=upper(btrim(c.code)) and w.active)
   from public.wms_users u where u.id=private.current_wms_profile_id()),'{}'::text[])
 else private.legacy_wms_allowed_warehouses() end
$$;
revoke all on function private.current_wms_allowed_warehouses() from public,anon;
grant execute on function private.current_wms_allowed_warehouses() to authenticated;

-- Restrictive policies intersect all existing permissive policies. No new-role
-- operational write path is inherited from older "role <> COMPRAS" policies.
do $$ declare t text; op text; begin
 for t in select tablename from pg_tables where schemaname='public' and rowsecurity loop
  foreach op in array array['INSERT','UPDATE','DELETE'] loop
   execute format('create policy %I on public.%I as restrictive for %s to authenticated %s',
    'scoped_profiles_no_'||lower(op),t,op,
    case when op='INSERT' then 'with check' else 'using' end||
    ' (coalesce(private.current_wms_role(),'''') not in (''GERENTE'',''FINANCEIRO''))'||
    case when op='UPDATE' then ' with check (coalesce(private.current_wms_role(),'''') not in (''GERENTE'',''FINANCEIRO''))' else '' end);
  end loop;
 end loop;
end $$;
create policy scoped_profile_warehouses on public.wms_warehouses for select to authenticated
 using(private.current_wms_role() in ('GERENTE','FINANCEIRO') and code=any(private.current_wms_allowed_warehouses()));

-- Task commands require a signed-in caller. Preserve authenticated execution
-- and internal trigger behavior; login identifier resolution remains public.
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef and p.proname in (
   'arquivar_tarefa','atribuir_tarefa','bloquear_tarefa','cancelar_tarefa','concluir_tarefa','criar_tarefa',
   'desarquivar_tarefa','gerar_codigo_tarefa','iniciar_tarefa','registrar_historico_tarefa','sync_tarefa_reposicao',
   'sync_tarefa_transferencia','validar_responsavel_mesmo_estoque','validar_tarefa','wms_estoque','wms_perfil') loop
  execute format('revoke all on function %s from public,anon',f.signature);
  execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;

-- Also covers legacy SECURITY DEFINER task commands, which bypass RLS.
create function private.wms_scoped_profile_no_physical_write() returns trigger
language plpgsql security invoker set search_path='' as $$begin
 if private.current_wms_role() in ('GERENTE','FINANCEIRO') then
  raise exception 'Perfil de consulta sem permissao operacional.' using errcode='42501';
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function private.wms_scoped_profile_no_physical_write() from public,anon;
grant execute on function private.wms_scoped_profile_no_physical_write() to authenticated;
do $$ declare t text; begin
 for t in select tablename from pg_tables where schemaname='public' and rowsecurity and tablename not like 'wms_loss%' loop
  execute format('create trigger scoped_profiles_physical_guard before insert or update or delete on public.%I for each row execute function private.wms_scoped_profile_no_physical_write()',t);
 end loop;
end $$;
create policy manager_unit_users on public.wms_users for select to authenticated
 using(private.wms_has_capability('manager.dashboard.read') and coalesce(default_warehouse_code,warehouse_code)=any(private.current_wms_allowed_warehouses()));

create or replace function private.wms_loss_can_read(p_warehouse text) returns boolean
language sql stable security invoker set search_path='' as $$
 select auth.uid() is not null and (private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','OPERADOR','COMPRAS'])
  or private.wms_has_capability('finance.loss.read') or private.wms_has_capability('manager.approvals.read'))
 and p_warehouse=any(private.current_wms_allowed_warehouses())
$$;
do $$ declare t text; p text; begin
 for t,p in select * from (values ('wms_loss_types','loss_types_read'),('wms_loss_rates','loss_rates_read'),
  ('wms_loss_financial_settings','loss_settings_read'),('wms_loss_periods','loss_periods_read')) v loop
  execute format('alter policy %I on public.%I using (private.has_wms_role(array[''ADMINISTRADOR'',''SUPERVISOR'',''OPERADOR'',''COMPRAS'']) or private.wms_has_capability(''finance.loss.read'') or private.wms_has_capability(''manager.approvals.read''))',p,t);
 end loop;
end $$;
alter policy loss_exports_read on public.wms_loss_export_batches using (
 (private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','COMPRAS']) or private.wms_has_capability('finance.export'))
 and warehouse_codes <@ private.current_wms_allowed_warehouses());

alter table public.wms_losses add column financial_validated_at timestamptz,
 add column financial_validated_by text, add column financial_validation_reason text;

-- Extend the existing command engine rather than duplicating its accounting,
-- allocation, file validation, idempotency or historical snapshot logic.
do $$ declare source text; begin
 select pg_get_functiondef('private.wms_loss_command(text,uuid,jsonb,text,integer)'::regprocedure) into source;
 if position('manager boolean:=actor_role in (''ADMINISTRADOR'',''SUPERVISOR'')' in source)=0
  then raise exception 'Loss command baseline changed; review migration.'; end if;
 source:=replace(source,'private.wms_loss_command(','private.wms_loss_command_core(');
 source:=replace(source,'manager boolean:=actor_role in (''ADMINISTRADOR'',''SUPERVISOR'')',
  'manager boolean:=actor_role in (''ADMINISTRADOR'',''SUPERVISOR'') or private.wms_has_capability(''manager.loss.approve'') or private.wms_has_capability(''finance.loss.request_correction'')');
 source:=replace(source,'finance boolean:=actor_role in (''ADMINISTRADOR'',''SUPERVISOR'',''COMPRAS'')',
  'finance boolean:=actor_role in (''ADMINISTRADOR'',''SUPERVISOR'',''COMPRAS'') or private.wms_has_capability(''finance.export'') or private.wms_has_capability(''finance.close_competence'') or private.wms_has_capability(''finance.reopen_competence'')');
 source:=replace(source,'actor_role not in (''ADMINISTRADOR'',''SUPERVISOR'',''OPERADOR'',''COMPRAS'')',
  'actor_role not in (''ADMINISTRADOR'',''SUPERVISOR'',''OPERADOR'',''COMPRAS'',''GERENTE'',''FINANCEIRO'')');
 source:=replace(source,'actor_role<>''ADMINISTRADOR''',
  '(actor_role<>''ADMINISTRADOR'' and not (p_action=''CONFIG_RATE'' and private.wms_has_capability(''finance.configure_rates'')) and not (p_action=''CONFIG_TYPE'' and private.wms_has_capability(''finance.configure_types'')))');
 source:=replace(source,'status in (''PENDENTE'',''CORRECAO_SOLICITADA'',''APROVADA'')) then raise exception ''Resolva pendencias e exporte aprovadas antes de fechar.''',
  '(status in (''PENDENTE'',''CORRECAO_SOLICITADA'') or (status=''APROVADA'' and financial_validated_at is null))) then raise exception ''Resolva pendencias e conclua a conferencia financeira antes de fechar.''');
 source:=replace(source,'if exists(select 1 from public.wms_loss_periods where competence=period and status=''FECHADA'') then raise exception ''Competencia fechada.''; end if;',
  '-- Closed, validated records remain exportable without changing their financial snapshots.');
 source:=replace(source,'elsif p_action=''CANCEL'' then','elsif p_action in (''CANCEL'',''REJECT'') then');
 execute source;
end $$;
revoke all on function private.wms_loss_command_core(text,uuid,jsonb,text,integer) from public,anon,authenticated;

create function private.wms_loss_financial_issues(p_id uuid) returns text[]
language sql stable security definer set search_path='' as $$
 select array_remove(array[
  case when l.competence is null then 'Competencia ausente' end,
  case when nullif(l.dre_code_snapshot,'') is null then 'DRE ausente' end,
  case when l.rate_percent_snapshot is null then 'Aliquota nao definida' end,
  case when l.invoice_value<=0 then 'Valor fiscal invalido' end,
  case when l.approved_at is null then 'Aprovacao gerencial pendente' end,
  case when l.invoice_number='' or l.invoice_issue_date is null then 'Dados fiscais incompletos' end,
  case when not exists(select 1 from public.wms_loss_files f where f.loss_id=l.id) then 'Documento obrigatorio ausente' end,
  case when (select sum(a.amount) from public.wms_loss_allocations a where a.loss_id=l.id) is distinct from l.invoice_value
    or (select sum(a.rate_value_snapshot) from public.wms_loss_allocations a where a.loss_id=l.id) is distinct from l.rate_value_snapshot then 'Rateio inconsistente' end,
  case when exists(select 1 from public.wms_losses d where d.id<>l.id and d.status<>'CANCELADA' and
    ((l.invoice_key<>'' and d.invoice_key=l.invoice_key) or (l.invoice_number<>'' and d.invoice_number=l.invoice_number
      and d.competent_warehouse_code=l.competent_warehouse_code and d.competence=l.competence and d.invoice_value=l.invoice_value))) then 'NF potencialmente duplicada' end
 ],null) from public.wms_losses l where l.id=p_id and private.wms_loss_can_read(l.competent_warehouse_code)
$$;
revoke all on function private.wms_loss_financial_issues(uuid) from public,anon;
grant execute on function private.wms_loss_financial_issues(uuid) to authenticated;

create or replace function private.wms_loss_command(p_action text,p_id uuid,p_payload jsonb,p_action_id text,p_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor text:=private.current_wms_profile_id(); actor_role text:=private.current_wms_role();
 l public.wms_losses%rowtype; result jsonb; required_cap text; issues text[]; prior private.wms_loss_commands%rowtype;
 request jsonb:=jsonb_build_object('action',p_action,'id',p_id,'payload',p_payload,'version',p_version);
begin
 if auth.uid() is null or actor is null then raise exception 'Sessao invalida.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(872601601);
 if p_action_id is null or length(p_action_id) not between 8 and 160 or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Comando invalido.'; end if;
 required_cap:=case p_action when 'APPROVE' then 'manager.loss.approve' when 'CORRECTION' then
  case when actor_role='FINANCEIRO' then 'finance.loss.request_correction' else 'manager.loss.request_correction' end
  when 'VALIDATE_FINANCE' then 'finance.loss.validate' when 'EXPORT' then 'finance.export'
  when 'REVIEW_PERIOD' then 'finance.export' when 'CLOSE_PERIOD' then 'finance.close_competence'
  when 'REOPEN_PERIOD' then 'finance.reopen_competence' when 'CONFIG_RATE' then 'finance.configure_rates'
  when 'CONFIG_TYPE' then 'finance.configure_types' when 'REOPEN' then 'manager.operational_exception.handle'
  when 'REJECT' then 'manager.loss.approve' end;
 if actor_role in ('GERENTE','FINANCEIRO') and (required_cap is null or not private.wms_has_capability(required_cap)) then
  raise exception 'Perfil sem permissao para esta acao.' using errcode='42501'; end if;
 if p_action='VALIDATE_FINANCE' and not private.wms_has_capability(required_cap) then raise exception 'Conferencia financeira nao autorizada.' using errcode='42501'; end if;
 if actor_role='FINANCEIRO' and p_action='EXPORT' and not private.wms_has_capability('finance.dre.read') then raise exception 'DRE nao autorizada.' using errcode='42501'; end if;
 select * into prior from private.wms_loss_commands c where c.actor=actor and c.action_id=p_action_id;
 if found then
  if prior.request<>request then raise exception 'Identificador ja usado por outro comando.'; end if;
  if prior.response ? 'competent_warehouse_code' and not private.wms_loss_can_read(prior.response->>'competent_warehouse_code') then raise exception 'Unidade nao autorizada.'; end if;
  if prior.response ? 'warehouse_codes' and not array(select jsonb_array_elements_text(prior.response->'warehouse_codes')) <@ private.current_wms_allowed_warehouses() then raise exception 'Lote fora do escopo.'; end if;
  return prior.response;
 end if;
 if p_id is not null then
  select * into l from public.wms_losses where id=p_id for update;
  if not found or not private.wms_loss_can_read(l.competent_warehouse_code) then raise exception 'Unidade nao autorizada.' using errcode='42501'; end if;
  if l.version is distinct from p_version then raise exception 'Registro atualizado por outro usuario.' using errcode='40001'; end if;
  if p_action in ('APPROVE','VALIDATE_FINANCE') and l.created_by_id=actor then
   raise exception 'Criador nao pode aprovar ou validar a propria perda.' using errcode='42501'; end if;
 end if;
 if p_action='REJECT' and (not private.wms_has_capability('manager.loss.approve') or l.status<>'PENDENTE') then raise exception 'Rejeicao nao autorizada.'; end if;
 if actor_role='FINANCEIRO' and p_action='CLOSE_PERIOD' and not exists(select 1 from public.wms_loss_periods where competence=p_payload->>'competence' and status='EM_CONFERENCIA') then raise exception 'Coloque a competencia em conferencia antes de fechar.'; end if;
 if p_action='VALIDATE_FINANCE' then
  if l.status<>'APROVADA' or l.approved_by_id=actor or length(btrim(coalesce(p_payload->>'reason','')))<5 then raise exception 'Validacao exige aprovacao de outro usuario e justificativa.'; end if;
  issues:=private.wms_loss_financial_issues(l.id);
  if cardinality(issues)>0 then raise exception 'Pendencias: %',array_to_string(issues,', '); end if;
  if l.financial_validated_at is not null then raise exception 'Registro ja validado.'; end if;
  update public.wms_losses set financial_validated_at=now(),financial_validated_by=actor,
   financial_validation_reason=p_payload->>'reason',version=version+1,updated_at=now() where id=l.id returning to_jsonb(wms_losses.*) into result;
  insert into public.wms_loss_events(loss_id,event_type,user_id,user_name,payload,reason)
   select l.id,'FINANCIAL_VALIDATED',actor,u.name,jsonb_build_object('before',to_jsonb(l),'after',result,'role',actor_role,'warehouse',l.competent_warehouse_code),p_payload->>'reason' from public.wms_users u where u.id=actor;
  insert into private.wms_loss_commands values(actor,p_action_id,request,result);
  return result;
 end if;
 if p_action='EXPORT' and exists(select 1 from public.wms_losses r where r.status='APROVADA'
  and r.competence=p_payload->>'competence' and private.wms_loss_can_read(r.competent_warehouse_code)
  and (nullif(p_payload->>'warehouse','') is null or r.competent_warehouse_code=p_payload->>'warehouse')
  and (nullif(p_payload->>'type','') is null or r.loss_type_id=p_payload->>'type')
  and (nullif(p_payload->>'dre','') is null or r.dre_code_snapshot=p_payload->>'dre')
  and (nullif(p_payload->>'cost_center','') is null or exists(select 1 from public.wms_loss_allocations a where a.loss_id=r.id and a.cost_center=p_payload->>'cost_center'))
  and r.financial_validated_at is null) then raise exception 'Conclua a conferencia financeira antes de exportar.'; end if;
 if actor_role='FINANCEIRO' and p_action='CORRECTION' then
  if l.status not in ('PENDENTE','APROVADA') or length(btrim(coalesce(p_payload->>'reason','')))<5 then raise exception 'Correcao exige perda elegivel e justificativa.'; end if;
  if exists(select 1 from public.wms_loss_periods where competence=l.competence and status='FECHADA') then raise exception 'Competencia fechada.'; end if;
  update public.wms_losses set status='CORRECAO_SOLICITADA',financial_validated_at=null,financial_validated_by=null,version=version+1,updated_at=now() where id=l.id returning to_jsonb(wms_losses.*) into result;
  insert into public.wms_loss_events(loss_id,event_type,user_id,user_name,payload,reason)
   select l.id,'FINANCIAL_CORRECTION',actor,u.name,jsonb_build_object('before',to_jsonb(l),'after',result,'role',actor_role),p_payload->>'reason' from public.wms_users u where u.id=actor;
  insert into private.wms_loss_commands values(actor,p_action_id,request,result);
  return result;
 end if;
 result:=private.wms_loss_command_core(p_action,p_id,p_payload,p_action_id,p_version);
 if p_action in ('SAVE','REOPEN','CORRECTION','APPROVE') and p_id is not null then
  update public.wms_losses set financial_validated_at=null,financial_validated_by=null,financial_validation_reason=null where id=p_id;
  result:=result||jsonb_build_object('financial_validated_at',null,'financial_validated_by',null);
  update private.wms_loss_commands set response=result where wms_loss_commands.actor=actor and action_id=p_action_id;
 end if;
 insert into private.wms_capability_audit(actor,actor_role,action,before_state,after_state,reason)
  values(actor,actor_role,'LOSS_'||p_action,to_jsonb(l),jsonb_build_object('result',result,'scope',private.current_wms_allowed_warehouses()),coalesce(p_payload->>'reason',''));
 return result;
end $$;

create function private.wms_profile_capabilities(p_target text default null,p_capability text default null,p_enabled boolean default null,p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target_role text; previous jsonb; begin
 if auth.uid() is null or private.current_wms_profile_id() is null then raise exception 'Sessao invalida.' using errcode='42501'; end if;
 if p_target is not null then
  if private.current_wms_role()<>'ADMINISTRADOR' then raise exception 'Exclusivo do administrador.' using errcode='42501'; end if;
  select role into target_role from public.wms_users where id=p_target;
  if not exists(select 1 from private.wms_capability_catalog where code=p_capability and target_role=any(grant_roles)) or p_enabled is null or length(btrim(coalesce(p_reason,'')))<5 then raise exception 'Permissao, perfil ou justificativa invalida.'; end if;
  select to_jsonb(g) into previous from private.wms_capability_grants g where user_id=p_target and capability=p_capability;
  insert into private.wms_capability_grants values(p_target,p_capability,p_enabled,private.current_wms_profile_id(),p_reason,now())
   on conflict(user_id,capability) do update set enabled=excluded.enabled,granted_by=excluded.granted_by,reason=excluded.reason,updated_at=now();
  insert into private.wms_capability_audit(actor,actor_role,target_user,action,before_state,after_state,reason)
   values(private.current_wms_profile_id(),private.current_wms_role(),p_target,'CAPABILITY_CHANGED',previous,jsonb_build_object('capability',p_capability,'enabled',p_enabled),p_reason);
 end if;
 return jsonb_build_object('capabilities',(select coalesce(jsonb_agg(code),'[]') from private.wms_capability_catalog where private.wms_has_capability(code)),
  'catalog',case when private.current_wms_role()='ADMINISTRADOR' then (select jsonb_agg(to_jsonb(c)) from private.wms_capability_catalog c) else '[]'::jsonb end);
end $$;
revoke all on function private.wms_profile_capabilities(text,text,boolean,text) from public,anon;
grant execute on function private.wms_profile_capabilities(text,text,boolean,text) to authenticated;
create function public.wms_profile_capabilities(p_target text default null,p_capability text default null,p_enabled boolean default null,p_reason text default null)
returns jsonb language sql security invoker set search_path='' as $$select private.wms_profile_capabilities(p_target,p_capability,p_enabled,p_reason)$$;
revoke all on function public.wms_profile_capabilities(text,text,boolean,text) from public,anon;
grant execute on function public.wms_profile_capabilities(text,text,boolean,text) to authenticated;

create function private.wms_profile_records(p_module text,p_offset integer default 0,p_search text default '')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tbl text; cap text; scope_column text:='warehouse_code'; projection text:='to_jsonb(t)';
 scope text[]:=private.current_wms_allowed_warehouses(); result jsonb; extra text:='true'; begin
 if auth.uid() is null or private.current_wms_profile_id() is null then raise exception 'Sessao invalida.' using errcode='42501'; end if;
 case p_module
  when 'transfers' then tbl:='wms_transfers'; cap:='transfer.read'; extra:='not coalesce(t.is_deleted,false)';
  when 'invoices' then tbl:='wms_transfers'; cap:='invoice.read'; extra:='t.requires_invoice and not coalesce(t.is_deleted,false)';
  when 'invoiceReplenishment' then tbl:='wms_replenishment_requests'; cap:='invoice.read'; extra:='t.requires_invoice and not coalesce(t.is_deleted,false)';
  when 'dispatch' then tbl:='wms_transfers'; cap:='dispatch.read'; extra:='t.invoice_stage in (''LIBERADA_PARA_ENVIO'',''DESPACHADA'',''RECEBIDA'',''FINALIZADA'') and not coalesce(t.is_deleted,false)';
  when 'deliveries' then tbl:='wms_transfers'; cap:='dispatch.read'; extra:='nullif(t.expedition_stage,'''') is not null and not coalesce(t.is_deleted,false)';
  when 'replenishment' then tbl:='wms_replenishment_requests'; cap:='replenishment.read'; extra:='not coalesce(t.is_deleted,false)';
  when 'reverse' then tbl:='wms_reverse_logistics'; cap:='reverse.read'; extra:='not coalesce(t.is_deleted,false)';
  when 'stock' then tbl:='wms_stock_positions'; cap:='manager.dashboard.read'; extra:='t.active';
  when 'users' then tbl:='wms_users'; cap:='manager.dashboard.read'; scope_column:='default_warehouse_code';
   projection:='jsonb_build_object(''id'',t.id,''name'',t.name,''username'',t.username,''role'',t.role,''warehouse_code'',coalesce(t.default_warehouse_code,t.warehouse_code),''active'',t.active,''archived'',t.archived)';
  when 'warehouses' then tbl:='wms_warehouses'; cap:='manager.dashboard.read'; scope_column:='code';
  else raise exception 'Modulo invalido.';
 end case;
 if not private.wms_has_capability(cap) then raise exception 'Consulta nao autorizada.' using errcode='42501'; end if;
 execute format('with scoped as (select %s as data from public.%I t where t.%I=any($1) and %s), filtered as
  (select data from scoped where $2='''' or data::text ilike ''%%''||$2||''%%''), page as
  (select data from filtered order by data->>''created_at'' desc nulls last,data->>''id'' limit 50 offset $3)
  select jsonb_build_object(''total'',(select count(*) from filtered),''rows'',coalesce((select jsonb_agg(data) from page),''[]''::jsonb))',projection,tbl,scope_column,extra)
 into result using scope,left(coalesce(p_search,''),100),greatest(0,least(coalesce(p_offset,0),1000000));
 return result;
end $$;
revoke all on function private.wms_profile_records(text,integer,text) from public,anon;
grant execute on function private.wms_profile_records(text,integer,text) to authenticated;
create function public.wms_profile_records(p_module text,p_offset integer default 0,p_search text default '') returns jsonb
language sql stable security invoker set search_path='' as $$select private.wms_profile_records(p_module,p_offset,p_search)$$;
revoke all on function public.wms_profile_records(text,integer,text) from public,anon;
grant execute on function public.wms_profile_records(text,integer,text) to authenticated;

create function private.wms_profile_record_detail(p_module text,p_id text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare record jsonb; items jsonb:='[]'; events jsonb:='[]'; begin
 select r into record from jsonb_array_elements(private.wms_profile_records(p_module,0,p_id)->'rows') r where r->>'id'=p_id;
 if record is null then raise exception 'Registro nao encontrado ou fora do escopo.' using errcode='42501'; end if;
 if p_module in ('transfers','invoices','dispatch','deliveries') then
  select coalesce(jsonb_agg(to_jsonb(i)),'[]') into items from (select * from public.wms_transfer_items
   where transfer_id=p_id and warehouse_code=any(private.current_wms_allowed_warehouses()) order by sku limit 500) i;
  select coalesce(jsonb_agg(to_jsonb(ev)),'[]') into events from (select * from public.wms_transfer_events
   where transfer_id=p_id and warehouse_code=any(private.current_wms_allowed_warehouses()) order by created_at desc limit 100) ev;
 end if;
 return jsonb_build_object('record',record,'items',items,'events',events);
end $$;
revoke all on function private.wms_profile_record_detail(text,text) from public,anon;
grant execute on function private.wms_profile_record_detail(text,text) to authenticated;
create function public.wms_profile_record_detail(p_module text,p_id text) returns jsonb
language sql stable security invoker set search_path='' as $$select private.wms_profile_record_detail(p_module,p_id)$$;
revoke all on function public.wms_profile_record_detail(text,text) from public,anon;
grant execute on function public.wms_profile_record_detail(text,text) to authenticated;

create function private.wms_profile_invoice_file(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select private.wms_has_capability('invoice.read') and (
  exists(select 1 from public.wms_transfers t where t.invoice_file_path=p_path and t.warehouse_code=any(private.current_wms_allowed_warehouses()) and not coalesce(t.is_deleted,false))
  or exists(select 1 from public.wms_replenishment_requests r where r.invoice_file_path=p_path and r.warehouse_code=any(private.current_wms_allowed_warehouses()) and not coalesce(r.is_deleted,false)))
$$;
revoke all on function private.wms_profile_invoice_file(text) from public,anon;
grant execute on function private.wms_profile_invoice_file(text) to authenticated;
create policy scoped_profiles_invoice_read on storage.objects for select to authenticated
 using(bucket_id='wms-transfer-invoices' and private.current_wms_role() in ('GERENTE','FINANCEIRO') and private.wms_profile_invoice_file(name));

create function private.wms_manager_overview() returns jsonb
language sql stable security definer set search_path='' as $$
 with scope as (select private.current_wms_allowed_warehouses() codes where auth.uid() is not null and private.wms_has_capability('manager.dashboard.read')),
 transfers as (select t.* from public.wms_transfers t,scope s where t.warehouse_code=any(s.codes) and not coalesce(t.is_deleted,false)
  and t.status not in ('CANCELADA','ARQUIVADA_POR_UNIFICACAO','FINALIZADA')),
 replen as (select r.* from public.wms_replenishment_requests r,scope s where r.warehouse_code=any(s.codes) and not coalesce(r.is_deleted,false)
  and r.status not in ('CANCELADA','CONCLUIDA','ATENDIDA','FINALIZADA')),
 pending as (
  select l.id::text id,l.loss_code code,'losses' module,l.competent_warehouse_code warehouse,l.responsible_name owner,l.status,l.updated_at since,1 priority
   from public.wms_losses l,scope s where l.competent_warehouse_code=any(s.codes) and l.status='PENDENTE'
  union all select t.id,t.codigo_transferencia,'transfers',t.warehouse_code,t.responsavel_nome,t.status,t.status_changed_at,2
   from transfers t where exists(select 1 from public.wms_transfer_divergences d where d.transfer_id=t.id and not d.resolved)
  union all select t.id,t.codigo_transferencia,'transfers',t.warehouse_code,t.responsavel_nome,t.status,t.status_changed_at,3
   from transfers t where t.delivery_deadline<now() and t.delivered_at is null
  union all select l.id::text,l.loss_code,'losses',l.competent_warehouse_code,l.responsible_name,l.status,l.updated_at,4
   from public.wms_losses l,scope s where l.competent_warehouse_code=any(s.codes) and l.status='CORRECAO_SOLICITADA'
  union all select t.id,t.codigo_transferencia,'dispatch',t.warehouse_code,t.expedition_responsible_name,t.invoice_stage,t.status_changed_at,5
   from transfers t where t.invoice_stage='LIBERADA_PARA_ENVIO' and t.delivery_deadline<now()
  union all select r.id,r.gdv_number,'reverse',r.warehouse_code,r.responsible_name,r.status,r.status_changed_at,6
   from public.wms_reverse_logistics r,scope s where r.warehouse_code=any(s.codes) and not coalesce(r.is_deleted,false) and r.status ilike '%DIVERGEN%'
 ) select jsonb_build_object('authorized',exists(select 1 from scope),
 'kpis',jsonb_build_object('transfers',(select count(*) from transfers),'late',(select count(*) from transfers where delivery_deadline<now() and delivered_at is null),
 'replenishment',(select count(*) from replen),'sla',(select count(*) from transfers where delivery_deadline<now() and delivered_at is null),
 'invoices',(select count(*) from transfers where invoice_stage in ('PRONTA_PARA_NOTA','NF_EM_PREPARACAO','NF_ANEXADA')),
 'divergences',(select count(*) from public.wms_transfer_divergences d,scope s where d.warehouse_code=any(s.codes) and not d.resolved),
 'losses',(select count(*) from pending where priority=1),'dispatch',(select count(*) from transfers where invoice_stage='LIBERADA_PARA_ENVIO')),
 'total',(select count(*) from pending),'queue',coalesce((select jsonb_agg(to_jsonb(q)) from (select * from pending order by priority,since nulls last,id limit 100) q),'[]'::jsonb))
$$;
revoke all on function private.wms_manager_overview() from public,anon;
grant execute on function private.wms_manager_overview() to authenticated;
create function public.wms_manager_overview() returns jsonb language sql stable security invoker set search_path='' as $$select private.wms_manager_overview()$$;
revoke all on function public.wms_manager_overview() from public,anon;
grant execute on function public.wms_manager_overview() to authenticated;

create function public.wms_financial_pending(p_filters jsonb default '{}') returns jsonb
language sql stable security invoker set search_path='' as $$
 with pending as (
  select l.id,l.loss_code,l.competent_warehouse_code,l.competence,l.status,l.version,
   private.wms_loss_financial_issues(l.id) issues,
   (l.competence<to_char(l.created_at,'YYYY-MM')) retroactive,l.financial_validated_at
  from public.wms_losses l where l.status not in ('CANCELADA','EXPORTADA')
   and (nullif(p_filters->>'competence','') is null or l.competence=p_filters->>'competence' or l.competence is null)
   and (nullif(p_filters->>'warehouse','') is null or l.competent_warehouse_code=p_filters->>'warehouse')
   and (nullif(p_filters->>'type','') is null or l.loss_type_id=p_filters->>'type')
   and (nullif(p_filters->>'dre','') is null or l.dre_code_snapshot=p_filters->>'dre')
   and (nullif(p_filters->>'status','') is null or l.status=p_filters->>'status')
   and (nullif(p_filters->>'cost_center','') is null or exists(select 1 from public.wms_loss_allocations a where a.loss_id=l.id and a.cost_center=p_filters->>'cost_center'))
   and (private.wms_has_capability('finance.loss.read') or private.wms_has_capability('manager.approvals.read'))
  and (l.financial_validated_at is null or cardinality(private.wms_loss_financial_issues(l.id))>0)
  order by l.created_at
 ) select jsonb_build_object('total',(select count(*) from pending),'rows',coalesce((select jsonb_agg(to_jsonb(r)) from (select * from pending limit 200) r),'[]'))
$$;
revoke all on function public.wms_financial_pending(jsonb) from public,anon;
grant execute on function public.wms_financial_pending(jsonb) to authenticated;

create function private.wms_management_export(p_module text,p_offset integer,p_search text,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; begin
 if not private.wms_has_capability('report.export') or not private.wms_has_capability('report.read') or length(btrim(coalesce(p_reason,'')))<5 then raise exception 'Exportacao exige permissao e justificativa.' using errcode='42501'; end if;
 result:=private.wms_profile_records(p_module,p_offset,p_search);
 insert into private.wms_capability_audit(actor,actor_role,action,after_state,reason)
  values(private.current_wms_profile_id(),private.current_wms_role(),'REPORT_EXPORTED',
   jsonb_build_object('module',p_module,'offset',p_offset,'search',p_search,'scope',private.current_wms_allowed_warehouses(),'records',jsonb_array_length(result->'rows')),p_reason);
 return result;
end $$;
revoke all on function private.wms_management_export(text,integer,text,text) from public,anon;
grant execute on function private.wms_management_export(text,integer,text,text) to authenticated;
create function public.wms_management_export(p_module text,p_offset integer,p_search text,p_reason text) returns jsonb
language sql security invoker set search_path='' as $$select private.wms_management_export(p_module,p_offset,p_search,p_reason)$$;
revoke all on function public.wms_management_export(text,integer,text,text) from public,anon;
grant execute on function public.wms_management_export(text,integer,text,text) to authenticated;

create or replace function public.wms_loss_summary(p_filters jsonb default '{}')
returns jsonb language sql stable security invoker set search_path='' as $$
 with base as (
  select * from public.wms_losses l where
   (private.current_wms_role()<>'FINANCEIRO' or (private.wms_has_capability('finance.dashboard.read') and private.wms_has_capability('finance.dre.read'))) and
   (nullif(p_filters->>'warehouse','') is null or competent_warehouse_code=p_filters->>'warehouse')
   and (nullif(p_filters->>'type','') is null or loss_type_id=p_filters->>'type')
   and (nullif(p_filters->>'dre','') is null or dre_code_snapshot=p_filters->>'dre')
   and (nullif(p_filters->>'status','') is null or status=p_filters->>'status')
   and (nullif(p_filters->>'cost_center','') is null or exists(select 1 from public.wms_loss_allocations a where a.loss_id=l.id and a.cost_center=p_filters->>'cost_center'))
 ), scoped as (select * from base where nullif(p_filters->>'competence','') is null or competence=p_filters->>'competence'),
 official as (select * from scoped where status in ('APROVADA','EXPORTADA')),
 grouped as (
  select 'type' as dimension,loss_type_name_snapshot as label,sum(case direction when 'CREDIT' then -official_value_snapshot else official_value_snapshot end) as value,count(*) as records from official group by loss_type_name_snapshot
  union all select 'dre',dre_label_snapshot,sum(case direction when 'CREDIT' then -official_value_snapshot else official_value_snapshot end),count(*) from official group by dre_label_snapshot
  union all select 'warehouse',competent_warehouse_code,sum(case direction when 'CREDIT' then -official_value_snapshot else official_value_snapshot end),count(*) from official group by competent_warehouse_code
 ), trend as (
  select competence,sum(case direction when 'CREDIT' then -official_value_snapshot else official_value_snapshot end) as net
  from base where status in ('APROVADA','EXPORTADA') and competence is not null
  group by competence order by competence desc limit 12
 ) select jsonb_build_object(
  'gross',coalesce((select sum(official_value_snapshot) from official where direction='LOSS'),0),
  'credits',coalesce((select sum(official_value_snapshot) from official where direction='CREDIT'),0),
  'rate_value',coalesce((select sum(rate_value_snapshot) from official),0),
  'financial_pending',(select count(*) from scoped where status not in ('CANCELADA','EXPORTADA') and financial_validated_at is null),
  'records',(select count(*) from scoped),'approved',(select count(*) from official),
  'pending',(select count(*) from scoped where status='PENDENTE'),
  'corrections',(select count(*) from scoped where status='CORRECAO_SOLICITADA'),
  'cancelled',(select count(*) from scoped where status='CANCELADA'),
  'groups',coalesce((select jsonb_agg(to_jsonb(grouped)) from grouped),'[]'::jsonb),
  'trend',coalesce((select jsonb_agg(to_jsonb(trend)) from trend),'[]'::jsonb))
$$;
