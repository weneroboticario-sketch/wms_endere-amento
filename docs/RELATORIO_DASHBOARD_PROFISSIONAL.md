# Dashboard Global Profissional - WMS Alamo

## Escopo preservado

Somente a Visao Geral de DOURADOS mudou. Mantidos os criterios de acesso de
admin e tnogueira, autenticacao, papeis e estoques padrao. Nenhuma alteracao em
script.js, login, importacao, exportacao, reposicao, transferencia ou cadastro
de estoques faz parte desta entrega. As correcoes dos PRs #9 e #10 permanecem.
Nenhuma tabela operacional, politica RLS ou registro foi alterado.

## Apresentacao

- Cabecalho executivo com atualizacao e conexao ao vivo.
- Ate cinco prioridades objetivas, sem score arbitrario ou avaliacao de pessoas.
- Seis KPIs clicaveis: estoques em atencao, pessoas disponiveis, reposicoes,
  transferencias, tarefas com SLA vencido e falhas de importacao no periodo.
- Mapa de estoques em cards; dez inicialmente, com Ver todos e busca/ordenacao.
- Ranking de situacoes operacionais com motivo do status.
- Faixas independentes para reposicao, transferencias, bases, equipe e tarefas.
- Resumo de hoje, tendencias diarias e atividade recente com linguagem legivel.
- Abas existentes e tabelas paginadas preservadas.
- Detalhes em modal, sem trocar activeWarehouseCode. Abrir no estoque permanece
  como comando explicito opcional.

## Indicadores e fontes

Os totais principais continuam vindo das mesmas secoes da RPC existente.
Mantida captacaoFreshness(), sem duplicar regras de atualizacao. Qualidade da
ultima base usa linhas, novas, alteradas, iguais, erros e duracao ja retornados.
Importacao FAILED e sinalizada como fora do padrao. Nao se inventam comparacoes
de volume com uma importacao anterior que a consulta nao fornece.

Equipe distingue ativos no cadastro, disponiveis, em atividade e indisponiveis;
nao apresenta cadastro ativo como presenca online. Media de atendimento utiliza
somente amostras com timestamps/duracao validos. Sem amostras: Dados insuficientes.
Progresso de transferencia compara unidades separadas com unidades solicitadas,
nunca unidades com quantidade de SKUs.

Nova migration 20261013205124_global_dashboard_executive.sql adiciona a secao
executive, preservando assinatura e retorno das secoes anteriores. Retorna:

- Idade de pedidos abertos por estoque: ate 15, 15-30, 30-60 e acima de 60 minutos.
- Eventos agregados por dia e dominio; limite historico de 30 dias e respeito
  aos filtros de estoque, periodo, status, responsavel, tipo e prioridade.
- Ate dez registros de atencao por dominio, ordenados por SLA, idade e movimento.

Tendencias nao sao um log de transicoes: sao calculadas pelos timestamps que
existem nos registros. Sem eventos validos, o painel informa dados insuficientes.
Hoje e 7 dias selecionam o periodo global para manter os componentes coerentes.
O feed descreve a situacao registrada, sem inventar nomes ou transicoes.

## Seguranca e desempenho

RPC publica SECURITY INVOKER. Implementacao privada com autorizacao explicita
pelos dois perfis reais a partir de auth.uid(), search_path vazio e referencias
qualificadas. EXECUTE revogado de PUBLIC/anon. Nenhuma mudanca nas permissoes
operacionais. Consulta somente leitura, sem acoes destrutivas no painel.

Uma consulta agregada adicional por snapshot (oito secoes, antes sete), nao uma
consulta por estoque/card. Operacoes materializadas uma vez na consulta adicional.
Carregamento progressivo e falhas isoladas com mensagem amigavel e nova tentativa.
Cache em memoria de 30 segundos; fallback de 60 segundos; Realtime preservado sem
wms_stock_positions. Eventos operacionais invalidam seu dominio, equipe, alertas,
atividade e os agregados executivos; nao recarregam dominios operacionais alheios.

## Verificacao

- Lint completo aprovado.
- 14 testes focados aprovados: Dashboard, isolamento, RPC, login e importacao.
- Suite completa: 98 testes, 95 aprovados. Tres falhas preexistentes em
  attendente-rls.test.js por pgcrypto indisponivel no PGlite local; sem mudancas
  nesses testes ou modulos operacionais nesta entrega.
- Build local validado com preserveSymlinks:false apenas na chamada de teste;
  configuracao do repositorio mantida. Build padrao local nao resolve dependencias
  transitivas atraves da junction/pnpm. Publicacao exige build Vercel READY.
- Browser com perfis simulados: admin, tnogueira, outros administradores,
  supervisor, operador e atendente; filtros, paginacao, modal, Realtime incremental,
  troca explicita de estoque e retorno, desktop e mobile sem overflow horizontal.
- Login fresco e importacao de planilha com enderecos repetidos em banco simulado
  continuaram funcionando. Nenhuma senha real usada ou modificada.
- Consulta real autorizada no Supabase validada; nenhuma carga operacional feita.
- Totais reais antes/depois da migration: tarefas abertas 3/3, atrasadas 0/0,
  reposicoes abertas 4/4, transferencias abertas 0/0.

## Arquivos alterados

src/global-dashboard-view.js, src/global-dashboard.css,
src/global-dashboard-service.js, nova migration executiva, testes e este relatorio.
script.js, public/sw.js, src/auth.js, src/warehouses.js e modulos operacionais
nao fazem parte da publicacao desta melhoria.

## Limites conhecidos fora do escopo

Tres testes locais dependem de extensao ausente. Avisos antigos do advisor sobre
outras RPCs/politicas nao foram corrigidos aqui. Comparacao com importacao anterior
e notificacoes de presenca online exigem dados adicionais e nao sao simuladas.
