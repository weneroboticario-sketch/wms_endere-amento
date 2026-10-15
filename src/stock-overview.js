import { escapeHtml as esc } from "./utils.js";
import "./stock-overview.css";

export function canViewStockOverview(user) {
  return Boolean(user && user.active === true && !user.archived && user.role === "ADMINISTRADOR");
}

const number = value => value == null ? "Indisponível" : Number(value).toLocaleString("pt-BR");
const date = value => value ? new Date(value).toLocaleString("pt-BR") : "Sem importação";
const statuses = { COMPLETED: "Concluída", FAILED: "Falhou", PROCESSING: "Em processamento" };
export function importHealth(batch, now = Date.now()) {
  if (!batch) return { label: "Sem base", kind: "warning" };
  if (batch.status === "FAILED") return { label: "Falha na importação", kind: "error" };
  if (batch.status !== "COMPLETED") return { label: "Importação em andamento", kind: "warning" };
  if (now - Date.parse(batch.finished_at || batch.created_at) >= 48 * 3600000) return { label: "Base há mais de 48h", kind: "warning" };
  return { label: "Atualizada", kind: "success" };
}

export async function readStockOverview(client, user) {
  if (!canViewStockOverview(user)) throw new Error("Acesso não autorizado.");
  const result = await client.from("wms_warehouses").select("code,name").eq("active", true).order("code");
  if (result.error) throw result.error;
  const rows = [];
  const assigned = Array.isArray(user.allowedWarehouseCodes) ? user.allowedWarehouseCodes :
    String(user.allowedWarehouseCodes || user.defaultWarehouseCode || user.warehouseCode || "").split(",");
  const allowedCodes = assigned.map(code => String(code).trim().toUpperCase());
  const warehouses = (result.data || []).filter(row => user.isGlobalAdmin === true || allowedCodes.includes(row.code));
  // Exact server counts avoid loading tens of thousands of positions into the browser.
  for (const warehouse of warehouses) {
    const positions = source => client.from("wms_stock_positions").select("id", { count: "exact", head: true })
      .eq("warehouse_code", warehouse.code).eq("active", true).eq("source_type", source);
    const queries = [
      positions("CAPTACAO"),
      positions("LOJA"),
      positions("CAPTACAO").gt("total_disponivel", 0),
      positions("CAPTACAO").or("codigo_endereco.is.null,codigo_endereco.eq."),
      client.from("wms_transfers").select("id", { count: "exact", head: true }).eq("warehouse_code", warehouse.code)
        .eq("is_deleted", false).in("status", ["PENDENTE", "ATRIBUIDA", "AGUARDANDO_SEPARACAO", "EM_SEPARACAO", "SEPARACAO_CONCLUIDA", "EM_LACRE", "EM_MONTAGEM_CAIXA", "EM_CORRECAO", "CORRECAO_SOLICITADA", "CORRECAO_CONCLUIDA", "LACRE_CONCLUIDO", "MONTAGEM_CAIXA_CONCLUIDA"]),
      client.from("wms_stock_import_batches").select("id,source_type,status,created_at,finished_at,file_name,imported_rows")
        .eq("warehouse_code", warehouse.code).eq("archived", false).order("created_at", { ascending: false }).limit(20),
      client.from("wms_stock_import_batches").select("source_type,status,created_at,finished_at")
        .eq("warehouse_code", warehouse.code).eq("source_type", "CAPTACAO").eq("archived", false)
        .order("created_at", { ascending: false }).limit(1)
    ];
    const results = await Promise.allSettled(queries);
    const values = results.map(r => r.status === "fulfilled" && !r.value.error ? r.value : null);
    rows.push({ ...warehouse, counts: values.slice(0, 5).map(r => r?.count ?? null),
      imports: values[5]?.data || [], latest: values[6]?.data?.[0],
      errors: results.flatMap((r, i) => r.status === "rejected" || r.value.error ? [i] : []) });
  }
  return rows;
}

export function mountStockOverview({ root, client, getUser, openWarehouse }) {
  let rows = [];
  let revision = 0;
  root.innerHTML = `<div class="page-title"><div><p class="eyebrow">Administração</p><h2>Visão Geral dos Estoques</h2></div><button type="button" class="secondary-button" data-refresh>Atualizar</button></div>
    <div class="overview-toolbar"><label>Estoque<select data-warehouse><option value="">Todos os estoques</option></select></label><p data-updated role="status"></p></div>
    <p data-error role="alert" hidden></p><div data-summary class="overview-summary"></div>
    <section class="overview-band"><h3>Estoque e operação</h3><div data-warehouses class="overview-warehouses"></div></section>
    <section class="overview-band"><h3>Últimas importações</h3><div class="table-wrap"><table><thead><tr><th>Estoque</th><th>Data</th><th>Base</th><th>Arquivo</th><th>Registros</th><th>Status</th></tr></thead><tbody data-imports></tbody></table></div></section>`;
  const $ = selector => root.querySelector(selector);
  function render() {
    const selected = $("[data-warehouse]").value;
    const visible = rows.filter(r => !selected || r.code === selected);
    const total = index => visible.some(r => r.counts[index] == null) ? null : visible.reduce((n, r) => n + r.counts[index], 0);
    $("[data-summary]").innerHTML = [["Estoques", visible.length], ["Registros CAPTAÇÃO", total(0)], ["Registros Loja", total(1)], ["Transferências abertas", total(4)]]
      .map(([label, value]) => `<article><span>${label}</span><strong>${number(value)}</strong></article>`).join("");
    $("[data-warehouses]").innerHTML = visible.map(row => {
      const health = row.errors.length ? { label: "Consulta incompleta", kind: "error" } : importHealth(row.latest);
      return `<article class="overview-warehouse"><header><h4>${esc(row.code)} · ${esc(row.name)}</h4><span class="overview-state ${health.kind}">${health.label}</span></header>
        <dl>${["Registros CAPTAÇÃO", "Registros Loja", "Posições CAPTAÇÃO com saldo", "Posições CAPTAÇÃO sem endereço", "Transferências abertas"].map((label, i) => `<dt>${label}</dt><dd>${number(row.counts[i])}</dd>`).join("")}</dl>
        <p>Última CAPTAÇÃO: ${date(row.latest?.created_at)}</p><button type="button" class="secondary-button" data-open="${esc(row.code)}">Abrir estoque</button></article>`;
    }).join("") || "<p>Nenhum estoque disponível.</p>";
    $("[data-imports]").innerHTML = visible.flatMap(row => row.imports.map(batch => ({ ...batch, warehouse: row.code })))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 30)
      .map(batch => `<tr><td>${esc(batch.warehouse)}</td><td>${date(batch.created_at)}</td><td>${esc(batch.source_type)}</td><td>${esc(batch.file_name)}</td><td>${number(batch.imported_rows)}</td><td>${esc(statuses[batch.status] || batch.status)}</td></tr>`).join("") || '<tr><td colspan="6">Nenhuma importação disponível.</td></tr>';
  }
  async function refresh() {
    const ticket = ++revision;
    const user = getUser();
    rows = [];
    render();
    $("[data-refresh]").disabled = true;
    $("[data-error]").hidden = true;
    $("[data-updated]").textContent = "Carregando visão geral...";
    try {
      const next = await readStockOverview(client, user);
      if (ticket !== revision || getUser()?.id !== user.id || !canViewStockOverview(getUser())) return;
      rows = next;
      const selected = $("[data-warehouse]").value;
      $("[data-warehouse]").innerHTML = '<option value="">Todos os estoques</option>' + rows.map(r => `<option value="${esc(r.code)}">${esc(r.code)} · ${esc(r.name)}</option>`).join("");
      $("[data-warehouse]").value = rows.some(r => r.code === selected) ? selected : "";
      render();
      $("[data-updated]").textContent = "Atualizado em " + date(new Date().toISOString());
      if (rows.some(r => r.errors.length)) throw new Error("Alguns indicadores não puderam ser consultados. Atualize para tentar novamente.");
    } catch (error) {
      if (ticket !== revision || getUser()?.id !== user?.id) return;
      $("[data-error]").textContent = error.message || "Não foi possível consultar os estoques.";
      $("[data-error]").hidden = false;
      $("[data-updated]").textContent = "Atualização incompleta";
    } finally {
      if (ticket === revision) $("[data-refresh]").disabled = false;
    }
  }
  $("[data-refresh]").addEventListener("click", refresh);
  $("[data-warehouse]").addEventListener("change", render);
  root.addEventListener("click", async event => {
    const button = event.target.closest("[data-open]");
    if (!button || !canViewStockOverview(getUser())) return;
    try { await openWarehouse(button.dataset.open); }
    catch (error) { $("[data-error]").textContent = error.message; $("[data-error]").hidden = false; }
  });
  return { refresh };
}
