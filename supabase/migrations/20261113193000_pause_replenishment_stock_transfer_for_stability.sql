-- Pausa operacional temporária. Sem exclusão de dados ou objetos.
-- Reativação, somente após testes: alter table public.wms_replenishment_requests enable trigger trg_wms_replenishment_stock_transfer;
alter table public.wms_replenishment_requests
  disable trigger trg_wms_replenishment_stock_transfer;
