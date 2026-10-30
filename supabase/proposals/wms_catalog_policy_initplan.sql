-- Same predicate and roles; evaluate the row-independent identity helper once.
alter policy wms_products_admin_write on public.wms_products
using ((select private.current_wms_is_global_admin()))
with check ((select private.current_wms_is_global_admin()));
