// Guarda de autenticação exclusiva do painel global CP ÁLAMO.
// A identidade exibida no aplicativo não substitui uma sessão Supabase válida.
export class CpAlamoSessionExpiredError extends Error {
  constructor() {
    super("Sua sessão expirou. Entre novamente para atualizar os dados.");
    this.name = "CpAlamoSessionExpiredError";
    this.code = "CP_ALAMO_SESSION_EXPIRED";
  }
}

export function isCpAlamoSessionExpiredError(error) {
  return error?.code === "CP_ALAMO_SESSION_EXPIRED";
}

export async function requireCpAlamoSession(client, user) {
  const expectedAuthId = user?.authUserId || user?.auth_user_id;
  if (!expectedAuthId || !client?.auth?.getSession) {
    throw new CpAlamoSessionExpiredError();
  }

  // getSession restaura/renova o token quando possível. Não fazemos
  // requisições operacionais com a chave anon após perder a sessão.
  const { data, error } = await client.auth.getSession();
  if (error) throw error;

  const session = data?.session;
  if (!session?.access_token || session.user?.id !== expectedAuthId) {
    throw new CpAlamoSessionExpiredError();
  }
  return session;
}
