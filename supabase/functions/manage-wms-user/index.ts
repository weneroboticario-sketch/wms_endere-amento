import { createClient } from "npm:@supabase/supabase-js@2";

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

function authEmail(username: string, domain: string) {
  const local = String(username || "").trim().toLowerCase().replace(/[^a-z0-9._+-]/g, "-");
  if (!local) throw new Error("Matricula/usuario obrigatorio.");
  return `${local}@${domain}`;
}

function textValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function warehouseCodes(value: unknown, fallback: string) {
  const values = String(value || fallback || "")
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  return [...new Set(values.length ? values : [fallback].filter(Boolean))].join(",");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ ok: false, error: "Metodo nao permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const domain = (Deno.env.get("WMS_AUTH_EMAIL_DOMAIN") || "wms.local").toLowerCase();
  const authorization = request.headers.get("Authorization") || "";
  if (!url || !anonKey || !serviceRoleKey || !authorization) return json({ ok: false, error: "Configuracao de autenticacao incompleta." }, 500);

  const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const adminClient = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = authorization.replace(/^Bearer\s+/i, "");
  const { data: callerData, error: callerError } = await callerClient.auth.getUser(token);
  if (callerError || !callerData.user) return json({ ok: false, error: "Sessao invalida." }, 401);

  const { data: callerProfile, error: profileError } = await adminClient
    .from("wms_users")
    .select("id,name,role,active,archived,is_global_admin,allowed_warehouse_codes,default_warehouse_code")
    .eq("auth_user_id", callerData.user.id)
    .maybeSingle();
  if (profileError || !callerProfile || !callerProfile.active || callerProfile.archived) return json({ ok: false, error: "Perfil sem permissao." }, 403);

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "");
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

  if (action === "create-user") {
    const profile = body.profile || {};
    const role = String(profile.role || "OPERADOR").toUpperCase();
    const warehouse = String(profile.default_warehouse_code || "").toUpperCase();
    const mayCreate = globalAdmin || (callerProfile.role === "SUPERVISOR" && role === "OPERADOR" && allowed.includes(warehouse));
    if (!mayCreate) return json({ ok: false, error: "Sem permissao para criar este perfil." }, 403);
    if (String(body.temporaryPassword || "").length < 8) return json({ ok: false, error: "A senha temporaria deve ter ao menos 8 caracteres." }, 400);

    const email = authEmail(String(profile.username || profile.matricula || ""), domain);
    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: String(body.temporaryPassword),
      email_confirm: true,
      app_metadata: { wms: true },
      user_metadata: { username: String(profile.username || ""), name: String(profile.name || "") }
    });
    if (createError || !created.user) return json({ ok: false, error: createError?.message || "Falha ao criar identidade." }, 400);

    const now = new Date().toISOString();
    const isSupervisorCreation = !globalAdmin;
    const row: Record<string, unknown> = {
      id: String(profile.id || crypto.randomUUID()),
      name: textValue(profile.name),
      username: textValue(profile.username || profile.matricula),
      matricula: textValue(profile.matricula || profile.username),
      role,
      profile: role,
      active: profile.active !== false,
      available_for_tasks: profile.available_for_tasks !== false,
      default_warehouse_id: textValue(profile.default_warehouse_id),
      default_warehouse_code: warehouse,
      warehouse_id: textValue(profile.warehouse_id || profile.default_warehouse_id),
      warehouse_code: warehouse,
      allowed_warehouse_codes: isSupervisorCreation ? warehouse : warehouseCodes(profile.allowed_warehouse_codes, warehouse),
      is_global_admin: globalAdmin && profile.is_global_admin === true,
      supervisor_id: isSupervisorCreation ? callerProfile.id : textValue(profile.supervisor_id),
      supervisor_name: isSupervisorCreation ? callerProfile.name : textValue(profile.supervisor_name),
      archived: false,
      archived_at: null,
      archived_by_id: "",
      archived_by_name: "",
      last_login_at: null,
      auth_user_id: created.user.id,
      auth_email: email,
      must_change_password: true,
      auth_migrated_at: now,
      created_at: now,
      updated_at: now,
      password_hash: ""
    };
    const { error: insertError } = await adminClient.from("wms_users").insert(row);
    if (insertError) {
      await adminClient.auth.admin.deleteUser(created.user.id);
      return json({ ok: false, error: insertError.message }, 400);
    }
    return json({ ok: true, userId: row.id, authUserId: created.user.id, email });
  }

  if (action === "update-user") {
    const profile = body.profile || {};
    const { data: target, error: targetError } = await adminClient.from("wms_users")
      .select("id,auth_user_id,role,default_warehouse_code,username")
      .eq("id", String(profile.id || "")).maybeSingle();
    if (targetError || !target) return json({ ok: false, error: "Usuario nao encontrado." }, 404);
    const nextRole = String(profile.role || target.role || "OPERADOR").toUpperCase();
    const nextWarehouse = String(profile.default_warehouse_code || target.default_warehouse_code || "").toUpperCase();
    const mayUpdate = globalAdmin || (
      callerProfile.role === "SUPERVISOR"
      && target.role === "OPERADOR"
      && nextRole === "OPERADOR"
      && allowed.includes(String(target.default_warehouse_code || "").toUpperCase())
      && allowed.includes(nextWarehouse)
    );
    if (!mayUpdate) return json({ ok: false, error: "Sem permissao para alterar este perfil." }, 403);

    const username = String(profile.username || target.username || "");
    const email = authEmail(username, domain);
    if (target.auth_user_id) {
      const authPatch: Record<string, unknown> = { email, email_confirm: true, user_metadata: { username, name: String(profile.name || "") } };
      if (body.temporaryPassword) {
        if (String(body.temporaryPassword).length < 8) return json({ ok: false, error: "A senha temporaria deve ter ao menos 8 caracteres." }, 400);
        authPatch.password = String(body.temporaryPassword);
      }
      const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(target.auth_user_id, authPatch);
      if (authUpdateError) return json({ ok: false, error: authUpdateError.message }, 400);
    }
    const updateRow: Record<string, unknown> = {
      name: textValue(profile.name),
      username,
      matricula: textValue(profile.matricula || username),
      role: nextRole,
      profile: nextRole,
      active: profile.active !== false,
      available_for_tasks: profile.available_for_tasks !== false,
      default_warehouse_id: textValue(profile.default_warehouse_id),
      default_warehouse_code: nextWarehouse,
      warehouse_id: textValue(profile.warehouse_id || profile.default_warehouse_id),
      warehouse_code: nextWarehouse,
      allowed_warehouse_codes: globalAdmin
        ? warehouseCodes(profile.allowed_warehouse_codes, nextWarehouse)
        : nextWarehouse,
      is_global_admin: globalAdmin && profile.is_global_admin === true,
      supervisor_id: globalAdmin ? textValue(profile.supervisor_id) : callerProfile.id,
      supervisor_name: globalAdmin ? textValue(profile.supervisor_name) : callerProfile.name,
      auth_email: email,
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
    const { error: updateError } = await adminClient.from("wms_users").update(updateRow).eq("id", target.id);
    if (updateError) return json({ ok: false, error: updateError.message }, 400);
    return json({ ok: true, userId: target.id, email });
  }

  if (action === "reset-password") {
    if (!globalAdmin && callerProfile.role !== "SUPERVISOR") return json({ ok: false, error: "Sem permissao." }, 403);
    if (String(body.temporaryPassword || "").length < 8) return json({ ok: false, error: "A senha temporaria deve ter ao menos 8 caracteres." }, 400);
    const { data: target, error: targetError } = await adminClient.from("wms_users")
      .select("id,auth_user_id,role,default_warehouse_code")
      .eq("id", String(body.userId || "")).maybeSingle();
    if (targetError || !target?.auth_user_id) return json({ ok: false, error: "Usuario sem identidade Auth vinculada." }, 404);
    if (!globalAdmin && (target.role !== "OPERADOR" || !allowed.includes(String(target.default_warehouse_code || "").toUpperCase()))) {
      return json({ ok: false, error: "Sem permissao para redefinir este usuario." }, 403);
    }
    const { error: resetError } = await adminClient.auth.admin.updateUserById(target.auth_user_id, { password: String(body.temporaryPassword) });
    if (resetError) return json({ ok: false, error: resetError.message }, 400);
    await adminClient.from("wms_users").update({ must_change_password: true, updated_at: new Date().toISOString() }).eq("id", target.id);
    return json({ ok: true });
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
});
