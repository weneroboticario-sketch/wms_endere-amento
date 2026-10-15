# Refresh visual global do WMS CP Alamo

## Escopo

Somente a publicacao wms-cpalamo.vercel.app recebe este refresh. O tema fica
isolado pela classe cp-alamo, aplicada apenas no ambiente Alamo. Nenhuma
migration, RLS, RPC, credencial, quantidade ou registro foi alterado.
Os IDs e data attributes existentes de index.html foram preservados.

Referencias: imagens de Visao Operacional e Compras/Notas Fiscais fornecidas
pelo administrador. Numeros das referencias nao foram copiados para producao.

## Auditoria e padrao compartilhado

Componentes repetidos identificados: panel, page-title, user-strip, metric-card,
stock-summary-card, global-kpi, table-wrap/table-wrapper, filtros, tabs,
status-badge, formularios, toasts, estados vazios e dialogos.

src/cpalamo-theme.css centraliza tokens, navegacao, header, tipografia, bandas
funcionais, formularios, tabelas, feedback e regras responsivas. As telas do
WMS independente continuam usando seus estilos atuais. Nao foi acrescentado
um bloco de overrides no fim de style.css; o tema por ambiente e separado.

Paleta: petroleo no menu, branco nas superficies, teal nas acoes e tons suaves
distintos para informacao, sucesso, alerta, divergencia e fase fiscal.
Fontes operacionais de pelo menos 13 px; labels/controles de 14 px, titulos
de 26-28 px e quantidades operacionais de 28-30 px. Numeros tabulares.
Controles de 44 px no mobile, com foco visivel e sem zoom artificial da UI.
Bandas funcionais sao delimitadas sem empilhar cards dentro de cards.

Lucide 1.57.0 usa apenas os icones importados, com tree shaking. Sem novo
framework. Nome, avatar e funcao permanecem no rodape do menu; informacao
de conexao fica identificada como Sistema, sem expor schema no header.

## Telas auditadas

- Login e estados bloqueado/desbloqueado.
- Dashboard local e Visao Geral consolidada.
- Consulta SKU, prateleira e enderecamento.
- Transferencias, nova transferencia, minhas tarefas, gestao de tarefas,
  finalizadas, estabelecimentos, separacao, conferencia e montagem de caixas.
- Reposicao e necessidade das lojas.
- Compras/NF, expedicao e entregas nas filas de expedicao existentes.
- Logistica reversa e Base de Estoque.
- Exportacoes, etiquetas, estoques e usuarios.
- Saude do Sistema, manutencao e configuracoes.

## Mudancas por modulo

Visao Geral: KPIs de reposicao no topo, fila por estoque, alertas operacionais,
distribuicao por etapa, tendencia diaria e idade dos pedidos. Resumo de
estoques em tabela, com filtro Somente com movimento; dados incompletos nao
sao escondidos como se fossem unidades sem movimento. Indicadores anteriores
de equipe, tarefas, importacoes e detalhes permanecem acessiveis.

Compras/NF: cinco KPIs, tabs ligadas ao filtro existente, busca, tabela de
nove colunas e cards no celular. Drawer nativo com resumo, itens, NF e
historico; foco nativo, Escape, botao fechar e navegacao de tabs por setas.
PDF aceita selecao ou drag/drop e mantem validacao original de 10 MB.
Numero, valor, chave, PDF, correcoes e liberacao mantem os mesmos contratos.
O upload conserva a aba aberta e o retorno junto ao formulario.
Motivos/caixas usam modal visual em vez de prompts do navegador no modulo
fiscal. Cancelar o modal nao chama uma RPC.

Graficos fiscais: leituras finas, paginadas por unidade e protegidas pela RLS
existente. Sem carregar itens ou conteudo PDF. Cache de 60 s invalidado apos
acao fiscal. Sete dias de valores com documento ativo; cancelados, arquivados
e documentos em correcao nao compoem faturamento. Etapas e destinos sao
calculados do conjunto real de processos, nao apenas da pagina visivel.

Usuarios: tabela com identificador, nome, perfil, estoque, status,
disponibilidade e detalhes. O drawer reutiliza os mesmos botoes/handlers de
editar, resetar senha, ativar, arquivar, excluir e vincular supervisor.
Cadastro em secao expansivel, que abre automaticamente ao editar.
Selecao em lote e protecao do administrador/logado foram preservadas.

Expedicao: tabs acionam o filtro existente, sem novos estados ou transicoes.
Logistica reversa: indicadores de meta, realizado, faltante, percentual e
pendencias, calculados do resumo existente. Datas/valores de formulacao e
metas nao foram alterados. Consulta e execucao fisica receberam maior
destaque para endereco, SKU, saldo e quantidades.

## Verificacao

- npm run lint aprovado; npm test: 173 testes aprovados.
- npm run build aprovado; git diff --check aprovado.
- Chrome e Edge: 19 telas x 7 viewports, mais 8 subviews operacionais x 2
  viewports. 1366x768, 1440x900, 1920x1080, 1024, 768, 390 e 360 px.
- Zoom 100%, 110% e 125% verificado em telas principais.
- Sem overflow horizontal da pagina; tabela fiscal mobile vira cards e
  tem teste especifico para nao esconder rolagem horizontal interna.
- Upload com dados de teste isolados: zeros da NFe preservados, valor correto,
  mensagem inline, aba preservada, cancelar motivo sem gravacao e Escape.
- Contrato de IDs/data attributes de index.html continua identico.
- Testes de regras/RLS/estoques/transferencias/reposicao/fiscal/expedicao
  continuam aprovados; nenhuma escrita de teste em producao.

Capturas antes/depois e relatorios de geometria: artifacts/global-refresh/.
Conferencia Edge: artifacts/global-refresh-edge/. Drawer e upload:
artifacts/cp-workflow-views/. As capturas usam fixtures identificadas, nao
registros inventados no Supabase. A verificacao visual nao simula todos os
fluxos autenticados em producao; os testes funcionais complementam a auditoria.

## Limites preservados

Nao foram criados resultados de busca global nem contadores de notificacao
ficticios. Buscas continuam nos modulos compativeis. Entregas usa o modulo
de expedicao; nao foi criado outro processo paralelo. Salvar rascunho fiscal
e anexar/liberar em um unico comando nao foram adicionados, pois alterariam
o fluxo; preparacao, anexo e liberacao continuam separados.
Confirmacoes nativas de operacoes legadas criticas fora do fiscal foram
mantidas; sua substituicao exigiria uma alteracao funcional mais ampla.

O build mantem o aviso preexistente de bundle acima de 500 kB. npm audit
identificou aviso em source-map-js, dependencia de desenvolvimento existente;
nao foi aplicado npm audit fix nesta tarefa visual.
