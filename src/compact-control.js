import { createElement, Home, Warehouse, ClipboardList, Menu, PanelLeftClose, SunMoon, X } from "lucide";
import "./compact-control.css";

const iconButton = (icon, label) => {
  const button=document.createElement("button");
  button.type="button";button.title=label;button.setAttribute("aria-label",label);
  button.append(createElement(icon,{width:20,height:20,"aria-hidden":"true"}));
  return button;
};

export function installCompactControl(root) {
  root.classList.add("compact-control");
  const overview=root.querySelector("[data-global-overview]");
  const primary=root.querySelector("[data-global-metrics]");
  overview.prepend(primary);
  primary.after(root.querySelector("[data-global-board]"));
  const secondary=document.createElement("details");secondary.className="compact-secondary";
  const title=document.createElement("summary");title.textContent="Análises e indicadores complementares";secondary.append(title);
  const activity=root.querySelector("[data-global-activity]").closest("section");
  [...overview.children].filter(node=>node!==primary&&!node.matches("[data-global-board]")&&node!==activity).forEach(node=>secondary.append(node));
  overview.append(activity,secondary);
  activity.querySelector("h3").textContent="Atividades recentes";
  const charts=root.querySelector("[data-global-domain-charts]");
  const chartDisclosure=document.createElement("details");chartDisclosure.className="compact-domain-charts";
  const chartTitle=document.createElement("summary");chartTitle.textContent="Análise por estoque e etapa";chartDisclosure.append(chartTitle);charts.before(chartDisclosure);chartDisclosure.append(charts);
  const controls=root.querySelector(".global-detail-controls");
  const quick=document.createElement("div");quick.className="compact-status-tabs";quick.setAttribute("aria-label","Situação dos registros");
  for(const [key,label] of [["open","Abertos"],["pending","Pendentes"],["running","Em andamento"],["overdue","Atrasados"],["completed","Concluídos"]]){
    const button=document.createElement("button");button.type="button";button.textContent=label;button.dataset.compactMode=key;button.setAttribute("aria-pressed",String(key==="open"));
    button.addEventListener("click",()=>{const mode=root.querySelector('[data-filter="mode"]');mode.value=key;mode.dispatchEvent(new window.Event("change",{bubbles:true}));});quick.append(button);
  }
  controls.before(quick);
  root.addEventListener("change",event=>{if(event.target.matches('[data-filter="mode"]'))quick.querySelectorAll("button").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.compactMode===event.target.value)));});
  const filters=root.querySelector(".global-filters");
  const filterAnchor=document.createComment("operational-filters");filters.before(filterAnchor);
  const dialog=document.createElement("dialog");dialog.className="compact-filter-drawer";dialog.setAttribute("aria-label","Filtros da operação");
  const close=iconButton(X,"Fechar filtros");close.addEventListener("click",()=>dialog.close());dialog.append(close);
  const opener=iconButton(Menu,"Filtrar operação");opener.className="compact-filter-open";
  opener.addEventListener("click",()=>{dialog.append(filters);const advanced=filters.querySelector(".global-advanced-filters");if(advanced)advanced.open=true;dialog.showModal();});
  dialog.addEventListener("close",()=>filterAnchor.after(filters));
  root.querySelector(".page-title").append(opener);root.append(dialog);
  const media=window.matchMedia("(max-width: 700px)");
  media.addEventListener("change",()=>{if(!media.matches&&dialog.open)dialog.close();});
  if(!document.documentElement.classList.contains("cp-alamo")||document.querySelector(".compact-bottom-nav"))return;
  const sidebar=document.querySelector(".sidebar");
  sidebar.querySelectorAll("[data-screen]").forEach(button=>{button.title=button.textContent.trim();});
  const menu=document.createElement("dialog");menu.className="compact-more";menu.setAttribute("aria-label","Mais módulos");
  const dismiss=iconButton(X,"Fechar menu");dismiss.addEventListener("click",()=>menu.close());
  const list=document.createElement("div");menu.append(dismiss,list);document.body.append(menu);
  const available=screen=>[...sidebar.querySelectorAll("[data-screen]")].find(button=>button.dataset.screen===screen&&!button.hidden&&window.getComputedStyle(button).display!=="none");
  const nav=document.createElement("nav");nav.className="compact-bottom-nav";nav.setAttribute("aria-label","Navegação principal");
  const entries=[[Home,"Início","globalDashboard"],[Warehouse,"Estoques","stocks"],[ClipboardList,"Tarefas","tasks"],[Menu,"Mais","more"]];
  const update=()=>{
    nav.hidden=document.body.classList.contains("auth-locked")||document.documentElement.classList.contains("auth-locked");
    nav.querySelectorAll("button").forEach(button=>{
      const key=button.dataset.compactNav;
      button.disabled=key==="globalDashboard"&&!available("globalDashboard")||["stocks","tasks"].includes(key)&&!available("globalDashboard")&&!available(key==="stocks"?"baseEstoque":"transferencias");
      button.setAttribute("aria-current",key==="globalDashboard"&&!root.hidden?"page":"false");
    });
  };
  for(const [icon,label,key] of entries){
    const button=iconButton(icon,label);button.dataset.compactNav=key;
    const text=document.createElement("span");text.textContent=label;button.append(text);
    button.addEventListener("click",()=>{
      if(key==="more"){
        list.replaceChildren();
        sidebar.querySelectorAll("[data-screen]").forEach(source=>{
          if(source.hidden||window.getComputedStyle(source).display==="none")return;
          const item=document.createElement("button");item.type="button";item.textContent=source.textContent.trim();
          item.addEventListener("click",()=>{menu.close();source.click();});list.append(item);
        });
        menu.showModal();return;
      }
      const global=available("globalDashboard");
      if(global){global.click();if(key==="tasks")root.querySelector('[data-global-tab="tasks"]').click();else {root.querySelector('[data-global-tab="overview"]').click();if(key==="stocks"){const board=root.querySelector("[data-global-board]");for(let parent=board.parentElement;parent&&parent!==root;parent=parent.parentElement)if(parent.tagName==="DETAILS")parent.open=true;board.scrollIntoView({block:"start"});}}}
      else available(key==="stocks"?"baseEstoque":"transferencias")?.click();
    });nav.append(button);
  }
  document.body.append(nav);
  const collapse=iconButton(PanelLeftClose,"Recolher ou expandir menu");
  collapse.className="compact-sidebar-toggle";collapse.setAttribute("aria-expanded","true");
  collapse.addEventListener("click",()=>{const collapsed=document.documentElement.classList.toggle("compact-sidebar-collapsed");collapse.setAttribute("aria-expanded",String(!collapsed));});
  const theme=iconButton(SunMoon,"Alternar tema claro ou escuro");
  theme.addEventListener("click",()=>{const dark=document.documentElement.classList.toggle("compact-dark");try{localStorage.setItem("cp-control-theme",dark?"dark":"light");}catch{/* Storage can be unavailable in private mode. */}});
  try{document.documentElement.classList.toggle("compact-dark",localStorage.getItem("cp-control-theme")==="dark");}catch{/* Keep the default theme. */}
  document.querySelector(".app-header")?.append(collapse,theme);
  const themeMenu=iconButton(SunMoon,"Alternar tema claro ou escuro");themeMenu.append(document.createTextNode(" Tema claro / escuro"));themeMenu.addEventListener("click",()=>theme.click());menu.append(themeMenu);
  const collapseMenu=iconButton(PanelLeftClose,"Recolher ou expandir menu");collapseMenu.append(document.createTextNode(" Recolher / expandir menu"));collapseMenu.addEventListener("click",()=>collapse.click());menu.append(collapseMenu);
  const logout=document.getElementById("logoutButton");if(logout){const exit=document.createElement("button");exit.type="button";exit.textContent="Sair";exit.addEventListener("click",()=>{menu.close();logout.click();});menu.append(exit);}
  new window.MutationObserver(update).observe(document.body,{attributes:true,subtree:true,attributeFilter:["hidden","class"]});update();
}
