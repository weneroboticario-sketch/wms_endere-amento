-- Compatibility/performance fix applied to production on 2026-11-19.
-- Keeps the currently deployed client healthy while the server-filtered health reads are rolled out.

create index if not exists wms_stock_positions_updated_at_desc_idx
  on public.wms_stock_positions (updated_at desc);

create table if not exists public.wms_product_packaging (
  id text primary key,
  sku text not null,
  descricao text not null default '',
  unidades_por_caixa numeric not null,
  updated_at timestamptz not null default now(),
  updated_by text not null default '',
  constraint wms_product_packaging_units_positive check (unidades_por_caixa > 0)
);

create unique index if not exists wms_product_packaging_sku_uidx
  on public.wms_product_packaging (sku);

alter table public.wms_product_packaging enable row level security;

revoke all on public.wms_product_packaging from public, anon, authenticated;
grant select, insert, update on public.wms_product_packaging to authenticated;

drop policy if exists wms_product_packaging_read on public.wms_product_packaging;
create policy wms_product_packaging_read
on public.wms_product_packaging
for select
to authenticated
using (
  (select private.current_wms_profile_id()) is not null
  and (select private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','OPERADOR']))
);

drop policy if exists wms_product_packaging_insert on public.wms_product_packaging;
create policy wms_product_packaging_insert
on public.wms_product_packaging
for insert
to authenticated
with check (
  (select private.current_wms_profile_id()) is not null
  and (select private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','OPERADOR']))
);

drop policy if exists wms_product_packaging_update on public.wms_product_packaging;
create policy wms_product_packaging_update
on public.wms_product_packaging
for update
to authenticated
using (
  (select private.current_wms_profile_id()) is not null
  and (select private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','OPERADOR']))
)
with check (
  (select private.current_wms_profile_id()) is not null
  and (select private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','OPERADOR']))
);
