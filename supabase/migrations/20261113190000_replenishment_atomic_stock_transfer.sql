-- WMS ENDEREÇAMENTO: transferência interna de saldo na conclusão de reposição.
-- Não recalcula nem movimenta solicitações históricas já concluídas.
-- Imports futuros continuam sendo snapshots oficiais das posições do estoque.
-- Outro ambiente possui um gatilho de crédito próprio. Não instalar dois gatilhos
-- que creditem a mesma reposição: a migração dele exige adaptação separada.
do $guard$
begin
  if exists (
    select 1 from pg_trigger
    where tgrelid = 'public.wms_replenishment_requests'::regclass
      and tgname = 'trg_wms_replenishment_store_credit'
      and not tgisinternal
  ) then
    raise exception 'Ambiente com crédito de reposição preexistente. Não aplique dois gatilhos de saldo simultaneamente.';
  end if;
end;
$guard$;

alter table public.wms_replenishment_requests
  add column if not exists loja_credito_processado boolean not null default false,
  add column if not exists loja_credito_quantidade numeric not null default 0,
  add column if not exists loja_credito_em timestamptz,
  add column if not exists captacao_debito_quantidade numeric not null default 0,
  add column if not exists saldo_movimentado_por_id text not null default '',
  add column if not exists movimentacao_estoque jsonb not null default '{}'::jsonb;

create or replace function private.transfer_replenishment_stock_on_completion()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_qty numeric;
  v_remaining numeric;
  v_take numeric;
  v_source record;
  v_store record;
  v_source_events jsonb := '[]'::jsonb;
  v_store_event jsonb := '{}'::jsonb;
  v_sellable boolean := false;
  v_store_id text;
begin
  if tg_op = 'INSERT' then
    new.loja_credito_processado := false;
    new.loja_credito_quantidade := 0;
    new.captacao_debito_quantidade := 0;
    new.loja_credito_em := null;
    new.saldo_movimentado_por_id := '';
    new.movimentacao_estoque := '{}'::jsonb;
    if new.status in ('CONCLUIDO','ENTREGUE_NA_LOJA') then
      raise exception 'Crie a solicitação antes de concluir a reposição.' using errcode = '22023';
    end if;
    return new;
  end if;

  -- Campos de auditoria não podem ser alterados por atualizações do navegador.
  new.loja_credito_processado := old.loja_credito_processado;
  new.loja_credito_quantidade := old.loja_credito_quantidade;
  new.captacao_debito_quantidade := old.captacao_debito_quantidade;
  new.loja_credito_em := old.loja_credito_em;
  new.saldo_movimentado_por_id := old.saldo_movimentado_por_id;
  new.movimentacao_estoque := old.movimentacao_estoque;

  -- Solicitações concluídas antes da instalação jamais recebem crédito retroativo.
  if old.status in ('CONCLUIDO','ENTREGUE_NA_LOJA') then
    if new.status not in ('CONCLUIDO','ENTREGUE_NA_LOJA') then
      raise exception 'Solicitação concluída não pode ser reaberta. Utilize ajuste auditado.' using errcode = '22023';
    end if;
    return new;
  end if;

  if coalesce(old.loja_credito_processado,false) then
    if new.status not in ('CONCLUIDO','ENTREGUE_NA_LOJA')
       or new.quantidade_atendida is distinct from old.quantidade_atendida
       or new.codigo_material is distinct from old.codigo_material
       or new.warehouse_code is distinct from old.warehouse_code then
      raise exception 'Reposição já movimentada: não é permitido alterar quantidade, SKU, estoque ou conclusão.' using errcode = '22023';
    end if;
    return new;
  end if;
  if new.status not in ('CONCLUIDO','ENTREGUE_NA_LOJA') then return new; end if;

  v_qty := coalesce(new.quantidade_atendida,0);
  if coalesce(new.is_deleted,false) or v_qty <= 0
     or v_qty > coalesce(new.quantidade_solicitada,0)
     or nullif(trim(coalesce(new.codigo_material,'')),'') is null then
    raise exception 'Quantidade ou SKU inválido para concluir a reposição.' using errcode = '22023';
  end if;
  if private.has_wms_role(array['ADMINISTRADOR','SUPERVISOR','OPERADOR']) is not true
     or (new.warehouse_code = any(private.current_wms_allowed_warehouses()::text[])) is not true then
    raise exception 'Sem permissão para movimentar saldo deste estoque.' using errcode = '42501';
  end if;

  -- Os pedidos de teste nunca alteram o estoque real.
  if coalesce(new.is_test,false) then
    new.loja_credito_processado := true;
    new.loja_credito_quantidade := 0;
    new.captacao_debito_quantidade := 0;
    new.loja_credito_em := now();
    new.saldo_movimentado_por_id := coalesce(private.current_wms_profile_id(),'');
    new.movimentacao_estoque := jsonb_build_object('teste',true);
    return new;
  end if;

  -- Serializa duas conclusões simultâneas do mesmo SKU dentro do mesmo estoque.
  perform pg_advisory_xact_lock(hashtextextended(
    'wms-reposicao:' || new.warehouse_code || ':' || new.codigo_material, 0
  ));

  v_remaining := v_qty;
  for v_source in
    select id, coalesce(total_fisico,0) as fisico,
           coalesce(total_disponivel,0) as disponivel,
           coalesce(is_sellable,false) as sellable
    from public.wms_stock_positions
    where warehouse_code = new.warehouse_code
      and codigo_material = new.codigo_material
      and source_type = 'CAPTACAO' and active is true
    order by id
    for update
  loop
    v_sellable := v_sellable or v_source.sellable;
    v_take := least(v_remaining, greatest(v_source.disponivel,0), greatest(v_source.fisico,0));
    if v_take <= 0 then continue; end if;
    update public.wms_stock_positions
    set total_fisico = coalesce(total_fisico,0) - v_take,
        total_disponivel = coalesce(total_disponivel,0) - v_take,
        record_hash = '', updated_at = now()
    where id = v_source.id and warehouse_code = new.warehouse_code;
    if not found then raise exception 'Falha ao debitar saldo da CAPTAÇÃO.'; end if;
    v_source_events := v_source_events || jsonb_build_array(jsonb_build_object(
      'posicao_id',v_source.id,'quantidade',v_take,
      'disponivel_antes',v_source.disponivel,'disponivel_depois',v_source.disponivel-v_take
    ));
    v_remaining := v_remaining - v_take;
    exit when v_remaining <= 0;
  end loop;

  if v_remaining > 0 then
    raise exception 'CAPTAÇÃO sem saldo suficiente para SKU % no estoque %. Necessário: %, faltante: %. Confira o saldo antes de concluir.',
      new.codigo_material,new.warehouse_code,v_qty,v_remaining using errcode = '22023';
  end if;

  select id,coalesce(total_fisico,0) as fisico,coalesce(total_disponivel,0) as disponivel
  into v_store
  from public.wms_stock_positions
  where warehouse_code = new.warehouse_code
    and codigo_material = new.codigo_material
    and source_type = 'LOJA' and active is true
  order by updated_at desc nulls last,id
  limit 1 for update;

  if found then
    v_store_id := v_store.id;
    update public.wms_stock_positions
    set total_fisico = coalesce(total_fisico,0) + v_qty,
        total_disponivel = coalesce(total_disponivel,0) + v_qty,
        record_hash = '', updated_at = now()
    where id = v_store_id and warehouse_code = new.warehouse_code;
    if not found then raise exception 'Falha ao creditar saldo da LOJA.'; end if;
    v_store_event := jsonb_build_object(
      'posicao_id',v_store_id,'disponivel_antes',v_store.disponivel,
      'disponivel_depois',v_store.disponivel+v_qty
    );
  else
    v_store_id := 'rep-stock-' || gen_random_uuid()::text;
    insert into public.wms_stock_positions(
      id,warehouse_code,source_type,codigo_material,nome_material,
      total_fisico,total_alocado,total_disponivel,active,is_sellable,record_hash
    ) values (
      v_store_id,new.warehouse_code,'LOJA',new.codigo_material,
      coalesce(new.nome_material,''),v_qty,0,v_qty,true,v_sellable,''
    );
    v_store_event := jsonb_build_object(
      'posicao_id',v_store_id,'disponivel_antes',0,'disponivel_depois',v_qty
    );
  end if;

  new.loja_credito_processado := true;
  new.loja_credito_quantidade := v_qty;
  new.captacao_debito_quantidade := v_qty;
  new.loja_credito_em := now();
  new.saldo_movimentado_por_id := coalesce(private.current_wms_profile_id(),'');
  new.movimentacao_estoque := jsonb_build_object(
    'origem','CAPTACAO','destino','LOJA','warehouse_code',new.warehouse_code,
    'sku',new.codigo_material,'quantidade',v_qty,'debitos',v_source_events,
    'credito',v_store_event
  );
  return new;
end;
$$;

drop trigger if exists trg_wms_replenishment_stock_transfer on public.wms_replenishment_requests;
create trigger trg_wms_replenishment_stock_transfer
before insert or update on public.wms_replenishment_requests
for each row execute function private.transfer_replenishment_stock_on_completion();

comment on function private.transfer_replenishment_stock_on_completion() is
'Debita CAPTAÇÃO e credita LOJA atomicamente quando uma reposição é concluída, com controle de duplicidade e sem retroatividade.';

notify pgrst, 'reload schema';
