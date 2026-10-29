-- Proposed migration. No production data is removed by installing these functions.
create function private.delete_wms_caixa_request_permanently(
  request_key uuid, code text, confirmation text, expected_updated_at timestamptz
) returns boolean language plpgsql security definer set search_path='' as $$
declare
  initial public.wms_caixa_requests;
  target public.wms_caixa_requests;
  task_ids uuid[];
  linked_ids text[];
  batch record;
  remaining jsonb;
begin
  if auth.uid() is null or private.current_wms_role() is distinct from 'ADMINISTRADOR'
    or private.current_wms_is_global_admin() is distinct from true then
    raise exception using errcode='42501',message='Exclusão definitiva restrita ao administrador geral ativo.';
  end if;
  if code is null or private.can_access_warehouse(code) is distinct from true then
    raise exception using errcode='42501',message='Estoque não autorizado.';
  end if;
  if request_key is null or confirmation is distinct from 'EXCLUIR' then
    raise exception 'Digite EXCLUIR para confirmar a exclusão definitiva.';
  end if;
  -- Same serialization used by request submission and warehouse exports.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(request_key::text));
  select * into initial from public.wms_caixa_requests where id=request_key;
  if not found then return true; end if; -- Safe retry after a lost success response.
  if initial.warehouse_code is distinct from code then
    raise exception using errcode='42501',message='Solicitação de outro estoque.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('replenishment-export:'||code,0));
  -- Follow operational lock order: replenishment -> tasks -> Caixa request.
  if initial.replenishment_id is not null then
    perform 1 from public.wms_replenishment_requests where id=initial.replenishment_id and warehouse_code=code for update;
    if not found then raise exception 'Reposição vinculada ausente ou de outro estoque. Revise os vínculos.'; end if;
  end if;
  perform 1 from public.operacao_tarefas t where
    (t.referencia_tipo='CAIXA_AJUSTE' and t.referencia_id=request_key::text)
    or (initial.replenishment_id is not null and t.referencia_tipo='REPOSICAO' and t.referencia_id=initial.replenishment_id)
    or (initial.task_id is not null and t.id=initial.task_id)
    order by t.id for update;
  select * into target from public.wms_caixa_requests where id=request_key for update;
  if not found then return true; end if;
  if target.warehouse_code is distinct from code then
    raise exception using errcode='42501',message='Solicitação de outro estoque.';
  end if;
  if target.replenishment_id is distinct from initial.replenishment_id or target.task_id is distinct from initial.task_id
    or target.updated_at is distinct from expected_updated_at then
    raise exception 'A solicitação mudou. Atualize e confirme novamente antes de excluir.';
  end if;
  select coalesce(array_agg(t.id),'{}'::uuid[]) into task_ids from public.operacao_tarefas t where
    (t.referencia_tipo='CAIXA_AJUSTE' and t.referencia_id=request_key::text)
    or (target.replenishment_id is not null and t.referencia_tipo='REPOSICAO' and t.referencia_id=target.replenishment_id)
    or (target.task_id is not null and t.id=target.task_id);
  if exists(select 1 from public.operacao_tarefas where id=any(task_ids) and estoque_id is distinct from code)
    or exists(select 1 from public.operacao_tarefas where id=target.task_id and (
      (referencia_tipo='CAIXA_AJUSTE' and referencia_id=request_key::text)
      or (target.replenishment_id is not null and referencia_tipo='REPOSICAO' and referencia_id=target.replenishment_id)) is not true)
    or exists(select 1 from public.wms_caixa_requests where id<>request_key and task_id=any(task_ids))
    or exists(select 1 from public.wms_assisted_request_items where task_id=any(task_ids)) then
    raise exception 'Há tarefa compartilhada ou de outro estoque. Nenhum dado foi excluído.';
  end if;
  linked_ids:=array_remove(array[request_key::text,target.replenishment_id],null)
    || array(select task::text from unnest(task_ids) task);
  -- Remove only this request from export snapshots; preserve other requests/order.
  if target.replenishment_id is not null then
    for batch in select id,requests from public.wms_replenishment_export_batches b
      where b.warehouse_code=code and b.requests @> jsonb_build_array(jsonb_build_object('id',target.replenishment_id))
      order by b.id for update loop
      select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb) into remaining
        from jsonb_array_elements(batch.requests) with ordinality where value->>'id' is distinct from target.replenishment_id;
      if jsonb_array_length(remaining)=0 then delete from public.wms_replenishment_export_batches where id=batch.id;
      else update public.wms_replenishment_export_batches set requests=remaining where id=batch.id; end if;
    end loop;
  end if;
  delete from public.wms_task_notifications where coalesce(nullif(warehouse_code,''),warehouse_id)=code
    and nullif(transfer_id,'') is null and (request_id=any(linked_ids) or entity_id=any(linked_ids));
  delete from public.wms_notifications where coalesce(nullif(warehouse_code,''),warehouse_id)=code
    and nullif(transfer_id,'') is null and (request_id=any(linked_ids) or entity_id=any(linked_ids));
  delete from public.wms_caixa_request_messages where request_id=request_key;
  delete from public.wms_caixa_request_events where request_id=request_key;
  delete from public.wms_caixa_requests where id=request_key;
  delete from public.operacao_tarefas_historico where tarefa_id=any(task_ids);
  delete from public.operacao_tarefas where id=any(task_ids);
  if target.replenishment_id is not null then
    delete from public.wms_replenishment_requests where id=target.replenishment_id and warehouse_code=code;
  end if;
  return true;
end $$;
revoke all on function private.delete_wms_caixa_request_permanently(uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function private.delete_wms_caixa_request_permanently(uuid,text,text,timestamptz) to authenticated;
create function public.delete_wms_caixa_request_permanently(request_key uuid,code text,confirmation text,expected_updated_at timestamptz)
returns boolean language sql security invoker set search_path='' as $$
  select private.delete_wms_caixa_request_permanently(request_key,code,confirmation,expected_updated_at);
$$;
revoke all on function public.delete_wms_caixa_request_permanently(uuid,text,text,timestamptz) from public,anon;
grant execute on function public.delete_wms_caixa_request_permanently(uuid,text,text,timestamptz) to authenticated;
notify pgrst, 'reload schema';
