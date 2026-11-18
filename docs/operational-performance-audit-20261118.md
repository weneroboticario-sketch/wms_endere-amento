# Desempenho Operacional — auditoria inicial

Data: 18/11/2026. Branch: feat/wms-operational-performance-20261118.
Base: 036c0d2, versão publicada do WMS principal.

## Evidência consultada

Leitura das migrations locais e consulta somente de metadados information_schema no Supabase bzqulgdtfpcmkyaldssy. Nenhuma gravação no banco. Este documento é uma auditoria inicial, não certificação completa nem implementação.

## Fontes reaproveitáveis

| Processo | Fonte | Identidade e limites |
| --- | --- | --- |
| Tarefas | operacao_tarefas, operacao_tarefas_historico | criado_por, delegado_por, atribuido_para e usuario_id são papéis distintos. Conclusão não comprova execução exclusiva. Há prazo_sla, início, conclusão e motivo_bloqueio. |
| Endereçamento | wms_bindings, wms_history | Nomes em usuario/user_name e payload. Não converter nome em autoria autenticada por aproximação. Estado atual do vínculo não equivale a evento de execução. |
| Recebimentos | wms_inbound_receipts, wms_inbound_receipt_items | created_by, assigned_to, counted_by, finished_by e validated_by distintos. Quantidade prevista não mede produtividade realizada. |
| Transferências | wms_transfer_events | Eventos auditados devem ser diferenciados de legado; unidade e conversão de caixa precisam ser preservadas. |
| Caixa | wms_caixa_requests | requested_by, claimed_by e confirmação do caixa são etapas diferentes; solicitação vinculada à reposição não pode contar duas entregas. |
| Comunicação | wms_chat_requests, vínculos e evidências privados | Reutilizar referências autorizadas; conversas privadas não são evidências gerenciais automaticamente. |

## Lacunas a verificar antes de implementação

1. Completar inventário de RLS, grants, funções, índices e trilhas de reposição; verificar qualidade com amostras agregadas sem expor mensagens privadas.
2. Definir liderança/gerência por autorização explícita e estoque, sem presumir que todos os supervisores podem ler feedbacks de toda a equipe.
3. Jornada, ausências, contribuições compartilhadas, complexidade anterior à execução e escala por setor não foram comprovadas no schema consultado.
4. Rotinas, iniciativas, auditorias de qualidade, PDI, avaliações e reconhecimentos precisam de estruturas próprias e trilha de alteração; ainda não criadas.
5. Exclusões permanentes autorizadas de transferências removem suas evidências de origem. Indicadores devem informar cobertura e limites históricos, sem reconstruir fatos apagados.

## Contrato de implementação

- Carregamento sob demanda, módulo desativável e acesso aplicado no servidor/RLS.
- Referência única por estoque, processo e identificador original. Nenhuma cópia de operação para aumentar contagens.
- Ausência de autoria ou contexto: Dados insuficientes. Nenhuma nota zero presumida.
- Não inferir comportamento, causalidade de erro ou mérito pelo volume de registros.
- Novas atividades distinguem solicitante, executor, colaboradores e validador; autovalidação proibida.
- Avaliação experimental, pesos configuráveis, fechamento revisado e reconhecimento aprovado manualmente.
- Evidência privada com autorização por atividade e retenção configurável.
- Testes de autorização, isolamento, duplicidade, contribuição compartilhada, impedimentos e regressão antes de disponibilizar.

## Estado real

P0 iniciada. Branch isolada criada. P0 completa e P1–P4 pendentes. Nenhuma interface, migration ou funcionalidade nova está disponível. Produção intacta nesta tarefa.

## Avanço de 18/11 — regras de domínio e permissões consultadas

Implementado src/operational-performance-domain.js com referências de origem únicas, normalização conservadora de tarefas, resumo por estoque/pessoa/período e proibição de autovalidação por qualquer executor participante. Nenhuma pontuação é calculada. O resumo mede apenas tarefas atribuídas com atividade datada no período; não é total de tarefas pendentes nem prova de execução física.

Testes: quatro cenários aprovados usando node --test --test-isolation=none (o isolamento padrão foi bloqueado por spawn EPERM no ambiente). ESLint dos dois novos arquivos aprovado. Não foi executado build ou regressão completa nesta etapa; ainda não existe integração com a interface.

Consulta de pg_policies em produção, somente leitura, confirmou:
- Tarefas: operadores leem as próprias atribuições; administradores/supervisores têm escopo por estoque.
- Recebimentos: acesso mediado por private.can_read_wms_inbound; verificar a função e histórico de contagem antes de implementar adaptador.
- Endereçamento e reposição: políticas operacionais por estoque são mais amplas que o acesso individual necessário para desempenho. Não reutilizar leituras genéricas desses módulos para expor avaliações individuais.
- A política wms_caixa_operational_isolation exige examinar também o atributo permissive/restrictive antes de concluir a combinação efetiva das políticas. Nenhuma política foi alterada.

Próximo trabalho: completar auditoria de funções de autorização e índices; criar camada de acesso do novo módulo com permissão explícita de liderança, RLS individual, desligamento independente e metadados de execução compartilhada. Persistência, rotinas, painel, feedbacks, evidências, avaliações e relatórios continuam pendentes. A validação de autovalidação em JS é regra de domínio testada, não substitui controle transacional no banco.
