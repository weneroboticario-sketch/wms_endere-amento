-- CP Alamo only. All writes are mediated by private, authenticated commands;
-- public wrappers are invokers, and direct table mutation is not granted.
create table if not exists public.wms_loss_types (
 id text primary key, code text not null unique, name text not null,
 dre_code text not null, dre_label text not null, is_active boolean not null default true,
 display_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.wms_loss_types(id,code,name,dre_code,dre_label,display_order) values
 ('store-actions','STORE_ACTIONS','Ações de Loja','BONUS','PREMIOS E BONUS',1),
 ('birthday','BIRTHDAY','Aniversário Colaborador','BONUS','PREMIOS E BONUS',2),
 ('events','EVENTS','Eventos','BONUS','PREMIOS E BONUS',3),
 ('media','MEDIA','Mídia Local','BONUS','PREMIOS E BONUS',4),
 ('training','TRAINING','Treinamento','BONUS','PREMIOS E BONUS',5),
 ('profit','PROFIT','Distribuição de Lucros','FAMILY','RETIRADA DE PRODUTOS (FAMILIA)',6),
 ('donations','DONATIONS','Doações','ENTITIES','OUTRAS ENTIDADES',7),
 ('demo','DEMO','Mercadorias para Demonstração','DEMO','MERCADORIAS DEMONSTRACAO',8),
 ('launch','LAUNCH','Demonstradores - Lançamento de Produtos','DEMO','MERCADORIAS DEMONSTRACAO',9),
 ('stock','STOCK','Perdas de Estoque','STOCK','PERDAS DE ESTOQUE',10),
 ('theft','THEFT','Furto / Roubo','STOCK','PERDAS DE ESTOQUE',11),
 ('damage','DAMAGE','Quebras e Avarias','STOCK','PERDAS DE ESTOQUE',12),
 ('expired','EXPIRED','Vencidos','STOCK','PERDAS DE ESTOQUE',13)
on conflict do nothing;
create table if not exists public.wms_loss_rates (
 id uuid primary key default gen_random_uuid(), rate_percent numeric(9,4) not null check(rate_percent between 0 and 100),
 competence_from text not null check(competence_from ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 competence_to text not null check(competence_to ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 is_active boolean not null default true, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), check(competence_from<=competence_to)
);
insert into public.wms_loss_rates(rate_percent,competence_from,competence_to)
select 0.48,'0001-01','9999-12' where not exists(select 1 from public.wms_loss_rates);
create table if not exists public.wms_loss_financial_settings (
 id boolean primary key default true check(id), metric_basis text not null default 'INVOICE' check(metric_basis in ('INVOICE','CALCULATED')),
 updated_at timestamptz not null default now()
);
insert into public.wms_loss_financial_settings(id) values(true) on conflict do nothing;
create table if not exists public.wms_loss_cost_centers (
 code text primary key, name text not null, warehouse_code text not null references public.wms_warehouses(code), is_active boolean not null default true
);
insert into public.wms_loss_cost_centers(code,name,warehouse_code)
select code,name,code from public.wms_warehouses where active and code<>'DOURADOS' on conflict do nothing;
create sequence if not exists public.wms_loss_code_seq;
create sequence if not exists public.wms_loss_export_code_seq;
create table if not exists public.wms_losses (
 id uuid primary key default gen_random_uuid(),
 loss_code text not null unique default ('PER-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.wms_loss_code_seq')::text,6,'0')),
 competent_warehouse_code text not null references public.wms_warehouses(code),
 origin_warehouse_code text references public.wms_warehouses(code),
 competence text check(competence ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 invoice_number text not null default '', invoice_key text not null default '' check(invoice_key='' or invoice_key ~ '^[0-9]{44}$'),
 invoice_issue_date date, invoice_value numeric(14,2) not null default 0 check(invoice_value between 0 and 999999999999.99),
 issuer_cnpj text not null default '', issuer_name text not null default '',
 loss_type_id text references public.wms_loss_types(id), cost_center text references public.wms_loss_cost_centers(code),
 requester_id text not null, requester_name text not null, responsible_id text, responsible_name text,
 reason text not null default '', observation text not null default '',
 direction text not null default 'LOSS' check(direction in ('LOSS','CREDIT')),
 source_type text not null default 'MANUAL' check(source_type in ('MANUAL','INVENTARIO','TRANSFERENCIA','CONFERENCIA','LOGISTICA_REVERSA','IMPORTACAO')),
 source_entity_id text, source_entity_code text,
 status text not null default 'RASCUNHO' check(status in ('RASCUNHO','PENDENTE','CORRECAO_SOLICITADA','APROVADA','CANCELADA','EXPORTADA')),
 loss_type_code_snapshot text, loss_type_name_snapshot text, dre_code_snapshot text, dre_label_snapshot text,
 rate_percent_snapshot numeric(9,4), rate_value_snapshot numeric(14,2), metric_basis_snapshot text, official_value_snapshot numeric(14,2),
 created_by_id text not null, created_by_name text not null,
 submitted_at timestamptz, approved_at timestamptz, approved_by_id text, approved_by_name text,
 cancelled_at timestamptz, cancelled_by_id text, cancel_reason text, exported_at timestamptz, export_batch_id uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version integer not null default 1
);
create index if not exists wms_losses_scope_period on public.wms_losses(competent_warehouse_code,competence,status,created_at desc);
create index if not exists wms_losses_invoice_key on public.wms_losses(invoice_key) where invoice_key<>'' and status<>'CANCELADA';
create table if not exists public.wms_loss_items (
 id uuid primary key default gen_random_uuid(), loss_id uuid not null references public.wms_losses(id),
 sku text not null, description_snapshot text not null default '', quantity numeric(14,3) not null check(quantity>0 and quantity<100000000000),
 unit_value numeric(14,2) not null check(unit_value between 0 and 999999999999.99), total_value numeric(14,2) not null check(total_value between 0 and 999999999999.99),
 location_snapshot text not null default '', reason text not null default ''
);
create index if not exists wms_loss_items_parent on public.wms_loss_items(loss_id);
create table if not exists public.wms_loss_allocations (
 id uuid primary key default gen_random_uuid(), loss_id uuid not null references public.wms_losses(id),
 cost_center text not null references public.wms_loss_cost_centers(code), warehouse_code text not null references public.wms_warehouses(code),
 percent numeric(9,4) check(percent>0 and percent<=100), amount numeric(14,2) not null check(amount>0 and amount<=999999999999.99),
 rate_value_snapshot numeric(14,2), unique(loss_id,cost_center)
);
create table if not exists public.wms_loss_files (
 id uuid primary key default gen_random_uuid(), loss_id uuid not null references public.wms_losses(id),
 file_type text not null check(file_type in ('XML','PDF')), storage_path text not null unique,
 file_name text not null, mime_type text not null, file_size bigint not null check(file_size between 1 and 10485760),
 uploaded_by text not null, uploaded_at timestamptz not null default now()
);
create index if not exists wms_loss_files_parent on public.wms_loss_files(loss_id);
create table if not exists public.wms_loss_events (
 id uuid primary key default gen_random_uuid(), loss_id uuid references public.wms_losses(id),
 event_type text not null, user_id text not null, user_name text not null, created_at timestamptz not null default now(),
 payload jsonb not null default '{}', reason text not null default ''
);
create index if not exists wms_loss_events_parent on public.wms_loss_events(loss_id,created_at);
create table if not exists public.wms_loss_periods (
 competence text primary key check(competence ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 status text not null check(status in ('ABERTA','EM_CONFERENCIA','FECHADA')),
 updated_at timestamptz not null default now(), updated_by text not null
);
create table if not exists public.wms_loss_export_batches (
 id uuid primary key default gen_random_uuid(), batch_code text not null unique, competence text not null,
 generated_at timestamptz not null default now(), generated_by text not null,
 warehouse_codes text[] not null, record_count integer not null, total_invoice_value numeric(16,2) not null,
 total_rate_value numeric(16,2) not null, filters_snapshot jsonb not null, detail_snapshot jsonb not null
);
create table if not exists private.wms_loss_commands (
 actor text not null, action_id text not null, request jsonb not null, response jsonb not null,
 primary key(actor,action_id)
);
alter table private.wms_loss_commands enable row level security;

create or replace function private.wms_loss_can_read(p_warehouse text) returns boolean
language sql stable security invoker set search_path='' as $$
 select auth.uid() is not null and private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','OPERADOR','COMPRAS'])
 and p_warehouse=any(private.current_wms_allowed_warehouses())
$$;
revoke all on function private.wms_loss_can_read(text) from public,anon;
grant execute on function private.wms_loss_can_read(text) to authenticated;
do $$
declare t text;
begin
 foreach t in array array['wms_loss_types','wms_loss_rates','wms_loss_financial_settings','wms_loss_cost_centers','wms_losses','wms_loss_items','wms_loss_allocations','wms_loss_files','wms_loss_events','wms_loss_periods','wms_loss_export_batches'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create policy loss_types_read on public.wms_loss_types for select to authenticated using(private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','OPERADOR','COMPRAS']));
create policy loss_rates_read on public.wms_loss_rates for select to authenticated using(private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','OPERADOR','COMPRAS']));
create policy loss_settings_read on public.wms_loss_financial_settings for select to authenticated using(private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','OPERADOR','COMPRAS']));
create policy loss_centers_read on public.wms_loss_cost_centers for select to authenticated using(private.wms_loss_can_read(warehouse_code));
create policy loss_read on public.wms_losses for select to authenticated using(private.wms_loss_can_read(competent_warehouse_code));
create policy loss_items_read on public.wms_loss_items for select to authenticated using(exists(select 1 from public.wms_losses l where l.id=loss_id));
create policy loss_allocations_read on public.wms_loss_allocations for select to authenticated using(exists(select 1 from public.wms_losses l where l.id=loss_id));
create policy loss_files_read on public.wms_loss_files for select to authenticated using(exists(select 1 from public.wms_losses l where l.id=loss_id));
create policy loss_events_read on public.wms_loss_events for select to authenticated using(
 (loss_id is not null and exists(select 1 from public.wms_losses l where l.id=loss_id)) or
 (loss_id is null and private.current_wms_role()='ADMINISTRADOR'));
create policy loss_periods_read on public.wms_loss_periods for select to authenticated using(private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','OPERADOR','COMPRAS']));
create policy loss_exports_read on public.wms_loss_export_batches for select to authenticated using(
 private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','COMPRAS']) and warehouse_codes <@ private.current_wms_allowed_warehouses());

-- Deliberate command boundary: callers have SELECT only, never direct UPDATE.
-- Every command authenticates its actor, role, warehouse and optimistic version.
create or replace function private.wms_loss_command(p_action text,p_id uuid,p_payload jsonb,p_action_id text,p_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare
 actor text:=private.current_wms_profile_id(); actor_role text:=private.current_wms_role(); actor_name text;
 manager boolean:=actor_role in ('ADMINISTRADOR','SUPERVISOR');
 finance boolean:=actor_role in ('ADMINISTRADOR','SUPERVISOR','COMPRAS');
 l public.wms_losses%rowtype; old_l public.wms_losses%rowtype; typ public.wms_loss_types%rowtype;
 req jsonb:=jsonb_build_object('action',p_action,'id',p_id,'payload',p_payload,'version',p_version);
 prior private.wms_loss_commands%rowtype; response jsonb; entry jsonb; event_name text; wh text;
 rate numeric; rate_count integer; total numeric; remaining numeric; n integer; counter integer;
 period text; b public.wms_loss_export_batches%rowtype; details jsonb; filter_wh text;
 ids uuid[]; basis text; file_path text; object_metadata jsonb; reason_text text:=btrim(coalesce(p_payload->>'reason',''));
begin
 if auth.uid() is null or actor is null or actor_role not in ('ADMINISTRADOR','SUPERVISOR','OPERADOR','COMPRAS') then
  raise exception 'Acesso nao autorizado.' using errcode='42501'; end if;
 if p_action_id is null or length(p_action_id) not between 8 and 160 or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Comando invalido.'; end if;
 select name into actor_name from public.wms_users where id=actor;
 if p_action in ('EXPORT','CLOSE_PERIOD','REOPEN_PERIOD','REVIEW_PERIOD') and not finance then raise exception 'Perfil financeiro necessario.' using errcode='42501'; end if;
 if p_action in ('APPROVE','CORRECTION','REOPEN') and not manager then raise exception 'Acao exige gestor.' using errcode='42501'; end if;
 if p_action like 'CONFIG_%' and actor_role<>'ADMINISTRADOR' then raise exception 'Configuracao exige administrador.' using errcode='42501'; end if;
 -- Serializes financial changes, including rate edits, approval and closing.
 perform pg_catalog.pg_advisory_xact_lock(872601601);
 select * into prior from private.wms_loss_commands where wms_loss_commands.actor=actor and action_id=p_action_id;
 if found then
  if prior.request<>req then raise exception 'Identificador ja usado por outro comando.'; end if;
  if prior.response ? 'competent_warehouse_code' and not private.wms_loss_can_read(prior.response->>'competent_warehouse_code') then raise exception 'Unidade nao autorizada.'; end if;
  if prior.response ? 'warehouse_codes' and exists(select 1 from jsonb_array_elements_text(prior.response->'warehouse_codes') code where not private.wms_loss_can_read(code)) then raise exception 'Lote fora do escopo autorizado.'; end if;
  return prior.response;
 end if;
 if p_action in ('CONFIG_TYPE','CONFIG_RATE','CONFIG_SETTINGS','CONFIG_CENTER') then
  if actor_role<>'ADMINISTRADOR' then raise exception 'Configuracao exige administrador.' using errcode='42501'; end if;
  if p_action='CONFIG_TYPE' then
   if btrim(coalesce(p_payload->>'name',''))='' or btrim(coalesce(p_payload->>'dre_code',''))='' or btrim(coalesce(p_payload->>'dre_label',''))='' then raise exception 'Tipo e DRE obrigatorios.'; end if;
   insert into public.wms_loss_types(id,code,name,dre_code,dre_label,is_active,display_order)
   values(coalesce(nullif(p_payload->>'id',''),gen_random_uuid()::text),upper(p_payload->>'code'),p_payload->>'name',p_payload->>'dre_code',p_payload->>'dre_label',coalesce((p_payload->>'is_active')::boolean,true),coalesce((p_payload->>'display_order')::integer,0))
   on conflict(id) do update set name=excluded.name,dre_code=excluded.dre_code,dre_label=excluded.dre_label,is_active=excluded.is_active,display_order=excluded.display_order,updated_at=now();
  elsif p_action='CONFIG_RATE' then
   if coalesce((p_payload->>'is_active')::boolean,true) and exists(
    select 1 from public.wms_loss_rates where is_active and id is distinct from nullif(p_payload->>'id','')::uuid
    and competence_from<=p_payload->>'competence_to' and competence_to>=p_payload->>'competence_from'
   ) then raise exception 'Vigencia sobreposta. Encerre a faixa anterior primeiro.'; end if;
   insert into public.wms_loss_rates(id,rate_percent,competence_from,competence_to,is_active)
   values(coalesce(nullif(p_payload->>'id','')::uuid,gen_random_uuid()),(p_payload->>'rate_percent')::numeric,p_payload->>'competence_from',p_payload->>'competence_to',coalesce((p_payload->>'is_active')::boolean,true))
   on conflict(id) do update set rate_percent=excluded.rate_percent,competence_from=excluded.competence_from,competence_to=excluded.competence_to,is_active=excluded.is_active,updated_at=now();
  elsif p_action='CONFIG_CENTER' then
   if not private.wms_loss_can_read(p_payload->>'warehouse_code') then raise exception 'Unidade nao autorizada.'; end if;
   insert into public.wms_loss_cost_centers(code,name,warehouse_code,is_active)
   values(p_payload->>'code',p_payload->>'name',p_payload->>'warehouse_code',coalesce((p_payload->>'is_active')::boolean,true))
   on conflict(code) do update set name=excluded.name,is_active=excluded.is_active;
  else
   update public.wms_loss_financial_settings set metric_basis=p_payload->>'metric_basis',updated_at=now() where id;
  end if;
  event_name:=p_action; response:=jsonb_build_object('ok',true);
 elsif p_action in ('CLOSE_PERIOD','REOPEN_PERIOD','REVIEW_PERIOD') then
  if not finance or reason_text='' then raise exception 'Fechamento/reabertura exige perfil financeiro e justificativa.'; end if;
  period:=p_payload->>'competence';
  -- Global period closing must not conceal records outside a scoped manager's access.
  if exists(select 1 from public.wms_warehouses where active and code<>'DOURADOS' and not private.wms_loss_can_read(code)) then raise exception 'Fechamento global exige acesso a todas as unidades.'; end if;
  if p_action='CLOSE_PERIOD' and exists(select 1 from public.wms_losses where competence=period and status in ('PENDENTE','CORRECAO_SOLICITADA','APROVADA')) then raise exception 'Resolva pendencias e exporte aprovadas antes de fechar.'; end if;
  insert into public.wms_loss_periods(competence,status,updated_by) values(period,case p_action when 'CLOSE_PERIOD' then 'FECHADA' when 'REVIEW_PERIOD' then 'EM_CONFERENCIA' else 'ABERTA' end,actor)
  on conflict(competence) do update set status=excluded.status,updated_by=actor,updated_at=now();
  event_name:=p_action; response:=jsonb_build_object('ok',true);
 elsif p_action='EXPORT' then
  if not finance then raise exception 'Perfil sem permissao de exportacao.' using errcode='42501'; end if;
  period:=p_payload->>'competence'; filter_wh:=nullif(p_payload->>'warehouse','');
  if period is null or period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'Competencia obrigatoria.'; end if;
  if exists(select 1 from public.wms_loss_periods where competence=period and status='FECHADA') then raise exception 'Competencia fechada.'; end if;
  select array_agg(id) into ids from public.wms_losses
   where competence=period and status='APROVADA' and private.wms_loss_can_read(competent_warehouse_code)
   and (filter_wh is null or competent_warehouse_code=filter_wh)
   and (nullif(p_payload->>'dre','') is null or dre_code_snapshot=p_payload->>'dre')
   and (nullif(p_payload->>'type','') is null or loss_type_id=p_payload->>'type')
   and (nullif(p_payload->>'cost_center','') is null or id in(select loss_id from public.wms_loss_allocations where cost_center=p_payload->>'cost_center'));
  if coalesce(cardinality(ids),0)=0 then raise exception 'Nenhuma perda aprovada para exportar.'; end if;
  if nullif(p_payload->>'signature','') is distinct from
    (select md5(string_agg(id::text||':'||version::text,',' order by id)) from public.wms_losses where id=any(ids))
  then raise exception 'Previa desatualizada. Revise o fechamento novamente.' using errcode='40001'; end if;
  if exists(select 1 from public.wms_loss_allocations where loss_id=any(ids) and not private.wms_loss_can_read(warehouse_code)) then raise exception 'Rateio inclui unidade nao autorizada para exportacao.'; end if;
  -- Select whole losses when filtering a center so allocations remain reconcilable.
  if exists(select 1 from public.wms_losses where id=any(ids) and (rate_value_snapshot is null or dre_code_snapshot is null or competence is null or invoice_value<=0)) then raise exception 'Registro aprovado inconsistente.'; end if;
  select jsonb_agg(to_jsonb(d) order by loss_code,cost_center) into details from (
   select lossrow.id as loss_id,lossrow.loss_code,lossrow.competence,lossrow.competent_warehouse_code,lossrow.origin_warehouse_code,
    a.cost_center,a.warehouse_code as allocation_warehouse,lossrow.invoice_number,lossrow.invoice_key,lossrow.invoice_issue_date,
    lossrow.loss_type_name_snapshot as loss_type,lossrow.dre_code_snapshot as dre_code,lossrow.dre_label_snapshot as dre_label,
    a.amount as invoice_value,lossrow.invoice_value as original_invoice_value,lossrow.rate_percent_snapshot as rate_percent,
    a.rate_value_snapshot as rate_value,lossrow.direction,lossrow.requester_name,lossrow.responsible_name,lossrow.reason,lossrow.approved_by_name,lossrow.approved_at
   from public.wms_losses lossrow join public.wms_loss_allocations a on a.loss_id=lossrow.id where lossrow.id=any(ids)
  ) d;
  if exists(select 1 from public.wms_losses lossrow where id=any(ids) and
    ((select sum(amount) from public.wms_loss_allocations where loss_id=lossrow.id) is distinct from lossrow.invoice_value
    or (select sum(rate_value_snapshot) from public.wms_loss_allocations where loss_id=lossrow.id) is distinct from lossrow.rate_value_snapshot))
  then raise exception 'Rateio nao concilia com o total aprovado.'; end if;
  insert into public.wms_loss_export_batches(batch_code,competence,generated_by,warehouse_codes,record_count,total_invoice_value,total_rate_value,filters_snapshot,detail_snapshot)
   select 'EXP-DRE-'||period||'-'||lpad(nextval('public.wms_loss_export_code_seq')::text,4,'0'),period,actor,
    array(select distinct warehouse from (
      select competent_warehouse_code as warehouse from public.wms_losses where id=any(ids)
      union select warehouse_code from public.wms_loss_allocations where loss_id=any(ids)
    ) scopes),count(*),sum(invoice_value),sum(rate_value_snapshot),p_payload,details
   from public.wms_losses where id=any(ids) returning * into b;
  update public.wms_losses set status='EXPORTADA',exported_at=now(),export_batch_id=b.id,version=version+1,updated_at=now() where id=any(ids);
  insert into public.wms_loss_events(loss_id,event_type,user_id,user_name,payload)
   select unnest(ids),'EXPORTED',actor,actor_name,jsonb_build_object('batch_id',b.id,'batch_code',b.batch_code);
  event_name:='EXPORT_BATCH_CREATED';response:=to_jsonb(b);
 else
  if p_action='CREATE' then
   wh:=p_payload->>'competent_warehouse_code';
   if not private.wms_loss_can_read(wh) or not exists(select 1 from public.wms_warehouses where code=wh and active and code<>'DOURADOS') then raise exception 'Loja competente nao autorizada.' using errcode='42501'; end if;
   insert into public.wms_losses(competent_warehouse_code,created_by_id,created_by_name,requester_id,requester_name)
    values(wh,actor,actor_name,actor,actor_name) returning * into l;
   event_name:='DRAFT_CREATED';
  else
   select * into l from public.wms_losses where id=p_id for update;
   if not found or not private.wms_loss_can_read(l.competent_warehouse_code) then raise exception 'Perda nao encontrada ou nao autorizada.' using errcode='42501'; end if;
   if p_version is distinct from l.version then raise exception 'Registro atualizado por outro usuario.' using errcode='40001'; end if;
  end if;
  old_l:=l;
  if p_action in ('CREATE','SAVE') then
   if l.status not in ('RASCUNHO','CORRECAO_SOLICITADA') or (l.created_by_id<>actor and not manager) then raise exception 'Edicao nao autorizada. Solicite reabertura.'; end if;
   wh:=coalesce(p_payload->>'competent_warehouse_code',l.competent_warehouse_code);
   if not private.wms_loss_can_read(wh) or not exists(select 1 from public.wms_warehouses where code=wh and active and code<>'DOURADOS') then raise exception 'Loja nao autorizada.'; end if;
   if exists(select 1 from public.wms_loss_files where loss_id=l.id) and wh<>l.competent_warehouse_code then raise exception 'Loja nao pode mudar apos anexar documentos.'; end if;
   l.competent_warehouse_code:=wh;l.origin_warehouse_code:=nullif(p_payload->>'origin_warehouse_code','');
   if l.origin_warehouse_code is not null and not private.wms_loss_can_read(l.origin_warehouse_code) then raise exception 'Origem nao autorizada.'; end if;
   l.competence:=nullif(p_payload->>'competence','');l.invoice_number:=coalesce(p_payload->>'invoice_number','');
   l.invoice_key:=coalesce(p_payload->>'invoice_key','');l.invoice_issue_date:=nullif(p_payload->>'invoice_issue_date','')::date;
   l.invoice_value:=coalesce((p_payload->>'invoice_value')::numeric,0);l.issuer_cnpj:=coalesce(p_payload->>'issuer_cnpj','');l.issuer_name:=coalesce(p_payload->>'issuer_name','');
   l.loss_type_id:=nullif(p_payload->>'loss_type_id','');l.cost_center:=nullif(p_payload->>'cost_center','');
   l.reason:=reason_text;l.observation:=coalesce(p_payload->>'observation','');l.direction:=coalesce(p_payload->>'direction','LOSS');
   l.responsible_id:=nullif(p_payload->>'responsible_id','');l.responsible_name:=null;
   if l.responsible_id is not null then
    select name into l.responsible_name from public.wms_users where id=l.responsible_id and active and not coalesce(archived,false) and role in ('ADMINISTRADOR','SUPERVISOR','COMPRAS');
    if l.responsible_name is null then raise exception 'Responsavel inelegivel.'; end if;
   end if;
   if nullif(p_payload->>'requester_id','') is not null and p_payload->>'requester_id'<>l.requester_id then
    if not manager then raise exception 'Solicitante somente pode ser alterado por gestor.'; end if;
    select id,name into l.requester_id,l.requester_name from public.wms_users where id=p_payload->>'requester_id' and active and not coalesce(archived,false);
    if l.requester_id is null then raise exception 'Solicitante invalido.'; end if;
   end if;
   l.source_type:=coalesce(p_payload->>'source_type','MANUAL');l.source_entity_id:=nullif(p_payload->>'source_entity_id','');
   l.source_entity_code:=null;
   if l.source_type='TRANSFERENCIA' then
    select codigo_transferencia into l.source_entity_code from public.wms_transfers where id=l.source_entity_id and private.wms_loss_can_read(warehouse_code) and not is_deleted;
    if l.source_entity_code is null then raise exception 'Transferencia nao autorizada.'; end if;
   elsif l.source_type='LOGISTICA_REVERSA' then
    select gdv_number into l.source_entity_code from public.wms_reverse_logistics where id=l.source_entity_id and private.wms_loss_can_read(warehouse_code) and not is_deleted;
    if l.source_entity_code is null then raise exception 'Logistica reversa nao autorizada.'; end if;
   elsif l.source_type<>'MANUAL' then raise exception 'Origem ainda nao integrada. Registre manualmente com referencia na observacao.';
   end if;
   if jsonb_array_length(coalesce(p_payload->'items','[]'))>200 or jsonb_array_length(coalesce(p_payload->'allocations','[]'))>100 then raise exception 'Limite de itens/rateios excedido.'; end if;
   delete from public.wms_loss_items where loss_id=l.id;
   for entry in select value from jsonb_array_elements(coalesce(p_payload->'items','[]')) loop
    if btrim(coalesce(entry->>'sku',''))='' then raise exception 'SKU obrigatorio.'; end if;
    insert into public.wms_loss_items(loss_id,sku,description_snapshot,quantity,unit_value,total_value,location_snapshot,reason)
    values(l.id,entry->>'sku',coalesce(entry->>'description_snapshot',''),(entry->>'quantity')::numeric,(entry->>'unit_value')::numeric,
      round((entry->>'quantity')::numeric*(entry->>'unit_value')::numeric,2),coalesce(entry->>'location_snapshot',''),coalesce(entry->>'reason',''));
   end loop;
   delete from public.wms_loss_allocations where loss_id=l.id;
   for entry in select value from jsonb_array_elements(coalesce(p_payload->'allocations','[]')) loop
    select warehouse_code into wh from public.wms_loss_cost_centers where code=entry->>'cost_center' and is_active;
    if wh is null or not private.wms_loss_can_read(wh) then raise exception 'Centro de custo nao autorizado.'; end if;
    insert into public.wms_loss_allocations(loss_id,cost_center,warehouse_code,percent,amount)
    values(l.id,entry->>'cost_center',wh,nullif(entry->>'percent','')::numeric,(entry->>'amount')::numeric);
   end loop;
   if not exists(select 1 from public.wms_loss_allocations where loss_id=l.id) and l.invoice_value>0 then
    l.cost_center:=coalesce(l.cost_center,l.competent_warehouse_code);
    select warehouse_code into wh from public.wms_loss_cost_centers where code=l.cost_center and is_active;
    if wh is null or not private.wms_loss_can_read(wh) then raise exception 'Centro de custo invalido.'; end if;
    insert into public.wms_loss_allocations(loss_id,cost_center,warehouse_code,percent,amount) values(l.id,l.cost_center,wh,100,l.invoice_value);
   end if;
   event_name:=coalesce(event_name,'DRAFT_UPDATED');
  elsif p_action in ('SUBMIT','APPROVE') then
   if p_action='SUBMIT' and (l.status not in ('RASCUNHO','CORRECAO_SOLICITADA') or (l.created_by_id<>actor and not manager)) then raise exception 'Envio nao permitido.'; end if;
   if p_action='APPROVE' and (not manager or l.status<>'PENDENTE') then raise exception 'Aprovacao exige gestor e perda pendente.'; end if;
   if l.competence is null or l.invoice_value<=0 or length(btrim(l.reason))<15 then raise exception 'Informe competencia, valor positivo e motivo detalhado (15 caracteres).'; end if;
   if exists(select 1 from public.wms_loss_periods where competence=l.competence and status='FECHADA') then raise exception 'Competencia fechada. Reabertura obrigatoria.'; end if;
   select * into typ from public.wms_loss_types where id=l.loss_type_id and is_active;
   if not found then raise exception 'Tipo de perda inativo ou sem classificacao.'; end if;
   select count(*),max(rate_percent) into rate_count,rate from public.wms_loss_rates where is_active and l.competence between competence_from and competence_to;
   if rate_count<>1 then raise exception 'Competencia deve possuir uma unica aliquota aplicavel.'; end if;
   if l.invoice_key<>'' and exists(select 1 from public.wms_losses where id<>l.id and invoice_key=l.invoice_key and status<>'CANCELADA') then raise exception 'Chave NF-e ja vinculada a outra perda ativa.'; end if;
   if exists(select 1 from public.wms_losses where id<>l.id and status<>'CANCELADA' and invoice_number=l.invoice_number and invoice_number<>'' and competent_warehouse_code=l.competent_warehouse_code and invoice_value=l.invoice_value and competence=l.competence)
      and coalesce(p_payload->>'duplicate_reason','')='' then raise exception 'Possivel NF duplicada. Confirme com justificativa.'; end if;
   select sum(amount) into total from public.wms_loss_allocations where loss_id=l.id;
   if total is distinct from l.invoice_value then raise exception 'Rateio deve fechar com o valor da NF.'; end if;
   if exists(select 1 from public.wms_loss_allocations a join public.wms_loss_cost_centers c on c.code=a.cost_center where loss_id=l.id and (not c.is_active or not private.wms_loss_can_read(a.warehouse_code))) then raise exception 'Rateio possui centro inativo ou nao autorizado.'; end if;
   if exists(select 1 from public.wms_loss_allocations where loss_id=l.id and percent is not null) and
    ((select sum(percent) from public.wms_loss_allocations where loss_id=l.id)<>100 or exists(select 1 from public.wms_loss_allocations where loss_id=l.id and (percent is null or percent<=0))) then raise exception 'Percentuais de rateio devem totalizar 100%%.'; end if;
   if p_action='APPROVE' then
    l.loss_type_code_snapshot:=typ.code;l.loss_type_name_snapshot:=typ.name;l.dre_code_snapshot:=typ.dre_code;l.dre_label_snapshot:=typ.dre_label;
    l.rate_percent_snapshot:=rate;l.rate_value_snapshot:=round(l.invoice_value*rate/100,2);
    select metric_basis into basis from public.wms_loss_financial_settings where id;
    l.metric_basis_snapshot:=basis;l.official_value_snapshot:=case when basis='CALCULATED' then l.rate_value_snapshot else l.invoice_value end;
    l.approved_at:=now();l.approved_by_id:=actor;l.approved_by_name:=actor_name;
    l.status:='APROVADA';event_name:='APPROVED';
    -- Distribute residual cents by largest remainder, never creating a negative allocation.
    with portions as (
     select a.id,a.cost_center,a.amount*rate as raw_cents,floor(a.amount*rate) as whole_cents
     from public.wms_loss_allocations a where a.loss_id=l.id
    ), ranked as (
     select id,whole_cents,row_number() over(order by raw_cents-whole_cents desc,cost_center) as rank,
      l.rate_value_snapshot*100-sum(whole_cents) over() as residual from portions
    ) update public.wms_loss_allocations a set rate_value_snapshot=(r.whole_cents+case when r.rank<=r.residual then 1 else 0 end)/100
      from ranked r where a.id=r.id;
   else l.status:='PENDENTE';l.submitted_at:=now();event_name:='SUBMITTED'; end if;
  elsif p_action='CORRECTION' then
   if not manager or l.status<>'PENDENTE' or length(reason_text)<5 then raise exception 'Correcao exige gestor, perda pendente e motivo.'; end if;
   l.status:='CORRECAO_SOLICITADA';event_name:='CORRECTION_REQUESTED';
  elsif p_action='REOPEN' then
   if not manager or l.status not in ('APROVADA','EXPORTADA','CANCELADA') or length(reason_text)<5 then raise exception 'Reabertura exige gestor e justificativa.'; end if;
   if exists(select 1 from public.wms_loss_periods where competence=l.competence and status='FECHADA') then raise exception 'Reabra a competencia primeiro.'; end if;
   l.status:='CORRECAO_SOLICITADA';event_name:='REOPENED';
  elsif p_action='CANCEL' then
   if l.status='EXPORTADA' then raise exception 'Reabra formalmente antes de cancelar uma exportada.'; end if;
   if l.status='CANCELADA' or length(reason_text)<5 or (not manager and (l.created_by_id<>actor or l.status not in ('RASCUNHO','CORRECAO_SOLICITADA'))) then raise exception 'Cancelamento nao autorizado ou sem motivo.'; end if;
   if exists(select 1 from public.wms_loss_periods where competence=l.competence and status='FECHADA') then raise exception 'Competencia fechada.'; end if;
   l.status:='CANCELADA';l.cancelled_at:=now();l.cancelled_by_id:=actor;l.cancel_reason:=reason_text;event_name:='CANCELLED';
  elsif p_action='ATTACH' then
   if l.status not in ('RASCUNHO','CORRECAO_SOLICITADA') or (l.created_by_id<>actor and not manager) then raise exception 'Anexo nao permitido neste estado.'; end if;
   file_path:=p_payload->>'storage_path';
   if split_part(file_path,'/',1)<>l.competent_warehouse_code or split_part(file_path,'/',2)<>l.id::text or not exists(select 1 from storage.objects where bucket_id='wms-loss-files' and name=file_path) then raise exception 'Arquivo ausente ou fora do registro.'; end if;
   select metadata into object_metadata from storage.objects where bucket_id='wms-loss-files' and name=file_path;
   if (object_metadata->>'size')::bigint is distinct from (p_payload->>'file_size')::bigint
    or object_metadata->>'mimetype' is distinct from p_payload->>'mime_type'
    or not ((p_payload->>'file_type'='PDF' and p_payload->>'mime_type'='application/pdf' and file_path ~ '\.pdf$')
      or (p_payload->>'file_type'='XML' and p_payload->>'mime_type' in ('application/xml','text/xml') and file_path ~ '\.xml$' and (p_payload->>'file_size')::bigint<=5242880))
   then raise exception 'Tipo ou tamanho do anexo nao corresponde ao arquivo armazenado.'; end if;
   insert into public.wms_loss_files(loss_id,file_type,storage_path,file_name,mime_type,file_size,uploaded_by)
   values(l.id,p_payload->>'file_type',file_path,p_payload->>'file_name',p_payload->>'mime_type',(p_payload->>'file_size')::bigint,actor);
   event_name:=(p_payload->>'file_type')||'_UPLOADED';
  else raise exception 'Acao desconhecida.';
  end if;
  l.updated_at:=now();l.version:=l.version+1;
  update public.wms_losses set
   competent_warehouse_code=l.competent_warehouse_code,origin_warehouse_code=l.origin_warehouse_code,competence=l.competence,
   invoice_number=l.invoice_number,invoice_key=l.invoice_key,invoice_issue_date=l.invoice_issue_date,invoice_value=l.invoice_value,
   issuer_cnpj=l.issuer_cnpj,issuer_name=l.issuer_name,loss_type_id=l.loss_type_id,cost_center=l.cost_center,
   requester_id=l.requester_id,requester_name=l.requester_name,responsible_id=l.responsible_id,responsible_name=l.responsible_name,
   reason=l.reason,observation=l.observation,direction=l.direction,source_type=l.source_type,source_entity_id=l.source_entity_id,source_entity_code=l.source_entity_code,
   status=l.status,loss_type_code_snapshot=l.loss_type_code_snapshot,loss_type_name_snapshot=l.loss_type_name_snapshot,
   dre_code_snapshot=l.dre_code_snapshot,dre_label_snapshot=l.dre_label_snapshot,rate_percent_snapshot=l.rate_percent_snapshot,
   rate_value_snapshot=l.rate_value_snapshot,metric_basis_snapshot=l.metric_basis_snapshot,official_value_snapshot=l.official_value_snapshot,
   submitted_at=l.submitted_at,approved_at=l.approved_at,approved_by_id=l.approved_by_id,approved_by_name=l.approved_by_name,
   cancelled_at=l.cancelled_at,cancelled_by_id=l.cancelled_by_id,cancel_reason=l.cancel_reason,updated_at=l.updated_at,version=l.version
   where id=l.id;
  response:=to_jsonb(l);
 end if;
 insert into public.wms_loss_events(loss_id,event_type,user_id,user_name,payload,reason)
 values(l.id,event_name,actor,actor_name,jsonb_build_object('before',to_jsonb(old_l),'after',response,'request',p_payload),reason_text);
 insert into private.wms_loss_commands(actor,action_id,request,response) values(actor,p_action_id,req,response);
 return response;
end $$;
revoke all on function private.wms_loss_command(text,uuid,jsonb,text,integer) from public,anon;
grant execute on function private.wms_loss_command(text,uuid,jsonb,text,integer) to authenticated;
create or replace function public.wms_loss_action(p_action text,p_id uuid default null,p_payload jsonb default '{}',p_action_id text default null,p_version integer default null)
returns jsonb language sql security invoker set search_path='' as $$
 select private.wms_loss_command(p_action,p_id,p_payload,p_action_id,p_version)
$$;
revoke all on function public.wms_loss_action(text,uuid,jsonb,text,integer) from public,anon;
grant execute on function public.wms_loss_action(text,uuid,jsonb,text,integer) to authenticated;

create or replace function public.wms_loss_summary(p_filters jsonb default '{}')
returns jsonb language sql stable security invoker set search_path='' as $$
 with scoped as (
  select * from public.wms_losses l where
   (nullif(p_filters->>'competence','') is null or competence=p_filters->>'competence')
   and (nullif(p_filters->>'warehouse','') is null or competent_warehouse_code=p_filters->>'warehouse')
   and (nullif(p_filters->>'type','') is null or loss_type_id=p_filters->>'type')
   and (nullif(p_filters->>'dre','') is null or dre_code_snapshot=p_filters->>'dre')
 ), official as (select * from scoped where status in ('APROVADA','EXPORTADA')),
 grouped as (
  select 'type' as dimension,loss_type_name_snapshot as label,sum(case direction when 'CREDIT' then -official_value_snapshot else official_value_snapshot end) as value,count(*) as records from official group by loss_type_name_snapshot
  union all select 'dre',dre_label_snapshot,sum(case direction when 'CREDIT' then -official_value_snapshot else official_value_snapshot end),count(*) from official group by dre_label_snapshot
  union all select 'warehouse',competent_warehouse_code,sum(case direction when 'CREDIT' then -official_value_snapshot else official_value_snapshot end),count(*) from official group by competent_warehouse_code
 ), trend as (
  select competence,sum(case direction when 'CREDIT' then -official_value_snapshot else official_value_snapshot end) as net
  from public.wms_losses where status in ('APROVADA','EXPORTADA') and competence is not null
   and (nullif(p_filters->>'warehouse','') is null or competent_warehouse_code=p_filters->>'warehouse')
  group by competence order by competence desc limit 12
 )
 select jsonb_build_object(
  'gross',coalesce((select sum(official_value_snapshot) from official where direction='LOSS'),0),
  'credits',coalesce((select sum(official_value_snapshot) from official where direction='CREDIT'),0),
  'records',(select count(*) from scoped),'approved',(select count(*) from official),
  'pending',(select count(*) from scoped where status='PENDENTE'),
  'corrections',(select count(*) from scoped where status='CORRECAO_SOLICITADA'),
  'cancelled',(select count(*) from scoped where status='CANCELADA'),
  'groups',coalesce((select jsonb_agg(to_jsonb(grouped)) from grouped),'[]'::jsonb),
  'trend',coalesce((select jsonb_agg(to_jsonb(trend)) from trend),'[]'::jsonb))
$$;
revoke all on function public.wms_loss_summary(jsonb) from public,anon;
grant execute on function public.wms_loss_summary(jsonb) to authenticated;

create or replace function public.wms_loss_export_preview(p_filters jsonb)
returns jsonb language sql stable security invoker set search_path='' as $$
 with scoped as (
  select * from public.wms_losses
  where competence=p_filters->>'competence'
   and (nullif(p_filters->>'type','') is null or loss_type_id=p_filters->>'type')
   and (nullif(p_filters->>'warehouse','') is null or competent_warehouse_code=p_filters->>'warehouse')
   and (nullif(p_filters->>'dre','') is null or dre_code_snapshot=p_filters->>'dre')
   and (nullif(p_filters->>'cost_center','') is null or id in(select loss_id from public.wms_loss_allocations where cost_center=p_filters->>'cost_center'))
 ), approved as (select * from scoped where status='APROVADA')
 select jsonb_build_object('records',(select count(*) from approved),
 'warehouses',(select count(distinct competent_warehouse_code) from approved),
 'invoices',(select count(distinct coalesce(nullif(invoice_key,''),competent_warehouse_code||':'||nullif(invoice_number,''))) from approved),
 'invoice_value',coalesce((select sum(invoice_value) from approved),0),
 'rate_value',coalesce((select sum(rate_value_snapshot) from approved),0),
 'pending',(select count(*) from scoped where status='PENDENTE'),
 'corrections',(select count(*) from scoped where status='CORRECAO_SOLICITADA'),
 'signature',(select md5(string_agg(id::text||':'||version::text,',' order by id)) from approved))
$$;
revoke all on function public.wms_loss_export_preview(jsonb) from public,anon;
grant execute on function public.wms_loss_export_preview(jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('wms-loss-files','wms-loss-files',false,10485760,array['application/pdf','application/xml','text/xml']) on conflict(id) do nothing;
create policy loss_storage_read on storage.objects for select to authenticated using(
 bucket_id='wms-loss-files' and exists(select 1 from public.wms_losses l where l.id::text=split_part(name,'/',2) and l.competent_warehouse_code=split_part(name,'/',1)));
create policy loss_storage_insert on storage.objects for insert to authenticated with check(
 bucket_id='wms-loss-files' and name ~ '^[^/]+/[0-9a-f-]+/[0-9a-f-]+\.(xml|pdf)$'
 and exists(select 1 from public.wms_losses l where l.id::text=split_part(name,'/',2) and l.competent_warehouse_code=split_part(name,'/',1)
  and l.status in ('RASCUNHO','CORRECAO_SOLICITADA')
  and (l.created_by_id=private.current_wms_profile_id() or private.current_wms_role() in ('ADMINISTRADOR','SUPERVISOR'))));
notify pgrst,'reload schema';
