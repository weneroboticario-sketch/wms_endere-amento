# Correcao de importacao - WMS Enderecamento

## Diagnostico

As duas importacoes CAPTACAO de VDCG em 15/10/2026, 11:15 e 11:19
(America/Cuiaba), falharam em `wms_bindings_warehouse_sku_location_idx`.
O indice corresponde a estoque + SKU + endereco, nao ao identificador
do registro. O frontend estava reconciliando a gravacao somente por ID.
A leitura da tela tambem mantinha o aviso de carregamento apos terminar.

## Ajuste

- A importacao passa a usar `wms_upsert_import_bindings` em lotes de 200.
- A funcao reutiliza o ID do vinculo existente pela chave natural e
  trata a corrida com outra gravacao, mantendo o indice de protecao.
- O cliente utiliza os IDs retornados pelo banco ao atualizar seu cache.
- Mesmo SKU em outros enderecos e outros SKUs no mesmo endereco continuam
  permitidos. Os quatro estoques usam o mesmo caminho de importacao.
- RLS, restricoes de estoque, papeis e acesso anonimo foram preservados;
  a funcao e SECURITY INVOKER, com search_path vazio.
- O aviso de carregamento e limpo somente apos leitura bem-sucedida e
  somente se ainda for a mensagem inicial. Erros e progresso de importacao
  nao sao ocultados.
- Os lotes historicos FAILED nao foram reclassificados como sucesso.

## Verificacao

Teste local de banco reproduz repeticao com IDs diferentes, chave natural,
movimentacao, compartilhamento de endereco e rejeicao fora do escopo.
Teste da funcao real do cliente valida adocao dos IDs do servidor e duas
localizacoes nos quatro estoques. Teste de carregamento preserva mensagens
de erro e de importacao em andamento.

Teste real sob o usuario administrador, em transacao com ROLLBACK:
VDCG, VDAR, VDSI e VDCO, preservacao de ID, repeticao, multiplos enderecos,
endereco compartilhado e rejeicao de payload de outro estoque. Nenhum
registro de teste permaneceu. RLS ativa e acesso anonimo negado confirmados.

O teste historico de ATENDENTE foi limitado as migrations de seu contrato,
como ja ocorre na branch CP Alamo. Antes tentava carregar modulos posteriores
que dependem de pgcrypto/Storage indisponiveis no PGlite local. Nenhuma
migration ou politica operacional de ATENDENTE foi modificada.

O WMS Alamo e seu banco nao foram alterados. A planilha original nao foi
fornecida; depois de atualizar a pagina, repetir a importacao para gerar
um novo lote e confirmar o resultado completo do arquivo.
