# SLA e OTD CP Alamo

## Prazo de entrega

Prazo inicial aprovado pelo usuario: 24 horas apos liberacao da NF.
`wms_transfer_sla` configura horas e percentual de atencao por unidade. Somente
administrador/supervisor autorizado modifica configuracao. Na atribuicao, a
transferencia recebe um deadline persistido; alteracoes de configuracao afetam
proximas atribuicoes, nunca recalculam prazos registrados.

Atencao padrao: 80% do intervalo. No prazo inclui exatamente o deadline;
atrasado exige instante posterior. Indicacao informativa, sem alterar etapas,
saldo ou concluir processo automaticamente. Entregas sao comparadas pelo
timestamp registrado, nao pela data atual. Ausencia de datas resulta Sem prazo.
Entrega divergente permanece em contagem de tempo ate ser resolvida. A resolucao
tem timestamp proprio, preserva a primeira entrega e determina o cumprimento
do prazo; resolver depois do deadline nao transforma entrega parcial em OTD.

## OTD

Numerador: entregas confirmadas sem pendencia de divergencia, registradas ate o
deadline. Denominador: entregas registradas com deadline conhecido, na coorte de
transferencias criadas no periodo. O painel informa tamanho da amostra e
quantidade sem prazo. Sem denominador, percentual e null, nao 100% ou divisao
por zero. Historico sem prazo nao ganha um prazo retroativo.

Duracoes de separacao, NF, expedicao, entrega e lead time usam timestamps reais.
Datas ausentes ou invertidas nao entram nas respectivas medias.

## Pendente

Configurar deadlines independentes de Compras, Estoque e expedicao, snapshots
das metas de cada fase, e respectivos percentuais de cumprimento. Os SLAs
informativos preexistentes de Compras continuam com seu comportamento atual.
