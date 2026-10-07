# Recuperação de senha por e-mail

## Objetivo

Todos os novos colaboradores devem ter um e-mail real e exclusivo no cadastro. Esse e-mail passa a ser o identificador de acesso no Supabase Auth e o destino do link de recuperação de senha.

## Aplicação

1. Aplicar a migration `20261007010406_email_password_recovery.sql`.
2. Publicar a Edge Function `manage-wms-user`.
3. Configurar no Supabase Auth a URL do sistema como URL permitida de redirecionamento.
4. Publicar o front-end.

Para este sistema, o retorno autorizado é:

`https://wms-endere-amento.vercel.app/?password-recovery=1`

## Usuários existentes

Contas antigas que ainda usam um endereço técnico terminado em `@wms.local` continuam funcionando, mas não podem receber e-mail. Um administrador deve editar cada colaborador e informar um e-mail real. Depois dessa atualização, o colaborador entra usando o e-mail cadastrado e pode usar **Esqueci minha senha**.

## Isolamento

O link deste ambiente retorna somente para o WMS Estoque. O WMS Dourados possui banco, configuração de Auth, Edge Function e endereço de retorno próprios.

## Entrega de e-mail

Em produção, configure SMTP próprio no Supabase para evitar as limitações do provedor padrão e garantir entrega para todos os colaboradores.
