# Matriz de permissoes - CP Alamo

| Acao | Gerente | Financeiro | Administrador |
|---|---|---|---|
| Central Gerencial | Unidades autorizadas | Nao | Sim |
| Painel financeiro / Perdas-DRE | Consulta gerencial | Sim | Sim |
| Transferencias, NF e reversa | Consulta | Consulta | Fluxo completo |
| Reposicao, expedicao, entregas, SKU/base, usuarios/estoques | Consulta | Nao | Fluxo completo |
| Criar perda | Nao por padrao | Nao | Sim |
| Aprovar perda de terceiro | Sim | Nao | Sim |
| Aprovar a propria perda | Nao | Nao | Nao |
| Conferencia financeira | Nao | Sim, outro criador/aprovador | Sim, outro criador/aprovador |
| Solicitar correcao | Gerencial | Financeira | Sim |
| Rejeitar perda pendente | Com justificativa | Nao | Sim |
| Exportar DRE | Nao | Sim | Sim |
| Fechar/reabrir competencia | Nao | Capability adicional e escopo global | Sim |
| Reabrir perda | Capability adicional | Nao | Sim |
| Configurar aliquota / tipo-DRE | Nao | Capability adicional especifica | Sim |
| Alterar estoque, separar, caixas, despachar, liberar NF operacional | Nao | Nao | Fluxo existente |
| Alterar usuarios, roles, permissoes, configuracao tecnica | Nao | Nao | Sim |

Perfis antigos preservam seus comandos existentes; a nova segregacao de aprovacao/conferencia passa a proteger todas as novas exportacoes financeiras. Nenhum usuario recebe role nova automaticamente.

Catalogo: `manager.dashboard.read`, `manager.approvals.read`, `manager.loss.approve`, `manager.loss.request_correction`, `manager.operational_exception.handle`, `finance.dashboard.read`, `finance.loss.read`, `finance.loss.validate`, `finance.loss.request_correction`, `finance.dre.read`, `finance.export`, `finance.close_competence`, `finance.reopen_competence`, `finance.configure_rates`, `finance.configure_types`, `transfer.read`, `replenishment.read`, `invoice.read`, `dispatch.read`, `reverse.read`, `report.read`, `report.export`.

Grants ficam em schema privado; bloqueio explicito prevalece sobre permissao padrao. Adicionais nunca ampliam unidades. Nenhuma decisao usa `user_metadata`; frontend nao recebe `service_role`.

Auditoria financeira existente registra antes/depois, entidade, usuario, motivo e data. Auditoria complementar privada registra role, escopo, configuracoes, grants e exportacoes de consulta. Nao existem grants diretos de escrita em tabelas de perdas para o cliente.
