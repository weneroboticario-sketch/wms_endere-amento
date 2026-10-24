-- Central de Tarefas
-- Observacao de compatibilidade:
-- O modelo original referenciava "usuarios" com UUID. Neste projeto a tabela
-- de usuarios operacionais e "public.wms_users" com chave texto (id), portanto
-- os campos de usuario foram adaptados para text sem alterar as regras de negocio.

create extension if not exists pgcrypto;

create sequence if not exists public.seq_codigo_tarefa;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tipo_tarefa_enum') then
    create type public.tipo_tarefa_enum as enum (
      'TRANSFERENCIA','REPOSICAO','ENDERECAMENTO','INVENTARIO','AUDITORIA','ORGANIZACAO','AVULSA'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'status_tarefa_enum') then
    create type public.status_tarefa_enum as enum (
      'PENDENTE','ATRIBUIDA','EM_ANDAMENTO','BLOQUEADA','AGUARDANDO_VALIDACAO','CONCLUIDA','CANCELADA'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'prioridade_tarefa_enum') then
    create type public.prioridade_tarefa_enum as enum ('BAIXA','NORMAL','ALTA','URGENTE');
  end if;
end
$$;

create table if not exists public.operacao_tarefas (
  id uuid primary key default gen_random_uuid(),
  codigo_visivel varchar(20) not null unique,
  tipo public.tipo_tarefa_enum not null,
  titulo varchar(120) not null,
  descricao text,
  estoque_id varchar(50) not null,
  localizacao_alvo text,
  sku_alvo text,
  quantidade_planejada numeric(12,2),
  referencia_tipo varchar(50),
  referencia_id varchar(100),
  criado_por text references public.wms_users(id),
  delegado_por text references public.wms_users(id),
  atribuido_para text references public.wms_users(id),
  prioridade public.prioridade_tarefa_enum not null default 'NORMAL',
  prazo_sla timestamptz,
  status public.status_tarefa_enum not null default 'PENDENTE',
  motivo_bloqueio text,
  motivo_cancelamento text,
  resultado_execucao jsonb not null default '{}'::jsonb,
  data_criacao timestamptz not null default now(),
  data_inicio timestamptz,
  data_conclusao timestamptz,
  tempo_execucao_segundos integer,
  constraint operacao_tarefas_ref_chk check (
    (referencia_tipo is null and referencia_id is null)
    or (referencia_tipo is not null and referencia_id is not null)
  )
);

create table if not exists public.operacao_tarefas_historico (
  id bigserial primary key,
  tarefa_id uuid not null references public.operacao_tarefas(id) on delete cascade,
  usuario_id text references public.wms_users(id),
  status_anterior public.status_tarefa_enum,
  status_novo public.status_tarefa_enum,
  responsavel_anterior text references public.wms_users(id),
  responsavel_novo text references public.wms_users(id),
  observacao text,
  data_evento timestamptz not null default now()
);

create index if not exists idx_tarefas_estoque_status
  on public.operacao_tarefas (estoque_id, status);
create index if not exists idx_tarefas_responsavel
  on public.operacao_tarefas (atribuido_para, status);
create index if not exists idx_tarefas_fila
  on public.operacao_tarefas (status, prioridade, data_criacao);
create index if not exists idx_tarefas_ref
  on public.operacao_tarefas (referencia_tipo, referencia_id);
create index if not exists idx_hist_tarefa
  on public.operacao_tarefas_historico (tarefa_id, data_evento desc);

create or replace function public.wms_perfil()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_wms_role();
$$;

create or replace function public.wms_estoque()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(((select private.current_wms_allowed_warehouses()))[1], 'VDCG');
$$;

create or replace function public.gerar_codigo_tarefa(p_tipo public.tipo_tarefa_enum)
returns varchar
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create or replace function public.validar_responsavel_mesmo_estoque(p_usuario_id text, p_estoque_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create or replace function public.criar_tarefa(
  p_tipo public.tipo_tarefa_enum,
  p_titulo varchar,
  p_descricao text default null,
  p_estoque_id varchar default null,
  p_localizacao_alvo text default null,
  p_sku_alvo text default null,
  p_quantidade_planejada numeric default null,
  p_referencia_tipo varchar default null,
  p_referencia_id varchar default null,
  p_atribuido_para text default null,
  p_prioridade public.prioridade_tarefa_enum default 'NORMAL',
  p_prazo_sla timestamptz default null,
  p_resultado_execucao jsonb default '{}'::jsonb
)
returns public.operacao_tarefas
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create or replace function public.atribuir_tarefa(
  p_tarefa_id uuid,
  p_usuario_id text,
  p_observacao text default null
)
returns public.operacao_tarefas
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create or replace function public.iniciar_tarefa(
  p_tarefa_id uuid,
  p_observacao text default null
)
returns public.operacao_tarefas
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create or replace function public.bloquear_tarefa(
  p_tarefa_id uuid,
  p_motivo_bloqueio text
)
returns public.operacao_tarefas
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create or replace function public.concluir_tarefa(
  p_tarefa_id uuid,
  p_resultado_execucao jsonb default '{}'::jsonb,
  p_observacao text default null
)
returns public.operacao_tarefas
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create or replace function public.validar_tarefa(
  p_tarefa_id uuid,
  p_observacao text default null
)
returns public.operacao_tarefas
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create or replace function public.cancelar_tarefa(
  p_tarefa_id uuid,
  p_motivo_cancelamento text
)
returns public.operacao_tarefas
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create or replace function public.registrar_historico_tarefa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
       or old.atribuido_para is distinct from new.atribuido_para then
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
          else 'Responsável atualizado.'
        end
      );
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_registrar_historico_tarefa on public.operacao_tarefas;
create trigger trg_registrar_historico_tarefa
after insert or update on public.operacao_tarefas
for each row
execute function public.registrar_historico_tarefa();

alter table public.operacao_tarefas enable row level security;
alter table public.operacao_tarefas_historico enable row level security;

revoke all on table public.operacao_tarefas from public, anon;
revoke all on table public.operacao_tarefas_historico from public, anon;
grant select on table public.operacao_tarefas to authenticated;
grant select on table public.operacao_tarefas_historico to authenticated;
grant insert, update, delete on table public.operacao_tarefas to authenticated;

-- Supervisão: enxerga e gerencia tarefas dos estoques permitidos.
drop policy if exists operacao_tarefas_supervisao_select on public.operacao_tarefas;
create policy operacao_tarefas_supervisao_select
on public.operacao_tarefas
for select to authenticated
using (
  (select private.current_wms_role()) in ('ADMINISTRADOR', 'SUPERVISOR')
  and (select private.can_access_warehouse(estoque_id))
);

drop policy if exists operacao_tarefas_supervisao_write on public.operacao_tarefas;
create policy operacao_tarefas_supervisao_write
on public.operacao_tarefas
for all to authenticated
using (
  (select private.current_wms_role()) in ('ADMINISTRADOR', 'SUPERVISOR')
  and (select private.can_access_warehouse(estoque_id))
)
with check (
  (select private.current_wms_role()) in ('ADMINISTRADOR', 'SUPERVISOR')
  and (select private.can_access_warehouse(estoque_id))
);

-- Operador: lê somente tarefas atribuídas a ele no estoque permitido.
drop policy if exists operacao_tarefas_operador_select on public.operacao_tarefas;
create policy operacao_tarefas_operador_select
on public.operacao_tarefas
for select to authenticated
using (
  (select private.current_wms_role()) = 'OPERADOR'
  and atribuido_para = (select private.current_wms_profile_id())
  and (select private.can_access_warehouse(estoque_id))
);

drop policy if exists operacao_tarefas_historico_select on public.operacao_tarefas_historico;
create policy operacao_tarefas_historico_select
on public.operacao_tarefas_historico
for select to authenticated
using (
  exists (
    select 1
    from public.operacao_tarefas t
    where t.id = operacao_tarefas_historico.tarefa_id
      and (
        ((select private.current_wms_role()) in ('ADMINISTRADOR', 'SUPERVISOR') and (select private.can_access_warehouse(t.estoque_id)))
        or
        ((select private.current_wms_role()) = 'OPERADOR' and t.atribuido_para = (select private.current_wms_profile_id()))
      )
  )
);

grant usage, select on sequence public.seq_codigo_tarefa to authenticated;
grant execute on function public.wms_perfil() to authenticated;
grant execute on function public.wms_estoque() to authenticated;
grant execute on function public.gerar_codigo_tarefa(public.tipo_tarefa_enum) to authenticated;
grant execute on function public.validar_responsavel_mesmo_estoque(text, text) to authenticated;
grant execute on function public.criar_tarefa(public.tipo_tarefa_enum, varchar, text, varchar, text, text, numeric, varchar, varchar, text, public.prioridade_tarefa_enum, timestamptz, jsonb) to authenticated;
grant execute on function public.atribuir_tarefa(uuid, text, text) to authenticated;
grant execute on function public.iniciar_tarefa(uuid, text) to authenticated;
grant execute on function public.bloquear_tarefa(uuid, text) to authenticated;
grant execute on function public.concluir_tarefa(uuid, jsonb, text) to authenticated;
grant execute on function public.validar_tarefa(uuid, text) to authenticated;
grant execute on function public.cancelar_tarefa(uuid, text) to authenticated;

-- Integração automática: Transferências -> Central de Tarefas
create or replace function public.sync_tarefa_transferencia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estoque text;
  v_status public.status_tarefa_enum;
  v_resultado jsonb;
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  v_estoque := upper(coalesce(new.warehouse_code, 'VDCG'));

  if coalesce(new.is_deleted, false) is true then
    update public.operacao_tarefas
    set status = 'CANCELADA',
        motivo_cancelamento = coalesce(nullif(motivo_cancelamento, ''), 'Transferência removida.'),
        resultado_execucao = coalesce(resultado_execucao, '{}'::jsonb) || jsonb_build_object('origem_transferencia_status', new.status, 'origem_transferencia_excluida', true)
    where referencia_tipo = 'TRANSFERENCIA'
      and referencia_id = new.id;
    return new;
  end if;

  v_status := case
    when upper(coalesce(new.status, '')) in ('CANCELADA') then 'CANCELADA'
    when upper(coalesce(new.status, '')) in ('PRONTA_PARA_NOTA','PRONTA_PARA_NOTA_COM_DIVERGENCIA','FINALIZADA','FINALIZADA_PARA_ANALISE','CONCLUIDA_SEM_DIVERGENCIA','CONCLUIDA_COM_DIVERGENCIA') then 'CONCLUIDA'
    when upper(coalesce(new.status, '')) in ('EM_SEPARACAO','SEPARACAO_CONCLUIDA','EM_LACRE','EM_MONTAGEM_CAIXA','EM_CORRECAO','CORRECAO_SOLICITADA') then 'EM_ANDAMENTO'
    when upper(coalesce(new.status, '')) = 'PENDENTE' then 'PENDENTE'
    else 'ATRIBUIDA'
  end;

  v_resultado := jsonb_build_object(
    'origem', 'wms_transfers',
    'transfer_status', coalesce(new.status, ''),
    'codigo_transferencia', coalesce(new.codigo_transferencia, ''),
    'nome_transferencia', coalesce(new.nome_transferencia, ''),
    'responsavel_nome', coalesce(new.responsavel_nome, '')
  );

  insert into public.operacao_tarefas (
    codigo_visivel,
    tipo,
    titulo,
    descricao,
    estoque_id,
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
    public.gerar_codigo_tarefa('TRANSFERENCIA'),
    'TRANSFERENCIA',
    left(coalesce(new.nome_transferencia, new.codigo_transferencia, 'Transferência sem título'), 120),
    concat('Transferência ', coalesce(new.codigo_transferencia, new.id), ' | Destino: ', coalesce(new.destino_nome, new.estabelecimento_nome, '-')),
    v_estoque,
    'TRANSFERENCIA',
    new.id,
    coalesce(new.criado_por_id, private.current_wms_profile_id()),
    case when nullif(coalesce(new.responsavel_id, ''), '') is not null then coalesce(new.criado_por_id, private.current_wms_profile_id()) else null end,
    nullif(coalesce(new.responsavel_id, ''), ''),
    'NORMAL',
    case when nullif(coalesce(new.responsavel_id, ''), '') is not null and v_status = 'PENDENTE' then 'ATRIBUIDA' else v_status end,
    case when v_status in ('EM_ANDAMENTO','CONCLUIDA') then coalesce(new.iniciado_em, new.started_at, now()) else null end,
    case when v_status = 'CONCLUIDA' then coalesce(new.finalizado_em, new.finished_at, now()) else null end,
    case when v_status = 'CONCLUIDA' then greatest(0, extract(epoch from (coalesce(new.finalizado_em, new.finished_at, now()) - coalesce(new.iniciado_em, new.started_at, coalesce(new.created_at, now()))))::int) else null end,
    v_resultado
  ) on conflict (referencia_tipo, referencia_id)
  do update
    set titulo = excluded.titulo,
        descricao = excluded.descricao,
        estoque_id = excluded.estoque_id,
        atribuido_para = excluded.atribuido_para,
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
$$;

-- Índice adicional para UPSERT por referência.
create unique index if not exists uq_operacao_tarefas_referencia
  on public.operacao_tarefas (referencia_tipo, referencia_id)
  where referencia_tipo is not null and referencia_id is not null;

drop trigger if exists trg_sync_tarefa_transferencia on public.wms_transfers;
create trigger trg_sync_tarefa_transferencia
after insert or update of status, responsavel_id, responsavel_nome, is_deleted, deleted_at on public.wms_transfers
for each row
execute function public.sync_tarefa_transferencia();

-- Integração automática: Reposições -> Central de Tarefas
create or replace function public.sync_tarefa_reposicao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

drop trigger if exists trg_sync_tarefa_reposicao on public.wms_replenishment_requests;
create trigger trg_sync_tarefa_reposicao
after insert or update of status, responsavel_id, responsavel_nome, is_deleted, deleted_at on public.wms_replenishment_requests
for each row
execute function public.sync_tarefa_reposicao();

comment on function public.criar_tarefa(public.tipo_tarefa_enum, varchar, text, varchar, text, text, numeric, varchar, varchar, text, public.prioridade_tarefa_enum, timestamptz, jsonb)
is 'Cria tarefa operacional na Central de Tarefas. Supervisor/Admin apenas.';

insert into public.wms_schema_version (id, version, description, applied_at, applied_by)
values (
  'current',
  '2026.10.07.010',
  'Central de Tarefas com funções operacionais, histórico, RLS e integração automática com transferências/reposições',
  now(),
  'central-tarefas'
)
on conflict (id) do update
set version = excluded.version,
    description = excluded.description,
    applied_at = excluded.applied_at,
    applied_by = excluded.applied_by;

notify pgrst, 'reload schema';

/*
EXEMPLO DE TESTES (executar manualmente após aplicar migration)

-- Pré-condição: usuários reais do mesmo estoque
-- :supervisor_id = id do supervisor
-- :operador_id = id do operador do mesmo estoque
-- :outro_estoque_operador_id = operador de outro estoque

-- 1) Supervisor cria e atribui tarefa -> operador enxerga
select public.criar_tarefa(
  p_tipo => 'TRANSFERENCIA',
  p_titulo => 'Separar pedido TRF-TESTE',
  p_estoque_id => 'VDCG',
  p_atribuido_para => :operador_id,
  p_referencia_tipo => 'TRANSFERENCIA',
  p_referencia_id => 'trf_teste_001'
);

-- 2) Operador inicia -> data_inicio gravado
select public.iniciar_tarefa(:tarefa_id);
select data_inicio from public.operacao_tarefas where id = :tarefa_id;

-- 3) Operador bloqueia SEM motivo -> deve rejeitar
select public.bloquear_tarefa(:tarefa_id, '');
-- ERRO esperado: "Motivo do bloqueio é obrigatório."

-- 4) Operador tenta reatribuir -> deve rejeitar
select public.atribuir_tarefa(:tarefa_id, :outro_operador_id, 'tentativa indevida');
-- ERRO esperado: "Operador não pode reatribuir tarefas."

-- 5) Supervisor atribui para operador de OUTRO estoque -> deve rejeitar
select public.atribuir_tarefa(:tarefa_id, :outro_estoque_operador_id, 'troca de teste');
-- ERRO esperado: "O responsável precisa ser OPERADOR ativo do mesmo estoque da tarefa."

-- 6) Histórico registra cada passo
select status_anterior, status_novo, responsavel_anterior, responsavel_novo, observacao, data_evento
from public.operacao_tarefas_historico
where tarefa_id = :tarefa_id
order by data_evento asc;
*/