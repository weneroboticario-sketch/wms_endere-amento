# Transferencia -> Compras/NF: CP Alamo

## Escopo e regra vigente

Aplicacao: wms-cpalamo.vercel.app. Banco: ztxdqvxvkfgfqowaiaep.
Nenhuma migration ou publicacao aplicada no WMS endere-amento.

Em 14/10/2026 o administrador determinou que divergencias podem seguir para
NF, preservando o conferido real. Esta instrucao substitui a preferencia de
bloqueio do documento inicial. Divergencias nao sao resolvidas automaticamente.
Quantidades zero ficam no historico, mas nao compoem unidades/SKUs enviados.

## Diagnostico e reparo

TRF-20261014-165013-23696-14177 estava pronta com divergencia, mas com
requires_invoice=false e invoice_stage vazio. O filtro "minha acao" tambem
tratava administradores como Estoque e ocultava etapas de Compras.

O encaminhamento explicito e auditado preservou o mesmo transfer_id, codigo,
origem ESTOQUE, caixas e itens: 86707 = 10; 95532 = 6; 86706 = 0. Total: 16
unidades, 2 caixas. Nao foi criada outra transferencia ou ordem fiscal.
O encaminhamento foi ensaiado com ROLLBACK antes da gravacao definitiva.

## Banco

Migration: 20261014235901_transfer_fiscal_handoff.sql.
- invoice_value numeric(14,2) em transferencias e reposicoes. Reposicao continua
  suportada pela mesma RPC e formulario fiscal, justificando o campo comum.
- wms_invoice_action grava valor e invalida referencias ativas em correcao.
- wms_invoice_guard exige numero textual, valor positivo, PDF privado existente
  de ate 10 MB e chave opcional de 44 digitos; tamanho vem do Storage.
- packing_finished_at marca a conclusao do estoque; finished_at e aliases de
  conclusao geral permanecem vazios enquanto a fase fiscal nao termina.
- Snapshot imutavel usa conferencia real; excesso sobre o solicitado e falta
  sao registrados sem substituir a quantidade conferida pela solicitada.
- Codigo, destino, caixas e itens ficam protegidos depois do handoff.
- Nova RPC wms_transfer_enable_invoice: gestor, estoque pronto, unidade
  autorizada, motivo, expected status, row lock e action id; nunca reclassifica
  a origem como COMPRAS nem ativa todos os registros antigos.
- Policy fiscal de Compras abrange processos encaminhados pelo Estoque, ainda
  sob escopo de unidade e guardas de campos fisicos.
- Cancelados/arquivados nao entram na fila/KPIs nem aceitam acoes fiscais.
- Auditoria inclui codigo, snapshot, valor, arquivo e referencia anterior.
- PDF anterior permanece armazenado/auditado; falha de upload limpa orfao.
- Registros requires_invoice=false mantem comportamento operacional anterior.
- Nenhum backfill amplo: auditoria nao encontrou outros registros com
  requires_invoice=true, status pronto e invoice_stage vazio.

## Interface

Fila compacta com codigo, destino/unidade, conferido, caixas, NF, valor, etapa,
responsabilidade e tempo. Busca por codigo/NF/destino; filtros fiscais,
historico operacional sem NF para encaminhamento de gestores e indicadores
de pendencias, preparacao, anexos/valor do dia e liberacoes.
Detalhe mostra numero, valor, PDF, autor, tamanho, datas e marcos do processo.
Administradores/supervisores veem etapas fiscais e fisicas em "minha acao".
Botao fiscal do estoque: Disponibilizar para NF; confirmacao usa conferido.
Realtime existente continua atualizando a fila, com polling de contingencia.
Expedicao existente permanece responsavel por despacho/recebimento/conclusao.

## Verificacao

- npm run lint: aprovado.
- npm test: 169 testes aprovados.
- npm run build: aprovado; aviso preexistente de bundle acima de 500 kB.
- git diff --check: aprovado.
- Playwright: tabelas alinhadas em 1366/390 px, sem overflow da pagina; PDF
  e valor no formulario; Compras sem comandos fisicos de despacho.
- PGlite: identidade, zeros iniciais, excesso/falta, divergencias abertas,
  valor/numero/PDF/chave, tamanho real, concorrencia, retry sem duplicacao,
  congelamento de codigo/itens, correcao sem apagar PDF, cancelados e legado.
- Banco real: encaminhamento via authenticated com RLS e perfil administrador;
  snapshot validado antes e depois, sem alteracao dos itens.

Os testes de expedicao existentes cobrem recebimento com divergencia e
conclusao integral. Nenhuma coleta, recebimento ou NF ficticia foi gravada
na transferencia real do usuario.
