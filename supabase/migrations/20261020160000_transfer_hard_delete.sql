create or replace function public.wms_delete_transfer_permanently(p_transfer_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.wms_transfers%rowtype;
  optional_table text;
begin
  if auth.uid() is null or not private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR']) then
    raise exception 'Sem permissao para excluir transferencia.' using errcode = '42501';
  end if;
  if nullif(btrim(p_transfer_id), '') is null then
    raise exception 'Informe a transferencia.';
  end if;
  select * into target from public.wms_transfers where id = p_transfer_id for update;
  if not found then
    raise exception 'Transferencia nao encontrada.';
  end if;
  if not private.can_access_warehouse(target.warehouse_code) then
    raise exception 'Sem acesso ao estoque da transferencia.' using errcode = '42501';
  end if;

  delete from public.operacao_tarefas_historico h
  using public.operacao_tarefas t
  where h.tarefa_id = t.id
    and t.referencia_tipo = 'TRANSFERENCIA' and t.referencia_id = p_transfer_id;
  delete from public.operacao_tarefas
  where referencia_tipo = 'TRANSFERENCIA' and referencia_id = p_transfer_id;
  delete from public.wms_task_notifications where transfer_id = p_transfer_id;
  delete from public.wms_notifications where transfer_id = p_transfer_id;
  delete from public.wms_transfer_events where transfer_id = p_transfer_id;
  delete from public.wms_transfer_divergences where transfer_id = p_transfer_id;
  delete from public.wms_transfer_merge_items
  where merged_transfer_id = p_transfer_id or original_transfer_id = p_transfer_id;
  -- Some installations have package tables; errors must still roll back everything.
  foreach optional_table in array array['wms_transfer_boxes','wms_transfer_packages'] loop
    if pg_catalog.to_regclass('public.' || optional_table) is not null then
      execute pg_catalog.format('delete from public.%I where transfer_id = $1', optional_table)
      using p_transfer_id;
    end if;
  end loop;
  delete from public.wms_transfer_invoices where transfer_id = p_transfer_id;
  delete from public.wms_transfer_items where transfer_id = p_transfer_id;
  delete from public.wms_transfers where id = p_transfer_id;
  return true;
end;
$$;
revoke all on function public.wms_delete_transfer_permanently(text) from public, anon;
grant execute on function public.wms_delete_transfer_permanently(text) to authenticated;
notify pgrst, 'reload schema';
