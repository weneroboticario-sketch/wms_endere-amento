import { createElement, Search, MapPin, Warehouse, LayoutDashboard, Truck, FileText, RotateCcw,
  Tags, Users, ShieldCheck, Settings, Package, ArrowLeftRight, ClipboardList, LogOut, RefreshCw, X, Upload } from "lucide";
import { escapeHtml } from "./utils.js";

const menuIcons = { consultaSku: Search, consultaPrateleira: MapPin, bipagem: Package, transferencias: ArrowLeftRight,
  purchaseTransfer: ClipboardList, reposicao: RotateCcw, fiscalWorkflow: FileText, expedition: Truck,
  reverseLogistics: RotateCcw, globalDashboard: LayoutDashboard, dashboard: LayoutDashboard, baseEstoque: Warehouse,
  exportar: FileText, etiquetas: Tags, estoques: Warehouse, usuarios: Users, saudeSistema: ShieldCheck,
  manutencao: Settings, configuracoes: Settings };

export function workflowErrorMessage(error, fallback = "Nao foi possivel carregar os dados. Use Atualizar para tentar novamente.") {
  const message=error?.message || String(error);
  return /permission denied|column .*does not exist|relation .*does not exist|violates|PostgREST|failed to fetch|SQLSTATE/i.test(message) ? fallback : message;
}

export function requestVisualFields(title, fields) {
  return new Promise(resolve=>{
    const dialog=document.createElement("dialog");dialog.className="app-modal";
    dialog.setAttribute("aria-label",title);
    dialog.innerHTML=`<form><h3>${escapeHtml(title)}</h3>${fields.map(field=>`<label>${escapeHtml(field.label)}${field.type==="number"?`<input name="${escapeHtml(field.name)}" type="number" min="0" step="1" required value="${escapeHtml(field.value || "")}">`:`<textarea name="${escapeHtml(field.name)}" maxlength="4000" required></textarea>`}</label>`).join("")}<div class="button-row"><button class="secondary-button" type="button" data-modal-cancel>Cancelar</button><button class="primary-button" type="submit">Confirmar</button></div></form>`;
    document.body.appendChild(dialog);let result=null;
    dialog.querySelector("form").addEventListener("submit",event=>{event.preventDefault();result=Object.fromEntries(fields.map(field=>[field.name,dialog.querySelector(`[name="${field.name}"]`).value.trim()]));dialog.close();});
    dialog.querySelector("[data-modal-cancel]").addEventListener("click",()=>dialog.close());
    dialog.addEventListener("close",()=>{dialog.remove();resolve(result);},{once:true});dialog.showModal();
  });
}

export function addActionIcon(button, icon) {
  if (!button || button.querySelector("svg")) return;
  const element = createElement(icon, { width: 18, height: 18, "stroke-width": 1.8, "aria-hidden": "true", focusable: "false" });
  element.classList.add("app-action-icon"); button.prepend(element);
}

export function decorateWorkflow(root) {
  if (!document.documentElement.classList.contains("cp-alamo")) return;
  root.querySelectorAll("button").forEach(button => {
    const text = button.textContent.trim();
    if (button.matches("[data-drawer-close], [data-fiscal-close]")) addActionIcon(button, X);
    else if (/^Atualizar/.test(text)) addActionIcon(button, RefreshCw);
    else if (/^(Anexar|Substituir PDF)/.test(text)) addActionIcon(button, Upload);
  });
  root.querySelectorAll("table").forEach(table => {
    const headers = [...table.querySelectorAll("thead th")].map(th=>th.textContent);
    table.querySelectorAll("tbody tr").forEach(row=>[...row.children].forEach((cell,index)=>{
      if (headers[index] && !cell.dataset.label) cell.dataset.label=headers[index];
    }));
  });
}

export function decorateMetrics(root) {
  if (!document.documentElement.classList.contains("cp-alamo")) return;
  root.querySelectorAll("article, .global-kpi").forEach(card=>{
    if (card.querySelector("svg")) return;
    const label=card.querySelector("span")?.textContent || "";
    addActionIcon(card,/valor|conclu|anexad/i.test(label)?FileText:/separa|estoque/i.test(label)?Package:/liberad/i.test(label)?Truck:ClipboardList);
  });
}

export function initializeCpAppearance({ userDetails } = {}) {
  document.documentElement.classList.add("cp-alamo");
  document.querySelectorAll(".menu-item").forEach(button => addActionIcon(button, menuIcons[button.dataset.screen] || Package));
  const group = document.querySelectorAll(".menu-label");
  ["Operação", "Transferências", "Gestão", "Administração"].forEach((label,index) => { if (group[index]) group[index].textContent = label; });
  const subtitle = document.querySelector(".brand .cpalamo-only"); if (subtitle) subtitle.textContent = "CP Álamo";
  const connection = document.querySelector("#topConnectionPill > span"); if (connection) connection.textContent = "Sistema";
  const sync = document.querySelector("#topSyncPill > span"); if (sync) sync.textContent = "Atualizacao";
  ["logoutButton", "topLogoutButton", "mobileLogoutButton"].forEach(id => addActionIcon(document.getElementById(id), LogOut));
  const userForm=document.getElementById("userForm");
  if(userForm) {
    const panel=userForm.closest(".panel"),disclosure=document.createElement("details");
    disclosure.className="user-form-disclosure";
    const summary=document.createElement("summary");summary.textContent="Cadastrar usuario";disclosure.appendChild(summary);
    [...panel.children].forEach(child=>disclosure.appendChild(child));panel.appendChild(disclosure);
    userForm.querySelectorAll("label[for]").forEach(label=>{
      const control=document.getElementById(label.htmlFor);
      if(control && control.parentElement===userForm) {
        const field=document.createElement("div");field.className="app-form-field";
        label.before(field);field.append(label,control);
      }
    });
  }
  const name = document.getElementById("sidebarUserName");
  if (name) {
    const avatar = document.createElement("span"); avatar.className = "app-avatar"; avatar.setAttribute("aria-hidden", "true"); name.before(avatar);
    const update = () => { avatar.textContent = name.textContent.split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join("").toUpperCase(); };
    update(); new window.MutationObserver(update).observe(name, { childList:true, subtree:true, characterData:true });
  }
  document.getElementById("userGroups")?.addEventListener("click", event=>{
    const opener=event.target.closest("[data-user-open-detail]");
    if(opener && userDetails) {
      let dialog=document.getElementById("cpUserDetail");
      if(!dialog){dialog=document.createElement("dialog");dialog.id="cpUserDetail";dialog.className="drawer fiscal-drawer user-detail-drawer";document.getElementById("userGroups").appendChild(dialog);}
      dialog.innerHTML='<header class="drawer-heading"><h3>Detalhes do usuario</h3><button type="button" class="secondary-button" data-user-detail-close>Fechar</button></header><div class="drawer-body">'+userDetails(opener.dataset.userOpenDetail)+'</div>';
      dialog.showModal();
    }
    if(event.target.closest("[data-user-detail-close],[data-user-edit]"))document.getElementById("cpUserDetail")?.close();
    if(event.target.closest("[data-user-edit]")){const disclosure=document.querySelector(".user-form-disclosure");if(disclosure)disclosure.open=true;}
  });
}
