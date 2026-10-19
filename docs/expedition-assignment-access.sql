begin;
-- Keep the deployed guard and its lifecycle checks; widen assignment only.
do $patch$
declare definition text; updated text;
begin
  definition := replace(pg_get_functiondef('private.wms_expedition_guard()'::regprocedure),chr(13),'');
  updated := replace(definition,
    'if r not in (''ADMINISTRADOR'',''SUPERVISOR'',''OPERADOR'')',
    'if (r not in (''ADMINISTRADOR'',''SUPERVISOR'',''OPERADOR'') and not (r=''COMPRAS'' and new.expedition_stage=''ATRIBUIDA'' and old.expedition_stage in ('''',''ATRIBUIDA'')))');
  updated := replace(updated,
    'and not coalesce(archived,false) and available_for_tasks is true
      and role in (''OPERADOR'',''SUPERVISOR'',''ADMINISTRADOR'')
      and coalesce(nullif(default_warehouse_code,''''),warehouse_code)=old.warehouse_code;',
    'and not coalesce(archived,false);');
  updated := replace(updated,
    'if old.expedition_stage=''ATRIBUIDA'' and (r not in (''ADMINISTRADOR'',''SUPERVISOR'')',
    'if old.expedition_stage=''ATRIBUIDA'' and (r not in (''ADMINISTRADOR'',''SUPERVISOR'',''COMPRAS'')');
  updated := replace(updated,'Responsavel deve estar ativo, disponivel e na unidade de origem.', 'Responsavel deve estar ativo e nao arquivado.');
  if updated=definition then raise exception 'Guard diferente do esperado: revisar antes de aplicar.'; end if;
  if position('and available_for_tasks is true' in updated)>0
    or position('=old.warehouse_code;' in updated)>0 then
    raise exception 'Restricao antiga ainda presente: ajuste abortado.';
  end if;
  execute updated;
  definition := pg_get_functiondef('private.wms_invoice_guard()'::regprocedure);
  updated := replace(definition,
    'if v_role=''COMPRAS'' and (v_new-v_allowed) is distinct from (v_old-v_allowed) then',
    'if v_role=''COMPRAS'' and
      (v_new-v_allowed-array[''expedition_stage'',''expedition_responsible_id'',''expedition_responsible_name'',''expedition_assigned_at'',''delivery_deadline'',''delivery_reason'',''expedition_revision'',''expedition_action_id''])
      is distinct from
      (v_old-v_allowed-array[''expedition_stage'',''expedition_responsible_id'',''expedition_responsible_name'',''expedition_assigned_at'',''delivery_deadline'',''delivery_reason'',''expedition_revision'',''expedition_action_id'']) then');
  if updated=definition then raise exception 'Guard fiscal diferente do esperado: revisar antes de aplicar.'; end if;
  execute updated;
end $patch$;
notify pgrst,'reload schema';
commit;

