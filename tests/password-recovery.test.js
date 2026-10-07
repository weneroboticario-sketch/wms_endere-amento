import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  isDeliverableRecoveryEmail,
  normalizeRecoveryEmail,
  requestPasswordRecovery
} from "../src/auth.js";

const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
const script = await readFile(new URL("../script.js", import.meta.url), "utf8");
const edgeFunction = await readFile(new URL("../supabase/functions/manage-wms-user/index.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20261007010406_email_password_recovery.sql", import.meta.url), "utf8");

test("recovery email normalization accepts real addresses and rejects synthetic ones", () => {
  assert.equal(normalizeRecoveryEmail("  Colaborador@Empresa.COM.BR "), "colaborador@empresa.com.br");
  assert.equal(isDeliverableRecoveryEmail("colaborador@empresa.com.br"), true);
  assert.equal(isDeliverableRecoveryEmail("matricula@wms.local"), false);
  assert.equal(isDeliverableRecoveryEmail("sem-email"), false);
});

test("password recovery uses the normalized email and isolated redirect URL", async () => {
  const calls = [];
  const client = {
    auth: {
      resetPasswordForEmail: async (email, options) => {
        calls.push({ email, options });
        return { data: { ok: true }, error: null };
      }
    }
  };

  await requestPasswordRecovery(client, " Usuario@Empresa.com ", "https://wms-endere-amento.vercel.app/?password-recovery=1");
  assert.deepEqual(calls, [{
    email: "usuario@empresa.com",
    options: { redirectTo: "https://wms-endere-amento.vercel.app/?password-recovery=1" }
  }]);
});

test("registration and access request require a recovery email", () => {
  assert.match(index, /id="userAuthEmailInput"[^>]*type="email"[^>]*required/);
  assert.match(index, /id="requestEmailInput"[^>]*type="email"[^>]*required/);
  assert.match(index, /id="forgotPasswordButton"/);
  assert.match(index, /id="passwordRecoveryModal"/);
  assert.match(script, /event !== "PASSWORD_RECOVERY"/);
  assert.match(script, /await changeOwnPassword\(supabaseDb, password\)/);
});

test("user administration rejects fake emails and stores the real address", () => {
  assert.match(edgeFunction, /if \(!isDeliverableEmail\(email\)\)/);
  assert.match(edgeFunction, /email_confirm: true/);
  assert.match(edgeFunction, /auth_email: email/);
  assert.doesNotMatch(edgeFunction, /WMS_AUTH_EMAIL_DOMAIN/);
});

test("access request migration exposes and validates the email column", () => {
  assert.match(migration, /add column if not exists email text not null default ''/);
  assert.match(migration, /grant insert \(email\) on public\.wms_access_requests to anon/);
  assert.match(migration, /email !~\* '\\\.local\$'/);
  assert.match(migration, /notify pgrst, 'reload schema'/);
});
