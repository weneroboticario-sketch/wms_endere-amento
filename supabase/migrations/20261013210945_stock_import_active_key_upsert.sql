-- Preserve RLS and the existing unique index; reconcile active rows atomically.
create or replace function public.wms_upsert_import_positions(
  p_warehouse_code text, p_source_type text, p_batch_id text, p_rows jsonb
) returns integer language plpgsql security invoker set search_path = '' as $$
declare
  v_count integer;
begin
  if auth.uid() is null or not coalesce(private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','OPERADOR']),false)
    or not coalesce(p_warehouse_code=any(private.current_wms_allowed_warehouses()),false) then
    raise exception 'Estoque nao autorizado.' using errcode='42501';
  end if;
  if p_source_type not in ('CAPTACAO','LOJA') or p_source_type is null
    or p_rows is null or jsonb_typeof(p_rows)<>'array' then
    raise exception 'Carga de estoque invalida.' using errcode='22023';
  end if;
  if jsonb_array_length(p_rows)>500 then
    raise exception 'Limite de 500 posicoes por chamada.' using errcode='22023';
  end if;
  if not exists(select 1 from public.wms_stock_import_batches b
    where b.id=p_batch_id and b.warehouse_code=p_warehouse_code and b.source_type=p_source_type and b.status='PROCESSING') then
    raise exception 'Lote de importacao nao esta em processamento neste estoque.' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_rows) r where
    jsonb_typeof(r)<>'object' or nullif(r->>'id','') is null or nullif(r->>'codigo_material','') is null
    or (r->>'warehouse_code') is distinct from p_warehouse_code
    or (r->>'source_type') is distinct from p_source_type
    or (r->>'batch_id') is distinct from p_batch_id or (r->>'active') is distinct from 'true') then
    raise exception 'Posicao fora do escopo do lote.' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('stock-import:'||p_warehouse_code||':'||p_source_type,0));
  with incoming as (
    select value as r,ordinality from jsonb_array_elements(p_rows) with ordinality
  ), deduplicated as (
    select distinct on (r->>'codigo_material',coalesce(r->>'codigo_endereco','')) r
    from incoming order by r->>'codigo_material',coalesce(r->>'codigo_endereco',''),ordinality desc
  )
  insert into public.wms_stock_positions as target
    (id,created_at,updated_at,warehouse_code,source_type,batch_id,codigo_material,nome_material,
     total_fisico,total_alocado,total_disponivel,estacao,rack,linha,coluna,codigo_endereco,
     active,is_sellable,record_hash,last_seen_batch_id)
  select r->>'id',coalesce((r->>'created_at')::timestamptz,now()),coalesce((r->>'updated_at')::timestamptz,now()),
    p_warehouse_code,p_source_type,p_batch_id,r->>'codigo_material',coalesce(r->>'nome_material',''),
    coalesce((r->>'total_fisico')::numeric,0),coalesce((r->>'total_alocado')::numeric,0),coalesce((r->>'total_disponivel')::numeric,0),
    coalesce(r->>'estacao',''),coalesce(r->>'rack',''),coalesce(r->>'linha',''),coalesce(r->>'coluna',''),coalesce(r->>'codigo_endereco',''),
    true,coalesce((r->>'is_sellable')::boolean,false),coalesce(r->>'record_hash',''),p_batch_id
  from deduplicated
  on conflict (warehouse_code,source_type,codigo_material,(coalesce(codigo_endereco,''))) where active is true
  do update set updated_at=excluded.updated_at,batch_id=excluded.batch_id,nome_material=excluded.nome_material,
    total_fisico=excluded.total_fisico,total_alocado=excluded.total_alocado,total_disponivel=excluded.total_disponivel,
    estacao=excluded.estacao,rack=excluded.rack,linha=excluded.linha,coluna=excluded.coluna,
    is_sellable=excluded.is_sellable,record_hash=excluded.record_hash,last_seen_batch_id=excluded.last_seen_batch_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.wms_upsert_import_positions(text,text,text,jsonb) from public,anon;
grant execute on function public.wms_upsert_import_positions(text,text,text,jsonb) to authenticated;
notify pgrst, 'reload schema';
