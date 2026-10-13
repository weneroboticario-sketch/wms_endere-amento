-- New read-only endpoints; existing operational policies and rows are unchanged.
create or replace function private.is_wms_global_administrator()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.wms_users u
    where u.auth_user_id = (select auth.uid()) and u.active is true
      and coalesce(u.archived, false) is false and u.role = 'ADMINISTRADOR'
      and u.default_warehouse_code = 'DOURADOS' and lower(u.username) in ('admin','tnogueira')
  );
$$;
revoke all on function private.is_wms_global_administrator() from public, anon, authenticated;

create or replace function private.wms_global_operation_rows(p_domain text)
returns table (
  warehouse_code text, id text, code text, status text, kind text, title text,
  priority text, responsible_id text, responsible_name text, requester text,
  sku text, quantity numeric, item_count numeric, divergence numeric,
  origin text, destination text, created_at timestamptz, updated_at timestamptz,
  deadline timestamptz, closed boolean, archived boolean, detail jsonb
) language sql stable security invoker set search_path = '' as $$
  select t.estoque_id::text,t.id::text,t.codigo_visivel::text,t.status::text,t.tipo::text,t.titulo::text,
    t.prioridade::text,t.atribuido_para,u.name,''::text,t.sku_alvo,t.quantidade_planejada,
    0::numeric,0::numeric,''::text,''::text,t.data_criacao,
    coalesce(t.data_conclusao,t.data_inicio,t.data_criacao),t.prazo_sla,
    t.status::text in ('CONCLUIDA','CANCELADA'),coalesce(t.arquivada,false),
    jsonb_build_object('started_at',t.data_inicio,'finished_at',t.data_conclusao,'duration_seconds',t.tempo_execucao_segundos,'description',t.descricao,'blocked_reason',t.motivo_bloqueio)
  from public.operacao_tarefas t left join public.wms_users u on u.id=t.atribuido_para
  join public.wms_warehouses w on w.code=t.estoque_id and w.active is true and w.code<>'DOURADOS'
  where p_domain in ('tasks','all')
  union all
  select r.warehouse_code,r.id,r.id,r.status,'REPOSICAO',r.nome_material,r.prioridade,
    coalesce(nullif(r.responsavel_id,''),r.claimed_by_id),
    coalesce(nullif(r.responsavel_nome,''),r.claimed_by_name),r.solicitado_por_nome,r.codigo_material,
    r.quantidade_solicitada,0::numeric,0::numeric,''::text,''::text,r.created_at,r.updated_at,null::timestamptz,
    r.status in ('CONCLUIDO','CANCELADO','CANCELADA'),coalesce(r.archived,false),
    jsonb_build_object('started_at',r.started_at,'finished_at',r.finished_at,'duration_seconds',r.duration_seconds,'attended',r.quantidade_atendida,'pending',r.quantidade_pendente,'location',r.localizacao_wms,'notes',r.observacao)
  from public.wms_replenishment_requests r
  join public.wms_warehouses w on w.code=r.warehouse_code and w.active is true and w.code<>'DOURADOS'
  where p_domain in ('replenishment','all') and not coalesce(r.is_deleted,false) and not coalesce(r.is_test,false)
  union all
  select t.warehouse_code,t.id,t.codigo_transferencia,t.status,'TRANSFERENCIA',t.nome_transferencia,
    ''::text,t.responsavel_id,t.responsavel_nome,t.imported_by_name,''::text,t.total_expected_quantity,
    coalesce(t.total_items,t.itens_total,0),greatest(coalesce(t.divergence_count,0),coalesce(t.itens_divergentes,0),
      case when t.has_divergence is true or coalesce(t.diferenca_total,0)<>0 then 1 else 0 end),
    w.name,t.estabelecimento_nome,t.created_at,t.updated_at,null::timestamptz,
    t.status in ('CANCELADA','CANCELADO','FINALIZADA','UNIFICADA','ARQUIVADA_POR_UNIFICACAO'),
    coalesce(t.archived_by_unification,false),
    jsonb_build_object('started_at',t.started_at,'finished_at',coalesce(t.finished_at,t.finalizado_em),'duration_seconds',t.total_duration_seconds,'skus',t.total_skus,'separated',t.total_separated_quantity,'packed',t.total_packed_quantity,'merged_into',t.merged_into_id,'unified_into',t.unified_into_transfer_id,'notes',t.observacao)
  from public.wms_transfers t
  join public.wms_warehouses w on w.code=t.warehouse_code and w.active is true and w.code<>'DOURADOS'
  where p_domain in ('transfers','all') and not coalesce(t.is_deleted,false);
$$;
revoke all on function private.wms_global_operation_rows(text) from public, anon, authenticated;

create or replace function private.wms_global_dashboard_data(
  p_section text, p_filters jsonb, p_limit integer, p_offset integer
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_result jsonb;
  v_query text := nullif(p_filters->>'query','');
  v_domain text;
  v_since timestamptz := coalesce(nullif(p_filters->>'since','')::timestamptz,now()-interval '24 hours');
  v_until timestamptz := coalesce(nullif(p_filters->>'until','')::timestamptz,now());
  v_warehouse text := nullif(p_filters->>'warehouse','');
  v_status text := nullif(p_filters->>'status','');
  v_responsible text := nullif(p_filters->>'responsible','');
  v_kind text := nullif(p_filters->>'kind','');
  v_priority text := nullif(p_filters->>'priority','');
  v_mode text := coalesce(p_filters->>'mode','open');
  v_history boolean := coalesce((p_filters->>'history')::boolean,false);
  v_stalled interval := make_interval(hours => greatest(1,least(168,coalesce((p_filters->>'stalled_hours')::integer,4))));
begin
  if auth.uid() is null or not private.is_wms_global_administrator() then
    raise exception using errcode='42501', message='Visao Geral nao autorizada.';
  end if;
  if v_since > v_until then raise exception 'Periodo invalido.'; end if;
  if p_section='users' then
    with matched as (
      select u.id,u.name,u.role,u.active,u.available_for_tasks as available,u.last_login_at,
        coalesce(nullif(u.default_warehouse_code,''),u.warehouse_code) as warehouse_code
      from public.wms_users u join public.wms_warehouses w on w.code=coalesce(nullif(u.default_warehouse_code,''),u.warehouse_code)
      where w.active is true and w.code<>'DOURADOS' and not coalesce(u.archived,false)
        and (v_warehouse is null or w.code=v_warehouse) and (v_responsible is null or u.id=v_responsible)
        and (v_query is null or concat_ws(' ',u.name,u.username,u.role) ilike '%'||v_query||'%')
    ), page as (select * from matched order by name,id limit greatest(1,least(100,p_limit)) offset greatest(0,least(100000,p_offset)))
    select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),'total',(select count(*) from matched)) into v_result;
    return v_result;
  end if;
  if p_section='transfer_items' then
    with matched as (
      select i.id,i.sku,i.descricao,i.quantidade_solicitada,i.quantidade_separada,i.quantidade_lacrada,i.has_divergence,i.endereco_codigo
      from public.wms_transfer_items i join public.wms_transfers t on t.id=i.transfer_id and t.warehouse_code=i.warehouse_code
      join public.wms_warehouses w on w.code=t.warehouse_code and w.active is true and w.code<>'DOURADOS'
      where t.id=p_filters->>'id' and not coalesce(t.is_deleted,false) and (v_warehouse is null or w.code=v_warehouse)
        and (v_query is null or concat_ws(' ',i.sku,i.descricao) ilike '%'||v_query||'%')
    ), page as (select * from matched order by sku,id limit greatest(1,least(100,p_limit)) offset greatest(0,least(100000,p_offset)))
    select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),'total',(select count(*) from matched)) into v_result;
    return v_result;
  end if;
  if p_section='overview' then
    select jsonb_build_object(
      'warehouses',coalesce(jsonb_agg(jsonb_build_object('code',w.code,'name',w.name) order by w.name),'[]'::jsonb),
      'tasks',private.wms_global_dashboard_data('tasks_summary',p_filters,50,0),
      'replenishment',private.wms_global_dashboard_data('replenishment_summary',p_filters,50,0),
      'transfers',private.wms_global_dashboard_data('transfers_summary',p_filters,50,0),
      'team',private.wms_global_dashboard_data('team',p_filters,50,0),
      'captacao',private.wms_global_dashboard_data('captacao',p_filters,50,0),
      'generated_at',now()) into v_result
    from public.wms_warehouses w where w.active is true and w.code<>'DOURADOS'
      and (v_warehouse is null or w.code=v_warehouse);
    return v_result;
  end if;
  if p_section='team' then
    with busy as (
      select distinct responsible_id from private.wms_global_operation_rows('all')
      where not closed and not archived and status in ('EM_ANDAMENTO','EM_SEPARACAO','EM_MONTAGEM_CAIXA','EM_CORRECAO')
        and nullif(responsible_id,'') is not null
    ), team as (
      select w.code as warehouse_code,count(u.id) as total,
        count(u.id) filter(where u.active is true and not coalesce(u.archived,false)) as active,
        count(u.id) filter(where u.active is true and not coalesce(u.archived,false) and u.available_for_tasks is true and b.responsible_id is null) as available,
        count(u.id) filter(where u.active is true and not coalesce(u.archived,false) and b.responsible_id is not null) as busy,
        count(u.id) filter(where u.active is not true or coalesce(u.archived,false) or (u.available_for_tasks is not true and b.responsible_id is null)) as unavailable,
        count(u.id) filter(where u.role='SUPERVISOR' and u.active is true and not coalesce(u.archived,false)) as supervisors,
        count(u.id) filter(where u.role='OPERADOR' and u.active is true and not coalesce(u.archived,false)) as operators,
        count(u.id) filter(where u.role='ATENDENTE' and u.active is true and not coalesce(u.archived,false)) as attendants
      from public.wms_warehouses w left join public.wms_users u on coalesce(nullif(u.default_warehouse_code,''),u.warehouse_code)=w.code
      left join busy b on b.responsible_id=u.id
      where w.active is true and w.code<>'DOURADOS' and (v_warehouse is null or w.code=v_warehouse) group by w.code
    ) select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(team)) from team),'[]'::jsonb),
      'users',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'warehouse_code',coalesce(nullif(u.default_warehouse_code,''),u.warehouse_code),'active',u.active,'role',u.role,'available',u.available_for_tasks,'last_login_at',u.last_login_at))
      from public.wms_users u join public.wms_warehouses w on w.code=coalesce(nullif(u.default_warehouse_code,''),u.warehouse_code)
      where w.active is true and w.code<>'DOURADOS' and not coalesce(u.archived,false) and (v_warehouse is null or w.code=v_warehouse)
        and (v_responsible is null or u.id=v_responsible)),'[]'::jsonb)) into v_result;
    return v_result;
  end if;
  if p_section='captacao' then
    with latest as (
      select w.code as warehouse_code,b.id,b.status,b.created_at,b.finished_at,b.imported_rows,b.file_name,b.total_rows,
        b.inserted_rows,b.updated_rows,b.unchanged_rows,b.error_rows,b.error_message,
        extract(epoch from b.finished_at-b.created_at) as duration_seconds,
        last_ok.finished_at as last_completed_at,store.finished_at as last_store_at
      from public.wms_warehouses w left join lateral (
        select id,status,created_at,finished_at,imported_rows,file_name,total_rows,inserted_rows,updated_rows,unchanged_rows,error_rows,error_message from public.wms_stock_import_batches
        where warehouse_code=w.code and source_type='CAPTACAO' and not coalesce(archived,false)
        order by created_at desc,id desc limit 1
      ) b on true left join lateral (
        select coalesce(finished_at,created_at) as finished_at from public.wms_stock_import_batches
        where warehouse_code=w.code and source_type='CAPTACAO' and status='COMPLETED' and not coalesce(archived,false)
        order by created_at desc,id desc limit 1
      ) last_ok on true left join lateral (
        select coalesce(finished_at,created_at) as finished_at from public.wms_stock_import_batches
        where warehouse_code=w.code and source_type='LOJA' and status='COMPLETED' and not coalesce(archived,false)
        order by created_at desc,id desc limit 1
      ) store on true where w.active is true and w.code<>'DOURADOS' and (v_warehouse is null or w.code=v_warehouse)
    ) select jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(latest)),'[]'::jsonb)) into v_result from latest;
    return v_result;
  end if;
  if p_section='imports' then
    with imports as (
      select b.warehouse_code,(b.created_at at time zone 'America/Cuiaba')::date as day,b.source_type,b.status,count(*) as total,
        avg(extract(epoch from b.finished_at-b.created_at)) filter(where b.finished_at>=b.created_at) as average_seconds,
        count(*) filter(where b.finished_at>=b.created_at) as duration_samples,
        count(*) filter(where (b.created_at at time zone 'America/Cuiaba')::date=(now() at time zone 'America/Cuiaba')::date) as today
      from public.wms_stock_import_batches b join public.wms_warehouses w on w.code=b.warehouse_code
      where w.active is true and w.code<>'DOURADOS' and not coalesce(b.archived,false)
        and b.created_at>=least(v_since,now()-interval '7 days') and b.created_at<=v_until
        and (v_warehouse is null or b.warehouse_code=v_warehouse)
        and (v_responsible is null or b.imported_by_id=v_responsible) and (v_status is null or b.status=v_status)
      group by b.warehouse_code,(b.created_at at time zone 'America/Cuiaba')::date,b.source_type,b.status
    ) select jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(imports)),'[]'::jsonb)) into v_result from imports;
    return v_result;
  end if;
  if p_section='activity' then
    with recent as (
      select * from (
        select warehouse_code,kind,status,code,title,responsible_name,responsible_id,updated_at from private.wms_global_operation_rows('all')
        where not archived
        union all
        select b.warehouse_code,'IMPORTACAO',b.status,b.id,b.file_name,b.imported_by_name,b.imported_by_id,coalesce(b.finished_at,b.created_at)
        from public.wms_stock_import_batches b join public.wms_warehouses w on w.code=b.warehouse_code
        where w.active is true and w.code<>'DOURADOS' and not coalesce(b.archived,false)
      ) events where updated_at between v_since and v_until and (v_warehouse is null or warehouse_code=v_warehouse)
        and (v_responsible is null or responsible_id=v_responsible)
      order by updated_at desc,code desc limit 20
    ) select jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(recent)),'[]'::jsonb)) into v_result from recent;
    return v_result;
  end if;
  if p_section in ('alerts','alerts_summary') then
    with issues as (
      select warehouse_code,id,kind,status,title,updated_at,
        case when deadline<now() then 'SLA VENCIDO' when status='BLOQUEADA' then 'TAREFA BLOQUEADA'
          when divergence>0 then 'DIVERGENCIA' when nullif(responsible_id,'') is null then 'SEM RESPONSAVEL'
          when not exists(select 1 from public.wms_users u where u.id=responsible_id and u.active is true and not coalesce(u.archived,false)) then 'RESPONSAVEL INATIVO'
          when status='SEM_ESTOQUE' then 'SEM ESTOQUE' when status='ATENDIDO_PARCIAL' then 'ATENDIMENTO PARCIAL'
          when exists(select 1 from public.wms_users u where u.id=responsible_id and u.available_for_tasks is not true) then 'RESPONSAVEL INDISPONIVEL'
          else 'OPERACAO PARADA' end as alert_type,
        'Abrir estoque e verificar a operacao.'::text as action
      from private.wms_global_operation_rows('all')
      where not closed and not archived and (deadline<now() or status='BLOQUEADA' or divergence>0
        or nullif(responsible_id,'') is null or updated_at<now()-v_stalled or status in ('SEM_ESTOQUE','ATENDIDO_PARCIAL')
        or exists(select 1 from public.wms_users u where u.id=responsible_id and u.available_for_tasks is not true)
        or not exists(select 1 from public.wms_users u where u.id=responsible_id and u.active is true and not coalesce(u.archived,false)))
        and (v_warehouse is null or warehouse_code=v_warehouse) and (v_responsible is null or responsible_id=v_responsible)
      union all
      select b.warehouse_code,b.id,'CAPTACAO',b.status,'Importacao CAPTACAO falhou',b.created_at,'IMPORTACAO FALHOU','Repetir a importacao apos verificar o arquivo.'
      from public.wms_stock_import_batches b join public.wms_warehouses w on w.code=b.warehouse_code
      where w.active is true and w.code<>'DOURADOS' and b.source_type='CAPTACAO' and b.status='FAILED' and not coalesce(b.archived,false)
        and (v_warehouse is null or b.warehouse_code=v_warehouse)
        and not exists(select 1 from public.wms_stock_import_batches newer where newer.warehouse_code=b.warehouse_code and newer.source_type='CAPTACAO' and not coalesce(newer.archived,false) and (newer.created_at,newer.id)>(b.created_at,b.id))
      union all
      select a.warehouse_code,a.id,'ESTOQUE',a.alert_type,a.nome_material,a.updated_at,a.alert_type,'Conferir saldo e localizacao no estoque.'
      from public.wms_stock_alerts a join public.wms_warehouses w on w.code=a.warehouse_code
      where a.active is true and w.active is true and w.code<>'DOURADOS' and (v_warehouse is null or a.warehouse_code=v_warehouse)
      union all
      select t.warehouse_code,t.id,'TRANSFERENCIA',t.status,'Unificacao sem transferencia de destino valida',t.updated_at,
        'UNIFICACAO INCONSISTENTE','Revisar a unificacao no estoque.'
      from public.wms_transfers t join public.wms_warehouses w on w.code=t.warehouse_code
      where w.active is true and w.code<>'DOURADOS' and not coalesce(t.is_deleted,false)
        and (v_warehouse is null or w.code=v_warehouse)
        and (t.archived_by_unification is true or t.status in ('UNIFICADA','ARQUIVADA_POR_UNIFICACAO'))
        and not exists(select 1 from public.wms_transfers target where target.id=coalesce(nullif(t.merged_into_id,''),t.unified_into_transfer_id) and target.warehouse_code=t.warehouse_code and not coalesce(target.is_deleted,false))
      union all
      select w.code,'BASE-'||w.code||'-'||sources.source_type,sources.source_type,'DESATUALIZADO',
        case when b.updated_at is null then 'Base sem importacao concluida' else 'Base sem atualizacao recente' end,
        b.updated_at,'BASE DESATUALIZADA','Atualizar a base do estoque.'
      from public.wms_warehouses w cross join (values('CAPTACAO'),('LOJA')) sources(source_type)
      left join (
        select warehouse_code,source_type,max(coalesce(finished_at,created_at)) as updated_at
        from public.wms_stock_import_batches where status='COMPLETED' and not coalesce(archived,false) group by warehouse_code,source_type
      ) b on b.warehouse_code=w.code and b.source_type=sources.source_type
      where w.active is true and w.code<>'DOURADOS' and (v_warehouse is null or w.code=v_warehouse)
        and (b.updated_at is null or b.updated_at<now()-make_interval(hours=>greatest(1,least(720,coalesce((p_filters->>'stale_hours')::integer,48)))))
      union all
      select w.code,'TEAM-'||w.code,'EQUIPE','CRITICO','Nenhum usuario ativo no cadastro',null::timestamptz,'SEM USUARIOS ATIVOS','Revisar a equipe cadastrada para o estoque.'
      from public.wms_warehouses w where w.active is true and w.code<>'DOURADOS' and (v_warehouse is null or w.code=v_warehouse)
        and not exists(select 1 from public.wms_users u where coalesce(nullif(u.default_warehouse_code,''),u.warehouse_code)=w.code and u.active is true and not coalesce(u.archived,false))
    ), matched as (select * from issues where (v_query is null or concat_ws(' ',title,alert_type,warehouse_code) ilike '%'||v_query||'%') and (v_status is null or status=v_status)),
    summary as (select warehouse_code,count(*) as total,
      count(*) filter(where alert_type in ('SLA VENCIDO','IMPORTACAO FALHOU','SEM USUARIOS ATIVOS','UNIFICACAO INCONSISTENTE') or (kind='TRANSFERENCIA' and alert_type='OPERACAO PARADA')) as critical
      from matched group by warehouse_code),
    page as (select * from matched order by updated_at desc nulls last,id desc limit greatest(1,least(100,p_limit)) offset greatest(0,least(100000,p_offset)))
    select jsonb_build_object('summary',coalesce((select jsonb_agg(to_jsonb(summary)) from summary),'[]'::jsonb),
      'rows',case when p_section='alerts_summary' then '[]'::jsonb else coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb) end,'total',(select count(*) from matched)) into v_result;
    return v_result;
  end if;
  v_domain := replace(p_section,'_summary','');
  if v_domain not in ('tasks','replenishment','transfers') then raise exception 'Secao invalida.'; end if;
  with filtered as (
    select r.*,
      (not r.closed and r.deadline<now()) as overdue,
      (not r.closed and r.updated_at<now()-v_stalled) as stalled,
      (not r.closed and nullif(r.responsible_id,'') is null) as unassigned,
      (not r.closed and nullif(r.responsible_id,'') is not null and not exists(select 1 from public.wms_users u where u.id=r.responsible_id and u.active is true and not coalesce(u.archived,false))) as inactive_responsible
    from private.wms_global_operation_rows(v_domain) r
    where (v_warehouse is null or r.warehouse_code=v_warehouse)
      and (v_status is null or r.status=v_status) and (v_kind is null or v_domain<>'tasks' or r.kind=v_kind)
      and (v_priority is null or r.priority=v_priority) and (v_responsible is null or r.responsible_id=v_responsible)
      and (v_history or not r.archived)
      and (nullif(p_filters->>'id','') is null or r.id=p_filters->>'id')
      and (v_query is null or concat_ws(' ',r.code,r.title,r.sku,r.responsible_name) ilike '%'||v_query||'%')
      and (not r.closed or r.updated_at between v_since and v_until)
  ), summaries as (
    select warehouse_code,status,kind,priority,count(*) as total,count(*) filter(where not closed and not archived) as open,
      count(*) filter(where (created_at at time zone 'America/Cuiaba')::date=(now() at time zone 'America/Cuiaba')::date) as created_today,
      count(*) filter(where nullif(detail->>'started_at','')::timestamptz>=date_trunc('day',now() at time zone 'America/Cuiaba') at time zone 'America/Cuiaba') as started_today,
      count(*) filter(where nullif(detail->>'finished_at','')::timestamptz>=date_trunc('day',now() at time zone 'America/Cuiaba') at time zone 'America/Cuiaba') as finished_today,
      avg(nullif(detail->>'duration_seconds','')::numeric) filter(where detail->>'started_at' is not null and detail->>'finished_at' is not null and nullif(detail->>'duration_seconds','')::numeric>=0) as average_seconds,
      count(*) filter(where detail->>'started_at' is not null and detail->>'finished_at' is not null and nullif(detail->>'duration_seconds','')::numeric>=0) as duration_samples,
      count(*) filter(where overdue) as overdue,count(*) filter(where stalled) as stalled,
      count(*) filter(where unassigned) as unassigned,count(*) filter(where inactive_responsible) as inactive_responsible,
      count(*) filter(where divergence>0 and not closed) as divergence,
      count(*) filter(where status='BLOQUEADA' and not closed) as blocked,max(updated_at) as last_activity
    from filtered group by warehouse_code,status,kind,priority
  ), page as (
    select * from filtered where case
      when v_status is not null or v_history then true
      when v_mode='overdue' then overdue
      when v_mode='pending' then status in ('PENDENTE','ATRIBUIDA','ATRIBUIDO')
      when v_mode='running' then status in ('EM_ANDAMENTO','EM_SEPARACAO','EM_MONTAGEM_CAIXA','EM_CORRECAO')
      when v_mode='completed' then status in ('CONCLUIDA','CONCLUIDO','FINALIZADA')
      else not closed end
    order by case when v_domain='tasks' then overdue else false end desc nulls last,
      created_at asc,case priority when 'URGENTE' then 0 when 'ALTA' then 1 when 'NORMAL' then 2 else 3 end,
      unassigned desc,id asc
    limit greatest(1,least(100,p_limit)) offset greatest(0,least(100000,p_offset))
  ) select jsonb_build_object('summary',coalesce((select jsonb_agg(to_jsonb(summaries)) from summaries),'[]'::jsonb),
    'rows',case when p_section like '%_summary' then '[]'::jsonb else coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb) end,
    'has_more',case when p_section like '%_summary' then false else (select count(*) from page)=greatest(1,least(100,p_limit)) end,
    'generated_at',now()) into v_result;
  return v_result;
end;
$$;
revoke all on function private.wms_global_dashboard_data(text,jsonb,integer,integer) from public, anon, authenticated;
grant execute on function private.wms_global_dashboard_data(text,jsonb,integer,integer) to authenticated;

create or replace function public.wms_global_dashboard(
  p_section text default 'overview', p_filters jsonb default '{}'::jsonb,
  p_limit integer default 50, p_offset integer default 0
) returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.wms_global_dashboard_data(p_section,coalesce(p_filters,'{}'::jsonb),coalesce(p_limit,50),coalesce(p_offset,0));
$$;
revoke all on function public.wms_global_dashboard(text,jsonb,integer,integer) from public, anon;
grant execute on function public.wms_global_dashboard(text,jsonb,integer,integer) to authenticated;
