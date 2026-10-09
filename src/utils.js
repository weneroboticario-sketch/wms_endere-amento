import DOMPurify from "dompurify";

export function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function randomId(prefix = "id") {
  const uuid = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${uuid}`;
}

export function sanitizeHtml(value) {
  const html = value === null || value === undefined ? "" : String(value);
  // Table fragments need a table parsing context, including under Trusted Types.
  const tag = /^\s*<(tr|td|th|thead|tbody|tfoot|colgroup|col)(?:\s|>)/i.exec(html)?.[1]?.toLowerCase();
  const wrappers = {
    tr: ["<table><tbody>", "</tbody></table>"],
    td: ["<table><tbody><tr>", "</tr></tbody></table>"],
    th: ["<table><tbody><tr>", "</tr></tbody></table>"],
    thead: ["<table>", "</table>"], tbody: ["<table>", "</table>"],
    tfoot: ["<table>", "</table>"], colgroup: ["<table>", "</table>"],
    col: ["<table><colgroup>", "</colgroup></table>"]
  };
  const wrapper = wrappers[tag];
  const clean = DOMPurify.sanitize(wrapper ? wrapper[0] + html + wrapper[1] : html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["script", "iframe", "object", "embed"],
    FORBID_ATTR: ["srcdoc"],
    // The default Trusted Types policy must return the sanitized string itself.
    // DOMPurify may otherwise return TrustedHTML and recursively invoke the
    // policy while dynamic WMS panels are being rendered.
    RETURN_TRUSTED_TYPE: false
  });
  if (!wrapper) return clean;
  const container = tag === "tr" ? "tbody" : ["td", "th"].includes(tag) ? "tr" : tag === "col" ? "colgroup" : "table";
  const start = clean.indexOf("<" + container + ">");
  const end = clean.lastIndexOf("</" + container + ">");
  return start >= 0 && end > start ? clean.slice(start + container.length + 2, end) : "";
}

export function installHtmlSecurity() {
  if (!window.trustedTypes || typeof window.trustedTypes.createPolicy !== "function") return false;
  try {
    window.trustedTypes.createPolicy("default", {
      createHTML: function (value) { return sanitizeHtml(value); },
      createScript: function () { throw new TypeError("Scripts dinamicos nao sao permitidos."); },
      createScriptURL: function () { throw new TypeError("URLs de script dinamicas nao sao permitidas."); }
    });
    return true;
  } catch (error) {
    console.warn("A politica Trusted Types ja existe ou nao pode ser instalada:", error);
    return false;
  }
}
