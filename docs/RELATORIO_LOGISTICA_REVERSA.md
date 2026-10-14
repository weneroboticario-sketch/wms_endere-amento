# Logistica Reversa - CP Alamo

## Escopo e estruturas

Novo modulo dentro do WMS existente, sem login ou banco adicional.
wms_reverse_logistics registra unidade, GDV, NFe, caixas, destino, observacao,
responsavel autenticado, competencia, etapas e auditoria.
wms_reverse_logistics_monthly_targets guarda uma meta por unidade/mes.
Estas tabelas representam um dominio novo, nao duplicam saldos ou transferencias.
Historico reutiliza wms_history. Nenhum upload e necessario.

## Regras

Unidade obrigatoria e autorizada; caixas inteiras e positivas. GDV e NFe sao texto,
preservando zeros iniciais. GDV ativo e unico globalmente: a mesma referencia nao pode
ficar ativa em duas unidades. Cancelamento/arquivamento permitem nova referencia ativa.
Competencia calculada pelo banco no mes do cadastro, fuso America/Cuiaba.

REGISTRADA -> AGUARDANDO_ENVIO -> ENVIADA -> RECEBIDA -> CONCLUIDA.
DIVERGENCIA e CANCELADA exigem motivo. Gestores reabrem estados finais com motivo
e arquivam logicamente; nao existe exclusao fisica pelo frontend.
Unidade, competencia e criador nao podem ser trocados.

Caixas alimentam realizado no primeiro envio; repeticao nao soma novamente.
Cancelados e arquivados nao entram no realizado. Reabertura de processo final retira
a contagem ate novo envio. Meta zero significa "Meta nao definida", nao divisao por zero.
Realizado, percentual, restante, excedente, pendencias e divergencias sao consultados por mes.

## Perfis e isolamento

Administrador/supervisor operam unidades autorizadas. Operador atua nas unidades permitidas
e pode definir somente a meta da sua unidade cadastral. Compras consulta, sem cadastrar,
alterar metas ou modificar estados. Atendente nao acessa este modulo.
RLS protege tanto processos quanto metas. Funcoes usam invoker/search_path vazio.
Acoes verificam status esperado, travam linha e usam client_action_id.

## Performance

Listas de 30 registros por pagina; filtro por mes, unidade, status, GDV/NFe/responsavel.
Indices de unidade/mes, GDV ativo, NFe e atualizacao. SQL calcula agregados no banco.
Historico de 30 eventos somente no detalhe. Modulo importado sob demanda; refresh da
tela aberta a cada 30 segundos, sem assinatura pesada de eventos/historico.
Dashboard mostra meta e realizado por unidade a partir do mesmo agregado.

## Aplicacao e validacao

Aplicar migrations fiscais e depois 20261014003039_reverse_logistics_monthly_targets.sql
antes do deploy do CP Alamo. Nao aplicar no WMS Enderecamento.
Testes locais cobrem GDV/NFe com zeros, duplicidade ativa, caixas zero, idempotencia de envio,
cancelamento sem inflar meta e negacao de escrita para Compras.
Roteiro: definir metas diferentes em duas unidades, enviar processos, cancelar um,
conferir consolidado e testar leitura restrita com usuario de uma unica unidade.

Validacao no CP real, em transacao com ROLLBACK: cadastro como operador, envio repetido
com a mesma chave, incremento de exatamente 12 caixas e retirada desse incremento no
cancelamento. Nenhum processo de teste permaneceu no banco.
