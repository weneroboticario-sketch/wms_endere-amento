-- Reduce write amplification during large, sequential CAPTACAO imports.
-- Preserve all historical stock rows and the operational unique index.
alter table public.wms_stock_positions set (
 autovacuum_vacuum_scale_factor = 0.02,
 autovacuum_vacuum_threshold = 5000,
 autovacuum_analyze_scale_factor = 0.01,
 autovacuum_analyze_threshold = 5000
);
-- This index has exactly the same btree keys as idx_stock_positions_codigo_active.
-- Drop only the duplicate, leaving its equivalent and all other indexes.
drop index if exists public.wms_stock_positions_warehouse_sku_active_idx;
