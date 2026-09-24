# Bootstrap seguro do primeiro administrador

O navegador nunca cria administradores e nunca recebe a `service_role`.

1. Aplique as migrations em `supabase/migrations/` na ordem numérica.
2. No Supabase Auth, desative cadastro público por e-mail.
3. Configure localmente `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e, opcionalmente, `WMS_AUTH_EMAIL_DOMAIN`.
4. Execute `npm run auth:provision`. O comando vincula os perfis existentes ao Supabase Auth e mostra uma senha temporária por usuário somente no terminal.
5. Entregue cada senha por canal seguro. O primeiro login exige troca de senha.
6. Faça deploy da função com `npx supabase functions deploy manage-wms-user`.

Para uma instalação vazia, crie primeiro um usuário no painel Auth e depois insira o perfil correspondente em `wms_users`, preenchendo `auth_user_id`, perfil `ADMINISTRADOR`, `is_global_admin = true`, `active = true` e os estoques permitidos. Não use `admin/admin123`.

## Rate limit

Revise em **Authentication > Rate Limits** os limites de login por senha de acordo com o volume interno. O frontend exibe sempre a mesma mensagem para credenciais inválidas, usuário inativo, arquivado ou ainda não aprovado.
