create function private.lookup_wms_caixa_item(code text,product_code text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or coalesce(private.current_wms_role(),'')<>'CAIXA' or not private.caixa_has_warehouse(code) then
    raise exception using errcode='42501',message='Consulta permitida somente ao Caixa ativo do estoque autorizado.';
  end if;
  if coalesce(product_code,'') !~ '^[0-9]{4,8}$' then raise exception 'Informe um SKU com 4 a 8 dígitos.'; end if;
  select jsonb_build_object('sku',product_code,
    'name',coalesce(max(nullif(position.nome_material,'')),(select product.product_name from public.wms_products product where product.sku=product_code limit 1),''),
    'found',count(*)>0 or exists(select 1 from public.wms_products product where product.sku=product_code),
    'storeAvailable',sum(position.total_disponivel) filter(where position.source_type='LOJA'),
    'captureAvailable',sum(position.total_disponivel) filter(where position.source_type='CAPTACAO'),
    'updatedAt',max(position.updated_at)) into result
  from public.wms_stock_positions position
  where position.warehouse_code=upper(code) and position.codigo_material=product_code and position.active and not coalesce(position.archived,false)
    and position.source_type in ('LOJA','CAPTACAO');
  return result;
end $$;
revoke all on function private.lookup_wms_caixa_item(text,text) from public,anon,authenticated;
grant execute on function private.lookup_wms_caixa_item(text,text) to authenticated;
create function public.lookup_wms_caixa_item(code text,product_code text) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.lookup_wms_caixa_item(code,product_code); $$;
revoke all on function public.lookup_wms_caixa_item(text,text) from public,anon;
grant execute on function public.lookup_wms_caixa_item(text,text) to authenticated;
