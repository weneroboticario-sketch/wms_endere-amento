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
  return DOMPurify.sanitize(value === null || value === undefined ? "" : String(value), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["script", "iframe", "object", "embed"],
    FORBID_ATTR: ["srcdoc"]
  });
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
