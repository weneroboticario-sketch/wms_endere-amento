-- WMS: previous picked quantities must never survive a return-to-queue.
-- The existing participation history is retained. Completed historical work is untouched.
create or replace function private.guard_wms_replenishment_progress()
returns trigger language plpgsql set search_path to '' as $guard$
begin
  if tg_op = 'UPDATE'
     and new.status = 'PENDENTE'
     and old.status in ('ATRIBUIDO','EM_SEPARACAO','ATENDIDO_PARCIAL','SEPARADO','SEM_ESTOQUE') then
    new.quantidade_atendida := 0;
    new.quantidade_pendente := greatest(0,coalesce(new.quantidade_solicitada,0));
    new.last_attended_by_id := '';
    new.last_attended_by_name := '';
    new.no_stock_by_id := '';
    new.no_stock_by_name := '';
  end if;
  if new.status not in ('CONCLUIDO','ENTREGUE_NA_LOJA','CANCELADO')
     and (coalesce(new.quantidade_atendida,0) < 0
          or coalesce(new.quantidade_atendida,0) > coalesce(new.quantidade_solicitada,0)) then
    raise exception 'Quantidade atendida acima da solicitada. Corrija a contagem antes de prosseguir.'
      using errcode='22023';
  end if;
  return new;
end $guard$;
drop trigger if exists trg_wms_replenishment_progress_guard on public.wms_replenishment_requests;
create trigger trg_wms_replenishment_progress_guard
before insert or update on public.wms_replenishment_requests
for each row execute function private.guard_wms_replenishment_progress();
