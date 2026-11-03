import test from "node:test";
import assert from "node:assert/strict";
import {
  CpAlamoSessionExpiredError,
  isCpAlamoSessionExpiredError,
  requireCpAlamoSession
} from "../src/cpalamo-session-guard.js";
import { createGlobalDashboardService } from "../src/global-dashboard-service.js";

const user = {
  id: "profile-1",
  authUserId: "auth-1",
  username: "admin",
  role: "ADMINISTRADOR",
  defaultWarehouseCode: "DOURADOS",
  active: true,
  archived: false
};

function authClient(session, error = null) {
  let reads = 0;
  return {
    auth: {
      async getSession() {
        reads += 1;
        return { data: { session }, error };
      }
    },
    get reads() { return reads; }
  };
}

test("CP ÁLAMO aceita sessão válida do mesmo usuário", async () => {
  const session = { access_token: "token", user: { id: "auth-1" } };
  const client = authClient(session);
  assert.equal(await requireCpAlamoSession(client, user), session);
  assert.equal(client.reads, 1);
});

test("CP ÁLAMO bloqueia sessão ausente sem fazer consulta anon", async () => {
  const client = authClient(null);
  await assert.rejects(
    requireCpAlamoSession(client, user),
    error => error instanceof CpAlamoSessionExpiredError &&
      isCpAlamoSessionExpiredError(error)
  );
});

test("CP ÁLAMO rejeita sessão de outro usuário", async () => {
  const client = authClient({ access_token: "token", user: { id: "auth-2" } });
  await assert.rejects(requireCpAlamoSession(client, user), isCpAlamoSessionExpiredError);
});

test("CP ÁLAMO rejeita sessão sem access_token", async () => {
  const client = authClient({ user: { id: "auth-1" } });
  await assert.rejects(requireCpAlamoSession(client, user), isCpAlamoSessionExpiredError);
});

test("CP ÁLAMO preserva erros de rede do Auth para permitir nova tentativa", async () => {
  const failure = new Error("network timeout");
  const client = authClient(null, failure);
  await assert.rejects(requireCpAlamoSession(client, user), error => error === failure);
});

test("Visão Geral não acessa tabelas nem RPC com sessão expirada", async () => {
  let databaseRequests = 0;
  const client = {
    ...authClient(null),
    from() { databaseRequests += 1; throw new Error("não deveria consultar"); },
    rpc() { databaseRequests += 1; throw new Error("não deveria consultar"); }
  };
  const service = createGlobalDashboardService(client, () => user);
  await assert.rejects(service.getGlobalOverview(), isCpAlamoSessionExpiredError);
  assert.equal(databaseRequests, 0);
});

test("Consultas de detalhes também bloqueiam sessão expirada", async () => {
  let rpcCalls = 0;
  const client = {
    ...authClient(null),
    rpc() { rpcCalls += 1; throw new Error("não deveria consultar"); }
  };
  const service = createGlobalDashboardService(client, () => user);
  await assert.rejects(service.getGlobalTasks({}), isCpAlamoSessionExpiredError);
  assert.equal(rpcCalls, 0);
});
