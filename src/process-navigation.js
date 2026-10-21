import { createElement, LayoutDashboard, Warehouse, ClipboardList, ArrowLeftRight, ShieldCheck, Settings } from "lucide";

export const PROCESS_GROUPS = [
  { id: "central", label: "Minha Central", icon: LayoutDashboard, screens: ["dashboard", "globalDashboard", "managerCentral", "managementQueries"] },
  { id: "stock", label: "Estoque", icon: Warehouse, screens: ["consultaSku", "consultaPrateleira", "bipagem", "baseEstoque", "exportar", "etiquetas"] },
  { id: "requests", label: "Solicitacoes", icon: ClipboardList, screens: ["purchaseTransfer", "reposicao"] },
  { id: "transfers", label: "Transferencias", icon: ArrowLeftRight, screens: ["transferencias", "fiscalWorkflow", "expedition"] },
  { id: "control", label: "Controle", icon: ShieldCheck, screens: ["reverseLogistics", "lossesDre"] },
  { id: "admin", label: "Administracao", icon: Settings, screens: ["estoques", "usuarios", "saudeSistema", "manutencao", "configuracoes"] }
];
const ROLES = ["ADMINISTRADOR", "SUPERVISOR", "OPERADOR", "COMPRAS", "GERENTE", "FINANCEIRO"];
export const groupForScreen = screen => PROCESS_GROUPS.find(group => group.screens.includes(screen));
export const permittedProcessGroups = (role, canAccess) => ROLES.includes(role)
  ? PROCESS_GROUPS.map(group => ({ ...group, screens: group.screens.filter(canAccess) })).filter(group => group.screens.length) : [];

let instance;

export function updateProcessNavigation({ role, screenId, canAccess, navigate }) {
  const legacy = document.querySelector(".sidebar .grouped-menu");
  const content = document.querySelector("main.content");
  if (!legacy || !content) return;
  const groups = permittedProcessGroups(role, canAccess);
  if (!groups.length) {
    legacy.classList.remove("process-legacy-menu");
    document.documentElement.classList.remove("process-navigation-enabled");
    if (instance) { instance.menu.hidden = true; instance.tabs.hidden = true; }
    return;
  }
  if (!instance) {
    const menu = document.createElement("nav");
    menu.className = "process-menu"; menu.setAttribute("aria-label", "Areas operacionais");
    legacy.before(menu);
    const tabs = document.createElement("nav");
    tabs.className = "process-tabs"; tabs.setAttribute("aria-label", "Modulos da area");
    content.querySelector(".app-header").after(tabs);
    instance = { menu, tabs, last: {}, signature: "" };
  }
  legacy.classList.add("process-legacy-menu");
  document.documentElement.classList.add("process-navigation-enabled");
  instance.menu.hidden = false; instance.tabs.hidden = false;
  const active = groups.find(group => group.screens.includes(screenId));
  if (active) instance.last[active.id] = screenId;
  const signature = JSON.stringify([role, screenId, groups.map(group => group.screens)]);
  if (signature === instance.signature) return;
  instance.signature = signature;
  const labels = new Map();
  legacy.querySelectorAll("[data-screen]").forEach(source => {
    if (source.classList.contains("task-menu-item")) return;
    const copy = source.cloneNode(true);
    copy.querySelectorAll("svg, .menu-badge").forEach(node => node.remove());
    labels.set(source.dataset.screen, copy.textContent.replace(/\s+/g, " ").trim());
  });
  const go = screen => {
    // Recheck permissions on every click, including after a profile/scope change.
    if (canAccess(screen)) navigate(screen);
  };
  instance.menu.replaceChildren(...groups.map(group => {
    const button = document.createElement("button"); button.type = "button";
    button.dataset.processGroup = group.id;
    button.title = group.label;
    button.setAttribute("aria-current", active?.id === group.id ? "page" : "false");
    button.append(createElement(group.icon, { width: 20, height: 20, "aria-hidden": "true" }), document.createTextNode(group.label));
    button.addEventListener("click", () => {
      const last = instance.last[group.id];
      const target = group.screens.includes(last) ? last : group.screens[0];
      go(target);
    });
    return button;
  }));
  instance.tabs.replaceChildren(...(active?.screens || []).map(screen => {
    const button = document.createElement("button"); button.type = "button";
    button.textContent = screen === "exportar" ? "Exportacoes de estoque" : screen === "transferencias" && role === "OPERADOR" ? "Minhas tarefas" : labels.get(screen) || screen;
    button.setAttribute("aria-current", screen === screenId ? "page" : "false");
    button.dataset.processScreen = screen;
    button.addEventListener("click", () => go(screen));
    return button;
  }));
  instance.tabs.hidden = !active;
}
