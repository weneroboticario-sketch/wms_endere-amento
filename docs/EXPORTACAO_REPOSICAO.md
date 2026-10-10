# Exportacao dos pedidos concluidos

Somente WMS Enderecamento. O arquivo segue o modelo Materiais fornecido, com Material como texto (preserva zeros) e Quantidade numerica. Soma as quantidades efetivamente atendidas do mesmo material.

Cada exportacao registra um lote no Supabase e marca os pedidos incluidos com `export_batch_id` e `exported_at`. Proximas exportacoes selecionam apenas concluidos ou entregues com quantidade positiva e sem selo. Uma nova solicitacao do mesmo material recebe outro ID e continua elegivel.

A gravacao e a marcacao sao atomicas, com trava por estoque para impedir que duas exportacoes incluam o mesmo pedido. O selo e a quantidade exportada ficam protegidos contra alteracao. O historico guarda os valores originais para baixar novamente se o download falhar. A repeticao de uma requisicao com o mesmo identificador retorna o mesmo lote.

O navegador nao consegue confirmar que o usuario recebeu ou importou um arquivo. Por isso o selo significa que o lote foi registrado para transferencia; o historico permite recuperar esse arquivo sem gerar outra movimentacao. Nenhum pedido historico e marcado pela migration. Arquivos baixados antes desta versao nao possuem registro de exportacao e permanecem elegiveis ate a primeira exportacao com selo.

Aplicacao: migration `20261010122825_replenishment_export_batches.sql` no projeto `bzqulgdtfpcmkyaldssy`, seguida do deploy do frontend. Nao altera o CP Alamo.

Validacao: testes focados em PostgreSQL local (PGlite) com papel authenticated, isolamento de estoque, bloqueio ATENDENTE, selo unico, nova solicitacao do mesmo material e recuperacao do mesmo lote. RPC verificada no Supabase de producao dentro de transacao encerrada com ROLLBACK, sem marcar pedidos reais.
