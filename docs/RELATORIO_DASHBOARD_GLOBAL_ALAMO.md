# Dashboard Global da Operacao Alamo

## Escopo e usuarios

Somente `admin` (Wener) e `tnogueira` (Tacito), ativos, nao arquivados, com perfil
ADMINISTRADOR e estoque padrao DOURADOS recebem a Central de Controle.
`isGlobalAdministrator` centraliza a regra; `isGlobalView` exige tambem que o
estoque selecionado seja DOURADOS. O mesmo criterio e validado no banco a partir
de `auth.uid()` e do perfil armazenado, sem depender do nome exibido ou de claims
editaveis pelo usuario.

DOURADOS nao foi renomeado no banco. A interface o apresenta como Visao Geral
somente para os dois usuarios autorizados. A lista operacional vem de
`wms_warehouses`, `active = true`, excluindo DOURADOS. Novos estoques ativos entram
automaticamente. A verificacao no ambiente atual encontrou 23 estoques operacionais.

## Arquitetura e consultas

`src/global-dashboard-service.js` controla autorizacao, cache curto, consultas e
diagnosticos. `src/global-dashboard-view.js` renderiza a nova tela;
`src/global-dashboard.css` restringe os estilos a ela e ao seu contexto.

A RPC publica `wms_global_dashboard` e SECURITY INVOKER, com EXECUTE revogado de
PUBLIC/anon. Encaminha a consulta para a implementacao privada, que e SECURITY
DEFINER porque precisa consolidar dados sem alterar as politicas operacionais.
Essa implementacao exige autenticacao e valida os dois usuarios em todas as
chamadas, usa `search_path = ''` e referencias de tabelas qualificadas. Nenhuma
politica RLS existente foi alterada.

Funcoes privadas:

- `is_wms_global_administrator`: validacao do perfil autenticado.
- `wms_global_operation_rows`: projecao minima dos dominios operacionais.
- `wms_global_dashboard_data`: agregacoes e paginas autorizadas.

Secoes da RPC: tarefas, reposicoes e transferencias (resumo ou paginas), equipe,
usuarios paginados, CAPTACAO, importacoes, alertas, atividade e itens de uma
transferencia. Itens de transferencia so sao consultados ao abrir seu detalhe.

A tela inicial usa uma consulta de estoques, sete consultas agregadas por dominio
em paralelo e uma lista limitada a 20 atividades. Falhas de uma fonte ficam
isoladas e sao exibidas na tela. Nao ha consultas completas por estoque, nem
carregamento de `wms_stock_positions`, catalogo completo ou itens de transferencia
na entrada global. O catalogo operacional so carrega ao abrir um estoque real.

## Paineis, filtros e detalhes

Indicadores de estoques, equipe ativa no cadastro, disponibilidade, ocupacao,
tarefas abertas/em andamento/atrasadas, reposicoes, transferencias, divergencias,
importacoes e alertas. A secao Hoje usa datas da operacao em America/Cuiaba.

Quadro por estoque com semaforo textual e colorido, CAPTACAO, atividade, filas e
alertas. Ordenacao por atencao, pendencias, atrasos, pessoas ou idade da base.
Busca e paginas de 30 estoques.

Abas de tarefas, reposicoes, transferencias, importacoes, equipe e alertas trazem
graficos e tabelas. Ha graficos por estoque, status e tipo de tarefa, historico
agregado de importacoes, duracao media de importacao e equipe disponivel/ocupada.
Tempos operacionais medios so aparecem quando existem amostras com inicio, fim
e duracao validos. Ausencia de amostras nao produz tempo inventado.

Filtros: estoque, periodo, status, responsavel, tipo e prioridade. Status/tipo e
prioridade filtram os dominios em que esses campos existem; equipe e atualizacao
da base permanecem indicadores cadastrais/de frescor. Busca, situacao e inclusao
de arquivados/cancelados acompanham as listas. Historico fechado nao carrega
integralmente; respeita a janela selecionada. O historico de importacoes inclui
pelo menos os ultimos sete dias, podendo abranger um periodo personalizado maior.

As tabelas operacionais usam limite de 30 e paginacao. Atividade e limitada a 20.
Modais de detalhe nao trocam o estoque ativo; itens e pessoas no detalhe tambem
possuem busca e paginacao. Abrir no estoque e uma acao opcional, e Voltar para
Visao Geral retorna a DOURADOS sem mudar o estoque padrao do perfil.

## Dados e alertas

CAPTACAO mostra ultima tentativa, ultimo lote concluido, arquivo, linhas,
inseridas/atualizadas/iguais, erros e duracao. O frescor e classificado por
limiares configuraveis, com destaque para falha. O aviso de diferenca entre saldo
importado e estoque fisico permanece visivel na aba de importacoes.

Alertas incluem SLA vencido, bloqueio, divergencia, operacao parada, ausencia de
responsavel, responsavel inativo/indisponivel, SEM_ESTOQUE, atendimento parcial,
ultima importacao falhada, bases sem atualizacao, ausencia de equipe ativa e
unificacao sem destino valido. Cada linha informa estoque e acao recomendada.

Usuarios ativos no cadastro nao sao apresentados como usuarios online. O banco
nao possui last_seen/heartbeat suficiente para afirmar presenca atual. Ultimo
login aparece somente como ultimo login. Ocupacao decorre de operacoes ativas
atribuidas; disponibilidade usa `available_for_tasks` e a ocupacao.

O painel de atividade mostra o estado mais recente dos registros e dos lotes,
nao um registro imutavel de todas as transicoes de estado.

## Atualizacao e performance

Cache em memoria por usuario, secao e filtros, TTL de 30 segundos. Atualizacao
manual e polling de 60 segundos, suspenso quando a pagina fica oculta.
Realtime somente em tarefas, reposicoes, transferencias, batches e perfis de
usuarios. Nunca assina `wms_stock_positions` globalmente. Eventos sao agrupados
por 1,5 segundo e atualizam o dominio afetado e os indicadores dependentes,
sem recarregar todos os dominios. As assinaturas sao removidas ao sair do escopo.

Os limites de frescor, operacao parada, fila e disponibilidade sao ajustaveis
na interface e valem para a sessao. Valores padrao ficam em
`GLOBAL_DASHBOARD_CONFIG`. A configuracao nao grava dados operacionais.

Saude do Sistema apresenta duracao, numero de consultas, cache, ultimo refresh,
Realtime, disponibilidade da RPC, ultima falha e fonte mais lenta. Como as
consultas sao agregadas, nao e atribuido um tempo artificial a cada estoque.

## Preservacao operacional

Nao foram modificados warehouse_codes, dados, defaults de usuarios ou politicas
operacionais. Nenhum registro foi copiado ou movido para DOURADOS. Nao foram
reescritos Consulta SKU, Enderecamento, Prateleira, Transferencias, Reposicao,
Base CAPTACAO, Importacoes ou Tarefas. Quando um estoque real e selecionado,
o fluxo existente e utilizado. A alteracao de login apenas evita carregar o
catalogo e os modulos operacionais antes de entrar na Visao Geral.

## Validacao

- Testes de banco PGlite para os dois administradores, bloqueio de outros
  perfis e anon, usuario inativo/arquivado, filtro por estoque e periodo,
  inclusao dinamica de novo estoque, limites e preservacao dos dados.
- Testes de identificacao, frescor, isolamento de falhas, cache por usuario e
  invalidacao de dominio sem cancelar consultas independentes.
- Navegador com sessoes e dados simulados: Wener, Tacito, outro administrador,
  operador, supervisor e atendente; filtros, graficos, paginas de 30, modais,
  itens sob demanda, Realtime por dominio, ida/volta de estoque e layout
  desktop 1440px/mobile 390px, sem erro de pagina ou overflow horizontal mobile.
- Consulta real autorizada no Supabase confirmou 23 estoques, equipes e bases.
- EXECUTE de anon na nova RPC confirmado como false.
- Lint e compilacao local aprovados. Compilacao pnpm validada com
  `preserveSymlinks: false`, sem mudar a configuracao operacional do repositorio.
- Suite geral: 91 testes aprovados e tres falhas de preparacao por ausencia da
  extensao pgcrypto no PGlite, antes do teste adicional de concorrencia.

Nao foi realizado login com senhas reais dos usuarios. Os testes de navegador
usaram perfis simulados; a validacao de dados reais usou o contexto autenticado
da consulta de teste, sem alterar registros de autenticacao.

## Arquivos

`script.js`, `index.html`, `public/sw.js`, os tres modulos `src/global-dashboard*`,
`supabase/migrations/20261013150858_global_admin_overview.sql`, os testes
`tests/global-dashboard*` e os dois relatorios desta implementacao.

## Limites e riscos restantes

O fluxo de importacao ainda e incremental; lotes falhados podem conter carga
parcial, sinalizada pelo painel. O tempo de ultima atividade de tarefas usa os
timestamps existentes de inicio/conclusao/criacao, pois nao ha updated_at nessa
tabela. Indicadores de operacao parada refletem a ultima atualizacao conhecida,
nao comprovam por si so inatividade fisica.

As novas funcoes nao receberam alertas de exposicao anonima. O auditor ainda
aponta funcoes antigas SECURITY DEFINER executaveis por anon/authenticated,
RLS sem politica em wms_transfer_events e protecao de senha vazada desativada.
Essas configuracoes anteriores nao foram alteradas nesta entrega:
[Funcoes expostas](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable),
[RLS sem politica](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

Exportacao Excel/PDF do painel foi deixada fora desta primeira versao, conforme
o requisito opcional. O bundle principal ainda gera o aviso preexistente de
tamanho; nao e falha de compilacao.
