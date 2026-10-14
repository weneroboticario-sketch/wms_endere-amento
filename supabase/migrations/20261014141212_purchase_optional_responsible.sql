begin;
create or replace function public.wms_create_purchase_transfer(p_warehouse_code text,p_destination_id text,
  p_responsible_id text,p_priority text,p_observation text,p_items jsonb,p_client_action_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_actor text:=private.current_wms_profile_id(); v_name text; v_key text;
  v_origin public.wms_warehouses%rowtype; v_destination public.wms_warehouses%rowtype;
  v_responsible public.wms_users%rowtype; v_establishment public.wms_establishments%rowtype;
  v_transfer public.wms_transfers%rowtype; v_item jsonb; v_sku text; v_qty numeric; v_need numeric;
  v_available numeric; v_description text; v_location text; v_stock_at timestamptz;
  v_count integer:=0; v_total numeric:=0;
begin
  if v_actor is null or not private.has_wms_role(array['COMPRAS','ADMINISTRADOR']) then raise exception 'Perfil nao autorizado.' using errcode='42501'; end if;
  if not coalesce(p_warehouse_code=any(private.current_wms_allowed_warehouses()),false) then raise exception 'Origem nao autorizada.' using errcode='42501'; end if;
  if p_client_action_id is null or length(p_client_action_id)<8 or length(p_client_action_id)>160 then raise exception 'Chave de idempotencia invalida.'; end if;
  v_key:='purchase:'||v_actor||':'||p_client_action_id;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_warehouse_code||':'||v_key,0));
  select * into v_transfer from public.wms_transfers where warehouse_code=p_warehouse_code and idempotency_key=v_key;
  if found then return jsonb_build_object('id',v_transfer.id,'code',v_transfer.codigo_transferencia,'skus',v_transfer.total_items,'quantity',v_transfer.total_expected_quantity,'replayed',true); end if;
  select * into v_origin from public.wms_warehouses where code=p_warehouse_code and active is true;
  if not found then raise exception 'Origem inativa.'; end if;
  select * into v_destination from public.wms_warehouses where id=p_destination_id and active is true;
  if not found or not coalesce(v_destination.code=any(private.current_wms_allowed_warehouses()),false) or v_destination.code=v_origin.code then
    raise exception 'Destino invalido ou nao autorizado.' using errcode='42501'; end if;
  select * into v_establishment from public.wms_establishments where ativo is true
    and (codigo=v_destination.code or codigo_loja=v_destination.code) order by (codigo=v_destination.code) desc,id limit 1;
  if nullif(btrim(p_responsible_id),'') is not null then
    select id,name into v_responsible.id,v_responsible.name from public.wms_users
      where id=p_responsible_id and active is true and not coalesce(archived,false)
        and available_for_tasks is true and role in ('OPERADOR','SUPERVISOR')
        and coalesce(nullif(default_warehouse_code,''),warehouse_code)=p_warehouse_code;
    if not found then raise exception 'Responsavel deve estar ativo e disponivel no estoque de origem.'; end if;
  end if;
  if p_priority is null or p_priority not in ('NORMAL','ALTA','URGENTE') or length(coalesce(p_observation,''))>4000 then raise exception 'Prioridade ou observacao invalida.'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Lista de itens invalida.'; end if;
  if jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>500 then raise exception 'Selecione de 1 a 500 SKUs.'; end if;
  if exists(select 1 from jsonb_array_elements(p_items) x group by btrim(x->>'sku') having count(*)>1) then raise exception 'SKU repetido na lista.'; end if;
  select name into v_name from public.wms_users where id=v_actor and active is true and not coalesce(archived,false);
  if not found then raise exception 'Usuario inativo.' using errcode='42501'; end if;
  v_transfer.id:='transfer-'||pg_catalog.gen_random_uuid()::text;
  v_transfer.codigo_transferencia:='CMP-'||to_char(now() at time zone 'America/Cuiaba','YYYYMMDD')||'-'||upper(right(v_transfer.id,8));
  insert into public.wms_transfers(id,codigo_transferencia,nome_transferencia,warehouse_id,warehouse_code,
    origem_id,origem_codigo_loja,origem_nome,destino_id,destino_codigo_loja,destino_nome,destino_cnpj,
    estabelecimento_id,estabelecimento_codigo,estabelecimento_nome,responsavel_id,responsavel_nome,
    criado_por_id,criado_por_nome,status,observacao,request_origin,requires_invoice,idempotency_key,purchase_priority,
    total_items,total_skus,total_expected_quantity,total_previsto,itens_total,itens_pendentes)
  values(v_transfer.id,v_transfer.codigo_transferencia,v_origin.code||' -> '||v_destination.code,v_origin.id,v_origin.code,
    v_origin.id,v_origin.code,v_origin.name,coalesce(v_establishment.id,v_destination.id),v_destination.code,
    coalesce(nullif(v_establishment.nome,''),v_destination.name),coalesce(v_establishment.cnpj,''),
    coalesce(v_establishment.id,v_destination.id),v_destination.code,coalesce(nullif(v_establishment.nome,''),v_destination.name),
    coalesce(v_responsible.id,''),coalesce(v_responsible.name,''),v_actor,v_name,case when v_responsible.id is null then 'PENDENTE' else 'ATRIBUIDA' end,coalesce(p_observation,''),'COMPRAS',true,v_key,p_priority,
    jsonb_array_length(p_items),jsonb_array_length(p_items),(select sum((x->>'requested_quantity')::numeric) from jsonb_array_elements(p_items) x),
    (select sum((x->>'requested_quantity')::numeric) from jsonb_array_elements(p_items) x),jsonb_array_length(p_items),jsonb_array_length(p_items));
  -- Sorted row locks make balance checks coherent with concurrent updates without reserving quantities.
  perform s.id from public.wms_stock_positions s where s.warehouse_code=p_warehouse_code and s.source_type='CAPTACAO'
    and s.active is true and not coalesce(s.archived,false) and s.codigo_material in(select btrim(x->>'sku') from jsonb_array_elements(p_items) x)
    order by s.id for share;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_sku:=btrim(v_item->>'sku');
    if v_sku is null or v_sku='' or length(v_sku)>80 or jsonb_typeof(v_item->'requested_quantity') is distinct from 'number'
      or jsonb_typeof(v_item->'store_need_quantity') is distinct from 'number' then raise exception 'SKU ou quantidade invalida.'; end if;
    v_qty:=(v_item->>'requested_quantity')::numeric; v_need:=(v_item->>'store_need_quantity')::numeric;
    if v_qty<=0 or v_qty<>trunc(v_qty) or v_qty>1000000 or v_need<0 or v_need<>trunc(v_need) or v_need>1000000 then raise exception 'Quantidade invalida para %.',v_sku; end if;
    select sum(s.total_disponivel),max(s.nome_material),string_agg(distinct nullif(s.codigo_endereco,''),' / '),max(s.updated_at)
      into v_available,v_description,v_location,v_stock_at from public.wms_stock_positions s
      where s.warehouse_code=p_warehouse_code and s.source_type='CAPTACAO' and s.active is true and not coalesce(s.archived,false) and s.codigo_material=v_sku;
    if v_available is null or v_qty>greatest(0,v_available) then raise exception 'Saldo CAPTACAO insuficiente ou desconhecido para %. Revalide a lista.',v_sku using errcode='40001'; end if;
    insert into public.wms_transfer_items(id,transfer_id,warehouse_id,warehouse_code,sku,codigo_material,descricao,
      quantidade_solicitada,quantidade_total_unidades,unidade_medida,tipo_quantidade,unidades_por_caixa,
      nome_material_snapshot,saldo_captacao_snapshot,saldo_captacao_disponivel,localizacao_captacao_snapshot,
      localizacao_sugerida,endereco_codigo,has_location,stock_snapshot_at,quantidade_faltante,origem_sugerida,
      quantidade_retirar_captacao,quantidade_sugerida_captacao,loja_origem,loja_destino,observation,idempotency_key)
    values('item-'||pg_catalog.gen_random_uuid()::text,v_transfer.id,v_origin.id,v_origin.code,v_sku,v_sku,v_description,
      v_qty,v_qty,'UN','UNIDADE',1,v_description,greatest(0,v_available),greatest(0,v_available),coalesce(v_location,''),
      coalesce(v_location,''),coalesce(v_location,''),coalesce(v_location,'')<>'',v_stock_at,greatest(0,v_need-v_qty),'CAPTACAO',
      v_qty,v_qty,v_origin.code,v_destination.code,'Necessidade informada: '||v_need::text,v_key||':'||v_sku);
    v_count:=v_count+1; v_total:=v_total+v_qty;
  end loop;
  -- Existing invoice trigger writes CREATED_BY_PURCHASES once in this same transaction.
  insert into public.wms_notifications(id,warehouse_id,warehouse_code,user_id,user_name,entity_id,transfer_id,event_type,title,message,payload)
  values('purchase-created:'||v_transfer.id,v_origin.id,v_origin.code,coalesce(v_responsible.id,''),coalesce(v_responsible.name,''),v_transfer.id,v_transfer.id,
    'PURCHASE_TRANSFER_CREATED','Nova transferencia solicitada por Compras',v_transfer.codigo_transferencia||' | Destino '||v_destination.code||' | '||v_count||' SKUs | '||v_total||' unidades',
    jsonb_build_object('skus',v_count,'quantity',v_total,'destination',v_destination.code,'priority',p_priority));
  return jsonb_build_object('id',v_transfer.id,'code',v_transfer.codigo_transferencia,'skus',v_count,'quantity',v_total,'replayed',false);
end $$;
-- Keep legacy permissions and narrowly allow an unassigned purchase request.
alter policy wms_transfers_warehouse_insert on public.wms_transfers
with check (
  warehouse_code = any((select private.current_wms_allowed_warehouses())::text[])
  and ((select private.current_wms_role()) <> 'COMPRAS'
    or (criado_por_id = (select private.current_wms_profile_id()) and (
      (status = 'PENDENTE' and request_origin = 'COMPRAS' and requires_invoice is true
        and nullif(responsavel_id,'') is null and nullif(responsavel_nome,'') is null)
      or (status = 'ATRIBUIDA' and exists (
        select 1 from public.wms_users responsible
        where responsible.id = wms_transfers.responsavel_id
          and responsible.role in ('SUPERVISOR','OPERADOR')
          and responsible.active is true and coalesce(responsible.archived,false) is false
          and responsible.available_for_tasks is true
          and coalesce(responsible.default_warehouse_code,responsible.warehouse_code) = wms_transfers.warehouse_code
      ))
    ))
  )
);
notify pgrst,'reload schema';
commit;
