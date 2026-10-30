# Notificações por solicitação — 30/10/2026

Status: implementado e testado localmente, NÃO publicado.

Branch: fix/wms-caixa-unread-20261030. Base de produção: 27d5b9dbad8546eafe368bc416f3e7a82e366c0c.

## Correção

Leitura deixa de depender de localStorage. Nova tabela wms_caixa_message_reads possui chave por solicitação e auth.uid(), último ID visualizado e horário. Leitura limitada por RLS ao próprio usuário e às conversas autorizadas. Sem escrita direta por anon/authenticated. RPC invoker delega a implementação privada com autorização explícita, valida a mensagem na solicitação e grava greatest() para não retroceder entre sessões. IDs do chat são consultados como texto, preservando bigint.

Contagem exata feita no banco por solicitação, destinada ao solicitante e ao responsável atual (supervisão sem atribuição não recebe contador), desconsiderando mensagens próprias, concluídos e mensagens anteriores à última confirmação em atendimentos reabertos. Não depende do limite global de 100 mensagens. O marcador só avança após exibição de bolhas na área visível da conversa, com documento visível. Falha de persistência não confirma leitura. Rolagem e atualização do chat tentam registrar novamente. Contadores são atualizados sem reconstruir cards ou apagar o formulário. Não há avisos globais de mensagens nem abertura automática do chat.

Ícone Lucide MessageCircle compacto no canto direito, contador vermelho somente quando há não lidas. Histórico permanece consultável por solicitação. O fallback existente atualiza também leituras feitas em outra sessão a cada 15 segundos; nenhum novo Realtime foi habilitado.

## Testes

Lint, 256 testes e build aprovados. Testes cobrem: nova mensagem por ajuste; visualização; resposta sem notificação própria; nova mensagem posterior; concluídos sem alertas; histórico preservado; nova instância e duas sessões usando marcador do servidor; contadores independentes; usuário/estoque não autorizado; atualização atrasada sem retrocesso; reaplicação da migration; histórico reaberto sem reviver mensagens anteriores à confirmação; aba oculta e bolhas fora da área visível não marcadas. A prévia local usa cliente fictício, não o banco real.

## Publicação bloqueada

Migration isolada: supabase/migrations/20261030125348_caixa_message_read_receipts.sql, criada pelo CLI oficial. Não foi aplicada em produção. A condição anterior de recuperação verificável do banco continua pendente (sem acesso de backup pelo CLI/MCP e dashboard sem sessão autenticada). Não publicar este frontend sem a migration: os contadores dependem dos novos RPCs.

Não é necessário aplicar as outras migrations da missão anterior para esta correção: depende somente do chat e atendimento já publicados. Após comprovar recuperação, aplicar esta migration, verificar permissões/contagens em homologação e produção, publicar frontend com atualização de cache, e validar com dois usuários de teste autorizados. Não alterar políticas globais nem habilitar o Realtime pendente como atalho.

Nenhum dado real foi modificado/excluído. Nenhuma regra operacional, saldo, mensagem, solicitação ou arquivo do núcleo de Endereçamento foi alterado. O cascade existente na FK da nova tabela refere-se somente a marcadores de leitura caso o administrador use a exclusão já existente; esta migration não executa exclusões.
