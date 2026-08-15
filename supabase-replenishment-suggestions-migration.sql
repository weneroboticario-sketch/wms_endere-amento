create index if not exists idx_stock_positions_replenishment
on public.wms_stock_positions (warehouse_code, source_type, total_disponivel, active);

create index if not exists idx_stock_positions_codigo_active
on public.wms_stock_positions (warehouse_code, codigo_material, active);

create index if not exists idx_users_warehouse_active
on public.wms_users (default_warehouse_code, active);

create index if not exists idx_replenishment_open_sku
on public.wms_replenishment_requests (warehouse_code, codigo_material, status);

notify pgrst, 'reload schema';
