# Dashboard operacional CP Alamo

`wms_transfer_executive_summary` agrega no servidor transferencias criadas no
periodo escolhido. Todas as metricas, volumes diarios, distribuicoes e rankings
usam a mesma coorte e os mesmos filtros: unidade autorizada, origem, destino,
operacao e etapa atual. Periodo usa America/Cuiaba, inicio inclusivo e final
exclusivo no dia seguinte. Limite de intervalo: 367 dias inclusivos.

Exibe criadas, abertas, concluidas, fila de NF, fila de expedicao, transito,
entregas, divergencias, atrasos, caixas enviadas/recebidas e OTD. Mostra duracoes
medias a partir de pares de timestamps reais, volume diario e top cinco origens
e destinos. Valores ausentes permanecem indisponiveis.

Painel integrado ao dashboard atual e a Gestao de Expedicao. A atualizacao
operacional preserva filtros escolhidos; trocas de usuario/unidade e respostas
fora de ordem sao verificadas antes de aplicar dados.

Nenhuma lista completa de itens ou posicoes de estoque e carregada para calcular
os indicadores. Totais de SKU/unidades usam os campos consolidados existentes.
Indices parciais cobrem unidade/data e a fila fiscal de expedicao.

Nao mostra valor fiscal em reais porque nao ha uma fonte fiscal confiavel e
normalizada de valores nessa entrega. Nao mistura logistica reversa com volumes
de transferencias. Reversa e necessidade de loja continuam nos indicadores
existentes do dashboard.

Ainda pendentes do projeto completo: graficos executivos adicionais, painel
diario independente da coorte de criacao e taxas de SLA por cada fase.
