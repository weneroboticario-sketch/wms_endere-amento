# Alertas globais do caixa — validação local

## Entrega

Branch `feat/wms-caixa-alertas-globais`, baseada no `main` operacional `e31b681e3e1e8cea72739ad0a10d32d02efef199`. Independente do PR #95 de desempenho; nenhuma alteração daquele PR foi incorporada.

O painel permanente foi retirado de Reposição. O conteúdo de atendimento foi reaproveitado exclusivamente na tela **Atendimentos do caixa**, acessível pelo menu e sino. Ela mantém Disponíveis, Meus atendimentos, Aguardando caixa, Outros em atendimento e Histórico. O perfil CAIXA continua com seu formulário simples e consulta apenas seus próprios pedidos nessa tela.

As solicitações de produto continuam na fila operacional de reposição, com as mesmas prioridades e ações de separação/conclusão. Somente o painel duplicado e o caminho duplicado de aviso de criação foram removidos. Solicitações `caixa-...` e tarefas vinculadas por `CAIXA_AJUSTE` não geram mais o painel permanente de tarefas; os demais tipos de tarefa e avisos de cancelamento continuam usando suas rotinas existentes.

## Comportamento

- Acompanhamento inicia na sessão autenticada de ADMINISTRADOR, SUPERVISOR, OPERADOR e CAIXA, com escopo de usuário/perfil/estoque. CAIXA não recebe aviso urgente de suas próprias solicitações; acompanha seu contador e histórico.
- Primeira leitura é silenciosa para não reproduzir alertas antigos ao entrar. Novas solicitações disponíveis ou atribuídas diretamente ao operador geram um aviso compacto. Ajustes não dependem de `customer_service=true` para alertar.
- SKU preserva zeros à esquerda. Descrição vem da resposta autorizada ou do catálogo já carregado; sem inventar descrições e sem consultas extras no alerta. Prioridade é apresentada quando disponível; todos os pedidos do caixa mantêm caráter urgente.
- O aviso some após 8 segundos de exibição. **Depois** apenas fecha o aviso. Expiração e dispensa não gravam nada no servidor e não removem solicitações.
- **Atender** abre a tela própria e localiza a solicitação. Não assume silenciosamente o pedido: a atribuição segue o botão e as validações existentes do servidor, inclusive se outro operador já tiver assumido.
- Não há foco automático, modal obrigatório, troca de aba na chegada, limpeza de campos nem chamada ao scanner pelo alerta.
- Quando um diálogo de câmera está aberto, o aviso visual aguarda o fechamento; som/vibração podem sinalizar a chegada sem fechar o leitor. Em aba oculta, a apresentação visual aguarda visibilidade. Não há polling rápido para aguardar câmera/visibilidade.
- Um único aviso agrega chegadas em lote. A atualização não reinicia sua duração. Som e vibração têm intervalo mínimo de 12 segundos. Atualizações de status do mesmo ID não são novas solicitações.
- Preferências em **Atendimentos do caixa → Preferências dos alertas urgentes**: som e vibração. Som utiliza o volume e o mute já existentes em tarefas. Vibração inicia desativada e depende de suporte/ativação do Android. Bloqueios de áudio/vibração não criam loops de tentativa.
- Deduplicação em memória por ID; IDs de avisos emitidos são compartilhados entre abas por armazenamento local limitado a 2.000 IDs por usuário/perfil/estoque. Web Locks serializa a decisão de emitir em navegadores compatíveis. Sem Web Locks, a deduplicação entre abas é melhor esforço; a deduplicação de atualizações dentro de cada sessão continua ativa. Não se armazenam mensagens, fotos, senhas ou tokens nesse mecanismo.
- Sino desktop e sino mobile reutilizado mostram pendências do caixa. Quando há pendências, o sino mobile abre Atendimentos do caixa; sem elas, continua abrindo tarefas. Tarefas continuam disponíveis no menu, sem somar duas vezes pedidos ligados à reposição.

## Sincronização e segurança

Um feed global reutiliza `list_wms_caixa_attendance` e compartilha leituras simultâneas e resultados com a tela própria. A tela não abre um segundo polling de atendimento quando usa esse feed. O canal é filtrado por estoque e acompanha pedidos, mensagens e alterações das reposições vinculadas. A flag de Realtime existente é preservada; fallback de leitura continua disponível.

Logout e troca válida de estoque encerram inscrições, listeners, aviso e contador antes de iniciar o próximo escopo. Resposta atrasada de outra sessão é descartada. Uma tentativa inválida de trocar estoque não encerra o acompanhamento atual. Falha de conexão preserva os últimos dados conhecidos e não inventa sucesso nem pendências.

Nenhuma migration, mudança de RLS, cálculo de saldo ou rotina de gravação foi alterada. Endereçamento, leitura da câmera, transferências, Comunicação e CP Álamo não receberam implementação de negócio.

**Limite existente preservado:** o RPC retorna até 100 solicitações mais recentes por estoque/permissão. As listas e o contador refletem esse conjunto; não são uma contagem ilimitada de todo o histórico. Ampliar a paginação histórica e a contagem do servidor exige uma alteração separada e validada do RPC. Nenhum resultado extra foi obtido contornando RLS ou fazendo leitura direta irrestrita de tabelas.

## Arquivos

- `index.html`: tela própria, opção de menu e sino desktop; root removido de Reposição.
- `script.js`: ciclo de vida do acompanhamento, acesso à tela, integração do sino e retirada dos avisos legados duplicados.
- `src/caixa-alert-feed.js`: leitura compartilhada, escopo, contador e deduplicação.
- `src/caixa-alerts.js` e `.css`: aviso temporário, preferências, som/vibração e proteção de câmera/foco.
- `src/caixa-requests.js` e `.css`: reaproveitamento da fila própria, feed compartilhado, localização explícita da solicitação e remoção de CSS do banner legado.
- `src/operational-sync.js`: parametrização das tabelas observadas, mantendo o padrão anterior nos demais consumidores.
- `src/wms-mobile.js`: contador e destino do sino no mobile.
- `tests/caixa-alert-feed.test.js`: novos testes.
- `tests/caixa-alerts-visual.html` e `.js`: fixture que reutiliza a estrutura real do HTML e componentes reais, com RPC sintético. Não acessa produção.
- `vercel.json`: autodeploy desabilitado somente para esta branch.

## Validação

- Baseline: 401 testes.
- Branch: 412 testes automatizados aprovados, incluindo 11 novos testes de alerta/feed; lint e build aprovados. O aviso de chunk grande do Vite já existia e permanece.
- Testes de isolamento, permissões, atribuição, confirmação/devolução do caixa, idempotência e demais módulos nas suites existentes executados em banco local PGlite/fixtures, sem gravações de produção.
- Chrome headless local com rede bloqueada fora de `127.0.0.1`: 1280×900, 390×844 e 320×568. Passaram sem erro de página: chegada sem navegar; foco e seleção da observação preservados; SKU `01314` e quantidade `7` preservados; expiração real em ~8 s; contador mantido; Depois sem exclusão; refresh sem repetição; diálogo sintético de câmera mantido aberto; aviso após fechamento; Atender abre somente a tela própria.
- Preferências no Chrome local com relógio controlado: mute, vibração habilitada/desabilitada, intervalo entre sinais, atualização repetida sem novo sinal, contador e limpeza no logout. Chamadas de som/vibração foram instrumentadas: não é prova de áudio ou vibração física do aparelho.
- A câmera real, o teclado virtual do Android e a emissão física de som/vibração **não foram validados em aparelho corporativo**. Confirmar no dispositivo antes da liberação.
- A fixture pode ser aberta no servidor Vite local em `/tests/caixa-alerts-visual.html`; `window.caixaAlertFixture.add('id-unico')` injeta somente um pedido sintético.
- Evidências locais: `outputs/wms-caixa-alerts-tests.log`, `wms-caixa-alerts-build.log`, `wms-caixa-alerts-lint.log`, `wms-caixa-alerts-browser.log`, `wms-caixa-alert-settings.log` e imagens `caixa-alert-320.png`, `caixa-alert-390.png`, `caixa-alert-1280.png` no workspace principal.

## Publicação e rollback

Nada foi publicado. Produção confirmada em `dpl_F8VEMtn2R9nsChwz6DqhnDBsvjKr` / `e31b681` durante esta tarefa. Sem alterações no Supabase.

Exigir autorização explícita de publicação e respeitar a janela após 18h America/Campo_Grande já definida nesta conversa. Antes da liberação, conferir novamente main, deployment, estado do outro PR de otimização e as verificações físicas pendentes. Se combinar os dois PRs, revisar os trechos comuns de `script.js` e repetir testes.

Rollback é de frontend para a versão operacional anterior confirmada no momento da publicação. Não há rollback de dados nem mudança de schema nesta entrega. Os pedidos continuam no banco mesmo se um aviso expirar, for dispensado ou a versão de frontend for revertida.
