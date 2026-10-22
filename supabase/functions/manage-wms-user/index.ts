import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import { maySupervisorManageStoreUser } from "./permissions.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function isDeliverableEmail(value: unknown) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.endsWith(".local");
}

function textValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizedIdentifier(value: unknown) {
  return textValue(value).replace(/\s+/g, "").toLowerCase();
}

function warehouseCodes(value: unknown, fallback: string) {
  const values = String(value || fallback || "")
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  return [...new Set(values.length ? values : [fallback].filter(Boolean))].join(",");
}

type AdminClient = ReturnType<typeof createClient>;

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message || fallback);
  }
  return fallback;
}

async function findAuthUserByEmail(adminClient: AdminClient, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const users = data?.users || [];
    const found = users.find((user) => String(user.email || "").toLowerCase() === normalizedEmail);
    if (found) return found;
    if (users.length < 1000) break;
  }
  return null;
}

async function ensureAuthIdentity({
  adminClient,
  authUserId,
  email,
  password,
  username,
  name
}: {
  adminClient: AdminClient;
  authUserId?: string | null;
  email: string;
  password?: string;
  username: string;
  name: string;
}) {
  let authUser = null;
  if (authUserId) {
    const { data, error } = await adminClient.auth.admin.getUserById(authUserId);
    if (!error && data?.user) authUser = data.user;
  }
  if (!authUser) authUser = await findAuthUserByEmail(adminClient, email);

  const attributes: Record<string, unknown> = {
    email,
    email_confirm: true,
    user_metadata: { username, name }
  };
  if (password) attributes.password = password;

  if (authUser) {
    const { data, error } = await adminClient.auth.admin.updateUserById(authUser.id, attributes);
    if (error || !data?.user) throw error || new Error("Falha ao atualizar a identidade Auth.");
    return { user: data.user, created: false };
  }

  if (!password) throw new Error("Defina uma senha temporaria para criar a identidade Auth deste usuario.");
  const { data, error } = await adminClient.auth.admin.createUser({ ...attributes, app_metadata: { wms: true } });
  if (error || !data?.user) throw error || new Error("Falha ao criar a identidade Auth.");
  return { user: data.user, created: true };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ ok: false, error: "Metodo nao permitido." }, 405);

  let action = "";
  try {

  const url = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const authorization = request.headers.get("Authorization") || "";
  if (!url || !anonKey || !serviceRoleKey) return json({ ok: false, error: "Configuracao de autenticacao incompleta." }, 500);

  const adminClient = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const body = await request.json().catch(() => ({}));
  action = String(body.action || "");

  if (action === "login-with-identifier") {
    const identifier = normalizedIdentifier(body.identifier);
    const password = String(body.password || "");
    if (!identifier || !password) return json({ ok: false, error: "Credenciais invalidas." }, 401);

    const { data: candidates, error: lookupError } = await adminClient.from("wms_users")
      .select("id,username,matricula,auth_email,active,archived");
    if (lookupError) throw lookupError;
    const target = (candidates || []).find((candidate) => {
      return candidate.active !== false
        && candidate.archived !== true
        && (normalizedIdentifier(candidate.username) === identifier || normalizedIdentifier(candidate.matricula) === identifier);
    });
    if (!target || !String(target.auth_email || "").includes("@")) {
      return json({ ok: false, error: "Credenciais invalidas." }, 401);
    }

    const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: loginData, error: loginError } = await authClient.auth.signInWithPassword({
      email: String(target.auth_email).toLowerCase(),
      password
    });
    if (loginError || !loginData.session) return json({ ok: false, error: "Credenciais invalidas." }, 401);
    return json({ ok: true, session: loginData.session, user: loginData.user });
  }

  if (!authorization) return json({ ok: false, error: "Sessao invalida." }, 401);

  const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const token = authorization.replace(/^Bearer\s+/i, "");
  const { data: callerData, error: callerError } = await callerClient.auth.getUser(token);
  if (callerError || !callerData.user) return json({ ok: false, error: "Sessao invalida." }, 401);

  const { data: callerProfile, error: profileError } = await adminClient
    .from("wms_users")
    .select("id,name,role,active,archived,is_global_admin,allowed_warehouse_codes,default_warehouse_code,auth_user_id,auth_email")
    .eq("auth_user_id", callerData.user.id)
    .maybeSingle();
  if (profileError || !callerProfile || !callerProfile.active || callerProfile.archived) return json({ ok: false, error: "Perfil sem permissao." }, 403);

  const allowed = String(callerProfile.allowed_warehouse_codes || callerProfile.default_warehouse_code || "")
    .split(",").map((item) => item.trim().toUpperCase()).filter(Boolean);
  const globalAdmin = callerProfile.role === "ADMINISTRADOR" && callerProfile.is_global_admin === true;

  if (action === "touch-login") {
    await adminClient.from("wms_users").update({ last_login_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", callerProfile.id);
    return json({ ok: true });
  }

  if (action === "complete-password-change") {
    await adminClient.from("wms_users").update({ must_change_password: false, updated_at: new Date().toISOString() }).eq("id", callerProfile.id);
    return json({ ok: true });
  }

  if (action === "set-own-recovery-email") {
    const email = textValue(body.email).toLowerCase();
    if (!isDeliverableEmail(email)) return json({ ok: false, error: "Informe um email real para recuperacao." }, 400);

    const { data: duplicate } = await adminClient.from("wms_users")
      .select("id")
      .eq("auth_email", email)
      .neq("id", callerProfile.id)
      .maybeSingle();
    if (duplicate) return json({ ok: false, error: "Este email ja esta vinculado a outro usuario." }, 409);

    const previousEmail = String(callerProfile.auth_email || "");
    const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(callerProfile.auth_user_id, {
      email,
      email_confirm: true
    });
    if (authUpdateError) return json({ ok: false, error: authUpdateError.message }, 400);

    const { error: profileUpdateError } = await adminClient.from("wms_users")
      .update({ auth_email: email, updated_at: new Date().toISOString() })
      .eq("id", callerProfile.id);
    if (profileUpdateError) {
      if (previousEmail) {
        await adminClient.auth.admin.updateUserById(callerProfile.auth_user_id, { email: previousEmail, email_confirm: true });
      }
      return json({ ok: false, error: profileUpdateError.message }, 400);
    }
    return json({ ok: true, email });
  }

  if (action === "create-user") {
    const profile = body.profile || {};
    const role = String(profile.role || "OPERADOR").toUpperCase();
    const warehouse = String(profile.default_warehouse_code || "").toUpperCase();
    const mayCreate = globalAdmin || maySupervisorManageStoreUser({
      callerRole: callerProfile.role,
      allowedWarehouses: allowed,
      nextRole: role,
      nextWarehouse: warehouse
    });
    if (!mayCreate) return json({ ok: false, error: "Sem permissao para criar este perfil." }, 403);
    if (String(body.temporaryPassword || "").length < 8) return json({ ok: false, error: "A senha temporaria deve ter ao menos 8 caracteres." }, 400);

    const username = textValue(profile.username || profile.matricula).toLowerCase();
    const email = textValue(profile.auth_email || profile.email).toLowerCase();
    if (!isDeliverableEmail(email)) return json({ ok: false, error: "Informe um email real de acesso e recuperacao." }, 400);
    const [{ data: duplicateUsername }, { data: duplicateEmail }] = await Promise.all([
      adminClient.from("wms_users").select("id").eq("username", username).maybeSingle(),
      adminClient.from("wms_users").select("id").eq("auth_email", email).maybeSingle()
    ]);
    if (duplicateUsername || duplicateEmail) {
      const duplicateField = duplicateUsername ? "matricula/usuario" : "email";
      return json({ ok: false, error: `Ja existe um colaborador com este ${duplicateField}. Edite o cadastro existente.` }, 409);
    }

    let identity;
    try {
      identity = await ensureAuthIdentity({
        adminClient,
        email,
        password: String(body.temporaryPassword),
        username,
        name: textValue(profile.name)
      });
    } catch (error) {
      return json({ ok: false, error: errorMessage(error, "Falha ao criar identidade Auth.") }, 400);
    }

    const now = new Date().toISOString();
    const isSupervisorCreation = !globalAdmin;
    const row: Record<string, unknown> = {
      id: String(profile.id || crypto.randomUUID()),
      name: textValue(profile.name),
      username,
      matricula: textValue(profile.matricula || username).toLowerCase(),
      role,
      profile: role,
      active: profile.active !== false,
      available_for_tasks: ["ATENDENTE", "COMPRAS"].includes(role) ? false : profile.available_for_tasks !== false,
      default_warehouse_id: textValue(profile.default_warehouse_id),
      default_warehouse_code: warehouse,
      warehouse_id: textValue(profile.warehouse_id || profile.default_warehouse_id),
      warehouse_code: warehouse,
      allowed_warehouse_codes: globalAdmin ? warehouseCodes(profile.allowed_warehouse_codes, warehouse) : warehouse,
      is_global_admin: role === "ADMINISTRADOR" && globalAdmin && profile.is_global_admin === true,
      supervisor_id: isSupervisorCreation ? callerProfile.id : textValue(profile.supervisor_id),
      supervisor_name: isSupervisorCreation ? callerProfile.name : textValue(profile.supervisor_name),
      archived: false,
      archived_at: null,
      archived_by_id: "",
      archived_by_name: "",
      last_login_at: null,
      auth_user_id: identity.user.id,
      auth_email: email,
      must_change_password: true,
      auth_migrated_at: now,
      created_at: now,
      updated_at: now,
      password_hash: ""
    };
    const { data: savedProfile, error: insertError } = await adminClient.from("wms_users").insert(row).select("id,default_warehouse_code,allowed_warehouse_codes").single();
    if (insertError) {
      if (identity.created) await adminClient.auth.admin.deleteUser(identity.user.id);
      return json({ ok: false, error: insertError.message }, 400);
    }
    if (!savedProfile || warehouseCodes(savedProfile.allowed_warehouse_codes, "").split(",").sort().join(",") !== warehouseCodes(row.allowed_warehouse_codes, "").split(",").sort().join(",") || savedProfile.default_warehouse_code !== warehouse) return json({ok:false,error:"Unidades selecionadas nao confirmadas no banco. Reabra o cadastro."},409);
    return json({ ok: true, userId: row.id, authUserId: identity.user.id, email, authRepaired: !identity.created, allowedWarehouseCodes: savedProfile.allowed_warehouse_codes });
  }

  if (action === "update-user") {
    const profile = body.profile || {};
    const { data: target, error: targetError } = await adminClient.from("wms_users")
      .select("id,auth_user_id,auth_email,role,default_warehouse_code,username,allowed_warehouse_codes")
      .eq("id", String(profile.id || "")).maybeSingle();
    if (targetError || !target) return json({ ok: false, error: "Usuario nao encontrado." }, 404);
    const nextRole = String(profile.role || target.role || "OPERADOR").toUpperCase();
    const nextWarehouse = String(profile.default_warehouse_code || target.default_warehouse_code || "").toUpperCase();
    const mayUpdate = globalAdmin || maySupervisorManageStoreUser({
      callerRole: callerProfile.role,
      allowedWarehouses: allowed,
      currentRole: target.role,
      currentWarehouse: String(target.default_warehouse_code || ""),
      nextRole,
      nextWarehouse
    });
    if (!mayUpdate) return json({ ok: false, error: "Sem permissao para alterar este perfil." }, 403);

    const username = String(profile.username || target.username || "").trim().toLowerCase();
    const email = textValue(profile.auth_email || target.auth_email).toLowerCase();
    if (!isDeliverableEmail(email)) return json({ ok: false, error: "Informe um email real de acesso e recuperacao." }, 400);
    if (body.temporaryPassword && String(body.temporaryPassword).length < 8) return json({ ok: false, error: "A senha temporaria deve ter ao menos 8 caracteres." }, 400);
    const [{ data: duplicateUsername }, { data: duplicateEmail }] = await Promise.all([
      adminClient.from("wms_users").select("id").eq("username", username).neq("id", target.id).maybeSingle(),
      adminClient.from("wms_users").select("id").eq("auth_email", email).neq("id", target.id).maybeSingle()
    ]);
    if (duplicateUsername || duplicateEmail) return json({ ok: false, error: "Matricula/usuario ou email ja vinculado a outro colaborador." }, 409);

    let identity;
    try {
      identity = await ensureAuthIdentity({
        adminClient,
        authUserId: target.auth_user_id,
        email,
        password: body.temporaryPassword ? String(body.temporaryPassword) : undefined,
        username,
        name: textValue(profile.name)
      });
    } catch (error) {
      return json({ ok: false, error: errorMessage(error, "Falha ao atualizar identidade Auth.") }, 400);
    }
    const updateRow: Record<string, unknown> = {
      name: textValue(profile.name),
      username,
      matricula: textValue(profile.matricula || username),
      role: nextRole,
      profile: nextRole,
      active: profile.active !== false,
      available_for_tasks: ["ATENDENTE", "COMPRAS"].includes(nextRole) ? false : profile.available_for_tasks !== false,
      default_warehouse_id: textValue(profile.default_warehouse_id),
      default_warehouse_code: nextWarehouse,
      warehouse_id: textValue(profile.warehouse_id || profile.default_warehouse_id),
      warehouse_code: nextWarehouse,
      allowed_warehouse_codes: globalAdmin
        ? warehouseCodes(profile.allowed_warehouse_codes ?? target.allowed_warehouse_codes, nextWarehouse)
        : nextWarehouse,
      is_global_admin: nextRole === "ADMINISTRADOR" && globalAdmin && profile.is_global_admin === true,
      supervisor_id: globalAdmin ? textValue(profile.supervisor_id) : callerProfile.id,
      supervisor_name: globalAdmin ? textValue(profile.supervisor_name) : callerProfile.name,
      auth_user_id: identity.user.id,
      auth_email: email,
      auth_migrated_at: new Date().toISOString(),
      must_change_password: body.temporaryPassword ? true : undefined,
      updated_at: new Date().toISOString()
    };
    if (Object.prototype.hasOwnProperty.call(profile, "archived")) {
      updateRow.archived = profile.archived === true;
      updateRow.archived_at = profile.archived === true ? (profile.archived_at || new Date().toISOString()) : null;
      updateRow.archived_by_id = profile.archived === true ? textValue(profile.archived_by_id || callerProfile.id) : "";
      updateRow.archived_by_name = profile.archived === true ? textValue(profile.archived_by_name || callerProfile.name) : "";
    }
    Object.keys(updateRow).forEach((key) => updateRow[key] === undefined && delete updateRow[key]);
    const { data: savedProfile, error: updateError } = await adminClient.from("wms_users").update(updateRow).eq("id", target.id).select("id,default_warehouse_code,allowed_warehouse_codes").single();
    if (updateError) return json({ ok: false, error: updateError.message }, 400);
    if (!savedProfile || warehouseCodes(savedProfile.allowed_warehouse_codes, "").split(",").sort().join(",") !== warehouseCodes(updateRow.allowed_warehouse_codes, "").split(",").sort().join(",") || savedProfile.default_warehouse_code !== nextWarehouse) return json({ok:false,error:"Unidades selecionadas nao confirmadas no banco. Reabra o cadastro."},409);
    return json({ ok: true, userId: target.id, authUserId: identity.user.id, email, allowedWarehouseCodes:savedProfile.allowed_warehouse_codes });
  }

  if (action === "reset-password") {
    if (!globalAdmin && callerProfile.role !== "SUPERVISOR") return json({ ok: false, error: "Sem permissao." }, 403);
    if (String(body.temporaryPassword || "").length < 8) return json({ ok: false, error: "A senha temporaria deve ter ao menos 8 caracteres." }, 400);
    const { data: target, error: targetError } = await adminClient.from("wms_users")
      .select("id,name,username,matricula,auth_user_id,auth_email,role,default_warehouse_code")
      .eq("id", String(body.userId || "")).maybeSingle();
    if (targetError || !target) return json({ ok: false, error: "Usuario nao encontrado." }, 404);
    if (!isDeliverableEmail(target.auth_email)) return json({ ok: false, error: "Cadastre um email real no usuario antes de redefinir a senha." }, 400);
    if (!globalAdmin && !maySupervisorManageStoreUser({
      callerRole: callerProfile.role,
      allowedWarehouses: allowed,
      currentRole: target.role,
      currentWarehouse: String(target.default_warehouse_code || ""),
      nextRole: target.role,
      nextWarehouse: String(target.default_warehouse_code || "")
    })) {
      return json({ ok: false, error: "Sem permissao para redefinir este usuario." }, 403);
    }
    let identity;
    try {
      identity = await ensureAuthIdentity({
        adminClient,
        authUserId: target.auth_user_id,
        email: String(target.auth_email).toLowerCase(),
        password: String(body.temporaryPassword),
        username: textValue(target.username || target.matricula).toLowerCase(),
        name: textValue(target.name)
      });
    } catch (error) {
      return json({ ok: false, error: errorMessage(error, "Falha ao redefinir a senha no Supabase Auth.") }, 400);
    }
    const { error: profileUpdateError } = await adminClient.from("wms_users").update({
      auth_user_id: identity.user.id,
      auth_migrated_at: new Date().toISOString(),
      must_change_password: true,
      updated_at: new Date().toISOString()
    }).eq("id", target.id);
    if (profileUpdateError) return json({ ok: false, error: profileUpdateError.message }, 400);
    return json({ ok: true, authUserId: identity.user.id, authRepaired: target.auth_user_id !== identity.user.id });
  }

  if (action === "delete-user") {
    if (!globalAdmin) return json({ ok: false, error: "Somente administrador global pode excluir usuarios." }, 403);
    const userId = String(body.userId || "");
    if (!userId || userId === callerProfile.id) return json({ ok: false, error: "Usuario invalido para exclusao." }, 400);
    const { data: target, error: targetError } = await adminClient.from("wms_users")
      .select("id,auth_user_id")
      .eq("id", userId)
      .maybeSingle();
    if (targetError || !target) return json({ ok: false, error: "Usuario nao encontrado." }, 404);

    const { error: deleteProfileError } = await adminClient.from("wms_users").delete().eq("id", target.id);
    if (deleteProfileError) return json({ ok: false, error: deleteProfileError.message }, 400);
    if (target.auth_user_id) {
      const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(target.auth_user_id);
      if (deleteAuthError) return json({ ok: false, error: deleteAuthError.message }, 400);
    }
    return json({ ok: true, userId: target.id });
  }

  return json({ ok: false, error: "Acao desconhecida." }, 400);
  } catch (error) {
    console.error(JSON.stringify({ action, error: errorMessage(error, "Erro interno inesperado.") }));
    return json({ ok: false, error: errorMessage(error, "Erro interno inesperado.") }, 500);
  }
});
