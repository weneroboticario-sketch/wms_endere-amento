# Relatorio - Reposicao integrada ao WMS

## Correcao aplicada

O modulo de Pedidos de Reposicao foi mantido como modulo interno do WMS atual. Nao foi criado outro app, outro login, outro dominio, outro Supabase ou outra autenticacao.

## O que foi reaproveitado

- Login atual do WMS.
- Usuario logado em `authState.currentUser`.
- Perfil/permissao atual do WMS.
- Estoque ativo e multiestoque por `warehouse_code`.
- Menu lateral do WMS.
- Header, badges e alerta de tarefas atuais.
- Cliente Supabase ja configurado no WMS.
- Canal de tempo real ja usado por Transferencias, com fallback por polling.
- Padrao visual existente de paineis, cards, botoes e status.

## O que foi integrado

- Menu `Pedidos de Reposicao` dentro de `Processos`.
- Tela interna `#reposicao` dentro do `index.html` principal.
- Quick action no Dashboard para abrir Reposicao.
- Resumo de Reposicao dentro do Dashboard/Painel do lider.
- Pedidos atribuidos aparecem junto das tarefas operacionais do usuario.
- Badge de Reposicao no menu para operador com tarefa ativa.

## Banco utilizado

Tabela no Supabase atual do WMS:

- `public.wms_replenishment_requests`

O schema foi adicionado em:

- `supabase-schema.sql`
- `supabase-replenishment-schema.sql` para aplicacao isolada da tabela quando necessario

## Permissoes aplicadas

- `ADMINISTRADOR`: visualiza e opera pedidos do estoque ativo, atribui responsavel, cancela e pode excluir testes quando for admin geral.
- `SUPERVISOR`: visualiza pedidos do estoque ativo, atribui responsavel do proprio estoque e acompanha fila.
- `OPERADOR`: cria pedidos, visualiza pedidos criados por ele e pedidos atribuidos a ele.

Todas as permissoes passam pelo mesmo mapa de telas do WMS.

## Multiestoque

Todo pedido recebe `warehouse_code` obrigatorio. As consultas, atualizacoes e realtime filtram pelo estoque ativo:

- VDCG ve VDCG.
- VDAR ve VDAR.
- VDSI ve VDSI.
- Admin geral opera conforme estoque selecionado.

## Rotas/telas

O projeto nao usa roteador externo dedicado. A tela foi integrada ao roteamento interno por `data-screen="reposicao"` e `section#reposicao`.

Nao existem rotas externas, login separado ou layout isolado para Reposicao.

## Tempo real

A tabela `wms_replenishment_requests` foi adicionada ao canal Realtime existente. Alteracoes de criacao, atribuicao, atendimento, conclusao, cancelamento ou exclusao logica atualizam:

- Tela de Reposicao.
- Dashboard.
- Alertas e badges de tarefas.

## Testes realizados

- Build de producao com `npm.cmd run build`.
- Servidor Vite local respondendo.
- Checagem de integracao dos ids/telas de Reposicao no WMS.

## Observacao

Reposicao apenas cria demanda operacional. Ela nao altera Enderecamento oficial, Transferencias, exportacao Videmais, Alocar Produto, Consulta Prateleira ou importacao de enderecamento.
