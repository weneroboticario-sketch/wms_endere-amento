# Comunicação — implantação e validação

Base inicial: produção WMS `0edc8a43c149e059b052fbef7369253397faa77b`. Atualizada antes da prévia para a produção `d3099c7b4d02c5b3c124b21771a38c220955b2ea`, preservando a câmera de prateleira.
Branch: `feat/wms-communication-20261111`. Não publicar no CP Álamo.

## Publicação em 12/11/2026

Autorização explícita do responsável: aplicar as duas migrations no WMS de produção, publicar a Comunicação e configurar push usando validação local, sem homologação externa.

- Frontend publicado no WMS em `0fe2eddde38ff0ad34bb2e40dcc117d36119c1e9`, deployment `dpl_EdsCNMYSQuXVwED5tuyfu8hgD6aQ`, estado READY. Produção anterior `d3099c7` preservada como base. Nenhum deploy de produção do CP Álamo.
- As duas migrations foram aplicadas no projeto `bzqulgdtfpcmkyaldssy`. Os nomes locais foram alinhados às versões efetivamente registradas pelo Supabase, sem alterar o SQL, para evitar reaplicação futura.
- Edge Function `wms-communication` ACTIVE, versão 1. Chamada sem sessão retorna 401 e CORS da origem WMS.
- Treze tabelas com RLS, bucket privado de 5 MB e três tabelas na publicação Realtime confirmados no banco real. As quatro tabelas de política/outbox/inscrições/entregas negam acesso direto do cliente por desenho; não recebem políticas permissivas para eliminar avisos informativos do advisor.
- Consultas às RPCs validadas com o papel authenticated e contexto dos cinco perfis existentes: ADMINISTRADOR, SUPERVISOR, OPERADOR, ATENDENTE e CAIXA.
- Envio, repetição idempotente, não lidas e leitura validados dentro de transação revertida. Após o rollback: zero conversas, mensagens e outbox de teste; nenhuma notificação externa foi enviada. Esse ensaio não substitui teste JWT/Realtime pelo aparelho.
- Push com app fechado ainda pendente: CLI sem autenticação e painel Supabase solicitou login. Nenhum segredo VAPID/worker foi inventado ou exposto. É necessário concluir acesso administrativo, cadastrar os segredos, provisionar Vault/worker e testar em aparelhos reais antes de declarar push funcionando.

## Implementação

- Conversas individuais únicas por par/unidade, grupos configuráveis e comunicados.
- Histórico paginado, respostas, urgência limitada, ciência explícita, entrega e leitura separadas.
- Um canal Realtime por conta/unidade; reconexão sincroniza dados persistidos. Texto e tentativas pendentes ficam somente na memória da sessão; recarregar/fechar a página descarta rascunhos.
- Evidências privadas JPG/PNG/WEBP, até três por mensagem e 5 MB cada; grandes imagens são reduzidas para até 2048 px. Prévia antes do envio, ampliação sob demanda, URLs de 60 segundos. Evidências que precisam preservar o original devem usar um procedimento documental próprio.
- Referências aos processos existentes revalidam a permissão ao enviar e abrir. Abertura de SKU consulta os saldos novamente; compartilhamento não altera estoque nem inicia montagem.
- Mensagens podem originar uma única tarefa AVULSA existente. A conclusão do operador conserva a validação obrigatória da liderança. Leitura/ciência não executa tarefas.
- Preferências próprias de som, volume, silêncio e mute; não alteram alertas de tarefas.
- Push implementado com outbox persistente, VAPID, worker servidor, deduplicação por dispositivo, revogação 404/410 e tentativas limitadas. Aceitação pelo provedor não marca entrega ou leitura no WMS.

## Banco e segurança

Migrations aplicadas em produção:

1. `20261112134100_wms_communication_core.sql`: conversas, participantes, mensagens, recibos, referências, tarefas vinculadas, eventos, preferências, inscrições, outbox e política por unidade; RPC autenticada e Realtime.
2. `20261112134113_wms_communication_storage_push.sql`: bucket privado, políticas Storage, recibos de push por dispositivo e RPC exclusiva de serviço.

As tabelas novas usam RLS; operações de usuário passam pela RPC com escopo de unidade, perfil ativo e participação. Administrador não membro não lê conversa privada. Gestores de grupo precisam também ser ADM/SUP. CAIXA/ATENDENTE mantêm acesso somente às próprias reposições. Tipos de identificador existentes são preservados: auth UUID e perfil texto.

Limites: 20 mensagens/minuto, urgências configuráveis (padrão 3/hora), 20 reservas de imagem/hora, grupos até 200 participantes, 10 dispositivos ativos por usuário. Não há criptografia ponta a ponta. O serviço de banco e seus administradores de infraestrutura têm acesso técnico conforme suas credenciais.

Retenção mínima configurável: 90–3650 dias, padrão 365. Não há exclusão automática de mensagens, auditoria ou anexos. Uploads abandonados também exigem limpeza administrativa autorizada. Não apresentar o parâmetro como expiração automática.

## Ativação no ambiente aprovado

Não executar estes passos contra produção sem autorização e validação do ambiente de destino. Não usar `db push` indiscriminadamente: conferir o histórico remoto e aplicar apenas as duas migrations revisadas.

1. Validar migrations num Supabase de testes quando disponibilizado; executar testes de Auth real, RLS, Realtime e Storage com usuários de teste dos cinco perfis.
2. Aplicar as duas migrations na ordem. Elas não alteram saldos ou tabelas de mensagens do Caixa.
3. Publicar a Edge Function `wms-communication`. A opção específica `verify_jwt=false` permite o worker; o handler verifica JWT com `getUser` e perfil/unidade para ações de usuário. A ação `drain` exige segredo aleatório de 32+ caracteres. Não desabilitar verificações no handler.
4. Configurar somente no servidor:
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (fornecidos pelo ambiente Supabase).
   - `WMS_CHAT_ALLOWED_ORIGINS`: origens exatas autorizadas, separadas por vírgula.
   - `WMS_CHAT_VAPID_PUBLIC_KEY`, `WMS_CHAT_VAPID_PRIVATE_KEY`, `WMS_CHAT_VAPID_SUBJECT`: par VAPID próprio e contato válido.
   - `WMS_CHAT_WORKER_SECRET`: segredo aleatório próprio, nunca no frontend, repositório ou relatório.
5. Provisionar via administração segura do Vault: `wms_chat_worker_url` (URL HTTPS da função) e `wms_chat_worker_secret` (mesmo segredo do worker). Revisar/executar `supabase/setup/communication-worker.sql`, que instala pg_cron/pg_net e agenda a drenagem por minuto. Sem esse agendamento, não garantir notificações com abas fechadas.
6. Publicar o frontend no projeto Vercel WMS correto. A CSP permite imagens do Supabase WMS exato; homologação em outro projeto requer adicionar sua origem explicitamente na CSP de teste.
7. Permitir notificações por ação voluntária no aparelho; testar Android e iPhone/PWA instalada. Testar aba fechada, silêncio, mute, clique, conta trocada, revogação e modo offline. Não coletar credenciais em mensagens.

Sem chaves VAPID/serviço, a interface informa que push está indisponível e mantém avisos internos. Sem migrations, o chat não é funcional: uma prévia de frontend não substitui a validação do backend.

## Verificação feita e limites reais

- Testes automatizados usam PostgreSQL local PGlite com funções, RLS e rotinas existentes de tarefas; não usam o banco de produção.
- Testes de navegador usam contas e mensagens sintéticas, RPC real no PostgreSQL local, Storage privado simulado com políticas reais e o handler real da Edge Function. Eventos locais substituem o transporte Supabase Realtime nesse ensaio.
- Foram observados: conversa individual e grupo persistentes, comunicado recebido pelo caixa, ciência confirmada, evidência enviada/aberta por URL temporária, tarefa vinculada e ação Recebido, isolamento de outra unidade, visual desktop e viewport móvel.
- Testes de push usam transporte substituto: suporte ausente, permissão negada, silêncio, mute, conta/unidade, endpoints, repetição e revogação. Nenhuma notificação externa ou push físico foi enviado.
- Ainda pendentes: Supabase de homologação, Auth/Realtime/Storage hospedados, configuração VAPID/worker e validação física Android/iOS. Não afirmar entrega push real ou tempo de entrega em produção.

Resultado local em 12/11/2026: 398 testes aprovados (20 do conjunto específico de Comunicação), lint e build aprovados. A Edge Function passou em `deno check` com Deno 2.6.7. A revisão adicional protege a inicialização concorrente, descarta respostas atrasadas da conta anterior e limpa a interface imediatamente ao sair, mesmo se a presença estiver sem resposta. O cancelamento de push ao sair usa o mesmo escopo de conta/unidade e espera no máximo dois segundos pela rede. O build mantém o aviso pré-existente de chunk principal acima de 500 kB. Os tempos medidos são do ensaio local; não representam latência de entrega de produção.

Reprodução local: `npm run lint`, `npm test`, `npm run build`. Para o ensaio visual: `node --experimental-strip-types tests/communication-server.mjs` e Vite em `127.0.0.1:4192`, abrir `/tests/communication-visual.html`. O servidor sintético é exclusivo de desenvolvimento e não entra no build Vercel.

## Reversão sem perda de dados

Reverter o frontend à versão anterior validada, desativar a função/agendamento `wms-communication-push` e revogar a execução das duas RPCs novas se a funcionalidade precisar ser suspensa. Preservar tabelas, bucket, mensagens e tarefas existentes; não apagar histórico como rollback. Não remover as rotinas operacionais reutilizadas. Em publicação futura, reconferir o commit atual da produção para não substituir alterações de outra sessão.
