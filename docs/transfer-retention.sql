begin;
alter table public.wms_transfers add column if not exists removal_kind text not null default 'ACTIVE'
  check(removal_kind in ('ACTIVE','ARCHIVED','DELETED'));
alter table public.wms_transfers add column if not exists removal_reason text not null default '';
alter table public.wms_transfers add column if not exists purge_after timestamptz;
alter table public.wms_transfers add column if not exists purge_claim uuid;
alter table public.wms_transfers add column if not exists purge_claimed_at timestamptz;
alter table public.wms_transfers add column if not exists deleted_at timestamptz;
alter table public.wms_transfers add column if not exists deleted_by_id text;
alter table public.wms_transfers add column if not exists deleted_by_name text;
create index if not exists wms_transfer_purge_due on public.wms_transfers(purge_after,id)
  where is_deleted and removal_kind='DELETED';
-- Archived documents remain readable, but removed processes cannot receive new uploads.
drop policy if exists wms_removed_transfer_upload_insert on storage.objects;
create policy wms_removed_transfer_upload_insert on storage.objects as restrictive for insert to authenticated
  with check(not exists(select 1 from public.wms_transfers retired where retired.is_deleted
    and bucket_id='wms-transfer-invoices' and starts_with(name,retired.warehouse_code||'/wms_transfers/'||retired.id||'/')));
drop policy if exists wms_removed_transfer_upload_update on storage.objects;
create policy wms_removed_transfer_upload_update on storage.objects as restrictive for update to authenticated
  using(true) with check(not exists(select 1 from public.wms_transfers retired where retired.is_deleted
    and bucket_id='wms-transfer-invoices' and starts_with(name,retired.warehouse_code||'/wms_transfers/'||retired.id||'/')));

-- Central gate used before fiscal guards: retirement cannot mutate operational/fiscal data.
create or replace function private.wms_transfer_retirement_gate(p_old jsonb,p_new jsonb) returns boolean
language plpgsql security invoker set search_path='' as $$
declare fields text[]:=array['is_deleted','deleted_at','deleted_by_id','deleted_by_name','removal_kind',
  'removal_reason','purge_after','purge_claim','purge_claimed_at','updated_at'];
begin
  if (p_old-fields) is distinct from (p_new-fields) then
    raise exception 'Arquivamento ou exclusao deve preservar NF, itens e etapas.';
  end if;
  if private.current_wms_role() not in ('ADMINISTRADOR','SUPERVISOR','COMPRAS')
    or private.current_wms_profile_id() is null
    or not coalesce((p_old->>'warehouse_code')=any(private.current_wms_allowed_warehouses()),false) then
    raise exception 'Remocao nao autorizada.' using errcode='42501';
  end if;
  if p_new->>'removal_kind' not in ('ARCHIVED','DELETED') or (p_new->>'is_deleted')::boolean is not true
    or length(btrim(coalesce(p_new->>'removal_reason','')))<5 or length(p_new->>'removal_reason')>4000 then
    raise exception 'Escolha arquivar ou excluir e informe justificativa entre 5 e 4000 caracteres.';
  end if;
  return true;
end $$;
revoke all on function private.wms_transfer_retirement_gate(jsonb,jsonb) from public,anon;
grant execute on function private.wms_transfer_retirement_gate(jsonb,jsonb) to authenticated;

create or replace function private.wms_transfer_retirement_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
declare n text;
begin
  if tg_op='DELETE' then
    if current_user not in ('postgres','service_role') or not old.is_deleted or old.removal_kind<>'DELETED'
      or old.purge_after is null or old.purge_after>now() or old.deleted_at>now()-interval '60 days' or old.purge_claim is null then
      raise exception 'Use a lixeira. Exclusao definitiva somente apos 60 dias pelo servico de limpeza.';
    end if;
    return old;
  end if;
  if tg_op='INSERT' then
    if new.removal_kind<>'ACTIVE' or new.is_deleted or new.purge_after is not null or new.purge_claim is not null then
      raise exception 'Nova transferencia deve iniciar ativa.';
    end if;
    return new;
  end if;
  -- Only the service worker may take a purge lease; all business columns stay frozen.
  if current_user in ('postgres','service_role') and old.is_deleted and old.removal_kind='DELETED'
    and (to_jsonb(new)-array['purge_claim','purge_claimed_at'])=(to_jsonb(old)-array['purge_claim','purge_claimed_at']) then return new;end if;
  if old.is_deleted or (new.is_deleted,new.removal_kind,new.deleted_at,new.deleted_by_id,new.deleted_by_name,
    new.removal_reason,new.purge_after,new.purge_claim,new.purge_claimed_at)
    is distinct from (old.is_deleted,old.removal_kind,old.deleted_at,old.deleted_by_id,old.deleted_by_name,
    old.removal_reason,old.purge_after,old.purge_claim,old.purge_claimed_at) then
    if old.is_deleted and old.removal_kind<>'ARCHIVED' then raise exception 'Transferencia excluida esta fora da operacao.';end if;
    if old.is_deleted and new.removal_kind<>'DELETED' then raise exception 'Registro ja arquivado.';end if;
    perform private.wms_transfer_retirement_gate(to_jsonb(old),to_jsonb(new));
    select name into n from public.wms_users where id=private.current_wms_profile_id();
    new.deleted_at:=now();new.deleted_by_id:=private.current_wms_profile_id();new.deleted_by_name:=n;
    new.purge_after:=case when new.removal_kind='DELETED' then now()+interval '60 days' else null end;
    new.purge_claim:=null;new.purge_claimed_at:=null;new.updated_at:=now();
  end if;
  return new;
end $$;
drop trigger if exists a00_transfer_retirement on public.wms_transfers;
create trigger a00_transfer_retirement before insert or update or delete on public.wms_transfers
for each row execute function private.wms_transfer_retirement_guard();

do $patch$
declare definition text; updated text; f text;
begin
  -- Reuse the deployed guards instead of replacing unrelated lifecycle logic.
  foreach f in array array['private.wms_expedition_guard()','private.wms_invoice_guard()'] loop
    definition:=replace(pg_get_functiondef(f::regprocedure),chr(13),'');
    updated:=replace(definition,E'begin\n',E'begin\n  if tg_op=''UPDATE'' and tg_table_name=''wms_transfers'' and new.is_deleted then return new;end if;\n');
    if updated=definition then raise exception 'Guard inesperado: %',f;end if;
    execute updated;
  end loop;
  definition:=pg_get_functiondef('private.wms_invoice_item_guard()'::regprocedure);
  updated:=replace(definition,'begin',
    'begin
  if tg_op=''DELETE'' and current_user in (''postgres'',''service_role'') and exists(
    select 1 from public.wms_transfers retired_parent where retired_parent.id=old.transfer_id and retired_parent.is_deleted
      and retired_parent.removal_kind=''DELETED'' and retired_parent.purge_after<=now() and retired_parent.deleted_at<=now()-interval ''60 days''
      and retired_parent.purge_claim is not null) then return old;end if;');
  if updated=definition then raise exception 'Guard dos itens inesperado.';end if;
  execute updated;
end $patch$;

create or replace function private.wms_transfer_retirement_after() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if not new.is_deleted or (old.is_deleted and old.removal_kind=new.removal_kind) then return new;end if;
  if to_regclass('public.operacao_tarefas') is not null then
    execute 'update public.operacao_tarefas set status=''CANCELADA'',arquivada=true,arquivada_por=$1,
      data_arquivamento=now(),motivo_cancelamento=$2 where referencia_tipo=''TRANSFERENCIA'' and referencia_id=$3'
      using new.deleted_by_id,new.removal_reason,new.id;
  end if;
  update public.wms_notifications set read=true,seen=true,archived=true,archived_at=now()
    where transfer_id=new.id and warehouse_code=new.warehouse_code;
  if to_regclass('public.wms_task_notifications') is not null then
    execute 'update public.wms_task_notifications set read=true,seen=true where transfer_id=$1 and warehouse_code=$2'
      using new.id,new.warehouse_code;
  end if;
  insert into public.wms_transfer_events(id,transfer_id,warehouse_code,user_id,user_name,event_type,details,payload)
    values('retirement:'||new.id||':'||new.removal_kind,new.id,new.warehouse_code,new.deleted_by_id,new.deleted_by_name,
      'TRANSFER_'||new.removal_kind,new.removal_reason,jsonb_build_object('purge_after',new.purge_after,'previous_status',old.status));
  return new;
end $$;
revoke all on function private.wms_transfer_retirement_after() from public,anon,authenticated;
drop trigger if exists zz_transfer_retirement_after on public.wms_transfers;
create trigger zz_transfer_retirement_after after update on public.wms_transfers
for each row execute function private.wms_transfer_retirement_after();

create or replace function public.wms_retire_transfer(p_id text,p_kind text,p_reason text,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.wms_transfers;
begin
  if private.current_wms_profile_id() is null or private.current_wms_role() not in ('ADMINISTRADOR','SUPERVISOR','COMPRAS') then
    raise exception 'Remocao nao autorizada.' using errcode='42501';end if;
  if p_kind not in ('ARCHIVED','DELETED') or length(btrim(coalesce(p_reason,'')))<5 or length(p_reason)>4000 then
    raise exception 'Escolha arquivar ou excluir e informe justificativa entre 5 e 4000 caracteres.';end if;
  select * into t from public.wms_transfers where id=p_id and warehouse_code=any(private.current_wms_allowed_warehouses()) for update;
  if not found then raise exception 'Transferencia nao encontrada ou nao autorizada.' using errcode='42501';end if;
  if t.is_deleted and t.removal_kind=p_kind and t.removal_reason=btrim(p_reason) then return to_jsonb(t);end if;
  if t.updated_at is distinct from p_expected_updated_at then raise exception 'Transferencia alterada. Atualize a tela.' using errcode='40001';end if;
  update public.wms_transfers set is_deleted=true,removal_kind=p_kind,removal_reason=btrim(p_reason)
    where id=t.id and warehouse_code=t.warehouse_code returning * into t;
  if not found then raise exception 'Remocao bloqueada pelas permissoes.' using errcode='42501';end if;
  return to_jsonb(t);
end $$;
revoke all on function public.wms_retire_transfer(text,text,text,timestamptz) from public,anon;
grant execute on function public.wms_retire_transfer(text,text,text,timestamptz) to authenticated;

-- Service-only leased batches keep two workers from deleting the same files concurrently.
create or replace function public.wms_transfer_purge_candidates() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  with due as (select id from public.wms_transfers where is_deleted and removal_kind='DELETED'
    and purge_after<=now() and deleted_at<=now()-interval '60 days'
    and (purge_claimed_at is null or purge_claimed_at<now()-interval '15 minutes')
    order by purge_after,id limit 25 for update skip locked), leased as (
    update public.wms_transfers t set purge_claim=gen_random_uuid(),purge_claimed_at=now()
      from due where t.id=due.id returning t.id,t.warehouse_code,t.purge_claim)
  select coalesce(jsonb_agg(to_jsonb(leased)),'[]'::jsonb) into result from leased;
  return result;
end $$;
revoke all on function public.wms_transfer_purge_candidates() from public,anon,authenticated;
grant execute on function public.wms_transfer_purge_candidates() to service_role;

create or replace function public.wms_transfer_purge_finish(p_id text,p_claim uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare t public.wms_transfers;r record;prefix text;
begin
  select * into t from public.wms_transfers where id=p_id and is_deleted and removal_kind='DELETED'
    and purge_after<=now() and deleted_at<=now()-interval '60 days' and purge_claim=p_claim for update;
  if not found then raise exception 'Exclusao definitiva nao autorizada ou prazo nao cumprido.';end if;
  prefix:=t.warehouse_code||'/wms_transfers/'||t.id||'/';
  if coalesce(t.invoice_file_path,'')<>'' and not starts_with(t.invoice_file_path,prefix) then
    raise exception 'Documento fora da pasta do processo. Revisao manual necessaria.';end if;
  if exists(select 1 from storage.objects where bucket_id='wms-transfer-invoices' and starts_with(name,prefix)) then
    raise exception 'Remova os documentos pelo Storage antes de apagar o processo.';end if;
  if to_regclass('public.operacao_tarefas') is not null then
    execute 'delete from public.operacao_tarefas where referencia_tipo=''TRANSFERENCIA'' and referencia_id=$1' using t.id;
  end if;
  for r in select * from (values
    ('wms_task_notifications','transfer_id'),('wms_notifications','transfer_id'),
    ('wms_transfer_boxes','transfer_id'),('wms_transfer_packages','transfer_id'),
    ('wms_transfer_divergences','transfer_id'),('wms_transfer_merge_items','merged_transfer_id'),
    ('wms_transfer_merge_items','original_transfer_id'),('wms_transfer_events','transfer_id'),
    ('wms_transfer_items','transfer_id')) as related(table_name,column_name) loop
    if to_regclass('public.'||r.table_name) is not null then
      execute format('delete from public.%I where %I=$1',r.table_name,r.column_name) using t.id;
    end if;
  end loop;
  delete from public.wms_history where warehouse_code=t.warehouse_code
    and (starts_with(id,'fiscal:wms_transfers:'||t.id||':') or starts_with(id,'transfer:'||t.id||':'));
  delete from public.wms_transfers where id=t.id;
  return true;
end $$;
revoke all on function public.wms_transfer_purge_finish(text,uuid) from public,anon,authenticated;
grant execute on function public.wms_transfer_purge_finish(text,uuid) to service_role;
notify pgrst,'reload schema';
commit;
