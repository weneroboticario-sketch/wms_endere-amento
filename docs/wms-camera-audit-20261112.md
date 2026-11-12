# Auditoria de leitura por câmera — WMS ENDEREÇAMENTO
Data: 12/11/2026. Referência inicial: deploy de produção d3099c7b4d02c5b3c124b21771a38c220955b2ea.

## Cobertura confirmada e integrada

| Fluxo | Campo | Tipo | Resultado da câmera | Ação de negócio |
| --- | --- | --- | --- | --- |
| Consulta SKU | Leitura existente | EAN/GTIN/SKU | Consulta abre o SKU | Apenas consulta |
| Ler Prateleira | Leitura existente | CODE128 de endereço | Lista SKUs da posição | Apenas consulta |
| Endereçamento | `skuInput` | SKU ou EAN | Preenche SKU e verifica endereço atual | Nenhuma alocação |
| Endereçamento | `locationInput` | CODE128 de endereço | Preenche a prateleira | Requer confirmar; não aloca no ato da foto/leitura |
| Dashboard | `dashboardSkuQuickInput` | SKU ou EAN | Abre consulta rápida | Apenas consulta |
| Pedidos de Reposição | `replenishmentSkuInput` | SKU ou EAN | Consulta produto e foca quantidade | Requer envio explícito |
| Transferência — montagem | `transferScanInput` | SKU ou EAN | Preenche SKU | Requer ação de localizar/confirmar; nunca soma unidades automaticamente |
| Recebimento XML | `[data-code]` | Código original de item do XML/EAN | Preenche código exatamente como lido | Usuário escolhe Localizar ou Registrar +1 |
| Recebimento XML | `[data-map-sku]` | SKU ou EAN | Valida e preenche SKU interno | Requer confirmação do vínculo |
| Recebimento XML | `[data-extra-form] [name=code]` | Código de item extra | Preenche código | Requer descrição, quantidade e confirmação |
| Caixa — nova solicitação | Campo SKU/EAN | SKU ou EAN | Consulta produto | Requer confirmação de pedido |

**Distinções fundamentais:**
- A câmera não altera estoque, endereçamento, quantidade separada, recebida, caixa, tarefas ou requisições.
- SKU/EAN: validação de GTIN e resolução para SKU por RPC autenticada e unidade; preserva zeros à esquerda; conflito exige conferência no módulo de Consulta de SKU.
- Recebimento XML usa o código impresso **sem conversão automática para SKU** porque esse código precisa corresponder exatamente às linhas e unidades do XML, preservando regras de conversão tributária e comercial.
- O modal fecha após uma leitura válida; ao alterar usuário, unidade, tela ou autorização, a câmera e a sessão são encerradas.
- Se câmera/permissão falhar, os campos originais continuam disponíveis para digitação ou leitor físico.
- Não é instalada dependência adicional nem acionada API paga.
- Code128 das etiquetas alfanuméricas é reconhecido; EAN/GTIN do produto continua usando o detector e ZXing local já existente.

## Campos intencionalmente NÃO transformados em leitura por câmera

- Quantidades, unidades por caixa, totais, notas, motivos e observações: requerem informação/validação humana.
- Upload de XML, importações Excel, ciclos/revistas PDF: continuam entradas de arquivos, não código de barras de produto.
- Filtros de texto, status, pesquisa de colaboradores, buscas de transferência e matrículas: não representam etiquetas físicas a bipar.
- Tela de separação de transferências em modo **SEPARAÇÃO**: atualmente não exibe campo de SKU para bipagem, usa seleção dos itens na lista. Sem inventar novo fluxo de soma física; se solicitado, o módulo precisará ter uma etapa explícita de validação do item lido.
- Leitura de chave de acesso da NF-e/SEFAZ: fora do escopo; o recebimento segue XML importado localmente.
- Comunicação interna: mensagens e solicitações não exigem câmera de código de barras por padrão; futuros compartilhamentos de SKU devem usar a Consulta de SKU já existente.
- CP ÁLAMO: sem mudança. As câmeras novas são restritas ao WMS ENDEREÇAMENTO.

## Validação antes da publicação
1. ESLint, suíte completa `npm test` e `npm run build`.
2. Verificar leituras reais de EAN-13, CODE128 alfanumérico e SKU CODE128 com zero à esquerda.
3. Android e iPhone, com permissão concedida/negada e troca de usuário/unidade.
4. Recebimento XML em ambos os modos: localizar e somar +1 — a câmera somente preenche o campo.
5. Transferência em montagem: câmera não deve executar LEITURA_UNITARIA sem ato do usuário.
6. Endereçamento: escanear endereço não cria nem transfere vínculo sem confirmação.
7. Reposição e Caixa: camera não envia solicitação por conta própria.
8. Não reverter mudanças mais recentes de outras branches que ainda não sejam produção.
