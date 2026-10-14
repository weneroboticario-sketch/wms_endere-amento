# Expedicao CP Alamo

## Implementado

Fila paginada em 30 transferencias com campos explicitos: NF, origem, destino,
caixas, responsavel, etapa e prazo. Detalhe carrega somente a transferencia
selecionada; historico carrega 30 eventos por pagina. O menu existe somente no
CP Alamo. Realtime e polling operacional existentes atualizam o modulo.

Acoes: atribuir/assumir, reatribuir com motivo, confirmar coleta, registrar
transito, entrega e resolucao gerencial. Durante a gravacao, os controles ficam
indisponiveis. A chave de retry permanece para o mesmo formulario e conteudo.

Coleta exige a quantidade integral de caixas conferidas. Recebimento admite
zero e exige motivo quando diferente do enviado. Seis enviadas e cinco recebidas
geram diferenca -1 e entrega divergente. O processo fiscal fica RECEBIDA, nao
FINALIZADA. A resolucao justificada conserva 6/5 no historico e na contagem.

Aviso individual somente na atribuicao ou troca real de responsavel. Eventos
operacionais e fiscais permanecem no historico unico da transferencia.

## Verificacao

Testes PGlite cobrem NF privada, bloqueio de bypass fiscal, escopo, pessoa de
outra unidade, indisponibilidade, revisao obsoleta, retry, entrega integral,
divergencia 6/5, resolucao, reabertura e preservacao do legado.

`scripts/verify-expedition.mjs` testa a interface com cliente simulado em
1440px e 390px. Recebe caminho opcional do modulo Playwright e do executavel
Chromium como argumentos. A validacao visual e separada dos testes reais de SQL;
o cliente simulado nao comprova permissoes do banco.

## Limites

Transferencias historicas despachadas antes do novo controle nao recebem caixas,
responsaveis ou datas inventados. Seu registro fiscal continua consultavel.
Este modulo se aplica inicialmente a novas transferencias com NF obrigatoria.
Retorno a origem e comprovante de recebimento nao fazem parte desta etapa.
