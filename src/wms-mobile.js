import { createElement, Box, Home, ClipboardList, Search, Menu, ArrowLeftRight, Bell, Plus, ChevronRight, SlidersHorizontal, X } from "lucide";
import "./wms-mobile.css";
import "./wms-desktop.css";

const icon=(shape,size=20)=>createElement(shape,{width:size,height:size,"aria-hidden":"true",focusable:"false"});
const button=(label,shape)=>{const node=document.createElement("button");node.type="button";node.setAttribute("aria-label",label);node.title=label;node.append(icon(shape));return node;};
const text=(node,selector)=>node.querySelector(selector)?.textContent.trim()||"";

export function initializeWmsMobile({navigate,canAccess,isAuthenticated}){
  if(document.documentElement.classList.contains("wms-mobile-v1"))return;
  document.documentElement.classList.add("wms-mobile-v1");
  const $=id=>document.getElementById(id),media=window.matchMedia("(max-width: 760px)");
  const screens=["consultaSku","reposicao","transferencias"].map($).filter(Boolean);
  const header=document.querySelector(".mobile-topbar"),sidebar=$("sidebar"),appHeader=document.querySelector(".app-header");
  if(!header||!sidebar||screens.length!==3)return;
  $("menuToggle")?.replaceChildren(icon(Menu,24));
  const brand=document.createElement("div");brand.className="mobile-brand";
  const brandText=document.createElement("span");brandText.innerHTML='<strong>WMS</strong><small>ENDEREÇAMENTO</small>';brand.append(icon(Box,32),brandText);header.append(brand);
  const taskButton=button("Minhas tarefas",Bell);taskButton.className="mobile-task-button";const badge=document.createElement("span");badge.className="mobile-task-count";taskButton.append(badge);taskButton.addEventListener("click",()=>{if(canAccess("transferencias"))navigate("transferencias");});header.append(taskButton);
  const menu=document.createElement("dialog");menu.className="mobile-more-menu";menu.setAttribute("aria-label","Mais módulos");
  const menuClose=button("Fechar menu",X);menuClose.addEventListener("click",()=>menu.close());
  const menuHeading=document.createElement("header");menuHeading.append(document.createTextNode("Mais"),menuClose);
  const menuList=document.createElement("nav");menuList.setAttribute("aria-label","Módulos disponíveis");const menuContext=document.createElement("div");menuContext.className="mobile-menu-context";
  menu.append(menuHeading,menuList,menuContext);document.body.append(menu);
  const nav=document.createElement("nav");nav.className="mobile-bottom-nav";nav.setAttribute("aria-label","Navegação mobile");
  let mobile=false,frame=0,skuTab="stock";
  const restores=[],records=new Map();
  function move(node,parent,before=null){if(!node||!parent)return;const marker=document.createComment("mobile-position");node.before(marker);parent.insertBefore(node,before);restores.push(()=>{marker.replaceWith(node);});}
  function showMenu(){
    menuList.replaceChildren();
    sidebar.querySelectorAll(".menu-item[data-screen]").forEach(source=>{
      if(source.hidden||window.getComputedStyle(source).display==="none"||!canAccess(source.dataset.screen))return;
      const item=document.createElement("button");item.type="button";item.textContent=source.textContent.trim();item.addEventListener("click",()=>{menu.close();source.click();});menuList.append(item);
    });menu.showModal();
  }
  const entries=[["home","Início",Home],["capture","Captação",Box],["replenishment","Reposição",ClipboardList],["search","Pesquisa",Search],["more","Mais",Menu]];
  for(const [key,label,shape] of entries){const item=button(label,shape);item.dataset.mobileNav=key;const caption=document.createElement("span");caption.textContent=label;item.append(caption);item.addEventListener("click",()=>{
    if(key==="more"){showMenu();return;}
    const screen=key==="home"?(canAccess("globalDashboard")?"globalDashboard":"dashboard"):key==="capture"?"bipagem":key==="replenishment"?"reposicao":"consultaSku";
    if(canAccess(screen))navigate(screen);
  });nav.append(item);}document.body.append(nav);
  function wrapPanel(panel,label,shape,className){
    if(!panel)return null;const children=[...panel.childNodes],details=document.createElement("details");details.className=className;
    const summary=document.createElement("summary");summary.append(icon(shape),document.createTextNode(label));const body=document.createElement("div");body.className="mobile-disclosure-body";body.append(...children);details.append(summary,body);panel.append(details);
    restores.push(()=>{panel.append(...children);details.remove();});return details;
  }
  function kpis(selector,shape,filters=[]){
    document.querySelectorAll(selector).forEach((node,index)=>{
      node.classList.add("mobile-kpi-card");const mark=icon(shape);mark.classList.add("mobile-kpi-icon");node.prepend(mark);
      const target=filters[index];let activate;
      if(target){activate=event=>{if(event.type==="keydown"&&!["Enter"," "].includes(event.key))return;if(event.type==="keydown")event.preventDefault();document.querySelector(target)?.click();};node.setAttribute("role","button");node.tabIndex=0;node.addEventListener("click",activate);node.addEventListener("keydown",activate);}
      restores.push(()=>{mark.remove();node.classList.remove("mobile-kpi-card");if(activate){node.removeEventListener("click",activate);node.removeEventListener("keydown",activate);node.removeAttribute("role");node.removeAttribute("tabindex");}});
    });
  }
  function compactRecord(node,kind){
    if(records.has(node))return;
    const children=[...node.childNodes],details=document.createElement("details"),summary=document.createElement("summary");details.className="mobile-list-card";
    const mark=icon(kind==="transfer"?ArrowLeftRight:Box);mark.classList.add("mobile-record-icon");
    const copy=document.createElement("span");copy.className="mobile-record-copy";
    const title=document.createElement("strong"),description=document.createElement("span"),meta=document.createElement("small"),status=document.createElement("span");status.className="mobile-status-badge";
    if(kind==="transfer"){
      title.textContent=text(node,".transfer-board-title small");
      const route=[...node.querySelectorAll(".transfer-route-flow strong")].map(item=>item.textContent.trim());description.textContent=route.join(" → ");
      meta.textContent=[text(node,".transfer-board-meta>span:first-child strong")+" SKUs",text(node,".transfer-board-meta>span:last-child strong")].filter(Boolean).join(" · ");
      status.textContent=text(node,".transfer-stage-line>span:last-child")||text(node,".transfer-stage-chip");status.classList.add(...[...node.classList].filter(name=>name.startsWith("stage-")));
    }else{
      title.textContent=text(node,".replenishment-card-main strong");description.textContent=text(node,".replenishment-card-main p");
      meta.textContent=text(node,".replenishment-card-metrics>span:nth-child(2) strong");if(meta.textContent)meta.textContent+=" un. solicitadas";
      if(!meta.textContent)meta.textContent=[...node.querySelectorAll(".replenishment-card-footer>span")].map(item=>item.textContent.trim()).join(" · ");
      status.textContent=text(node,".status-badge")||text(node,".replenishment-card-main>div:nth-child(2) strong");status.classList.add(...[...node.classList].filter(name=>name.startsWith("status-")));
    }
    copy.append(title,description,meta);summary.append(mark,copy,status,icon(ChevronRight,16));
    const body=document.createElement("div");body.className="mobile-record-body";body.append(...children);details.append(summary,body);node.append(details);
    records.set(node,()=>{node.append(...children);details.remove();});
  }
  function searchList(input,list,empty){
    if(!list)return;
    const query=input.value.trim().toLocaleLowerCase("pt-BR");let matches=0;
    for(const row of list.querySelectorAll(":scope>.replenishment-card")){const match=!query||row.textContent.toLocaleLowerCase("pt-BR").includes(query);row.hidden=!match;if(match)matches++;}
    empty.hidden=!query||matches>0;
  }
  const replenishmentSearch=document.createElement("label");replenishmentSearch.className="mobile-search";replenishmentSearch.append(icon(Search));
  const query=document.createElement("input");query.type="search";query.placeholder="SKU, produto ou responsável";query.setAttribute("aria-label","Pesquisar pedidos carregados");replenishmentSearch.append(query);
  const noResults=document.createElement("p");noResults.className="empty-state mobile-search-empty";noResults.textContent="Nenhum pedido encontrado.";noResults.hidden=true;
  query.addEventListener("input",()=>searchList(query,$("replenishmentList"),noResults));
  const skuTabs=document.createElement("div");skuTabs.className="mobile-tabs";skuTabs.setAttribute("role","tablist");skuTabs.setAttribute("aria-label","Informações do SKU");
  for(const [key,label] of [["stock","Estoque"],["addresses","Endereços"]]){const tab=document.createElement("button");tab.type="button";tab.textContent=label;tab.dataset.mobileSkuTab=key;tab.setAttribute("role","tab");tab.addEventListener("click",()=>{skuTab=key;updateSkuTab();});skuTabs.append(tab);}
  function updateSkuTab(){
    const hub=$("skuOperationalHub"),locations=$("skuResultCards");
    if(!hub||!locations)return;
    const available=locations.childElementCount>0;
    if(!available)skuTab="stock";
    skuTabs.hidden=!hub.childElementCount;
    skuTabs.querySelector('[data-mobile-sku-tab="addresses"]').hidden=!available;
    skuTabs.querySelectorAll("button").forEach(tab=>tab.setAttribute("aria-selected",String(tab.dataset.mobileSkuTab===skuTab)));
    hub.classList.toggle("mobile-tab-hidden",skuTab!=="stock");locations.classList.toggle("mobile-tab-hidden",skuTab!=="addresses");
  }
  const transferCreate=button("Nova Transferência",Plus);transferCreate.className="mobile-primary-action";transferCreate.append(document.createTextNode("Nova Transferência"));transferCreate.addEventListener("click",()=>document.querySelector('[data-transfer-tab="newTransferSection"]')?.click());
  let composer;
  function enter(){
    mobile=true;
    if(appHeader)move(appHeader,menuContext);
    for(const screen of screens){
      screen.classList.add("mobile-module");const heading=screen.querySelector(".page-title");heading?.classList.add("mobile-page-header");
      const mark=icon(screen.id==="transferencias"?ArrowLeftRight:screen.id==="reposicao"?ClipboardList:Box,36);mark.classList.add("mobile-page-icon");heading?.prepend(mark);restores.push(()=>mark.remove());
      screen.querySelectorAll(".panel").forEach(panel=>{panel.classList.add("mobile-section");restores.push(()=>panel.classList.remove("mobile-section"));});
    }
    kpis(".replenishment-summary-grid>div",Box,['[data-replenishment-filter="PENDENTE"]','[data-replenishment-filter="EM_SEPARACAO"]',null,'[data-replenishment-filter="SEM_ESTOQUE"]']);
    kpis(".transfer-summary-grid>div",ClipboardList);
    // Transfer status already has a change handler; keep the same filter and permissions.
    const separating=document.querySelector(".transfer-summary-grid>div:nth-child(2)");
    if(separating){const handler=event=>{if(event.type==="keydown"&&!["Enter"," "].includes(event.key))return;if(event.type==="keydown")event.preventDefault();const select=$("transferStatusFilter");select.value="EM_SEPARACAO";select.dispatchEvent(new window.Event("change",{bubbles:true}));};separating.tabIndex=0;separating.setAttribute("role","button");separating.addEventListener("click",handler);separating.addEventListener("keydown",handler);restores.push(()=>{separating.removeEventListener("click",handler);separating.removeEventListener("keydown",handler);separating.removeAttribute("role");separating.removeAttribute("tabindex");});}
    composer=wrapPanel(document.querySelector(".replenishment-create-panel"),"Novo pedido",Plus,"mobile-compose");
    const openedComposer=composer;openedComposer?.addEventListener("toggle",()=>{if(openedComposer.open&&openedComposer.isConnected)$("replenishmentSkuInput").focus();});
    wrapPanel($("replenishmentSuggestionsPanel"),"Sugestões de abastecimento",Box,"mobile-secondary-disclosure");
    const skuActions=document.querySelector("#consultaSku .operational-actions");
    if(skuActions){move(skuActions,$("skuResultActions").parentNode);wrapPanel(skuActions,"Ações",Menu,"mobile-secondary-disclosure");}
    const list=$("replenishmentList");list.before(replenishmentSearch);list.after(noResults);
    restores.push(()=>{replenishmentSearch.remove();noResults.remove();query.value="";list.querySelectorAll(".replenishment-card").forEach(row=>row.hidden=false);});
    const filters=document.querySelector("#transferPanelSection .transfer-filters>.panel:first-child");wrapPanel(filters,"Filtrar transferências",SlidersHorizontal,"mobile-filter-disclosure");
    const search=$("transferCodeFilter")?.closest("label");if(search){search.classList.add("mobile-search-field");restores.push(()=>search.classList.remove("mobile-search-field"));}
    const transferTitle=$("transferencias").querySelector(".page-title");transferTitle.after(transferCreate);restores.push(()=>transferCreate.remove());
    const hub=$("skuOperationalHub"),cards=$("skuResultCards");move(hub,cards.parentNode,cards);hub.before(skuTabs);restores.push(()=>{skuTabs.remove();hub.classList.remove("mobile-tab-hidden");cards.classList.remove("mobile-tab-hidden");});
  }
  function leave(){
    for(const restore of records.values())restore();records.clear();
    while(restores.length)restores.pop()();composer=null;
    screens.forEach(screen=>{screen.classList.remove("mobile-module");screen.querySelector(".page-title")?.classList.remove("mobile-page-header");});mobile=false;if(menu.open)menu.close();
  }
  function refresh(){
    observer.disconnect();
    if(media.matches&&!mobile)enter();if(!media.matches&&mobile)leave();
    const authenticated=isAuthenticated();nav.hidden=!authenticated;taskButton.hidden=!authenticated||!canAccess("transferencias");
    const count=$("topTaskCount")?.textContent.trim()||"0";badge.textContent=count;badge.hidden=count==="0";
    const active=document.querySelector(".screen.active")?.id;
    nav.querySelectorAll("[data-mobile-nav]").forEach(item=>{const key=item.dataset.mobileNav;const target=key==="home"?(canAccess("globalDashboard")?"globalDashboard":"dashboard"):key==="capture"?"bipagem":key==="replenishment"?"reposicao":key==="search"?"consultaSku":null;item.hidden=!!target&&!canAccess(target);const selected=key==="more"?active==="transferencias":key==="home"?["dashboard","globalDashboard"].includes(active):active===target;item.setAttribute("aria-current",selected?"page":"false");});
    nav.querySelector('[data-mobile-nav="more"] span').textContent=active==="transferencias"?"Transferências":"Mais";
    if(mobile){
      for(const [node] of records)if(!node.isConnected)records.delete(node);
      $("replenishmentList")?.querySelectorAll(":scope>.replenishment-card").forEach(node=>compactRecord(node,"replenishment"));
      $("transferPanelRows")?.querySelectorAll(":scope>.transfer-board-card").forEach(node=>compactRecord(node,"transfer"));
      searchList(query,$("replenishmentList"),noResults);updateSkuTab();
      const newSource=document.querySelector('[data-transfer-tab="newTransferSection"]');transferCreate.hidden=!newSource||newSource.hidden||window.getComputedStyle(newSource).display==="none";
    }
    screens.forEach(screen=>observer.observe(screen,{childList:true,subtree:true,attributes:true,attributeFilter:["hidden","class"],characterData:true}));
    observer.observe(sidebar,{subtree:true,attributes:true,attributeFilter:["hidden","class"]});observer.observe(document.body,{attributes:true,attributeFilter:["class"]});if($("topTaskCount"))observer.observe($("topTaskCount"),{childList:true,characterData:true,subtree:true});
  }
  function schedule(){window.cancelAnimationFrame(frame);frame=window.requestAnimationFrame(refresh);}
  const observer=new window.MutationObserver(schedule);media.addEventListener("change",schedule);refresh();
  return {refresh:schedule};
}
