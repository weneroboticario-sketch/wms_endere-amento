# Transferencias: tabela, faltas e exportacao da caixa

## Escopo

WMS Estoque (wms-endere-amento). Sem alteracoes no CP Alamo ou nas policies do banco.

## Alteracoes

- Sanitizacao preserva o contexto de tabela de fragmentos tr/td/th, sem remover a protecao contra scripts e atributos inseguros.
- Relatorios de transferencia mantem colunas alinhadas; no celular, a rolagem horizontal fica dentro da tabela.
- Acao explicita para encerrar um item sem adicionar unidades, com motivo obrigatorio. Unidades ja confirmadas continuam na caixa; a remocao usa a acao de ajuste existente.
- Quantidade vazia, negativa ou invalida nao e convertida silenciosamente para zero.
- Confirmacao e ajuste de quantidade usam o timestamp da ultima leitura, o estoque e a transferencia como condicoes da gravacao. Conflitos e atualizacoes sem linha retornada nao sao apresentados como sucesso.
- Quantidades locais so sao substituidas depois de o banco confirmar a gravacao. Falhas posteriores avisam para nao repetir a bipagem.
- Permite concluir sem envio com zero caixas quando nao existe nenhum item embalado. Com itens embalados exige ao menos uma caixa.
- Exportacao Excel e CSV disponivel na transferencia finalizada, mediante leitura atual do banco. O arquivo tem apenas codigo e quantidade, sem cabecalho, conforme PRODUTOSBAIXAS.csv. Quantidades zero e itens removidos nao entram; SKUs repetidos sao somados. Itens extras entram somente se colocados na caixa.
- Para itens medidos em caixas, exporta o total de unidades registrado; se esse total nao estiver definido, bloqueia a exportacao em vez de estimar.
- Pedidos reabertos para correcao nao podem ser exportados ate a nova finalizacao.

## Validacao

- Build e lint.
- Testes focados em quantidades reais, SKU com zero inicial, conversao de caixas, itens ausentes, CSV, validacao numerica e conflito de gravacao.
- Pagina local tests/transfer-visual.html verifica tabelas e sanitizacao sob a mesma politica Trusted Types da publicacao.
- Nenhuma transferencia real foi alterada para testar.

## Publicacao

Publicar o frontend do projeto Vercel wms-endere-amento. Cache estatico v27 e runtime v14. Nao requer migration nova. Inclui as atualizacoes ja existentes no origin/main, preservando a Central de Tarefas e a resolucao de login.

## Limites

As verificacoes de versao cobrem confirmacao e ajuste operacional do item nesta interface, nao substituem uma transacao global de fechamento no banco. O arquivo e disponibilizado por botao apos finalizar, sem iniciar downloads repetidos a cada atualizacao em tempo real.
