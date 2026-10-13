-- Display metadata only: warehouse codes and user assignments remain stable.
update public.wms_warehouses
set name = 'CP Álamo', notes = 'Unidade administrativa do CP Álamo', updated_at = now()
where code = 'DOURADOS' and name = 'CP Dourados';
notify pgrst, 'reload schema';
