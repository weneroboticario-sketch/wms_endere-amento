# WMS Endereçamento

WMS multiestoque para endereçamento, consulta de SKU, transferências, reposição, conferência e base operacional. O frontend usa Vite e JavaScript; persistência, autenticação e tempo real usam Supabase.

## Requisitos

- Node.js 20.19 ou superior
- Projeto Supabase com Auth por senha habilitado
- Vercel para o deploy web

## Desenvolvimento

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

`npm run dev` escuta apenas localmente. Para testar em outro dispositivo da rede, use conscientemente `npm run dev:lan`.

## Variáveis

- `VITE_SUPABASE_URL`: URL pública do projeto.
- `VITE_SUPABASE_ANON_KEY`: chave publicável/anon, protegida por RLS.
- `VITE_AUTH_EMAIL_DOMAIN`: domínio sintético interno, padrão `wms.local`.
- `SUPABASE_SERVICE_ROLE_KEY`: usada somente pelo script local de provisionamento e pelo ambiente seguro da Edge Function. Nunca recebe prefixo `VITE_`.

A rota `/api/supabase-config` permanece disponível como fallback de configuração da Vercel. Variáveis Vite têm precedência.

## Banco e autenticação

As migrations oficiais ficam em [`supabase/migrations`](supabase/migrations). Consulte [`supabase/README.md`](supabase/README.md) para a ordem e [`docs/bootstrap-admin.md`](docs/bootstrap-admin.md) para vincular usuários existentes ao Supabase Auth.

O login recebe matrícula/usuário e a converte internamente em um e-mail sintético. A sessão é validada pelo Supabase Auth. `canAccessScreen` apenas organiza a interface; a autorização real é feita pelo RLS.

## Permissões

| Tela/ação | Operador | Supervisor | Administrador |
| --- | --- | --- | --- |
| Endereçamento e consultas | Estoque permitido | Estoque permitido | Todos os estoques |
| Transferências | Executa tarefas atribuídas | Opera e supervisiona o estoque | Controle global |
| Reposição | Opera fila do estoque | Supervisiona fila do estoque | Controle global |
| Base/importação/exportação | Estoque permitido | Estoque permitido | Todos os estoques |
| Etiquetas | Sim | Sim | Sim |
| Usuários | Não | Apenas operadores do próprio estoque | Todos os perfis |
| Estoques/configurações/manutenção | Não | Não | Administrador global |
| Saúde do sistema | Não | Não | Administrador global |

As policies também isolam VDCG, VDAR, VDSI e VDCO por `warehouse_code`.

## Qualidade

```powershell
npm run lint
npm test
npm run build
npm audit
```

Os testes SQL de RLS ficam em `supabase/tests/rls.sql` e devem ser executados em uma branch de banco ou ambiente local.

## Deploy na Vercel

1. Configure `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `VITE_AUTH_EMAIL_DOMAIN`.
2. Use `npm run build`; a saída é `dist`.
3. Aplique as migrations antes de publicar o frontend autenticado.
4. Faça deploy da Edge Function `manage-wms-user`.
5. Valide login, troca obrigatória de senha, isolamento por estoque e Realtime.

O `vercel.json` fornece CSP, proteção contra framing, `nosniff` e políticas restritivas de navegador. Não publique a pasta raiz como site estático: somente o build `dist` contém os módulos processados pelo Vite.

## Segurança

- Não há criação automática de administrador ou senha padrão.
- Hashes legados não são consultados pelo navegador.
- Solicitações públicas de acesso não armazenam senha.
- Chaves privilegiadas ficam fora do frontend.
- Dados dinâmicos são escapados e protegidos por DOMPurify/Trusted Types.
- Tabelas expostas usam RLS por perfil e estoque.
