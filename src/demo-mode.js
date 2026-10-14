import { escapeHtml as e } from "./utils.js";
import { createDemoSession, getDemoDashboardSummary, demoResponsibility } from "./demo-scenario.js";
import { validateInvoicePdf } from "./purchases-workflow.js";
import "./demo-mode.css";

const titles={dashboard:"Dashboard DEMO",sku:"Consulta SKU",create:"Compras cria",transfer:"Estoque / Conferencia / Caixas",invoice:"Compras / NF",replenishment:"Reposicao DEMO",reverse:"Logistica Reversa",target:"Meta mensal"};
const labels={AGUARDANDO_SEPARACAO:"Aguardando separacao",EM_SEPARACAO:"Em separacao",SEPARACAO_CONCLUIDA:"Conferencia concluida",MONTAGEM_CAIXA_CONCLUIDA:"Montagem concluida",PRONTA_PARA_NOTA:"Disponivel para NF",NF_ANEXADA:"NF anexada",LIBERADA_PARA_ENVIO:"Liberada para envio",DESPACHADA:"Despachada",RECEBIDA:"Recebida",FINALIZADA:"Concluida"};
const stepCommands={AGUARDANDO_SEPARACAO:"Iniciar separacao",EM_SEPARACAO:"Concluir conferencia",SEPARACAO_CONCLUIDA:"Finalizar montagem",MONTAGEM_CAIXA_CONCLUIDA:"Disponibilizar para NF",NF_ANEXADA:"Liberar para envio",LIBERADA_PARA_ENVIO:"Marcar como despachada",DESPACHADA:"Marcar como recebida",RECEBIDA:"Concluir processo"};
const badge='<span class="demo-badge">DEMO</span>';
const button=(action,label,disabled=false,primary=false)=>`<button type="button" class="${primary?"primary-button":"secondary-button"}" data-demo-action="${action}"${disabled?" disabled":""}>${label}</button>`;
const metric=(label,value)=>`<article class="demo-metric"><span>${label}</span><strong>${e(value)}</strong>${badge}</article>`;
const table=(heads,rows)=>`<div class="demo-table-wrap"><table><thead><tr>${heads.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map(cells=>`<tr>${cells.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;

export function mountDemoMode(context) {
  const root=context.root;
  const session=createDemoSession(context.user);
  let tab="dashboard",message="",lookup=null,lookupBusy=false,pdfUrl="",generation=0;
  const units=()=>context.warehouses();
  const revokePdf=()=>{if(pdfUrl)URL.revokeObjectURL(pdfUrl);pdfUrl="";};
  const active=()=>session.isDemoMode() && context.active();
  function render() {
    if(!active()) {root.replaceChildren();return;}
    const s=session.getScenario(),t=s.transfer,summary=getDemoDashboardSummary(s);
    const responsible=demoResponsibility(t.status);
    let content="";
    if(tab==="dashboard") {
      content=`<div class="demo-metrics">${metric("Transferencias abertas",summary.open)}${metric("Aguardando NF",summary.awaitingInvoice)}${metric("Transferencias com divergencia",summary.divergence>0?1:0)}${metric("Reposicoes DEMO",summary.replenishments)}${metric("Logistica Reversa",`${summary.realized} / ${summary.target} caixas`)}${metric("Progresso da meta",`${summary.percent}%`)}</div>`;
      if(!s.created)content+=`<div class="demo-preview"><h4>Cenario da apresentacao</h4><p>1 transferencia de Compras, 1 pendencia fiscal prevista, 1 divergencia de uma unidade, 1 reposicao e 72 caixas de logistica reversa.</p>${button("view-sku","Comecar pela Consulta SKU",false,true)}</div>`;
      else content+=`<p>${badge} ${e(t.id)}: <strong>${e(labels[t.status])}</strong> | ${e(responsible)}</p>${button("view-transfer","Abrir fluxo DEMO")}`;
    }
    if(tab==="sku")content=`<span class="demo-read-badge">Consulta real da CAPTACAO - somente leitura</span><form id="demoSkuForm"><label>Codigo do produto<input name="sku" inputmode="text" maxlength="30" value="${e(lookup?.sku || "01302")}" required></label><button type="submit" class="secondary-button"${lookupBusy?" disabled":""}>${lookupBusy?"Consultando...":"Consultar CAPTACAO"}</button></form>
      ${lookup?lookup.found?table(["SKU real","Produto real","Disponivel na posicao","Endereco"],[[e(lookup.sku),e(lookup.name),e(lookup.available),e(lookup.location || "Sem localizacao")]]):'<p class="demo-notice">SKU nao encontrado nesta unidade. Os itens do cenario continuam ficticios e podem ser apresentados normalmente.</p>':""}
      ${table(["SKU DEMO","Produto ficticio","Solicitada"],t.items.map(i=>[e(i.sku)+" "+badge,e(i.name),i.requested]))}${button("view-create","Nova solicitacao DEMO",false,true)}`;
    if(tab==="create")content=`<h4>${badge} ${e(t.id)}</h4><form id="demoCreateForm"><label>Origem<input value="COMPRAS DEMO" readonly></label><label>Estoque de referencia<select id="demoUnit"${s.created?" disabled":""}>${units().map(u=>`<option value="${e(u.code)}"${u.code===s.warehouseReference?" selected":""}>${e(u.code)} - ${e(u.name)}</option>`).join("")}</select></label><label>Destino<input value="DESTINO DEMO" readonly></label><label>SKUs<input value="3" readonly></label><button class="primary-button" type="submit"${s.created?" disabled":""}>${s.created?"Solicitacao DEMO criada":"Criar solicitacao DEMO"}</button></form>${table(["SKU","Produto","Solicitada"],t.items.map(i=>[e(i.sku)+" "+badge,e(i.name),i.requested]))}`;
    if(tab==="transfer")content=`<div class="demo-metrics">${metric("Solicitada",summary.requested)}${metric("Separada",summary.separated)}${metric("Conferida",summary.checked)}${metric("Divergencia",summary.divergence)}${metric("Caixas",t.boxes)}</div>
      ${table(["SKU DEMO","Produto","Solicitada","Separada","Conferida","Faltante"],t.items.map(i=>[e(i.sku)+" "+badge,e(i.name),i.requested,i.separated,i.checked,i.requested-i.separated]))}
      <p>Responsavel: <strong>${e(t.status==="AGUARDANDO_SEPARACAO"?"Estoque DEMO":"Colaborador DEMO")}</strong> | Inicio: ${e(s.startedAt?new Date(s.startedAt).toLocaleString("pt-BR"):"Ainda nao iniciado")}</p>
      <div class="demo-actions">${button("transfer-step",s.created?(stepCommands[t.status] || (t.status==="PRONTA_PARA_NOTA"?"Abrir painel de Compras":"Processo concluido")):"Criar solicitacao DEMO",t.status==="FINALIZADA",true)}</div>`;
    if(tab==="invoice")content=`<h4>Aguardando minha acao ${badge}</h4><p>${e(t.id)} | ${e(s.warehouseReference)} | DESTINO DEMO</p><div class="demo-metrics">${metric("Caixas",2)}${metric("SKUs",3)}${metric("Solicitada",summary.requested)}${metric("Conferida",summary.checked)}${metric("Divergencia",summary.divergence)}</div>
      ${["PRONTA_PARA_NOTA","NF_ANEXADA","LIBERADA_PARA_ENVIO","DESPACHADA","RECEBIDA","FINALIZADA"].includes(t.status)?`<label>Numero da NFe DEMO<input id="demoInvoiceNumber" maxlength="120" value="${e(t.invoiceNumber)}"${t.status!=="PRONTA_PARA_NOTA"?" readonly":""}></label>
      ${t.status==="PRONTA_PARA_NOTA"?'<label>PDF DEMO local (opcional)<input id="demoPdfInput" type="file" accept="application/pdf,.pdf"></label>':""}
      <p class="demo-notice">${t.pdf?`${t.pdf.source==="SIMULADO"?"PDF DEMO ANEXADO - SIMULACAO LOCAL":"PDF LOCAL - NAO ENVIADO AO STORAGE"}: ${e(t.pdf.name)}`:"Sem PDF DEMO: liberacao bloqueada."}</p>
      <div class="demo-actions">${t.status==="PRONTA_PARA_NOTA"?button("simulate-pdf","Simular PDF DEMO anexado"):""}${button("release","Liberar para envio",t.status!=="NF_ANEXADA" || !t.pdf,true)}${pdfUrl?button("view-pdf","Abrir PDF local"):""}${["LIBERADA_PARA_ENVIO","DESPACHADA","RECEBIDA"].includes(t.status)?button("transfer-step",stepCommands[t.status],false,true):""}</div>`:`<p>O Estoque DEMO ainda esta executando a separacao e a conferencia.</p>${button("view-transfer","Voltar ao Estoque DEMO")}`}`;
    if(tab==="replenishment") {const r=s.replenishment;content=`<h4>${e(r.id)} ${badge}</h4>${table(["SKU","Solicitada","Atendida","Status","Responsavel"],[[e(r.sku),r.requested,r.attended,e(r.status),e(r.responsible)]])}<p>Inicio: ${e(r.startedAt?new Date(r.startedAt).toLocaleString("pt-BR"):"-")} | Conclusao: ${e(r.finishedAt?new Date(r.finishedAt).toLocaleString("pt-BR"):"-")}</p>${button("replenishment-step",({PENDENTE:"Iniciar separacao DEMO",EM_SEPARACAO:"Confirmar 2 unidades DEMO",SEPARADO:"Concluir reposicao DEMO",CONCLUIDO:"Reposicao DEMO concluida"})[r.status],r.status==="CONCLUIDO",true)}`;}
    if(tab==="reverse" || tab==="target")content=`<h4>Logistica Reversa - Outubro/2026 ${badge}</h4><p>Unidade de referencia: ${e(s.warehouseReference)}</p><div class="demo-metrics">${metric("Meta",`${summary.target} caixas`)}${metric("Realizado",`${summary.realized} caixas`)}${metric("Percentual",`${summary.percent}%`)}${metric("Restante",`${summary.remaining} caixas`)}</div><label class="demo-progress">Meta mensal DEMO: ${summary.percent}%<progress max="100" value="${summary.percent}">${summary.percent}%</progress></label>
      ${table(["Nº GDV DEMO","NFe DEMO","Caixas","Status"],s.reverse.map(r=>[e(r.gdv)+" "+badge,e(r.nfe),r.boxes,e(r.status)]))}<div class="demo-actions">${button("reverse-reload","Carregar 3 registros DEMO")}${button("view-dashboard","Dashboard final",false,true)}</div>`;
    root.innerHTML=`<div class="demo-banner" role="status"><strong>AMBIENTE DE DEMONSTRA&Ccedil;&Atilde;O &mdash; DADOS FICT&Iacute;CIOS</strong><span>Somente simulacao local. Nenhum saldo ou registro operacional e alterado.</span>${button("exit","Sair da DEMO")}</div>
      <div class="demo-toolbar"><div class="demo-actions">${button("load","Carregar cenario DEMO")}${button("reset","Resetar DEMO")}${button("advance","Avancar etapa DEMO",(tab!=="replenishment" && (t.status==="PRONTA_PARA_NOTA" || t.status==="FINALIZADA")),true)}</div><details><summary>Roteiro DEMO</summary><ol>${["Dashboard","Consulta SKU","Compras cria","Estoque separa","Conferencia","Caixas","Disponivel para NF","Compras anexa NF","Liberacao","Despacho e recebimento","Reposicao","Logistica Reversa","Meta mensal","Dashboard final"].map(l=>`<li>${l}</li>`).join("")}</ol></details></div>
      <nav class="demo-tabs" aria-label="Telas DEMO">${Object.entries(titles).map(([id,label])=>`<button type="button" class="secondary-button" data-demo-tab="${id}" aria-pressed="${tab===id}">${label}</button>`).join("")}</nav>
      <div class="demo-handoff"><div><span>Processo ${badge}</span><strong>${e(t.id)}</strong></div><div><span>Etapa</span><strong>${e(labels[t.status])}</strong></div><div><span>Responsavel atual</span><strong>${e(responsible)}</strong></div></div>
      <p class="demo-message" role="status">${e(message)}</p><div class="demo-layout"><section class="demo-main"><h3>${e(titles[tab])}</h3>${content}</section><aside class="demo-timeline"><h3>Timeline DEMO</h3><ol>${t.timeline.length?t.timeline.map(event=>`<li><strong>${e(event.label)}</strong><span>${e(new Date(event.time).toLocaleTimeString("pt-BR"))} | ${e(event.actor)}</span></li>`).join(""):'<li>Cenario preparado. Crie a solicitacao DEMO.</li>'}</ol>${s.notifications.map(n=>`<p class="demo-notice">${badge} ${e(n.message)}</p>`).join("")}</aside></div>`;
  }
  function advance() {
    if(tab==="replenishment") {session.advanceDemoReplenishment();return;}
    if(tab==="dashboard" && !session.getScenario().created){tab="sku";return;}
    if(tab==="sku"){tab="create";return;}
    const stage=session.advanceDemoTransfer();tab=stage==="PRONTA_PARA_NOTA" || stage==="NF_ANEXADA"?"invoice":"transfer";
    message=stage==="PRONTA_PARA_NOTA"?"Separacao e conferencia concluidas. Processo disponivel para emissao de NF DEMO.":stage==="LIBERADA_PARA_ENVIO"?"NF DEMO concluida. Processo liberado para envio simulado.":"Etapa DEMO atualizada localmente.";
  }
  root.addEventListener("click",event=>{
    if(!active())return;
    const tabButton=event.target.closest("[data-demo-tab]");if(tabButton){tab=tabButton.dataset.demoTab;message="";render();return;}
    const control=event.target.closest("[data-demo-action]");if(!control || control.disabled)return;
    const action=control.dataset.demoAction;
    try {
      if(action==="exit"){stop();context.exit();return;}
      if(action.startsWith("view-") && action!=="view-pdf"){tab=action.slice(5);message="";}
      else if(action==="load" || action==="reset"){generation++;revokePdf();session.resetDemoScenario();tab="dashboard";lookup=null;lookupBusy=false;message="Cenario DEMO restaurado. Nenhum dado real foi alterado.";}
      else if(action==="simulate-pdf"){session.setInvoiceNumber(root.querySelector("#demoInvoiceNumber").value);session.attachDemoPdf("NF_DEMO_000001.pdf","SIMULADO");message="PDF DEMO ANEXADO - SIMULACAO LOCAL. Nenhum upload foi realizado.";}
      else if(action==="view-pdf"){window.open(pdfUrl,"_blank","noopener,noreferrer");return;}
      else if(action==="release"){session.advanceDemoTransfer();message="NF DEMO concluida. Processo liberado para envio simulado.";}
      else if(action==="replenishment-step"){session.advanceDemoReplenishment();message="Reposicao DEMO atualizada; saldo real preservado.";}
      else if(action==="reverse-reload"){session.createDemoReverseLogistics();message="3 registros locais DEMO: 72 caixas. Meta mensal DEMO: 72%.";}
      else if(action==="transfer-step" && session.getScenario().transfer.status==="PRONTA_PARA_NOTA")tab="invoice";
      else if(action==="advance" || action==="transfer-step")advance();
    }catch(error){message=error.message;}
    render();
  });
  root.addEventListener("submit",async event=>{
    event.preventDefault();if(!active())return;
    if(event.target.id==="demoCreateForm") {
      try {session.setWarehouseReference(root.querySelector("#demoUnit").value,units().map(u=>u.code));session.createDemoTransfer();tab="transfer";message="Solicitacao DEMO criada. Responsabilidade do ESTOQUE DEMO.";}catch(error){message=error.message;}render();return;
    }
    if(event.target.id!=="demoSkuForm" || lookupBusy)return;
    const sku=event.target.elements.sku.value.trim(),code=session.getScenario().warehouseReference,token=generation;
    if(!/^[a-zA-Z0-9-]{1,30}$/.test(sku)){message="Informe um SKU valido.";render();return;}
    lookupBusy=true;message="";render();
    try {const result=await context.readSku(sku,code);if(!active() || generation!==token)return;lookup={sku,found:!!result,...result};}
    catch(error){if(active() && generation===token)message="Consulta real indisponivel: "+error.message;}
    finally{if(generation===token){lookupBusy=false;if(active())render();}}
  });
  root.addEventListener("change",async event=>{
    if(event.target.id!=="demoPdfInput" || !active())return;
    const file=event.target.files[0],token=generation;
    try {await validateInvoicePdf(file);if(!active() || generation!==token)return;session.setInvoiceNumber(root.querySelector("#demoInvoiceNumber").value);revokePdf();pdfUrl=URL.createObjectURL(file);session.attachDemoPdf(file.name,"LOCAL");message="PDF mantido apenas neste navegador. Nenhum envio ao Storage.";}
    catch(error){message=error.message;}if(active())render();
  });
  function stop(){generation++;revokePdf();session.deactivate();lookup=null;lookupBusy=false;root.replaceChildren();}
  return {activate(){if(!context.active())throw new Error("Abra a tela DEMO como administrador.");const code=units().find(u=>u.code===context.warehouse())?.code || units().find(u=>u.code!=="DOURADOS")?.code || units()[0]?.code || "UNIDADE DEMO";session.activate(code);generation++;tab="dashboard";message="";render();},stop,isDemoMode:session.isDemoMode};
}
