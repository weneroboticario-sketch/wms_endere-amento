import { escapeHtml, randomId } from "./utils.js";
import { decorateWorkflow, decorateMetrics } from "./cpalamo-appearance.js";

export function reverseMetrics(target, completed, day, days) {
  const percent = target > 0 ? completed / target * 100 : null;
  return { percent, remaining: Math.max(0,target-completed), excess: Math.max(0,completed-target),
    pace: target <= 0 ? "Meta nao definida" : completed > target ? "Meta superada" : completed === target ? "Meta atingida" : percent >= day / days * 100 ? "No ritmo" : "Abaixo do ritmo" };
}

export function createReverseLogistics(context) {
  const root = document.getElementById("reverseLogisticsContent");
  const e = escapeHtml;
  const staff = () => ["ADMINISTRADOR","SUPERVISOR","OPERADOR","COMPRAS"].includes(context.user().role);
  const canCreate = () => staff() || context.user().role === "COMPRAS";
  const manager = () => ["ADMINISTRADOR","SUPERVISOR"].includes(context.user().role);
  let page = 0, busy = false, rows = [], warehouse = "", creationKey = randomId("reverse");
  const options = () => context.warehouses().map(w => `<option value="${e(w.code)}">${e(w.code)} - ${e(w.name)}</option>`).join("");
  root.innerHTML = `${canCreate() ? `<details open><summary>Registrar logistica reversa</summary><form id="reverseCreateForm"><label>Unidade de origem<select name="unit" required>${options()}</select></label><label>Quantidade de caixas<input name="boxes" type="number" min="1" step="1" required></label><label>No GDV<input name="gdv" maxlength="120" required></label><label>NFe<input name="nfe" maxlength="120" required></label><label>Destino<input name="destination" maxlength="180"></label><label>Observacao<textarea name="observation" maxlength="2000"></textarea></label><button class="primary-button" type="submit">Registrar</button></form></details>
` : ""}
    <div class="button-row"><label>Competencia<input id="reverseMonth" type="month" required value="${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}"></label><label>Unidade<select id="reverseUnit">${manager() || context.user().role === "COMPRAS" ? '<option value="">Todas autorizadas</option>' : ""}${options()}</select></label><label>Status<select id="reverseStatus"><option value="">Todos</option>${["REGISTRADA","AGUARDANDO_ENVIO","ENVIADA","RECEBIDA","CONCLUIDA","DIVERGENCIA","CANCELADA"].map(s=>`<option>${s}</option>`).join("")}</select></label><label>GDV, NFe ou responsavel<input id="reverseSearch" maxlength="120"></label><button class="secondary-button" id="reverseSearchButton" type="button">Buscar</button></div>
    <div class="table-wrapper"><table><thead><tr><th>Unidade</th><th>Meta</th><th>Realizado</th><th>%</th><th>Restante</th><th>Excedente</th><th>Pendencias</th><th>Divergencias</th><th>Ritmo</th></tr></thead><tbody id="reverseSummaryRows"></tbody></table></div>
    <div class="button-row"><label>Ordenacao<select id="reverseSort"><option value="asc">Menor percentual</option><option value="desc">Maior percentual</option><option value="pending">Mais pendencias</option><option value="divergences">Mais divergencias</option></select></label></div>
    ${staff() ? `      <details><summary>Meta mensal da unidade</summary><form id="reverseTargetForm"><label>Unidade<select name="unit" required>${options()}</select></label><label>Meta em caixas<input name="target" type="number" min="0" step="1" required></label><button class="primary-button" type="submit">Salvar meta</button></form></details>` : ""}
    <div class="table-wrapper"><table><thead><tr><th>Data do registro</th><th>Competência</th><th>Emissão NF</th><th>Unidade</th><th>GDV</th><th>NFe</th><th>Caixas</th><th>Status</th><th>Responsavel</th><th>Acoes</th></tr></thead><tbody id="reverseRows"></tbody></table></div><div class="button-row"><button id="reversePrevious" class="secondary-button" type="button">Anterior</button><button id="reverseNext" class="secondary-button" type="button">Proxima</button></div><div id="reverseDetail"></div>`;
  root.insertAdjacentHTML("afterbegin", '<div class="stock-summary-grid" id="reverseKpis"></div>');
  const createForm = document.getElementById("reverseCreateForm");
  if(createForm) {
    createForm.insertAdjacentHTML("afterbegin",'<label>Emissão NF<input name="invoice_issue_date" type="date"></label><label>Competência financeira<input name="financial_competence" type="month" required></label>');
    createForm.elements.invoice_issue_date.addEventListener("change",()=>{
      const suggestion=createForm.elements.invoice_issue_date.value.slice(0,7),input=createForm.elements.financial_competence;
      if(suggestion && suggestion!==input.value && (!input.value || window.confirm("A emissão sugere "+suggestion+". Atualizar competência?")))input.value=suggestion;
    });
  }
  root.insertAdjacentHTML("afterbegin",'<div id="reverseCompetenceNotice" role="status"></div><label><input id="reverseReviewCompetence" type="checkbox"> Competências antigas a revisar</label>');
  if (createForm && context.warehouses().some(w => w.code === context.warehouse())) createForm.elements.unit.value = context.warehouse();
  if (!manager() && context.user().role !== "COMPRAS") document.getElementById("reverseUnit").value = context.warehouse();
  const status = message => { document.getElementById("reverseLogisticsStatus").textContent = message; };
  let summaryRows = [];
  function renderSummary() {
    const date = new Date(); const days = new Date(date.getFullYear(),date.getMonth()+1,0).getDate();
    const mode = document.getElementById("reverseSort").value;
    const sorted = summaryRows.map(s=>({ ...s,metrics:reverseMetrics(Number(s.target_boxes),Number(s.completed_boxes),date.getDate(),days) })).sort((a,b)=>
      mode === "pending" ? b.pending-a.pending : mode === "divergences" ? b.divergences-a.divergences : (mode === "desc" ? -1 : 1)*((a.metrics.percent || 0)-(b.metrics.percent || 0)));
    document.getElementById("reverseSummaryRows").innerHTML = sorted.map(s=>`<tr><td>${e(s.unit_code)} - ${e(s.unit_name)}</td><td>${s.target_boxes}</td><td>${s.completed_boxes}</td><td>${s.metrics.percent === null ? "-" : s.metrics.percent.toFixed(1)+"%"}</td><td>${s.metrics.remaining}</td><td>${s.metrics.excess}</td><td>${s.pending}</td><td>${s.divergences}</td><td>${e(s.metrics.pace)}</td></tr>`).join("");
    const target=sorted.reduce((n,row)=>n+Number(row.target_boxes||0),0),completed=sorted.reduce((n,row)=>n+Number(row.completed_boxes||0),0);
    document.getElementById("reverseKpis").innerHTML = [["Meta do mes",target],["Realizado",completed],["Faltante",Math.max(0,target-completed)],["Realizado (%)",target>0?(completed/target*100).toFixed(1)+"%":"Sem meta"],["Pendencias",sorted.reduce((n,row)=>n+Number(row.pending||0),0)]].map(([label,value])=>`<article class="stock-summary-card"><span>${label}</span><strong>${value}</strong></article>`).join("");
    decorateMetrics(document.getElementById("reverseKpis"));
  }
  async function refresh() {
    if (busy) return; busy = true;
    try {
      const currentWarehouse = context.warehouse();
      if (warehouse !== currentWarehouse) { page = 0; warehouse = currentWarehouse; }
      const month = document.getElementById("reverseMonth").value + "-01";
      const unit = document.getElementById("reverseUnit").value;
      const summary = await context.client().rpc("wms_reverse_summary", { p_month: month, p_unit: unit || null });
      if (summary.error) throw summary.error;
      summaryRows = summary.data || [];renderSummary();
      const reviewCount=summaryRows.reduce((n,r)=>n+Number(r.competence_pending||0),0);
      document.getElementById("reverseCompetenceNotice").textContent=reviewCount?reviewCount+" registro(s) aguardam revisão de competência e não entram no realizado mensal.":"";
      let query = context.client().from("wms_reverse_logistics").select("*").eq("is_deleted",false);
      if(document.getElementById("reverseReviewCompetence").checked)query=query.eq("competence_review_required",true);
      else query=query.eq("competence_month",month).eq("competence_review_required",false);
      if (unit) query = query.eq("unit_origin_code",unit);
      const selectedStatus = document.getElementById("reverseStatus").value;
      if (selectedStatus) query = query.eq("status",selectedStatus);
      const search = document.getElementById("reverseSearch").value.trim();
      // Filter syntax characters are not forwarded to PostgREST.
      if (search) { const term = search.replace(/[,().%_*\\]/g, ""); query = query.or(`gdv_normalized.ilike.%${term.toUpperCase()}%,nfe_normalized.ilike.%${term.toUpperCase()}%,responsible_name.ilike.%${term}%`); }
      const result = await query.order("created_at",{ascending:false}).range(page*30,page*30+29);
      if (result.error) throw result.error;
      rows = result.data || [];
      document.getElementById("reverseRows").innerHTML = rows.length ? rows.map((r,i)=>`<tr><td>${e(new Date(r.created_at).toLocaleString())}</td><td>${e(r.financial_competence||"A revisar")}</td><td>${e(r.invoice_issue_date||"—")}</td><td>${e(r.unit_origin_code)}</td><td>${e(r.gdv_number)}</td><td>${e(r.nfe_number)}</td><td>${r.box_quantity}</td><td>${e(r.status)}</td><td>${e(r.responsible_name)}</td><td><button class="secondary-button" data-reverse-open="${i}" type="button">Abrir</button></td></tr>`).join("") : '<tr><td colspan="10">Nenhum processo neste filtro.</td></tr>';
      document.getElementById("reversePrevious").disabled = page===0; document.getElementById("reverseNext").disabled = rows.length<30;
      decorateWorkflow(root);
    } catch(error) { status(error.message || String(error)); }
    finally { busy = false; }
  }
  document.getElementById("reverseCreateForm")?.addEventListener("submit",async event=>{
    event.preventDefault(); if(busy)return;busy=true;const form=event.target;form.querySelector("button").disabled=true;
    try {
      if(!canCreate())throw new Error("Perfil sem permissao para registrar.");
      if(!context.warehouses().some(w=>w.code===form.elements.unit.value))throw new Error("Unidade nao autorizada.");
      const boxes=Number(form.elements.boxes.value);if(!Number.isInteger(boxes)||boxes<1)throw new Error("Informe caixas inteiras e maiores que zero.");
      const user=context.user();const unit=form.elements.unit.value;
      const payload={id:creationKey,warehouse_code:unit,unit_origin_code:unit,unit_origin_name:context.warehouses().find(w=>w.code===unit)?.name || unit,
        box_quantity:boxes,gdv_number:form.elements.gdv.value.trim(),gdv_normalized:"",nfe_number:form.elements.nfe.value.trim(),nfe_normalized:"",
        destination:form.elements.destination.value.trim(),observation:form.elements.observation.value.trim(),responsible_id:user.id,responsible_name:user.name,
        created_by_id:user.id,created_by_name:user.name,competence_month:document.getElementById("reverseMonth").value+"-01",idempotency_key:creationKey};
      if(!payload.gdv_number || !payload.nfe_number)throw new Error("GDV e NFe obrigatorios.");
      payload.financial_competence=form.elements.financial_competence.value;
      payload.invoice_issue_date=form.elements.invoice_issue_date.value || null;
      if(!payload.financial_competence)throw new Error("Competência obrigatória.");
      const result=await context.client().from("wms_reverse_logistics").upsert(payload,{onConflict:"idempotency_key",ignoreDuplicates:true});
      if(result.error)throw result.error;
      creationKey=randomId("reverse");form.reset();form.elements.unit.value=unit;context.changed();status("Processo registrado.");
    }catch(error){status(error.code==="23505"?"GDV ja registrado em processo ativo. Confira a referencia.":error.message);}
    finally{busy=false;form.querySelector("button").disabled=false;await refresh();}
  });
  document.getElementById("reverseTargetForm")?.addEventListener("submit",async event=>{
    event.preventDefault();if(busy)return;busy=true;const form=event.target;
    try {
      if(!staff())throw new Error("Perfil sem permissao para alterar metas.");
      if(!context.warehouses().some(w=>w.code===form.elements.unit.value))throw new Error("Unidade nao autorizada.");
      const target=Number(form.elements.target.value);if(!Number.isInteger(target)||target<0)throw new Error("Meta deve ser inteira e nao negativa.");
      const unit=form.elements.unit.value,month=document.getElementById("reverseMonth").value+"-01",user=context.user();
      const result=await context.client().from("wms_reverse_logistics_monthly_targets").upsert({id:`target:${unit}:${month}`,unit_code:unit,
        unit_name:context.warehouses().find(w=>w.code===unit)?.name || unit,competence_month:month,target_boxes:target,updated_by_id:user.id,updated_by_name:user.name},
        {onConflict:"unit_code,competence_month"});if(result.error)throw result.error;context.changed();
    }catch(error){status(error.message);}finally{busy=false;await refresh();}
  });
  root.addEventListener("click",async event=>{
    const button=event.target.closest("[data-reverse-open]");if(!button)return;
    const row=rows[Number(button.dataset.reverseOpen)];const detail=document.getElementById("reverseDetail");
    const transitions={REGISTRADA:["AGUARDANDO_ENVIO","ENVIADA","DIVERGENCIA","CANCELADA"],AGUARDANDO_ENVIO:["ENVIADA","DIVERGENCIA","CANCELADA"],
      ENVIADA:["RECEBIDA","DIVERGENCIA","CANCELADA"],RECEBIDA:["CONCLUIDA","DIVERGENCIA","CANCELADA"],DIVERGENCIA:["AGUARDANDO_ENVIO","ENVIADA","CANCELADA"]};
    const actions=staff()?(transitions[row.status] || []):[];
    if(manager() && ["CONCLUIDA","CANCELADA"].includes(row.status))actions.push("DIVERGENCIA");
    detail.innerHTML=`<h3>GDV ${e(row.gdv_number)} - NFe ${e(row.nfe_number)}</h3><p>${e(row.observation)} | Destino: ${e(row.destination || "-")}</p><p>Criado: ${e(row.created_at)} | Enviado: ${e(row.sent_at || "-")} | Recebido: ${e(row.received_at || "-")}</p><div class="button-row">${actions.map(s=>`<button class="secondary-button" data-reverse-status="${s}" type="button">${s==="DIVERGENCIA" && ["CONCLUIDA","CANCELADA"].includes(row.status)?"Reabrir com motivo":e(s)}</button>`).join("")}${manager()?'<button class="secondary-button" data-reverse-archive="true" type="button">Arquivar</button>':""}</div><details><summary>Historico</summary><pre id="reverseHistory"></pre></details>`;
    detail.insertAdjacentHTML("afterbegin",`<p>Emissão NF: ${e(row.invoice_issue_date||"Não informada")} · Competência: ${e(row.financial_competence||"A revisar")}</p>`);
    if(manager() || context.user().role==="COMPRAS") {
      detail.insertAdjacentHTML("afterbegin",`<form id="reverseCompetenceForm"><label>Competência<input type="month" name="competence" required value="${e(row.financial_competence||"")}"></label><label>Emissão NF<input type="date" name="issue" value="${e(row.invoice_issue_date||"")}"></label><label>Justificativa<input name="reason" required minlength="5"></label><button class="secondary-button">Revisar competência</button></form>`);
      document.getElementById("reverseCompetenceForm").addEventListener("submit",async event=>{
        event.preventDefault();if(busy)return;busy=true;
        try {const form=event.target;const result=await context.client().rpc("wms_reverse_set_competence",{p_id:row.id,p_competence:form.elements.competence.value,p_issue_date:form.elements.issue.value||null,p_reason:form.elements.reason.value,p_expected_updated_at:row.updated_at});
          if(result.error)throw result.error;detail.innerHTML="";status("Competência revisada.");}
        catch(error){status(error.message);}finally{busy=false;await refresh();}
      });
    }
    detail.querySelector("details").addEventListener("toggle",async event=>{if(!event.target.open)return;
      const result=await context.client().from("wms_history").select("datetime,details").eq("warehouse_code",row.warehouse_code)
        .like("id",`reverse:${row.id}:%`).order("datetime",{ascending:false}).limit(30);
      document.getElementById("reverseHistory").textContent=result.error?result.error.message:(result.data || []).map(r=>r.datetime+" | "+r.details).join("\n");});
    detail.querySelectorAll("[data-reverse-status],[data-reverse-archive]").forEach(button=>button.addEventListener("click",async()=>{
      if(busy)return;const archive=!!button.dataset.reverseArchive,stage=button.dataset.reverseStatus || row.status;
      const reason=["CANCELADA","DIVERGENCIA"].includes(stage)||archive?window.prompt("Informe o motivo:",""):"";
      if(reason===null || ((["CANCELADA","DIVERGENCIA"].includes(stage)||archive)&&!reason.trim()))return;
      busy=true;button.disabled=true;
      try{const result=await context.client().rpc("wms_reverse_action",{p_id:row.id,p_expected_status:row.status,p_status:stage,p_reason:reason,
        p_action_id:randomId("reverse-action"),p_archive:archive});if(result.error)throw result.error;detail.innerHTML="";context.changed();}
      catch(error){status(error.message);}finally{busy=false;button.disabled=false;await refresh();}
    }));
  });
  document.getElementById("reverseSearchButton").addEventListener("click",()=>{page=0;refresh();});
  for(const id of ["reverseMonth","reverseUnit","reverseStatus"])document.getElementById(id).addEventListener("change",()=>{page=0;refresh();});
  document.getElementById("reverseSort").addEventListener("change",renderSummary);
  document.getElementById("reverseReviewCompetence").addEventListener("change",()=>{page=0;refresh();});
  document.getElementById("reversePrevious").addEventListener("click",()=>{page=Math.max(0,page-1);refresh();});
  document.getElementById("reverseNext").addEventListener("click",()=>{page++;refresh();});
  return { refresh };
}
