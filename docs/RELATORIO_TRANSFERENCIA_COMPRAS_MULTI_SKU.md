# Transferencia Compras Multi-SKU

## Escopo

CP Alamo, branch `feature/cpalamo-compras-nf-reversa`. WMS Enderecamento,
seu banco e sua publicacao nao foram alterados. Nao houve merge na main.

## Fluxo

1. Compras abre Necessidade das Lojas, sua nova tela inicial.
2. Seleciona estoque de origem e loja destino, ambos ativos e autorizados.
3. Consulta a necessidade da loja ou cola `SKU;QUANTIDADE`.
4. Seleciona varios SKUs e adiciona ao carrinho.
5. Edita quantidades, escolhe responsavel, prioridade e observacao.
6. Revalida CAPTACAO e revisa a transferencia inteira.
7. Confirma uma unica transferencia com todos os itens positivos.
8. Estoque recebe no cartao existente: rota, separacao, caixa e nota.
9. Separacao, conferencia, NF privada, despacho e recebimento usam o fluxo existente.

## Fontes

- Destino: `wms_stock_positions`, unidade destino, `source_type=LOJA`, ativa e nao arquivada.
- Origem: mesma tabela, unidade origem, `source_type=CAPTACAO`, ativa e nao arquivada.
- O saldo e agregado por SKU dentro da unidade; nao mistura estoques de lojas diferentes.
- Necessidade: diferenca para estoque alvo configuravel; padrao 3 unidades.
- Ausencia de base nao significa saldo zero. Existe alternativa de necessidade colada.
- Sugestao: minimo entre necessidade e saldo disponivel, em unidades inteiras.
- Descricao e snapshot final sao obtidos pelo banco, nao confiados ao frontend.
- SKUs sao strings em todas as etapas, incluindo zeros iniciais.

## Criacao Atomica

`wms_create_purchase_transfer` usa SECURITY INVOKER, search_path vazio e RLS existente.
Valida perfil COMPRAS/ADMINISTRADOR, unidades, destino diferente da origem,
responsavel OPERADOR/SUPERVISOR ativo, nao arquivado, disponivel e da origem.
Valida de 1 a 500 itens, quantidades inteiras positivas, SKU unico e saldo atual.

Uma transacao insere `wms_transfers`, `wms_transfer_items`, evento fiscal existente
e uma notificacao ao responsavel. Qualquer falha reverte tudo, inclusive a tarefa
gerada pelo trigger existente. Nao existe nova tabela de pedidos de Compras.

A idempotencia combina usuario, origem e client_action_id; uma trava transacional
serializa retries da mesma chave. O indice unico existente e reutilizado.
Snapshots reutilizam saldo/localizacao CAPTACAO, stock_snapshot_at,
quantidade_faltante, origem_sugerida e nome_material_snapshot.

## Revalidacao e Duplicidade

- Reconsulta somente os SKUs do carrinho antes da revisao e antes de confirmar.
- Saldo alterado exige nova revisao; quantidade superior ao saldo bloqueia criacao.
- O banco revalida novamente e mantem locks de leitura nas posicoes existentes durante a transacao.
- Adicionar SKU repetido nao cria outra linha no carrinho.
- Transferencias abertas para a mesma rota e SKUs geram aviso e confirmacao explicita.
- Itens com quantidade zero permanecem na analise e nao viram itens operacionais.
- Carrinho nao reserva nem diminui estoque. Nao e uma garantia de reserva contra outras transferencias.

## Visual e Permissoes

Tres etapas: Unidade, Produtos e Revisao. Desktop com tabela compacta e carrinho
lateral; mobile com cards e barra inferior de revisao/confirmacao.
Lista e carrinho mostram explicitamente Saldo destino (codigo da loja) e
Disponivel origem (codigo do estoque), com quantidade em destaque. Saldo destino
vem da base LOJA; disponibilidade da origem vem da CAPTACAO. Dado nao consultado
na necessidade colada nao e apresentado como zero.
Filtros gerais paginados e filtros de disponibilidade/selecionados na pagina atual.
O botao Selecionar pagina seleciona somente os itens exibidos.

No Estoque, pedidos COMPRAS reutilizam o cartao de transferencia existente,
com selo COMPRAS, prioridade, NF obrigatoria, rota e progresso. Minhas Transferencias
tambem usa esse modelo para os pedidos COMPRAS; pedidos legados preservam o cartao anterior.

Compras nao ganha permissoes de separar, conferir, montar caixas ou despachar.
Nenhuma policy foi ampliada. Colunas sensiveis de usuarios continuam protegidas;
a RPC le somente ID/nome do responsavel e os campos necessarios para filtrar elegibilidade.

## Performance e Atualizacao

Necessidade paginada em 40 SKUs. Comparacao CAPTACAO limitada aos SKUs exibidos/selecionados.
Resumo das lojas e calculado por RPC agregada, incluindo Dashboard, sem carregar
a base inteira ou itens de transferencias para o navegador.

Reutiliza Realtime operacional das transferencias e tarefas. Nao adiciona subscription
de stock_positions. Consulta leve do ultimo import batch COMPLETED aproximadamente
a cada 60 segundos durante montagem avisa sobre nova CAPTACAO sem alterar o carrinho.

## Rascunho e DEMO

Rascunho local por usuario/projeto; nao cria tarefas, metricas ou notificacoes.
Nao sincroniza entre computadores. Recuperacao exige revalidacao de saldo.

DEMO inclui TLS1 ficticia, tres SKUs: integral, parcial e sem saldo; cria somente
dois itens positivos em memoria. Nenhuma chamada de gravacao, upload ou RPC real.
Os cenarios anteriores da demonstracao foram preservados.

## Migrations e Publicacao

Aplicar somente no CP Alamo, antes do frontend:

1. `20261014032016_purchase_transfer_multi_sku.sql`: consultas, RPC atomica, prioridade e indice de rota aberta.
2. `20261014034555_purchase_transfer_scoped_user_columns.sql`: leitura minima de usuarios na RPC.

Schema esperado: `2026.10.14.004`. O reparo de leitura preserva essa versao.
Nao ha deploy de Edge Function necessario nesta entrega.

## Validacoes

- PGlite: criacao, retry, rollback no quinto item, 10 SKUs/1 transferencia,
  sem reserva, snapshots, quantidade zero, responsavel de outra unidade e origem proibida.
- Testes reproduzem grants por coluna de usuarios, sem SELECT de password_hash.
- Playwright: desktop 1366/mobile 390, saldo caindo de 30 para 20, bloqueio,
  ajuste, revisao, exclusao dos zeros e uma chamada de criacao.
- Cartao do Estoque validado visualmente nas duas larguras.
- DEMO: fluxo fiscal antigo e novo multi-SKU, sem gravacoes de rede.
- Supabase real: usuario COMPRAS le apenas sua unidade e outra unidade e negada.
- Supabase real: criacao como ADMINISTRADOR produziu transferencia/item/notificacao
  e tarefa operacional. Testes encerrados com ROLLBACK; fixtures nao persistiram.
- Build, lint e suite existente executados antes da publicacao.

## Acoes e Limites

Os usuarios COMPRAS atuais possuem uma unica unidade autorizada. Para transferencia
entre lojas, o administrador deve selecionar as unidades de origem e destino no
cadastro do usuario. A entrega nao ampliou acessos automaticamente.

Importacao de necessidade por arquivo XLSX nao foi adicionada; colar texto e suportado.
A necessidade usa estoque alvo, nao previsao de demanda/vendas.
Busca da lista se aplica a base LOJA do destino; SKU ausente pode ser informado
na necessidade colada e comparado a CAPTACAO da origem.
Upload de PDF fiscal de negocio e operacao completa entre colaboradores reais
nao foram executados para nao alterar pedidos ou estoque reais.
