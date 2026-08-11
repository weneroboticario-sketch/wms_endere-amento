# Relatorio de auditoria geral do WMS

Data da revisao: 11/08/2026

## Escopo revisado

- Login, sessao e AuthGuard.
- Solicitacao de acesso.
- Usuarios, perfis e troca de estoque.
- Multiestoque VDCG, VDAR e VDSI.
- Enderecamento, consulta SKU, consulta prateleira e alocacao.
- Importacao e exportacao Videmais.
- Etiquetas.
- Transferencias, tarefas, unificacao, separacao e montagem de caixa.
- Conferencias.
- Painel do lider e sincronizacao ao vivo.
- Manutencao do Sistema e Diagnostico.
- Assistente WMS / IA consultiva.
- Supabase, schema, indices e cache local por estoque.

## Estado inicial identificado

- O projeto estava na branch `main`, ultimo commit `39ef581`.
- Build inicial executado com sucesso antes das novas correcoes.
- A revisao anterior ja tinha removido carregamento operacional antes do login, mas a estrutura interna ainda permanecia no HTML estatico.
- As consultas principais carregavam dados de algumas tabelas e filtravam no navegador, em vez de filtrar diretamente por `warehouse_code` no Supabase.
- O schema ja continha muitas correcoes multiestoque, inclusive migracao VDR/DVR para VDAR e colunas em usuarios, enderecamentos, transferencias e conferencias.

## Correcoes aplicadas

- AuthGuard reforcado: o shell interno autenticado agora e removido fisicamente do DOM enquanto nao existe sessao valida.
- O shell interno tambem fica `inert` e `aria-hidden` durante o bloqueio de autenticacao.
- O shell interno so volta ao DOM depois de login/sessao validos.
- Criada funcao central `fetchWarehouseRows()` para buscar dados filtrados por `warehouse_code` no Supabase.
- Enderecamento passou a buscar `wms_bindings` pelo estoque ativo direto no banco.
- Historico passou a usar busca centralizada por estoque, preservando fallback para schema antigo sem `datetime`.
- Transferencias passaram a buscar `wms_transfers`, `wms_transfer_items` e eventos pelo estoque ativo.
- Conferencias passaram a buscar `wms_conferences`, `wms_conference_items` e `wms_conference_events` pelo estoque ativo.
- Eventos de transferencia ganharam fallback para schema antigo sem `warehouse_code`.
- `supabase-schema.sql` recebeu indices adicionais seguros e idempotentes.
- `wms_access_requests` recebeu `warehouse_code` default `VDCG` para completar a estrutura multiestoque.
- Tabelas auxiliares `wms_locations` e `wms_location_skus`, quando existirem, recebem `warehouse_code` default `VDCG`.
- Relatorio de carregamento inicial foi atualizado para refletir a remocao real do DOM antes do login.

## Arquivos alterados

- `script.js`
- `supabase-schema.sql`
- `docs/RELATORIO_CARREGAMENTO_INICIAL.md`
- `docs/RELATORIO_AUDITORIA_GERAL_WMS.md`

## Tabelas avaliadas

- `wms_warehouses`
- `wms_users`
- `wms_access_requests`
- `wms_bindings`
- `wms_history`
- `wms_locations`
- `wms_location_skus`
- `wms_transfers`
- `wms_transfer_items`
- `wms_transfer_events`
- `wms_transfer_divergences`
- `wms_transfer_boxes`
- `wms_notifications`
- `wms_task_notifications`
- `wms_conferences`
- `wms_conference_items`
- `wms_conference_events`
- `wms_conference_divergences`
- `wms_pending_sync_actions`
- `wms_sync_metadata`

## Indices criados ou reforcados

- `wms_warehouses_code_idx`
- `wms_warehouses_active_idx`
- `wms_access_requests_warehouse_status_idx`
- `wms_users_warehouse_active_idx`
- `wms_bindings_warehouse_idx`
- `wms_bindings_warehouse_sku_idx`
- `wms_bindings_warehouse_location_idx`
- `wms_bindings_warehouse_codigo_material_idx`
- `wms_bindings_warehouse_codigo_endereco_idx`
- `wms_transfers_warehouse_last_action_idx`
- `wms_transfer_items_warehouse_status_idx`
- `wms_transfer_items_warehouse_transfer_idx`
- `wms_task_notifications_user_warehouse_idx`
- `wms_task_notifications_warehouse_created_idx`

Todos foram adicionados com `CREATE INDEX IF NOT EXISTS` e verificacao de existencia de tabela/coluna quando necessario.

## Dados residuais encontrados

- O schema ainda preserva compatibilidade com colunas e tabelas antigas, porque apagar agora poderia remover dados reais.
- VDR/DVR continuam tratados por migracao para VDAR.
- O codigo ainda possui catalogo local grande de produtos embutido no `script.js`; isso aumenta o bundle, mas foi mantido por seguranca operacional.

## Dados mantidos por seguranca

- Usuarios reais.
- Estoques VDCG, VDAR e VDSI.
- Enderecamentos reais.
- Transferencias reais e rastreabilidade de unificacao.
- Historico de auditoria.
- Eventos operacionais.
- Configuracoes de Supabase e cache local.
- Base embutida de produtos.

## Pontos de risco

- O arquivo `script.js` continua monolitico e grande. O Vite ainda avisa que o chunk principal passa de 500 kB.
- O projeto ainda usa varias consultas `select("*")`; as consultas mais pesadas agora filtram por estoque, mas uma separacao completa por servicos exigira refatoracao maior.
- O schema usa politicas RLS permissivas para `anon`; a seguranca real hoje esta majoritariamente na aplicacao. Migrar para Supabase Auth/RLS por usuario seria uma etapa futura maior.
- Testes reais de login por todos os perfis dependem de usuarios e dados de producao no Supabase.
- A execucao do `supabase-schema.sql` no painel do Supabase ainda precisa ser feita quando houver schema desatualizado em producao.

## Pendencias para validacao manual

- Login com admin geral.
- Login com supervisor VDCG, VDAR e VDSI.
- Login com operador.
- Cadastro e troca de estoque de usuario em producao.
- Importacao de enderecamento em VDSI sem alimentar VDCG.
- Consulta SKU por estoque ativo.
- Exportacao Videmais por estoque ativo.
- Criacao e unificacao de transferencias reais.
- Finalizacao de transferencia com divergencia e quantidade zero.
- Conferencias separadas de Transferencias.
- Visual mobile nas telas mais usadas.

## Testes realizados

- `npm run build`
- `git diff --check`
- Revisao estatica de schema multiestoque.
- Revisao estatica do fluxo de login, carregamento sob demanda e consultas por estoque.
- Revisao estatica da unificacao de transferencias: a regra atual soma quantidades e bloqueia item final zerado.

## Resultado do build

- Build final: aprovado.
- Aviso restante: chunk principal maior que 500 kB. Nao bloqueia deploy.

## Proximos passos recomendados

- Executar `supabase-schema.sql` no SQL Editor do Supabase para aplicar indices e colunas aditivas.
- Separar `script.js` em modulos reais com `import()` dinamico: Transferencias, Conferencias, Usuarios, Manutencao, Assistente e Excel.
- Criar testes automatizados dos fluxos principais com dados controlados por estoque.
- Migrar politicas RLS para regras por usuario/estoque quando houver autenticacao Supabase propria.
- Criar consultas resumidas para listas e buscar detalhes apenas ao abrir uma transferencia/conferencia.
- Remover ou externalizar catalogo embutido de produtos quando a tabela `wms_products` estiver 100% confiavel.
