-- Requested separately from the layout: administrative receipt cancellation/deletion.
-- No outbound transfer, inventory, product or addressing table is modified.
alter table public.wms_inbound_receipts drop constraint if exists wms_inbound_receipts_status_check;
alter table public.wms_inbound_receipts add constraint wms_inbound_receipts_status_check
 check(status in ('AGUARDANDO','EM_CONFERENCIA','CONCLUIDO_CORRETO','CONCLUIDO_DIVERGENTE','CANCELADO'));

create or replace function private.manage_wms_inbound(
 p_id uuid,p_warehouse text,p_action text,p_data jsonb,p_version integer,p_action_id uuid
) returns boolean language plpgsql security definer set search_path='' as $$
declare actor text:=private.current_wms_profile_id(); actor_role text:=private.current_wms_role();
 r public.wms_inbound_receipts; prior public.wms_inbound_receipt_events; actor_name text;
begin
 if actor is null or not coalesce(actor_role in ('ADMINISTRADOR','SUPERVISOR'),false)
 or not coalesce(private.can_access_warehouse(p_warehouse),false) then raise exception 'Recebimento não autorizado para gestão neste estoque.'; end if;
 if p_action is null or p_action not in ('CANCEL','DELETE') or p_action_id is null or p_data is null then raise exception 'Ação de gestão inválida.'; end if;
 if p_action='DELETE' and actor_role<>'ADMINISTRADOR' then raise exception 'Exclusão definitiva permitida somente ao administrador.'; end if;
 select * into r from public.wms_inbound_receipts where id=p_id and warehouse_code=p_warehouse for update;
 if not found then
  if p_action='DELETE' and not exists(select 1 from public.wms_inbound_receipts where id=p_id) then return false; end if;
  raise exception 'Recebimento não encontrado neste estoque.';
 end if;
 if p_action='CANCEL' then
  select * into prior from public.wms_inbound_receipt_events where receipt_id=p_id and action_id=p_action_id;
  if found then
   if prior.actor_id<>actor or prior.action<>'CANCEL' or prior.request_data<>p_data then raise exception 'Identificador reutilizado com outra ação.'; end if;
   return true;
  end if;
  if r.status='CANCELADO' then return false; end if;
 end if;
 if r.version is distinct from p_version then raise exception 'Recebimento alterado por outro colaborador. Atualize e revise antes de continuar.'; end if;
 if p_action='CANCEL' then
  if r.status not in ('AGUARDANDO','EM_CONFERENCIA') then raise exception 'Somente recebimentos em aberto podem ser cancelados.'; end if;
  if coalesce(length(trim(p_data->>'reason')),0) not between 1 and 500 then raise exception 'Informe um motivo de cancelamento de até 500 caracteres.'; end if;
  select name into actor_name from public.wms_users where id=actor;
  update public.wms_inbound_receipts set status='CANCELADO',version=version+1 where id=p_id;
  insert into public.wms_inbound_receipt_events(receipt_id,action_id,actor_id,actor_name,action,request_data,result_data)
  values(p_id,p_action_id,actor,actor_name,'CANCEL',p_data,jsonb_build_object('previous_status',r.status,'version',r.version+1));
 else
  if p_data->>'confirmation' is distinct from r.invoice_number then raise exception 'Confirme o número da NF para excluir definitivamente.'; end if;
  delete from public.wms_inbound_receipt_events where receipt_id=p_id;
  delete from public.wms_inbound_receipt_items where receipt_id=p_id;
  delete from public.wms_inbound_receipts where id=p_id;
 end if;
 return true;
end $$;
revoke all on function private.manage_wms_inbound(uuid,text,text,jsonb,integer,uuid) from public,anon;
grant execute on function private.manage_wms_inbound(uuid,text,text,jsonb,integer,uuid) to authenticated;
create or replace function public.manage_wms_inbound(
 p_id uuid,p_warehouse text,p_action text,p_data jsonb,p_version integer,p_action_id uuid
) returns boolean language sql security invoker set search_path='' as $$
 select private.manage_wms_inbound(p_id,p_warehouse,p_action,p_data,p_version,p_action_id)
$$;
revoke all on function public.manage_wms_inbound(uuid,text,text,jsonb,integer,uuid) from public,anon;
grant execute on function public.manage_wms_inbound(uuid,text,text,jsonb,integer,uuid) to authenticated;
