# Matriz de implementação da fundação

Base auditada: 2f3fedd. Projeto: weneroboticario-sketch/wms_endere-amento; produção Supabase bzqulgdtfpcmkyaldssy. Nenhuma instalação autorizada em produção. Homologação paga recusada; usar Postgres local.

| Requisito | Existe | Parcial | Falta |
|---|---|---|---|
| Autenticação WMS e escopo por unidade | Sim | | |
| Domínio conservador de evidências | | Sim | Adaptadores e persistência |
| Critérios e calibração | | Funções JS testadas | Versão persistida e ciclos |
| Banco do programa, RLS, auditoria | | | Sim |
| Reposição, tarefas, transferências, endereçamento | Fontes operacionais | Autoria varia por fonte | Integração com programa |
| Cálculo, confiança e avaliação manual | | Cobertura isolada | Integração |
| Telas e prévia | | | Sim |

Reutilizar regras de domínio anteriores; frontend não define pesos definitivos. Mensagens privadas e wms_stock_positions não fazem parte das fontes. Atribuição e usuário que encerrou não provam execução; fonte sem identidade confiável fica indisponível. Eventos de divergência são neutros até investigação. Migração proposta não modifica tabelas operacionais.
