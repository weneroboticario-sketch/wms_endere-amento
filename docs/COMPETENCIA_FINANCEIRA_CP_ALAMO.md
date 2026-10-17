# Competencia financeira

Competencia usa `YYYY-MM` e identifica o mes financeiro. Data de emissao da NF e data de criacao do registro sao campos separados. Exemplo: NF de 28/09/2026 registrada em outubro com competencia 2026-09 entra em setembro.

A emissao pode sugerir a competencia. Se ja houver competencia preenchida, a tela solicita confirmacao antes de substitui-la. XML nao transforma automaticamente um lancamento em perda aprovada.

## Aliquota

A configuracao inicial de 0,48% vale de 0001-01 a 9999-12. Para uma mudanca futura, o administrador ajusta o fim da faixa anterior e cadastra a nova faixa. Aprovacao requer exatamente uma faixa ativa aplicavel. Registros aprovados preservam a aliquota e o valor congelados; exportar em outro mes nao recalcula a perda.

## Logistica Reversa

Novos registros possuem emissao de NF e competencia financeira explicita. A competencia operacional mensal e alinhada a esse campo depois das validacoes existentes de status. Totais mensais usam a competencia informada.

Registros anteriores a esta migracao ficam com `competence_review_required=true`; nao recebem uma data fiscal presumida. A tela apresenta a quantidade pendente e o filtro Competencias antigas a revisar. Administradores, supervisores e COMPRAS podem revisar mes e emissao com justificativa. A mudanca registra competencia anterior, nova competencia, autor e motivo e verifica a versao para evitar sobrescrita concorrente.

Enquanto aguardam revisao, registros antigos ficam fora do realizado mensal. Isso pode reduzir temporariamente os indicadores exibidos. Depois da revisao, entram no mes correto. Competencia fechada impede alteracoes financeiras e novos registros nesse mes; exige reabertura formal.
