-- Audited task RPC hardening; no operational data changes.
CREATE OR REPLACE FUNCTION private.criar_tarefa(p_tipo tipo_tarefa_enum, p_titulo character varying, p_descricao text DEFAULT NULL::text, p_estoque_id character varying DEFAULT NULL::character varying, p_localizacao_alvo text DEFAULT NULL::text, p_sku_alvo text DEFAULT NULL::text, p_quantidade_planejada numeric DEFAULT NULL::numeric, p_referencia_tipo character varying DEFAULT NULL::character varying, p_referencia_id character varying DEFAULT NULL::character varying, p_atribuido_para text DEFAULT NULL::text, p_prioridade prioridade_tarefa_enum DEFAULT 'NORMAL'::prioridade_tarefa_enum, p_prazo_sla timestamp with time zone DEFAULT NULL::timestamp with time zone, p_resultado_execucao jsonb DEFAULT '{}'::jsonb)
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

  if auth.uid() is null or private.current_wms_profile_id() is null or coalesce(private.current_wms_role(),'') not in ('ADMINISTRADOR','SUPERVISOR','OPERADOR') then
    raise exception using errcode='42501',message='Sessão e perfil operacional ativos são obrigatórios.';
  end if;
  v_role := private.current_wms_role();
  v_profile_id := private.current_wms_profile_id();
  v_estoque := upper(coalesce(nullif(btrim(p_estoque_id), ''), public.wms_estoque()));

  if v_role not in ('ADMINISTRADOR', 'SUPERVISOR') then
    raise exception using errcode = '42501', message = 'Somente supervisor ou administrador pode criar tarefas.';
  end if;

  if private.can_access_warehouse(v_estoque) is distinct from true then
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
REVOKE ALL ON FUNCTION private.criar_tarefa(tipo_tarefa_enum, character varying, text, character varying, text, text, numeric, character varying, character varying, text, prioridade_tarefa_enum, timestamp with time zone, jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.criar_tarefa(tipo_tarefa_enum, character varying, text, character varying, text, text, numeric, character varying, character varying, text, prioridade_tarefa_enum, timestamp with time zone, jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.criar_tarefa(p_tipo tipo_tarefa_enum, p_titulo character varying, p_descricao text DEFAULT NULL::text, p_estoque_id character varying DEFAULT NULL::character varying, p_localizacao_alvo text DEFAULT NULL::text, p_sku_alvo text DEFAULT NULL::text, p_quantidade_planejada numeric DEFAULT NULL::numeric, p_referencia_tipo character varying DEFAULT NULL::character varying, p_referencia_id character varying DEFAULT NULL::character varying, p_atribuido_para text DEFAULT NULL::text, p_prioridade prioridade_tarefa_enum DEFAULT 'NORMAL'::prioridade_tarefa_enum, p_prazo_sla timestamp with time zone DEFAULT NULL::timestamp with time zone, p_resultado_execucao jsonb DEFAULT '{}'::jsonb)
 RETURNS public.operacao_tarefas LANGUAGE sql SECURITY INVOKER SET search_path='' AS $wrapper$ SELECT private.criar_tarefa(p_tipo,p_titulo,p_descricao,p_estoque_id,p_localizacao_alvo,p_sku_alvo,p_quantidade_planejada,p_referencia_tipo,p_referencia_id,p_atribuido_para,p_prioridade,p_prazo_sla,p_resultado_execucao); $wrapper$;
REVOKE ALL ON FUNCTION public.criar_tarefa(tipo_tarefa_enum, character varying, text, character varying, text, text, numeric, character varying, character varying, text, prioridade_tarefa_enum, timestamp with time zone, jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.criar_tarefa(tipo_tarefa_enum, character varying, text, character varying, text, text, numeric, character varying, character varying, text, prioridade_tarefa_enum, timestamp with time zone, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION private.atribuir_tarefa(p_tarefa_id uuid, p_usuario_id text, p_observacao text DEFAULT NULL::text)
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

  if auth.uid() is null or private.current_wms_profile_id() is null or coalesce(private.current_wms_role(),'') not in ('ADMINISTRADOR','SUPERVISOR','OPERADOR') then
    raise exception using errcode='42501',message='Sessão e perfil operacional ativos são obrigatórios.';
  end if;
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
  if private.can_access_warehouse(v_tarefa.estoque_id) is distinct from true then
    raise exception using errcode='42501',message='Usuário sem acesso ao estoque da tarefa.';
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
REVOKE ALL ON FUNCTION private.atribuir_tarefa(uuid, text, text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.atribuir_tarefa(uuid, text, text) TO authenticated;
CREATE OR REPLACE FUNCTION public.atribuir_tarefa(p_tarefa_id uuid, p_usuario_id text, p_observacao text DEFAULT NULL::text)
 RETURNS public.operacao_tarefas LANGUAGE sql SECURITY INVOKER SET search_path='' AS $wrapper$ SELECT private.atribuir_tarefa(p_tarefa_id,p_usuario_id,p_observacao); $wrapper$;
REVOKE ALL ON FUNCTION public.atribuir_tarefa(uuid, text, text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.atribuir_tarefa(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION private.iniciar_tarefa(p_tarefa_id uuid, p_observacao text DEFAULT NULL::text)
 RETURNS operacao_tarefas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_profile_id text;
  v_tarefa public.operacao_tarefas;
begin

  if auth.uid() is null or private.current_wms_profile_id() is null or coalesce(private.current_wms_role(),'') not in ('ADMINISTRADOR','SUPERVISOR','OPERADOR') then
    raise exception using errcode='42501',message='Sessão e perfil operacional ativos são obrigatórios.';
  end if;
  v_profile_id := private.current_wms_profile_id();

  select * into v_tarefa
  from public.operacao_tarefas t
  where t.id = p_tarefa_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Tarefa não encontrada.';
  end if;
  if private.can_access_warehouse(v_tarefa.estoque_id) is distinct from true then
    raise exception using errcode='42501',message='Usuário sem acesso ao estoque da tarefa.';
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
REVOKE ALL ON FUNCTION private.iniciar_tarefa(uuid, text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.iniciar_tarefa(uuid, text) TO authenticated;
CREATE OR REPLACE FUNCTION public.iniciar_tarefa(p_tarefa_id uuid, p_observacao text DEFAULT NULL::text)
 RETURNS public.operacao_tarefas LANGUAGE sql SECURITY INVOKER SET search_path='' AS $wrapper$ SELECT private.iniciar_tarefa(p_tarefa_id,p_observacao); $wrapper$;
REVOKE ALL ON FUNCTION public.iniciar_tarefa(uuid, text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.iniciar_tarefa(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION private.concluir_tarefa(p_tarefa_id uuid, p_resultado_execucao jsonb DEFAULT '{}'::jsonb, p_observacao text DEFAULT NULL::text)
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

  if auth.uid() is null or private.current_wms_profile_id() is null or coalesce(private.current_wms_role(),'') not in ('ADMINISTRADOR','SUPERVISOR','OPERADOR') then
    raise exception using errcode='42501',message='Sessão e perfil operacional ativos são obrigatórios.';
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
  if private.can_access_warehouse(v_tarefa.estoque_id) is distinct from true then
    raise exception using errcode='42501',message='Usuário sem acesso ao estoque da tarefa.';
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
REVOKE ALL ON FUNCTION private.concluir_tarefa(uuid, jsonb, text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.concluir_tarefa(uuid, jsonb, text) TO authenticated;
CREATE OR REPLACE FUNCTION public.concluir_tarefa(p_tarefa_id uuid, p_resultado_execucao jsonb DEFAULT '{}'::jsonb, p_observacao text DEFAULT NULL::text)
 RETURNS public.operacao_tarefas LANGUAGE sql SECURITY INVOKER SET search_path='' AS $wrapper$ SELECT private.concluir_tarefa(p_tarefa_id,p_resultado_execucao,p_observacao); $wrapper$;
REVOKE ALL ON FUNCTION public.concluir_tarefa(uuid, jsonb, text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.concluir_tarefa(uuid, jsonb, text) TO authenticated;

CREATE OR REPLACE FUNCTION private.bloquear_tarefa(p_tarefa_id uuid, p_motivo_bloqueio text)
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

  if auth.uid() is null or private.current_wms_profile_id() is null or coalesce(private.current_wms_role(),'') not in ('ADMINISTRADOR','SUPERVISOR','OPERADOR') then
    raise exception using errcode='42501',message='Sessão e perfil operacional ativos são obrigatórios.';
  end if;
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
  if private.can_access_warehouse(v_tarefa.estoque_id) is distinct from true then
    raise exception using errcode='42501',message='Usuário sem acesso ao estoque da tarefa.';
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
REVOKE ALL ON FUNCTION private.bloquear_tarefa(uuid, text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.bloquear_tarefa(uuid, text) TO authenticated;
CREATE OR REPLACE FUNCTION public.bloquear_tarefa(p_tarefa_id uuid, p_motivo_bloqueio text)
 RETURNS public.operacao_tarefas LANGUAGE sql SECURITY INVOKER SET search_path='' AS $wrapper$ SELECT private.bloquear_tarefa(p_tarefa_id,p_motivo_bloqueio); $wrapper$;
REVOKE ALL ON FUNCTION public.bloquear_tarefa(uuid, text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bloquear_tarefa(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION private.cancelar_tarefa(p_tarefa_id uuid, p_motivo_cancelamento text)
 RETURNS operacao_tarefas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text;
  v_tarefa public.operacao_tarefas;
begin

  if auth.uid() is null or private.current_wms_profile_id() is null or coalesce(private.current_wms_role(),'') not in ('ADMINISTRADOR','SUPERVISOR','OPERADOR') then
    raise exception using errcode='42501',message='Sessão e perfil operacional ativos são obrigatórios.';
  end if;
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
  if private.can_access_warehouse(v_tarefa.estoque_id) is distinct from true then
    raise exception using errcode='42501',message='Usuário sem acesso ao estoque da tarefa.';
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
REVOKE ALL ON FUNCTION private.cancelar_tarefa(uuid, text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.cancelar_tarefa(uuid, text) TO authenticated;
CREATE OR REPLACE FUNCTION public.cancelar_tarefa(p_tarefa_id uuid, p_motivo_cancelamento text)
 RETURNS public.operacao_tarefas LANGUAGE sql SECURITY INVOKER SET search_path='' AS $wrapper$ SELECT private.cancelar_tarefa(p_tarefa_id,p_motivo_cancelamento); $wrapper$;
REVOKE ALL ON FUNCTION public.cancelar_tarefa(uuid, text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancelar_tarefa(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION private.validar_tarefa(p_tarefa_id uuid, p_observacao text DEFAULT NULL::text)
 RETURNS operacao_tarefas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text;
  v_tarefa public.operacao_tarefas;
begin

  if auth.uid() is null or private.current_wms_profile_id() is null or coalesce(private.current_wms_role(),'') not in ('ADMINISTRADOR','SUPERVISOR','OPERADOR') then
    raise exception using errcode='42501',message='Sessão e perfil operacional ativos são obrigatórios.';
  end if;
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
  if private.can_access_warehouse(v_tarefa.estoque_id) is distinct from true then
    raise exception using errcode='42501',message='Usuário sem acesso ao estoque da tarefa.';
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
REVOKE ALL ON FUNCTION private.validar_tarefa(uuid, text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.validar_tarefa(uuid, text) TO authenticated;
CREATE OR REPLACE FUNCTION public.validar_tarefa(p_tarefa_id uuid, p_observacao text DEFAULT NULL::text)
 RETURNS public.operacao_tarefas LANGUAGE sql SECURITY INVOKER SET search_path='' AS $wrapper$ SELECT private.validar_tarefa(p_tarefa_id,p_observacao); $wrapper$;
REVOKE ALL ON FUNCTION public.validar_tarefa(uuid, text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.validar_tarefa(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION private.arquivar_tarefa(p_tarefa_id uuid, p_observacao text DEFAULT NULL::text)
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

  if auth.uid() is null or private.current_wms_profile_id() is null or coalesce(private.current_wms_role(),'') not in ('ADMINISTRADOR','SUPERVISOR','OPERADOR') then
    raise exception using errcode='42501',message='Sessão e perfil operacional ativos são obrigatórios.';
  end if;
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
  if private.can_access_warehouse(v_tarefa.estoque_id) is distinct from true then
    raise exception using errcode='42501',message='Usuário sem acesso ao estoque da tarefa.';
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
REVOKE ALL ON FUNCTION private.arquivar_tarefa(uuid, text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.arquivar_tarefa(uuid, text) TO authenticated;
CREATE OR REPLACE FUNCTION public.arquivar_tarefa(p_tarefa_id uuid, p_observacao text DEFAULT NULL::text)
 RETURNS public.operacao_tarefas LANGUAGE sql SECURITY INVOKER SET search_path='' AS $wrapper$ SELECT private.arquivar_tarefa(p_tarefa_id,p_observacao); $wrapper$;
REVOKE ALL ON FUNCTION public.arquivar_tarefa(uuid, text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.arquivar_tarefa(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION private.desarquivar_tarefa(p_tarefa_id uuid)
 RETURNS operacao_tarefas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text;
  v_tarefa public.operacao_tarefas;
begin

  if auth.uid() is null or private.current_wms_profile_id() is null or coalesce(private.current_wms_role(),'') not in ('ADMINISTRADOR','SUPERVISOR','OPERADOR') then
    raise exception using errcode='42501',message='Sessão e perfil operacional ativos são obrigatórios.';
  end if;
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
  if private.can_access_warehouse(v_tarefa.estoque_id) is distinct from true then
    raise exception using errcode='42501',message='Usuário sem acesso ao estoque da tarefa.';
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
REVOKE ALL ON FUNCTION private.desarquivar_tarefa(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.desarquivar_tarefa(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.desarquivar_tarefa(p_tarefa_id uuid)
 RETURNS public.operacao_tarefas LANGUAGE sql SECURITY INVOKER SET search_path='' AS $wrapper$ SELECT private.desarquivar_tarefa(p_tarefa_id); $wrapper$;
REVOKE ALL ON FUNCTION public.desarquivar_tarefa(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.desarquivar_tarefa(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.gerar_codigo_tarefa(tipo_tarefa_enum) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.registrar_historico_tarefa() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sync_tarefa_reposicao() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.validar_responsavel_mesmo_estoque(text, text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.wms_perfil() RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $helper$ SELECT private.current_wms_role(); $helper$;
REVOKE ALL ON FUNCTION public.wms_perfil() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wms_perfil() TO authenticated;
CREATE OR REPLACE FUNCTION public.wms_estoque() RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $helper$ SELECT coalesce((private.current_wms_allowed_warehouses())[1],'VDCG'); $helper$;
REVOKE ALL ON FUNCTION public.wms_estoque() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wms_estoque() TO authenticated;
CREATE OR REPLACE FUNCTION public.wms_resolve_login_email(p_identifier text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
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
  where n.identifier is not null and char_length(n.identifier)<=256
    and u.active is true
    and coalesce(u.archived, false) is false
    and coalesce(u.auth_email, '') <> ''
  order by u.updated_at desc
  limit 1;
$function$
;
NOTIFY pgrst,'reload schema';

