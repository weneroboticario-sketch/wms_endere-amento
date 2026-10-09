-- Central de Tarefas: arquivamento de tarefas
-- Migration incremental e idempotente (não recria enums/tabelas já existentes).

alter table public.operacao_tarefas
  add column if not exists arquivada boolean not null default false,
  add column if not exists arquivada_por text references public.wms_users(id),
  add column if not exists data_arquivamento timestamptz;

create index if not exists idx_tarefas_estoque_arquivada
  on public.operacao_tarefas (estoque_id, arquivada, status);

create or replace function public.arquivar_tarefa(
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
$$;

create or replace function public.desarquivar_tarefa(
  p_tarefa_id uuid
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
$$;

drop trigger if exists trg_registrar_historico_tarefa on public.operacao_tarefas;
create trigger trg_registrar_historico_tarefa
after insert or update on public.operacao_tarefas
for each row
execute function public.registrar_historico_tarefa();

grant execute on function public.arquivar_tarefa(uuid, text) to authenticated;
grant execute on function public.desarquivar_tarefa(uuid) to authenticated;

insert into public.wms_schema_version (id, version, description, applied_at, applied_by)
values (
  'current',
  '2026.10.08.001',
  'Arquivamento de tarefas na Central de Tarefas com filtros, histórico e exportação',
  now(),
  'tarefas-arquivamento'
)
on conflict (id) do update
set version = excluded.version,
    description = excluded.description,
    applied_at = excluded.applied_at,
    applied_by = excluded.applied_by;

notify pgrst, 'reload schema';
