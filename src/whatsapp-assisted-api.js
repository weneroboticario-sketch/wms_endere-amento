export const whatsappAssistedEnabled = import.meta.env?.VITE_WMS_WHATSAPP_ASSISTED === "true";
export const whatsappAssistedIntakeEnabled = import.meta.env?.VITE_WMS_WHATSAPP_ASSISTED_INTAKE !== "false";

export function assistedItemState(item) {
  if (item.task?.status === "CANCELADA") return "CANCELADA";
  if (item.task?.status === "CONCLUIDA" && (item.kind === "ADJUSTMENT" ? item.verified_at : item.attended === item.requested)) return "CONCLUIDA";
  if (item.task?.status === "AGUARDANDO_VALIDACAO") return "AGUARDANDO_VALIDACAO";
  if (item.kind === "ADJUSTMENT") return "VERIFICACAO";
  return item.attended > 0 ? "PARCIAL" : "PENDENTE";
}

export function createAssistedGateway(client, context) {
  const check = () => {
    if (!context.isCurrent() || context.warehouse !== "VDCG") throw new Error("Usuário ou estoque mudou. Reabra esta tela.");
  };
  const rpc = async (name, payload) => {
    check();
    const result = await client.rpc(name, payload);
    check();
    if (result.error) {
      const error = new Error(result.error.message || "Falha na conexão com a Central de Tarefas.");
      error.confirmedFailure = /^(?:[0-9A-Z]{5}|PGRST\d+)$/.test(result.error.code || "");
      throw error;
    }
    return result.data;
  };
  const read = async query => {
    check();
    const result = await query;
    check();
    if (result.error) throw new Error(result.error.message || "Não foi possível carregar as solicitações.");
    return result.data || [];
  };
  return {
    async load({ archived = false } = {}) {
      check();
      const settings = context.supervisor ? await read(client.from("wms_assisted_settings").select("intake_enabled").eq("warehouse_code", "VDCG")) : [];
      const intakeEnabled = settings[0]?.intake_enabled === true;
      let requests = [];
      if (context.supervisor) {
        let query = client.from("wms_assisted_requests").select("*").eq("warehouse_code", "VDCG");
        query = archived ? query.not("deleted_at", "is", null) : query.is("deleted_at", null);
        requests = await read(query.order("approved_at", { ascending: false }).limit(50));
      }
      const ids = requests.map(request => request.id);
      const items = [];
      if (context.supervisor && !ids.length) return { requests, items, intakeEnabled };
      for (let offset = 0; ; offset += 500) {
        let query = client.from("wms_assisted_request_items").select("*,task:operacao_tarefas(id,status,atribuido_para,data_criacao,data_inicio,data_conclusao)").order("id").range(offset, offset + 499);
        if (context.supervisor) query = query.in("request_id", ids);
        const rows = await read(query);
        items.push(...rows);
        if (rows.length < 500) break;
        if (offset >= 9500) throw new Error("Fila extensa demais para esta tela. Solicite revisão do período ao supervisor.");
      }
      return { requests, items, intakeEnabled };
    },
    approve: (draft, duplicateReviewed) => rpc("approve_whatsapp_assisted_request", {
      request_key: draft.id, original_message: draft.original,
      reviewed_items: draft.lines.map(line => ({ sku: line.sku, quantity: line.quantity, sourceLine: line.sourceLine, kind: line.kind, client: line.client, priority: line.priority, observation: line.observation || "" })),
      duplicate_reviewed: duplicateReviewed
    }),
    fulfill: (item, quantity, operationId) => rpc("record_whatsapp_assisted_work", { item_key: item.id, operation_key: operationId, expected_revision: item.revision, quantity, verification: null }),
    verify: (item, note, operationId) => rpc("record_whatsapp_assisted_work", { item_key: item.id, operation_key: operationId, expected_revision: item.revision, quantity: null, verification: note }),
    assign: (item, userId) => rpc("atribuir_tarefa", { p_tarefa_id: item.task_id, p_usuario_id: userId, p_observacao: "Atribuição de item WhatsApp revisado." }),
    start: item => rpc("iniciar_tarefa", { p_tarefa_id: item.task_id, p_observacao: "Início de atendimento WhatsApp." }),
    validate: item => rpc("validar_tarefa", { p_tarefa_id: item.task_id, p_observacao: "Validação do item WhatsApp atendido." }),
    setIntake: enabled => rpc("set_whatsapp_assisted_intake", { enabled }),
    archive: (requestId, reason) => rpc("archive_whatsapp_assisted_request", { request_key: requestId, reason }),
    async history(requestId) {
      const events = await read(client.from("wms_assisted_request_events").select("event_type,created_at,actor_id,item_id,amount,note").eq("request_id", requestId).order("created_at"));
      const items = await read(client.from("wms_assisted_request_items").select("task_id").eq("request_id", requestId));
      const taskIds = items.map(item => item.task_id).filter(Boolean);
      if (!taskIds.length) return events;
      const taskEvents = await read(client.from("operacao_tarefas_historico").select("usuario_id,status_anterior,status_novo,observacao,data_evento").in("tarefa_id", taskIds).order("data_evento"));
      return events.concat(taskEvents.map(event => ({ event_type: `TAREFA ${event.status_anterior || "CRIADA"} → ${event.status_novo}`, created_at: event.data_evento, actor_id: event.usuario_id, note: event.observacao })))
        .sort((first, second) => first.created_at.localeCompare(second.created_at));
    }
  };
}
