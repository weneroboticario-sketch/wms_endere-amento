import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const domain = String(process.env.WMS_AUTH_EMAIL_DOMAIN || "wms.local").toLowerCase();
if (!url || !serviceRoleKey) throw new Error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY apenas no ambiente local.");

const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function fetchPendingProfiles() {
  const rows = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.from("wms_users")
      .select("id,name,username,matricula,auth_user_id,active,archived")
      .is("auth_user_id", null)
      .order("created_at", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

async function fetchAuthUsersByEmail() {
  const users = new Map();
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    for (const user of data.users || []) {
      if (user.email) users.set(user.email.toLowerCase(), user);
    }
    if (!data.users || data.users.length < perPage) return users;
  }
}

const profiles = await fetchPendingProfiles();
const authUsersByEmail = await fetchAuthUsersByEmail();

const credentials = [];
for (const profile of profiles || []) {
  const username = String(profile.username || profile.matricula || "").trim().toLowerCase();
  if (!username) continue;
  const email = `${username.replace(/[^a-z0-9._+-]/g, "-")}@${domain}`;
  const temporaryPassword = `Wms!${randomBytes(12).toString("base64url")}`;
  let authUser = authUsersByEmail.get(email);
  if (authUser) {
    const { data, error: updateAuthError } = await client.auth.admin.updateUserById(authUser.id, {
      password: temporaryPassword,
      email_confirm: true,
      app_metadata: { ...authUser.app_metadata, wms: true },
      user_metadata: { ...authUser.user_metadata, username, name: profile.name || "" }
    });
    if (updateAuthError || !data.user) throw updateAuthError || new Error(`Falha ao atualizar ${username}`);
    authUser = data.user;
  } else {
    const { data, error: createError } = await client.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      app_metadata: { wms: true },
      user_metadata: { username, name: profile.name || "" }
    });
    if (createError || !data.user) throw createError || new Error(`Falha ao criar ${username}`);
    authUser = data.user;
    authUsersByEmail.set(email, authUser);
  }
  const { error: updateError } = await client.from("wms_users").update({
    auth_user_id: authUser.id,
    auth_email: email,
    must_change_password: true,
    auth_migrated_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).eq("id", profile.id);
  if (updateError) {
    throw updateError;
  }
  credentials.push({ username, name: profile.name, temporaryPassword });
}

console.table(credentials);
console.log(`Provisionados ${credentials.length} usuario(s). Entregue as senhas temporarias por canal seguro e nao salve esta saida no repositorio.`);
