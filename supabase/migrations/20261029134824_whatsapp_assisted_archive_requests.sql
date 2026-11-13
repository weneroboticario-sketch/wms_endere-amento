alter table public.wms_assisted_requests
  add column deleted_at timestamptz,
  add column deleted_by text references public.wms_users(id),
  add column delete_reason text;

create index wms_assisted_active_requests on public.wms_assisted_requests(warehouse_code,approved_at desc) where deleted_at is null;

create function private.is_whatsapp_assisted_request_active(request_key uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists (
    select 1 from public.wms_assisted_requests request where request.id=request_key
      and request.deleted_at is null and private.can_access_warehouse(request.warehouse_code)
  );
$$;
revoke all on function private.is_whatsapp_assisted_request_active(uuid) from public,anon,authenticated;
grant execute on function private.is_whatsapp_assisted_request_active(uuid) to authenticated;

drop policy wms_assisted_items_read on public.wms_assisted_request_items;
create policy wms_assisted_items_read on public.wms_assisted_request_items for select to authenticated
using (exists (select 1 from public.wms_assisted_requests request where request.id=request_id)
  or ((select auth.uid()) is not null and (select private.current_wms_role())='OPERADOR'
    and private.is_whatsapp_assisted_request_active(request_id)
    and exists (select 1 from public.operacao_tarefas task where task.id=task_id
      and task.atribuido_para=(select private.current_wms_profile_id())
      and private.can_access_warehouse(task.estoque_id))));

create function private.archive_whatsapp_assisted_request(request_key uuid, reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  request public.wms_assisted_requests;
  task public.operacao_tarefas;
  actor text;
begin
  actor := private.current_wms_profile_id();
  if auth.uid() is null or actor is null
    or coalesce(private.current_wms_role(),'') not in ('ADMINISTRADOR','SUPERVISOR')
    or not coalesce(private.can_access_warehouse('VDCG'),false) then
    raise exception using errcode='42501',message='Exclusão restrita ao administrador ou supervisor do VDCG.';
  end if;
  if length(btrim(coalesce(reason,''))) not between 3 and 500 then
    raise exception 'Informe o motivo da exclusão, entre 3 e 500 caracteres.';
  end if;
  select * into request from public.wms_assisted_requests where id=request_key and warehouse_code='VDCG';
  if not found then raise exception 'Solicitação não encontrada.'; end if;
  perform 1 from public.operacao_tarefas where id in (
    select task_id from public.wms_assisted_request_items where request_id=request_key
  ) order by id for update;
  perform 1 from public.wms_assisted_request_items where request_id=request_key order by id for update;
  select * into request from public.wms_assisted_requests where id=request_key for update;
  if request.deleted_at is not null then return request_key; end if;
  for task in select tasks.* from public.operacao_tarefas tasks
    join public.wms_assisted_request_items item on item.task_id=tasks.id
    where item.request_id=request_key order by tasks.id
  loop
    if task.estoque_id is distinct from 'VDCG' then raise exception 'Tarefa vinculada fora do estoque da solicitação.'; end if;
    if task.status not in ('CONCLUIDA','CANCELADA') then
      perform public.cancelar_tarefa(task.id,'Solicitação WhatsApp excluída da fila: '||btrim(reason));
    end if;
  end loop;
  update public.wms_assisted_requests set deleted_at=now(),deleted_by=actor,delete_reason=btrim(reason) where id=request_key;
  insert into public.wms_assisted_request_events(request_id,actor_id,event_type,note)
  values(request_key,actor,'REQUEST_ARCHIVED',btrim(reason));
  return request_key;
end $$;
revoke all on function private.archive_whatsapp_assisted_request(uuid,text) from public,anon,authenticated;
grant execute on function private.archive_whatsapp_assisted_request(uuid,text) to authenticated;

create function public.archive_whatsapp_assisted_request(request_key uuid, reason text)
returns uuid language sql security invoker set search_path='' as $$
  select private.archive_whatsapp_assisted_request(request_key,reason);
$$;
revoke all on function public.archive_whatsapp_assisted_request(uuid,text) from public,anon;
grant execute on function public.archive_whatsapp_assisted_request(uuid,text) to authenticated;

create function private.guard_archived_whatsapp_assisted_task() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.referencia_tipo='WHATSAPP_ITEM' and new.status not in ('CONCLUIDA','CANCELADA')
    and exists (select 1 from public.wms_assisted_request_items item
      join public.wms_assisted_requests request on request.id=item.request_id
      where item.task_id=old.id and request.deleted_at is not null) then
    raise exception 'Solicitação excluída da fila: não é permitido reabrir suas tarefas.';
  end if;
  return new;
end $$;
revoke all on function private.guard_archived_whatsapp_assisted_task() from public,anon,authenticated;
create trigger guard_archived_whatsapp_assisted_task before update on public.operacao_tarefas
for each row execute function private.guard_archived_whatsapp_assisted_task();

