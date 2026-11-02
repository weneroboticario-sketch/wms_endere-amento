-- CP ÁLAMO SOMENTE — proposta de atualização transacional, NÃO APLICADA EM PRODUÇÃO.
-- Aplicar somente ao banco identificado e validado como CP ÁLAMO, com migration
-- gerada pelo Supabase CLI, após revisão de permissões e testes de regressão.
-- Preserva eventos anteriores. A mensagem enviada ao responsável passa a incluir
-- a justificativa da atribuição (sem criar notificações adicionais).
CREATE OR REPLACE FUNCTION private.wms_expedition_audit()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $function$
DECLARE
  k text;
  n text;
  v_reason text;
  v_message text;
BEGIN
  IF new.expedition_revision = old.expedition_revision THEN RETURN new; END IF;
  k := 'expedition:' || new.id || ':' || new.expedition_action_id;
  SELECT name INTO n FROM public.wms_users WHERE id = private.current_wms_profile_id();
  v_reason := nullif(btrim(coalesce(new.delivery_reason, '')), '');
  INSERT INTO public.wms_transfer_events(
    id, transfer_id, warehouse_code, user_id, user_name, event_type, details, payload
  ) VALUES (
    k, new.id, new.warehouse_code, private.current_wms_profile_id(), n,
    'EXPEDITION_' || coalesce(nullif(new.expedition_stage, ''), 'REOPENED'), new.delivery_reason,
    jsonb_build_object(
      'stage', new.expedition_stage,
      'responsible_id', new.expedition_responsible_id,
      'expected_boxes', coalesce(nullif(new.final_box_count, 0), nullif(new.total_boxes, 0), new.total_caixas),
      'dispatched_boxes', new.dispatched_boxes,
      'received_boxes', new.received_boxes,
      'difference', new.received_boxes - new.dispatched_boxes,
      'deadline', new.delivery_deadline,
      'resolved_at', new.delivery_resolved_at
    )
  ) ON CONFLICT (id) DO NOTHING;

  IF new.expedition_stage = 'ATRIBUIDA'
    AND new.expedition_responsible_id IS DISTINCT FROM old.expedition_responsible_id THEN
    v_message := 'Transferência disponível para coleta.';
    IF v_reason IS NOT NULL THEN
      v_message := v_message || ' Observação: ' || left(v_reason, 1000);
    END IF;
    INSERT INTO public.wms_notifications(
      id, warehouse_code, user_id, user_name, entity_id, transfer_id,
      event_type, title, message, idempotency_key, payload
    ) VALUES (
      k || ':assigned', new.warehouse_code, new.expedition_responsible_id,
      new.expedition_responsible_name, new.id, new.id,
      'EXPEDITION_ASSIGNED', 'Expedição atribuída', v_message,
      k || ':assigned', jsonb_build_object('entity_id', new.id, 'reason', v_reason)
    ) ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN new;
END
$function$;
