import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { renderWhatsAppAssistedLive } from "../src/whatsapp-assisted-live.js";

class TestElement {
  constructor(tag) {
    this.tag = tag; this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = {};
    this.textContent = ""; this.value = ""; this.hidden = false;
  }
  get isConnected() { return this.root === true || !!this.parent?.isConnected; }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  prepend(node) { node.parent = this; this.children.unshift(node); }
  insertBefore(node, reference) { node.parent = this; this.children.splice(this.children.indexOf(reference),0,node); }
  remove() { this.parent.children = this.parent.children.filter(node => node !== this); this.parent = null; }
  replaceChildren(...nodes) { this.children.forEach(node => { node.parent = null; }); this.children = []; this.append(...nodes); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  scrollIntoView() { this.scrolled = true; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const matches = node => selector.split(",").some(part => {
      const attribute = part.match(/^\[data-(.+)\]$/);
      if (attribute) return Object.hasOwn(node.dataset, attribute[1].replace(/-([a-z])/g, (match, letter) => letter.toUpperCase()));
      return part === node.tag;
    });
    return this.children.flatMap(node => [...(matches(node) ? [node] : []), ...node.querySelectorAll(selector)]);
  }
}

async function fixture(run) {
  const oldDocument = globalThis.document;
  const calls = [];
  globalThis.document = { createElement: tag => new TestElement(tag) };
  try {
    const host = new TestElement("main"); host.root = true;
    const client = {
      rpc: async (name,payload) => { calls.push({ name,payload }); return { data: payload.request_key }; },
      from(table) {
        const query = { then(resolve,reject) { return Promise.resolve({ data: table === "wms_assisted_settings" ? [{ intake_enabled:true }] : [] }).then(resolve,reject); } };
        for (const method of ["select","eq","order","limit","range","in","is","not"]) query[method] = () => query;
        return query;
      }
    };
    renderWhatsAppAssistedLive(host, { allowed:true,warehouse:"VDCG",actor:"synthetic-admin",supervisor:true,users:[],client,isCurrent:()=>true });
    await setImmediate();
    const button = text => host.querySelectorAll("button").find(node => node.textContent === text);
    const click = async text => { await button(text).listeners.click(); await setImmediate(); };
    await run({ host,calls,click });
  } finally { globalThis.document = oldDocument; }
}

test("approval errors identify the invalid line beside the button and cannot clear an unsent message", async () => {
  await fixture(async ({ host,calls,click }) => {
    const raw = host.querySelector("textarea");
    raw.value = "54150 Produto de teste 1 UN\n54150 Produto de teste sem quantidade";
    const original = raw.value;
    await click("Interpretar mensagem");
    host.querySelectorAll("input").find(node => node.type === "checkbox").checked = true;
    await click("Aprovar e criar tarefas");
    const notices = host.querySelectorAll("[data-assisted-feedback]").filter(node => !node.hidden);
    assert.match(notices[0].textContent,/Linha 2, SKU 54150/);
    assert.equal(notices[0].scrolled,true);
    assert.equal(calls.length,0);
    await click("Conferir aprovação anterior e liberar nova mensagem");
    assert.equal(raw.value,original);
    assert.equal(host.querySelectorAll("fieldset").length,2);
    assert.equal(calls.length,0);
  });
});

test("formatted quantity goes through the real UI approval handler as two separate reviewed lines", async () => {
  await fixture(async ({ host,calls,click }) => {
    const raw = host.querySelector("textarea");
    raw.value = "54150 Produto de teste 250ml 1 UNID CLIE\n54150 Produto de teste 250ml *1* UNI CLIENTE";
    await click("Interpretar mensagem");
    host.querySelectorAll("input").find(node => node.type === "checkbox").checked = true;
    await click("Aprovar e criar tarefas");
    assert.equal(calls.length,1);
    assert.equal(calls[0].name,"approve_whatsapp_assisted_request");
    assert.deepEqual(calls[0].payload.reviewed_items.map(line => line.quantity),[1,1]);
    assert.equal(raw.value,"");
  });
});
