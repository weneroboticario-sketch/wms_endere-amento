begin;
-- Creation may be pending delegation; physical execution remains unavailable to COMPRAS.
drop policy if exists wms_transfer_items_warehouse_insert on public.wms_transfer_items;
create policy wms_transfer_items_warehouse_insert on public.wms_transfer_items
for insert to authenticated with check (
  warehouse_code=any((select private.current_wms_allowed_warehouses())::text[])
  and (
    (select private.current_wms_role())<>'COMPRAS'
    or (
      coalesce(quantidade_separada,0)=0 and coalesce(quantidade_lacrada,0)=0
      and coalesce(quantidade_lacrada_unidades,0)=0 and coalesce(quantidade_solicitada,0)>0
      and exists (
        select 1 from public.wms_transfers transfer_row
        where transfer_row.id=wms_transfer_items.transfer_id
          and transfer_row.warehouse_code=wms_transfer_items.warehouse_code
          and transfer_row.criado_por_id=(select private.current_wms_profile_id())
          and transfer_row.request_origin='COMPRAS' and transfer_row.requires_invoice is true
          and transfer_row.invoice_stage='' and not transfer_row.is_deleted
          and transfer_row.status in ('PENDENTE','ATRIBUIDA')
      )
    )
  )
);
notify pgrst,'reload schema';
commit;
