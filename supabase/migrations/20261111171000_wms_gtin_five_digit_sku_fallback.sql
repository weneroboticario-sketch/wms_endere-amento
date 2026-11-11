-- SKU from validated product EAN-13: 7891033 + five-digit SKU + GTIN check digit.
-- Reuse existing RPC and scope checks, prioritize exact registered and XML mappings.
-- No changes to inventory or automatic barcode registration.
create or replace function private.lookup_wms_sku_photo(p_warehouse text,p_code text,p_kind text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare digits text:=btrim(coalesce(p_code,'')); matches jsonb;
begin
 if auth.uid() is null or private.current_wms_profile_id() is null
 or not private.can_access_warehouse(p_warehouse)
 or private.current_wms_role() not in ('ADMINISTRADOR','SUPERVISOR','OPERADOR','ATENDENTE','CAIXA') then
  raise exception 'Consulta não autorizada neste estoque.' using errcode='42501';
 end if;
 if p_kind='SKU' and digits~'^[0-9]{4,8}$' then
  select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) into matches from (
    select sku,product_name from public.wms_products
    where sku~'^[0-9]{4,8}$' and ltrim(sku,'0')=ltrim(digits,'0')
    order by sku limit 10
  ) p;
 elsif p_kind='GTIN' and private.wms_valid_gtin(digits) then
  select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) into matches from (
    select distinct product.sku,product.product_name
    from (
      select b.sku from public.wms_sku_barcodes b
      where b.warehouse_code=p_warehouse and b.active is true
      and b.ean_key=lpad(digits,14,'0')
      union
      select i.internal_sku as sku from public.wms_inbound_receipt_items i
      join public.wms_inbound_receipts r on r.id=i.receipt_id
      where r.warehouse_code=p_warehouse and r.status in ('CONCLUIDO_CORRETO','CONCLUIDO_DIVERGENTE')
      and not i.is_extra and
      ((private.wms_valid_gtin(i.ean) and lpad(i.ean,14,'0')=lpad(digits,14,'0')) or
       (private.wms_valid_gtin(i.tributary_ean) and lpad(i.tributary_ean,14,'0')=lpad(digits,14,'0')))
    ) mapped
    join public.wms_products product on product.sku=mapped.sku
    where product.sku~'^[0-9]{4,8}$'
    order by product.sku limit 10
  ) p;
  -- Product line EAN-13 format confirmed by stock team:
  -- 7891033 + 5-character internal SKU + calculated GTIN check digit.
  -- Only derive when no registered / XML mapping already resolves this EAN.
  -- Never derive from arbitrary prefixes, invalid check digits, or missing SKUs.
  if jsonb_array_length(matches)=0 and length(digits)=13 and left(digits,7)='7891033' then
    select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) into matches from (
      select sku,product_name from public.wms_products
      where sku=substring(digits from 8 for 5)
      limit 1
    ) p;
  end if;
 else return '[]'::jsonb;
 end if;
 return matches;
end $$;
revoke all on function private.lookup_wms_sku_photo(text,text,text) from public,anon;
grant execute on function private.lookup_wms_sku_photo(text,text,text) to authenticated;
