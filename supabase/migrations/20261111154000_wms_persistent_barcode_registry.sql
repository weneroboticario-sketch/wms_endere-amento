-- Persistent, warehouse-scoped GTIN/EAN -> internal SKU registry.
-- Read-only lookup remains available to operational roles.
-- Only ADMINISTRADOR/SUPERVISOR may create validated mappings.
create or replace function private.wms_valid_gtin(p_code text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare total integer := 0; pos integer; weight integer := 3;
begin
  if p_code is null or p_code !~ '^([0-9]{8}|[0-9]{12}|[0-9]{13}|[0-9]{14})$' then return false; end if;
  for pos in reverse length(p_code)-1..1 loop
    total := total + substr(p_code,pos,1)::integer * weight;
    weight := 4-weight;
  end loop;
  return ((10-total%10)%10) = right(p_code,1)::integer;
end $$;

create table if not exists public.wms_sku_barcodes (
  id bigint generated always as identity primary key,
  warehouse_code text not null check (warehouse_code ~ '^[A-Z0-9_-]{2,32}$'),
  ean text not null check (private.wms_valid_gtin(ean)),
  ean_key text generated always as (lpad(ean,14,'0')) stored,
  sku text not null references public.wms_products(sku),
  source text not null default 'MANUAL' check (source in ('MANUAL','CSV')),
  created_by_profile_id text not null,
  created_at timestamptz not null default now(),
  active boolean not null default true,
  constraint wms_sku_barcodes_unique_per_warehouse_gtin unique (warehouse_code,ean_key)
);
create index if not exists wms_sku_barcodes_sku_idx
  on public.wms_sku_barcodes (warehouse_code,sku);

alter table public.wms_sku_barcodes enable row level security;
revoke all on public.wms_sku_barcodes from public,anon,authenticated;
revoke all on sequence public.wms_sku_barcodes_id_seq from public,anon,authenticated;
-- Defense in depth if controlled direct access is granted in the future.
create policy wms_sku_barcodes_read_admin on public.wms_sku_barcodes
  for select to authenticated
  using (private.can_access_warehouse(warehouse_code)
         and private.current_wms_role() in ('ADMINISTRADOR','SUPERVISOR'));

-- Supabase API: keep existing signature and rights; merge validated mappings
-- with confirmed receipt mappings, never guess an SKU from a GTIN substring.
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
 else return '[]'::jsonb;
 end if;
 return matches;
end $$;
revoke all on function private.lookup_wms_sku_photo(text,text,text) from public,anon;
grant execute on function private.lookup_wms_sku_photo(text,text,text) to authenticated;

-- Create-only, idempotent mapping registration. A conflicting binding is NEVER overwritten.
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
 or private.current_wms_role() not in ('ADMINISTRADOR','SUPERVISOR') then
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

create or replace function public.register_wms_sku_barcode(
 p_warehouse text,p_ean text,p_sku text,p_source text default 'MANUAL'
) returns jsonb language sql volatile security invoker set search_path='' as
$$ select private.register_wms_sku_barcode(p_warehouse,p_ean,p_sku,p_source) $$;
revoke all on function public.register_wms_sku_barcode(text,text,text,text) from public,anon;
grant execute on function public.register_wms_sku_barcode(text,text,text,text) to authenticated;
