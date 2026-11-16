# WMS — auditoria de desempenho — 16/11/2026

## Escopo e proteção

Somente WMS Endereçamento. Nenhum deploy, merge, alteração de plano, migration, limpeza, VACUUM, REINDEX ou mutação de produção foi executado nesta tarefa. Inspeções do banco foram SELECTs agregados. CP Álamo não foi publicado nem recebeu implementação.

- Repositório: weneroboticario-sketch/wms_endere-amento.
- Produção: https://wms-endere-amento.vercel.app/
- Vercel: prj_HTVBYmk1nVKClLoAQt5WnrQEd85s, equipe team_sUmxjo89NMKzL80FeYsi72kw.
- Deployment operacional: dpl_F8VEMtn2R9nsChwz6DqhnDBsvjKr, READY.
- Commit operacional/main remoto no início: e31b681e3e1e8cea72739ad0a10d32d02efef199.
- Branch isolada: perf/wms-otimizacao-segura, baseada nesse commit.
- Restauração local do código: tag restore/wms-operacional-20261116 e worktree separado intacto wms-perf-baseline.
- Outros worktrees e branches preexistentes foram preservados; nenhuma alteração deles foi incorporada.
- A configuração git.deploymentEnabled desabilita SOMENTE os deploys automáticos desta branch. Isso permite enviar o PR sem publicar um preview nem mudar a produção. Main permanece como estava.
- Supabase inspecionado: bzqulgdtfpcmkyaldssy, organização mssdifnzfqpjwbmiuovx, plano Pro, banco ACTIVE_HEALTHY.
- Backup do banco: não foi possível consultar um catálogo de backups com as ferramentas conectadas. Plano Pro não é prova de backup restaurável já concluído. Nenhum restore foi ensaiado nem banco copiado. **Qualquer futura alteração estrutural exige comprovar backup/recuperação antes de autorizar**. Esta entrega não depende de migration.

## Fotografia do banco (variável durante a operação)

Banco: aproximadamente 590 MB. wms_stock_positions: 227 MB em tabela/TOAST e 298 MB em índices, aproximadamente 526 MB no total. Não confundir tamanho de relações com disco provisionado, WAL ou tráfego de saída.

817173 registros, 67056 pares distintos estoque/SKU, 202 batch_id distintos.

| Estoque | Origem | Ativo | Arquivado | Registros | SKUs |
|---|---|---|---|---:|---:|
| VDAR | CAPTACAO | false | false | 10 | 10 |
| VDAR | CAPTACAO | true | false | 2446 | 2018 |
| VDCG | CAPTACAO | false | false | 616524 | 32682 |
| VDCG | CAPTACAO | true | false | 1363 | 1363 |
| VDCG | LOJA | false | false | 126495 | 32572 |
| VDCG | LOJA | true | false | 1659 | 1659 |
| VDCO | CAPTACAO | false | false | 67649 | 32355 |
| VDCO | CAPTACAO | true | false | 1027 | 902 |

Os grupos por origem são distintos; não somar SKUs das origens como se fossem produtos diferentes. Não havia registros VDSI nesse recorte da tabela no instante da consulta; isso não é uma conclusão sobre permissões ou cadastro desse estoque.

### Histórico, importações e multiplicidade

- Cerca de 99,2% das linhas estavam inativas. A persistência de versões antigas das importações explica grande parte do volume. Inativo não equivale a lixo: retenção e eventual arquivo externo precisam de decisão do negócio e recuperação comprovada.
- Zero colisões ativas pela chave exata estoque + origem + SKU + COALESCE(endereço,'').
- VDAR: 347 grupos de SKU com múltiplas posições ativas (775 linhas). VDCO: 114 grupos (239 linhas). Múltiplas localizações foram preservadas, sem presumir duplicidade indevida.
- batch_id identifica a criação original; registros reaproveitados podem receber last_seen_batch_id. Agrupar só por batch_id não mede o tamanho de cada carga posterior.
- Cargas concluídas em 16/11: CAPTAÇÃO VDCG com 1.363 linhas e 31.322 desativações; LOJA VDCG com 1.659 linhas e 31.024 desativações. Esses números vêm das cargas em operação, não desta branch. Confirmar com a operação se os arquivos reduzidos eram cargas completas intencionais. Não houve restauração nem mudança da regra de importação.
- Estatísticas de tuplas mortas/autovacuum são estimativas e não autorizam excluir dados ou executar manutenção bloqueante durante o expediente.

## Índices existentes de estoque

| Índice | MB aproximados | idx_scan acumulado |
|---|---:|---:|
| wms_stock_positions_pkey | 106.3 | 3244113 |
| wms_stock_positions_warehouse_source_active_idx | 10.4 | 392768 |
| wms_stock_positions_lookup_idx | 18.3 | 15179 |
| wms_stock_positions_updated_idx | 11.3 | 74 |
| wms_stock_positions_warehouse_sku_active_idx | 14.2 | 22311 |
| wms_stock_positions_warehouse_source_sku_idx | 14.4 | 938 |
| wms_stock_positions_batch_idx | 12.7 | 26 |
| idx_stock_positions_replenishment | 52.5 | 2431 |
| idx_stock_positions_codigo_active | 12.4 | 34555 |
| idx_wms_stock_positions_hash | 19.5 | 12 |
| idx_wms_stock_positions_archived | 11.4 | 57 |
| wms_stock_positions_active_location_uidx | 5.2 | 295361 |
| idx_wms_stock_positions_captacao_sku | 2.9 | 7947 |
| idx_wms_stock_positions_captacao_location | 3.4 | 0 |
| idx_wms_stock_positions_captacao_updated | 3.3 | 268004 |

Contadores são acumulados desde o último reset; zero uso não prova que o índice é dispensável. A chave primária e o índice único de localizações não devem ser removidos. Os índices de lookup e contagem já existem: não há justificativa para adicionar todos os índices sugeridos indiscriminadamente.

### Alertas do Advisor

- unindexed_foreign_keys: 39.
- auth_rls_initplan: 1.
- unused_index: 38.
- multiple_permissive_policies: 11.
- duplicate_index: 10.
- auth_db_connections_absolute: 1.

### As 39 FKs sem índice: análise individual de candidatura

Prioridade abaixo significa investigar plano real, não criar automaticamente. Colunas de autor/supervisor são pouco seletivas e podem onerar gravações; FKs de entidade operacional podem ajudar consultas por entidade e exclusões, porém precisam de EXPLAIN, volume e benchmark isolado. A auditoria não demonstrou que essas 39 FKs causaram o 402.

| Tabela | Constraint | Encaminhamento |
|---|---|---|
| operacao_tarefas | operacao_tarefas_arquivada_por_fkey | Adiar; validar seletividade e gravações |
| operacao_tarefas | operacao_tarefas_criado_por_fkey | Adiar; validar seletividade e gravações |
| operacao_tarefas | operacao_tarefas_delegado_por_fkey | Adiar; validar seletividade e gravações |
| operacao_tarefas_historico | operacao_tarefas_historico_responsavel_anterior_fkey | Adiar; validar seletividade e gravações |
| operacao_tarefas_historico | operacao_tarefas_historico_responsavel_novo_fkey | Adiar; validar seletividade e gravações |
| operacao_tarefas_historico | operacao_tarefas_historico_usuario_id_fkey | Adiar; validar seletividade e gravações |
| wms_assisted_request_events | wms_assisted_request_events_actor_id_fkey | Investigar consulta por entidade; validar plano antes de propor |
| wms_assisted_request_events | wms_assisted_request_events_item_id_fkey | Investigar consulta por entidade; validar plano antes de propor |
| wms_assisted_requests | wms_assisted_requests_approved_by_fkey | Investigar consulta por entidade; validar plano antes de propor |
| wms_assisted_requests | wms_assisted_requests_deleted_by_fkey | Investigar consulta por entidade; validar plano antes de propor |
| wms_assisted_settings | wms_assisted_settings_changed_by_fkey | Investigar consulta por entidade; validar plano antes de propor |
| wms_caixa_request_events | wms_caixa_request_events_actor_id_fkey | Investigar consulta por entidade; validar plano antes de propor |
| wms_caixa_request_messages | wms_caixa_request_messages_sender_id_fkey | Adiar; validar seletividade e gravações |
| wms_caixa_requests | wms_caixa_requests_claimed_by_fkey | Investigar consulta por entidade; validar plano antes de propor |
| wms_chat_attachments | wms_chat_attachments_conversation_id_fkey | Investigar consulta por entidade; validar plano antes de propor |
| wms_chat_attachments | wms_chat_attachments_message_id_fkey | Investigar consulta por entidade; validar plano antes de propor |
| wms_chat_attachments | wms_chat_attachments_uploaded_by_fkey | Investigar consulta por entidade; validar plano antes de propor |
| wms_chat_conversations | wms_chat_conversations_created_by_fkey | Investigar consulta por entidade; validar plano antes de propor |
| wms_chat_messages | wms_chat_messages_reply_to_message_id_fkey | Investigar consulta por entidade; validar plano antes de propor |
| wms_chat_messages | wms_chat_messages_sender_profile_id_fkey | Adiar; validar seletividade e gravações |
| wms_chat_process_links | wms_chat_process_links_warehouse_code_fkey | Investigar consulta por entidade; validar plano antes de propor |
| wms_chat_push_deliveries | wms_chat_push_deliveries_subscription_id_fkey | Investigar consulta por entidade; validar plano antes de propor |
| wms_chat_push_outbox | wms_chat_push_outbox_profile_id_fkey | Adiar; validar seletividade e gravações |
| wms_chat_push_subscriptions | wms_chat_push_subscriptions_auth_user_id_fkey | Adiar; validar seletividade e gravações |
| wms_chat_push_subscriptions | wms_chat_push_subscriptions_profile_id_fkey | Adiar; validar seletividade e gravações |
| wms_chat_request_events | wms_chat_request_events_actor_profile_id_fkey | Adiar; validar seletividade e gravações |
| wms_chat_request_events | wms_chat_request_events_request_id_fkey | Investigar consulta por entidade; validar plano antes de propor |
| wms_chat_requests | wms_chat_requests_conversation_id_fkey | Investigar consulta por entidade; validar plano antes de propor |
| wms_chat_requests | wms_chat_requests_received_by_fkey | Investigar consulta por entidade; validar plano antes de propor |
| wms_inbound_receipt_events | wms_inbound_receipt_events_actor_id_fkey | Investigar consulta por entidade; validar plano antes de propor |
| wms_inbound_receipt_items | wms_inbound_receipt_items_counted_by_fkey | Investigar consulta por entidade; validar plano antes de propor |
| wms_inbound_receipts | wms_inbound_receipts_created_by_fkey | Investigar consulta por entidade; validar plano antes de propor |
| wms_inbound_receipts | wms_inbound_receipts_finished_by_fkey | Investigar consulta por entidade; validar plano antes de propor |
| wms_inbound_receipts | wms_inbound_receipts_validated_by_fkey | Investigar consulta por entidade; validar plano antes de propor |
| wms_magazine_items | wms_magazine_items_page_id_warehouse_code_fkey | Investigar consulta por entidade; validar plano antes de propor |
| wms_magazine_pages | wms_magazine_pages_version_id_warehouse_code_fkey | Investigar consulta por entidade; validar plano antes de propor |
| wms_magazine_versions | wms_magazine_versions_magazine_id_warehouse_code_fkey | Investigar consulta por entidade; validar plano antes de propor |
| wms_magazines | wms_magazines_cycle_id_warehouse_code_fkey | Investigar consulta por entidade; validar plano antes de propor |
| wms_sku_barcodes | wms_sku_barcodes_sku_fkey | Investigar consulta por entidade; validar plano antes de propor |

### Candidatos para etapa separada, não incluídos nesta publicação

- idx_stock_positions_codigo_active e wms_stock_positions_warehouse_sku_active_idx têm a mesma definição (warehouse_code,codigo_material,active). Avaliar manter o segundo e remover apenas o primeiro: economia nominal ~12,4 MB. Não estimar a economia pelo tamanho total do banco.
- Reversão proposta, somente após aprovação/validação isolada: recriar o primeiro com CREATE INDEX CONCURRENTLY usando exatamente a definição original. A remoção proposta seria DROP INDEX CONCURRENTLY apenas desse índice não único, após revalidar dependências e planos. Nenhum desses comandos foi executado; nenhuma migration executável foi adicionada.
- A consulta incremental de itens não tem índice começando por warehouse_code,updated_at,id. O índice existente (transfer_id,updated_at DESC) serve outro acesso. Ainda falta um plano autenticado com RLS e cardinalidade real para justificar mais um índice. Criá-lo agora sem isso adicionaria armazenamento e custo de escrita.
- Os demais alertas de índices duplicados, políticas permissivas e initplan continuam fora da alteração: trocar RLS por desempenho sem ensaio multiperfil seria risco desnecessário.
- Reindexação da PK (~106 MB), retenção de histórico, mudança de chaves de importação e VACUUM FULL ficam fora desta entrega.

## Consultas observadas

pg_stat_statements, acumulado e sem janela de reset comprovada:

| Padrão | Chamadas | Tempo médio ms | Tempo total ms |
|---|---:|---:|---:|
| Contagem exata de posições ativas (1) | 327093 | 16.01 | 5237133.4 |
| Leitura de posições com colunas operacionais (2) | 2250 | 887.18 | 1996163.3 |
| Leitura de posições com colunas operacionais (3) | 11265 | 104.58 | 1178135.5 |
| Contagem exata de posições ativas (4) | 2872 | 242.37 | 696091 |
| Leitura de posições com colunas operacionais (5) | 2240 | 228.52 | 511883.6 |
| Leitura de posições com colunas operacionais (6) | 7650 | 50.07 | 383040.7 |

Não são medidas antes/depois desta branch e não equivalem a número de registros baixados. Aumentar índices sem reduzir consultas repetidas não trata sozinho o consumo.

## Inventário e decisões por domínio

| Domínio | Padrão observado | Alteração/decisão |
|---|---|---|
| Catálogo | Todas as páginas de sku,product_name em segundo plano a cada carga de core | Cache em memória 60 s, até 2 escopos; single-flight; invalidação em alterações do catálogo, logout/troca de estoque e sinais de cache. Sem saldos ou credenciais |
| Consulta SKU | Endereço atual por estoque e SKU; debounce de 450 ms existente | Cancelar endereço anterior ao iniciar outra busca; descartar resposta obsoleta. Scanner, câmera e teclado preservados |
| Estoque por SKU | Filtrado por unidade, ativo e aliases com zeros; cache e invalidação existentes | Coalescer somente leituras simultâneas equivalentes por usuário/perfil/estoque/geração/conjunto de SKUs. Rejeitar resposta após invalidação/logout/troca de escopo. Não acrescentar TTL de saldo |
| Exportação/base completa | Páginas de 1000, paralelismo até 3, ordem SKU + ID | Preservado. Exportar tudo exige ler tudo; não substituir por cache incompleto |
| Transferências incrementais | Limite único de 500 e timestamp exclusivo | Paginar por timestamp + ID, incluir fronteira e manter cursor separado por tabela. Evento Realtime não avança mais o cursor de leitura. Aplicação por ID existente, sem somar quantidades |
| Transferências completas | Resumos limitados e detalhes por transferência com páginas de 500 | Preservado; não mudar limites funcionais nem rotinas de gravação |
| Reposição | Carregamento/filtros, invalidação, RPCs e verificação de pedidos existentes | Preservado. Não reduzir frequência dos avisos nem mudar baixa de saldo/conclusão |
| Recebimento | Lista 200, andamento 100, itens da NF até 6001, detalhe por ID, eventos 100 | Preservado. Limites de negócio/validação do XML não foram trocados por truncamento silencioso |
| Comunicação/Caixa | RPC com escopo, páginas/limites, debounce diretório 250 ms e atualização coalescida | Preservado. Não alterar push, confirmação de ciência, envio ou notificações |
| Central de Revistas | Leitura de posições por até 40 SKUs, páginas de 500; releitura de bindings do estoque | Preservado. Otimizar bindings com lista de SKUs exige tratar códigos legados compostos; adiado para não perder localizações |
| Tarefas | Limites 300 e histórico por conjunto de IDs | Preservado. Paginação visível de histórico e resumo servidor ficam para etapa específica |
| Auth | Erro genérico para falhas de serviço | Mensagens distintas para restrição 402, rede, 5xx e 429. Restrição/cancelamento não ganham retentativas nem fallback de recarga completa |
| Diagnóstico | Métricas locais anteriores | Amostras em memória (até 100) de label do endpoint, status, latência, tentativa e linhas retornadas; exibição em Saúde do Sistema. Sem URL, corpo, tokens ou envio externo |

Não se alterou nenhum cálculo, pedido, quantidade, endereço ou regra de autorização. Não foram mudadas dependências.

## HTTP 402

Evidência confirmada diretamente na API antes da liberação: exceed_egress_quota. A organização estava no Free e passou ao Pro. Depois da propagação, /auth/v1/health e a resolução de login retornaram 200. A causa evidenciada é tráfego de saída, não os 590 MB de banco. Nesta tarefa não se alterou faturamento.

Fonte: https://supabase.com/docs/guides/platform/manage-your-usage/egress

## Testes e comparações

- Baseline operacional: 401/401 testes aprovados.
- Branch: 413/413 testes aprovados; npm run lint e npm run build concluídos.
- Suites com PostgreSQL local (PGlite): permissões, isolamento, gravações idempotentes, recebimentos, conferência, reposição, transferências e Comunicação. Não foram executadas gravações de teste em produção.
- Novos testes: cache/TTL/limite de memória/erro/invalidação concorrente; coalescência de SKU equivalente 01314/1314; logout; isolamento; 1.501 mudanças com mesmo timestamp; cursores independentes; falha de página; cancelamento; 402 sem loop; retentativas transitórias limitadas; diagnóstico sem conteúdo.
- Benchmark reproduzível: node scripts/benchmark-wms-reads.mjs. Fixture local com 32.878 descrições, quatro leituras sequenciais no mesmo escopo/TTL: 132 chamadas de página antes, 33 depois (-75%). Não é promessa de redução de tráfego total da produção.
- Incremental com 1.501 registros de timestamp igual: rotina anterior retornava no máximo 500; nova rotina retorna 1.501 em 4 páginas. Isso corrige completude; não é redução de chamadas.
- Duas buscas simultâneas equivalentes de SKU: 1 consulta de saldo, sem duplicar agregados.
- Bundle principal minificado: 814.767 → 819.635 bytes; gzip 234.732 → 236.489 bytes (+1.757 bytes, ~0,75%). Não se ocultou esse pequeno aumento para as proteções adicionadas. Tempos de build sob cargas locais diferentes não são benchmark de usuário.
- Aviso de chunk >500 kB já existia na baseline e permanece. Não dividir o leitor da câmera com import assíncrono no toque: risco de perder ativação do usuário em celulares.
- Não foi medido tempo de login/carregamento em celulares físicos nem comprovada redução de egress real. São validações pendentes.
- Cursores baseados em updated_at não constituem snapshot transacional global: transações longas/retroativas e exclusões continuam exigindo reconciliação/snapshot da rotina existente. Não foi criado protocolo de CDC ou tombstones. Não usar esse cursor como garantia de auditoria ou de movimentação.
- Atualização após reposição foi coberta pelas suites locais existentes. Não houve reposição real em produção durante os testes.

## Publicação e rollback

1. Não publicar automaticamente, nem após as 18h. Exigir autorização explícita após 18h America/Campo_Grande.
2. Confirmar novamente SHA do main, deployment e escopos WMS/Supabase. Se houve alteração concorrente, revisar/rebasear e repetir testes.
3. Manter esta publicação só de frontend, sem migrations. A branch tem autodeploy desabilitado. Não promover preview ligado a produção para testar gravações.
4. Antes da liberação, completar smoke test em ambiente local isolado com desktop e celular corporativo: login, consulta, scanner/câmera, reposição, recebimento/conferência e comunicação em dois usuários/estoques. Testes automatizados não substituem esse ensaio.
5. Conferir backup recuperável no painel antes de qualquer etapa futura de banco. Sem prova, alterações de banco permanecem bloqueadas.
6. Quando autorizado e validado, preparar build com configuração de produção do projeto WMS, testar e promover apenas no projeto prj_HTVBYmk1nVKClLoAQt5WnrQEd85s. Não modificar CP Álamo.
7. Observar HTTP 402/429/5xx, latência por label e consumo real de egress, sem registrar senhas/tokens/corpo de mensagens.
8. Se houver regressão crítica, reverter o alias WMS ao deployment dpl_F8VEMtn2R9nsChwz6DqhnDBsvjKr/commit e31b681, verificando antes que ainda seja a versão-base desejada. Como não há mudança de banco, não há rollback de dados. O cache de descrições é só de memória e some ao recarregar.
9. A versão de rollback e a aplicação publicada devem ser novamente identificadas no dia da liberação. Nunca reverter uma melhoria concorrente sem avaliação.

**Estado da entrega: implementação local validada por automação; PR em rascunho; liberação de produção condicionada à autorização e aos ensaios pendentes.**
