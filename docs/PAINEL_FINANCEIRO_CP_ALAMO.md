# Painel Financeiro - CP Alamo

Pagina inicial do FINANCEIRO. Filtros de competencia/unidade e filtros adicionais de DRE, tipo, status e centro de custo. Dados reais ou zero/estado vazio, sem dados demonstrativos na aplicacao.

Indicadores: perda bruta, ajustes positivos, perda liquida, registros aprovados, pendencias financeiras e valor calculado pela aliquota. A base oficial do valor continua sendo a configuracao financeira existente. Comparacoes por tipo/DRE/unidade e evolucao por competencia reutilizam o resumo financeiro.

Pendencias verificam competencia, DRE, aliquota congelada, valores, aprovacao, informacoes fiscais, documento e reconciliacao do rateio. Potencial duplicidade e sinalizada; competencia retroativa aparece para conferencia, sem ser substituida pelo mes do cadastro. Ate 200 registros por consulta de pendencias; total e calculado sem o limite.

Conferencia financeira exige registro APROVADA, outro criador/aprovador, justificativa e integridade documental. Erros fiscais exigem correcao e nova aprovacao/conferencia, nao alteracao de quantidade fisica nem liberacao de NF operacional.

## Fechamento e exportacao

- ABERTA -> EM_CONFERENCIA -> FECHADA. Fechar/reabrir exige capability adicional e justificativa. Como o fechamento existente e global, exige todas as unidades ativas no escopo.
- A competencia vem do campo `competence`, nunca de `created_at`.
- Alteracao de aliquota atual nao recalcula snapshots de aprovados ou lotes anteriores.
- Exportacao usa o lote existente com duas abas RESUMO_DRE e DETALHAMENTO, reconciliadas em centavos. NF/codigos continuam texto, preservando zeros.
- Perdas aprovadas sem validacao financeira bloqueiam a exportacao. Apos fechar, registros validados continuam exportaveis, sem mudar snapshots. Exportados nao entram novamente sem reabertura formal.
- Historico permite baixar o mesmo lote sem gerar nova movimentacao.
- Permissoes de aliquotas e tipos sao separadas; configuracoes gerais e centros continuam exclusivas do administrador.

Consultas financeiras de transferencias/NF/reversa usam os registros existentes e escopo do banco. PDFs privados sao abertos por URL assinada com duracao de 60 segundos. Relatorios de consulta exportam a pagina identificada (50 registros), com finalidade auditada; nao sao apresentados como exportacao integral.
