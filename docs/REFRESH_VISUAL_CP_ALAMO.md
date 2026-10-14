# Refresh visual do WMS Alamo

## Escopo e protecao operacional

Atualizacao de apresentacao a partir da versao publicada `b25d893`.
Nao foram alterados banco, Supabase, RPCs, RLS, permissoes, status,
quantidades, calculos, listeners nem regras dos processos.

O JavaScript recebeu somente textos de marca e classes de apresentacao
de SKU/produto/endereco. Um teste normaliza essas alteracoes aprovadas e
confere o SHA-256 do arquivo anterior: todo o restante deve ser identico.
Outro contrato verifica a lista completa dos IDs e atributos `data-*`
do HTML anterior, incluindo todos os indicadores do dashboard.

## Auditoria e alteracoes

Havia fontes de 10-12px em metadados, status, tabelas e regras mobile,
alem de escalas diferentes nas telas de Compras e Visao Geral.

- Tokens compartilhados de 13, 14, 16, 18, 22, 28 e 36px, com tokens
  especificos para codigo, valor e metrica. Textos operacionais usam
  pelo menos 14px; textos auxiliares selecionados usam 13px.
- Declaracoes antigas foram atualizadas nos proprios componentes e
  media queries, sem uma camada de dezenas de overrides ao final.
- Corpo de 16px, entrelinha 1.45, secundario com maior contraste.
- Dashboard dividido em Estoque e Operacao, sem remover indicadores.
- Cabecalho prioriza identidade, usuario, estoque, tarefas e sincronizacao.
  O perfil continua disponivel na lateral; detalhes de Supabase continuam
  em Saude do Sistema, com seus IDs e atualizacoes intactos.
- Marca WMS Alamo e subtitulo Operacao CP Alamo; contexto do modulo preservado.
- Menu ativo com borda, peso e fundo; botoes maiores e foco visivel.
- SKU, localizacao e quantidade de separacao com escala propria.
- Tabelas legiveis com rolagem horizontal; cards existentes no mobile
  preservados. Status e nomes longos podem quebrar linha.
- Numeros tabulares, sombras discretas e gradientes decorativos reduzidos.
- Nenhuma dependencia, framework ou biblioteca visual adicionada.
- Fontes nao escalam com largura da tela; nao ha zoom na aplicacao.
- Regras de impressao existentes foram preservadas.

## Verificacao

- Lint completo, suite de testes, compilacao Vite e `git diff --check`.
  O ambiente nao disponibiliza npm; foram executados diretamente os
  mesmos programas instalados indicados pelos scripts do package.json.
- Playwright: 13 telas em 1366x768, 1920x1080, 768x1024, 1024x768,
  360x800, 390x844 e 412x915, total de 91 verificacoes de layout.
- Zoom de teste de 100%, 110% e 125%, incluindo dashboard, SKU,
  transferencias, Compras e NF; login em desktop e mobile.
- Comparacao de capturas antes/depois, nomes de produtos longos,
  codigos longos e status extensos.
- Expedição: formulários reais executados com cliente de teste local,
  atribuicao, coleta, transito, divergencia 6/5 e resolucao.
- Contraste dos textos secundarios e dos alertas principais verificado.

Os testes visuais usam HTML real e dados de teste locais. Eles nao sao
uma importacao nem uma transferencia real e nao gravam no ambiente de
producao. A suite cobre os contratos operacionais separadamente.
