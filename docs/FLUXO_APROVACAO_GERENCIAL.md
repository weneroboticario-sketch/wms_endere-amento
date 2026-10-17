# Aprovacao gerencial

O fluxo utiliza o mesmo registro `wms_losses`, seus itens, documentos, rateios e eventos.

1. Operacional cria rascunho, informa competencia, tipo, documento fiscal, motivo e rateio.
2. Envio muda para PENDENTE.
3. Gerente autorizado aprova perda de outro solicitante, solicita correcao ou rejeita com justificativa (cancelamento auditado, sem exclusao).
4. A aprovacao congela DRE, tipo, aliquota, valores calculados e rateio.
5. Financeiro diferente do criador e do aprovador valida os dados e documentos. A validacao e um evento separado, com usuario, data e justificativa.
6. Registros validados participam do fechamento e exportacao. Reabertura ou correcao invalida a conferencia anterior.

Nao existe excecao silenciosa de autoaprovacao para administrador. Criador nao aprova nem valida sua propria perda. Nenhuma alteracao do perfil confere autorizacao fora de `allowed_warehouse_codes`.

A fila da Central Gerencial prioriza perdas pendentes, divergencias abertas, prazos vencidos, correcoes, expedicoes criticas e reversas divergentes. Os registros abrem a perda original ou um drawer de consulta do processo original; nao sao criadas copias gerenciais.

Indicadores de atraso usam `delivery_deadline` real. Sem prazo cadastrado o sistema nao inventa SLA. A fila mostra ate 100 entradas prioritarias e informa o total; consultas possuem paginacao de 50.

A reabertura de perdas depende de `manager.operational_exception.handle`, motivo e competencia aberta. Reatribuicao fisica e reabertura de transferencias permanecem nos comandos operacionais existentes, sem liberacao generica para GERENTE.
