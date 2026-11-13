-- Allow every authenticated, active SKU consultation role to REGISTER a missing EAN manually.
-- Maintain warehouse boundaries, GTIN validation, SKU existence, conflict safety and server-side audit.
-- Bulk CSV registrations remain restricted to admin/supervisor because they modify many mappings.
create or replace function private.register_wms_sku_barcode(
  p_warehouse text,p_ean text,p_sku text,p_source text default 'MANUAL'
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare target_ean text:=btrim(coalesce(p_ean,''));
        target_sku text:=btrim(coalesce(p_sku,''));
        existing_sku text;
        current_profile text;
begin
 current_profile:=private.current_wms_profile_id();
 if auth.uid() is null or current_profile is null
 or not private.can_access_warehouse(p_warehouse)
 or private.current_wms_role() not in ('ADMINISTRADOR','SUPERVISOR','OPERADOR','ATENDENTE','CAIXA') then
  raise exception 'Cadastro de EAN não autorizado nesta unidade.' using errcode='42501';
 end if;
 if not private.wms_valid_gtin(target_ean) then
  raise exception 'EAN/GTIN inválido: confira os dígitos.' using errcode='22023';
 end if;
 if target_sku !~ '^[0-9]{4,8}$'
 or not exists (select 1 from public.wms_products where sku=target_sku) then
  raise exception 'SKU inexistente no catálogo; selecione um SKU válido.' using errcode='22023';
 end if;
 if p_source not in ('MANUAL','CSV') then
  raise exception 'Origem inválida.' using errcode='22023';
 end if;
 if p_source = 'CSV' and private.current_wms_role() not in ('ADMINISTRADOR','SUPERVISOR') then
  raise exception 'Importação em lote restrita à administração ou supervisão.' using errcode='42501';
 end if;
 -- Prevent divergent binding from replacing a previously confirmed SKU.
 insert into public.wms_sku_barcodes(warehouse_code,ean,sku,source,created_by_profile_id)
 values(p_warehouse,target_ean,target_sku,p_source,current_profile)
 on conflict (warehouse_code,ean_key) do nothing;
 select b.sku into existing_sku
 from public.wms_sku_barcodes b
 where b.warehouse_code=p_warehouse and b.ean_key=lpad(target_ean,14,'0');
 if existing_sku is distinct from target_sku then
  raise exception 'Conflito: este EAN já está vinculado a outro SKU. Solicite revisão administrativa.'
    using errcode='23505';
 end if;
 return jsonb_build_object('ean',target_ean,'sku',target_sku,'saved',true);
end $$;
revoke all on function private.register_wms_sku_barcode(text,text,text,text) from public,anon;
grant execute on function private.register_wms_sku_barcode(text,text,text,text) to authenticated;
