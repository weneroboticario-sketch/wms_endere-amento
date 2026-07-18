# WMS Endereçamento de Estoque

Sistema simples de endereçamento de estoque feito com HTML, CSS e JavaScript puro.

Nao usa React, Vite, TypeScript, Node, Express, npm, pnpm, backend ou banco de dados externo. Os dados ficam salvos no `localStorage` do navegador.

## Estrutura

```text
wms-enderecamento-html/
├── index.html
├── style.css
├── script.js
└── README.md
```

## Como abrir

Abra o arquivo `index.html` diretamente no navegador.

Nao precisa executar comando, instalar dependencia, rodar servidor ou fazer build.

## Como subir no GitHub

1. Crie um repositorio no GitHub.
2. Envie a pasta `wms-enderecamento-html` com os quatro arquivos.
3. Confirme que `index.html` esta na raiz do repositorio ou na pasta publicada.

## Como publicar no GitHub Pages

1. No repositorio, acesse `Settings`.
2. Entre em `Pages`.
3. Escolha a branch principal.
4. Selecione a pasta onde esta o `index.html`.
5. Salve e abra a URL gerada pelo GitHub Pages.

## Como publicar na Vercel ou Netlify

Publique a pasta do projeto como site estatico. Nao configure build command. O arquivo de entrada e `index.html`.

## Uso no celular

Abra a URL publicada ou o arquivo no navegador do celular. O menu muda para o topo e os campos ficam grandes para facilitar bipagem e digitacao.

## Como bipar SKU

1. Abra a tela `Bipagem`.
2. Bipe ou digite o SKU no campo principal.
3. Pressione Enter ou toque em `Ler SKU`.
4. Se o SKU ja tiver localizacao, o sistema mostra os enderecos existentes.
5. Se nao tiver, o sistema pede a prateleira.

O SKU e salvo como texto para preservar zeros a esquerda.

## Como bipar prateleira

1. Depois do SKU, bipe ou digite a prateleira.
2. Use o padrao `R01-RK01-L01-A`.
3. O sistema tambem aceita `R1-RK1-L1-A` e normaliza automaticamente.
4. Escolha a `Área Linha Separação`.
5. Clique em `Salvar manualmente`.

## Padrao correto do endereco

Estrutura:

```text
Rua - Rack - Linha - Letra
```

Formato tecnico:

```text
R01-RK01-L01-A
```

Exemplos aceitos:

```text
R1-RK1-L1-A
R01-RK01-L01-A
R10-RK03-L04-AA
```

As letras seguem o padrao do Excel: `A, B, C... Z, AA, AB, AC`.

## Consulta por SKU

Abra `Consultar SKU`, digite ou bipe o SKU e toque em `Consultar`. A tela mostra rua, rack, linha, letra, codigo tecnico, area, data de cadastro e botoes para editar ou remover.

## Consulta por prateleira

Abra `Consultar Prateleira`, digite ou bipe o endereco e toque em `Consultar`. A tela mostra todos os SKUs naquela localizacao e a quantidade total.

## Gerar etiquetas

1. Abra `Gerar Etiquetas`.
2. Informe os intervalos de rua, rack, linha e letra.
3. Clique em `Visualizar etiquetas` para gerar em lote.
4. Clique em `Gerar etiqueta individual` para usar apenas os valores iniciais.
5. Clique em `Imprimir` para imprimir.

As etiquetas usam codigo de barras CODE128 via JsBarcode por CDN.

## Exportar Excel

Abra `Exportar Excel` e clique em `Exportar LinhaSeparacao`.

A planilha gerada usa:

- Nome da aba: `LinhaSeparacao`
- Nome do arquivo: `LinhaSeparacao_Enderecamento_DD-MM-AAAA.xlsx`

Colunas exportadas exatamente nesta ordem:

```text
Nome estacao
Nr Rack
Area Linha Separação
Linha
Coluna
Codigo Material
Conferencia Obrigatoria
```

Mapeamento:

- `Nome estacao`: Rua no formato `Rua 01`
- `Nr Rack`: numero do rack
- `Area Linha Separação`: codigo numerico da area
- `Linha`: numero da linha
- `Coluna`: letra
- `Codigo Material`: SKU como texto
- `Conferencia Obrigatoria`: sempre `0`

## Importar Excel

Abra `Importar Excel`, selecione uma ou duas planilhas e clique em `Importar planilha`.

O sistema aceita estes modelos:

- `LinhaSeparacao`: usa `Nome estacao`, `Nr Rack`, `Linha`, `Coluna` e `Codigo Material` para criar os enderecos.
- `MaterialLinhaSeparacao`: usa `Cod Material` e `Desc Material` para carregar o nome do produto. Se tambem houver `Estacao`, `Rack`, `Linha prod alocado` e `Coluna prod alocado`, tambem cria o endereco.

Quando as duas planilhas sao selecionadas juntas, o sistema cruza `Codigo Material`/`Cod Material` e grava SKU, endereco e nome do produto.

O sistema preserva o SKU como texto, converte a area numerica para nome quando existir, normaliza o endereco e evita duplicidades.

Se faltar coluna, sera exibida a mensagem:

```text
Coluna obrigatória ausente: [nome da coluna]
```

## Área Linha Separação

Na tela aparece o nome. No Excel e exportado o numero.

```text
1 - Alto Giro
2 - Médio Giro
3 - Área RF
4 - Baixo Giro
5 - Picking by Light
```

## Conferencia Obrigatoria

Sempre exportada como `0`.

## Historico

O sistema registra no `localStorage`:

- SKU enderecado
- SKU consultado
- Prateleira consultada
- Endereco alterado
- Endereco removido
- Excel exportado
- Excel importado
- Etiqueta gerada

Campos registrados:

- Data e hora
- Acao
- SKU
- Endereco
- Detalhes

## Dados de exemplo

Se o `localStorage` estiver vazio, o sistema cria:

```text
SKU 89261 em R01-RK01-L01-A, Alto Giro
SKU 48139 em R01-RK01-L01-B, Médio Giro
SKU 84915 em R02-RK01-L02-A, Área RF
SKU 87842 em R03-RK02-L01-C, Baixo Giro
SKU 90249 em R04-RK01-L03-A, Picking by Light
```

## Observacao sobre CDN

A geracao de codigo de barras e a exportacao/importacao Excel usam bibliotecas por CDN:

- JsBarcode
- SheetJS/xlsx

Para usar essas funcoes, o navegador precisa conseguir carregar os CDNs.
