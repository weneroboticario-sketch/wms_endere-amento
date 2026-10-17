# Perdas e DRE - fluxo

1. Abrir Gestao > Perdas e DRE > Nova Perda.
2. Preencher a NF manualmente ou importar XML opcional. Informar competencia, tipo, loja, motivo e eventuais itens ou rateios.
3. Salvar rascunho ou revisar e enviar para analise.
4. Administrador ou supervisor aprova, solicita correcao ou cancela com justificativa.
5. Administrador, COMPRAS ou supervisor gera a previa, exporta as aprovadas e fecha a competencia.

## Permissoes

| Acao | Administrador | Supervisor | COMPRAS | Operador |
| --- | --- | --- | --- | --- |
| Consultar unidades autorizadas | Sim | Sim | Sim | Sim |
| Criar e enviar perda | Sim | Sim | Sim | Sim |
| Editar proprio rascunho/correcao | Sim | Sim | Sim | Sim |
| Editar rascunho de outro autor | Sim | Sim | Nao | Nao |
| Aprovar, pedir correcao, reabrir perda | Sim | Sim | Nao | Nao |
| Exportar e fechar/reabrir competencia | Sim | Sim | Sim | Nao |
| Configurar tipos, centros e aliquotas | Sim | Nao | Nao | Nao |

Fechamento de competencia e global: exige acesso a todas as unidades ativas para evitar fechamento sem conferir registros de outra loja. Usuarios mantem os limites de unidades do cadastro.

Estados: RASCUNHO > PENDENTE > APROVADA > EXPORTADA. Gestores podem devolver PENDENTE para CORRECAO_SOLICITADA. Reabrir aprovada/exportada/cancelada exige justificativa. Cancelamento de exportada exige primeiro reabertura formal; competencias fechadas exigem reabertura da competencia. O autor pode cancelar o proprio rascunho/correcao com motivo.

A chave NF-e duplicada em perda ativa impede envio/aprovacao. Coincidencia de numero, loja, valor e competencia exige justificativa. Eventos preservam autor, momento, motivo e dados da operacao. A versao do registro deve corresponder a versao lida pela tela.
