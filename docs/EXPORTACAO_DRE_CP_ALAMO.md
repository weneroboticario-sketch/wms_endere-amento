# Exportacao financeira / DRE

A competencia e obrigatoria. A previa informa registros aprovados, lojas, NFs, valores e pendencias. A confirmacao verifica a mesma lista de IDs e versoes; alteracoes posteriores a previa exigem nova conferencia. Somente perdas APROVADAS entram em um novo lote.

Cada lote guarda os filtros, os valores e o detalhamento como snapshot imutavel. O registro fica EXPORTADA, vinculado ao lote e ao evento de exportacao. Falha no download pode ser resolvida em Lotes anteriores > Baixar novamente. Reexportacao utiliza os dados originais do lote, inclusive depois de reabertura da perda ou mudanca de classificacao.

## Excel

- `RESUMO_DRE`: competencia, DRE, loja competente, natureza, quantidade de registros/NFs, valor das NFs, aliquota e valor calculado.
- `DETALHAMENTO`: perda, competencia, loja competente, centro e loja do rateio, NF/chave/emissao, tipo, DRE, valores alocados, solicitante, responsavel, motivo e aprovacao.

Uma NF com rateio gera uma linha por alocacao. Cada linha recebe somente sua parcela. Valores monetarios sao reconciliados em centavos. O calculo pela aliquota usa distribuicao dos centavos residuais pelas maiores fracoes; a soma deve ser exatamente o total aprovado e nenhuma parcela calculada pode ser negativa. O download e bloqueado se os totais do lote nao fecharem.

Exemplo: NF de R$ 15.000,00 a 0,48% = R$ 72,00. Um rateio de 60/40 gera R$ 9.000,00/R$ 6.000,00 e R$ 43,20/R$ 28,80. O resumo conta a NF uma unica vez dentro de cada grupo.

Para fechar a competencia, resolver pendentes/correcoes e exportar todas as aprovadas. Rascunhos nao entram na DRE e nao podem ser enviados para uma competencia fechada. Fechamento, conferencia e reabertura exigem justificativa e ficam no historico. Acesso a um lote exige autorizacao para suas lojas competentes e de rateio.
