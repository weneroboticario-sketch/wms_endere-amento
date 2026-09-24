const DEFAULT_AUTH_DOMAIN = "wms.local";

export function normalizeAuthIdentifier(value) {
  return String(value || "").replace(/\s+/g, "").trim().toLowerCase();
}

export function syntheticEmailFor(identifier, domain) {
  const normalized = normalizeAuthIdentifier(identifier);
  if (!normalized) return "";
  if (normalized.includes("@")) return normalized;
  const safeLocalPart = normalized.replace(/[^a-z0-9._+-]/g, "-");
  return `${safeLocalPart}@${String(domain || DEFAULT_AUTH_DOMAIN).trim().toLowerCase()}`;
}

export async function signInWithUsername(client, username, password, domain) {
  return client.auth.signInWithPassword({
    email: syntheticEmailFor(username, domain),
    password: String(password || "")
  });
}

export async function getCurrentAuthSession(client) {
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session || null;
}

export async function signOutAuthSession(client) {
  const { error } = await client.auth.signOut({ scope: "local" });
  if (error) throw error;
}

export async function changeOwnPassword(client, password) {
  const { data, error } = await client.auth.updateUser({ password: String(password || "") });
  if (error) throw error;
  return data.user;
}

export async function invokeUserAdministration(client, payload) {
  const { data, error } = await client.functions.invoke("manage-wms-user", { body: payload });
  if (error) throw error;
  if (!data || data.ok !== true) throw new Error((data && data.error) || "Falha ao administrar usuario.");
  return data;
}

export const AUTH_EMAIL_DOMAIN = String((import.meta.env && import.meta.env.VITE_AUTH_EMAIL_DOMAIN) || DEFAULT_AUTH_DOMAIN).trim().toLowerCase();
