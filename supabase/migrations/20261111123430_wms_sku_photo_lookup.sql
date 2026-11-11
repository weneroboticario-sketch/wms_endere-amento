-- Read-only validation for Consulta de SKU. No stock or receipt mutations.
create or replace function private.lookup_wms_sku_photo(p_warehouse text,p_code text,p_kind text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare digits text:=btrim(coalesce(p_code,'')); matches jsonb; total integer:=0; pos integer; weight integer:=3;
begin
 if auth.uid() is null or private.current_wms_profile_id() is null or not private.can_access_warehouse(p_warehouse)
 or private.current_wms_role() not in ('ADMINISTRADOR','SUPERVISOR','OPERADOR','ATENDENTE','CAIXA') then
  raise exception 'Consulta não autorizada neste estoque.' using errcode='42501';
 end if;
 if p_kind='SKU' and digits~'^[0-9]{4,8}$' then
  select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) into matches from (
   select sku,product_name from public.wms_products where sku~'^[0-9]{4,8}$' and ltrim(sku,'0')=ltrim(digits,'0') order by sku limit 10
  ) p;
 elsif p_kind='GTIN' and digits~'^([0-9]{8}|[0-9]{12}|[0-9]{13}|[0-9]{14})$' then
  for pos in reverse length(digits)-1..1 loop total:=total+substr(digits,pos,1)::integer*weight;weight:=4-weight;end loop;
  if (10-total%10)%10<>right(digits,1)::integer then return '[]'::jsonb;end if;
  select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) into matches from (
   select distinct product.sku,product.product_name from public.wms_inbound_receipt_items i
   join public.wms_inbound_receipts r on r.id=i.receipt_id
   join public.wms_products product on product.sku=i.internal_sku
   where r.warehouse_code=p_warehouse and r.status in ('CONCLUIDO_CORRETO','CONCLUIDO_DIVERGENTE') and not i.is_extra
   and product.sku~'^[0-9]{4,8}$' and (
    (i.ean~'^([0-9]{8}|[0-9]{12}|[0-9]{13}|[0-9]{14})$' and lpad(i.ean,14,'0')=lpad(digits,14,'0')) or
    (i.tributary_ean~'^([0-9]{8}|[0-9]{12}|[0-9]{13}|[0-9]{14})$' and lpad(i.tributary_ean,14,'0')=lpad(digits,14,'0'))
   ) order by product.sku limit 10
  ) p;
 else return '[]'::jsonb;
 end if;
 return matches;
end $$;
revoke all on function private.lookup_wms_sku_photo(text,text,text) from public,anon;
grant execute on function private.lookup_wms_sku_photo(text,text,text) to authenticated;
create or replace function public.lookup_wms_sku_photo(p_warehouse text,p_code text,p_kind text)
returns jsonb language sql stable security invoker set search_path='' as $$select private.lookup_wms_sku_photo(p_warehouse,p_code,p_kind)$$;
revoke all on function public.lookup_wms_sku_photo(text,text,text) from public,anon;
grant execute on function public.lookup_wms_sku_photo(text,text,text) to authenticated;
