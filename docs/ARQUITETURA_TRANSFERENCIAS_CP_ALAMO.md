# Arquitetura das transferencias CP Alamo

## Escopo desta entrega

Extensao incremental do fluxo existente de Compras: necessidade multi-SKU,
transferencia atomica, separacao, conferencia, caixas e NF continuam nos modulos
originais. A expedicao usa a mesma linha em `wms_transfers`, seus itens e
`wms_transfer_events`. Nao existe uma segunda tabela de pedidos ou de historico.

O responsavel pela separacao continua opcional na criacao. A atribuicao de
expedicao e separada e ocorre depois da liberacao fiscal.

## Estados

Fiscal: PRONTA_PARA_NOTA -> NF_EM_PREPARACAO -> NF_ANEXADA ->
LIBERADA_PARA_ENVIO -> DESPACHADA -> RECEBIDA -> FINALIZADA.

Expedicao: aguardando -> ATRIBUIDA -> COLETADA -> EM_TRANSITO -> ENTREGUE.
A entrega pode ocorrer diretamente da coleta. Diferencas ou ressalvas levam a
ENTREGA_COM_DIVERGENCIA, sem conclusao automatica. Gestor resolve com motivo,
preservando as contagens originais. Reabertura fiscal justificada reinicia o
estado atual de expedicao sem apagar os eventos anteriores.

`wms_expedition_action` bloqueia a linha, verifica revisao e unidade, grava a
etapa e reutiliza `wms_invoice_action`. Falha fiscal reverte toda a transacao.
Os triggers tambem bloqueiam tentativas de pular coleta ou contagem por updates
diretos ou botoes fiscais antigos. Reposicao e transferencias sem NF obrigatoria
mantem o comportamento anterior.

## Autorizacao e integridade

- Todas as funcoes novas sao SECURITY INVOKER e usam search_path vazio.
- RLS existente e unidades autorizadas permanecem como fronteira de acesso.
- Compras consulta expedicao; nao coleta, despacha ou confirma entrega.
- Operador pode assumir para si e executar apenas a expedicao atribuida a ele.
- Administrador e supervisor atribuem, reatribuem e resolvem divergencias.
- Responsavel precisa estar ativo, nao arquivado, disponivel e na origem.
- PDF permanece no bucket privado, com URL assinada de 300 segundos.
- Nenhuma funcao nova reserva, movimenta ou modifica saldo de estoque.
- A mesma chave de acao retorna o estado salvo sem duplicar evento ou aviso.

## Implantacao

Somente CP Alamo: branch de base `feature/cpalamo-compras-nf-reversa`, projeto
Vercel `wms-dourados`, banco `ztxdqvxvkfgfqowaiaep`.
As migracoes sao aditivas e nao devem ser aplicadas ao WMS Enderecamento.

Ordem: testes locais -> build -> verificacao visual -> migracoes CP Alamo ->
teste transacional com rollback no banco real -> publicar commit validado ->
verificar configuracao e alias. Nao promover main para o projeto CP Alamo.

## Evolucoes ainda nao abrangidas

O pedido completo contem outras etapas. Esta entrega nao cria um perfil novo
EXPEDICAO nem uma matriz administrativa de permissoes individuais; preserva os
perfis existentes e restringe a execucao por atribuicao. Retorno a origem,
comprovante de entrega, SLA configuravel de todas as fases e taxas de cumprimento
por fase ainda exigem uma entrega posterior. Nao apresentar esta etapa como a
conclusao integral de todos os itens do projeto.
