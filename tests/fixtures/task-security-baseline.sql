CREATE OR REPLACE FUNCTION public.arquivar_tarefa(p_tarefa_id uuid, p_observacao text DEFAULT NULL::text)
 RETURNS operacao_tarefas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text;
  v_profile_id text;
  v_tarefa public.operacao_tarefas;
begin
  v_role := private.current_wms_role();
  v_profile_id := private.current_wms_profile_id();

  if v_role not in ('ADMINISTRADOR', 'SUPERVISOR') then
    raise exception using errcode = '42501', message = 'Somente supervisor ou administrador pode arquivar tarefas.';
  end if;

  select * into v_tarefa
  from public.operacao_tarefas t
  where t.id = p_tarefa_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Tarefa não encontrada.';
  end if;

  if not private.can_access_warehouse(v_tarefa.estoque_id) then
    raise exception using errcode = '42501', message = 'Usuário sem acesso ao estoque da tarefa.';
  end if;

  if v_tarefa.status not in ('CONCLUIDA', 'CANCELADA') then
    raise exception using errcode = '22023', message = 'Somente tarefas concluídas ou canceladas podem ser arquivadas.';
  end if;

  if coalesce(v_tarefa.arquivada, false) is true then
    raise exception using errcode = '22023', message = 'Tarefa já arquivada.';
  end if;

  update public.operacao_tarefas
  set arquivada = true,
      arquivada_por = v_profile_id,
      data_arquivamento = coalesce(data_arquivamento, now()),
      resultado_execucao = coalesce(resultado_execucao, '{}'::jsonb)
        || case when nullif(btrim(coalesce(p_observacao, '')), '') is null then '{}'::jsonb
                else jsonb_build_object('observacao_arquivamento', left(btrim(p_observacao), 500)) end
  where id = p_tarefa_id
  returning * into v_tarefa;

  return v_tarefa;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.atribuir_tarefa(p_tarefa_id uuid, p_usuario_id text, p_observacao text DEFAULT NULL::text)
 RETURNS operacao_tarefas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text;
  v_profile_id text;
  v_tarefa public.operacao_tarefas;
begin
  v_role := private.current_wms_role();
  v_profile_id := private.current_wms_profile_id();

  if v_role not in ('ADMINISTRADOR', 'SUPERVISOR') then
    raise exception using errcode = '42501', message = 'Operador não pode reatribuir tarefas.';
  end if;

  select * into v_tarefa
  from public.operacao_tarefas t
  where t.id = p_tarefa_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Tarefa não encontrada.';
  end if;

  if not private.can_access_warehouse(v_tarefa.estoque_id) then
    raise exception using errcode = '42501', message = 'Usuário sem acesso ao estoque da tarefa.';
  end if;

  if v_tarefa.status in ('CONCLUIDA', 'CANCELADA') then
    raise exception using errcode = '22023', message = 'Não é possível reatribuir tarefa concluída ou cancelada.';
  end if;

  perform public.validar_responsavel_mesmo_estoque(p_usuario_id, v_tarefa.estoque_id);

  update public.operacao_tarefas
  set atribuido_para = p_usuario_id,
      delegado_por = v_profile_id,
      status = 'ATRIBUIDA',
      motivo_bloqueio = null,
      resultado_execucao = coalesce(resultado_execucao, '{}'::jsonb) ||
        case when nullif(btrim(coalesce(p_observacao, '')), '') is null then '{}'::jsonb
             else jsonb_build_object('observacao_atribuicao', left(btrim(p_observacao), 500)) end
  where id = p_tarefa_id
  returning * into v_tarefa;

  return v_tarefa;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.bloquear_tarefa(p_tarefa_id uuid, p_motivo_bloqueio text)
 RETURNS operacao_tarefas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_profile_id text;
  v_role text;
  v_tarefa public.operacao_tarefas;
begin
  if nullif(btrim(coalesce(p_motivo_bloqueio, '')), '') is null then
    raise exception using errcode = '22023', message = 'Motivo do bloqueio é obrigatório.';
  end if;

  v_profile_id := private.current_wms_profile_id();
  v_role := private.current_wms_role();

  select * into v_tarefa
  from public.operacao_tarefas t
  where t.id = p_tarefa_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Tarefa não encontrada.';
  end if;

  if v_role not in ('ADMINISTRADOR', 'SUPERVISOR') and v_tarefa.atribuido_para is distinct from v_profile_id then
    raise exception using errcode = '42501', message = 'Somente o operador atribuído pode bloquear a tarefa.';
  end if;

  if v_tarefa.status in ('CONCLUIDA', 'CANCELADA') then
    raise exception using errcode = '22023', message = 'Não é possível bloquear tarefa concluída ou cancelada.';
  end if;

  update public.operacao_tarefas
  set status = 'BLOQUEADA',
      motivo_bloqueio = left(btrim(p_motivo_bloqueio), 500)
  where id = p_tarefa_id
  returning * into v_tarefa;

  return v_tarefa;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.cancelar_tarefa(p_tarefa_id uuid, p_motivo_cancelamento text)
 RETURNS operacao_tarefas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text;
  v_tarefa public.operacao_tarefas;
begin
  if nullif(btrim(coalesce(p_motivo_cancelamento, '')), '') is null then
    raise exception using errcode = '22023', message = 'Motivo do cancelamento é obrigatório.';
  end if;

  v_role := private.current_wms_role();

  if v_role not in ('ADMINISTRADOR', 'SUPERVISOR') then
    raise exception using errcode = '42501', message = 'Somente supervisor ou administrador pode cancelar tarefa.';
  end if;

  select * into v_tarefa
  from public.operacao_tarefas t
  where t.id = p_tarefa_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Tarefa não encontrada.';
  end if;

  if v_tarefa.status = 'CONCLUIDA' then
    raise exception using errcode = '22023', message = 'Não é possível cancelar tarefa já concluída.';
  end if;

  update public.operacao_tarefas
  set status = 'CANCELADA',
      motivo_cancelamento = left(btrim(p_motivo_cancelamento), 500)
  where id = p_tarefa_id
  returning * into v_tarefa;

  return v_tarefa;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.concluir_tarefa(p_tarefa_id uuid, p_resultado_execucao jsonb DEFAULT '{}'::jsonb, p_observacao text DEFAULT NULL::text)
 RETURNS operacao_tarefas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_profile_id text;
  v_role text;
  v_tarefa public.operacao_tarefas;
  v_data_conclusao timestamptz;
  v_status public.status_tarefa_enum;
begin
  v_profile_id := private.current_wms_profile_id();
  v_role := private.current_wms_role();

  select * into v_tarefa
  from public.operacao_tarefas t
  where t.id = p_tarefa_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Tarefa não encontrada.';
  end if;

  if v_role not in ('ADMINISTRADOR', 'SUPERVISOR') and v_tarefa.atribuido_para is distinct from v_profile_id then
    raise exception using errcode = '42501', message = 'Somente o operador atribuído pode concluir a tarefa.';
  end if;

  if v_tarefa.status in ('CONCLUIDA', 'CANCELADA') then
    raise exception using errcode = '22023', message = 'Tarefa já finalizada.';
  end if;

  v_data_conclusao := now();
  v_status := case when v_role in ('ADMINISTRADOR', 'SUPERVISOR') then 'CONCLUIDA' else 'AGUARDANDO_VALIDACAO' end;

  update public.operacao_tarefas
  set status = v_status,
      data_inicio = coalesce(data_inicio, v_data_conclusao),
      data_conclusao = v_data_conclusao,
      tempo_execucao_segundos = greatest(0, extract(epoch from (v_data_conclusao - coalesce(data_inicio, v_data_conclusao)))::int),
      motivo_bloqueio = null,
      resultado_execucao = coalesce(resultado_execucao, '{}'::jsonb)
        || coalesce(p_resultado_execucao, '{}'::jsonb)
        || case when nullif(btrim(coalesce(p_observacao, '')), '') is null then '{}'::jsonb
                else jsonb_build_object('observacao_conclusao', left(btrim(p_observacao), 500)) end
  where id = p_tarefa_id
  returning * into v_tarefa;

  return v_tarefa;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.criar_tarefa(p_tipo tipo_tarefa_enum, p_titulo character varying, p_descricao text DEFAULT NULL::text, p_estoque_id character varying DEFAULT NULL::character varying, p_localizacao_alvo text DEFAULT NULL::text, p_sku_alvo text DEFAULT NULL::text, p_quantidade_planejada numeric DEFAULT NULL::numeric, p_referencia_tipo character varying DEFAULT NULL::character varying, p_referencia_id character varying DEFAULT NULL::character varying, p_atribuido_para text DEFAULT NULL::text, p_prioridade prioridade_tarefa_enum DEFAULT 'NORMAL'::prioridade_tarefa_enum, p_prazo_sla timestamp with time zone DEFAULT NULL::timestamp with time zone, p_resultado_execucao jsonb DEFAULT '{}'::jsonb)
 RETURNS operacao_tarefas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text;
  v_profile_id text;
  v_estoque varchar(50);
  v_tarefa public.operacao_tarefas;
begin
  v_role := private.current_wms_role();
  v_profile_id := private.current_wms_profile_id();
  v_estoque := upper(coalesce(nullif(btrim(p_estoque_id), ''), public.wms_estoque()));

  if v_role not in ('ADMINISTRADOR', 'SUPERVISOR') then
    raise exception using errcode = '42501', message = 'Somente supervisor ou administrador pode criar tarefas.';
  end if;

  if not private.can_access_warehouse(v_estoque) then
    raise exception using errcode = '42501', message = 'Usuário sem acesso ao estoque informado.';
  end if;

  if p_atribuido_para is not null and btrim(p_atribuido_para) <> '' then
    perform public.validar_responsavel_mesmo_estoque(p_atribuido_para, v_estoque);
  end if;

  insert into public.operacao_tarefas (
    codigo_visivel,
    tipo,
    titulo,
    descricao,
    estoque_id,
    localizacao_alvo,
    sku_alvo,
    quantidade_planejada,
    referencia_tipo,
    referencia_id,
    criado_por,
    delegado_por,
    atribuido_para,
    prioridade,
    prazo_sla,
    status,
    resultado_execucao
  ) values (
    public.gerar_codigo_tarefa(p_tipo),
    p_tipo,
    left(coalesce(p_titulo, ''), 120),
    p_descricao,
    v_estoque,
    p_localizacao_alvo,
    p_sku_alvo,
    p_quantidade_planejada,
    p_referencia_tipo,
    p_referencia_id,
    v_profile_id,
    case when p_atribuido_para is not null and btrim(p_atribuido_para) <> '' then v_profile_id else null end,
    nullif(btrim(coalesce(p_atribuido_para, '')), ''),
    coalesce(p_prioridade, 'NORMAL'),
    p_prazo_sla,
    case when p_atribuido_para is not null and btrim(p_atribuido_para) <> '' then 'ATRIBUIDA'::public.status_tarefa_enum else 'PENDENTE'::public.status_tarefa_enum end,
    coalesce(p_resultado_execucao, '{}'::jsonb)
  ) returning * into v_tarefa;

  return v_tarefa;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.desarquivar_tarefa(p_tarefa_id uuid)
 RETURNS operacao_tarefas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text;
  v_tarefa public.operacao_tarefas;
begin
  v_role := private.current_wms_role();

  if v_role not in ('ADMINISTRADOR', 'SUPERVISOR') then
    raise exception using errcode = '42501', message = 'Somente supervisor ou administrador pode desarquivar tarefas.';
  end if;

  select * into v_tarefa
  from public.operacao_tarefas t
  where t.id = p_tarefa_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Tarefa não encontrada.';
  end if;

  if not private.can_access_warehouse(v_tarefa.estoque_id) then
    raise exception using errcode = '42501', message = 'Usuário sem acesso ao estoque da tarefa.';
  end if;

  if coalesce(v_tarefa.arquivada, false) is false then
    raise exception using errcode = '22023', message = 'Tarefa não está arquivada.';
  end if;

  update public.operacao_tarefas
  set arquivada = false,
      arquivada_por = null,
      data_arquivamento = null
  where id = p_tarefa_id
  returning * into v_tarefa;

  return v_tarefa;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.gerar_codigo_tarefa(p_tipo tipo_tarefa_enum)
 RETURNS character varying
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_seq bigint;
  v_prefixo text;
begin
  v_seq := nextval('public.seq_codigo_tarefa');
  v_prefixo := case p_tipo
    when 'TRANSFERENCIA' then 'TRF'
    when 'REPOSICAO' then 'REP'
    when 'ENDERECAMENTO' then 'END'
    when 'INVENTARIO' then 'INV'
    when 'AUDITORIA' then 'AUD'
    when 'ORGANIZACAO' then 'ORG'
    else 'TAR'
  end;
  return (v_prefixo || '-' || lpad(v_seq::text, 5, '0'))::varchar;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.iniciar_tarefa(p_tarefa_id uuid, p_observacao text DEFAULT NULL::text)
 RETURNS operacao_tarefas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_profile_id text;
  v_tarefa public.operacao_tarefas;
begin
  v_profile_id := private.current_wms_profile_id();

  select * into v_tarefa
  from public.operacao_tarefas t
  where t.id = p_tarefa_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Tarefa não encontrada.';
  end if;

  if v_tarefa.atribuido_para is distinct from v_profile_id then
    raise exception using errcode = '42501', message = 'Somente o operador atribuído pode iniciar a tarefa.';
  end if;

  if v_tarefa.status in ('CONCLUIDA', 'CANCELADA') then
    raise exception using errcode = '22023', message = 'Não é possível iniciar tarefa concluída ou cancelada.';
  end if;

  update public.operacao_tarefas
  set status = 'EM_ANDAMENTO',
      data_inicio = coalesce(data_inicio, now()),
      motivo_bloqueio = null,
      resultado_execucao = coalesce(resultado_execucao, '{}'::jsonb) ||
        case when nullif(btrim(coalesce(p_observacao, '')), '') is null then '{}'::jsonb
             else jsonb_build_object('observacao_inicio', left(btrim(p_observacao), 500)) end
  where id = p_tarefa_id
  returning * into v_tarefa;

  return v_tarefa;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.registrar_historico_tarefa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_usuario_id text;
begin
  v_usuario_id := private.current_wms_profile_id();

  if tg_op = 'INSERT' then
    insert into public.operacao_tarefas_historico (
      tarefa_id,
      usuario_id,
      status_anterior,
      status_novo,
      responsavel_anterior,
      responsavel_novo,
      observacao
    ) values (
      new.id,
      coalesce(v_usuario_id, new.criado_por),
      null,
      new.status,
      null,
      new.atribuido_para,
      'Tarefa criada.'
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status is distinct from new.status
       or old.atribuido_para is distinct from new.atribuido_para
       or old.arquivada is distinct from new.arquivada then
      insert into public.operacao_tarefas_historico (
        tarefa_id,
        usuario_id,
        status_anterior,
        status_novo,
        responsavel_anterior,
        responsavel_novo,
        observacao
      ) values (
        new.id,
        coalesce(v_usuario_id, new.delegado_por, new.criado_por),
        old.status,
        new.status,
        old.atribuido_para,
        new.atribuido_para,
        case
          when old.status is distinct from new.status and old.atribuido_para is distinct from new.atribuido_para then 'Status e responsável atualizados.'
          when old.status is distinct from new.status then 'Status atualizado.'
          when old.atribuido_para is distinct from new.atribuido_para then 'Responsável atualizado.'
          when coalesce(old.arquivada, false) is false and coalesce(new.arquivada, false) is true then 'Tarefa arquivada.'
          when coalesce(old.arquivada, false) is true and coalesce(new.arquivada, false) is false then 'Tarefa desarquivada.'
          else 'Atualização registrada.'
        end
      );
    end if;
    return new;
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.sync_tarefa_reposicao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_estoque text;
  v_status public.status_tarefa_enum;
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  v_estoque := upper(coalesce(new.warehouse_code, 'VDCG'));

  if coalesce(new.is_deleted, false) is true then
    update public.operacao_tarefas
    set status = 'CANCELADA',
        motivo_cancelamento = coalesce(nullif(motivo_cancelamento, ''), 'Pedido de reposição removido.'),
        resultado_execucao = coalesce(resultado_execucao, '{}'::jsonb) || jsonb_build_object('origem_reposicao_status', new.status, 'origem_reposicao_excluida', true)
    where referencia_tipo = 'REPOSICAO'
      and referencia_id = new.id;
    return new;
  end if;

  v_status := case
    when upper(coalesce(new.status, '')) in ('CANCELADO') then 'CANCELADA'
    when upper(coalesce(new.status, '')) in ('CONCLUIDO','ENTREGUE_NA_LOJA','SEM_ESTOQUE') then 'CONCLUIDA'
    when upper(coalesce(new.status, '')) in ('EM_SEPARACAO','ATENDIDO_PARCIAL','SEPARADO') then 'EM_ANDAMENTO'
    when upper(coalesce(new.status, '')) = 'PENDENTE' then 'PENDENTE'
    else 'ATRIBUIDA'
  end;

  insert into public.operacao_tarefas (
    codigo_visivel,
    tipo,
    titulo,
    descricao,
    estoque_id,
    sku_alvo,
    quantidade_planejada,
    referencia_tipo,
    referencia_id,
    criado_por,
    delegado_por,
    atribuido_para,
    prioridade,
    status,
    data_inicio,
    data_conclusao,
    tempo_execucao_segundos,
    resultado_execucao
  ) values (
    public.gerar_codigo_tarefa('REPOSICAO'),
    'REPOSICAO',
    left('Reposição SKU ' || coalesce(new.codigo_material, '-'), 120),
    concat('Pedido ', coalesce(new.id, ''), ' | Produto: ', coalesce(new.nome_material, '-')),
    v_estoque,
    new.codigo_material,
    coalesce(new.quantidade_solicitada, 0),
    'REPOSICAO',
    new.id,
    coalesce(new.solicitado_por_id, private.current_wms_profile_id()),
    case when nullif(coalesce(new.responsavel_id, ''), '') is not null then coalesce(new.solicitado_por_id, private.current_wms_profile_id()) else null end,
    nullif(coalesce(new.responsavel_id, ''), ''),
    case upper(coalesce(new.prioridade, 'NORMAL'))
      when 'BAIXA' then 'BAIXA'::public.prioridade_tarefa_enum
      when 'ALTA' then 'ALTA'::public.prioridade_tarefa_enum
      when 'URGENTE' then 'URGENTE'::public.prioridade_tarefa_enum
      else 'NORMAL'::public.prioridade_tarefa_enum
    end,
    case when nullif(coalesce(new.responsavel_id, ''), '') is not null and v_status = 'PENDENTE' then 'ATRIBUIDA' else v_status end,
    case when v_status in ('EM_ANDAMENTO','CONCLUIDA') then coalesce(new.started_at, now()) else null end,
    case when v_status = 'CONCLUIDA' then coalesce(new.finished_at, now()) else null end,
    case when v_status = 'CONCLUIDA' then greatest(0, extract(epoch from (coalesce(new.finished_at, now()) - coalesce(new.started_at, coalesce(new.created_at, now()))))::int) else null end,
    jsonb_build_object(
      'origem', 'wms_replenishment_requests',
      'reposicao_status', coalesce(new.status, ''),
      'codigo_material', coalesce(new.codigo_material, ''),
      'nome_material', coalesce(new.nome_material, ''),
      'responsavel_nome', coalesce(new.responsavel_nome, '')
    )
  ) on conflict (referencia_tipo, referencia_id)
  do update
    set titulo = excluded.titulo,
        descricao = excluded.descricao,
        estoque_id = excluded.estoque_id,
        sku_alvo = excluded.sku_alvo,
        quantidade_planejada = excluded.quantidade_planejada,
        atribuido_para = excluded.atribuido_para,
        prioridade = excluded.prioridade,
        delegado_por = case when excluded.atribuido_para is distinct from public.operacao_tarefas.atribuido_para then coalesce(private.current_wms_profile_id(), public.operacao_tarefas.delegado_por) else public.operacao_tarefas.delegado_por end,
        status = case
          when public.operacao_tarefas.status in ('CANCELADA','CONCLUIDA') and excluded.status not in ('CANCELADA','CONCLUIDA') then public.operacao_tarefas.status
          else excluded.status
        end,
        data_inicio = coalesce(public.operacao_tarefas.data_inicio, excluded.data_inicio),
        data_conclusao = case when excluded.status = 'CONCLUIDA' then coalesce(public.operacao_tarefas.data_conclusao, excluded.data_conclusao) else public.operacao_tarefas.data_conclusao end,
        tempo_execucao_segundos = case when excluded.status = 'CONCLUIDA' then coalesce(public.operacao_tarefas.tempo_execucao_segundos, excluded.tempo_execucao_segundos) else public.operacao_tarefas.tempo_execucao_segundos end,
        resultado_execucao = coalesce(public.operacao_tarefas.resultado_execucao, '{}'::jsonb) || excluded.resultado_execucao;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.validar_responsavel_mesmo_estoque(p_usuario_id text, p_estoque_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ok boolean;
begin
  if p_usuario_id is null or btrim(p_usuario_id) = '' then
    raise exception using errcode = '22023', message = 'Responsável obrigatório para esta operação.';
  end if;

  select exists (
    select 1
    from public.wms_users u
    where u.id = p_usuario_id
      and coalesce(u.active, true) is true
      and coalesce(u.archived, false) is false
      and upper(coalesce(u.role, '')) = 'OPERADOR'
      and upper(coalesce(u.default_warehouse_code, u.warehouse_code, '')) = upper(coalesce(p_estoque_id, ''))
  ) into v_ok;

  if not v_ok then
    raise exception using errcode = '42501', message = 'O responsável precisa ser OPERADOR ativo do mesmo estoque da tarefa.';
  end if;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.validar_tarefa(p_tarefa_id uuid, p_observacao text DEFAULT NULL::text)
 RETURNS operacao_tarefas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text;
  v_tarefa public.operacao_tarefas;
begin
  v_role := private.current_wms_role();

  if v_role not in ('ADMINISTRADOR', 'SUPERVISOR') then
    raise exception using errcode = '42501', message = 'Somente supervisor ou administrador pode validar tarefa.';
  end if;

  select * into v_tarefa
  from public.operacao_tarefas t
  where t.id = p_tarefa_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Tarefa não encontrada.';
  end if;

  if v_tarefa.status <> 'AGUARDANDO_VALIDACAO' then
    raise exception using errcode = '22023', message = 'A tarefa precisa estar em AGUARDANDO_VALIDACAO para ser validada.';
  end if;

  update public.operacao_tarefas
  set status = 'CONCLUIDA',
      resultado_execucao = coalesce(resultado_execucao, '{}'::jsonb)
        || case when nullif(btrim(coalesce(p_observacao, '')), '') is null then '{}'::jsonb
                else jsonb_build_object('observacao_validacao', left(btrim(p_observacao), 500)) end
  where id = p_tarefa_id
  returning * into v_tarefa;

  return v_tarefa;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.wms_estoque()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(((select private.current_wms_allowed_warehouses()))[1], 'VDCG');
$function$
;
CREATE OR REPLACE FUNCTION public.wms_perfil()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.current_wms_role();
$function$
;
CREATE OR REPLACE FUNCTION public.wms_resolve_login_email(p_identifier text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with normalized as (
    select nullif(btrim(p_identifier), '') as identifier
  )
  select u.auth_email
  from normalized n
  join public.wms_users u
    on (
      lower(u.username) = lower(n.identifier)
      or lower(u.matricula) = lower(n.identifier)
    )
  where n.identifier is not null
    and u.active is true
    and coalesce(u.archived, false) is false
    and coalesce(u.auth_email, '') <> ''
  order by u.updated_at desc
  limit 1;
$function$
;
