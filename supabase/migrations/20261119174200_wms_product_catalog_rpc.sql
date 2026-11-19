-- Compact product reference catalog for the WMS client.
-- Returns one JSON object instead of paginating tens of thousands of product rows.

create or replace function public.wms_product_catalog()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select coalesce(jsonb_object_agg(p.sku, p.product_name order by p.sku), '{}'::jsonb)
  from public.wms_products p
$$;

revoke all on function public.wms_product_catalog() from public, anon, authenticated;
grant execute on function public.wms_product_catalog() to authenticated;
