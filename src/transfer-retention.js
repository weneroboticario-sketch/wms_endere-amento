import { escapeHtml as e } from "./utils.js";
import {createElement,X} from "lucide";

export const RETENTION_DAYS=60;
export const canRetireTransfer=user=>["ADMINISTRADOR","SUPERVISOR","COMPRAS"].includes(user?.role);
export function retentionLabel(row,now=Date.now()) {
  if(row.removal_kind==="ARCHIVED")return "Arquivada · sem apagamento automático";
  const deadline=Date.parse(row.purge_after);
  if(!Number.isFinite(deadline))return "Prazo não disponível";
  const days=Math.max(0,Math.ceil((deadline-now)/86400000));
  return days?`Exclusão definitiva em ${days} dia(s)` : "Aguardando limpeza definitiva";
}
function styles(){
  if(document.getElementById("transferRetentionStyles"))return;
  const link=document.createElement("link");link.id="transferRetentionStyles";link.rel="stylesheet";
  link.href=new URL("./transfer-retention.css?no-inline",import.meta.url).href;document.head.append(link);
}

export async function requestTransferRemoval(context,row,kind="DELETED") {
  if(!canRetireTransfer(context.user()))throw new Error("Perfil sem permissão para remover transferências.");
  styles();
  const opener=document.activeElement,dialog=document.createElement("dialog");dialog.className="transfer-retention-dialog";
  dialog.setAttribute("aria-labelledby","retentionTitle");
  dialog.innerHTML=`<form><header><h3 id="retentionTitle">Retirar transferência da operação</h3><button type="button" data-close aria-label="Fechar"></button></header>
    <p><strong>${e(row.codigo_transferencia||row.code||row.id)}</strong></p>
    <label>Destino do processo<select name="kind"><option value="DELETED">Excluir · guardar por 60 dias</option><option value="ARCHIVED">Arquivar · manter os dados</option></select></label>
    <p data-explanation></p><label>Justificativa<textarea name="reason" required minlength="5" maxlength="4000" rows="3"></textarea></label>
    <p role="status" data-status></p><footer><button type="button" class="secondary-button" data-close>Voltar</button><button class="primary-button" type="submit">Confirmar exclusão</button></footer></form>`;
  document.body.append(dialog);
  dialog.querySelector("header [data-close]").append(createElement(X,{width:20,height:20,"aria-hidden":"true"}));
  const form=dialog.querySelector("form"),status=dialog.querySelector("[data-status]");let busy=false,saved=null;
  form.elements.kind.value=kind;
  const explain=()=>{
    const deleted=form.elements.kind.value==="DELETED";
    dialog.querySelector("[data-explanation]").textContent=deleted
      ? "Sai da separação, tarefas, Compras/NF, Expedição e indicadores. Os dados e documentos ficam em Excluídas por 60 dias e depois são apagados definitivamente. Não cancela a NF na SEFAZ."
      : "Sai de todas as filas e indicadores. Os dados e documentos permanecem em Arquivadas, sem prazo de apagamento. Não cancela a NF na SEFAZ.";
    form.querySelector('[type="submit"]').textContent=deleted?"Confirmar exclusão":"Confirmar arquivamento";
  };
  explain();form.elements.kind.addEventListener("change",explain);
  const result=new Promise(resolve=>dialog.addEventListener("close",()=>{
    dialog.remove();if(opener?.isConnected)opener.focus();resolve(saved);
  },{once:true}));
  dialog.addEventListener("cancel",event=>{if(busy)event.preventDefault();});
  dialog.querySelectorAll("[data-close]").forEach(button=>button.addEventListener("click",()=>{if(!busy)dialog.close();}));
  form.addEventListener("submit",async event=>{
    event.preventDefault();if(busy)return;
    const reason=form.elements.reason.value.trim();if(reason.length<5){status.textContent="Informe uma justificativa com pelo menos 5 caracteres.";return;}
    const mode=form.elements.kind.value,selectedUnit=context.warehouse(),w=row.warehouse_code||row.warehouseCode||selectedUnit,actor=context.user()?.id;
    busy=true;form.querySelectorAll("button,input,textarea,select").forEach(node=>node.disabled=true);status.textContent="Retirando o processo da operação...";
    try {
      // Always read the server revision; stale caches cannot retire the wrong version.
      const current=await context.client().from("wms_transfers").select("id,warehouse_code,updated_at").eq("id",row.id).eq("warehouse_code",w).single();
      if(current.error)throw current.error;
      if(selectedUnit!==context.warehouse()||actor!==context.user()?.id)throw new Error("Unidade ou usuário alterado. Abra novamente a transferência.");
      const response=await context.client().rpc("wms_retire_transfer",{p_id:row.id,p_kind:mode,p_reason:reason,p_expected_updated_at:current.data.updated_at});
      if(response.error)throw response.error;
      if(!response.data?.is_deleted||response.data.removal_kind!==mode)throw new Error("O servidor não confirmou a retirada do processo.");
      saved=response.data;dialog.close();
      window.dispatchEvent(new window.CustomEvent("wms:transfer-removed",{detail:saved}));context.changed?.();
    }catch(error){status.textContent=error.message||"Falha ao retirar transferência. Nenhum sucesso foi confirmado.";}
    finally{busy=false;form.querySelectorAll("button,input,textarea,select").forEach(node=>node.disabled=false);}
  });
  dialog.showModal();form.elements.reason.focus();return result;
}

export function mountTransferRemovalActions(container,row,context){
  if(!container||!canRetireTransfer(context.user())||row.is_deleted)return;
  styles();
  const actions=document.createElement("div");actions.className="transfer-retention-actions";
  for(const [kind,label] of [["ARCHIVED","Arquivar"],["DELETED","Excluir transferência"]]){
    const button=document.createElement("button");button.type="button";button.className="secondary-button";button.textContent=label;
    button.addEventListener("click",()=>requestTransferRemoval(context,row,kind).catch(error=>{
      const status=document.createElement("p");status.setAttribute("role","alert");status.textContent=error.message;actions.append(status);
    }));actions.append(button);
  }
  container.append(actions);
}

export function createRemovedTransfersView(root,context){
  styles();let page=0,rows=[],generation=0;
  root.innerHTML=`<header><h3>Arquivo de transferências</h3></header><div class="transfer-retention-filters"><label>Visualização<select data-kind><option value="DELETED">Excluídas · 60 dias</option><option value="ARCHIVED">Arquivadas</option></select></label><label>Código ou NF<input data-search type="search"></label><button type="button" class="secondary-button" data-refresh>Atualizar</button></div><p data-status role="status"></p><div class="table-wrapper"><table><thead><tr><th>Transferência / NF</th><th>Rota</th><th>Removida por</th><th>Data</th><th>Retenção</th><th>Justificativa</th><th>Dados</th></tr></thead><tbody></tbody></table></div><footer><button type="button" class="secondary-button" data-prev>Anterior</button><span data-page></span><button type="button" class="secondary-button" data-next>Próxima</button></footer>`;
  async function refresh(){
    const ticket=++generation,w=context.warehouse(),actor=context.user()?.id;
    root.querySelector("[data-status]").textContent="Carregando arquivo...";
    try{
      if(!canRetireTransfer(context.user()))throw new Error("Arquivo restrito a ADM, supervisores e COMPRAS.");
      let query=context.client().from("wms_transfers").select("id,codigo_transferencia,warehouse_code,origem_codigo_loja,destino_codigo_loja,destino_nome,invoice_number,invoice_file_path,invoice_snapshot,status,removal_kind,removal_reason,deleted_at,deleted_by_name,purge_after",{count:"exact"})
        .eq("warehouse_code",w).eq("is_deleted",true).eq("removal_kind",root.querySelector("[data-kind]").value);
      const search=root.querySelector("[data-search]").value.trim().replace(/[,().%_*\\]/g,"");
      if(search)query=query.or(`codigo_transferencia.ilike.%${search}%,invoice_number.ilike.%${search}%`);
      const result=await query.order("deleted_at",{ascending:false}).order("id").range(page*30,page*30+29);
      if(result.error)throw result.error;
      if(ticket!==generation||w!==context.warehouse()||actor!==context.user()?.id)return;
      rows=result.data||[];
      root.querySelector("tbody").innerHTML=rows.length?rows.map((r,i)=>`<tr><td>${e(r.codigo_transferencia||r.id)}<small>NF ${e(r.invoice_number||"—")}</small></td><td>${e(r.origem_codigo_loja||w)} → ${e(r.destino_codigo_loja||r.destino_nome||"—")}</td><td>${e(r.deleted_by_name||"—")}</td><td>${e(new Date(r.deleted_at).toLocaleString("pt-BR",{timeZone:"America/Cuiaba"}))}</td><td>${e(retentionLabel(r))}${r.purge_after?`<small>${e(new Date(r.purge_after).toLocaleDateString("pt-BR",{timeZone:"America/Cuiaba"}))}</small>`:""}</td><td>${e(r.removal_reason)}</td><td><button type="button" class="secondary-button" data-details="${i}">Consultar</button></td></tr>`).join(""):'<tr><td colspan="7">Nenhum registro neste arquivo.</td></tr>';
      root.querySelector("[data-page]").textContent=`Página ${page+1}${result.count==null?"":` · ${result.count} registros`}`;
      root.querySelector("[data-prev]").disabled=page===0;root.querySelector("[data-next]").disabled=result.count==null?rows.length<30:(page+1)*30>=result.count;
      root.querySelector("[data-status]").textContent="";
    }catch(error){if(ticket===generation)root.querySelector("[data-status]").textContent=error.message;}
  }
  root.addEventListener("click",async event=>{
    const button=event.target.closest("[data-details]");if(!button)return;
    const row=rows[Number(button.dataset.details)];if(!row)return;
    const dialog=document.createElement("dialog");dialog.className="transfer-retention-dialog";
    dialog.innerHTML=`<h3>${e(row.codigo_transferencia||row.id)}</h3><p>${e(retentionLabel(row))}</p><p>Estado na retirada: ${e(row.status)}</p><p>${e(row.removal_reason)}</p><h4>Itens preservados</h4><div data-items>Carregando...</div><footer><button type="button" class="secondary-button" data-close>Fechar</button>${row.invoice_file_path?'<button type="button" class="secondary-button" data-pdf>Abrir NF</button>':""}</footer><p role="status" data-status></p>`;
    document.body.append(dialog);dialog.showModal();dialog.querySelector("[data-close]").addEventListener("click",()=>dialog.close());dialog.addEventListener("close",()=>{dialog.remove();button.focus();},{once:true});
    try{
      const result=await context.client().from("wms_transfer_items").select("sku,descricao,quantidade_solicitada,quantidade_separada").eq("transfer_id",row.id).eq("warehouse_code",row.warehouse_code).order("id").limit(100);
      if(result.error)throw result.error;
      dialog.querySelector("[data-items]").innerHTML=(result.data||[]).map(item=>`<p><strong>${e(item.sku)}</strong> ${e(item.descricao||"")} · solicitado ${e(String(item.quantidade_solicitada??"—"))} · separado ${e(String(item.quantidade_separada??"—"))}</p>`).join("")||"Nenhum item registrado.";
    }catch(error){dialog.querySelector("[data-items]").textContent=error.message;}
    dialog.querySelector("[data-pdf]")?.addEventListener("click",async()=>{
      try{const result=await context.client().storage.from("wms-transfer-invoices").createSignedUrl(row.invoice_file_path,300);if(result.error)throw result.error;const a=document.createElement("a");a.href=result.data.signedUrl;a.target="_blank";a.rel="noopener noreferrer";a.click();}
      catch(error){dialog.querySelector("[data-status]").textContent=error.message;}
    });
  });
  root.querySelector("[data-refresh]").addEventListener("click",refresh);
  root.querySelector("[data-kind]").addEventListener("change",()=>{page=0;refresh();});
  let timer;root.querySelector("[data-search]").addEventListener("input",()=>{clearTimeout(timer);timer=setTimeout(()=>{page=0;refresh();},250);});
  root.querySelector("[data-prev]").addEventListener("click",()=>{page=Math.max(0,page-1);refresh();});
  root.querySelector("[data-next]").addEventListener("click",()=>{page++;refresh();});
  return {refresh};
}
