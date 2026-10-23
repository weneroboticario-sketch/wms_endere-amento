create policy wms_addressing_presence_read
on realtime.messages for select to authenticated
using (
  extension = 'presence'
  and (select realtime.topic()) = any (
    array(select 'wms-addressing:' || code from unnest((select private.current_wms_allowed_warehouses())) as code)
  )
);

create policy wms_addressing_presence_write
on realtime.messages for insert to authenticated
with check (
  extension = 'presence'
  and (select realtime.topic()) = any (
    array(select 'wms-addressing:' || code from unnest((select private.current_wms_allowed_warehouses())) as code)
  )
);
