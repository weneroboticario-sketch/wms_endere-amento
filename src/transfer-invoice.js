import { escapeHtml as e } from "./utils.js";
import "./transfer-invoice.css";

let xmlPolicy;
export function parseTransferInvoice(text, Parser = globalThis.DOMParser) {
  if (typeof text !== "string" || !text.trim() || text.length > 5 * 1024 * 1024) throw new Error("Selecione um XML de até 5 MB.");
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error("XML com entidades externas não é permitido.");
  let input = text;
  if (globalThis.trustedTypes?.createPolicy) {
    xmlPolicy ||= globalThis.trustedTypes.createPolicy("wms-transfer-invoice", { createHTML: value => value });
    input = xmlPolicy.createHTML(text);
  }
  const doc = new Parser().parseFromString(input, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("XML inválido.");
  const node = (parent, tag) => parent?.getElementsByTagNameNS("*", tag)[0];
  const value = (parent, tag) => node(parent, tag)?.textContent.trim() || "";
  const info = node(doc, "infNFe"), ide = node(info, "ide"), dest = node(info, "dest");
  const key = (info?.getAttribute("Id") || "").replace(/^NFe/, "");
  const number = value(ide, "nNF");
  if (!info || !/^\d{44}$/.test(key) || !/^\d{1,9}$/.test(number)) throw new Error("O XML deve conter uma NF-e com número e chave válidos.");
  return { number, key, destination: value(dest, "CNPJ"), destinationName: value(dest, "xNome") };
}

export function createTransferInvoiceController(context) {
  let generation = 0, dialog;
  const table = () => document.getElementById("finalizedTransferRows");
  const metadata = "transfer_id,invoice_number,invoice_key,file_name,created_at,created_by_name";
  function errorMessage(error) { return error?.message || "Não foi possível registrar a NF."; }
  async function decorate() {
    const root = table(); if (!root) return;
    const current = ++generation, buttons = [...root.querySelectorAll("[data-transfer-invoice]")];
    const ids = buttons.map(button => button.dataset.transferInvoice); if (!ids.length) return;
    const result = await context.client().from("wms_transfer_invoices").select(metadata).in("transfer_id", ids);
    if (current !== generation) return;
    if (result.error) { buttons.forEach(button => { button.title = errorMessage(result.error); }); return; }
    for (const row of result.data || []) {
      const button = buttons.find(button => button.dataset.transferInvoice === row.transfer_id);
      if (!button?.isConnected) continue;
      button.textContent = `NF ${row.invoice_number} · XML`;
      const tr = button.closest("tr");
      tr.querySelectorAll("[data-transfer-revalidate]").forEach(action => { action.hidden = true; });
    }
  }
  async function open(id) {
    const transfer = context.transfer(id); if (!transfer || !context.allowed()) return;
    const actor = context.actor?.();
    if (dialog?.open) return;
    dialog?.remove(); dialog = document.createElement("dialog"); dialog.className = "transfer-invoice-dialog";
    dialog.innerHTML = `<header><h3>Nota fiscal da transferência</h3><button type="button" class="secondary-button" data-close>Fechar</button></header><p>${e(transfer.name || transfer.code || id)}</p><p role="alert" data-error></p><div data-body>Carregando...</div>`;
    document.body.append(dialog); const ownDialog = dialog;
    const $ = selector => ownDialog.querySelector(selector);
    $("[data-close]").onclick = () => ownDialog.close();
    const sessionCheck = window.setInterval(() => { if (!context.allowed() || context.actor?.() !== actor) ownDialog.close(); }, 300);
    ownDialog.addEventListener("close", () => { window.clearInterval(sessionCheck); ownDialog.remove(); }, { once: true }); ownDialog.showModal();
    try {
      const result = await context.client().from("wms_transfer_invoices").select(metadata).eq("transfer_id", id).maybeSingle();
      if (result.error) throw result.error; if (!ownDialog.open) return;
      if (result.data) {
        const row = result.data;
        $("[data-body]").innerHTML = `<dl><dt>Número da NF</dt><dd>${e(row.invoice_number)}</dd><dt>Chave</dt><dd>${e(row.invoice_key)}</dd><dt>Concluída por</dt><dd>${e(row.created_by_name)}</dd><dt>Data</dt><dd>${e(new Date(row.created_at).toLocaleString("pt-BR"))}</dd></dl><button type="button" class="primary-button" data-download>Baixar XML</button>`;
        $("[data-download]").onclick = async () => {
          const button = $("[data-download]"); button.disabled = true;
          try {
            const file = await context.client().from("wms_transfer_invoices").select("xml_content").eq("transfer_id", id).single();
            if (file.error) throw file.error;
            const url = URL.createObjectURL(new Blob([file.data.xml_content], { type: "application/xml" }));
            const link = document.createElement("a"); link.href = url; link.download = `NF_${row.invoice_number}.xml`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
          } catch (error) { $("[data-error]").textContent = errorMessage(error); }
          finally { button.disabled = false; }
        }; return;
      }
      $("[data-body]").innerHTML = `<form><label>XML da NF-e<input type="file" data-file accept=".xml,application/xml,text/xml" required></label><dl data-preview hidden></dl><label class="invoice-confirm"><input type="checkbox" data-confirm required> NF emitida e transferência concluída</label><button type="submit" class="primary-button" data-save disabled>Registrar NF e concluir</button></form>`;
      let xml = "", fileName = "", busy = false, selection = 0;
      $("[data-file]").onchange = async () => {
        const version = ++selection; xml = ""; $("[data-save]").disabled = true; $("[data-preview]").hidden = true; $("[data-confirm]").checked = false; $("[data-error]").textContent = "";
        try {
          const file = $("[data-file]").files[0]; if (!file) return;
          if (file.size > 5 * 1024 * 1024 || !/\.xml$/i.test(file.name)) throw new Error("Selecione um XML de até 5 MB.");
          const text = await file.text(); if (version !== selection) return;
          const invoice = parseTransferInvoice(text);
          const destination = String(transfer.destinationCnpj || transfer.establishmentCnpj || "").replace(/\D/g, "");
          if (destination && destination !== invoice.destination) throw new Error("O destinatário da NF não corresponde ao da transferência.");
          xml = text; fileName = file.name;
          $("[data-preview]").innerHTML = `<dt>Número da NF</dt><dd>${e(invoice.number)}</dd><dt>Destinatário</dt><dd>${e(invoice.destinationName || invoice.destination || "Não informado")}</dd><dt>Chave</dt><dd>${e(invoice.key)}</dd>`;
          $("[data-preview]").hidden = false; $("[data-save]").disabled = false;
        } catch (error) { $("[data-error]").textContent = errorMessage(error); }
      };
      $("form").onsubmit = async event => {
        event.preventDefault(); if (busy || !xml || !$("[data-confirm]").checked || !context.allowed() || context.actor?.() !== actor) return;
        busy = true; $("[data-save]").disabled = true; $("[data-file]").disabled = true;
        $("[data-close]").disabled = true; ownDialog.oncancel = event => event.preventDefault();
        try {
          const saved = await context.client().from("wms_transfer_invoices").insert({ transfer_id: id, warehouse_code: transfer.warehouseCode, xml_content: xml, file_name: fileName });
          if (saved.error) throw saved.error;
          ownDialog.close(); await context.refresh();
        } catch (error) { $("[data-error]").textContent = errorMessage(error); }
        finally { busy = false; $("[data-save]") && ($("[data-save]").disabled = false); $("[data-file]") && ($("[data-file]").disabled = false); $("[data-close]").disabled = false; ownDialog.oncancel = null; }
      };
    } catch (error) { $("[data-error]").textContent = errorMessage(error); $("[data-body]").textContent = ""; }
  }
  return { open, decorate };
}
