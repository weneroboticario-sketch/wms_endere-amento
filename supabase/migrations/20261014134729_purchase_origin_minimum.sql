-- Keep the original RPC available for clients opened before this release.
create or replace function public.wms_purchase_store_needs_by_origin(
  p_destination_code text, p_origin_code text, p_search text default '',
  p_filter text default 'NEED', p_sort text default 'ZERO',
  p_target numeric default 3, p_page integer default 0, p_min_origin numeric default 0
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_result jsonb;
begin
  if not private.has_wms_role(array['COMPRAS','ADMINISTRADOR'])
    or not coalesce(p_destination_code = any(private.current_wms_allowed_warehouses()),false)
    or not coalesce(p_origin_code = any(private.current_wms_allowed_warehouses()),false)
  then raise exception 'Unidade nao autorizada.' using errcode = '42501'; end if;
  if p_target is null or p_target < 1 or p_target > 100000 or p_target <> trunc(p_target)
    or p_page is null or p_page < 0 or p_page > 10000
    or p_min_origin is null or p_min_origin < 0 or p_min_origin > 1000000
    or p_min_origin <> trunc(p_min_origin)
  then raise exception 'Parametros invalidos.'; end if;
  with loja as (
    select s.codigo_material sku, max(s.nome_material) description,
      sum(s.total_disponivel) store_available, max(s.updated_at) updated_at
    from public.wms_stock_positions s
    where s.warehouse_code = p_destination_code and s.source_type = 'LOJA'
      and s.active is true and coalesce(s.archived,false) = false
    group by s.codigo_material
  ), captacao as (
    select s.codigo_material sku, greatest(0,sum(s.total_disponivel)) available,
      string_agg(distinct nullif(s.codigo_endereco,''),' / ') location,
      max(s.updated_at) capture_at
    from public.wms_stock_positions s
    where s.warehouse_code = p_origin_code and s.source_type = 'CAPTACAO'
      and s.active is true and coalesce(s.archived,false) = false
    group by s.codigo_material
  ), filtered as (
    select l.*, greatest(0,ceil(p_target-l.store_available)) need,
      c.available, c.location, c.capture_at
    from loja l left join captacao c using (sku)
    where (p_min_origin = 0 or c.available >= p_min_origin)
      and (p_search = '' or l.sku ilike '%'||p_search||'%' or l.description ilike '%'||p_search||'%')
      and (p_filter = 'ALL' or (p_filter = 'ZERO' and l.store_available <= 0)
        or (p_filter = 'LOW' and l.store_available > 0 and l.store_available < p_target)
        or (p_filter not in ('ALL','ZERO','LOW') and l.store_available < p_target))
  ), paged as (
    select * from filtered order by
      case when p_sort = 'ZERO' then (store_available <= 0)::integer end desc,
      case when p_sort = 'NEED' then need end desc,
      case when p_sort = 'LOW' then store_available end asc,
      case when p_sort = 'NAME' then description end asc, sku
    limit 40 offset p_page*40
  ), compared as (
    select p.*, coalesce(o.open_transfers,'[]'::jsonb) open_transfers
    from paged p left join lateral (
      select jsonb_agg(distinct jsonb_build_object('id',t.id,'code',t.codigo_transferencia)) open_transfers
      from public.wms_transfers t join public.wms_transfer_items i
        on i.transfer_id = t.id and i.warehouse_code = t.warehouse_code
      where t.warehouse_code = p_origin_code and t.destino_codigo_loja = p_destination_code
        and not coalesce(t.is_deleted,false)
        and t.status not in ('FINALIZADA','CONCLUIDO','CANCELADA','CANCELADO')
        and i.status <> 'REMOVIDO' and i.sku = p.sku
    ) o on true
  )
  select jsonb_build_object(
    'rows',coalesce((select jsonb_agg(to_jsonb(c)) from compared c),'[]'::jsonb),
    'total',(select count(*) from filtered),
    'summary',(select jsonb_build_object(
      'zero',count(*) filter (where store_available <= 0),
      'low',count(*) filter (where store_available > 0 and store_available < p_target),
      'needs',count(*) filter (where store_available < p_target),
      'updated_at',max(updated_at)) from loja)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.wms_purchase_store_needs_by_origin(text,text,text,text,text,numeric,integer,numeric) from public, anon;
grant execute on function public.wms_purchase_store_needs_by_origin(text,text,text,text,text,numeric,integer,numeric) to authenticated;
notify pgrst, 'reload schema';
