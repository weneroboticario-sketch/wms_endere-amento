# Workflow Compras, Estoque e NF - CP Alamo

## Escopo

Exclusivo do CP Alamo. Nao aplicar ao banco ou publicar no WMS Enderecamento.
Os registros existentes permanecem LEGADO e sem exigencia retroativa de NF.
Pedidos novos do Estoque continuam no fluxo operacional existente.

## Auditoria e arquitetura

Reutilizados wms_transfers, wms_transfer_items, wms_transfer_divergences,
wms_transfer_events, wms_replenishment_requests, wms_history e wms_notifications.
Nao existem tabelas paralelas de transferencia ou reposicao. Os campos fiscais
ficam no processo original; as quantidades de estoque nao sao copiadas para outro dominio.
O snapshot fiscal registra exclusivamente a conferencia aceita no momento da entrega a Compras.

O perfil COMPRAS ja existia no banco do CP, mas faltava no frontend compartilhado.
Agora pode consultar saldos e solicitar transferencias/reposicoes nas unidades autorizadas.
Nao recebe tarefas fisicas, nao inicia separacao ao abrir um detalhe e nao edita quantidades.

## Fluxo

Administrador tambem pode selecionar "Pedido de Compras (com NF)" na origem do formulario
de reposicao ou nova transferencia. A opcao aparece somente no CP Alamo, mantendo o perfil
ADMINISTRADOR e o nome real do criador. O padrao continua sendo "Pedido operacional".
Migration adicional: 20261014020000_admin_purchases_request_mode.sql, schema 2026.10.14.003.

Compras cria -> Estoque separa e confere -> PRONTA_PARA_NOTA -> NF_EM_PREPARACAO
-> NF_ANEXADA -> LIBERADA_PARA_ENVIO -> DESPACHADA -> RECEBIDA -> FINALIZADA.
Na reposicao, o Estoque informa caixas e confirma a quantidade atendida no painel fiscal.
A conclusao definitiva continua usando o credito de estoque existente, somente ao final do fluxo.

Origem e unidade sao imutaveis. Itens, destino e caixas ficam bloqueados depois da conferencia.
Compras pode devolver para correcao com motivo antes da liberacao; gestores podem reabrir
depois dela. O snapshot e a referencia fiscal atual sao invalidados, mantendo o evento anterior
no historico. Divergencias impeditivas exigem resolucao justificada pelo Estoque antes da liberacao.
As tarefas vinculadas nao sao encerradas antecipadamente pelo marco PRONTA_PARA_NOTA.

## PDF e seguranca

Bucket privado wms-transfer-invoices; PDF ate 10 MB. Validacao de extensao, MIME,
assinatura PDF no cliente e metadados do objeto no banco. Caminho vincula unidade,
tabela e processo. URL assinada por cinco minutos, gerada somente ao abrir o documento.
Numero da NF obrigatorio; numero/chave permanecem texto. Nenhum binario em tabela.
Falha no upload ou na vinculacao nao libera o processo. Objetos orfaos gerados por
falha de vinculacao tem tentativa de limpeza; falhas de limpeza entram no diagnostico.
PDFs anteriores nao sao excluidos automaticamente, preservando a auditoria.

Funcoes novas usam security invoker e search_path vazio. RLS limita unidades e perfis.
Transicoes travam a linha, conferem a etapa esperada e aceitam chave idempotente.
Somente o Estoque altera dados fisicos; Compras altera exclusivamente campos fiscais.
Historico usa actor do perfil autenticado. Handoffs usam notificacoes por perfil/unidade
na tabela existente, sem canal separado de historico.

## Performance e interface

Tela Compras / NF carregada sob demanda, filas paginadas, historia limitada a 30 eventos.
PDF nunca entra no carregamento inicial. Reutiliza refresh operacional e fallback de
30 segundos somente para a tela aberta e com documento visivel. Dashboard consulta agregados,
sem carregar itens ou historicos completos para calcular contagens.

## Aplicacao

1. Aplicar 20261014003034_purchases_invoice_workflow.sql no Supabase do CP Alamo.
2. Aplicar 20261014003039_reverse_logistics_monthly_targets.sql.
3. Publicar o frontend exclusivamente no projeto do CP Alamo.
4. Cadastrar Compras com as unidades permitidas e validar o ciclo com um pedido real.

Nao exige mudanca de login nem novo deploy de Edge Function para o workflow fiscal.
Para novas instalacoes, supabase-schema.sql e o roteiro psql das migrations versionadas;
os cadastros de unidades e identidades Auth devem ser provisionados separadamente.

## Validacao

Testes PGlite cobrem fluxo legado, origem Compras, bloqueios de quantidade/caixas,
PDF obrigatorio, unidade nao autorizada, idempotencia e ciclo de recebimento/conclusao.
O roteiro real inclui: criar como Compras, executar como operador, conferir snapshot,
anexar PDF, liberar, despachar e concluir; repetir com divergencia e devolucao.
Testes de banco nao substituem validacao do upload real no Storage e da sessao de cada colaborador.

Migrations aplicadas no projeto CP ztxdqvxvkfgfqowaiaep, schema 2026.10.14.002.
Validacao real com perfis Compras/Operador em transacoes com ROLLBACK confirmou criacao,
handoff, bloqueio de quantidades e snapshots sem persistir fixtures. Os 74 pedidos existentes
continuaram LEGADO/sem NF. Nenhuma migration foi aplicada no banco do WMS Enderecamento.
Suite: 101 testes aprovados; build/lint aprovados. Playwright confirmou tabelas e controles
Compras em 1366 e 390 pixels, com Trusted Types ativo e sem overflow horizontal da pagina.
O upload real de um PDF de negocio ainda deve ser validado pelo responsavel fiscal.

## Compras por Destino e Multiplos SKUs

A criacao de transferencias de Compras agora pode ser feita por Necessidade das Lojas,
com carrinho, comparacao CAPTACAO, revalidacao e uma RPC atomica. Continua usando
as mesmas tabelas e entra no fluxo fiscal acima com origem COMPRAS/NF obrigatoria.
No Estoque, utiliza o cartao operacional existente, identificado como COMPRAS.
Pedidos de reposicao permanecem independentes e nao foram removidos.
Detalhes e limites em `RELATORIO_TRANSFERENCIA_COMPRAS_MULTI_SKU.md`.
