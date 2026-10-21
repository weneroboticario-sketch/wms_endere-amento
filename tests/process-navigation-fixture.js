import "../style.css";
import "../src/cpalamo-theme.css";
import "../src/process-navigation.css";
import { updateProcessNavigation } from "../src/process-navigation.js";

const html = new DOMParser().parseFromString(await (await fetch("/index.html")).text(), "text/html");
document.body.append(html.querySelector(".app-shell"));
document.documentElement.classList.add("cp-alamo");
document.body.classList.add("auth-unlocked");
const roleRoutes = {
  ADMINISTRADOR: null,
  SUPERVISOR: ["dashboard", "consultaSku", "bipagem", "baseEstoque", "transferencias", "reposicao", "fiscalWorkflow", "expedition", "usuarios"],
  OPERADOR: ["consultaSku", "transferencias", "reposicao"],
  COMPRAS: ["purchaseTransfer", "fiscalWorkflow", "transferencias"],
  GERENTE: ["managerCentral", "managementQueries", "lossesDre"],
  FINANCEIRO: ["lossesDre"],
  ATENDENTE: ["consultaSku", "reposicao"]
};
let role = "ADMINISTRADOR", current = "dashboard";
const allowed = screen => roleRoutes[role] === null || roleRoutes[role].includes(screen);
const navigate = screen => {
  if (!allowed(screen)) throw Error("Denied route");
  current = screen;
  document.querySelectorAll(".screen").forEach(node => { node.hidden = node.id !== screen; node.classList.toggle("active", node.id === screen); });
  document.querySelectorAll(".menu-item[data-screen]").forEach(node => { node.hidden = !allowed(node.dataset.screen); });
  updateProcessNavigation({ role, screenId: current, canAccess: allowed, navigate });
};
window.navigationFixture = { setRole(value) { role = value; navigate(roleRoutes[value]?.[0] || "dashboard"); }, navigate, get current() { return current; } };
document.getElementById("menuToggle").onclick = () => document.getElementById("sidebar").classList.toggle("open");
document.querySelectorAll(".menu-item[data-screen]").forEach(node => node.onclick = () => navigate(node.dataset.screen));
navigate(current);
